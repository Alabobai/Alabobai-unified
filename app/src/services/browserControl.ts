/**
 * Alabobai Browser Control Service
 *
 * Frontend service for browser automation:
 * - WebSocket connection for real-time updates
 * - Screenshot streaming
 * - Action queue management
 * - State synchronization
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserSession {
  id: string;
  viewport: { width: number; height: number };
  status: SessionStatus;
  cursorPosition: { x: number; y: number };
  historyLength: number;
  historyIndex: number;
  isRecording: boolean;
  createdAt: string;
  lastActivity: string;
  currentUrl: string;
}

export type SessionStatus = 'initializing' | 'ready' | 'active' | 'paused' | 'error' | 'closed';

export interface BrowserAction {
  id: string;
  sessionId: string;
  type: ActionType;
  timestamp: string;
  duration?: number;
  data: Record<string, unknown>;
  screenshot?: string;
  success: boolean;
  error?: string;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'type'
  | 'fill'
  | 'clear'
  | 'press'
  | 'scroll'
  | 'hover'
  | 'drag'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'screenshot'
  | 'wait'
  | 'evaluate'
  | 'extract';

export interface ActionRequest {
  type: ActionType;
  sessionId: string;
  [key: string]: unknown;
}

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  action: BrowserAction;
  screenshot?: string;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  text?: string;
  href?: string;
  src?: string;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isEnabled: boolean;
  isEditable: boolean;
  attributes: Record<string, string>;
}

export interface DOMSnapshot {
  url: string;
  title: string;
  html: string;
  text: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  timestamp: string;
}

export interface FormInfo {
  id?: string;
  name?: string;
  action?: string;
  method: string;
  fields: FormFieldInfo[];
}

export interface FormFieldInfo {
  name: string;
  type: string;
  value?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface LinkInfo {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface ImageInfo {
  src: string;
  alt?: string;
  width: number;
  height: number;
}

export interface CursorUpdate {
  x: number;
  y: number;
  sessionId: string;
}

export interface ScreenshotUpdate {
  base64: string;
  width: number;
  height: number;
  timestamp: string;
}

export interface BrowserControlConfig {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  screenshotInterval?: number;
}

export interface QueuedAction {
  id: string;
  request: ActionRequest;
  priority: number;
  addedAt: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: ActionResult;
}

// ============================================================================
// BROWSER CONTROL SERVICE
// ============================================================================

class BrowserControlService {
  private config: Required<BrowserControlConfig>;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventEmitter = new EventEmitter();
  private sessions: Map<string, BrowserSession> = new Map();
  private actionQueue: QueuedAction[] = [];
  private isProcessingQueue = false;
  private screenshotCache: Map<string, ScreenshotUpdate> = new Map();
  private screenshotTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: BrowserControlConfig = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl ?? '/api/browser',
      wsBaseUrl: config.wsBaseUrl ?? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/browser`,
      reconnectInterval: config.reconnectInterval ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      screenshotInterval: config.screenshotInterval ?? 1000,
    };
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventEmitter.emit(event, ...args);
  }

  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================

  connect(sessionId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = sessionId
      ? `${this.config.wsBaseUrl}?sessionId=${sessionId}`
      : this.config.wsBaseUrl;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[BrowserControl] WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('[BrowserControl] Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[BrowserControl] WebSocket disconnected');
        this.emit('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[BrowserControl] WebSocket error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('[BrowserControl] Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear screenshot timers
    for (const timer of this.screenshotTimers.values()) {
      clearInterval(timer);
    }
    this.screenshotTimers.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log('[BrowserControl] Max reconnect attempts reached');
      this.emit('reconnect:failed');
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      console.log(`[BrowserControl] Attempting reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
      this.connect();
    }, this.config.reconnectInterval);
  }

  private handleWebSocketMessage(message: { type: string; data?: unknown; sessionId?: string }): void {
    switch (message.type) {
      case 'session:created':
        this.handleSessionCreated(message.data as BrowserSession);
        break;

      case 'session:updated':
        this.handleSessionUpdated(message.data as Partial<BrowserSession> & { id: string });
        break;

      case 'session:closed':
        this.handleSessionClosed(message.sessionId!);
        break;

      case 'cursor:update':
        this.emit('cursor:update', message.data as CursorUpdate);
        break;

      case 'screenshot':
        this.handleScreenshotUpdate(message.sessionId!, message.data as ScreenshotUpdate);
        break;

      case 'action':
        this.emit('action', message.data as BrowserAction);
        break;

      case 'action:completed':
        this.emit('action:completed', message.data as ActionResult);
        break;

      case 'action:error':
        this.emit('action:error', message.data);
        break;

      case 'page:loaded':
        this.emit('page:loaded', message.data);
        break;

      case 'page:error':
        this.emit('page:error', message.data);
        break;

      default:
        this.emit(message.type, message.data);
    }
  }

  private handleSessionCreated(session: BrowserSession): void {
    this.sessions.set(session.id, session);
    this.emit('session:created', session);
    this.startScreenshotStreaming(session.id);
  }

  private handleSessionUpdated(update: Partial<BrowserSession> & { id: string }): void {
    const session = this.sessions.get(update.id);
    if (session) {
      Object.assign(session, update);
      this.emit('session:updated', session);
    }
  }

  private handleSessionClosed(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.stopScreenshotStreaming(sessionId);
    this.screenshotCache.delete(sessionId);
    this.emit('session:closed', sessionId);
  }

  private handleScreenshotUpdate(sessionId: string, screenshot: ScreenshotUpdate): void {
    this.screenshotCache.set(sessionId, screenshot);
    this.emit('screenshot', { sessionId, ...screenshot });
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  async createSession(options: {
    browserType?: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    viewport?: { width: number; height: number };
    proxy?: { server: string; username?: string; password?: string };
  } = {}): Promise<BrowserSession> {
    const response = await fetch(`${this.config.apiBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create session');
    }

    const result = await response.json();
    const session = result.session as BrowserSession;

    this.sessions.set(session.id, session);
    this.startScreenshotStreaming(session.id);

    // Connect WebSocket for this session
    this.connect(session.id);

    return session;
  }

  async getSession(sessionId: string): Promise<BrowserSession | null> {
    // Check local cache first
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Fetch from API
    const response = await fetch(`${this.config.apiBaseUrl}/session/${sessionId}`);

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to get session');
    }

    const result = await response.json();
    const session = result.session as BrowserSession;

    this.sessions.set(session.id, session);
    return session;
  }

  async getAllSessions(): Promise<BrowserSession[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/sessions`);

    if (!response.ok) {
      throw new Error('Failed to get sessions');
    }

    const result = await response.json();
    const sessions = result.sessions as BrowserSession[];

    // Update local cache
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }

    return sessions;
  }

  async closeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/session/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to close session');
    }

    this.sessions.delete(sessionId);
    this.stopScreenshotStreaming(sessionId);
  }

  getLocalSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  async navigate(sessionId: string, url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<ActionResult> {
    return this.executeAction({
      type: 'navigate',
      sessionId,
      url,
      ...options,
    });
  }

  async goBack(sessionId: string): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/back`, { sessionId });
  }

  async goForward(sessionId: string): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/forward`, { sessionId });
  }

  async reload(sessionId: string): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/reload`, { sessionId });
  }

  // ============================================================================
  // MOUSE ACTIONS
  // ============================================================================

  async click(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string; button?: 'left' | 'right' | 'middle' }
  ): Promise<ActionResult> {
    return this.executeAction({
      type: 'click',
      sessionId,
      ...options,
    });
  }

  async doubleClick(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    return this.click(sessionId, { ...options });
  }

  async rightClick(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    return this.click(sessionId, { ...options, button: 'right' });
  }

  async hover(sessionId: string, options: { x?: number; y?: number; selector?: string }): Promise<ActionResult> {
    return this.executeAction({
      type: 'hover',
      sessionId,
      ...options,
    });
  }

  async scroll(sessionId: string, options: { deltaX?: number; deltaY?: number; selector?: string }): Promise<ActionResult> {
    return this.executeAction({
      type: 'scroll',
      sessionId,
      deltaY: options.deltaY ?? 300,
      ...options,
    });
  }

  async drag(
    sessionId: string,
    options: { fromX: number; fromY: number; toX: number; toY: number } | { fromSelector: string; toSelector: string }
  ): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/drag`, { sessionId, ...options });
  }

  // ============================================================================
  // KEYBOARD ACTIONS
  // ============================================================================

  async type(sessionId: string, text: string, options?: { selector?: string; delay?: number }): Promise<ActionResult> {
    return this.executeAction({
      type: 'type',
      sessionId,
      text,
      ...options,
    });
  }

  async fill(sessionId: string, selector: string, value: string): Promise<ActionResult> {
    return this.executeAction({
      type: 'fill',
      sessionId,
      selector,
      value,
    });
  }

  async press(sessionId: string, key: string, modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[]): Promise<ActionResult> {
    return this.executeAction({
      type: 'press',
      sessionId,
      key,
      modifiers,
    });
  }

  async select(sessionId: string, selector: string, values: string | string[]): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/select`, { sessionId, selector, values });
  }

  async check(sessionId: string, selector: string): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/check`, { sessionId, selector });
  }

  async uncheck(sessionId: string, selector: string): Promise<ActionResult> {
    return this.sendRequest(`${this.config.apiBaseUrl}/uncheck`, { sessionId, selector });
  }

  // ============================================================================
  // SCREENSHOT & DOM
  // ============================================================================

  async screenshot(
    sessionId: string,
    options?: { fullPage?: boolean; selector?: string; type?: 'png' | 'jpeg'; quality?: number }
  ): Promise<{ base64: string; width: number; height: number }> {
    const params = new URLSearchParams();
    params.set('format', 'base64');
    if (options?.fullPage) params.set('fullPage', 'true');
    if (options?.selector) params.set('selector', options.selector);
    if (options?.type) params.set('type', options.type);
    if (options?.quality) params.set('quality', options.quality.toString());

    const response = await fetch(`${this.config.apiBaseUrl}/screenshot/${sessionId}?${params}`);

    if (!response.ok) {
      throw new Error('Failed to capture screenshot');
    }

    const result = await response.json();
    return result.data;
  }

  async getDOM(sessionId: string): Promise<DOMSnapshot> {
    const response = await fetch(`${this.config.apiBaseUrl}/dom/${sessionId}`);

    if (!response.ok) {
      throw new Error('Failed to get DOM');
    }

    const result = await response.json();
    return result.data;
  }

  async findElement(sessionId: string, selector: string): Promise<ElementInfo | null> {
    const response = await fetch(`${this.config.apiBaseUrl}/find-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, selector }),
    });

    if (!response.ok) {
      throw new Error('Failed to find element');
    }

    const result = await response.json();
    return result.data;
  }

  async findElements(sessionId: string, selector: string): Promise<ElementInfo[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/find-elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, selector }),
    });

    if (!response.ok) {
      throw new Error('Failed to find elements');
    }

    const result = await response.json();
    return result.data;
  }

  async getElementAt(sessionId: string, x: number, y: number): Promise<ElementInfo | null> {
    const response = await fetch(`${this.config.apiBaseUrl}/element-at`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, x, y }),
    });

    if (!response.ok) {
      throw new Error('Failed to get element at coordinates');
    }

    const result = await response.json();
    return result.data;
  }

  // ============================================================================
  // JAVASCRIPT EVALUATION
  // ============================================================================

  async evaluate<T = unknown>(sessionId: string, script: string): Promise<T> {
    const response = await fetch(`${this.config.apiBaseUrl}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, script }),
    });

    if (!response.ok) {
      throw new Error('Failed to evaluate script');
    }

    const result = await response.json();
    return result.data as T;
  }

  // ============================================================================
  // WAIT OPERATIONS
  // ============================================================================

  async wait(sessionId: string, options: { duration?: number; selector?: string; state?: 'visible' | 'hidden' }): Promise<ActionResult> {
    return this.executeAction({
      type: 'wait',
      sessionId,
      ...options,
    });
  }

  // ============================================================================
  // COOKIES & STORAGE
  // ============================================================================

  async getCookies(sessionId: string): Promise<unknown[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/cookies/${sessionId}`);

    if (!response.ok) {
      throw new Error('Failed to get cookies');
    }

    const result = await response.json();
    return result.data;
  }

  async setCookies(sessionId: string, cookies: unknown[]): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, cookies }),
    });

    if (!response.ok) {
      throw new Error('Failed to set cookies');
    }
  }

  async getLocalStorage(sessionId: string): Promise<Record<string, string>> {
    const response = await fetch(`${this.config.apiBaseUrl}/storage/${sessionId}`);

    if (!response.ok) {
      throw new Error('Failed to get localStorage');
    }

    const result = await response.json();
    return result.data;
  }

  async setLocalStorage(sessionId: string, data: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/storage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, data }),
    });

    if (!response.ok) {
      throw new Error('Failed to set localStorage');
    }
  }

  // ============================================================================
  // ACTION HISTORY
  // ============================================================================

  async getActionHistory(sessionId: string, limit?: number): Promise<BrowserAction[]> {
    const url = limit
      ? `${this.config.apiBaseUrl}/history/${sessionId}?limit=${limit}`
      : `${this.config.apiBaseUrl}/history/${sessionId}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to get action history');
    }

    const result = await response.json();
    return result.history;
  }

  // ============================================================================
  // ACTION QUEUE MANAGEMENT
  // ============================================================================

  queueAction(request: ActionRequest, priority: number = 0): string {
    const id = crypto.randomUUID();

    const queuedAction: QueuedAction = {
      id,
      request,
      priority,
      addedAt: new Date(),
      status: 'pending',
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.actionQueue.findIndex(a => a.priority < priority);
    if (insertIndex === -1) {
      this.actionQueue.push(queuedAction);
    } else {
      this.actionQueue.splice(insertIndex, 0, queuedAction);
    }

    this.emit('queue:added', queuedAction);

    // Start processing if not already
    this.processQueue();

    return id;
  }

  getQueuedActions(): QueuedAction[] {
    return [...this.actionQueue];
  }

  clearQueue(): void {
    this.actionQueue = [];
    this.emit('queue:cleared');
  }

  removeFromQueue(actionId: string): boolean {
    const index = this.actionQueue.findIndex(a => a.id === actionId);
    if (index !== -1) {
      const removed = this.actionQueue.splice(index, 1)[0];
      this.emit('queue:removed', removed);
      return true;
    }
    return false;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    if (this.actionQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.actionQueue.length > 0) {
      const action = this.actionQueue.find(a => a.status === 'pending');
      if (!action) break;

      action.status = 'executing';
      this.emit('queue:executing', action);

      try {
        const result = await this.executeAction(action.request);
        action.status = result.success ? 'completed' : 'failed';
        action.result = result;
        this.emit('queue:completed', action);
      } catch (error) {
        action.status = 'failed';
        action.result = {
          success: false,
          error: (error as Error).message,
          action: {
            id: crypto.randomUUID(),
            sessionId: action.request.sessionId,
            type: action.request.type,
            timestamp: new Date().toISOString(),
            data: action.request,
            success: false,
            error: (error as Error).message,
          },
        };
        this.emit('queue:failed', action);
      }

      // Remove completed/failed actions
      const index = this.actionQueue.indexOf(action);
      if (index !== -1) {
        this.actionQueue.splice(index, 1);
      }
    }

    this.isProcessingQueue = false;
  }

  // ============================================================================
  // SCREENSHOT STREAMING
  // ============================================================================

  private startScreenshotStreaming(sessionId: string): void {
    if (this.screenshotTimers.has(sessionId)) return;

    const timer = setInterval(async () => {
      try {
        const screenshot = await this.screenshot(sessionId);
        this.handleScreenshotUpdate(sessionId, {
          ...screenshot,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Ignore screenshot errors during streaming
      }
    }, this.config.screenshotInterval);

    this.screenshotTimers.set(sessionId, timer);
  }

  private stopScreenshotStreaming(sessionId: string): void {
    const timer = this.screenshotTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.screenshotTimers.delete(sessionId);
    }
  }

  getLatestScreenshot(sessionId: string): ScreenshotUpdate | undefined {
    return this.screenshotCache.get(sessionId);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async executeAction(request: ActionRequest): Promise<ActionResult> {
    const response = await fetch(`${this.config.apiBaseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Action failed');
    }

    return response.json();
  }

  private async sendRequest(url: string, body: Record<string, unknown>): Promise<ActionResult> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const browserControl = new BrowserControlService();
export default browserControl;
