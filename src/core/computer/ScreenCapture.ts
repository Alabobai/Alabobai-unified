/**
 * Alabobai Computer Control - Screen Capture Module
 * Production-ready screenshot capture for AI vision analysis
 *
 * Features:
 * - Cross-platform support (macOS, Windows, Linux)
 * - High-resolution capture
 * - Region-specific capture
 * - Continuous capture for live streaming
 * - Image optimization for AI processing
 * - Screen recording capabilities
 */

import { EventEmitter } from 'events';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface ScreenCaptureResult {
  id: string;
  timestamp: Date;
  width: number;
  height: number;
  imageData: string; // base64
  format: 'png' | 'jpeg';
  region?: CaptureRegion;
  displayId?: number;
  metadata: ScreenMetadata;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenMetadata {
  platform: NodeJS.Platform;
  displayCount: number;
  primaryDisplay: DisplayInfo;
  allDisplays: DisplayInfo[];
  captureMethod: string;
  processingTimeMs: number;
}

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface ScreenCaptureConfig {
  format?: 'png' | 'jpeg';
  quality?: number; // 1-100 for JPEG
  maxWidth?: number; // Resize for AI processing
  maxHeight?: number;
  includeMetadata?: boolean;
  tempDir?: string;
}

export interface ContinuousCaptureConfig extends ScreenCaptureConfig {
  intervalMs: number;
  maxBufferSize?: number;
  onCapture?: (capture: ScreenCaptureResult) => void;
}

export type ScreenCaptureEvents = {
  'capture': (capture: ScreenCaptureResult) => void;
  'error': (error: Error) => void;
  'continuous-started': () => void;
  'continuous-stopped': () => void;
  'recording-started': (outputPath: string) => void;
  'recording-stopped': (outputPath: string) => void;
};

// ============================================================================
// SCREEN CAPTURE CLASS
// ============================================================================

export class ScreenCapture extends EventEmitter {
  private config: Required<ScreenCaptureConfig>;
  private platform: NodeJS.Platform;
  private continuousInterval: NodeJS.Timeout | null = null;
  private captureBuffer: ScreenCaptureResult[] = [];
  private recordingProcess: ChildProcess | null = null;
  private isRecording: boolean = false;

  constructor(config: ScreenCaptureConfig = {}) {
    super();
    this.platform = process.platform;
    this.config = {
      format: config.format ?? 'png',
      quality: config.quality ?? 85,
      maxWidth: config.maxWidth ?? 1920,
      maxHeight: config.maxHeight ?? 1080,
      includeMetadata: config.includeMetadata ?? true,
      tempDir: config.tempDir ?? os.tmpdir(),
    };
  }

  // ============================================================================
  // SINGLE CAPTURE
  // ============================================================================

  /**
   * Capture the entire screen
   */
  async capture(displayId?: number): Promise<ScreenCaptureResult> {
    const startTime = Date.now();
    const captureId = uuid();
    const tmpPath = path.join(this.config.tempDir, `alabobai-capture-${captureId}.png`);

    try {
      await this.captureToFile(tmpPath, displayId);
      const imageBuffer = fs.readFileSync(tmpPath);
      const dimensions = await this.getImageDimensions(tmpPath);

      // Optionally resize for AI processing
      let processedBuffer = imageBuffer;
      let finalWidth = dimensions.width;
      let finalHeight = dimensions.height;

      if (this.shouldResize(dimensions.width, dimensions.height)) {
        const resized = await this.resizeImage(tmpPath, this.config.maxWidth, this.config.maxHeight);
        processedBuffer = resized.buffer as any;
        finalWidth = resized.width;
        finalHeight = resized.height;
      }

      // Convert to desired format
      let imageData: string;
      if (this.config.format === 'jpeg') {
        const jpegBuffer = await this.convertToJpeg(processedBuffer, this.config.quality);
        imageData = jpegBuffer.toString('base64');
      } else {
        imageData = processedBuffer.toString('base64');
      }

      const metadata = this.config.includeMetadata
        ? await this.gatherMetadata(Date.now() - startTime)
        : this.getMinimalMetadata(Date.now() - startTime);

      const result: ScreenCaptureResult = {
        id: captureId,
        timestamp: new Date(),
        width: finalWidth,
        height: finalHeight,
        imageData,
        format: this.config.format,
        displayId,
        metadata,
      };

      this.emit('capture', result);
      return result;
    } finally {
      // Cleanup temp file
      this.safeUnlink(tmpPath);
    }
  }

  /**
   * Capture a specific region of the screen
   */
  async captureRegion(region: CaptureRegion, displayId?: number): Promise<ScreenCaptureResult> {
    const startTime = Date.now();
    const captureId = uuid();
    const tmpPath = path.join(this.config.tempDir, `alabobai-capture-${captureId}.png`);
    const croppedPath = path.join(this.config.tempDir, `alabobai-cropped-${captureId}.png`);

    try {
      await this.captureToFile(tmpPath, displayId);
      await this.cropImage(tmpPath, croppedPath, region);

      const imageBuffer = fs.readFileSync(croppedPath);
      let imageData: string;

      if (this.config.format === 'jpeg') {
        const jpegBuffer = await this.convertToJpeg(imageBuffer, this.config.quality);
        imageData = jpegBuffer.toString('base64');
      } else {
        imageData = imageBuffer.toString('base64');
      }

      const metadata = this.config.includeMetadata
        ? await this.gatherMetadata(Date.now() - startTime)
        : this.getMinimalMetadata(Date.now() - startTime);

      const result: ScreenCaptureResult = {
        id: captureId,
        timestamp: new Date(),
        width: region.width,
        height: region.height,
        imageData,
        format: this.config.format,
        region,
        displayId,
        metadata,
      };

      this.emit('capture', result);
      return result;
    } finally {
      this.safeUnlink(tmpPath);
      this.safeUnlink(croppedPath);
    }
  }

  // ============================================================================
  // CONTINUOUS CAPTURE
  // ============================================================================

  /**
   * Start continuous screen capture for live streaming
   */
  startContinuousCapture(config: ContinuousCaptureConfig): void {
    if (this.continuousInterval) {
      throw new Error('Continuous capture already running');
    }

    const maxBuffer = config.maxBufferSize ?? 30;

    this.continuousInterval = setInterval(async () => {
      try {
        const capture = await this.capture();

        this.captureBuffer.push(capture);
        if (this.captureBuffer.length > maxBuffer) {
          this.captureBuffer.shift();
        }

        if (config.onCapture) {
          config.onCapture(capture);
        }
      } catch (error) {
        this.emit('error', error as Error);
      }
    }, config.intervalMs);

    this.emit('continuous-started');
  }

  /**
   * Stop continuous capture
   */
  stopContinuousCapture(): ScreenCaptureResult[] {
    if (this.continuousInterval) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }

    const buffer = [...this.captureBuffer];
    this.captureBuffer = [];
    this.emit('continuous-stopped');
    return buffer;
  }

  /**
   * Get latest capture from buffer
   */
  getLatestCapture(): ScreenCaptureResult | null {
    return this.captureBuffer.length > 0
      ? this.captureBuffer[this.captureBuffer.length - 1]
      : null;
  }

  /**
   * Get capture buffer
   */
  getCaptureBuffer(): ScreenCaptureResult[] {
    return [...this.captureBuffer];
  }

  // ============================================================================
  // SCREEN RECORDING
  // ============================================================================

  /**
   * Start screen recording
   */
  async startRecording(outputPath: string, options: {
    fps?: number;
    codec?: string;
    displayId?: number;
  } = {}): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const fps = options.fps ?? 30;
    const codec = options.codec ?? 'libx264';

    if (this.platform === 'darwin') {
      // macOS: Use ffmpeg with avfoundation
      const displayIndex = options.displayId ?? 1;
      this.recordingProcess = spawn('ffmpeg', [
        '-f', 'avfoundation',
        '-framerate', fps.toString(),
        '-i', `${displayIndex}:none`,
        '-c:v', codec,
        '-preset', 'ultrafast',
        '-y',
        outputPath,
      ]);
    } else if (this.platform === 'win32') {
      // Windows: Use ffmpeg with gdigrab
      this.recordingProcess = spawn('ffmpeg', [
        '-f', 'gdigrab',
        '-framerate', fps.toString(),
        '-i', 'desktop',
        '-c:v', codec,
        '-preset', 'ultrafast',
        '-y',
        outputPath,
      ]);
    } else {
      // Linux: Use ffmpeg with x11grab
      this.recordingProcess = spawn('ffmpeg', [
        '-f', 'x11grab',
        '-framerate', fps.toString(),
        '-i', ':0.0',
        '-c:v', codec,
        '-preset', 'ultrafast',
        '-y',
        outputPath,
      ]);
    }

    this.isRecording = true;
    this.emit('recording-started', outputPath);

    this.recordingProcess.on('error', (error) => {
      this.emit('error', error);
      this.isRecording = false;
    });

    this.recordingProcess.on('exit', () => {
      this.isRecording = false;
      this.emit('recording-stopped', outputPath);
    });
  }

  /**
   * Stop screen recording
   */
  async stopRecording(): Promise<void> {
    if (!this.recordingProcess || !this.isRecording) {
      return;
    }

    return new Promise((resolve) => {
      this.recordingProcess!.on('exit', () => {
        this.recordingProcess = null;
        resolve();
      });

      // Send 'q' to ffmpeg to gracefully stop
      this.recordingProcess!.stdin?.write('q');
    });
  }

  // ============================================================================
  // DISPLAY INFO
  // ============================================================================

  /**
   * Get information about all connected displays
   */
  async getDisplays(): Promise<DisplayInfo[]> {
    const displays: DisplayInfo[] = [];

    try {
      if (this.platform === 'darwin') {
        const output = execSync('system_profiler SPDisplaysDataType -json', { encoding: 'utf-8' });
        const data = JSON.parse(output);
        const displaysData = data.SPDisplaysDataType?.[0]?.spdisplays_ndrvs || [];

        displaysData.forEach((display: any, index: number) => {
          const resolution = display._spdisplays_resolution || '1920 x 1080';
          const match = resolution.match(/(\d+)\s*x\s*(\d+)/);
          displays.push({
            id: index,
            name: display._name || `Display ${index + 1}`,
            width: match ? parseInt(match[1]) : 1920,
            height: match ? parseInt(match[2]) : 1080,
            scaleFactor: display.spdisplays_retina_scale || 1,
            isPrimary: index === 0,
          });
        });
      } else if (this.platform === 'win32') {
        const output = execSync(
          'powershell -command "Get-CimInstance Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution | ConvertTo-Json"',
          { encoding: 'utf-8' }
        );
        const data = JSON.parse(output);
        const monitorsArray = Array.isArray(data) ? data : [data];

        monitorsArray.forEach((monitor: any, index: number) => {
          displays.push({
            id: index,
            name: monitor.Name || `Display ${index + 1}`,
            width: monitor.CurrentHorizontalResolution || 1920,
            height: monitor.CurrentVerticalResolution || 1080,
            scaleFactor: 1,
            isPrimary: index === 0,
          });
        });
      } else {
        // Linux
        const output = execSync('xrandr --query', { encoding: 'utf-8' });
        const lines = output.split('\n');
        let displayIndex = 0;

        for (const line of lines) {
          if (line.includes(' connected')) {
            const match = line.match(/(\d+)x(\d+)/);
            const nameMatch = line.match(/^(\S+)/);
            displays.push({
              id: displayIndex,
              name: nameMatch?.[1] || `Display ${displayIndex + 1}`,
              width: match ? parseInt(match[1]) : 1920,
              height: match ? parseInt(match[2]) : 1080,
              scaleFactor: 1,
              isPrimary: line.includes('primary'),
            });
            displayIndex++;
          }
        }
      }
    } catch (error) {
      // Fallback to default display
      displays.push({
        id: 0,
        name: 'Primary Display',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: true,
      });
    }

    return displays;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async captureToFile(outputPath: string, displayId?: number): Promise<void> {
    if (this.platform === 'darwin') {
      const displayFlag = displayId !== undefined ? `-D ${displayId}` : '';
      execSync(`screencapture -x ${displayFlag} "${outputPath}"`);
    } else if (this.platform === 'win32') {
      // PowerShell screenshot
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $bitmap.Save("${outputPath.replace(/\\/g, '\\\\')}")
        $graphics.Dispose()
        $bitmap.Dispose()
      `.replace(/\n/g, ' ');
      execSync(`powershell -command "${script}"`);
    } else {
      // Linux - try multiple methods
      try {
        execSync(`scrot "${outputPath}"`);
      } catch {
        try {
          execSync(`import -window root "${outputPath}"`);
        } catch {
          execSync(`gnome-screenshot -f "${outputPath}"`);
        }
      }
    }
  }

  private async getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
    try {
      if (this.platform === 'darwin') {
        const output = execSync(`sips -g pixelWidth -g pixelHeight "${imagePath}"`, { encoding: 'utf-8' });
        const widthMatch = output.match(/pixelWidth:\s*(\d+)/);
        const heightMatch = output.match(/pixelHeight:\s*(\d+)/);
        return {
          width: widthMatch ? parseInt(widthMatch[1]) : 1920,
          height: heightMatch ? parseInt(heightMatch[1]) : 1080,
        };
      } else {
        // Use ImageMagick identify
        const output = execSync(`identify -format "%wx%h" "${imagePath}"`, { encoding: 'utf-8' });
        const [width, height] = output.split('x').map(Number);
        return { width, height };
      }
    } catch {
      return { width: 1920, height: 1080 };
    }
  }

  private shouldResize(width: number, height: number): boolean {
    return width > this.config.maxWidth || height > this.config.maxHeight;
  }

  private async resizeImage(
    imagePath: string,
    maxWidth: number,
    maxHeight: number
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const resizedPath = imagePath.replace('.png', '-resized.png');

    try {
      if (this.platform === 'darwin') {
        execSync(`sips -Z ${Math.max(maxWidth, maxHeight)} "${imagePath}" --out "${resizedPath}"`);
      } else {
        execSync(`convert "${imagePath}" -resize ${maxWidth}x${maxHeight} "${resizedPath}"`);
      }

      const buffer = fs.readFileSync(resizedPath);
      const dimensions = await this.getImageDimensions(resizedPath);
      this.safeUnlink(resizedPath);

      return { buffer, ...dimensions };
    } catch {
      return {
        buffer: fs.readFileSync(imagePath),
        width: maxWidth,
        height: maxHeight,
      };
    }
  }

  private async cropImage(
    inputPath: string,
    outputPath: string,
    region: CaptureRegion
  ): Promise<void> {
    const { x, y, width, height } = region;

    if (this.platform === 'darwin') {
      execSync(`sips -c ${height} ${width} --cropOffset ${y} ${x} "${inputPath}" --out "${outputPath}"`);
    } else {
      execSync(`convert "${inputPath}" -crop ${width}x${height}+${x}+${y} "${outputPath}"`);
    }
  }

  private async convertToJpeg(buffer: Buffer, quality: number): Promise<Buffer> {
    const tmpPng = path.join(this.config.tempDir, `convert-${uuid()}.png`);
    const tmpJpg = path.join(this.config.tempDir, `convert-${uuid()}.jpg`);

    try {
      fs.writeFileSync(tmpPng, buffer);

      if (this.platform === 'darwin') {
        execSync(`sips -s format jpeg -s formatOptions ${quality} "${tmpPng}" --out "${tmpJpg}"`);
      } else {
        execSync(`convert "${tmpPng}" -quality ${quality} "${tmpJpg}"`);
      }

      return fs.readFileSync(tmpJpg);
    } finally {
      this.safeUnlink(tmpPng);
      this.safeUnlink(tmpJpg);
    }
  }

  private async gatherMetadata(processingTimeMs: number): Promise<ScreenMetadata> {
    const displays = await this.getDisplays();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

    return {
      platform: this.platform,
      displayCount: displays.length,
      primaryDisplay,
      allDisplays: displays,
      captureMethod: this.getCaptureMethod(),
      processingTimeMs,
    };
  }

  private getMinimalMetadata(processingTimeMs: number): ScreenMetadata {
    return {
      platform: this.platform,
      displayCount: 1,
      primaryDisplay: {
        id: 0,
        name: 'Primary',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: true,
      },
      allDisplays: [],
      captureMethod: this.getCaptureMethod(),
      processingTimeMs,
    };
  }

  private getCaptureMethod(): string {
    switch (this.platform) {
      case 'darwin': return 'screencapture';
      case 'win32': return 'powershell-gdi';
      default: return 'scrot/import';
    }
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.stopContinuousCapture();
    await this.stopRecording();
    this.removeAllListeners();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createScreenCapture(config?: ScreenCaptureConfig): ScreenCapture {
  return new ScreenCapture(config);
}

export default ScreenCapture;
