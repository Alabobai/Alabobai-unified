/**
 * Alabobai Web Search Service
 *
 * Provides multi-engine web search capabilities that NEVER refuses requests.
 * Uses multiple search backends with automatic failover.
 *
 * Supported Engines:
 * - DuckDuckGo (primary - no API key needed)
 * - Brave Search (secondary - optional API key)
 * - Google Custom Search (optional - requires API key)
 * - Bing Search (optional - requires API key)
 * - SearXNG (self-hosted option)
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchConfig {
  defaultEngine?: SearchEngine;
  fallbackEngines?: SearchEngine[];
  maxResults?: number;
  timeout?: number;
  safeSearch?: boolean;
  region?: string;
  language?: string;
  // API Keys (optional)
  braveApiKey?: string;
  googleApiKey?: string;
  googleCseId?: string;
  bingApiKey?: string;
  searxngUrl?: string;
}

export type SearchEngine = 'duckduckgo' | 'brave' | 'google' | 'bing' | 'searxng';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  source: SearchEngine;
  thumbnail?: string;
  publishedDate?: string;
}

export interface ImageResult {
  title: string;
  url: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  source: SearchEngine;
}

export interface NewsResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate: string;
  thumbnail?: string;
}

export interface SearchResponse<T = SearchResult> {
  query: string;
  results: T[];
  totalResults: number;
  engine: SearchEngine;
  duration: number;
  cached: boolean;
  timestamp: Date;
}

// ============================================================================
// WEB SEARCH SERVICE
// ============================================================================

export class WebSearchService extends EventEmitter {
  private config: Required<SearchConfig>;
  private cache: Map<string, { data: SearchResponse; expires: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: SearchConfig = {}) {
    super();

    this.config = {
      defaultEngine: config.defaultEngine ?? 'duckduckgo',
      fallbackEngines: config.fallbackEngines ?? ['brave', 'google'],
      maxResults: config.maxResults ?? 10,
      timeout: config.timeout ?? 10000,
      safeSearch: config.safeSearch ?? true,
      region: config.region ?? 'us-en',
      language: config.language ?? 'en',
      braveApiKey: config.braveApiKey ?? '',
      googleApiKey: config.googleApiKey ?? '',
      googleCseId: config.googleCseId ?? '',
      bingApiKey: config.bingApiKey ?? '',
      searxngUrl: config.searxngUrl ?? '',
    };
  }

  // ============================================================================
  // MAIN SEARCH METHODS
  // ============================================================================

  async search(query: string, options?: {
    engine?: SearchEngine;
    maxResults?: number;
    useCache?: boolean;
  }): Promise<SearchResponse> {
    const startTime = Date.now();
    const maxResults = options?.maxResults || this.config.maxResults;
    const useCache = options?.useCache !== false;

    // Check cache
    const cacheKey = `web:${query}:${maxResults}`;
    if (useCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // Try engines in order
    const engines = options?.engine
      ? [options.engine]
      : [this.config.defaultEngine, ...this.config.fallbackEngines];

    let lastError: Error | null = null;

    for (const engine of engines) {
      try {
        const results = await this.executeSearch(engine, query, maxResults);

        const response: SearchResponse = {
          query,
          results,
          totalResults: results.length,
          engine,
          duration: Date.now() - startTime,
          cached: false,
          timestamp: new Date(),
        };

        // Cache the results
        this.setCache(cacheKey, response);

        this.emit('search-completed', response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.emit('search-error', { engine, query, error: lastError });
        continue;
      }
    }

    throw lastError || new Error('All search engines failed');
  }

  async searchImages(query: string, options?: {
    maxResults?: number;
  }): Promise<SearchResponse<ImageResult>> {
    const startTime = Date.now();
    const maxResults = options?.maxResults || this.config.maxResults;

    try {
      const results = await this.duckDuckGoImageSearch(query, maxResults);

      return {
        query,
        results,
        totalResults: results.length,
        engine: 'duckduckgo',
        duration: Date.now() - startTime,
        cached: false,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Image search failed: ${(error as Error).message}`);
    }
  }

  async searchNews(query: string, options?: {
    maxResults?: number;
  }): Promise<SearchResponse<NewsResult>> {
    const startTime = Date.now();
    const maxResults = options?.maxResults || this.config.maxResults;

    try {
      const results = await this.duckDuckGoNewsSearch(query, maxResults);

      return {
        query,
        results,
        totalResults: results.length,
        engine: 'duckduckgo',
        duration: Date.now() - startTime,
        cached: false,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`News search failed: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // ENGINE IMPLEMENTATIONS
  // ============================================================================

  private async executeSearch(engine: SearchEngine, query: string, maxResults: number): Promise<SearchResult[]> {
    switch (engine) {
      case 'duckduckgo':
        return this.duckDuckGoSearch(query, maxResults);
      case 'brave':
        return this.braveSearch(query, maxResults);
      case 'google':
        return this.googleSearch(query, maxResults);
      case 'bing':
        return this.bingSearch(query, maxResults);
      case 'searxng':
        return this.searxngSearch(query, maxResults);
      default:
        throw new Error(`Unknown search engine: ${engine}`);
    }
  }

  private async duckDuckGoSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    // DuckDuckGo HTML search (no API key needed)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)',
      },
    });

    const html = await response.text();
    return this.parseDuckDuckGoHTML(html, maxResults);
  }

  private parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Simple regex-based parsing for DuckDuckGo HTML results
    const resultPattern = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/gi;

    let match;
    let position = 1;

    while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
      const url = this.cleanDuckDuckGoUrl(match[1]);
      if (url && !url.includes('duckduckgo.com')) {
        results.push({
          title: this.decodeHTML(match[2].trim()),
          url,
          snippet: this.decodeHTML(match[3].trim()),
          position: position++,
          source: 'duckduckgo',
        });
      }
    }

    // Fallback: try alternative pattern
    if (results.length === 0) {
      const altPattern = /<div class="result[^"]*"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<h2[^>]*>([^<]*)<\/h2>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;

      while ((match = altPattern.exec(html)) !== null && results.length < maxResults) {
        const url = this.cleanDuckDuckGoUrl(match[1]);
        if (url && !url.includes('duckduckgo.com')) {
          results.push({
            title: this.decodeHTML(match[2].trim()),
            url,
            snippet: this.decodeHTML(match[3].trim()),
            position: position++,
            source: 'duckduckgo',
          });
        }
      }
    }

    return results;
  }

  private cleanDuckDuckGoUrl(url: string): string {
    // DuckDuckGo wraps URLs in redirects
    if (url.includes('uddg=')) {
      const match = url.match(/uddg=([^&]*)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    return url;
  }

  private async braveSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    if (this.config.braveApiKey) {
      // Use official Brave API
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.config.braveApiKey,
        },
      });

      const data = await response.json();
      return this.parseBraveAPIResponse(data, maxResults);
    }

    // Fallback to HTML scraping
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)',
      },
    });

    const html = await response.text();
    return this.parseBraveHTML(html, maxResults);
  }

  private parseBraveAPIResponse(data: Record<string, unknown>, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const webResults = (data.web as { results?: Array<{ title: string; url: string; description: string }> })?.results || [];

    webResults.slice(0, maxResults).forEach((result, index) => {
      results.push({
        title: result.title,
        url: result.url,
        snippet: result.description,
        position: index + 1,
        source: 'brave',
      });
    });

    return results;
  }

  private parseBraveHTML(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const snippetPattern = /<div class="snippet[^"]*"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?class="snippet-title"[^>]*>([^<]*)<[\s\S]*?class="snippet-description"[^>]*>([^<]*)</gi;

    let match;
    let position = 1;

    while ((match = snippetPattern.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: this.decodeHTML(match[2].trim()),
        url: match[1],
        snippet: this.decodeHTML(match[3].trim()),
        position: position++,
        source: 'brave',
      });
    }

    return results;
  }

  private async googleSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    if (!this.config.googleApiKey || !this.config.googleCseId) {
      throw new Error('Google search requires API key and CSE ID');
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${this.config.googleApiKey}&cx=${this.config.googleCseId}&q=${encodeURIComponent(query)}&num=${maxResults}`;

    const response = await this.fetchWithTimeout(url);
    const data = await response.json();

    return this.parseGoogleAPIResponse(data, maxResults);
  }

  private parseGoogleAPIResponse(data: Record<string, unknown>, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const items = (data.items as Array<{ title: string; link: string; snippet: string }>) || [];

    items.slice(0, maxResults).forEach((item, index) => {
      results.push({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        position: index + 1,
        source: 'google',
      });
    });

    return results;
  }

  private async bingSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    if (!this.config.bingApiKey) {
      throw new Error('Bing search requires API key');
    }

    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.bingApiKey,
      },
    });

    const data = await response.json();
    return this.parseBingAPIResponse(data, maxResults);
  }

  private parseBingAPIResponse(data: Record<string, unknown>, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const webPages = (data.webPages as { value?: Array<{ name: string; url: string; snippet: string }> })?.value || [];

    webPages.slice(0, maxResults).forEach((page, index) => {
      results.push({
        title: page.name,
        url: page.url,
        snippet: page.snippet,
        position: index + 1,
        source: 'bing',
      });
    });

    return results;
  }

  private async searxngSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    if (!this.config.searxngUrl) {
      throw new Error('SearXNG search requires instance URL');
    }

    const url = `${this.config.searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`;

    const response = await this.fetchWithTimeout(url);
    const data = await response.json();

    return this.parseSearxngResponse(data, maxResults);
  }

  private parseSearxngResponse(data: Record<string, unknown>, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const items = (data.results as Array<{ title: string; url: string; content: string }>) || [];

    items.slice(0, maxResults).forEach((item, index) => {
      results.push({
        title: item.title,
        url: item.url,
        snippet: item.content,
        position: index + 1,
        source: 'searxng',
      });
    });

    return results;
  }

  // ============================================================================
  // IMAGE & NEWS SEARCH
  // ============================================================================

  private async duckDuckGoImageSearch(query: string, maxResults: number): Promise<ImageResult[]> {
    // DuckDuckGo images API endpoint
    const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)',
      },
    });

    const data = await response.json();
    const results: ImageResult[] = [];

    const images = (data.results as Array<{
      title: string;
      url: string;
      image: string;
      thumbnail: string;
      width: number;
      height: number;
    }>) || [];

    images.slice(0, maxResults).forEach((img) => {
      results.push({
        title: img.title,
        url: img.url,
        imageUrl: img.image,
        thumbnailUrl: img.thumbnail,
        width: img.width,
        height: img.height,
        source: 'duckduckgo',
      });
    });

    return results;
  }

  private async duckDuckGoNewsSearch(query: string, maxResults: number): Promise<NewsResult[]> {
    // DuckDuckGo news endpoint
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&iar=news`;

    const response = await this.fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)',
      },
    });

    const html = await response.text();
    const results: NewsResult[] = [];

    // Parse news results from HTML
    const newsPattern = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?class="result__snippet"[^>]*>([^<]*)<[\s\S]*?class="result__url"[^>]*>([^<]*)</gi;

    let match;
    while ((match = newsPattern.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: this.decodeHTML(match[2].trim()),
        url: this.cleanDuckDuckGoUrl(match[1]),
        snippet: this.decodeHTML(match[3].trim()),
        source: match[4].trim(),
        publishedDate: new Date().toISOString(),
      });
    }

    return results;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private decodeHTML(html: string): string {
    return html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private getFromCache(key: string): SearchResponse | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: SearchResponse): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.CACHE_TTL,
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createWebSearchService(config?: SearchConfig): WebSearchService {
  return new WebSearchService(config);
}

export default WebSearchService;
