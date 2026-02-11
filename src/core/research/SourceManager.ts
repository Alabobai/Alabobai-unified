/**
 * Alabobai Deep Research Engine - Source Manager
 *
 * Manages 50+ sources per query with:
 * - Source registry and configuration
 * - Rate limiting and throttling
 * - Source health monitoring
 * - Caching and deduplication
 * - Priority queuing
 *
 * Designed to handle high-volume parallel research queries.
 */

import { EventEmitter } from 'events';
import { SourceType, SourceQualityScorer, sourceQualityScorer, QualityScore, SourceMetadata } from './SourceQualityScorer.js';

// ============================================================================
// TYPES
// ============================================================================

export type SourceCategory =
  | 'search_engine'      // Google, Bing, DuckDuckGo
  | 'academic'           // Google Scholar, PubMed, arXiv
  | 'news'               // News APIs and aggregators
  | 'knowledge_base'     // Wikipedia, Britannica
  | 'social'             // Reddit, Twitter, HackerNews
  | 'specialized'        // Domain-specific APIs
  | 'government'         // Government data sources
  | 'financial'          // Bloomberg, Yahoo Finance
  | 'technical'          // Stack Overflow, GitHub
  | 'custom';            // User-defined sources

export interface SourceConfig {
  id: string;
  name: string;
  category: SourceCategory;
  type: SourceType;
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay?: number;
    burstLimit?: number;
  };
  timeout: number;           // ms
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  enabled: boolean;
  priority: number;          // 1-10, higher = more important
  capabilities: SourceCapability[];
  healthCheck?: {
    endpoint: string;
    interval: number;
  };
}

export type SourceCapability =
  | 'full_text_search'
  | 'semantic_search'
  | 'date_filtering'
  | 'domain_filtering'
  | 'language_filtering'
  | 'pagination'
  | 'snippets'
  | 'images'
  | 'videos'
  | 'citations'
  | 'author_info'
  | 'metadata';

export interface SourceResult {
  sourceId: string;
  url: string;
  title: string;
  snippet: string;
  author?: string;
  publishedDate?: Date;
  metadata?: Record<string, unknown>;
  relevanceScore?: number;
  fetchedAt: Date;
}

export interface SourceHealth {
  sourceId: string;
  isHealthy: boolean;
  lastCheck: Date;
  latencyMs: number;
  successRate: number;
  errorCount: number;
  lastError?: string;
}

export interface SourceStats {
  sourceId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  totalResults: number;
  requestsToday: number;
  requestsThisMinute: number;
}

export interface SearchQuery {
  query: string;
  filters?: {
    dateRange?: { start: Date; end: Date };
    domains?: string[];
    excludeDomains?: string[];
    language?: string;
    type?: SourceType[];
  };
  limit?: number;
  offset?: number;
}

export interface SearchAdapter {
  search(query: SearchQuery, config: SourceConfig): Promise<SourceResult[]>;
  healthCheck?(config: SourceConfig): Promise<boolean>;
}

// ============================================================================
// DEFAULT SOURCE CONFIGURATIONS
// ============================================================================

