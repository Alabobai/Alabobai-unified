/**
 * Alabobai Integration Hub
 * Main hub for managing 500+ integrations with OAuth, rate limiting, and bidirectional sync
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  IntegrationRegistry,
  IntegrationDefinition,
  IntegrationCategory,
  integrationRegistry
} from './IntegrationRegistry.js';
import { WebhookManager, createWebhookManager, WebhookEventType } from './WebhookManager.js';
import { GoogleConnector, createGoogleConnector } from './connectors/GoogleConnector.js';
import { GitHubConnector, createGitHubConnector } from './connectors/GitHubConnector.js';
import { SlackConnector, createSlackConnector } from './connectors/SlackConnector.js';
import { PlaidConnector, createPlaidConnector, PlaidEnvironment } from './connectors/PlaidConnector.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HubConfig {
  encryptionKey: string;
  webhookSigningKey?: string;
  defaultTimeout?: number;
  maxConcurrentSyncs?: number;
  rateLimitBuffer?: number;
}

export interface IntegrationCredentials {
  integrationId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string[];
  metadata?: Record<string, unknown>;
  encryptedAt: number;
}

export interface OAuthState {
  integrationId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

export interface RateLimitState {
  integrationId: string;
  userId: string;
  requestsThisMinute: number;
  requestsThisHour: number;
  requestsThisDay: number;
  minuteResetAt: number;
  hourResetAt: number;
  dayResetAt: number;
  isLimited: boolean;
  limitedUntil?: number;
}

export interface SyncConfig {
  integrationId: string;
  userId: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  resources: string[];
  interval?: number;
  lastSync?: number;
  cursor?: string;
  options?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  direction: 'inbound' | 'outbound';
  resources: string;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  errors: Array<{ resource: string; error: string }>;
  cursor?: string;
  duration: number;
  timestamp: number;
}

export interface ConnectorInstance {
  type: string;
  connector: GoogleConnector | GitHubConnector | SlackConnector | PlaidConnector;
  createdAt: number;
}

export interface UnifiedAPIRequest {
  integrationId: string;
  userId: string;
  method: string;
  endpoint: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface UnifiedAPIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  rateLimitInfo?: {
    remaining: number;
    resetAt: number;
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// INTEGRATION HUB CLASS
// ============================================================================

export class IntegrationHub extends EventEmitter {
  private config: HubConfig;
  private registry: IntegrationRegistry;
  private webhookManager: WebhookManager;
  private credentials: Map<string, IntegrationCredentials> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();
  private syncConfigs: Map<string, SyncConfig> = new Map();
  private connectors: Map<string, ConnectorInstance> = new Map();
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeSyncs: Set<string> = new Set();

  constructor(config: HubConfig) {
    super();
    this.config = {
      defaultTimeout: 30000,
      maxConcurrentSyncs: 10,
      rateLimitBuffer: 0.9, // Use 90% of rate limit
      ...config
    };
    this.registry = integrationRegistry;
    this.webhookManager = createWebhookManager({ signingKey: config.webhookSigningKey });

    this.setupWebhookHandlers();
  }

  // ==========================================================================
  // INTEGRATION REGISTRY ACCESS
  // ==========================================================================

  getIntegration(integrationId: string): IntegrationDefinition | undefined {
    return this.registry.get(integrationId);
  }

  listIntegrations(options?: {
    category?: IntegrationCategory;
    search?: string;
  }): IntegrationDefinition[] {
    if (options?.category) {
      return this.registry.getByCategory(options.category);
    }
    if (options?.search) {
      return this.registry.search(options.search);
    }
    return this.registry.getAll();
  }

  getIntegrationCount(): number {
    return this.registry.getCount();
  }

  // ==========================================================================
  // OAUTH FLOW MANAGEMENT
  // ==========================================================================

  initiateOAuth(options: {
    integrationId: string;
    userId: string;
    redirectUri: string;
    scopes?: string[];
    metadata?: Record<string, unknown>;
  }): { authorizationUrl: string; state: string } {
    const integration = this.registry.get(options.integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${options.integrationId}`);
    }

    if (integration.authType !== 'oauth2') {
      throw new Error(`Integration ${options.integrationId} does not use OAuth`);
    }

    const stateId = this.generateStateId();
    const scopes = options.scopes || integration.scopes || [];

    const state: OAuthState = {
      integrationId: options.integrationId,
      userId: options.userId,
      redirectUri: options.redirectUri,
      scopes,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000, // 10 minutes
      metadata: options.metadata
    };

    this.oauthStates.set(stateId, state);

    // Get authorization URL based on integration
    const authUrl = this.buildAuthorizationUrl(integration, scopes, stateId, options.redirectUri);

    this.emit('oauth_initiated', {
      integrationId: options.integrationId,
      userId: options.userId,
      state: stateId
    });

    return { authorizationUrl: authUrl, state: stateId };
  }

  async completeOAuth(
    stateId: string,
    code: string
  ): Promise<{ integrationId: string; userId: string; credentials: IntegrationCredentials }> {
    const state = this.oauthStates.get(stateId);
    if (!state) {
      throw new Error('Invalid or expired OAuth state');
    }

    if (Date.now() > state.expiresAt) {
      this.oauthStates.delete(stateId);
      throw new Error('OAuth state expired');
    }

    const integration = this.registry.get(state.integrationId)!;
    const connector = this.getOrCreateConnector(state.integrationId, state.userId);

    let credentials: IntegrationCredentials;

    try {
      // Exchange code for tokens based on connector type
      const tokenData = await this.exchangeOAuthCode(connector, code);

      credentials = {
        integrationId: state.integrationId,
        userId: state.userId,
        accessToken: this.encrypt(tokenData.accessToken),
        refreshToken: tokenData.refreshToken ? this.encrypt(tokenData.refreshToken) : undefined,
        expiresAt: tokenData.expiresAt,
        scope: tokenData.scope || state.scopes,
        metadata: state.metadata,
        encryptedAt: Date.now()
      };

      // Store credentials
      const credentialKey = this.getCredentialKey(state.integrationId, state.userId);
      this.credentials.set(credentialKey, credentials);

      // Initialize rate limit state
      this.initializeRateLimit(state.integrationId, state.userId, integration.rateLimit);

      // Clean up OAuth state
      this.oauthStates.delete(stateId);

      this.emit('oauth_completed', {
        integrationId: state.integrationId,
        userId: state.userId
      });

      // Dispatch webhook
      await this.webhookManager.dispatch('integration.connected', {
        integrationId: state.integrationId,
        integrationName: integration.name,
        scopes: credentials.scope
      }, {
        integrationId: state.integrationId,
        integrationName: integration.name,
        userId: state.userId
      });

      return {
        integrationId: state.integrationId,
        userId: state.userId,
        credentials
      };
    } catch (error: unknown) {
      this.oauthStates.delete(stateId);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('oauth_failed', {
        integrationId: state.integrationId,
        userId: state.userId,
        error: errorMessage
      });

      throw error;
    }
  }

  private buildAuthorizationUrl(
    integration: IntegrationDefinition,
    scopes: string[],
    state: string,
    redirectUri: string
  ): string {
    // This would be expanded for each integration type
    const baseUrls: Record<string, string> = {
      'google-workspace': 'https://accounts.google.com/o/oauth2/v2/auth',
      'github': 'https://github.com/login/oauth/authorize',
      'slack': 'https://slack.com/oauth/v2/authorize',
      'microsoft-365': 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      'salesforce': 'https://login.salesforce.com/services/oauth2/authorize'
    };

    const baseUrl = baseUrls[integration.id] || `${integration.baseUrl}/oauth/authorize`;

    const params = new URLSearchParams({
      client_id: process.env[`${integration.id.toUpperCase().replace(/-/g, '_')}_CLIENT_ID`] || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  private async exchangeOAuthCode(
    connector: ConnectorInstance,
    code: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string[] }> {
    switch (connector.type) {
      case 'google':
        const googleCreds = await (connector.connector as GoogleConnector).exchangeCode(code);
        return {
          accessToken: googleCreds.accessToken,
          refreshToken: googleCreds.refreshToken,
          expiresAt: googleCreds.expiresAt,
          scope: googleCreds.scope
        };

      case 'github':
        const githubCreds = await (connector.connector as GitHubConnector).exchangeCode(code);
        return {
          accessToken: githubCreds.accessToken,
          expiresAt: githubCreds.expiresAt,
          scope: githubCreds.scope
        };

      case 'slack':
        const slackCreds = await (connector.connector as SlackConnector).exchangeCode(code);
        return {
          accessToken: slackCreds.accessToken,
          scope: slackCreds.scope
        };

      default:
        throw new Error(`Unsupported connector type: ${connector.type}`);
    }
  }

  // ==========================================================================
  // CREDENTIAL MANAGEMENT
  // ==========================================================================

  storeCredentials(
    integrationId: string,
    userId: string,
    credentials: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      scope?: string[];
      metadata?: Record<string, unknown>;
    }
  ): void {
    const stored: IntegrationCredentials = {
      integrationId,
      userId,
      accessToken: this.encrypt(credentials.accessToken),
      refreshToken: credentials.refreshToken ? this.encrypt(credentials.refreshToken) : undefined,
      expiresAt: credentials.expiresAt,
      scope: credentials.scope,
      metadata: credentials.metadata,
      encryptedAt: Date.now()
    };

    const key = this.getCredentialKey(integrationId, userId);
    this.credentials.set(key, stored);

    // Initialize rate limit
    const integration = this.registry.get(integrationId);
    if (integration) {
      this.initializeRateLimit(integrationId, userId, integration.rateLimit);
    }

    this.emit('credentials_stored', { integrationId, userId });
  }

  getCredentials(
    integrationId: string,
    userId: string
  ): IntegrationCredentials | undefined {
    const key = this.getCredentialKey(integrationId, userId);
    return this.credentials.get(key);
  }

  async refreshCredentials(
    integrationId: string,
    userId: string
  ): Promise<IntegrationCredentials> {
    const credentials = this.getCredentials(integrationId, userId);
    if (!credentials) {
      throw new Error('No credentials found');
    }

    if (!credentials.refreshToken) {
      throw new Error('No refresh token available');
    }

    const connector = this.getOrCreateConnector(integrationId, userId);

    // Refresh based on connector type
    switch (connector.type) {
      case 'google':
        const googleConnector = connector.connector as GoogleConnector;
        googleConnector.setCredentials({
          accessToken: this.decrypt(credentials.accessToken),
          refreshToken: this.decrypt(credentials.refreshToken),
          expiresAt: credentials.expiresAt || 0,
          scope: credentials.scope || [],
          tokenType: 'Bearer'
        });
        await googleConnector.refreshAccessToken();
        const newGoogleCreds = googleConnector.getCredentials()!;

        credentials.accessToken = this.encrypt(newGoogleCreds.accessToken);
        credentials.expiresAt = newGoogleCreds.expiresAt;
        credentials.encryptedAt = Date.now();
        break;

      default:
        throw new Error(`Refresh not supported for connector type: ${connector.type}`);
    }

    const key = this.getCredentialKey(integrationId, userId);
    this.credentials.set(key, credentials);

    this.emit('credentials_refreshed', { integrationId, userId });

    return credentials;
  }

  revokeCredentials(integrationId: string, userId: string): void {
    const key = this.getCredentialKey(integrationId, userId);
    this.credentials.delete(key);

    // Clean up connector
    const connectorKey = `${integrationId}:${userId}`;
    this.connectors.delete(connectorKey);

    // Clean up rate limit
    this.rateLimits.delete(key);

    // Cancel any syncs
    const syncKey = `${integrationId}:${userId}`;
    const interval = this.syncIntervals.get(syncKey);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(syncKey);
    }

    this.emit('credentials_revoked', { integrationId, userId });

    // Dispatch webhook
    const integration = this.registry.get(integrationId);
    this.webhookManager.dispatch('integration.disconnected', {
      integrationId,
      integrationName: integration?.name
    }, {
      integrationId,
      integrationName: integration?.name,
      userId
    });
  }

  isConnected(integrationId: string, userId: string): boolean {
    const credentials = this.getCredentials(integrationId, userId);
    if (!credentials) return false;

    // Check if credentials are expired
    if (credentials.expiresAt && Date.now() > credentials.expiresAt) {
      // Could have refresh token
      return !!credentials.refreshToken;
    }

    return true;
  }

  private getCredentialKey(integrationId: string, userId: string): string {
    return `${integrationId}:${userId}`;
  }

  // ==========================================================================
  // ENCRYPTION
  // ==========================================================================

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================

  private initializeRateLimit(
    integrationId: string,
    userId: string,
    limits: { requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number }
  ): void {
    const key = this.getCredentialKey(integrationId, userId);
    const now = Date.now();

    this.rateLimits.set(key, {
      integrationId,
      userId,
      requestsThisMinute: 0,
      requestsThisHour: 0,
      requestsThisDay: 0,
      minuteResetAt: now + 60000,
      hourResetAt: now + 3600000,
      dayResetAt: now + 86400000,
      isLimited: false
    });
  }

  checkRateLimit(integrationId: string, userId: string): {
    allowed: boolean;
    remaining: { minute: number; hour: number; day: number };
    resetAt: { minute: number; hour: number; day: number };
  } {
    const key = this.getCredentialKey(integrationId, userId);
    const state = this.rateLimits.get(key);
    const integration = this.registry.get(integrationId);

    if (!state || !integration) {
      return {
        allowed: true,
        remaining: { minute: 60, hour: 1000, day: 10000 },
        resetAt: { minute: Date.now() + 60000, hour: Date.now() + 3600000, day: Date.now() + 86400000 }
      };
    }

    const now = Date.now();
    const limits = integration.rateLimit;
    const buffer = this.config.rateLimitBuffer!;

    // Reset counters if periods have elapsed
    if (now >= state.minuteResetAt) {
      state.requestsThisMinute = 0;
      state.minuteResetAt = now + 60000;
    }
    if (now >= state.hourResetAt) {
      state.requestsThisHour = 0;
      state.hourResetAt = now + 3600000;
    }
    if (now >= state.dayResetAt) {
      state.requestsThisDay = 0;
      state.dayResetAt = now + 86400000;
    }

    const minuteRemaining = Math.floor(limits.requestsPerMinute * buffer) - state.requestsThisMinute;
    const hourRemaining = Math.floor(limits.requestsPerHour * buffer) - state.requestsThisHour;
    const dayRemaining = Math.floor(limits.requestsPerDay * buffer) - state.requestsThisDay;

    const allowed = minuteRemaining > 0 && hourRemaining > 0 && dayRemaining > 0;

    if (!allowed && !state.isLimited) {
      state.isLimited = true;
      state.limitedUntil = Math.min(state.minuteResetAt, state.hourResetAt, state.dayResetAt);

      this.emit('rate_limit_exceeded', { integrationId, userId, resetAt: state.limitedUntil });

      this.webhookManager.dispatch('rate_limit.exceeded', {
        integrationId,
        resetAt: state.limitedUntil,
        remaining: { minute: minuteRemaining, hour: hourRemaining, day: dayRemaining }
      }, { integrationId, userId });
    }

    // Emit warning at 80% usage
    if (!state.isLimited) {
      const minuteUsage = state.requestsThisMinute / limits.requestsPerMinute;
      const hourUsage = state.requestsThisHour / limits.requestsPerHour;
      const dayUsage = state.requestsThisDay / limits.requestsPerDay;

      if (minuteUsage >= 0.8 || hourUsage >= 0.8 || dayUsage >= 0.8) {
        this.webhookManager.dispatch('rate_limit.warning', {
          integrationId,
          usage: { minute: minuteUsage, hour: hourUsage, day: dayUsage }
        }, { integrationId, userId });
      }
    }

    this.rateLimits.set(key, state);

    return {
      allowed,
      remaining: {
        minute: Math.max(0, minuteRemaining),
        hour: Math.max(0, hourRemaining),
        day: Math.max(0, dayRemaining)
      },
      resetAt: {
        minute: state.minuteResetAt,
        hour: state.hourResetAt,
        day: state.dayResetAt
      }
    };
  }

  recordRequest(integrationId: string, userId: string): void {
    const key = this.getCredentialKey(integrationId, userId);
    const state = this.rateLimits.get(key);

    if (state) {
      state.requestsThisMinute++;
      state.requestsThisHour++;
      state.requestsThisDay++;
      this.rateLimits.set(key, state);
    }
  }

  // ==========================================================================
  // UNIFIED API
  // ==========================================================================

  async execute(request: UnifiedAPIRequest): Promise<UnifiedAPIResponse> {
    const { integrationId, userId, method, endpoint, params, body } = request;

    // Check credentials
    const credentials = this.getCredentials(integrationId, userId);
    if (!credentials) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check rate limit
    const rateLimit = this.checkRateLimit(integrationId, userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        rateLimitInfo: {
          remaining: Math.min(rateLimit.remaining.minute, rateLimit.remaining.hour),
          resetAt: Math.min(rateLimit.resetAt.minute, rateLimit.resetAt.hour)
        }
      };
    }

    // Refresh credentials if needed
    if (credentials.expiresAt && Date.now() > credentials.expiresAt - 60000) {
      try {
        await this.refreshCredentials(integrationId, userId);
      } catch {
        return { success: false, error: 'Failed to refresh credentials' };
      }
    }

    const integration = this.registry.get(integrationId);
    if (!integration) {
      return { success: false, error: 'Integration not found' };
    }

    try {
      // Build and execute request
      const accessToken = this.decrypt(credentials.accessToken);
      const url = `${integration.baseUrl}${endpoint}`;
      const queryParams = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';

      const response = await fetch(`${url}${queryParams}`, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      this.recordRequest(integrationId, userId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `API error: ${response.status}`,
          metadata: { statusCode: response.status, body: errorData }
        };
      }

      const data = await response.json();
      const newRateLimit = this.checkRateLimit(integrationId, userId);

      return {
        success: true,
        data,
        rateLimitInfo: {
          remaining: Math.min(newRateLimit.remaining.minute, newRateLimit.remaining.hour),
          resetAt: Math.min(newRateLimit.resetAt.minute, newRateLimit.resetAt.hour)
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  // ==========================================================================
  // BIDIRECTIONAL SYNC
  // ==========================================================================

  configureSyncConfig(config: SyncConfig): void {
    const key = `${config.integrationId}:${config.userId}`;
    this.syncConfigs.set(key, config);

    if (config.interval) {
      // Set up periodic sync
      const interval = setInterval(() => {
        this.performSync(config.integrationId, config.userId);
      }, config.interval);

      this.syncIntervals.set(key, interval);
    }

    this.emit('sync_configured', {
      integrationId: config.integrationId,
      userId: config.userId,
      direction: config.direction
    });
  }

  async performSync(integrationId: string, userId: string): Promise<SyncResult[]> {
    const key = `${integrationId}:${userId}`;
    const config = this.syncConfigs.get(key);

    if (!config) {
      throw new Error('Sync not configured');
    }

    if (this.activeSyncs.size >= this.config.maxConcurrentSyncs!) {
      throw new Error('Maximum concurrent syncs reached');
    }

    if (this.activeSyncs.has(key)) {
      throw new Error('Sync already in progress');
    }

    this.activeSyncs.add(key);
    const results: SyncResult[] = [];

    try {
      await this.webhookManager.dispatch('data.sync.started', {
        integrationId,
        direction: config.direction,
        resources: config.resources
      }, { integrationId, userId });

      for (const resource of config.resources) {
        if (config.direction === 'inbound' || config.direction === 'bidirectional') {
          const inboundResult = await this.syncInbound(integrationId, userId, resource, config);
          results.push(inboundResult);
        }

        if (config.direction === 'outbound' || config.direction === 'bidirectional') {
          const outboundResult = await this.syncOutbound(integrationId, userId, resource, config);
          results.push(outboundResult);
        }
      }

      // Update last sync time
      config.lastSync = Date.now();
      this.syncConfigs.set(key, config);

      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      await this.webhookManager.dispatch(
        totalErrors > 0 ? 'data.sync.completed' : 'data.sync.completed',
        {
          integrationId,
          results: results.map(r => ({
            direction: r.direction,
            resource: r.resources,
            items: r.itemsProcessed,
            errors: r.errors.length
          }))
        },
        { integrationId, userId }
      );

      this.emit('sync_completed', { integrationId, userId, results });

      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.webhookManager.dispatch('data.sync.failed', {
        integrationId,
        error: errorMessage
      }, { integrationId, userId });

      throw error;
    } finally {
      this.activeSyncs.delete(key);
    }
  }

  private async syncInbound(
    integrationId: string,
    userId: string,
    resource: string,
    config: SyncConfig
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const connector = this.getOrCreateConnector(integrationId, userId);
    const errors: Array<{ resource: string; error: string }> = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    try {
      // Implementation depends on connector type and resource
      // This is a generic structure
      switch (connector.type) {
        case 'google':
          if (resource === 'gmail') {
            const { added } = await (connector.connector as GoogleConnector).syncGmail();
            itemsProcessed = added.length;
            itemsCreated = added.length;
          } else if (resource === 'calendar') {
            const { events } = await (connector.connector as GoogleConnector).syncCalendar();
            itemsProcessed = events.length;
          } else if (resource === 'drive') {
            const { changes } = await (connector.connector as GoogleConnector).syncDrive();
            itemsProcessed = changes.length;
            itemsCreated = changes.filter(c => !c.removed && c.file).length;
          }
          break;

        // Add cases for other connectors
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ resource, error: errorMessage });
    }

    return {
      success: errors.length === 0,
      direction: 'inbound',
      resources: resource,
      itemsProcessed,
      itemsCreated,
      itemsUpdated,
      itemsDeleted: 0,
      errors,
      cursor: config.cursor,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    };
  }

  private async syncOutbound(
    integrationId: string,
    userId: string,
    resource: string,
    config: SyncConfig
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: Array<{ resource: string; error: string }> = [];
    let itemsProcessed = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    // Outbound sync would push local changes to the integration
    // Implementation depends on the specific use case

    return {
      success: errors.length === 0,
      direction: 'outbound',
      resources: resource,
      itemsProcessed,
      itemsCreated,
      itemsUpdated,
      itemsDeleted: 0,
      errors,
      cursor: config.cursor,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    };
  }

  cancelSync(integrationId: string, userId: string): void {
    const key = `${integrationId}:${userId}`;

    const interval = this.syncIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(key);
    }

    this.syncConfigs.delete(key);
    this.activeSyncs.delete(key);

    this.emit('sync_cancelled', { integrationId, userId });
  }

  getSyncStatus(integrationId: string, userId: string): {
    configured: boolean;
    lastSync?: number;
    isActive: boolean;
    config?: SyncConfig;
  } {
    const key = `${integrationId}:${userId}`;
    const config = this.syncConfigs.get(key);

    return {
      configured: !!config,
      lastSync: config?.lastSync,
      isActive: this.activeSyncs.has(key),
      config
    };
  }

  // ==========================================================================
  // CONNECTOR MANAGEMENT
  // ==========================================================================

  private getOrCreateConnector(integrationId: string, userId: string): ConnectorInstance {
    const key = `${integrationId}:${userId}`;
    let instance = this.connectors.get(key);

    if (!instance) {
      instance = this.createConnector(integrationId);
      this.connectors.set(key, instance);
    }

    // Initialize connector with credentials if available
    const credentials = this.getCredentials(integrationId, userId);
    if (credentials) {
      this.initializeConnector(instance, credentials);
    }

    return instance;
  }

  private createConnector(integrationId: string): ConnectorInstance {
    const envPrefix = integrationId.toUpperCase().replace(/-/g, '_');
    const clientId = process.env[`${envPrefix}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`] || '';
    const redirectUri = process.env[`${envPrefix}_REDIRECT_URI`] || '';

    switch (integrationId) {
      case 'google-workspace':
        return {
          type: 'google',
          connector: createGoogleConnector({ clientId, clientSecret, redirectUri }),
          createdAt: Date.now()
        };

      case 'github':
        return {
          type: 'github',
          connector: createGitHubConnector({
            clientId,
            clientSecret,
            redirectUri,
            webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
          }),
          createdAt: Date.now()
        };

      case 'slack':
        return {
          type: 'slack',
          connector: createSlackConnector({
            clientId,
            clientSecret,
            redirectUri,
            signingSecret: process.env.SLACK_SIGNING_SECRET || ''
          }),
          createdAt: Date.now()
        };

      case 'plaid':
        return {
          type: 'plaid',
          connector: createPlaidConnector({
            clientId,
            secret: clientSecret,
            environment: (process.env.PLAID_ENVIRONMENT || 'sandbox') as PlaidEnvironment
          }),
          createdAt: Date.now()
        };

      default:
        throw new Error(`No connector available for integration: ${integrationId}`);
    }
  }

  private initializeConnector(instance: ConnectorInstance, credentials: IntegrationCredentials): void {
    const accessToken = this.decrypt(credentials.accessToken);
    const refreshToken = credentials.refreshToken ? this.decrypt(credentials.refreshToken) : undefined;

    switch (instance.type) {
      case 'google':
        (instance.connector as GoogleConnector).setCredentials({
          accessToken,
          refreshToken: refreshToken || '',
          expiresAt: credentials.expiresAt || Date.now() + 3600000,
          scope: credentials.scope || [],
          tokenType: 'Bearer'
        });
        break;

      case 'github':
        (instance.connector as GitHubConnector).setCredentials({
          accessToken,
          tokenType: 'bearer',
          scope: credentials.scope || []
        });
        break;

      case 'slack':
        // Slack credentials structure is different
        (instance.connector as SlackConnector).setCredentials({
          accessToken,
          botUserId: credentials.metadata?.botUserId as string || '',
          teamId: credentials.metadata?.teamId as string || '',
          teamName: credentials.metadata?.teamName as string || '',
          scope: credentials.scope || [],
          tokenType: 'bearer',
          appId: credentials.metadata?.appId as string || ''
        });
        break;
    }
  }

  getConnector<T extends GoogleConnector | GitHubConnector | SlackConnector | PlaidConnector>(
    integrationId: string,
    userId: string
  ): T | undefined {
    const key = `${integrationId}:${userId}`;
    const instance = this.connectors.get(key);
    return instance?.connector as T | undefined;
  }

  // ==========================================================================
  // WEBHOOK MANAGEMENT
  // ==========================================================================

  getWebhookManager(): WebhookManager {
    return this.webhookManager;
  }

  registerWebhook(options: {
    url: string;
    events: WebhookEventType[];
    integrationIds?: string[];
    secret?: string;
  }): { id: string; secret: string } {
    const webhook = this.webhookManager.registerWebhook(options);
    return { id: webhook.id, secret: webhook.secret };
  }

  private setupWebhookHandlers(): void {
    this.webhookManager.on('delivery_failed', (event) => {
      this.emit('webhook_delivery_failed', event);
    });

    this.webhookManager.on('webhook_registered', (event) => {
      this.emit('webhook_registered', event);
    });
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  private generateStateId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  getStatus(): {
    integrations: {
      total: number;
      connected: number;
      categories: Record<string, number>;
    };
    syncs: {
      active: number;
      configured: number;
    };
    webhooks: {
      total: number;
      active: number;
    };
    rateLimits: {
      limited: number;
    };
  } {
    const connectedCount = this.credentials.size;
    const categories: Record<string, number> = {};

    for (const [key] of this.credentials) {
      const integrationId = key.split(':')[0];
      const integration = this.registry.get(integrationId);
      if (integration) {
        categories[integration.category] = (categories[integration.category] || 0) + 1;
      }
    }

    const limitedCount = Array.from(this.rateLimits.values()).filter(r => r.isLimited).length;

    const webhookStats = this.webhookManager.getAggregateStats();
    return {
      integrations: {
        total: this.registry.getCount(),
        connected: connectedCount,
        categories
      },
      syncs: {
        active: this.activeSyncs.size,
        configured: this.syncConfigs.size
      },
      webhooks: {
        total: webhookStats.totalWebhooks,
        active: webhookStats.activeWebhooks
      },
      rateLimits: {
        limited: limitedCount
      }
    };
  }

  shutdown(): void {
    // Cancel all syncs
    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();
    this.activeSyncs.clear();

    // Shutdown webhook manager
    this.webhookManager.shutdown();

    this.emit('shutdown');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createIntegrationHub(config: HubConfig): IntegrationHub {
  return new IntegrationHub(config);
}

export default IntegrationHub;
