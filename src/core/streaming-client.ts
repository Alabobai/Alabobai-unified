/**
 * ============================================================================
 * ALABOBAI EXECUTION STREAMING CLIENT
 * ============================================================================
 *
 * Reference implementation of the WebSocket streaming client for real-time
 * visibility into agent execution. Implements the full streaming specification.
 *
 * Usage:
 *   const client = new ExecutionStreamingClient({
 *     url: 'wss://api.alabobai.com/v1/stream',
 *     token: 'your-auth-token'
 *   });
 *
 *   await client.connect();
 *
 *   client.subscribe({
 *     stream: 'all',
 *     filter: { taskId: 'task-123' }
 *   });
 *
 *   client.on('BROWSER_SCREENSHOT', (event) => {
 *     console.log('Screenshot received:', event.payload);
 *   });
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ConnectionState =
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'subscribed'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type MessageType =
  // Connection lifecycle
  | 'CONNECTION_INIT'
  | 'CONNECTION_AUTH'
  | 'CONNECTION_ACK'
  | 'CONNECTION_ERROR'
  | 'CONNECTION_CLOSE'
  // Subscription
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'SUBSCRIPTION_ACK'
  | 'SUBSCRIPTION_ERROR'
  // Heartbeat
  | 'PING'
  | 'PONG'
  // Browser events
  | 'BROWSER_SCREENSHOT'
  | 'BROWSER_DOM_CHANGE'
  | 'BROWSER_NAVIGATION'
  | 'BROWSER_CLICK'
  | 'BROWSER_INPUT'
  | 'BROWSER_SCROLL'
  | 'BROWSER_FORM_FILL'
  | 'BROWSER_PAGE_STATE'
  | 'BROWSER_CONSOLE'
  | 'BROWSER_NETWORK'
  | 'BROWSER_ERROR'
  // Terminal events
  | 'TERMINAL_COMMAND_START'
  | 'TERMINAL_STDOUT'
  | 'TERMINAL_STDERR'
  | 'TERMINAL_COMMAND_END'
  | 'TERMINAL_CWD_CHANGE'
  | 'TERMINAL_ENV_CHANGE'
  // File events
  | 'FILE_CREATE'
  | 'FILE_MODIFY'
  | 'FILE_DELETE'
  | 'FILE_RENAME'
  | 'FILE_DIFF'
  | 'FILE_BINARY'
  | 'DIRECTORY_CREATE'
  | 'DIRECTORY_DELETE'
  | 'DIRECTORY_TREE'
  // Agent events
  | 'AGENT_STATE_CHANGE'
  | 'AGENT_THINKING'
  | 'AGENT_TOOL_INVOKE'
  | 'AGENT_TOOL_RESULT'
  | 'AGENT_REASONING'
  | 'AGENT_PROGRESS'
  | 'AGENT_ERROR'
  | 'AGENT_COLLABORATION'
  // Task events
  | 'TASK_CREATED'
  | 'TASK_STARTED'
  | 'TASK_PROGRESS'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'TASK_APPROVAL_REQUIRED'
  // Acknowledgment
  | 'ACK'
  | 'NACK';

export type StreamType =
  | 'browser'
  | 'terminal'
  | 'file'
  | 'agent'
  | 'task'
  | 'all';

export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: string;
  sessionId: string;
  sequence: number;
  correlationId?: string;
  payload: Record<string, unknown>;
  metadata?: {
    agentId?: string;
    taskId?: string;
    priority?: Priority;
    requiresAck?: boolean;
    compression?: 'none' | 'gzip' | 'lz4' | 'zstd';
    chunk?: {
      index: number;
      total: number;
      hash: string;
    };
  };
}

export interface SubscriptionTarget {
  stream: StreamType;
  filter?: {
    agentId?: string;
    taskId?: string;
    sessionId?: string;
  };
  events?: MessageType[];
  throttleMs?: number;
  includeHistory?: boolean;
  historyDurationMs?: number;
}

export interface ClientConfig {
  url: string;
  token: string;
  sessionId?: string;
  reconnection?: {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterMs: number;
    maxAttempts: number;
  };
  compression?: {
    enabled: boolean;
    algorithm: 'gzip' | 'lz4' | 'zstd';
  };
  heartbeat?: {
    intervalMs: number;
    timeoutMs: number;
  };
  batching?: {
    enabled: boolean;
    maxSize: number;
    maxDelayMs: number;
  };
}

export interface StreamingMetrics {
  uptimeMs: number;
  messagesReceived: number;
  bytesReceived: number;
  messagesPerSecond: number;
  rttMs: number;
  packetLossRate: number;
  reconnectionCount: number;
  lastReconnection?: Date;
  queueDepth: number;
  throttled: boolean;
}

export interface Subscription {
  id: string;
  target: SubscriptionTarget;
  active: boolean;
  createdAt: Date;
}

// ============================================================================
// STREAMING CLIENT IMPLEMENTATION
// ============================================================================

export class ExecutionStreamingClient extends EventEmitter {
  private config: Required<ClientConfig>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private sessionId: string;
  private sequence: number = 0;
  private lastReceivedSequence: number = 0;

  // Subscriptions
  private subscriptions: Map<string, Subscription> = new Map();

  // Reconnection state
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTime: number = 0;
  private lastPongTime: number = 0;

  // Metrics
  private connectTime: number = 0;
  private messageCount: number = 0;
  private byteCount: number = 0;
  private rttSamples: number[] = [];

  // Message queue for batching
  private messageQueue: BaseMessage[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  // Pending acknowledgments
  private pendingAcks: Map<string, {
    message: BaseMessage;
    timeout: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = new Map();

  constructor(config: ClientConfig) {
    super();

    // Apply defaults
    this.config = {
      url: config.url,
      token: config.token,
      sessionId: config.sessionId || uuid(),
      reconnection: {
        enabled: true,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2.0,
        jitterMs: 1000,
        maxAttempts: 10,
        ...config.reconnection
      },
      compression: {
        enabled: false,
        algorithm: 'zstd',
        ...config.compression
      },
      heartbeat: {
        intervalMs: 30000,
        timeoutMs: 10000,
        ...config.heartbeat
      },
      batching: {
        enabled: true,
        maxSize: 50,
        maxDelayMs: 100,
        ...config.batching
      }
    };

    this.sessionId = this.config.sessionId;
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.config.url);
        url.searchParams.set('session', this.sessionId);
        url.searchParams.set('version', '1');

        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          this.connectTime = Date.now();
          this.setState('authenticating');
          this.sendAuthentication();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[StreamingClient] WebSocket error:', error);
          this.emit('error', error);
        };

        this.ws.onclose = (event) => {
          this.handleClose(event);
        };

        // Wait for CONNECTION_ACK
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

      } catch (error) {
        this.setState('error');
        reject(error);
      }
    });
  }

  async disconnect(code: number = 1000, reason: string = 'Client disconnect'): Promise<void> {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.send({
        type: 'CONNECTION_CLOSE',
        payload: { code, reason }
      });

      this.ws.close(code, reason);
      this.ws = null;
    }

    this.setState('disconnected');
  }

  async reconnect(): Promise<void> {
    await this.disconnect(1000, 'Manual reconnect');
    await this.connect();
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  async subscribe(target: SubscriptionTarget): Promise<string> {
    const subscriptionId = uuid();

    const message: BaseMessage = {
      id: uuid(),
      type: 'SUBSCRIBE',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      sequence: this.sequence++,
      payload: {
        subscriptionId,
        ...target
      },
      metadata: {
        requiresAck: true
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'));
      }, 5000);

      this.once(`subscription:${subscriptionId}`, (ack: boolean) => {
        clearTimeout(timeout);
        if (ack) {
          this.subscriptions.set(subscriptionId, {
            id: subscriptionId,
            target,
            active: true,
            createdAt: new Date()
          });
          resolve(subscriptionId);
        } else {
          reject(new Error('Subscription rejected'));
        }
      });

      this.send(message);
    });
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    this.send({
      type: 'UNSUBSCRIBE',
      payload: { subscriptionId }
    });

    this.subscriptions.delete(subscriptionId);
  }

  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ============================================================================
  // STATE & METRICS
  // ============================================================================

  getState(): ConnectionState {
    return this.state;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSequence(): number {
    return this.lastReceivedSequence;
  }

  getMetrics(): StreamingMetrics {
    const now = Date.now();
    const uptimeMs = this.connectTime > 0 ? now - this.connectTime : 0;
    const avgRtt = this.rttSamples.length > 0
      ? this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length
      : 0;

    return {
      uptimeMs,
      messagesReceived: this.messageCount,
      bytesReceived: this.byteCount,
      messagesPerSecond: uptimeMs > 0 ? (this.messageCount / uptimeMs) * 1000 : 0,
      rttMs: avgRtt,
      packetLossRate: 0, // Would need to track this separately
      reconnectionCount: this.reconnectAttempts,
      lastReconnection: this.reconnectAttempts > 0 ? new Date() : undefined,
      queueDepth: this.messageQueue.length,
      throttled: false
    };
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const message: BaseMessage = typeof data === 'string'
        ? JSON.parse(data)
        : this.decodeMessage(data as ArrayBuffer);

      // Update metrics
      this.messageCount++;
      this.byteCount += typeof data === 'string' ? data.length : (data as ArrayBuffer).byteLength;
      this.lastReceivedSequence = message.sequence;

      // Handle by type
      switch (message.type) {
        case 'CONNECTION_ACK':
          this.handleConnectionAck(message);
          break;

        case 'CONNECTION_ERROR':
          this.handleConnectionError(message);
          break;

        case 'PING':
          this.handlePing(message);
          break;

        case 'PONG':
          this.handlePong(message);
          break;

        case 'SUBSCRIPTION_ACK':
          this.handleSubscriptionAck(message);
          break;

        case 'SUBSCRIPTION_ERROR':
          this.handleSubscriptionError(message);
          break;

        case 'ACK':
          this.handleAck(message);
          break;

        case 'NACK':
          this.handleNack(message);
          break;

        default:
          // Emit typed event for listeners
          this.emit(message.type, message);
          // Also emit generic 'message' event
          this.emit('message', message);
          break;
      }

    } catch (error) {
      console.error('[StreamingClient] Failed to handle message:', error);
      this.emit('error', error);
    }
  }

  private handleConnectionAck(message: BaseMessage): void {
    this.setState('connected');
    this.startHeartbeat();
    this.reconnectAttempts = 0;
    this.emit('connected', message.payload);
  }

  private handleConnectionError(message: BaseMessage): void {
    this.setState('error');
    this.emit('error', new Error(message.payload.message as string));
  }

  private handlePing(message: BaseMessage): void {
    this.send({
      type: 'PONG',
      payload: {
        echoTime: (message.payload as any).serverTime,
        clientTime: Date.now()
      }
    });
  }

  private handlePong(message: BaseMessage): void {
    this.lastPongTime = Date.now();
    const rtt = this.lastPongTime - this.lastPingTime;
    this.rttSamples.push(rtt);

    // Keep only last 10 samples
    if (this.rttSamples.length > 10) {
      this.rttSamples.shift();
    }
  }

  private handleSubscriptionAck(message: BaseMessage): void {
    const subscriptionId = message.payload.subscriptionId as string;
    this.emit(`subscription:${subscriptionId}`, true);
  }

  private handleSubscriptionError(message: BaseMessage): void {
    const subscriptionId = message.payload.subscriptionId as string;
    this.emit(`subscription:${subscriptionId}`, false);
  }

  private handleAck(message: BaseMessage): void {
    const correlationId = message.correlationId;
    if (correlationId) {
      const pending = this.pendingAcks.get(correlationId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(message.payload);
        this.pendingAcks.delete(correlationId);
      }
    }
  }

  private handleNack(message: BaseMessage): void {
    const correlationId = message.correlationId;
    if (correlationId) {
      const pending = this.pendingAcks.get(correlationId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message.payload.reason as string));
        this.pendingAcks.delete(correlationId);
      }
    }
  }

  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================

  private send(message: Partial<BaseMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[StreamingClient] Cannot send, not connected');
      return;
    }

    const fullMessage: BaseMessage = {
      id: uuid(),
      type: message.type || 'ACK',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      sequence: this.sequence++,
      payload: message.payload || {},
      ...message
    };

    if (this.config.batching.enabled && !this.isUrgentMessage(fullMessage)) {
      this.queueMessage(fullMessage);
    } else {
      this.sendImmediate(fullMessage);
    }
  }

  private sendImmediate(message: BaseMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message);
      this.ws.send(data);
    }
  }

  private queueMessage(message: BaseMessage): void {
    this.messageQueue.push(message);

    if (this.messageQueue.length >= this.config.batching.maxSize) {
      this.flushQueue();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushQueue();
      }, this.config.batching.maxDelayMs);
    }
  }

  private flushQueue(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.messageQueue.length === 0) {
      return;
    }

    // Send all queued messages
    const messages = this.messageQueue.splice(0, this.messageQueue.length);
    for (const message of messages) {
      this.sendImmediate(message);
    }
  }

  private isUrgentMessage(message: BaseMessage): boolean {
    const urgentTypes: MessageType[] = [
      'CONNECTION_AUTH',
      'CONNECTION_CLOSE',
      'PONG',
      'AGENT_ERROR'
    ];
    return urgentTypes.includes(message.type) ||
           message.metadata?.priority === 'critical';
  }

  private sendAuthentication(): void {
    this.send({
      type: 'CONNECTION_AUTH',
      payload: {
        token: this.config.token,
        lastSequence: this.lastReceivedSequence,
        capabilities: this.config.compression.enabled
          ? ['compression', 'delta', 'batching']
          : ['batching']
      }
    });
  }

  // ============================================================================
  // HEARTBEAT
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'connected') {
        return;
      }

      // Check if we missed a pong
      if (this.lastPingTime > 0 &&
          this.lastPongTime < this.lastPingTime &&
          Date.now() - this.lastPingTime > this.config.heartbeat.timeoutMs) {
        console.warn('[StreamingClient] Heartbeat timeout, reconnecting...');
        this.handleClose({ code: 4000, reason: 'Heartbeat timeout' } as CloseEvent);
        return;
      }

      // Send ping
      this.lastPingTime = Date.now();
      this.send({
        type: 'PING',
        payload: {
          serverTime: this.lastPingTime
        }
      });
    }, this.config.heartbeat.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================================================
  // RECONNECTION
  // ============================================================================

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();

    const shouldReconnect = this.config.reconnection.enabled &&
                           this.reconnectAttempts < this.config.reconnection.maxAttempts &&
                           !this.isNoReconnectCode(event.code);

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
      this.emit('disconnected', { code: event.code, reason: event.reason });
    }
  }

  private isNoReconnectCode(code: number): boolean {
    const noReconnectCodes = [1000, 1001, 4001, 4003];
    return noReconnectCodes.includes(code);
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');

    const delay = this.calculateReconnectDelay();
    console.log(`[StreamingClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();

        // Restore subscriptions
        for (const subscription of this.subscriptions.values()) {
          await this.subscribe(subscription.target);
        }
      } catch (error) {
        console.error('[StreamingClient] Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private calculateReconnectDelay(): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier, jitterMs } = this.config.reconnection;

    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, this.reconnectAttempts);
    const jitter = Math.random() * jitterMs;
    const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

    return Math.floor(delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private setState(state: ConnectionState): void {
    const previousState = this.state;
    this.state = state;

    if (previousState !== state) {
      this.emit('stateChange', { from: previousState, to: state });
    }
  }

  private decodeMessage(buffer: ArrayBuffer): BaseMessage {
    // For compressed binary messages
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    return JSON.parse(json);
  }
}

// ============================================================================
// STREAMING EVENT BUILDERS
// ============================================================================

/**
 * Helper class for building streaming events (server-side use)
 */