const DEFAULT_SOURCES: SourceConfig[] = [
  // Search Engines
  {
    id: 'google',
    name: 'Google Search',
    category: 'search_engine',
    type: 'unknown',
    baseUrl: 'https://www.googleapis.com/customsearch/v1',
    rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 10,
    capabilities: ['full_text_search', 'date_filtering', 'domain_filtering', 'snippets', 'pagination'],
  },
  {
    id: 'bing',
    name: 'Bing Search',
    category: 'search_engine',
    type: 'unknown',
    baseUrl: 'https://api.bing.microsoft.com/v7.0/search',
    rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 9,
    capabilities: ['full_text_search', 'date_filtering', 'domain_filtering', 'snippets', 'pagination'],
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    category: 'search_engine',
    type: 'unknown',
    baseUrl: 'https://api.duckduckgo.com/',
    rateLimit: { requestsPerMinute: 60 },
    timeout: 10000,
    retryConfig: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'snippets'],
  },
  {
    id: 'brave',
    name: 'Brave Search',
    category: 'search_engine',
    type: 'unknown',
    baseUrl: 'https://api.search.brave.com/res/v1/web/search',
    rateLimit: { requestsPerMinute: 100 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'date_filtering', 'snippets', 'pagination'],
  },

  // Academic Sources
  {
    id: 'google_scholar',
    name: 'Google Scholar',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://scholar.google.com',
    rateLimit: { requestsPerMinute: 20 },
    timeout: 15000,
    retryConfig: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 3 },
    enabled: true,
    priority: 10,
    capabilities: ['full_text_search', 'citations', 'author_info', 'date_filtering'],
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 3000 },
    timeout: 15000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 10,
    capabilities: ['full_text_search', 'citations', 'author_info', 'date_filtering', 'metadata'],
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://export.arxiv.org/api/query',
    rateLimit: { requestsPerMinute: 20 },
    timeout: 15000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 9,
    capabilities: ['full_text_search', 'author_info', 'date_filtering', 'metadata'],
  },
  {
    id: 'semantic_scholar',
    name: 'Semantic Scholar',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://api.semanticscholar.org/graph/v1',
    rateLimit: { requestsPerMinute: 100 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 9,
    capabilities: ['semantic_search', 'citations', 'author_info', 'metadata'],
  },
  {
    id: 'crossref',
    name: 'Crossref',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://api.crossref.org/works',
    rateLimit: { requestsPerMinute: 50 },
    timeout: 15000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'citations', 'author_info', 'metadata', 'date_filtering'],
  },
  {
    id: 'core',
    name: 'CORE',
    category: 'academic',
    type: 'academic',
    baseUrl: 'https://api.core.ac.uk/v3',
    rateLimit: { requestsPerMinute: 30 },
    timeout: 15000,
    retryConfig: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'metadata'],
  },

  // News Sources
  {
    id: 'news_api',
    name: 'News API',
    category: 'news',
    type: 'news_tier1',
    baseUrl: 'https://newsapi.org/v2',
    rateLimit: { requestsPerMinute: 50, requestsPerDay: 1000 },
    timeout: 10000,
    retryConfig: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'date_filtering', 'domain_filtering', 'language_filtering'],
  },
  {
    id: 'google_news',
    name: 'Google News',
    category: 'news',
    type: 'news_tier1',
    baseUrl: 'https://news.google.com',
    rateLimit: { requestsPerMinute: 30 },
    timeout: 10000,
    retryConfig: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'date_filtering'],
  },
  {
    id: 'bing_news',
    name: 'Bing News',
    category: 'news',
    type: 'news_tier1',
    baseUrl: 'https://api.bing.microsoft.com/v7.0/news/search',
    rateLimit: { requestsPerMinute: 100 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'date_filtering', 'language_filtering'],
  },

  // Knowledge Bases
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    category: 'knowledge_base',
    type: 'encyclopedia',
    baseUrl: 'https://en.wikipedia.org/w/api.php',
    rateLimit: { requestsPerMinute: 100 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 500, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'snippets', 'metadata'],
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    category: 'knowledge_base',
    type: 'encyclopedia',
    baseUrl: 'https://www.wikidata.org/w/api.php',
    rateLimit: { requestsPerMinute: 100 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 500, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'metadata'],
  },

  // Social Sources
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    type: 'forum',
    baseUrl: 'https://oauth.reddit.com',
    rateLimit: { requestsPerMinute: 60 },
    timeout: 10000,
    retryConfig: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 5,
    capabilities: ['full_text_search', 'date_filtering'],
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    category: 'social',
    type: 'forum',
    baseUrl: 'https://hn.algolia.com/api/v1',
    rateLimit: { requestsPerMinute: 60 },
    timeout: 10000,
    retryConfig: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
    enabled: true,
    priority: 6,
    capabilities: ['full_text_search', 'date_filtering'],
  },

  // Technical Sources
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    category: 'technical',
    type: 'forum',
    baseUrl: 'https://api.stackexchange.com/2.3',
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 10000 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'date_filtering', 'metadata'],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'technical',
    type: 'technical_docs',
    baseUrl: 'https://api.github.com',
    rateLimit: { requestsPerMinute: 30 },
    timeout: 10000,
    retryConfig: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 7,
    capabilities: ['full_text_search', 'date_filtering', 'metadata'],
  },

  // Government Sources
  {
    id: 'data_gov',
    name: 'Data.gov',
    category: 'government',
    type: 'government',
    baseUrl: 'https://catalog.data.gov/api/3',
    rateLimit: { requestsPerMinute: 30 },
    timeout: 15000,
    retryConfig: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'metadata'],
  },

  // Financial Sources
  {
    id: 'sec_edgar',
    name: 'SEC EDGAR',
    category: 'financial',
    type: 'government',
    baseUrl: 'https://efts.sec.gov/LATEST/search-index',
    rateLimit: { requestsPerMinute: 10 },
    timeout: 20000,
    retryConfig: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    enabled: true,
    priority: 8,
    capabilities: ['full_text_search', 'date_filtering', 'metadata'],
  },
];

