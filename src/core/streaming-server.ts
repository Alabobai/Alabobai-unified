/**
 * ============================================================================
 * ALABOBAI EXECUTION STREAMING SERVER
 * ============================================================================
 *
 * Server-side implementation of the WebSocket streaming protocol.
 * Integrates with the Orchestrator to stream real-time execution events.
 *
 * Usage:
 *   import { createStreamingServer } from './streaming-server';
 *
 *   const streamingServer = createStreamingServer({
 *     orchestrator,
 *     httpServer
 *   });
 *
 *   streamingServer.start();
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { v4 as uuid } from 'uuid';
import { Orchestrator } from './orchestrator.js';
import {
  BaseMessage,
  MessageType,
  StreamType,
  Priority,
  SubscriptionTarget,
  StreamingEventBuilder
} from './streaming-client.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ClientConnection {
  id: string;
  ws: WebSocket;
  sessionId: string;
  userId: string;
  authenticated: boolean;
  subscriptions: Map<string, SubscriptionTarget>;
  sequence: number;
  lastActivity: Date;
  metrics: {
    messagesSent: number;
    messagesReceived: number;
    bytesReceived: number;
  };
}

interface StreamingServerConfig {
  orchestrator: Orchestrator;
  httpServer: HttpServer;
  path?: string;
  heartbeatInterval?: number;
  maxConnections?: number;
  maxSubscriptionsPerClient?: number;
  messageBufferSize?: number;
  rateLimiting?: {
    enabled: boolean;
    maxMessagesPerSecond: number;
    burstSize: number;
  };
  compression?: {
    enabled: boolean;
    threshold: number;
  };
}

interface MessageBuffer {
  messages: BaseMessage[];
  maxSize: number;
  oldestTimestamp: Date;
}

// ============================================================================
// STREAMING SERVER IMPLEMENTATION
// ============================================================================

export class StreamingServer extends EventEmitter {
  private config: Required<StreamingServerConfig>;
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private messageBuffer: MessageBuffer;
  private eventBuilder: StreamingEventBuilder;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: StreamingServerConfig) {
    super();

    this.config = {
      path: '/v1/stream',
      heartbeatInterval: 30000,
      maxConnections: 1000,
      maxSubscriptionsPerClient: 10,
      messageBufferSize: 10000,
      rateLimiting: {
        enabled: true,
        maxMessagesPerSecond: 100,
        burstSize: 200
      },
      compression: {
        enabled: true,
        threshold: 1024
      },
      ...config
    };

    this.messageBuffer = {
      messages: [],
      maxSize: this.config.messageBufferSize,
      oldestTimestamp: new Date()
    };

    this.eventBuilder = new StreamingEventBuilder('server');

    // Initialize WebSocket server
    this.wss = new WebSocketServer({
      server: this.config.httpServer,
      path: this.config.path
    });

    this.setupWebSocketServer();
    this.setupOrchestratorEvents();
  }

  // ============================================================================
  // SERVER LIFECYCLE
  // ============================================================================

  start(): void {
    this.startHeartbeat();
    console.log(`[StreamingServer] Started on path ${this.config.path}`);
  }

  stop(): void {
    this.stopHeartbeat();

    // Close all connections
    for (const client of this.clients.values()) {
      this.sendToClient(client, {
        type: 'CONNECTION_CLOSE',
        payload: { reason: 'Server shutting down' }
      });
      client.ws.close(1001, 'Server shutting down');
    }

    this.clients.clear();
    this.wss.close();
    console.log('[StreamingServer] Stopped');
  }

  // ============================================================================
  // WEBSOCKET SERVER SETUP
  // ============================================================================

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('[StreamingServer] WebSocket server error:', error);
      this.emit('error', error);
    });
  }

  private handleConnection(ws: WebSocket, request: any): void {
    // Check max connections
    if (this.clients.size >= this.config.maxConnections) {
      ws.close(4003, 'Max connections reached');
      return;
    }

    // Parse query parameters
    const url = new URL(request.url, `ws://${request.headers.host}`);
    const sessionId = url.searchParams.get('session') || uuid();

    // Create client connection
    const client: ClientConnection = {
      id: uuid(),
      ws,
      sessionId,
      userId: '',
      authenticated: false,
      subscriptions: new Map(),
      sequence: 0,
      lastActivity: new Date(),
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        bytesReceived: 0
      }
    };

    this.clients.set(client.id, client);

    // Send connection init
    this.sendToClient(client, {
      type: 'CONNECTION_INIT',
      payload: {
        version: '1.0.0',
        capabilities: ['compression', 'delta', 'batching']
      }
    });

    // Setup message handling
    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnect(client, code, reason.toString());
    });

    ws.on('error', (error) => {
      console.error(`[StreamingServer] Client ${client.id} error:`, error);
    });

    console.log(`[StreamingServer] Client connected: ${client.id}`);
    this.emit('clientConnected', { clientId: client.id, sessionId });
  }

  private handleMessage(client: ClientConnection, data: any): void {
    try {
      client.lastActivity = new Date();
      client.metrics.messagesReceived++;
      client.metrics.bytesReceived += data.length;

      const message: BaseMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'CONNECTION_AUTH':
          this.handleAuth(client, message);
          break;

        case 'CONNECTION_CLOSE':
          this.handleClientClose(client, message);
          break;

        case 'SUBSCRIBE':
          this.handleSubscribe(client, message);
          break;

        case 'UNSUBSCRIBE':
          this.handleUnsubscribe(client, message);
          break;

        case 'PING':
          this.handlePing(client, message);
          break;

        case 'PONG':
          this.handlePong(client, message);
          break;

        default:
          console.warn(`[StreamingServer] Unknown message type: ${message.type}`);
          break;
      }

    } catch (error) {
      console.error('[StreamingServer] Failed to handle message:', error);
      this.sendToClient(client, {
        type: 'CONNECTION_ERROR',
        payload: { message: 'Invalid message format' }
      });
    }
  }

  // ============================================================================
  // MESSAGE HANDLERS
  // ============================================================================

  private handleAuth(client: ClientConnection, message: BaseMessage): void {
    const { token } = message.payload as { token: string };

    // TODO: Implement actual token validation
    const isValid = this.validateToken(token);

    if (isValid) {
      client.authenticated = true;
      client.userId = this.extractUserIdFromToken(token);

      this.sendToClient(client, {
        type: 'CONNECTION_ACK',
        correlationId: message.id,
        payload: {
          sessionId: client.sessionId,
          serverVersion: '1.0.0',
          capabilities: ['compression', 'delta', 'batching'],
          heartbeatIntervalMs: this.config.heartbeatInterval
        }
      });

      console.log(`[StreamingServer] Client authenticated: ${client.id}`);
    } else {
      this.sendToClient(client, {
        type: 'CONNECTION_ERROR',
        correlationId: message.id,
        payload: {
          code: 2002,
          message: 'Invalid authentication token'
        }
      });
      client.ws.close(4001, 'Authentication failed');
    }
  }

  private handleClientClose(client: ClientConnection, message: BaseMessage): void {
    const { reason } = message.payload as { reason: string };
    console.log(`[StreamingServer] Client requested close: ${client.id}, reason: ${reason}`);
    this.handleDisconnect(client, 1000, reason);
  }

  private handleSubscribe(client: ClientConnection, message: BaseMessage): void {
    if (!client.authenticated) {
      this.sendToClient(client, {
        type: 'SUBSCRIPTION_ERROR',
        correlationId: message.id,
        payload: {
          code: 2001,
          message: 'Authentication required'
        }
      });
      return;
    }

    // Check subscription limit
    if (client.subscriptions.size >= this.config.maxSubscriptionsPerClient) {
      this.sendToClient(client, {
        type: 'SUBSCRIPTION_ERROR',
        correlationId: message.id,
        payload: {
          code: 3002,
          message: 'Subscription limit exceeded'
        }
      });
      return;
    }

    const { subscriptionId, stream, filter, events, throttleMs, includeHistory, historyDurationMs } =
      message.payload as unknown as SubscriptionTarget & { subscriptionId: string };

    const target: SubscriptionTarget = {
      stream,
      filter,
      events,
      throttleMs,
      includeHistory,
      historyDurationMs
    };

    client.subscriptions.set(subscriptionId, target);

    this.sendToClient(client, {
      type: 'SUBSCRIPTION_ACK',
      correlationId: message.id,
      payload: { subscriptionId }
    });

    // Send historical messages if requested
    if (includeHistory) {
      this.sendHistoricalMessages(client, target, historyDurationMs || 60000);
    }

    console.log(`[StreamingServer] Client ${client.id} subscribed to: ${stream}`);
  }

  private handleUnsubscribe(client: ClientConnection, message: BaseMessage): void {
    const { subscriptionId } = message.payload as { subscriptionId: string };

    if (client.subscriptions.has(subscriptionId)) {
      client.subscriptions.delete(subscriptionId);
      this.sendToClient(client, {
        type: 'ACK',
        correlationId: message.id,
        payload: { subscriptionId }
      });
    } else {
      this.sendToClient(client, {
        type: 'NACK',
        correlationId: message.id,
        payload: { reason: 'Subscription not found' }
      });
    }
  }

  private handlePing(client: ClientConnection, message: BaseMessage): void {
    // Client-initiated ping
    this.sendToClient(client, {
      type: 'PONG',
      correlationId: message.id,
      payload: {
        echoTime: (message.payload as any).serverTime,
        clientTime: Date.now()
      }
    });
  }

  private handlePong(client: ClientConnection, _message: BaseMessage): void {
    // Client responded to server ping
    client.lastActivity = new Date();
  }

  private handleDisconnect(client: ClientConnection, code: number, reason: string): void {
    client.subscriptions.clear();
    this.clients.delete(client.id);
    console.log(`[StreamingServer] Client disconnected: ${client.id}, code: ${code}, reason: ${reason}`);
    this.emit('clientDisconnected', { clientId: client.id, code, reason });
  }

  // ============================================================================
  // ORCHESTRATOR EVENT INTEGRATION
  // ============================================================================

  private setupOrchestratorEvents(): void {
    const orchestrator = this.config.orchestrator;

    // Agent state changes
    orchestrator.on('task-started', (data) => {
      this.broadcast(this.eventBuilder.agentStateChange({
        agentId: data.agentId,
        agentName: 'Agent',
        agentType: 'worker',
        fromState: 'idle',
        toState: 'acting',
        reason: 'Task started',
        taskId: data.taskId
      }));
    });

    orchestrator.on('task-completed', (data) => {
      this.broadcast(this.eventBuilder.agentStateChange({
        agentId: data.result?.agentId || 'unknown',
        agentName: 'Agent',
        agentType: 'worker',
        fromState: 'acting',
        toState: 'idle',
        reason: 'Task completed',
        taskId: data.taskId
      }));
    });

    orchestrator.on('task-failed', (data) => {
      this.broadcast({
        id: uuid(),
        type: 'AGENT_ERROR',
        timestamp: new Date().toISOString(),
        sessionId: 'server',
        sequence: 0,
        payload: {
          agentId: 'unknown',
          taskId: data.taskId,
          error: {
            type: 'TaskError',
            message: data.error,
            recoverable: true
          }
        },
        metadata: { priority: 'critical' }
      });
    });

    orchestrator.on('approval-requested', (data) => {
      this.broadcast({
        id: uuid(),
        type: 'TASK_APPROVAL_REQUIRED',
        timestamp: new Date().toISOString(),
        sessionId: 'server',
        sequence: 0,
        payload: {
          approvalId: data.approvalId,
          taskId: data.task?.id,
          agentId: data.agent?.id,
          agentName: data.agent?.name,
          action: 'Action requires approval',
          details: data.task?.description
        },
        metadata: { priority: 'high' }
      });
    });

    orchestrator.on('screen-captured', (data) => {
      // Would integrate with ComputerController
      this.broadcast({
        id: uuid(),
        type: 'BROWSER_SCREENSHOT',
        timestamp: new Date().toISOString(),
        sessionId: 'server',
        sequence: 0,
        payload: {
          id: data.captureId,
          capturedAt: new Date().toISOString(),
          url: 'desktop://',
          title: 'Desktop',
          imageData: data.imageData || '',
          format: 'webp',
          dimensions: {
            width: data.width || 1920,
            height: data.height || 1080,
            devicePixelRatio: 1
          },
          viewport: {
            width: data.width || 1920,
            height: data.height || 1080,
            scrollX: 0,
            scrollY: 0,
            pageWidth: data.width || 1920,
            pageHeight: data.height || 1080
          },
          sizeBytes: (data.imageData || '').length,
          isDelta: false
        }
      });
    });

    orchestrator.on('message-processed', (data) => {
      // Could emit reasoning events based on agent responses
      if (data.assistantMessage?.agentId) {
        this.broadcast(this.eventBuilder.agentReasoning({
          agentId: data.assistantMessage.agentId,
          thoughtType: 'summary',
          content: data.assistantMessage.content.substring(0, 500),
          taskId: data.assistantMessage.taskId
        }));
      }
    });
  }

  // ============================================================================
  // BROADCASTING
  // ============================================================================

  broadcast(message: BaseMessage): void {
    // Add to buffer for history
    this.addToBuffer(message);

    // Send to all subscribed clients
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;

      if (this.shouldReceiveMessage(client, message)) {
        this.sendToClient(client, message);
      }
    }
  }

  broadcastToSession(sessionId: string, message: BaseMessage): void {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId && client.authenticated) {
        if (this.shouldReceiveMessage(client, message)) {
          this.sendToClient(client, message);
        }
      }
    }
  }

  private shouldReceiveMessage(client: ClientConnection, message: BaseMessage): boolean {
    for (const subscription of client.subscriptions.values()) {
      if (this.matchesSubscription(subscription, message)) {
        return true;
      }
    }
    return false;
  }

  private matchesSubscription(subscription: SubscriptionTarget, message: BaseMessage): boolean {
    // Match stream type
    const streamType = this.getStreamType(message.type);
    if (subscription.stream !== 'all' && subscription.stream !== streamType) {
      return false;
    }

    // Match event types if specified
    if (subscription.events && subscription.events.length > 0) {
      if (!subscription.events.includes(message.type)) {
        return false;
      }
    }

    // Match filters
    if (subscription.filter) {
      if (subscription.filter.agentId && message.metadata?.agentId !== subscription.filter.agentId) {
        return false;
      }
      if (subscription.filter.taskId && message.metadata?.taskId !== subscription.filter.taskId) {
        return false;
      }
      if (subscription.filter.sessionId && message.sessionId !== subscription.filter.sessionId) {
        return false;
      }
    }

    return true;
  }

  private getStreamType(messageType: MessageType): StreamType {
    if (messageType.startsWith('BROWSER_')) return 'browser';
    if (messageType.startsWith('TERMINAL_')) return 'terminal';
    if (messageType.startsWith('FILE_') || messageType.startsWith('DIRECTORY_')) return 'file';
    if (messageType.startsWith('AGENT_')) return 'agent';
    if (messageType.startsWith('TASK_')) return 'task';
    return 'all';
  }

  private sendToClient(client: ClientConnection, message: Partial<BaseMessage>): void {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const fullMessage: BaseMessage = {
      id: uuid(),
      type: message.type || 'ACK',
      timestamp: new Date().toISOString(),
      sessionId: client.sessionId,
      sequence: client.sequence++,
      payload: message.payload || {},
      ...message
    };

    try {
      const data = JSON.stringify(fullMessage);
      client.ws.send(data);
      client.metrics.messagesSent++;
    } catch (error) {
      console.error(`[StreamingServer] Failed to send to client ${client.id}:`, error);
    }
  }

  // ============================================================================
  // MESSAGE BUFFER & HISTORY
  // ============================================================================

  private addToBuffer(message: BaseMessage): void {
    this.messageBuffer.messages.push(message);

    // Trim buffer if needed
    while (this.messageBuffer.messages.length > this.messageBuffer.maxSize) {
      this.messageBuffer.messages.shift();
    }

    // Update oldest timestamp
    if (this.messageBuffer.messages.length > 0) {
      this.messageBuffer.oldestTimestamp = new Date(this.messageBuffer.messages[0].timestamp);
    }
  }

  private sendHistoricalMessages(
    client: ClientConnection,
    subscription: SubscriptionTarget,
    durationMs: number
  ): void {
    const cutoff = new Date(Date.now() - durationMs);

    const historicalMessages = this.messageBuffer.messages.filter((message) => {
      if (new Date(message.timestamp) < cutoff) {
        return false;
      }
      return this.matchesSubscription(subscription, message);
    });

    for (const message of historicalMessages) {
      this.sendToClient(client, message);
    }
  }

  // ============================================================================
  // HEARTBEAT
  // ============================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const client of this.clients.values()) {
        // Check for inactive clients
        const inactiveMs = now - client.lastActivity.getTime();
        if (inactiveMs > this.config.heartbeatInterval * 2) {
          console.log(`[StreamingServer] Client ${client.id} timed out`);
          client.ws.close(4000, 'Heartbeat timeout');
          continue;
        }

        // Send ping
        this.sendToClient(client, {
          type: 'PING',
          payload: {
            serverTime: now
          }
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================================================
  // TOKEN VALIDATION (PLACEHOLDER)
  // ============================================================================

  private validateToken(_token: string): boolean {
    // TODO: Implement actual JWT validation
    return true;
  }

  private extractUserIdFromToken(_token: string): string {
    // TODO: Implement actual JWT decoding
    return 'user-' + uuid().substring(0, 8);
  }

  // ============================================================================
  // PUBLIC API FOR EMITTING EVENTS
  // ============================================================================

  /**
   * Emit a browser screenshot event
   */
  emitScreenshot(data: {
    sessionId?: string;
    url: string;
    title: string;
    imageData: string;
    format?: 'png' | 'jpeg' | 'webp';
    width: number;
    height: number;
    cursor?: { x: number; y: number; visible: boolean };
  }): void {
    const event: BaseMessage = {
      id: uuid(),
      type: 'BROWSER_SCREENSHOT',
      timestamp: new Date().toISOString(),
      sessionId: data.sessionId || 'server',
      sequence: 0,
      payload: {
        id: uuid(),
        capturedAt: new Date().toISOString(),
        url: data.url,
        title: data.title,
        imageData: data.imageData,
        format: data.format || 'webp',
        dimensions: {
          width: data.width,
          height: data.height,
          devicePixelRatio: 1
        },
        viewport: {
          width: data.width,
          height: data.height,
          scrollX: 0,
          scrollY: 0,
          pageWidth: data.width,
          pageHeight: data.height
        },
        sizeBytes: data.imageData.length,
        isDelta: false,
        cursor: data.cursor
      }
    };

    if (data.sessionId) {
      this.broadcastToSession(data.sessionId, event);
    } else {
      this.broadcast(event);
    }
  }

  /**
   * Emit a terminal output event
   */
  emitTerminalOutput(data: {
    sessionId?: string;
    commandId: string;
    data: string;
    isStderr?: boolean;
    isComplete?: boolean;
    elapsedMs: number;
    agentId?: string;
    taskId?: string;
  }): void {
    const event = this.eventBuilder.terminalOutput({
      commandId: data.commandId,
      chunkId: Date.now(),
      data: data.data,
      isStderr: data.isStderr,
      isComplete: data.isComplete,
      elapsedMs: data.elapsedMs
    });

    event.metadata = {
      ...event.metadata,
      agentId: data.agentId,
      taskId: data.taskId
    };

    if (data.sessionId) {
      event.sessionId = data.sessionId;
      this.broadcastToSession(data.sessionId, event);
    } else {
      this.broadcast(event);
    }
  }

  /**
   * Emit an agent reasoning event
   */
  emitAgentReasoning(data: {
    sessionId?: string;
    agentId: string;
    thoughtType: 'observation' | 'analysis' | 'planning' | 'hypothesis' | 'decision' | 'reflection' | 'correction' | 'question' | 'insight' | 'summary';
    content: string;
    confidence?: number;
    taskId?: string;
    ledToAction?: boolean;
    action?: string;
  }): void {
    const event: BaseMessage = {
      id: uuid(),
      type: 'AGENT_REASONING',
      timestamp: new Date().toISOString(),
      sessionId: data.sessionId || 'server',
      sequence: 0,
      payload: {
        id: uuid(),
        agentId: data.agentId,
        thoughtType: data.thoughtType,
        content: data.content,
        confidence: data.confidence,
        depth: 0,
        ledToAction: data.ledToAction || false,
        action: data.action,
        taskId: data.taskId,
        visibility: 'user'
      },
      metadata: {
        agentId: data.agentId,
        taskId: data.taskId,
        priority: 'normal'
      }
    };

    if (data.sessionId) {
      this.broadcastToSession(data.sessionId, event);
    } else {
      this.broadcast(event);
    }
  }

  /**
   * Emit an agent progress event
   */
  emitAgentProgress(data: {
    sessionId?: string;
    agentId: string;
    taskId: string;
    percentage: number;
    phase: string;
    phaseNumber: number;
    totalPhases: number;
    currentStep: string;
    stepNumber: number;
    totalSteps: number;
    estimatedRemainingMs?: number;
  }): void {
    const event = this.eventBuilder.agentProgress(data);

    if (data.sessionId) {
      event.sessionId = data.sessionId;
      this.broadcastToSession(data.sessionId, event);
    } else {
      this.broadcast(event);
    }
  }

  /**
   * Emit a file create event
   */
  emitFileCreate(data: {
    sessionId?: string;
    path: string;
    content?: string;
    language?: string;
    agentId?: string;
    taskId?: string;
    reason?: string;
  }): void {
    const filename = data.path.split('/').pop() || data.path;
    const event = this.eventBuilder.fileCreate({
      path: data.path,
      filename,
      content: data.content,
      sizeBytes: data.content?.length || 0,
      language: data.language,
      agentId: data.agentId,
      taskId: data.taskId,
      reason: data.reason
    });

    if (data.sessionId) {
      event.sessionId = data.sessionId;
      this.broadcastToSession(data.sessionId, event);
    } else {
      this.broadcast(event);
    }
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  getMetrics(): {
    connectedClients: number;
    totalSubscriptions: number;
    bufferSize: number;
    clientMetrics: Array<{
      clientId: string;
      sessionId: string;
      subscriptionCount: number;
      messagesSent: number;
      messagesReceived: number;
    }>;
  } {
    let totalSubscriptions = 0;
    const clientMetrics = [];

    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
      clientMetrics.push({
        clientId: client.id,
        sessionId: client.sessionId,
        subscriptionCount: client.subscriptions.size,
        messagesSent: client.metrics.messagesSent,
        messagesReceived: client.metrics.messagesReceived
      });
    }

    return {
      connectedClients: this.clients.size,
      totalSubscriptions,
      bufferSize: this.messageBuffer.messages.length,
      clientMetrics
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createStreamingServer(config: StreamingServerConfig): StreamingServer {
  return new StreamingServer(config);
}

export default StreamingServer;
