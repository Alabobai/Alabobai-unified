/**
 * Alabobai Live Workspace API Routes
 * WebSocket endpoint for real-time browser automation streaming
 * Powers the "watch me work" feature
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';

import { ComputerControlService, createComputerControl, BrowserAction } from '../../services/computer-control.js';
import { ScreenCaptureService, createScreenCapture, CaptureFrame, ScreenState } from '../../services/screen-capture.js';
import { VMSandboxService, createVMSandbox, SecurityViolation } from '../../services/vm-sandbox.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkspaceSession {
  id: string;
  userId: string;
  browserSessionId?: string;
  sandboxEnvId?: string;
  connections: Set<WebSocket>;
  status: WorkspaceStatus;
  config: WorkspaceConfig;
  activityFeed: ActivityItem[];
  createdAt: Date;
  lastActivity: Date;
}

export type WorkspaceStatus =
  | 'initializing'
  | 'ready'
  | 'active'
  | 'paused'
  | 'error'
  | 'terminated';

export interface WorkspaceConfig {
  viewport: { width: number; height: number };
  streamFps: number;
  streamQuality: number;
  enableActivityFeed: boolean;
  enableCursorTracking: boolean;
  sandboxPolicy?: string;
}

export interface ActivityItem {
  id: string;
  timestamp: Date;
  type: ActivityType;
  description: string;
  data?: Record<string, unknown>;
  screenshot?: string;
}

export type ActivityType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'screenshot'
  | 'wait'
  | 'action'
  | 'error'
  | 'security';

// WebSocket message types
export type WSMessageType =
  | 'connect'
  | 'disconnect'
  | 'start-session'
  | 'stop-session'
  | 'navigate'
  | 'click'
  | 'type'
  | 'press-key'
  | 'scroll'
  | 'hover'
  | 'screenshot'
  | 'get-state'
  | 'pause'
  | 'resume'
  | 'subscribe'
  | 'unsubscribe';

export interface WSMessage {
  type: WSMessageType;
  sessionId?: string;
  data?: unknown;
  requestId?: string;
}

export interface WSResponse {
  type: string;
  sessionId?: string;
  data?: unknown;
  requestId?: string;
  error?: string;
  timestamp: string;
}

// ============================================================================
// WORKSPACE ROUTER
// ============================================================================

export class WorkspaceRouter extends EventEmitter {
  private computerControl: ComputerControlService;
  private screenCapture: ScreenCaptureService;
  private sandbox: VMSandboxService;
  private sessions: Map<string, WorkspaceSession> = new Map();
  private wss?: WebSocketServer;

  constructor(options?: {
    computerControl?: ComputerControlService;
    screenCapture?: ScreenCaptureService;
    sandbox?: VMSandboxService;
  }) {
    super();
    this.computerControl = options?.computerControl ?? createComputerControl({ headless: false });
    this.screenCapture = options?.screenCapture ?? createScreenCapture({ fps: 10, quality: 70 });
    this.sandbox = options?.sandbox ?? createVMSandbox();

    this.setupServiceListeners();
  }

  // ============================================================================
  // WEBSOCKET SERVER SETUP
  // ============================================================================

  /**
   * Attach WebSocket server to HTTP server
   */
  attachToServer(server: HTTPServer, path: string = '/ws/workspace'): WebSocketServer {
    this.wss = new WebSocketServer({
      server,
      path,
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    console.log(`[Workspace] WebSocket server attached at ${path}`);

    return this.wss;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = uuid();
    const url = new URL(req.url || '', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    const userId = url.searchParams.get('userId') || 'anonymous';

    console.log(`[Workspace] Client connected: ${connectionId}, session: ${sessionId || 'new'}`);

    // Send connection acknowledgment
    this.sendToClient(ws, {
      type: 'connected',
      data: { connectionId, sessionId },
    });

    // Set up message handler
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        await this.handleMessage(ws, message, userId);
      } catch (error) {
        const err = error as Error;
        this.sendToClient(ws, {
          type: 'error',
          error: `Invalid message: ${err.message}`,
        });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      this.handleDisconnection(ws, connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[Workspace] WebSocket error for ${connectionId}:`, error);
    });
  }

  /**
   * Handle WebSocket message
   */
  private async handleMessage(ws: WebSocket, message: WSMessage, userId: string): Promise<void> {
    const { type, sessionId, data, requestId } = message;

    try {
      switch (type) {
        case 'start-session':
          await this.handleStartSession(ws, userId, data as WorkspaceConfig | undefined, requestId);
          break;

        case 'stop-session':
          await this.handleStopSession(sessionId!, requestId);
          break;

        case 'navigate':
          await this.handleNavigate(sessionId!, (data as { url: string }).url, requestId);
          break;

        case 'click':
          await this.handleClick(sessionId!, data as { x?: number; y?: number; selector?: string }, requestId);
          break;

        case 'type':
          await this.handleType(sessionId!, data as { text: string; selector?: string }, requestId);
          break;

        case 'press-key':
          await this.handlePressKey(sessionId!, data as { key: string; modifiers?: string[] }, requestId);
          break;

        case 'scroll':
          await this.handleScroll(sessionId!, data as { x?: number; y?: number; deltaY: number }, requestId);
          break;

        case 'hover':
          await this.handleHover(sessionId!, data as { x?: number; y?: number; selector?: string }, requestId);
          break;

        case 'screenshot':
          await this.handleScreenshot(sessionId!, requestId);
          break;

        case 'get-state':
          await this.handleGetState(sessionId!, requestId);
          break;

        case 'pause':
          await this.handlePause(sessionId!, requestId);
          break;

        case 'resume':
          await this.handleResume(sessionId!, requestId);
          break;

        case 'subscribe':
          this.handleSubscribe(ws, sessionId!);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(ws, sessionId!);
          break;

        default:
          this.sendToClient(ws, {
            type: 'error',
            error: `Unknown message type: ${type}`,
            requestId,
          });
      }
    } catch (error) {
      const err = error as Error;
      this.sendToClient(ws, {
        type: 'error',
        sessionId,
        error: err.message,
        requestId,
      });
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new workspace session
   */
  private async handleStartSession(
    ws: WebSocket,
    userId: string,
    config?: Partial<WorkspaceConfig>,
    requestId?: string
  ): Promise<void> {
    const sessionId = uuid();

    const fullConfig: WorkspaceConfig = {
      viewport: config?.viewport ?? { width: 1280, height: 720 },
      streamFps: config?.streamFps ?? 10,
      streamQuality: config?.streamQuality ?? 70,
      enableActivityFeed: config?.enableActivityFeed ?? true,
      enableCursorTracking: config?.enableCursorTracking ?? true,
      sandboxPolicy: config?.sandboxPolicy ?? 'browsing',
    };

    const session: WorkspaceSession = {
      id: sessionId,
      userId,
      connections: new Set([ws]),
      status: 'initializing',
      config: fullConfig,
      activityFeed: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    try {
      // Create sandbox environment
      const sandboxEnv = await this.sandbox.createEnvironment({
        maxMemoryMB: 1024,
        maxCpuPercent: 50,
      });
      session.sandboxEnvId = sandboxEnv.id;

      // Apply security policy
      if (fullConfig.sandboxPolicy) {
        this.sandbox.applyPolicy(sandboxEnv.id, fullConfig.sandboxPolicy);
      }

      // Launch browser session
      const browserSession = await this.computerControl.launchSession({
        viewport: fullConfig.viewport,
        headless: false,
      });
      session.browserSessionId = browserSession.id;

      // Register page for screen capture
      this.screenCapture.registerPage(browserSession.id, browserSession.page);

      // Start screen capture
      this.screenCapture.startCapture(browserSession.id, { fps: fullConfig.streamFps });

      // Subscribe to frames
      this.screenCapture.subscribe(browserSession.id, (frame) => {
        this.broadcastToSession(sessionId, {
          type: 'frame',
          sessionId,
          data: {
            id: frame.id,
            timestamp: frame.timestamp.toISOString(),
            sequence: frame.sequence,
            width: frame.width,
            height: frame.height,
            data: frame.data,
          },
        });
      });

      // Start recording for activity feed
      if (fullConfig.enableActivityFeed) {
        this.computerControl.startRecording(browserSession.id);
      }

      session.status = 'ready';

      // Add activity item
      this.addActivity(sessionId, 'action', 'Session started');

      this.sendToClient(ws, {
        type: 'session-started',
        sessionId,
        data: {
          config: fullConfig,
          sandboxEnvId: sandboxEnv.id,
          browserSessionId: browserSession.id,
        },
        requestId,
      });

      this.emit('session-started', { sessionId, userId });

    } catch (error) {
      session.status = 'error';
      const err = error as Error;
      this.sendToClient(ws, {
        type: 'error',
        sessionId,
        error: `Failed to start session: ${err.message}`,
        requestId,
      });
    }
  }

  /**
   * Stop a workspace session
   */
  private async handleStopSession(sessionId: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    session.status = 'terminated';

    // Stop screen capture
    if (session.browserSessionId) {
      this.screenCapture.stopCapture(session.browserSessionId);
      this.screenCapture.unregisterPage(session.browserSessionId);
      await this.computerControl.closeSession(session.browserSessionId);
    }

    // Destroy sandbox
    if (session.sandboxEnvId) {
      await this.sandbox.destroyEnvironment(session.sandboxEnvId);
    }

    // Notify all connections
    this.broadcastToSession(sessionId, {
      type: 'session-stopped',
      sessionId,
      requestId,
    });

    // Close all connections
    const connections = Array.from(session.connections);
    for (let i = 0; i < connections.length; i++) {
      connections[i].close();
    }

    this.sessions.delete(sessionId);
    this.emit('session-stopped', { sessionId });
  }

  // ============================================================================
  // BROWSER ACTIONS
  // ============================================================================

  private async handleNavigate(sessionId: string, url: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    // Validate URL against sandbox policy
    if (session.sandboxEnvId) {
      const validation = this.sandbox.validateUrl(session.sandboxEnvId, url);
      if (!validation.allowed) {
        throw new Error(`Navigation blocked: ${validation.reason}`);
      }
    }

    const action = await this.computerControl.navigate(session.browserSessionId!, url);

    this.addActivity(sessionId, 'navigate', `Navigated to ${url}`, { url });
    session.status = 'active';
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handleClick(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string },
    requestId?: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const action = await this.computerControl.click(session.browserSessionId!, options);

    const description = options.selector
      ? `Clicked on ${options.selector}`
      : `Clicked at (${options.x}, ${options.y})`;
    this.addActivity(sessionId, 'click', description, options);
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handleType(
    sessionId: string,
    options: { text: string; selector?: string },
    requestId?: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const action = await this.computerControl.type(session.browserSessionId!, options);

    // Truncate for display
    const displayText = options.text.length > 20
      ? options.text.substring(0, 20) + '...'
      : options.text;
    this.addActivity(sessionId, 'type', `Typed "${displayText}"`, { textLength: options.text.length });
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handlePressKey(
    sessionId: string,
    options: { key: string; modifiers?: string[] },
    requestId?: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const action = await this.computerControl.pressKey(session.browserSessionId!, options);

    const keyCombo = options.modifiers?.length
      ? `${options.modifiers.join('+')}+${options.key}`
      : options.key;
    this.addActivity(sessionId, 'action', `Pressed ${keyCombo}`, options);
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handleScroll(
    sessionId: string,
    options: { x?: number; y?: number; deltaY: number },
    requestId?: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const action = await this.computerControl.scroll(session.browserSessionId!, options);

    const direction = options.deltaY > 0 ? 'down' : 'up';
    this.addActivity(sessionId, 'scroll', `Scrolled ${direction}`, options);
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handleHover(
    sessionId: string,
    options: { x?: number; y?: number; selector?: string },
    requestId?: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const action = await this.computerControl.hover(session.browserSessionId!, options);
    session.lastActivity = new Date();

    this.broadcastToSession(sessionId, {
      type: 'action-completed',
      sessionId,
      data: { action },
      requestId,
    });
  }

  private async handleScreenshot(sessionId: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const { data, action } = await this.computerControl.screenshot(session.browserSessionId!);

    this.addActivity(sessionId, 'screenshot', 'Screenshot captured', undefined, data);

    this.broadcastToSession(sessionId, {
      type: 'screenshot',
      sessionId,
      data: { action, imageData: data },
      requestId,
    });
  }

  private async handleGetState(sessionId: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    const state = await this.screenCapture.getScreenState(session.browserSessionId!);
    const url = await this.computerControl.getCurrentUrl(session.browserSessionId!);
    const title = await this.computerControl.getPageTitle(session.browserSessionId!);

    this.broadcastToSession(sessionId, {
      type: 'state',
      sessionId,
      data: {
        ...state,
        url,
        title,
        status: session.status,
        activityCount: session.activityFeed.length,
      },
      requestId,
    });
  }

  private async handlePause(sessionId: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    this.screenCapture.stopCapture(session.browserSessionId!);
    session.status = 'paused';

    this.addActivity(sessionId, 'action', 'Session paused');

    this.broadcastToSession(sessionId, {
      type: 'session-paused',
      sessionId,
      requestId,
    });
  }

  private async handleResume(sessionId: string, requestId?: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    this.screenCapture.startCapture(session.browserSessionId!, { fps: session.config.streamFps });
    session.status = 'active';

    this.addActivity(sessionId, 'action', 'Session resumed');

    this.broadcastToSession(sessionId, {
      type: 'session-resumed',
      sessionId,
      requestId,
    });
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  private handleSubscribe(ws: WebSocket, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.connections.add(ws);
      this.sendToClient(ws, {
        type: 'subscribed',
        sessionId,
        data: {
          status: session.status,
          activityFeed: session.activityFeed.slice(-50), // Last 50 activities
        },
      });
    }
  }

  private handleUnsubscribe(ws: WebSocket, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.connections.delete(ws);
      this.sendToClient(ws, {
        type: 'unsubscribed',
        sessionId,
      });
    }
  }

  private handleDisconnection(ws: WebSocket, connectionId: string): void {
    console.log(`[Workspace] Client disconnected: ${connectionId}`);

    // Remove from all sessions
    const sessions = Array.from(this.sessions.values());
    for (let i = 0; i < sessions.length; i++) {
      sessions[i].connections.delete(ws);
    }
  }

  // ============================================================================
  // ACTIVITY FEED
  // ============================================================================

  private addActivity(
    sessionId: string,
    type: ActivityType,
    description: string,
    data?: Record<string, unknown>,
    screenshot?: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.config.enableActivityFeed) return;

    const activity: ActivityItem = {
      id: uuid(),
      timestamp: new Date(),
      type,
      description,
      data,
      screenshot,
    };

    session.activityFeed.push(activity);

    // Keep only last 100 activities
    if (session.activityFeed.length > 100) {
      session.activityFeed = session.activityFeed.slice(-100);
    }

    // Broadcast activity
    this.broadcastToSession(sessionId, {
      type: 'activity',
      sessionId,
      data: activity,
    });
  }

  /**
   * Get activity feed for a session
   */
  getActivityFeed(sessionId: string, limit?: number): ActivityItem[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const activities = session.activityFeed;
    return limit ? activities.slice(-limit) : activities;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getSessionOrThrow(sessionId: string): WorkspaceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private sendToClient(ws: WebSocket, response: Omit<WSResponse, 'timestamp'>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...response,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  private broadcastToSession(sessionId: string, response: Omit<WSResponse, 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = JSON.stringify({
      ...response,
      timestamp: new Date().toISOString(),
    });

    const connections = Array.from(session.connections);
    for (let i = 0; i < connections.length; i++) {
      if (connections[i].readyState === WebSocket.OPEN) {
        connections[i].send(message);
      }
    }
  }

  private setupServiceListeners(): void {
    // Forward computer control events
    this.computerControl.on('cursor-update', (data: { sessionId: string; x: number; y: number }) => {
      // Find workspace session by browser session ID
      const sessions = Array.from(this.sessions.values());
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        if (session.browserSessionId === data.sessionId && session.config.enableCursorTracking) {
          this.broadcastToSession(session.id, {
            type: 'cursor',
            sessionId: session.id,
            data: { x: data.x, y: data.y },
          });
        }
      }
    });

    this.computerControl.on('action', (action: BrowserAction) => {
      const sessions = Array.from(this.sessions.values());
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        if (session.browserSessionId === action.sessionId) {
          this.broadcastToSession(session.id, {
            type: 'browser-action',
            sessionId: session.id,
            data: action,
          });
        }
      }
    });

    // Forward sandbox security events
    this.sandbox.on('security-violation', (data: { envId: string; violation: SecurityViolation }) => {
      const sessions = Array.from(this.sessions.values());
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        if (session.sandboxEnvId === data.envId) {
          this.addActivity(
            session.id,
            'security',
            `Security violation: ${data.violation.details}`,
            { violation: data.violation }
          );
          this.broadcastToSession(session.id, {
            type: 'security-violation',
            sessionId: session.id,
            data: data.violation,
          });
        }
      }
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get session by ID
   */
  getSession(sessionId: string): WorkspaceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): WorkspaceSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: string): WorkspaceSession[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  /**
   * Execute an action programmatically (for AI agent use)
   */
  async executeAction(
    sessionId: string,
    action: {
      type: 'navigate' | 'click' | 'type' | 'scroll' | 'pressKey';
      data: unknown;
    }
  ): Promise<BrowserAction> {
    const session = this.getSessionOrThrow(sessionId);

    switch (action.type) {
      case 'navigate':
        return this.computerControl.navigate(
          session.browserSessionId!,
          (action.data as { url: string }).url
        );
      case 'click':
        return this.computerControl.click(
          session.browserSessionId!,
          action.data as { x?: number; y?: number; selector?: string }
        );
      case 'type':
        return this.computerControl.type(
          session.browserSessionId!,
          action.data as { text: string; selector?: string }
        );
      case 'scroll':
        return this.computerControl.scroll(
          session.browserSessionId!,
          action.data as { x?: number; y?: number; deltaY: number }
        );
      case 'pressKey':
        return this.computerControl.pressKey(
          session.browserSessionId!,
          action.data as { key: string; modifiers?: string[] }
        );
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Stop all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (let i = 0; i < sessionIds.length; i++) {
      try {
        await this.handleStopSession(sessionIds[i]);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Cleanup services
    await this.computerControl.cleanup();
    this.screenCapture.cleanup();
    await this.sandbox.cleanup();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
  }
}

// Factory function
export function createWorkspaceRouter(options?: {
  computerControl?: ComputerControlService;
  screenCapture?: ScreenCaptureService;
  sandbox?: VMSandboxService;
}): WorkspaceRouter {
  return new WorkspaceRouter(options);
}

// ============================================================================
// EXPRESS ROUTER INTEGRATION
// ============================================================================

import { Router, Request, Response } from 'express';

/**
 * Create Express router for workspace REST endpoints
 */
export function createWorkspaceRestRouter(workspaceRouter: WorkspaceRouter): Router {
  const router = Router();

  // Get all sessions
  router.get('/sessions', (req: Request, res: Response) => {
    const sessions = workspaceRouter.getAllSessions().map(s => ({
      id: s.id,
      userId: s.userId,
      status: s.status,
      config: s.config,
      activityCount: s.activityFeed.length,
      connectionCount: s.connections.size,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }));
    res.json({ sessions });
  });

  // Get session by ID
  router.get('/sessions/:sessionId', (req: Request, res: Response) => {
    const session = workspaceRouter.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      userId: session.userId,
      status: session.status,
      config: session.config,
      activityFeed: session.activityFeed.slice(-50),
      connectionCount: session.connections.size,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    });
  });

  // Get activity feed
  router.get('/sessions/:sessionId/activity', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const activities = workspaceRouter.getActivityFeed(req.params.sessionId, limit);
    res.json({ activities });
  });

  // Execute action (for programmatic control)
  router.post('/sessions/:sessionId/action', async (req: Request, res: Response) => {
    try {
      const action = await workspaceRouter.executeAction(req.params.sessionId, req.body);
      res.json({ success: true, action });
    } catch (error) {
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
