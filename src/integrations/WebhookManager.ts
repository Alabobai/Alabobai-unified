/**
 * Webhook Manager - Custom Webhooks for Alabobai Integration Hub
 * Handles webhook registration, delivery, retries, and verification
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type WebhookEventType =
  | 'integration.connected'
  | 'integration.disconnected'
  | 'integration.error'
  | 'data.sync.started'
  | 'data.sync.completed'
  | 'data.sync.failed'
  | 'data.created'
  | 'data.updated'
  | 'data.deleted'
  | 'action.triggered'
  | 'action.completed'
  | 'action.failed'
  | 'rate_limit.warning'
  | 'rate_limit.exceeded'
  | 'credential.expiring'
  | 'credential.expired'
  | '*'; // Wildcard for all events

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  integrationIds?: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  retryPolicy: RetryPolicy;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  payload: WebhookPayload;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  response?: {
    statusCode: number;
    body?: string;
    duration: number;
  };
  error?: string;
  createdAt: number;
}

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: number;
  integrationId?: string;
  integrationName?: string;
  userId?: string;
  data: Record<string, unknown>;
}

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  duration: number;
  error?: string;
}

export interface WebhookStats {
  webhookId: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageLatency: number;
  lastDeliveryAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
}

// ============================================================================
// WEBHOOK MANAGER CLASS
// ============================================================================

export class WebhookManager extends EventEmitter {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private stats: Map<string, WebhookStats> = new Map();
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();
  private signingKey: string;

  private readonly DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    backoffMultiplier: 2
  };

  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  constructor(config?: { signingKey?: string }) {
    super();
    this.signingKey = config?.signingKey || crypto.randomBytes(32).toString('hex');
  }

  // ==========================================================================
  // WEBHOOK REGISTRATION
  // ==========================================================================

  registerWebhook(options: {
    url: string;
    events: WebhookEventType[];
    integrationIds?: string[];
    secret?: string;
    retryPolicy?: Partial<RetryPolicy>;
    headers?: Record<string, string>;
    timeout?: number;
    metadata?: Record<string, unknown>;
  }): WebhookConfig {
    const id = this.generateId();
    const secret = options.secret || crypto.randomBytes(32).toString('hex');

    const webhook: WebhookConfig = {
      id,
      url: options.url,
      secret,
      events: options.events,
      integrationIds: options.integrationIds,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: options.metadata,
      retryPolicy: {
        ...this.DEFAULT_RETRY_POLICY,
        ...options.retryPolicy
      },
      headers: options.headers,
      timeout: options.timeout
    };

    this.webhooks.set(id, webhook);
    this.initializeStats(id);

    this.emit('webhook_registered', { webhookId: id, url: options.url });

    return webhook;
  }

  updateWebhook(
    webhookId: string,
    updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt' | 'secret'>>
  ): WebhookConfig {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const updated: WebhookConfig = {
      ...webhook,
      ...updates,
      updatedAt: Date.now()
    };

    this.webhooks.set(webhookId, updated);
    this.emit('webhook_updated', { webhookId });

    return updated;
  }

  deleteWebhook(webhookId: string): void {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // Cancel any pending retries
    const retryTimeout = this.retryQueue.get(webhookId);
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      this.retryQueue.delete(webhookId);
    }

    this.webhooks.delete(webhookId);
    this.stats.delete(webhookId);

    this.emit('webhook_deleted', { webhookId });
  }

  getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  listWebhooks(options?: {
    active?: boolean;
    eventType?: WebhookEventType;
    integrationId?: string;
  }): WebhookConfig[] {
    let webhooks = Array.from(this.webhooks.values());

    if (options?.active !== undefined) {
      webhooks = webhooks.filter(w => w.active === options.active);
    }

    if (options?.eventType) {
      webhooks = webhooks.filter(
        w => w.events.includes(options.eventType!) || w.events.includes('*')
      );
    }

    if (options?.integrationId) {
      webhooks = webhooks.filter(
        w => !w.integrationIds || w.integrationIds.includes(options.integrationId!)
      );
    }

    return webhooks;
  }

  rotateSecret(webhookId: string): string {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const newSecret = crypto.randomBytes(32).toString('hex');
    webhook.secret = newSecret;
    webhook.updatedAt = Date.now();

    this.webhooks.set(webhookId, webhook);
    this.emit('webhook_secret_rotated', { webhookId });

    return newSecret;
  }

  // ==========================================================================
  // EVENT DISPATCHING
  // ==========================================================================

  async dispatch(
    eventType: WebhookEventType,
    data: Record<string, unknown>,
    options?: {
      integrationId?: string;
      integrationName?: string;
      userId?: string;
    }
  ): Promise<void> {
    const payload: WebhookPayload = {
      id: this.generateId(),
      type: eventType,
      timestamp: Date.now(),
      integrationId: options?.integrationId,
      integrationName: options?.integrationName,
      userId: options?.userId,
      data
    };

    // Find matching webhooks
    const matchingWebhooks = this.listWebhooks({
      active: true,
      eventType,
      integrationId: options?.integrationId
    });

    // Dispatch to all matching webhooks
    const deliveryPromises = matchingWebhooks.map(webhook =>
      this.deliverPayload(webhook, payload)
    );

    await Promise.allSettled(deliveryPromises);

    this.emit('event_dispatched', {
      eventType,
      payloadId: payload.id,
      webhookCount: matchingWebhooks.length
    });
  }

  async dispatchBatch(
    events: Array<{
      eventType: WebhookEventType;
      data: Record<string, unknown>;
      integrationId?: string;
      integrationName?: string;
      userId?: string;
    }>
  ): Promise<void> {
    await Promise.all(
      events.map(event =>
        this.dispatch(event.eventType, event.data, {
          integrationId: event.integrationId,
          integrationName: event.integrationName,
          userId: event.userId
        })
      )
    );
  }

  // ==========================================================================
  // DELIVERY HANDLING
  // ==========================================================================

  private async deliverPayload(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: this.generateId(),
      webhookId: webhook.id,
      eventType: payload.type,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now()
    };

    this.deliveries.set(delivery.id, delivery);

    await this.attemptDelivery(delivery, webhook);

    return delivery;
  }

  private async attemptDelivery(
    delivery: WebhookDelivery,
    webhook: WebhookConfig
  ): Promise<void> {
    delivery.attempts++;
    delivery.lastAttemptAt = Date.now();
    delivery.status = 'retrying';

    const result = await this.sendRequest(webhook, delivery.payload);

    if (result.success) {
      delivery.status = 'delivered';
      delivery.response = {
        statusCode: result.statusCode!,
        duration: result.duration
      };
      this.updateStats(webhook.id, true, result.duration);
      this.emit('delivery_success', { deliveryId: delivery.id, webhookId: webhook.id });
    } else {
      delivery.error = result.error;
      delivery.response = result.statusCode
        ? { statusCode: result.statusCode, duration: result.duration }
        : undefined;

      if (delivery.attempts < webhook.retryPolicy.maxRetries) {
        // Schedule retry
        const delay = this.calculateRetryDelay(delivery.attempts, webhook.retryPolicy);
        delivery.nextRetryAt = Date.now() + delay;
        delivery.status = 'retrying';

        const timeout = setTimeout(() => {
          this.attemptDelivery(delivery, webhook);
        }, delay);

        this.retryQueue.set(delivery.id, timeout);

        this.emit('delivery_retry_scheduled', {
          deliveryId: delivery.id,
          webhookId: webhook.id,
          attempt: delivery.attempts,
          nextRetryAt: delivery.nextRetryAt
        });
      } else {
        delivery.status = 'failed';
        this.updateStats(webhook.id, false, result.duration);
        this.emit('delivery_failed', {
          deliveryId: delivery.id,
          webhookId: webhook.id,
          error: result.error
        });
      }
    }

    this.deliveries.set(delivery.id, delivery);
  }

  private async sendRequest(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const body = JSON.stringify(payload);
    const signature = this.generateSignature(body, webhook.secret);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeout || this.DEFAULT_TIMEOUT);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': payload.timestamp.toString(),
          'X-Event-Type': payload.type,
          'User-Agent': 'Alabobai-Integration-Hub/1.0',
          ...webhook.headers
        },
        body,
        signal: controller.signal
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        return { success: true, statusCode: response.status, duration };
      } else {
        const responseBody = await response.text().catch(() => '');
        return {
          success: false,
          statusCode: response.status,
          duration,
          error: `HTTP ${response.status}: ${responseBody.slice(0, 200)}`
        };
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        duration,
        error: errorMessage.includes('aborted') ? 'Request timeout' : errorMessage
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
    const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
    // Add jitter (10% random variation)
    const jitter = delay * 0.1 * Math.random();
    return Math.min(delay + jitter, policy.maxDelayMs);
  }

  // ==========================================================================
  // SIGNATURE GENERATION & VERIFICATION
  // ==========================================================================

  generateSignature(payload: string, secret: string): string {
    const timestamp = Date.now().toString();
    const signaturePayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  verifySignature(
    payload: string,
    signature: string,
    secret: string,
    toleranceSeconds = 300
  ): boolean {
    try {
      const parts = signature.split(',');
      const timestampPart = parts.find(p => p.startsWith('t='));
      const signaturePart = parts.find(p => p.startsWith('v1='));

      if (!timestampPart || !signaturePart) return false;

      const timestamp = parseInt(timestampPart.slice(2));
      const receivedSignature = signaturePart.slice(3);

      // Check timestamp tolerance
      const now = Date.now();
      if (Math.abs(now - timestamp) > toleranceSeconds * 1000) {
        return false;
      }

      // Verify signature
      const signaturePayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signaturePayload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // DELIVERY MANAGEMENT
  // ==========================================================================

  getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  listDeliveries(options?: {
    webhookId?: string;
    status?: WebhookDelivery['status'];
    eventType?: WebhookEventType;
    since?: number;
    limit?: number;
  }): WebhookDelivery[] {
    let deliveries = Array.from(this.deliveries.values());

    if (options?.webhookId) {
      deliveries = deliveries.filter(d => d.webhookId === options.webhookId);
    }

    if (options?.status) {
      deliveries = deliveries.filter(d => d.status === options.status);
    }

    if (options?.eventType) {
      deliveries = deliveries.filter(d => d.eventType === options.eventType);
    }

    if (options?.since) {
      deliveries = deliveries.filter(d => d.createdAt >= options.since!);
    }

    // Sort by creation time, newest first
    deliveries.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      deliveries = deliveries.slice(0, options.limit);
    }

    return deliveries;
  }

  async retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    if (delivery.status === 'delivered') {
      throw new Error('Cannot retry delivered webhook');
    }

    const webhook = this.webhooks.get(delivery.webhookId);
    if (!webhook) {
      throw new Error('Webhook no longer exists');
    }

    // Cancel any existing retry
    const existingRetry = this.retryQueue.get(deliveryId);
    if (existingRetry) {
      clearTimeout(existingRetry);
      this.retryQueue.delete(deliveryId);
    }

    // Reset attempts for manual retry
    delivery.attempts = 0;
    await this.attemptDelivery(delivery, webhook);

    return delivery;
  }

  cancelRetry(deliveryId: string): void {
    const timeout = this.retryQueue.get(deliveryId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryQueue.delete(deliveryId);

      const delivery = this.deliveries.get(deliveryId);
      if (delivery) {
        delivery.status = 'failed';
        delivery.error = 'Retry cancelled';
        this.deliveries.set(deliveryId, delivery);
      }

      this.emit('retry_cancelled', { deliveryId });
    }
  }

  purgeDeliveries(options: {
    olderThan?: number;
    status?: WebhookDelivery['status'];
    webhookId?: string;
  }): number {
    let count = 0;
    const now = Date.now();

    for (const [id, delivery] of this.deliveries) {
      let shouldDelete = true;

      if (options.olderThan && delivery.createdAt > now - options.olderThan) {
        shouldDelete = false;
      }

      if (options.status && delivery.status !== options.status) {
        shouldDelete = false;
      }

      if (options.webhookId && delivery.webhookId !== options.webhookId) {
        shouldDelete = false;
      }

      if (shouldDelete) {
        // Cancel any pending retry
        const timeout = this.retryQueue.get(id);
        if (timeout) {
          clearTimeout(timeout);
          this.retryQueue.delete(id);
        }

        this.deliveries.delete(id);
        count++;
      }
    }

    return count;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  private initializeStats(webhookId: string): void {
    this.stats.set(webhookId, {
      webhookId,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageLatency: 0
    });
  }

  private updateStats(webhookId: string, success: boolean, latency: number): void {
    const stats = this.stats.get(webhookId);
    if (!stats) return;

    stats.totalDeliveries++;
    if (success) {
      stats.successfulDeliveries++;
      stats.lastSuccessAt = Date.now();
    } else {
      stats.failedDeliveries++;
      stats.lastFailureAt = Date.now();
    }
    stats.lastDeliveryAt = Date.now();

    // Update rolling average latency
    stats.averageLatency =
      (stats.averageLatency * (stats.totalDeliveries - 1) + latency) / stats.totalDeliveries;

    this.stats.set(webhookId, stats);
  }

  getStats(webhookId: string): WebhookStats | undefined {
    return this.stats.get(webhookId);
  }

  getAllStats(): WebhookStats[] {
    return Array.from(this.stats.values());
  }

  getAggregateStats(): {
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successRate: number;
    averageLatency: number;
    pendingRetries: number;
  } {
    const allStats = this.getAllStats();
    const totalDeliveries = allStats.reduce((sum, s) => sum + s.totalDeliveries, 0);
    const successfulDeliveries = allStats.reduce((sum, s) => sum + s.successfulDeliveries, 0);
    const totalLatency = allStats.reduce((sum, s) => sum + s.averageLatency * s.totalDeliveries, 0);

    return {
      totalWebhooks: this.webhooks.size,
      activeWebhooks: Array.from(this.webhooks.values()).filter(w => w.active).length,
      totalDeliveries,
      successRate: totalDeliveries > 0 ? successfulDeliveries / totalDeliveries : 1,
      averageLatency: totalDeliveries > 0 ? totalLatency / totalDeliveries : 0,
      pendingRetries: this.retryQueue.size
    };
  }

  // ==========================================================================
  // TESTING HELPERS
  // ==========================================================================

  async testWebhook(webhookId: string): Promise<DeliveryResult> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const testPayload: WebhookPayload = {
      id: this.generateId(),
      type: 'integration.connected',
      timestamp: Date.now(),
      data: {
        test: true,
        message: 'This is a test webhook delivery from Alabobai Integration Hub'
      }
    };

    return this.sendRequest(webhook, testPayload);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  private generateId(): string {
    return `${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
  }

  shutdown(): void {
    // Cancel all pending retries
    for (const timeout of this.retryQueue.values()) {
      clearTimeout(timeout);
    }
    this.retryQueue.clear();

    this.emit('shutdown');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createWebhookManager(config?: { signingKey?: string }): WebhookManager {
  return new WebhookManager(config);
}

export default WebhookManager;
