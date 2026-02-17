/**
 * Alabobai Browser WebSocket Handler
 *
 * Real-time WebSocket connection for browser automation:
 * - Screenshot streaming
 * - Cursor position updates
 * - Action notifications
 * - Session state changes
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { BrowserAutomationService } from '../../services/browserAutomation.js';

// ============================================================================
// TYPES
// ============================================================================

interface BrowserWebSocketClient {
  ws: WebSocket;
  sessionId?: string;
  subscriptions: Set<string>;
  lastPing: number;
}

interface WebSocketMessage {
  type: string;
  data?: unknown;
  sessionId?: string;
}

// ============================================================================
// WEBSOCKET HANDLER
// ============================================================================

export class BrowserWebSocketHandler {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, BrowserWebSocketClient> = new Map();
  private browserService: BrowserAutomationService;
  private pingInterval: ReturnType<typeof setInterval>;

  constructor(browserService: BrowserAutomationService, port?: number) {
    this.browserService = browserService;
    this.wss = new WebSocketServer({ port: port ?? 3001, path: '/ws/browser' });

    this.setupWebSocketServer();
    this.setupBrowserServiceListeners();

    // Ping interval to keep connections alive
    this.pingInterval = setInterval(() => this.pingClients(), 30000);
  }

  /**
   * Attach to existing HTTP server
   */
  attachToServer(server: import('http').Server | import('https').Server): void {
    this.wss.close();
    this.wss = new WebSocketServer({ server, path: '/ws/browser' });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      // Parse query parameters
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const sessionId = url.searchParams.get('sessionId') || undefined;

      // Create client
      const client: BrowserWebSocketClient = {
        ws,
        sessionId,
        subscriptions: new Set(['all']),
        lastPing: Date.now(),
      };

      if (sessionId) {
        client.subscriptions.add(sessionId);
      }

      this.clients.set(ws, client);

      console.log(`[WS] Client connected${sessionId ? ` for session ${sessionId}` : ''}`);

      // Handle messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          this.handleMessage(client, message);
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      });

      // Handle close
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[WS] Client disconnected');
      });

      // Handle pong
      ws.on('pong', () => {
        client.lastPing = Date.now();
      });

      // Send connection acknowledgment
      this.send(ws, {
        type: 'connected',
        data: {
          sessionId,
          timestamp: new Date().toISOString(),
        },
      });

      // If session exists, send current state
      if (sessionId) {
        const session = this.browserService.getSession(sessionId);
        if (session) {
          this.send(ws, {
            type: 'session:state',
            sessionId,
            data: {
              id: session.id,
              status: session.status,
              viewport: session.viewport,
              cursorPosition: session.cursorPosition,
              currentUrl: session.page.url(),
              historyLength: session.history.length,
              historyIndex: session.historyIndex,
            },
          });
        }
      }
    });

    this.wss.on('error', (error) => {
      console.error('[WS] WebSocket server error:', error);
    });
  }

  private setupBrowserServiceListeners(): void {
    // Session events
    this.browserService.on('session:created', (data) => {
      this.broadcast({
        type: 'session:created',
        sessionId: data.sessionId,
        data: data,
      });
    });

    this.browserService.on('session:closed', (data) => {
      this.broadcast({
        type: 'session:closed',
        sessionId: data.sessionId,
        data: data,
      });
    });

    this.browserService.on('session:error', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'session:error',
        sessionId: data.sessionId,
        data: data,
      });
    });

    // Cursor updates
    this.browserService.on('cursor:update', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'cursor:update',
        sessionId: data.sessionId,
        data: { x: data.x, y: data.y },
      });
    });

    // Action events
    this.browserService.on('action', (action) => {
      this.broadcastToSession(action.sessionId, {
        type: 'action',
        sessionId: action.sessionId,
        data: action,
      });
    });

    this.browserService.on('action:error', (data) => {
      this.broadcastToSession(data.action.sessionId, {
        type: 'action:error',
        sessionId: data.action.sessionId,
        data: data,
      });
    });

    // Page events
    this.browserService.on('page:loaded', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'page:loaded',
        sessionId: data.sessionId,
        data: data,
      });
    });

    this.browserService.on('page:error', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'page:error',
        sessionId: data.sessionId,
        data: data,
      });
    });

    this.browserService.on('page:dialog', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'page:dialog',
        sessionId: data.sessionId,
        data: data,
      });
    });

    // Navigation events
    this.browserService.on('navigation', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'navigation',
        sessionId: data.sessionId,
        data: data,
      });
    });

    // Recording events
    this.browserService.on('recording:started', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'recording:started',
        sessionId: data.sessionId,
        data: data,
      });
    });

    this.browserService.on('recording:stopped', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'recording:stopped',
        sessionId: data.sessionId,
        data: data,
      });
    });

    // Screenshot events (for streaming)
    this.browserService.on('screenshot', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'screenshot',
        sessionId: data.sessionId,
        data: {
          base64: data.base64,
          width: data.width,
          height: data.height,
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Typing events
    this.browserService.on('typing', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'typing',
        sessionId: data.sessionId,
        data: { char: data.char },
      });
    });

    // Scroll events
    this.browserService.on('scroll', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'scroll',
        sessionId: data.sessionId,
        data: data,
      });
    });

    // Confirmation required
    this.browserService.on('confirmation:required', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'confirmation:required',
        sessionId: data.sessionId,
        data: data,
      });
    });
  }

  private handleMessage(client: BrowserWebSocketClient, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.sessionId) {
          client.subscriptions.add(message.sessionId);
          client.sessionId = message.sessionId;
        }
        break;

      case 'unsubscribe':
        if (message.sessionId) {
          client.subscriptions.delete(message.sessionId);
          if (client.sessionId === message.sessionId) {
            client.sessionId = undefined;
          }
        }
        break;

      case 'ping':
        this.send(client.ws, { type: 'pong' });
        break;

      case 'request:screenshot':
        if (message.sessionId) {
          this.sendScreenshot(client, message.sessionId);
        }
        break;

      case 'request:state':
        if (message.sessionId) {
          this.sendSessionState(client, message.sessionId);
        }
        break;

      default:
        console.warn('[WS] Unknown message type:', message.type);
    }
  }

  private async sendScreenshot(client: BrowserWebSocketClient, sessionId: string): Promise<void> {
    try {
      const result = await this.browserService.screenshot(sessionId);
      if (result.success && result.data) {
        this.send(client.ws, {
          type: 'screenshot',
          sessionId,
          data: {
            base64: result.data.base64,
            width: result.data.width,
            height: result.data.height,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('[WS] Failed to send screenshot:', error);
    }
  }

  private sendSessionState(client: BrowserWebSocketClient, sessionId: string): void {
    const session = this.browserService.getSession(sessionId);
    if (session) {
      this.send(client.ws, {
        type: 'session:state',
        sessionId,
        data: {
          id: session.id,
          status: session.status,
          viewport: session.viewport,
          cursorPosition: session.cursorPosition,
          currentUrl: session.page.url(),
          historyLength: session.history.length,
          historyIndex: session.historyIndex,
          isRecording: session.isRecording,
        },
      });
    }
  }

  private send(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: WebSocketMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has('all') || (message.sessionId && client.subscriptions.has(message.sessionId))) {
        this.send(client.ws, message);
      }
    }
  }

  private broadcastToSession(sessionId: string, message: WebSocketMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(sessionId) || client.subscriptions.has('all')) {
        this.send(client.ws, message);
      }
    }
  }

  private pingClients(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    for (const [ws, client] of this.clients) {
      if (now - client.lastPing > timeout) {
        // Client hasn't responded, close connection
        ws.terminate();
        this.clients.delete(ws);
      } else {
        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for a session
   */
  getSessionClients(sessionId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(sessionId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Close the WebSocket server
   */
  close(): void {
    clearInterval(this.pingInterval);

    for (const ws of this.clients.keys()) {
      ws.close();
    }

    this.clients.clear();
    this.wss.close();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBrowserWebSocketHandler(
  browserService: BrowserAutomationService,
  port?: number
): BrowserWebSocketHandler {
  return new BrowserWebSocketHandler(browserService, port);
}

export default BrowserWebSocketHandler;
