/**
 * Alabobai Computer Control - Action Recorder Module
 * Production-ready action recording for playback, audit, and debugging
 *
 * Features:
 * - Record all computer control actions
 * - Screenshot capture with each action
 * - Playback recorded actions
 * - Export/import recordings
 * - Audit trail for compliance
 * - Real-time streaming to observers
 * - Compression for storage efficiency
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { v4 as uuid } from 'uuid';
import { MouseAction } from './MouseController.js';
import { KeyboardAction } from './KeyboardController.js';
import { BrowserAction } from './BrowserAutomation.js';
import { ScreenCaptureResult } from './ScreenCapture.js';

// ============================================================================
// TYPES
// ============================================================================

export type RecordedActionType =
  | 'mouse'
  | 'keyboard'
  | 'browser'
  | 'screenshot'
  | 'system'
  | 'intervention'
  | 'ai-decision';

export interface RecordedAction {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: RecordedActionType;
  action: MouseAction | KeyboardAction | BrowserAction | SystemAction | AIDecision;
  screenshot?: string; // base64, can be compressed
  screenshotThumbnail?: string; // smaller preview
  metadata: ActionMetadata;
}

export interface SystemAction {
  type: 'command' | 'file-operation' | 'clipboard' | 'notification' | 'window' | 'custom';
  command?: string;
  path?: string;
  data?: unknown;
  result?: unknown;
  error?: string;
}

export interface AIDecision {
  type: 'analyze' | 'plan' | 'execute' | 'verify' | 'retry' | 'abort';
  input: string;
  reasoning: string;
  decision: string;
  confidence: number;
  alternatives?: string[];
  model?: string;
}

export interface ActionMetadata {
  agentId?: string;
  taskId?: string;
  stepNumber?: number;
  totalSteps?: number;
  duration?: number;
  success?: boolean;
  error?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  status: 'recording' | 'paused' | 'completed' | 'aborted';
  actions: RecordedAction[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  platform: NodeJS.Platform;
  nodeVersion: string;
  hostname: string;
  user?: string;
  taskDescription?: string;
  agentId?: string;
  tags?: string[];
  totalActions?: number;
  totalDuration?: number;
  screenshotsIncluded?: boolean;
  compressionEnabled?: boolean;
}

export interface ActionRecorderConfig {
  captureScreenshots?: boolean;
  screenshotInterval?: number; // Capture every N actions, 0 = every action
  compressScreenshots?: boolean;
  thumbnailSize?: { width: number; height: number };
  maxActionsPerSession?: number;
  storageDir?: string;
  autoSave?: boolean;
  autoSaveInterval?: number; // ms
  streamToObservers?: boolean;
}

export interface PlaybackOptions {
  speed?: number; // 1.0 = normal, 2.0 = 2x speed, 0.5 = half speed
  startIndex?: number;
  endIndex?: number;
  pauseBetweenActions?: number; // ms
  skipScreenshots?: boolean;
  onAction?: (action: RecordedAction, index: number) => void | Promise<void>;
  onProgress?: (current: number, total: number) => void;
}

export type ActionRecorderEvents = {
  'recording-started': (session: RecordingSession) => void;
  'recording-stopped': (session: RecordingSession) => void;
  'recording-paused': (session: RecordingSession) => void;
  'recording-resumed': (session: RecordingSession) => void;
  'action-recorded': (action: RecordedAction) => void;
  'playback-started': (session: RecordingSession) => void;
  'playback-completed': (session: RecordingSession) => void;
  'playback-action': (action: RecordedAction, index: number) => void;
  'session-saved': (path: string) => void;
  'session-loaded': (session: RecordingSession) => void;
  'error': (error: Error) => void;
};

// ============================================================================
// ACTION RECORDER CLASS
// ============================================================================

export class ActionRecorder extends EventEmitter {
  private config: Required<ActionRecorderConfig>;
  private currentSession: RecordingSession | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private actionCount: number = 0;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private observers: Set<(action: RecordedAction) => void> = new Set();

  constructor(config: ActionRecorderConfig = {}) {
    super();
    this.config = {
      captureScreenshots: config.captureScreenshots ?? true,
      screenshotInterval: config.screenshotInterval ?? 1,
      compressScreenshots: config.compressScreenshots ?? true,
      thumbnailSize: config.thumbnailSize ?? { width: 320, height: 180 },
      maxActionsPerSession: config.maxActionsPerSession ?? 10000,
      storageDir: config.storageDir ?? './recordings',
      autoSave: config.autoSave ?? true,
      autoSaveInterval: config.autoSaveInterval ?? 60000, // 1 minute
      streamToObservers: config.streamToObservers ?? true,
    };

    // Ensure storage directory exists
    this.ensureStorageDir();
  }

  // ============================================================================
  // RECORDING CONTROL
  // ============================================================================

  /**
   * Start a new recording session
   */
  startRecording(options: {
    name?: string;
    description?: string;
    taskDescription?: string;
    agentId?: string;
    tags?: string[];
  } = {}): RecordingSession {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const session: RecordingSession = {
      id: uuid(),
      name: options.name || `Recording ${new Date().toISOString()}`,
      description: options.description,
      startTime: new Date(),
      status: 'recording',
      actions: [],
      metadata: {
        platform: process.platform,
        nodeVersion: process.version,
        hostname: require('os').hostname(),
        user: process.env.USER || process.env.USERNAME,
        taskDescription: options.taskDescription,
        agentId: options.agentId,
        tags: options.tags,
        screenshotsIncluded: this.config.captureScreenshots,
        compressionEnabled: this.config.compressScreenshots,
      },
    };

    this.currentSession = session;
    this.isRecording = true;
    this.isPaused = false;
    this.actionCount = 0;

    // Start auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    this.emit('recording-started', session);
    return session;
  }

  /**
   * Stop the current recording
   */
  stopRecording(): RecordingSession | null {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'completed';
    this.currentSession.metadata.totalActions = this.currentSession.actions.length;
    this.currentSession.metadata.totalDuration =
      this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();

    this.isRecording = false;
    this.isPaused = false;
    this.stopAutoSave();

    const session = this.currentSession;
    this.emit('recording-stopped', session);

    // Auto-save final recording
    if (this.config.autoSave) {
      this.saveSession(session);
    }

    return session;
  }

  /**
   * Pause the current recording
   */
  pauseRecording(): void {
    if (!this.isRecording || this.isPaused) {
      return;
    }

    this.isPaused = true;
    if (this.currentSession) {
      this.currentSession.status = 'paused';
      this.emit('recording-paused', this.currentSession);
    }
  }

  /**
   * Resume the current recording
   */
  resumeRecording(): void {
    if (!this.isRecording || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    if (this.currentSession) {
      this.currentSession.status = 'recording';
      this.emit('recording-resumed', this.currentSession);
    }
  }

  /**
   * Abort the current recording
   */
  abortRecording(): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'aborted';
    this.isRecording = false;
    this.isPaused = false;
    this.stopAutoSave();

    const session = this.currentSession;
    this.currentSession = null;
    this.emit('recording-stopped', session);
  }

  /**
   * Check if currently recording
   */
  isActiveRecording(): boolean {
    return this.isRecording && !this.isPaused;
  }

  /**
   * Get current session
   */
  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  // ============================================================================
  // ACTION RECORDING
  // ============================================================================

  /**
   * Record a mouse action
   */
  recordMouseAction(action: MouseAction, screenshot?: ScreenCaptureResult): void {
    this.recordAction('mouse', action, screenshot);
  }

  /**
   * Record a keyboard action
   */
  recordKeyboardAction(action: KeyboardAction, screenshot?: ScreenCaptureResult): void {
    this.recordAction('keyboard', action, screenshot);
  }

  /**
   * Record a browser action
   */
  recordBrowserAction(action: BrowserAction, screenshot?: ScreenCaptureResult): void {
    this.recordAction('browser', action, screenshot);
  }

  /**
   * Record a system action
   */
  recordSystemAction(action: SystemAction, screenshot?: ScreenCaptureResult): void {
    this.recordAction('system', action, screenshot);
  }

  /**
   * Record an AI decision
   */
  recordAIDecision(decision: AIDecision, screenshot?: ScreenCaptureResult): void {
    this.recordAction('ai-decision', decision, screenshot);
  }

  /**
   * Record a screenshot only
   */
  recordScreenshot(screenshot: ScreenCaptureResult, metadata?: ActionMetadata): void {
    if (!this.isActiveRecording() || !this.currentSession) {
      return;
    }

    const recordedAction: RecordedAction = {
      id: uuid(),
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      type: 'screenshot',
      action: {
        type: 'screenshot',
        timestamp: screenshot.timestamp,
      } as any,
      screenshot: this.processScreenshot(screenshot.imageData),
      metadata: {
        ...metadata,
        stepNumber: this.currentSession.actions.length + 1,
      },
    };

    this.addAction(recordedAction);
  }

  /**
   * Record an intervention (user took over)
   */
  recordIntervention(reason: string, details?: Record<string, unknown>): void {
    if (!this.isActiveRecording() || !this.currentSession) {
      return;
    }

    const recordedAction: RecordedAction = {
      id: uuid(),
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      type: 'intervention',
      action: {
        type: 'custom',
        data: { reason, details },
      } as SystemAction,
      metadata: {
        stepNumber: this.currentSession.actions.length + 1,
        tags: ['intervention'],
      },
    };

    this.addAction(recordedAction);
  }

  /**
   * Generic record action
   */
  private recordAction(
    type: RecordedActionType,
    action: MouseAction | KeyboardAction | BrowserAction | SystemAction | AIDecision,
    screenshot?: ScreenCaptureResult
  ): void {
    if (!this.isActiveRecording() || !this.currentSession) {
      return;
    }

    // Check max actions limit
    if (this.currentSession.actions.length >= this.config.maxActionsPerSession) {
      this.emit('error', new Error('Maximum actions per session reached'));
      return;
    }

    this.actionCount++;

    // Determine if we should capture screenshot
    const shouldCaptureScreenshot =
      this.config.captureScreenshots &&
      screenshot &&
      (this.config.screenshotInterval === 0 ||
        this.actionCount % this.config.screenshotInterval === 0);

    const recordedAction: RecordedAction = {
      id: uuid(),
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      type,
      action,
      screenshot: shouldCaptureScreenshot
        ? this.processScreenshot(screenshot.imageData)
        : undefined,
      metadata: {
        stepNumber: this.currentSession.actions.length + 1,
      },
    };

    this.addAction(recordedAction);
  }

  private addAction(action: RecordedAction): void {
    if (!this.currentSession) return;

    this.currentSession.actions.push(action);
    this.emit('action-recorded', action);

    // Stream to observers
    if (this.config.streamToObservers) {
      for (const observer of this.observers) {
        try {
          observer(action);
        } catch (error) {
          this.emit('error', error as Error);
        }
      }
    }
  }

  // ============================================================================
  // OBSERVERS (For live streaming to UI)
  // ============================================================================

  /**
   * Add an observer to receive real-time action updates
   */
  addObserver(callback: (action: RecordedAction) => void): void {
    this.observers.add(callback);
  }

  /**
   * Remove an observer
   */
  removeObserver(callback: (action: RecordedAction) => void): void {
    this.observers.delete(callback);
  }

  /**
   * Clear all observers
   */
  clearObservers(): void {
    this.observers.clear();
  }

  /**
   * Get observer count
   */
  getObserverCount(): number {
    return this.observers.size;
  }

  // ============================================================================
  // PLAYBACK
  // ============================================================================

  /**
   * Play back a recorded session
   */
  async playback(
    session: RecordingSession,
    executor: {
      executeMouse?: (action: MouseAction) => Promise<void>;
      executeKeyboard?: (action: KeyboardAction) => Promise<void>;
      executeBrowser?: (action: BrowserAction) => Promise<void>;
      executeSystem?: (action: SystemAction) => Promise<void>;
    },
    options: PlaybackOptions = {}
  ): Promise<void> {
    const {
      speed = 1.0,
      startIndex = 0,
      endIndex = session.actions.length,
      pauseBetweenActions = 100,
      onAction,
      onProgress,
    } = options;

    this.emit('playback-started', session);

    const actions = session.actions.slice(startIndex, endIndex);
    let previousTimestamp: Date | null = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const currentIndex = startIndex + i;

      // Calculate delay based on original timing
      if (previousTimestamp && speed > 0) {
        const originalDelay = action.timestamp.getTime() - previousTimestamp.getTime();
        const adjustedDelay = Math.max(originalDelay / speed, pauseBetweenActions);
        await this.sleep(adjustedDelay);
      }

      // Execute the action
      try {
        switch (action.type) {
          case 'mouse':
            if (executor.executeMouse) {
              await executor.executeMouse(action.action as MouseAction);
            }
            break;
          case 'keyboard':
            if (executor.executeKeyboard) {
              await executor.executeKeyboard(action.action as KeyboardAction);
            }
            break;
          case 'browser':
            if (executor.executeBrowser) {
              await executor.executeBrowser(action.action as BrowserAction);
            }
            break;
          case 'system':
            if (executor.executeSystem) {
              await executor.executeSystem(action.action as SystemAction);
            }
            break;
        }
      } catch (error) {
        this.emit('error', error as Error);
      }

      // Callbacks
      if (onAction) {
        await onAction(action, currentIndex);
      }

      if (onProgress) {
        onProgress(i + 1, actions.length);
      }

      this.emit('playback-action', action, currentIndex);
      previousTimestamp = action.timestamp;
    }

    this.emit('playback-completed', session);
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Save a session to disk
   */
  async saveSession(session: RecordingSession, filename?: string): Promise<string> {
    this.ensureStorageDir();

    const fname = filename || `${session.id}.json`;
    const filePath = path.join(this.config.storageDir, fname);

    // Optionally compress
    if (this.config.compressScreenshots) {
      const compressed = await this.compressSession(session);
      const compressedPath = filePath.replace('.json', '.json.gz');
      fs.writeFileSync(compressedPath, compressed);
      this.emit('session-saved', compressedPath);
      return compressedPath;
    } else {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      this.emit('session-saved', filePath);
      return filePath;
    }
  }

  /**
   * Load a session from disk
   */
  async loadSession(filePath: string): Promise<RecordingSession> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }

    let data: string;

    if (filePath.endsWith('.gz')) {
      const compressed = fs.readFileSync(filePath);
      data = await this.decompressData(compressed);
    } else {
      data = fs.readFileSync(filePath, 'utf-8');
    }

    const session = JSON.parse(data) as RecordingSession;

    // Convert date strings back to Date objects
    session.startTime = new Date(session.startTime);
    if (session.endTime) {
      session.endTime = new Date(session.endTime);
    }
    for (const action of session.actions) {
      action.timestamp = new Date(action.timestamp);
    }

    this.emit('session-loaded', session);
    return session;
  }

  /**
   * List all saved sessions
   */
  listSessions(): Array<{ id: string; name: string; path: string; size: number; createdAt: Date }> {
    this.ensureStorageDir();

    const files = fs.readdirSync(this.config.storageDir);
    const sessions: Array<{ id: string; name: string; path: string; size: number; createdAt: Date }> = [];

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.json.gz')) {
        const filePath = path.join(this.config.storageDir, file);
        const stats = fs.statSync(filePath);
        const id = file.replace('.json.gz', '').replace('.json', '');

        sessions.push({
          id,
          name: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
        });
      }
    }

    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Delete a saved session
   */
  deleteSession(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Export session to different format
   */
  async exportSession(
    session: RecordingSession,
    format: 'json' | 'csv' | 'html',
    outputPath: string
  ): Promise<void> {
    switch (format) {
      case 'json':
        fs.writeFileSync(outputPath, JSON.stringify(session, null, 2));
        break;

      case 'csv':
        const csv = this.sessionToCSV(session);
        fs.writeFileSync(outputPath, csv);
        break;

      case 'html':
        const html = this.sessionToHTML(session);
        fs.writeFileSync(outputPath, html);
        break;
    }
  }

  // ============================================================================
  // AUDIT TRAIL
  // ============================================================================

  /**
   * Generate an audit report for a session
   */
  generateAuditReport(session: RecordingSession): string {
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════',
      '                    ALABOBAI ACTION AUDIT REPORT',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Session ID: ${session.id}`,
      `Name: ${session.name}`,
      `Description: ${session.description || 'N/A'}`,
      `Status: ${session.status}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '                         SESSION INFO',
      '───────────────────────────────────────────────────────────────',
      `Start Time: ${session.startTime.toISOString()}`,
      `End Time: ${session.endTime?.toISOString() || 'N/A'}`,
      `Duration: ${session.metadata.totalDuration ? `${(session.metadata.totalDuration / 1000).toFixed(2)}s` : 'N/A'}`,
      `Total Actions: ${session.actions.length}`,
      `Platform: ${session.metadata.platform}`,
      `Node Version: ${session.metadata.nodeVersion}`,
      `Hostname: ${session.metadata.hostname}`,
      `User: ${session.metadata.user || 'N/A'}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '                         ACTION LOG',
      '───────────────────────────────────────────────────────────────',
    ];

    for (const action of session.actions) {
      lines.push('');
      lines.push(`[${action.timestamp.toISOString()}] ${action.type.toUpperCase()}`);
      lines.push(`  ID: ${action.id}`);
      lines.push(`  Step: ${action.metadata.stepNumber || 'N/A'}`);
      lines.push(`  Details: ${JSON.stringify(action.action, null, 2).split('\n').join('\n  ')}`);

      if (action.metadata.error) {
        lines.push(`  ERROR: ${action.metadata.error}`);
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                      END OF AUDIT REPORT');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get action statistics for a session
   */
  getSessionStats(session: RecordingSession): {
    totalActions: number;
    actionsByType: Record<string, number>;
    averageActionDuration: number;
    totalDuration: number;
    errorsCount: number;
    interventionsCount: number;
  } {
    const actionsByType: Record<string, number> = {};
    let totalDuration = 0;
    let errorsCount = 0;
    let interventionsCount = 0;

    for (const action of session.actions) {
      actionsByType[action.type] = (actionsByType[action.type] || 0) + 1;

      if (action.metadata.duration) {
        totalDuration += action.metadata.duration;
      }

      if (action.metadata.error) {
        errorsCount++;
      }

      if (action.type === 'intervention') {
        interventionsCount++;
      }
    }

    return {
      totalActions: session.actions.length,
      actionsByType,
      averageActionDuration: session.actions.length > 0 ? totalDuration / session.actions.length : 0,
      totalDuration,
      errorsCount,
      interventionsCount,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }
  }

  private processScreenshot(imageData: string): string {
    if (this.config.compressScreenshots) {
      // For now, just return the base64 data
      // In production, you might want to compress or resize
      return imageData;
    }
    return imageData;
  }

  private async compressSession(session: RecordingSession): Promise<Buffer> {
    const data = JSON.stringify(session);
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  private async decompressData(data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, decompressed) => {
        if (err) reject(err);
        else resolve(decompressed.toString('utf-8'));
      });
    });
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      return;
    }

    this.autoSaveTimer = setInterval(() => {
      if (this.currentSession) {
        this.saveSession(this.currentSession).catch((error) => {
          this.emit('error', error);
        });
      }
    }, this.config.autoSaveInterval);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private sessionToCSV(session: RecordingSession): string {
    const headers = ['timestamp', 'type', 'id', 'step', 'details', 'error'];
    const rows = [headers.join(',')];

    for (const action of session.actions) {
      const row = [
        action.timestamp.toISOString(),
        action.type,
        action.id,
        action.metadata.stepNumber?.toString() || '',
        JSON.stringify(action.action).replace(/,/g, ';'),
        action.metadata.error || '',
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  private sessionToHTML(session: RecordingSession): string {
    const actionsHtml = session.actions
      .map(
        (action, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${action.timestamp.toISOString()}</td>
          <td><span class="badge ${action.type}">${action.type}</span></td>
          <td><pre>${JSON.stringify(action.action, null, 2)}</pre></td>
          <td>${action.metadata.error ? `<span class="error">${action.metadata.error}</span>` : '-'}</td>
          ${action.screenshot ? `<td><img src="data:image/png;base64,${action.screenshot}" width="200"/></td>` : '<td>-</td>'}
        </tr>
      `
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Alabobai Recording: ${session.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    h1 { color: #333; }
    .meta { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
    th { background: #333; color: white; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .mouse { background: #4CAF50; color: white; }
    .keyboard { background: #2196F3; color: white; }
    .browser { background: #FF9800; color: white; }
    .system { background: #9C27B0; color: white; }
    .ai-decision { background: #E91E63; color: white; }
    .error { color: #f44336; }
    pre { background: #f5f5f5; padding: 10px; overflow-x: auto; max-width: 400px; }
  </style>
</head>
<body>
  <h1>Alabobai Recording: ${session.name}</h1>
  <div class="meta">
    <p><strong>ID:</strong> ${session.id}</p>
    <p><strong>Status:</strong> ${session.status}</p>
    <p><strong>Start:</strong> ${session.startTime.toISOString()}</p>
    <p><strong>End:</strong> ${session.endTime?.toISOString() || 'N/A'}</p>
    <p><strong>Actions:</strong> ${session.actions.length}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Timestamp</th>
        <th>Type</th>
        <th>Details</th>
        <th>Error</th>
        <th>Screenshot</th>
      </tr>
    </thead>
    <tbody>
      ${actionsHtml}
    </tbody>
  </table>
</body>
</html>
    `;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAutoSave();
    this.clearObservers();
    this.removeAllListeners();

    if (this.isRecording) {
      this.abortRecording();
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createActionRecorder(config?: ActionRecorderConfig): ActionRecorder {
  return new ActionRecorder(config);
}

export default ActionRecorder;
