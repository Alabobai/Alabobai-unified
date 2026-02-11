/**
 * Cloudflare Connector - DNS, SSL, CDN Management
 * API Token authentication with comprehensive zone management
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface CloudflareConfig {
  apiToken: string;
  accountId?: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated';
  nameServers: string[];
  originalNameServers: string[] | null;
  developmentMode: number;
  type: 'full' | 'partial' | 'secondary';
  verificationKey: string | null;
  createdOn: string;
  modifiedOn: string;
  activatedOn: string | null;
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
  };
  owner: {
    id: string;
    type: string;
    email?: string;
  };
}

export interface DNSRecord {
  id: string;
  zoneId: string;
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA' | 'PTR';
  content: string;
  ttl: number;
  proxied: boolean;
  proxiable: boolean;
  priority?: number;
  locked: boolean;
  createdOn: string;
  modifiedOn: string;
}

export interface SSLSettings {
  value: 'off' | 'flexible' | 'full' | 'strict';
  certificate_status: string;
  validation_errors: string[];
}

export interface PageRule {
  id: string;
  targets: Array<{
    target: string;
    constraint: {
      operator: string;
      value: string;
    };
  }>;
  actions: Array<{
    id: string;
    value: unknown;
  }>;
  priority: number;
  status: 'active' | 'disabled';
  createdOn: string;
  modifiedOn: string;
}

export interface FirewallRule {
  id: string;
  paused: boolean;
  expression: string;
  description: string;
  action: 'block' | 'challenge' | 'js_challenge' | 'managed_challenge' | 'allow' | 'log' | 'bypass';
  priority: number;
  createdOn: string;
  modifiedOn: string;
}

export interface CreateZoneOptions {
  name: string;
  type?: 'full' | 'partial';
  jumpStart?: boolean;
}

export interface CreateDNSRecordOptions {
  type: DNSRecord['type'];
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
}

// ============================================================================
// CLOUDFLARE CONNECTOR CLASS
// ============================================================================

export class CloudflareConnector extends EventEmitter {
  private apiToken: string;
  private accountId?: string;

  private readonly API_BASE = 'https://api.cloudflare.com/client/v4';

  constructor(config: CloudflareConfig) {
    super();
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body } = options;

    const response = await fetch(`${this.API_BASE}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    if (!data.success) {
      const errorMessages = data.errors?.map((e: { message: string }) => e.message).join(', ') || 'Unknown error';
      throw new Error(`Cloudflare API error: ${errorMessages}`);
    }

    return data.result;
  }

  private async requestWithPagination<T>(
    endpoint: string,
    options?: { perPage?: number }
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    const perPage = options?.perPage || 50;

    while (true) {
      const response = await fetch(
        `${this.API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&per_page=${perPage}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.[0]?.message || 'Unknown error'}`);
      }

      results.push(...data.result);

      // Check if there are more pages
      if (!data.result_info || data.result_info.page >= data.result_info.total_pages) {
        break;
      }

      page++;
    }

    return results;
  }

  // ==========================================================================
  // ACCOUNT OPERATIONS
  // ==========================================================================

  async verifyToken(): Promise<{
    id: string;
    status: string;
  }> {
    const data = await this.request<{ id: string; status: string }>('/user/tokens/verify');
    return data;
  }

  async getAccounts(): Promise<Array<{
    id: string;
    name: string;
    type: string;
  }>> {
    const data = await this.request<Array<Record<string, unknown>>>('/accounts');
    return data.map(account => ({
      id: account.id as string,
      name: account.name as string,
      type: account.type as string
    }));
  }

  // ==========================================================================
  // ZONE OPERATIONS
  // ==========================================================================

  async createZone(options: CreateZoneOptions): Promise<CloudflareZone> {
    if (!this.accountId) {
      const accounts = await this.getAccounts();
      if (accounts.length === 0) {
        throw new Error('No Cloudflare account found');
      }
      this.accountId = accounts[0].id;
    }

    const data = await this.request<Record<string, unknown>>('/zones', {
      method: 'POST',
      body: {
        name: options.name,
        account: { id: this.accountId },
        type: options.type || 'full',
        jump_start: options.jumpStart ?? true
      }
    });

    this.emit('zone_created', { zoneId: data.id, name: options.name });
    return this.transformZone(data);
  }

  async getZone(zoneId: string): Promise<CloudflareZone> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}`);
    return this.transformZone(data);
  }

  async getZoneByName(name: string): Promise<CloudflareZone | null> {
    const zones = await this.listZones({ name });
    return zones.length > 0 ? zones[0] : null;
  }

  async listZones(options?: {
    name?: string;
    status?: string;
    accountId?: string;
  }): Promise<CloudflareZone[]> {
    const params = new URLSearchParams();
    if (options?.name) params.set('name', options.name);
    if (options?.status) params.set('status', options.status);
    if (options?.accountId) params.set('account.id', options.accountId);

    const data = await this.requestWithPagination<Record<string, unknown>>(`/zones?${params}`);
    return data.map(zone => this.transformZone(zone));
  }

  async deleteZone(zoneId: string): Promise<void> {
    await this.request(`/zones/${zoneId}`, { method: 'DELETE' });
    this.emit('zone_deleted', { zoneId });
  }

  async checkZoneActivation(zoneId: string): Promise<{
    activated: boolean;
    status: string;
    nameServers: string[];
  }> {
    const zone = await this.getZone(zoneId);
    return {
      activated: zone.status === 'active',
      status: zone.status,
      nameServers: zone.nameServers
    };
  }

  async waitForZoneActivation(
    zoneId: string,
    options?: { timeout?: number; pollInterval?: number }
  ): Promise<CloudflareZone> {
    const timeout = options?.timeout || 86400000; // 24 hours default
    const pollInterval = options?.pollInterval || 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const zone = await this.getZone(zoneId);

      if (zone.status === 'active') {
        this.emit('zone_activated', { zoneId, name: zone.name });
        return zone;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Zone ${zoneId} activation timed out after ${timeout}ms`);
  }

  private transformZone(data: Record<string, unknown>): CloudflareZone {
    const plan = data.plan as Record<string, unknown>;
    const owner = data.owner as Record<string, unknown>;

    return {
      id: data.id as string,
      name: data.name as string,
      status: data.status as CloudflareZone['status'],
      nameServers: data.name_servers as string[],
      originalNameServers: data.original_name_servers as string[] | null,
      developmentMode: data.development_mode as number,
      type: data.type as 'full' | 'partial' | 'secondary',
      verificationKey: data.verification_key as string | null,
      createdOn: data.created_on as string,
      modifiedOn: data.modified_on as string,
      activatedOn: data.activated_on as string | null,
      plan: {
        id: plan.id as string,
        name: plan.name as string,
        price: plan.price as number,
        currency: plan.currency as string
      },
      owner: {
        id: owner.id as string,
        type: owner.type as string,
        email: owner.email as string | undefined
      }
    };
  }

  // ==========================================================================
  // DNS RECORD OPERATIONS
  // ==========================================================================

  async createDNSRecord(zoneId: string, options: CreateDNSRecordOptions): Promise<DNSRecord> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: {
        type: options.type,
        name: options.name,
        content: options.content,
        ttl: options.ttl || 1, // 1 = auto
        proxied: options.proxied ?? (options.type === 'A' || options.type === 'CNAME'),
        priority: options.priority,
        comment: options.comment
      }
    });

    this.emit('dns_record_created', { zoneId, recordId: data.id, type: options.type, name: options.name });
    return this.transformDNSRecord(data);
  }

  async getDNSRecord(zoneId: string, recordId: string): Promise<DNSRecord> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/dns_records/${recordId}`);
    return this.transformDNSRecord(data);
  }

  async listDNSRecords(zoneId: string, options?: {
    type?: DNSRecord['type'];
    name?: string;
    content?: string;
  }): Promise<DNSRecord[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.name) params.set('name', options.name);
    if (options?.content) params.set('content', options.content);

    const data = await this.requestWithPagination<Record<string, unknown>>(
      `/zones/${zoneId}/dns_records?${params}`
    );

    return data.map(record => this.transformDNSRecord(record));
  }

  async updateDNSRecord(zoneId: string, recordId: string, updates: Partial<CreateDNSRecordOptions>): Promise<DNSRecord> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: {
        type: updates.type,
        name: updates.name,
        content: updates.content,
        ttl: updates.ttl,
        proxied: updates.proxied,
        priority: updates.priority,
        comment: updates.comment
      }
    });

    return this.transformDNSRecord(data);
  }

  async deleteDNSRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' });
    this.emit('dns_record_deleted', { zoneId, recordId });
  }

  async bulkCreateDNSRecords(zoneId: string, records: CreateDNSRecordOptions[]): Promise<DNSRecord[]> {
    const results = await Promise.all(
      records.map(record => this.createDNSRecord(zoneId, record))
    );
    return results;
  }

  async bulkDeleteDNSRecords(zoneId: string, recordIds: string[]): Promise<void> {
    await Promise.all(
      recordIds.map(id => this.deleteDNSRecord(zoneId, id))
    );
  }

  private transformDNSRecord(data: Record<string, unknown>): DNSRecord {
    return {
      id: data.id as string,
      zoneId: data.zone_id as string,
      name: data.name as string,
      type: data.type as DNSRecord['type'],
      content: data.content as string,
      ttl: data.ttl as number,
      proxied: data.proxied as boolean,
      proxiable: data.proxiable as boolean,
      priority: data.priority as number | undefined,
      locked: data.locked as boolean,
      createdOn: data.created_on as string,
      modifiedOn: data.modified_on as string
    };
  }

  // ==========================================================================
  // SSL/TLS OPERATIONS
  // ==========================================================================

  async getSSLSettings(zoneId: string): Promise<SSLSettings> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/settings/ssl`);
    return {
      value: data.value as SSLSettings['value'],
      certificate_status: data.certificate_status as string || 'active',
      validation_errors: data.validation_errors as string[] || []
    };
  }

  async setSSLSettings(zoneId: string, mode: 'off' | 'flexible' | 'full' | 'strict'): Promise<SSLSettings> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/settings/ssl`, {
      method: 'PATCH',
      body: { value: mode }
    });

    this.emit('ssl_updated', { zoneId, mode });
    return {
      value: data.value as SSLSettings['value'],
      certificate_status: 'active',
      validation_errors: []
    };
  }

  async enableAlwaysUseHTTPS(zoneId: string, enabled: boolean = true): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/always_use_https`, {
      method: 'PATCH',
      body: { value: enabled ? 'on' : 'off' }
    });
  }

  async enableAutomaticHTTPSRewrites(zoneId: string, enabled: boolean = true): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/automatic_https_rewrites`, {
      method: 'PATCH',
      body: { value: enabled ? 'on' : 'off' }
    });
  }

  async getUniversalSSLStatus(zoneId: string): Promise<{
    enabled: boolean;
    status: string;
  }> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/ssl/universal/settings`);
    return {
      enabled: data.enabled as boolean,
      status: (data.certificate_status as string) || 'initializing'
    };
  }

  // ==========================================================================
  // PAGE RULES
  // ==========================================================================

  async createPageRule(zoneId: string, options: {
    targets: Array<{
      target: 'url';
      constraint: {
        operator: 'matches' | 'contains' | 'equals';
        value: string;
      };
    }>;
    actions: Array<{
      id: string;
      value?: unknown;
    }>;
    priority?: number;
    status?: 'active' | 'disabled';
  }): Promise<PageRule> {
    const data = await this.request<Record<string, unknown>>(`/zones/${zoneId}/pagerules`, {
      method: 'POST',
      body: {
        targets: options.targets,
        actions: options.actions,
        priority: options.priority || 1,
        status: options.status || 'active'
      }
    });

    return this.transformPageRule(data);
  }

  async listPageRules(zoneId: string): Promise<PageRule[]> {
    const data = await this.request<Array<Record<string, unknown>>>(`/zones/${zoneId}/pagerules`);
    return data.map(rule => this.transformPageRule(rule));
  }

  async deletePageRule(zoneId: string, ruleId: string): Promise<void> {
    await this.request(`/zones/${zoneId}/pagerules/${ruleId}`, { method: 'DELETE' });
  }

  private transformPageRule(data: Record<string, unknown>): PageRule {
    return {
      id: data.id as string,
      targets: data.targets as PageRule['targets'],
      actions: data.actions as PageRule['actions'],
      priority: data.priority as number,
      status: data.status as 'active' | 'disabled',
      createdOn: data.created_on as string,
      modifiedOn: data.modified_on as string
    };
  }

  // ==========================================================================
  // ZONE SETTINGS
  // ==========================================================================

  async enableDevelopmentMode(zoneId: string, enabled: boolean = true): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/development_mode`, {
      method: 'PATCH',
      body: { value: enabled ? 'on' : 'off' }
    });
  }

  async setMinifySettings(zoneId: string, options: {
    html?: boolean;
    css?: boolean;
    js?: boolean;
  }): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/minify`, {
      method: 'PATCH',
      body: {
        value: {
          html: options.html ? 'on' : 'off',
          css: options.css ? 'on' : 'off',
          js: options.js ? 'on' : 'off'
        }
      }
    });
  }

  async enableBrotli(zoneId: string, enabled: boolean = true): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/brotli`, {
      method: 'PATCH',
      body: { value: enabled ? 'on' : 'off' }
    });
  }

  async enableHTTP3(zoneId: string, enabled: boolean = true): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/http3`, {
      method: 'PATCH',
      body: { value: enabled ? 'on' : 'off' }
    });
  }

  async setBrowserCacheTTL(zoneId: string, seconds: number): Promise<void> {
    await this.request(`/zones/${zoneId}/settings/browser_cache_ttl`, {
      method: 'PATCH',
      body: { value: seconds }
    });
  }

  async getZoneSettings(zoneId: string): Promise<Record<string, unknown>> {
    const data = await this.request<Array<Record<string, unknown>>>(`/zones/${zoneId}/settings`);
    return data.reduce((acc, setting) => {
      acc[setting.id as string] = setting.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  // ==========================================================================
  // CACHE OPERATIONS
  // ==========================================================================

  async purgeCache(zoneId: string, options?: {
    purgeEverything?: boolean;
    files?: string[];
    tags?: string[];
    hosts?: string[];
    prefixes?: string[];
  }): Promise<void> {
    const body: Record<string, unknown> = {};

    if (options?.purgeEverything) {
      body.purge_everything = true;
    } else {
      if (options?.files) body.files = options.files;
      if (options?.tags) body.tags = options.tags;
      if (options?.hosts) body.hosts = options.hosts;
      if (options?.prefixes) body.prefixes = options.prefixes;
    }

    await this.request(`/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      body
    });

    this.emit('cache_purged', { zoneId, options });
  }

  // ==========================================================================
  // STANDARD DNS SETUP FOR NEW COMPANY
  // ==========================================================================

  async setupStandardDNS(zoneId: string, config: {
    // Website
    rootDomain: string;
    vercelIp?: string;

    // Email (Google Workspace)
    useGoogleWorkspace?: boolean;

    // Email (Resend)
    resendDkimKey?: string;

    // Verification
    googleVerificationToken?: string;
  }): Promise<{
    records: DNSRecord[];
    success: boolean;
  }> {
    const records: DNSRecord[] = [];

    try {
      // Website - Root domain A record
      const aRecord = await this.createDNSRecord(zoneId, {
        type: 'A',
        name: '@',
        content: config.vercelIp || '76.76.21.21',
        proxied: true
      });
      records.push(aRecord);

      // Website - www CNAME
      const wwwRecord = await this.createDNSRecord(zoneId, {
        type: 'CNAME',
        name: 'www',
        content: 'cname.vercel-dns.com',
        proxied: true
      });
      records.push(wwwRecord);

      // Google Workspace MX Records
      if (config.useGoogleWorkspace) {
        const mxRecords = [
          { content: 'aspmx.l.google.com', priority: 1 },
          { content: 'alt1.aspmx.l.google.com', priority: 5 },
          { content: 'alt2.aspmx.l.google.com', priority: 5 },
          { content: 'alt3.aspmx.l.google.com', priority: 10 },
          { content: 'alt4.aspmx.l.google.com', priority: 10 }
        ];

        for (const mx of mxRecords) {
          const record = await this.createDNSRecord(zoneId, {
            type: 'MX',
            name: '@',
            content: mx.content,
            priority: mx.priority,
            proxied: false
          });
          records.push(record);
        }

        // SPF for Google
        const spfRecord = await this.createDNSRecord(zoneId, {
          type: 'TXT',
          name: '@',
          content: 'v=spf1 include:_spf.google.com ~all',
          proxied: false
        });
        records.push(spfRecord);
      }

      // Resend DKIM
      if (config.resendDkimKey) {
        const dkimRecord = await this.createDNSRecord(zoneId, {
          type: 'TXT',
          name: 'resend._domainkey',
          content: config.resendDkimKey,
          proxied: false
        });
        records.push(dkimRecord);
      }

      // Google Verification
      if (config.googleVerificationToken) {
        const verifyRecord = await this.createDNSRecord(zoneId, {
          type: 'TXT',
          name: '@',
          content: `google-site-verification=${config.googleVerificationToken}`,
          proxied: false
        });
        records.push(verifyRecord);
      }

      // Configure SSL
      await this.setSSLSettings(zoneId, 'strict');
      await this.enableAlwaysUseHTTPS(zoneId, true);
      await this.enableBrotli(zoneId, true);

      this.emit('standard_dns_setup_complete', { zoneId, recordCount: records.length });

      return { records, success: true };
    } catch (error) {
      this.emit('standard_dns_setup_failed', { zoneId, error });
      return { records, success: false };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createCloudflareConnector(config: CloudflareConfig): CloudflareConnector {
  return new CloudflareConnector(config);
}

export default CloudflareConnector;
