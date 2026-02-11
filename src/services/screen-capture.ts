/**
 * Alabobai Screen Capture Service
 * Real-time screen capture and streaming for Live Workspace
 * Supports continuous capture, compression, and WebSocket streaming
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { Page } from 'puppeteer';

// ============================================================================
// TYPES
// ============================================================================

export interface CaptureFrame {
  id: string;
  sessionId: string;
  timestamp: Date;
  sequence: number;
  width: number;
  height: number;
  data: string; // base64 encoded
  size: number; // bytes
  deltaFrom?: string; // ID of frame this is a delta from
}

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  type: 'default' | 'pointer' | 'text' | 'wait' | 'crosshair' | 'move' | 'not-allowed';
}

export interface ScreenState {
  sessionId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  cursor: CursorState;
  scrollPosition: { x: number; y: number };
  focusedElement?: string;
}

export interface CaptureConfig {
  fps?: number; // Target frames per second
  quality?: number; // JPEG quality (1-100)
  maxWidth?: number; // Max capture width
  maxHeight?: number; // Max capture height
  enableDelta?: boolean; // Send only changed regions
  cursorTracking?: boolean; // Track cursor position
  throttleMs?: number; // Minimum ms between captures
}

export interface StreamSubscriber {
  id: string;
  sessionId: string;
  callback: (frame: CaptureFrame) => void;
  stateCallback?: (state: ScreenState) => void;
  options?: {
    quality?: number;
    maxFps?: number;
  };
}

// ============================================================================
// SCREEN CAPTURE SERVICE
// ============================================================================

export class ScreenCaptureService extends EventEmitter {
  private config: Required<CaptureConfig>;
  private pages: Map<string, Page> = new Map();
  private subscribers: Map<string, StreamSubscriber[]> = new Map();
  private captureIntervals: Map<string, NodeJS.Timeout> = new Map();
  private frameSequences: Map<string, number> = new Map();
  private lastFrames: Map<string, CaptureFrame> = new Map();
  private screenStates: Map<string, ScreenState> = new Map();
  private cursorPositions: Map<string, CursorState> = new Map();
  private isCapturing: Map<string, boolean> = new Map();

  constructor(config: CaptureConfig = {}) {
    super();
    this.config = {
      fps: config.fps ?? 10,
      quality: config.quality ?? 70,
      maxWidth: config.maxWidth ?? 1920,
      maxHeight: config.maxHeight ?? 1080,
      enableDelta: config.enableDelta ?? false,
      cursorTracking: config.cursorTracking ?? true,
      throttleMs: config.throttleMs ?? 100,
    };
  }

  // ============================================================================
  // PAGE REGISTRATION
  // ============================================================================

  /**
   * Register a Puppeteer page for capture
   */
  registerPage(sessionId: string, page: Page): void {
    this.pages.set(sessionId, page);
    this.frameSequences.set(sessionId, 0);
    this.isCapturing.set(sessionId, false);

    // Initialize cursor state
    this.cursorPositions.set(sessionId, {
      x: 0,
      y: 0,
      visible: true,
      type: 'default',
    });

    // Set up page event listeners for state tracking
    this.setupPageTracking(sessionId, page);

    this.emit('page-registered', { sessionId });
  }

  /**
   * Unregister a page
   */
  unregisterPage(sessionId: string): void {
    this.stopCapture(sessionId);
    this.pages.delete(sessionId);
    this.subscribers.delete(sessionId);
    this.frameSequences.delete(sessionId);
    this.lastFrames.delete(sessionId);
    this.screenStates.delete(sessionId);
    this.cursorPositions.delete(sessionId);
    this.isCapturing.delete(sessionId);

    this.emit('page-unregistered', { sessionId });
  }

  // ============================================================================
  // CAPTURE OPERATIONS
  // ============================================================================

  /**
   * Start continuous capture for a session
   */
  startCapture(sessionId: string, options?: { fps?: number }): void {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new Error(`Page not found for session: ${sessionId}`);
    }

    // Stop existing capture if any
    this.stopCapture(sessionId);

    const fps = options?.fps ?? this.config.fps;
    const interval = Math.floor(1000 / fps);

    this.isCapturing.set(sessionId, true);

    const captureLoop = setInterval(async () => {
      if (!this.isCapturing.get(sessionId)) {
        return;
      }

      try {
        await this.captureFrame(sessionId);
      } catch (error) {
        // Page might be closed or navigating
        const err = error as Error;
        this.emit('capture-error', { sessionId, error: err.message });
      }
    }, interval);

    this.captureIntervals.set(sessionId, captureLoop);

    this.emit('capture-started', { sessionId, fps });
  }

  /**
   * Stop continuous capture for a session
   */
  stopCapture(sessionId: string): void {
    const interval = this.captureIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.captureIntervals.delete(sessionId);
    }

    this.isCapturing.set(sessionId, false);

    this.emit('capture-stopped', { sessionId });
  }

  /**
   * Capture a single frame
   */
  async captureFrame(sessionId: string, options?: {
    quality?: number;
    fullPage?: boolean;
  }): Promise<CaptureFrame> {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new Error(`Page not found for session: ${sessionId}`);
    }

    const quality = options?.quality ?? this.config.quality;
    const sequence = (this.frameSequences.get(sessionId) ?? 0) + 1;
    this.frameSequences.set(sessionId, sequence);

    try {
      // Capture screenshot
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality,
        fullPage: options?.fullPage ?? false,
        omitBackground: false,
      }) as Buffer;

      const data = screenshotBuffer.toString('base64');

      // Get viewport size
      const viewport = page.viewport() ?? { width: 1280, height: 720 };

      const frame: CaptureFrame = {
        id: uuid(),
        sessionId,
        timestamp: new Date(),
        sequence,
        width: viewport.width,
        height: viewport.height,
        data,
        size: screenshotBuffer.length,
      };

      // Store last frame
      this.lastFrames.set(sessionId, frame);

      // Notify subscribers
      this.notifySubscribers(sessionId, frame);

      // Emit frame event
      this.emit('frame', frame);

      return frame;
    } catch (error) {
      const err = error as Error;
      throw new Error(`Frame capture failed: ${err.message}`);
    }
  }

  /**
   * Get current screen state
   */
  async getScreenState(sessionId: string): Promise<ScreenState> {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new Error(`Page not found for session: ${sessionId}`);
    }

    const cursor = this.cursorPositions.get(sessionId) ?? {
      x: 0,
      y: 0,
      visible: true,
      type: 'default' as const,
    };

    const viewport = page.viewport() ?? { width: 1280, height: 720 };

    try {
      const [url, title, scrollPosition, focusedElement] = await Promise.all([
        page.url(),
        page.title(),
        page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
        page.evaluate(() => {
          const el = document.activeElement;
          if (el && el !== document.body) {
            return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`;
          }
          return undefined;
        }),
      ]);

      const state: ScreenState = {
        sessionId,
        url,
        title,
        viewport,
        cursor,
        scrollPosition,
        focusedElement,
      };

      this.screenStates.set(sessionId, state);

      // Notify state subscribers
      this.notifyStateSubscribers(sessionId, state);

      return state;
    } catch (error) {
      // Return cached state if page evaluation fails
      const cachedState = this.screenStates.get(sessionId);
      if (cachedState) {
        return cachedState;
      }
      throw error;
    }
  }

  // ============================================================================
  // CURSOR TRACKING
  // ============================================================================

  /**
   * Update cursor position (called from computer control)
   */
  updateCursor(sessionId: string, x: number, y: number): void {
    const cursor = this.cursorPositions.get(sessionId);
    if (cursor) {
      cursor.x = x;
      cursor.y = y;
      this.emit('cursor-moved', { sessionId, x, y });
    }
  }

  /**
   * Update cursor type
   */
  updateCursorType(sessionId: string, type: CursorState['type']): void {
    const cursor = this.cursorPositions.get(sessionId);
    if (cursor) {
      cursor.type = type;
      this.emit('cursor-type-changed', { sessionId, type });
    }
  }

  /**
   * Get current cursor position
   */
  getCursor(sessionId: string): CursorState | undefined {
    return this.cursorPositions.get(sessionId);
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Subscribe to frame updates for a session
   */
  subscribe(
    sessionId: string,
    callback: (frame: CaptureFrame) => void,
    options?: {
      stateCallback?: (state: ScreenState) => void;
      quality?: number;
      maxFps?: number;
    }
  ): string {
    const subscriberId = uuid();

    const subscriber: StreamSubscriber = {
      id: subscriberId,
      sessionId,
      callback,
      stateCallback: options?.stateCallback,
      options: {
        quality: options?.quality,
        maxFps: options?.maxFps,
      },
    };

    const sessionSubscribers = this.subscribers.get(sessionId) ?? [];
    sessionSubscribers.push(subscriber);
    this.subscribers.set(sessionId, sessionSubscribers);

    this.emit('subscriber-added', { sessionId, subscriberId });

    return subscriberId;
  }

  /**
   * Unsubscribe from frame updates
   */
  unsubscribe(subscriberId: string): void {
    const entries = Array.from(this.subscribers.entries());
    for (let i = 0; i < entries.length; i++) {
      const [sessionId, sessionSubscribers] = entries[i];
      const index = sessionSubscribers.findIndex(s => s.id === subscriberId);
      if (index !== -1) {
        sessionSubscribers.splice(index, 1);
        this.emit('subscriber-removed', { sessionId, subscriberId });
        return;
      }
    }
  }

  /**
   * Get subscriber count for a session
   */
  getSubscriberCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.length ?? 0;
  }

  // ============================================================================
  // STREAMING HELPERS
  // ============================================================================

  /**
   * Create a frame stream generator
   */
  async *createFrameStream(
    sessionId: string,
    options?: { fps?: number; quality?: number }
  ): AsyncGenerator<CaptureFrame> {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new Error(`Page not found for session: ${sessionId}`);
    }

    const fps = options?.fps ?? this.config.fps;
    const interval = Math.floor(1000 / fps);

    while (this.isCapturing.get(sessionId)) {
      try {
        const frame = await this.captureFrame(sessionId, { quality: options?.quality });
        yield frame;
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        // Continue on error, page might be navigating
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  /**
   * Get the last captured frame
   */
  getLastFrame(sessionId: string): CaptureFrame | undefined {
    return this.lastFrames.get(sessionId);
  }

  // ============================================================================
  // RECORDING
  // ============================================================================

  private recordings: Map<string, CaptureFrame[]> = new Map();
  private recordingStates: Map<string, boolean> = new Map();

  /**
   * Start recording frames
   */
  startRecording(sessionId: string): void {
    this.recordings.set(sessionId, []);
    this.recordingStates.set(sessionId, true);

    // Subscribe to frames
    this.subscribe(sessionId, (frame) => {
      if (this.recordingStates.get(sessionId)) {
        const frames = this.recordings.get(sessionId) ?? [];
        frames.push(frame);
        this.recordings.set(sessionId, frames);
      }
    });

    this.emit('recording-started', { sessionId });
  }

  /**
   * Stop recording and return frames
   */
  stopRecording(sessionId: string): CaptureFrame[] {
    this.recordingStates.set(sessionId, false);
    const frames = this.recordings.get(sessionId) ?? [];
    this.recordings.delete(sessionId);

    this.emit('recording-stopped', { sessionId, frameCount: frames.length });

    return frames;
  }

  /**
   * Check if recording is active
   */
  isRecording(sessionId: string): boolean {
    return this.recordingStates.get(sessionId) ?? false;
  }

  // ============================================================================
  // THUMBNAIL GENERATION
  // ============================================================================

  /**
   * Generate a thumbnail from the current page
   */
  async generateThumbnail(
    sessionId: string,
    options?: { width?: number; height?: number; quality?: number }
  ): Promise<string> {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new Error(`Page not found for session: ${sessionId}`);
    }

    const width = options?.width ?? 320;
    const height = options?.height ?? 180;
    const quality = options?.quality ?? 60;

    try {
      // Store original viewport
      const originalViewport = page.viewport();

      // Set thumbnail viewport
      await page.setViewport({ width, height });

      // Capture thumbnail
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality,
      }) as Buffer;

      // Restore original viewport
      if (originalViewport) {
        await page.setViewport(originalViewport);
      }

      return screenshotBuffer.toString('base64');
    } catch (error) {
      const err = error as Error;
      throw new Error(`Thumbnail generation failed: ${err.message}`);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private setupPageTracking(sessionId: string, page: Page): void {
    // Track page navigation
    page.on('load', async () => {
      try {
        await this.getScreenState(sessionId);
      } catch (e) {
        // Page might be closed
      }
    });

    // Track frame navigation
    page.on('framenavigated', async () => {
      try {
        await this.getScreenState(sessionId);
      } catch (e) {
        // Page might be closed
      }
    });
  }

  private notifySubscribers(sessionId: string, frame: CaptureFrame): void {
    const sessionSubscribers = this.subscribers.get(sessionId) ?? [];

    for (const subscriber of sessionSubscribers) {
      try {
        subscriber.callback(frame);
      } catch (error) {
        // Remove failed subscriber
        this.unsubscribe(subscriber.id);
      }
    }
  }

  private notifyStateSubscribers(sessionId: string, state: ScreenState): void {
    const sessionSubscribers = this.subscribers.get(sessionId) ?? [];

    for (const subscriber of sessionSubscribers) {
      if (subscriber.stateCallback) {
        try {
          subscriber.stateCallback(state);
        } catch (error) {
          // Ignore callback errors
        }
      }
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    // Stop all captures
    const sessionIds = Array.from(this.captureIntervals.keys());
    for (let i = 0; i < sessionIds.length; i++) {
      this.stopCapture(sessionIds[i]);
    }

    // Clear all maps
    this.pages.clear();
    this.subscribers.clear();
    this.frameSequences.clear();
    this.lastFrames.clear();
    this.screenStates.clear();
    this.cursorPositions.clear();
    this.recordings.clear();
    this.recordingStates.clear();
  }
}

// Factory function
export function createScreenCapture(config?: CaptureConfig): ScreenCaptureService {
  return new ScreenCaptureService(config);
}

// ============================================================================
// FRAME COMPRESSION UTILITIES
// ============================================================================

/**
 * Compress frame data for efficient transmission
 */
export function compressFrameData(data: string, quality: number = 70): string {
  // In a real implementation, this would use a compression library
  // For now, we rely on JPEG compression from Puppeteer
  return data;
}

/**
 * Calculate frame difference (for delta encoding)
 */
export function calculateFrameDelta(
  currentFrame: string,
  previousFrame: string
): { isDifferent: boolean; changedRegions?: Array<{ x: number; y: number; w: number; h: number }> } {
  // In a real implementation, this would compare frames and identify changed regions
  // For simplicity, we just check if they're different
  return {
    isDifferent: currentFrame !== previousFrame,
  };
}

/**
 * Encode frame for WebSocket transmission
 */
export function encodeFrameForTransmission(frame: CaptureFrame): string {
  return JSON.stringify({
    id: frame.id,
    sessionId: frame.sessionId,
    timestamp: frame.timestamp.toISOString(),
    sequence: frame.sequence,
    width: frame.width,
    height: frame.height,
    data: frame.data,
    size: frame.size,
  });
}