export class StreamingEventBuilder {
  private sessionId: string;
  private sequence: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  browserScreenshot(payload: {
    url: string;
    title: string;
    imageData: string;
    format: 'png' | 'jpeg' | 'webp';
    width: number;
    height: number;
  }): BaseMessage {
    return this.build('BROWSER_SCREENSHOT', {
      id: uuid(),
      capturedAt: new Date().toISOString(),
      url: payload.url,
      title: payload.title,
      imageData: payload.imageData,
      format: payload.format,
      dimensions: {
        width: payload.width,
        height: payload.height,
        devicePixelRatio: 1
      },
      viewport: {
        width: payload.width,
        height: payload.height,
        scrollX: 0,
        scrollY: 0,
        pageWidth: payload.width,
        pageHeight: payload.height
      },
      sizeBytes: payload.imageData.length,
      isDelta: false
    });
  }

  agentStateChange(payload: {
    agentId: string;
    agentName: string;
    agentType: string;
    fromState: string;
    toState: string;
    reason: string;
    taskId?: string;
  }): BaseMessage {
    return this.build('AGENT_STATE_CHANGE', payload, {
      agentId: payload.agentId,
      taskId: payload.taskId,
      priority: 'high'
    });
  }

  agentReasoning(payload: {
    agentId: string;
    thoughtType: string;
    content: string;
    confidence?: number;
    taskId?: string;
  }): BaseMessage {
    return this.build('AGENT_REASONING', {
      id: uuid(),
      agentId: payload.agentId,
      thoughtType: payload.thoughtType,
      content: payload.content,
      confidence: payload.confidence,
      depth: 0,
      ledToAction: false,
      visibility: 'user'
    }, {
      agentId: payload.agentId,
      taskId: payload.taskId
    });
  }