// ============================================================================
// SOURCE MANAGER
// ============================================================================

export interface SourceManagerConfig {
  sources?: SourceConfig[];
  qualityScorer?: SourceQualityScorer;
  maxConcurrentRequests?: number;
  defaultTimeout?: number;
  enableHealthChecks?: boolean;
  healthCheckInterval?: number;
  cacheResults?: boolean;
  cacheTTL?: number;
  deduplicateResults?: boolean;
}

export class SourceManager extends EventEmitter {
  private config: Required<SourceManagerConfig>;
  private sources: Map<string, SourceConfig>;
  private adapters: Map<string, SearchAdapter>;
  private healthStatus: Map<string, SourceHealth>;
  private stats: Map<string, SourceStats>;
  private rateLimiters: Map<string, RateLimiter>;
  private resultCache: Map<string, { results: SourceResult[]; timestamp: number }>;
  private healthCheckIntervals: Map<string, NodeJS.Timeout>;
  private activeRequests: Set<string>;

  constructor(config: SourceManagerConfig = {}) {
    super();

    this.config = {
      sources: config.sources ?? DEFAULT_SOURCES,
      qualityScorer: config.qualityScorer ?? sourceQualityScorer,
      maxConcurrentRequests: config.maxConcurrentRequests ?? 20,
      defaultTimeout: config.defaultTimeout ?? 10000,
      enableHealthChecks: config.enableHealthChecks ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 60000,
      cacheResults: config.cacheResults ?? true,
      cacheTTL: config.cacheTTL ?? 300000, // 5 minutes
      deduplicateResults: config.deduplicateResults ?? true,
    };

    this.sources = new Map();
    this.adapters = new Map();
    this.healthStatus = new Map();
    this.stats = new Map();
    this.rateLimiters = new Map();
    this.resultCache = new Map();
    this.healthCheckIntervals = new Map();
    this.activeRequests = new Set();

    // Initialize sources
    for (const source of this.config.sources) {
      this.registerSource(source);
    }
  }

  // ============================================================================
  // SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Register a new source
   */
  registerSource(config: SourceConfig): void {
    this.sources.set(config.id, config);

    // Initialize health status
    this.healthStatus.set(config.id, {
      sourceId: config.id,
      isHealthy: true,
      lastCheck: new Date(),
      latencyMs: 0,
      successRate: 1,
      errorCount: 0,
    });

    // Initialize stats
    this.stats.set(config.id, {
      sourceId: config.id,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatencyMs: 0,
      totalResults: 0,
      requestsToday: 0,
      requestsThisMinute: 0,
    });

    // Initialize rate limiter
    this.rateLimiters.set(config.id, new RateLimiter(config.rateLimit));

    // Start health checks if enabled
    if (this.config.enableHealthChecks && config.healthCheck) {
      this.startHealthCheck(config.id);
    }

    this.emit('source-registered', config);
  }

  /**
   * Register a search adapter for a source
   */
  registerAdapter(sourceId: string, adapter: SearchAdapter): void {
    this.adapters.set(sourceId, adapter);
    this.emit('adapter-registered', { sourceId });
  }

  /**
   * Update source configuration
   */
  updateSource(sourceId: string, updates: Partial<SourceConfig>): void {
    const existing = this.sources.get(sourceId);
    if (!existing) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const updated = { ...existing, ...updates };
    this.sources.set(sourceId, updated);

    // Update rate limiter if rate limit changed
    if (updates.rateLimit) {
      this.rateLimiters.set(sourceId, new RateLimiter(updated.rateLimit));
    }

    this.emit('source-updated', updated);
  }

