/**
 * Search Tool - Web search using Serper or Tavily API
 * Provides web search capabilities with rate limiting and caching
 */

import { z } from 'zod';
import { BaseTool, ToolResult, Logger, RateLimiter, RateLimitConfig } from './CoreTools.js';

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

export const SearchInputSchema = z.object({
  query: z.string().min(1).max(1000).describe('Search query'),
  provider: z.enum(['serper', 'tavily', 'auto']).default('auto').describe('Search provider'),
  maxResults: z.number().min(1).max(100).default(10).describe('Maximum results to return'),
  searchType: z.enum(['web', 'news', 'images', 'videos']).default('web').describe('Type of search'),
  country: z.string().length(2).optional().describe('Country code for localized results'),
  language: z.string().length(2).optional().describe('Language code'),
  timeRange: z.enum(['day', 'week', 'month', 'year', 'all']).default('all').describe('Time range for results'),
  includeSnippets: z.boolean().default(true).describe('Include text snippets'),
  includeImages: z.boolean().default(false).describe('Include image URLs'),
  safeSearch: z.boolean().default(true).describe('Enable safe search'),
  domain: z.string().optional().describe('Limit search to specific domain'),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  source?: string;
  position: number;
  imageUrl?: string;
  score?: number;
}

export interface SearchOutput {
  query: string;
  provider: string;
  totalResults?: number;
  results: SearchResult[];
  searchTime: number;
  cached: boolean;
  relatedSearches?: string[];
  knowledgeGraph?: {
    title?: string;
    description?: string;
    attributes?: Record<string, string>;
  };
}

// ============================================================================
// PROVIDER INTERFACES
// ============================================================================

interface SerperResponse {
  searchParameters: {
    q: string;
    type: string;
    engine: string;
  };
  organic?: Array<{
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    position: number;
    sitelinks?: Array<{ title: string; link: string }>;
  }>;
  news?: Array<{
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    source: string;
    imageUrl?: string;
    position: number;
  }>;
  images?: Array<{
    title: string;
    imageUrl: string;
    link: string;
    source: string;
    position: number;
  }>;
  videos?: Array<{
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    source: string;
    imageUrl?: string;
    duration?: string;
    position: number;
  }>;
  relatedSearches?: Array<{ query: string }>;
  knowledgeGraph?: {
    title?: string;
    description?: string;
    attributes?: Record<string, string>;
  };
  credits?: number;
}

interface TavilyResponse {
  query: string;
  follow_up_questions?: string[];
  answer?: string;
  images?: Array<{
    url: string;
    description?: string;
  }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
  }>;
  response_time: number;
}

// ============================================================================
// SEARCH CACHE
// ============================================================================

interface CacheEntry {
  results: SearchOutput;
  timestamp: number;
  ttl: number;
}

class SearchCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number = 1000;
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes

  private generateKey(input: SearchInput): string {
    const key = JSON.stringify({
      query: input.query.toLowerCase(),
      provider: input.provider,
      searchType: input.searchType,
      country: input.country,
      language: input.language,
      timeRange: input.timeRange,
      maxResults: input.maxResults,
      domain: input.domain,
    });
    return Buffer.from(key).toString('base64');
  }

  get(input: SearchInput): SearchOutput | null {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.results;
  }

  set(input: SearchInput, results: SearchOutput, ttl?: number): void {
    // Evict old entries if at max size
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.generateKey(input);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// SEARCH TOOL IMPLEMENTATION
// ============================================================================

export class SearchTool extends BaseTool<SearchInput, SearchOutput> {
  private serperApiKey?: string;
  private tavilyApiKey?: string;
  private cache: SearchCache;
  private providerRateLimiters: Map<string, RateLimiter>;
  private enableCache: boolean = true;
  private cacheTTL: number = 5 * 60 * 1000;

  constructor(options?: {
    serperApiKey?: string;
    tavilyApiKey?: string;
    enableCache?: boolean;
    cacheTTL?: number;
    rateLimit?: RateLimitConfig;
  }) {
    super({
      id: 'search',
      name: 'Web Search',
      description: 'Search the web using Serper or Tavily API with caching and rate limiting',
      version: '1.0.0',
      category: 'search',
      inputSchema: SearchInputSchema as z.ZodType<SearchInput>,
      timeout: 30000,
      rateLimit: options?.rateLimit ?? { maxRequests: 60, windowMs: 60000 },
    });

    this.serperApiKey = options?.serperApiKey ?? process.env.SERPER_API_KEY;
    this.tavilyApiKey = options?.tavilyApiKey ?? process.env.TAVILY_API_KEY;
    this.enableCache = options?.enableCache ?? true;
    this.cacheTTL = options?.cacheTTL ?? 5 * 60 * 1000;
    this.cache = new SearchCache();

    // Set up per-provider rate limiters
    this.providerRateLimiters = new Map([
      ['serper', new RateLimiter({ maxRequests: 100, windowMs: 3600000 })], // 100/hour
      ['tavily', new RateLimiter({ maxRequests: 1000, windowMs: 2592000000 })], // 1000/month
    ]);
  }

  /**
   * Determine best provider based on availability
   */
  private selectProvider(preferred: 'serper' | 'tavily' | 'auto'): 'serper' | 'tavily' {
    if (preferred !== 'auto') {
      // Validate the key exists
      if (preferred === 'serper' && !this.serperApiKey) {
        throw new Error('Serper API key not configured');
      }
      if (preferred === 'tavily' && !this.tavilyApiKey) {
        throw new Error('Tavily API key not configured');
      }
      return preferred;
    }

    // Auto-select based on availability and rate limits
    if (this.serperApiKey) {
      const serperLimiter = this.providerRateLimiters.get('serper');
      if (serperLimiter?.isAllowed('global')) {
        return 'serper';
      }
    }

    if (this.tavilyApiKey) {
      const tavilyLimiter = this.providerRateLimiters.get('tavily');
      if (tavilyLimiter?.isAllowed('global')) {
        return 'tavily';
      }
    }

    // Fallback to serper if available
    if (this.serperApiKey) return 'serper';
    if (this.tavilyApiKey) return 'tavily';

    throw new Error('No search provider configured. Set SERPER_API_KEY or TAVILY_API_KEY.');
  }

  /**
   * Run the search
   */
  protected async run(input: SearchInput): Promise<SearchOutput> {
    const startTime = Date.now();

    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(input);
      if (cached) {
        this.logger.info('Search cache hit', { query: input.query }, this.id);
        return { ...cached, cached: true, searchTime: Date.now() - startTime };
      }
    }

    // Select provider
    const provider = this.selectProvider(input.provider ?? 'auto');

    // Check provider rate limit
    const limiter = this.providerRateLimiters.get(provider);
    if (limiter && !limiter.isAllowed('global')) {
      const waitTime = limiter.getTimeUntilReset('global');
      throw new Error(`${provider} rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    this.logger.info(`Executing search`, { query: input.query, provider }, this.id);

    let results: SearchOutput;

    switch (provider) {
      case 'serper':
        results = await this.searchWithSerper(input);
        break;
      case 'tavily':
        results = await this.searchWithTavily(input);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    results.searchTime = Date.now() - startTime;
    results.cached = false;

    // Cache results
    if (this.enableCache) {
      this.cache.set(input, results, this.cacheTTL);
    }

    return results;
  }

  /**
   * Search using Serper API
   */
  private async searchWithSerper(input: SearchInput): Promise<SearchOutput> {
    if (!this.serperApiKey) {
      throw new Error('Serper API key not configured');
    }

    let endpoint = 'https://google.serper.dev/search';
    if (input.searchType === 'news') endpoint = 'https://google.serper.dev/news';
    if (input.searchType === 'images') endpoint = 'https://google.serper.dev/images';
    if (input.searchType === 'videos') endpoint = 'https://google.serper.dev/videos';

    const body: Record<string, unknown> = {
      q: input.domain ? `site:${input.domain} ${input.query}` : input.query,
      num: input.maxResults,
    };

    if (input.country) body.gl = input.country;
    if (input.language) body.hl = input.language;
    if (input.timeRange && input.timeRange !== 'all') {
      const timeMap: Record<string, string> = {
        day: 'd',
        week: 'w',
        month: 'm',
        year: 'y',
      };
      body.tbs = `qdr:${timeMap[input.timeRange]}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper API error: ${response.status} - ${errorText}`);
    }

    const data: SerperResponse = await response.json();

    // Parse results based on search type
    const results: SearchResult[] = [];

    if (input.searchType === 'web' && data.organic) {
      for (const item of data.organic) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: input.includeSnippets ? item.snippet : undefined,
          publishedDate: item.date,
          position: item.position,
        });
      }
    } else if (input.searchType === 'news' && data.news) {
      for (const item of data.news) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: input.includeSnippets ? item.snippet : undefined,
          publishedDate: item.date,
          source: item.source,
          imageUrl: input.includeImages ? item.imageUrl : undefined,
          position: item.position,
        });
      }
    } else if (input.searchType === 'images' && data.images) {
      for (const item of data.images) {
        results.push({
          title: item.title,
          url: item.link,
          imageUrl: item.imageUrl,
          source: item.source,
          position: item.position,
        });
      }
    } else if (input.searchType === 'videos' && data.videos) {
      for (const item of data.videos) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: input.includeSnippets ? item.snippet : undefined,
          publishedDate: item.date,
          source: item.source,
          imageUrl: input.includeImages ? item.imageUrl : undefined,
          position: item.position,
        });
      }
    }

    return {
      query: input.query,
      provider: 'serper',
      results,
      searchTime: 0,
      cached: false,
      relatedSearches: data.relatedSearches?.map(r => r.query),
      knowledgeGraph: data.knowledgeGraph,
    };
  }

  /**
   * Search using Tavily API
   */
  private async searchWithTavily(input: SearchInput): Promise<SearchOutput> {
    if (!this.tavilyApiKey) {
      throw new Error('Tavily API key not configured');
    }

    // Tavily only supports web search
    if (input.searchType !== 'web') {
      throw new Error('Tavily only supports web search. Use Serper for news/images/videos.');
    }

    const body: Record<string, unknown> = {
      api_key: this.tavilyApiKey,
      query: input.domain ? `site:${input.domain} ${input.query}` : input.query,
      search_depth: 'advanced',
      max_results: input.maxResults,
      include_images: input.includeImages,
      include_answer: true,
    };

    // Map time range
    if (input.timeRange && input.timeRange !== 'all') {
      const dayMap: Record<string, number> = {
        day: 1,
        week: 7,
        month: 30,
        year: 365,
      };
      body.days = dayMap[input.timeRange];
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
    }

    const data: TavilyResponse = await response.json();

    const results: SearchResult[] = data.results.map((item, index) => ({
      title: item.title,
      url: item.url,
      snippet: input.includeSnippets ? item.content : undefined,
      publishedDate: item.published_date,
      position: index + 1,
      score: item.score,
    }));

    return {
      query: input.query,
      provider: 'tavily',
      results,
      searchTime: data.response_time,
      cached: false,
      relatedSearches: data.follow_up_questions,
    };
  }

  /**
   * Search with retry logic
   */
  async searchWithRetry(input: SearchInput, maxRetries: number = 3): Promise<ToolResult<SearchOutput>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.execute(input);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Search attempt ${attempt + 1} failed: ${lastError.message}`, {}, this.id);

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message ?? 'Search failed after retries',
      errorCode: 'SEARCH_FAILED',
      executionTime: 0,
    };
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Search cache cleared', {}, this.id);
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size();
  }

  /**
   * Set API keys
   */
  setApiKeys(keys: { serper?: string; tavily?: string }): void {
    if (keys.serper) this.serperApiKey = keys.serper;
    if (keys.tavily) this.tavilyApiKey = keys.tavily;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.serperApiKey) providers.push('serper');
    if (this.tavilyApiKey) providers.push('tavily');
    return providers;
  }

  /**
   * Quick search helper
   */
  async quickSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const result = await this.execute({
      query,
      maxResults,
      searchType: 'web',
      provider: 'auto',
      timeRange: 'all',
      includeSnippets: true,
      includeImages: false,
      safeSearch: true,
    });

    if (result.success && result.data) {
      return result.data.results;
    }

    throw new Error(result.error ?? 'Search failed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createSearchTool(options?: {
  serperApiKey?: string;
  tavilyApiKey?: string;
  enableCache?: boolean;
  cacheTTL?: number;
  rateLimit?: RateLimitConfig;
}): SearchTool {
  return new SearchTool(options);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const searchTool = createSearchTool();