  terminalOutput(payload: {
    commandId: string;
    chunkId: number;
    data: string;
    isStderr?: boolean;
    isComplete?: boolean;
    elapsedMs: number;
  }): BaseMessage {
    return this.build(
      payload.isStderr ? 'TERMINAL_STDERR' : 'TERMINAL_STDOUT',
      {
        commandId: payload.commandId,
        chunkId: payload.chunkId,
        data: payload.data,
        plainText: this.stripAnsi(payload.data),
        endsWithNewline: payload.data.endsWith('\n'),
        elapsedMs: payload.elapsedMs,
        byteOffset: 0,
        isComplete: payload.isComplete || false
      },
      { priority: 'high' }
    );
  }

  agentProgress(payload: {
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
  }): BaseMessage {
    return this.build('AGENT_PROGRESS', {
      id: uuid(),
      ...payload,
      visualizationType: 'phased'
    }, {
      agentId: payload.agentId,
      taskId: payload.taskId
    });
  }

  fileCreate(payload: {
    path: string;
    filename: string;
    content?: string;
    sizeBytes: number;
    language?: string;
    agentId?: string;
    taskId?: string;
    reason?: string;
  }): BaseMessage {
    const directory = payload.path.substring(0, payload.path.lastIndexOf('/'));
    const extension = payload.filename.includes('.')
      ? payload.filename.substring(payload.filename.lastIndexOf('.'))
      : undefined;

    return this.build('FILE_CREATE', {
      id: uuid(),
      path: payload.path,
      filename: payload.filename,
      directory,
      extension,
      fileType: this.detectFileType(extension || ''),
      language: payload.language,
      content: payload.content,
      truncated: false,
      sizeBytes: payload.sizeBytes,
      encoding: 'utf-8',
      context: payload.agentId ? {
        agentId: payload.agentId,
        taskId: payload.taskId || '',
        reason: payload.reason || 'Creating file'
      } : undefined
    }, {
      agentId: payload.agentId,
      taskId: payload.taskId
    });
  }

  private build(
    type: MessageType,
    payload: Record<string, unknown>,
    metadata?: Partial<BaseMessage['metadata']>
  ): BaseMessage {
    return {
      id: uuid(),
      type,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      sequence: this.sequence++,
      payload,
      metadata: {
        priority: 'normal',
        requiresAck: false,
        compression: 'none',
        ...metadata
      }
    };
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private detectFileType(extension: string): string {
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h'];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const docExtensions = ['.md', '.txt', '.doc', '.docx'];

    if (codeExtensions.includes(extension)) return 'code';
    if (imageExtensions.includes(extension)) return 'image';
    if (docExtensions.includes(extension)) return 'document';
    if (extension === '.pdf') return 'pdf';
    if (extension === '.json' || extension === '.yaml' || extension === '.yml') return 'text';

    return 'unknown';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ExecutionStreamingClient;