  /**
   * Enable or disable a source
   */
  setSourceEnabled(sourceId: string, enabled: boolean): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    source.enabled = enabled;
    this.emit('source-toggled', { sourceId, enabled });
  }

  /**
   * Get source configuration
   */
  getSource(sourceId: string): SourceConfig | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Get all sources
   */
  getAllSources(): SourceConfig[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get enabled sources
   */
  getEnabledSources(): SourceConfig[] {
    return Array.from(this.sources.values()).filter(s => s.enabled);
  }

  /**
   * Get sources by category
   */
  getSourcesByCategory(category: SourceCategory): SourceConfig[] {
    return Array.from(this.sources.values()).filter(s => s.category === category);
  }

  /**
   * Get sources by capability
   */
  getSourcesByCapability(capability: SourceCapability): SourceConfig[] {
    return Array.from(this.sources.values()).filter(s => s.capabilities.includes(capability));
  }

  // ============================================================================
  // SEARCH EXECUTION
  // ============================================================================

  /**
   * Search across multiple sources in parallel
   */
  async searchSources(
    query: SearchQuery,
    options: {
      sourceIds?: string[];
      categories?: SourceCategory[];
      maxSources?: number;
      minPriority?: number;
    } = {}
  ): Promise<Map<string, SourceResult[]>> {
    const { sourceIds, categories, maxSources = 50, minPriority = 1 } = options;

    // Select sources to query
    let selectedSources = this.selectSources({
      sourceIds,
      categories,
      maxSources,
      minPriority,
    });

    // Sort by priority
    selectedSources.sort((a, b) => b.priority - a.priority);

    // Limit to maxSources
    selectedSources = selectedSources.slice(0, maxSources);

    this.emit('search-started', { query, sourceCount: selectedSources.length });

    // Execute searches in parallel with concurrency limit
    const results = new Map<string, SourceResult[]>();
    const chunks = this.chunkArray(selectedSources, this.config.maxConcurrentRequests);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(source => this.searchSource(source.id, query))
      );

      for (let i = 0; i < chunk.length; i++) {
        const result = chunkResults[i];
        if (result.status === 'fulfilled') {
          results.set(chunk[i].id, result.value);
        } else {
          this.emit('source-error', {
            sourceId: chunk[i].id,
            error: result.reason,
          });
          results.set(chunk[i].id, []);
        }
      }
    }

    // Deduplicate if enabled
    if (this.config.deduplicateResults) {
      this.deduplicateResults(results);
    }

    this.emit('search-completed', {
      query,
      sourceCount: selectedSources.length,
      totalResults: Array.from(results.values()).reduce((sum, r) => sum + r.length, 0),
    });

    return results;
  }

  /**
   * Search a single source
   */
  async searchSource(sourceId: string, query: SearchQuery): Promise<SourceResult[]> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    if (!source.enabled) {
      throw new Error(`Source is disabled: ${sourceId}`);
    }

    // Check rate limit
    const rateLimiter = this.rateLimiters.get(sourceId);
    if (rateLimiter && !rateLimiter.tryAcquire()) {
      this.emit('rate-limited', { sourceId });
      return [];
    }

    // Check cache
    if (this.config.cacheResults) {
      const cacheKey = this.getCacheKey(sourceId, query);
      const cached = this.resultCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        this.emit('cache-hit', { sourceId, query });
        return cached.results;
      }
    }

    // Get adapter
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      // Use default adapter if no custom adapter registered
      return this.defaultSearch(source, query);
    }

    // Execute search with timeout and retry
    const requestId = `${sourceId}_${Date.now()}`;
    this.activeRequests.add(requestId);

    const startTime = Date.now();

    try {
      const results = await this.executeWithRetry(
        () => adapter.search(query, source),
        source.retryConfig
      );

      const latency = Date.now() - startTime;

      // Update stats
      this.updateStats(sourceId, true, latency, results.length);

      // Cache results
      if (this.config.cacheResults) {
        const cacheKey = this.getCacheKey(sourceId, query);
        this.resultCache.set(cacheKey, { results, timestamp: Date.now() });
      }

      this.emit('source-results', { sourceId, resultCount: results.length, latencyMs: latency });

      return results;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateStats(sourceId, false, latency, 0);
      this.updateHealthStatus(sourceId, error);
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Get aggregated results from all sources with quality scores
   */
  async getAggregatedResults(
    query: SearchQuery,
    options?: Parameters<typeof this.searchSources>[1]
  ): Promise<Array<SourceResult & { qualityScore: QualityScore }>> {
    const resultsBySource = await this.searchSources(query, options);

    const aggregatedResults: Array<SourceResult & { qualityScore: QualityScore }> = [];

    for (const [sourceId, results] of resultsBySource) {
      for (const result of results) {
        // Build metadata for scoring
        const metadata: SourceMetadata = {
          url: result.url,
          domain: this.extractDomain(result.url),
          title: result.title,
          author: result.author,
          publishedDate: result.publishedDate,
        };

        // Score the result
        const qualityScore = await this.config.qualityScorer.scoreSource(metadata);

        aggregatedResults.push({
          ...result,
          qualityScore,
        });
      }
    }

    // Sort by quality score
    aggregatedResults.sort((a, b) => b.qualityScore.overall - a.qualityScore.overall);

    return aggregatedResults;
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Get health status for a source
   */
  getSourceHealth(sourceId: string): SourceHealth | undefined {
    return this.healthStatus.get(sourceId);
  }

  /**
   * Get health status for all sources
   */
  getAllHealthStatus(): SourceHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get healthy sources
   */
  getHealthySources(): SourceConfig[] {
    return Array.from(this.sources.values()).filter(source => {
      const health = this.healthStatus.get(source.id);
      return health?.isHealthy ?? true;
    });
  }

  /**
   * Manually trigger health check for a source
   */
  async checkHealth(sourceId: string): Promise<SourceHealth> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const adapter = this.adapters.get(sourceId);
    const startTime = Date.now();

    try {
      if (adapter?.healthCheck) {
        await adapter.healthCheck(source);
      } else {
        // Default health check - try a simple search
        await this.searchSource(sourceId, { query: 'test', limit: 1 });
      }

      const latency = Date.now() - startTime;
      const health = this.healthStatus.get(sourceId)!;

      health.isHealthy = true;
      health.lastCheck = new Date();
      health.latencyMs = latency;

      return health;
    } catch (error) {
      const health = this.healthStatus.get(sourceId)!;
      health.isHealthy = false;
      health.lastCheck = new Date();
      health.lastError = error instanceof Error ? error.message : String(error);
      health.errorCount++;

      this.emit('health-check-failed', { sourceId, error });

      return health;
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get statistics for a source
   */
  getSourceStats(sourceId: string): SourceStats | undefined {
    return this.stats.get(sourceId);
  }

  /**
   * Get statistics for all sources
   */
  getAllStats(): SourceStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get aggregate statistics
   */
  getAggregateStats(): {
    totalSources: number;
    enabledSources: number;
    healthySources: number;
    totalRequests: number;
    successRate: number;
    averageLatency: number;
  } {
    const allStats = this.getAllStats();
    const allHealth = this.getAllHealthStatus();

    const totalRequests = allStats.reduce((sum, s) => sum + s.totalRequests, 0);
    const successfulRequests = allStats.reduce((sum, s) => sum + s.successfulRequests, 0);
    const totalLatency = allStats.reduce((sum, s) => sum + s.averageLatencyMs * s.totalRequests, 0);

    return {
      totalSources: this.sources.size,
      enabledSources: this.getEnabledSources().length,
      healthySources: allHealth.filter(h => h.isHealthy).length,
      totalRequests,
      successRate: totalRequests > 0 ? successfulRequests / totalRequests : 1,
      averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clear cache
   */
  clearCache(): void {
    this.resultCache.clear();
    this.emit('cache-cleared');
  }

  /**
   * Stop health checks and cleanup
   */
  shutdown(): void {
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();
    this.clearCache();
    this.emit('shutdown');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private selectSources(options: {
    sourceIds?: string[];
    categories?: SourceCategory[];
    maxSources?: number;
    minPriority?: number;
  }): SourceConfig[] {
    let sources = this.getEnabledSources();

    // Filter by source IDs if provided
    if (options.sourceIds) {
      sources = sources.filter(s => options.sourceIds!.includes(s.id));
    }

    // Filter by categories if provided
    if (options.categories) {
      sources = sources.filter(s => options.categories!.includes(s.category));
    }

    // Filter by priority
    if (options.minPriority) {
      sources = sources.filter(s => s.priority >= options.minPriority!);
    }

    // Filter by health
    sources = sources.filter(s => {
      const health = this.healthStatus.get(s.id);
      return health?.isHealthy ?? true;
    });

    return sources;
  }

  private async defaultSearch(source: SourceConfig, query: SearchQuery): Promise<SourceResult[]> {
    // Default implementation - subclasses or adapters should override
    // This is a placeholder that returns empty results
    this.emit('default-search', { sourceId: source.id, query });
    return [];
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryConfig: SourceConfig['retryConfig']
  ): Promise<T> {
    let lastError: Error | undefined;
    let backoff = retryConfig.backoffMs;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retryConfig.maxRetries) {
          await this.sleep(backoff);
          backoff *= retryConfig.backoffMultiplier;
        }
      }
    }

    throw lastError;
  }

  private updateStats(sourceId: string, success: boolean, latencyMs: number, resultCount: number): void {
    const stats = this.stats.get(sourceId);
    if (!stats) return;

    stats.totalRequests++;
    if (success) {
      stats.successfulRequests++;
      stats.totalResults += resultCount;
    } else {
      stats.failedRequests++;
    }

    // Update average latency
    stats.averageLatencyMs =
      (stats.averageLatencyMs * (stats.totalRequests - 1) + latencyMs) / stats.totalRequests;

    // Update minute/day counters (simplified - in production would use sliding windows)
    stats.requestsThisMinute++;
    stats.requestsToday++;
  }

  private updateHealthStatus(sourceId: string, error: unknown): void {
    const health = this.healthStatus.get(sourceId);
    if (!health) return;

    health.errorCount++;
    health.lastError = error instanceof Error ? error.message : String(error);

    // Calculate success rate
    const stats = this.stats.get(sourceId);
    if (stats && stats.totalRequests > 0) {
      health.successRate = stats.successfulRequests / stats.totalRequests;
    }

    // Mark as unhealthy if too many errors
    if (health.errorCount > 5 && health.successRate < 0.5) {
      health.isHealthy = false;
      this.emit('source-unhealthy', { sourceId, health });
    }
  }

  private startHealthCheck(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source?.healthCheck) return;

    const interval = setInterval(
      () => this.checkHealth(sourceId),
      source.healthCheck.interval
    );

    this.healthCheckIntervals.set(sourceId, interval);
  }

  private getCacheKey(sourceId: string, query: SearchQuery): string {
    return `${sourceId}:${JSON.stringify(query)}`;
  }

  private deduplicateResults(results: Map<string, SourceResult[]>): void {
    const seenUrls = new Set<string>();

    for (const [sourceId, sourceResults] of results) {
      const deduplicated: SourceResult[] = [];

      for (const result of sourceResults) {
        const normalizedUrl = this.normalizeUrl(result.url);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          deduplicated.push(result);
        }
      }

      results.set(sourceId, deduplicated);
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters
      urlObj.searchParams.delete('utm_source');
      urlObj.searchParams.delete('utm_medium');
      urlObj.searchParams.delete('utm_campaign');
      urlObj.searchParams.delete('ref');
      // Remove trailing slash
      let normalized = urlObj.toString();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private requestsPerMinute: number;
  private requestsPerDay?: number;
  private burstLimit?: number;

  private minuteRequests: number = 0;
  private dayRequests: number = 0;
  private burstRequests: number = 0;

  private minuteResetTime: number = Date.now() + 60000;
  private dayResetTime: number = Date.now() + 86400000;
  private burstResetTime: number = Date.now() + 1000;

  constructor(config: SourceConfig['rateLimit']) {
    this.requestsPerMinute = config.requestsPerMinute;
    this.requestsPerDay = config.requestsPerDay;
    this.burstLimit = config.burstLimit;
  }

  tryAcquire(): boolean {
    const now = Date.now();

    // Reset counters if windows have passed
    if (now >= this.minuteResetTime) {
      this.minuteRequests = 0;
      this.minuteResetTime = now + 60000;
    }

    if (now >= this.dayResetTime) {
      this.dayRequests = 0;
      this.dayResetTime = now + 86400000;
    }

    if (now >= this.burstResetTime) {
      this.burstRequests = 0;
      this.burstResetTime = now + 1000;
    }

    // Check limits
    if (this.minuteRequests >= this.requestsPerMinute) {
      return false;
    }

    if (this.requestsPerDay !== undefined && this.dayRequests >= this.requestsPerDay) {
      return false;
    }

    if (this.burstLimit !== undefined && this.burstRequests >= this.burstLimit) {
      return false;
    }

    // Increment counters
    this.minuteRequests++;
    this.dayRequests++;
    this.burstRequests++;

    return true;
  }

  getStatus(): { minuteRemaining: number; dayRemaining: number; burstRemaining: number } {
    return {
      minuteRemaining: Math.max(0, this.requestsPerMinute - this.minuteRequests),
      dayRemaining: this.requestsPerDay !== undefined
        ? Math.max(0, this.requestsPerDay - this.dayRequests)
        : Infinity,
      burstRemaining: this.burstLimit !== undefined
        ? Math.max(0, this.burstLimit - this.burstRequests)
        : Infinity,
    };
  }
}

// Export singleton instance
export const sourceManager = new SourceManager();
