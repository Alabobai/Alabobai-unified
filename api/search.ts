export const config = {
  runtime: 'edge',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

// Multi-engine web search with fallback
export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { query, limit = 10, sources = ['all'] } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const allResults: SearchResult[] = [];
    const errors: string[] = [];

    // Search multiple sources in parallel
    const searchPromises: Promise<SearchResult[]>[] = [];

    const shouldSearch = (source: string) =>
      sources.includes('all') || sources.includes(source);

    // 1. Brave Search API (if API key available)
    if (shouldSearch('brave') && process.env.BRAVE_API_KEY) {
      searchPromises.push(searchBrave(query, limit).catch(e => {
        errors.push(`Brave: ${e.message}`);
        return [];
      }));
    }

    // 2. SerpAPI (Google results, if API key available)
    if (shouldSearch('google') && process.env.SERPAPI_KEY) {
      searchPromises.push(searchSerpAPI(query, limit).catch(e => {
        errors.push(`SerpAPI: ${e.message}`);
        return [];
      }));
    }

    // 3. Bing Search API (if API key available)
    if (shouldSearch('bing') && process.env.BING_API_KEY) {
      searchPromises.push(searchBing(query, limit).catch(e => {
        errors.push(`Bing: ${e.message}`);
        return [];
      }));
    }

    // 4. DuckDuckGo (no API key needed - always available)
    if (shouldSearch('duckduckgo') || shouldSearch('all')) {
      searchPromises.push(searchDuckDuckGo(query, limit).catch(e => {
        errors.push(`DuckDuckGo: ${e.message}`);
        return [];
      }));
    }

    // 5. SearXNG (if instance URL configured)
    if ((shouldSearch('searxng') || shouldSearch('all')) && process.env.SEARXNG_URL) {
      searchPromises.push(searchSearXNG(query, limit).catch(e => {
        errors.push(`SearXNG: ${e.message}`);
        return [];
      }));
    }

    // 6. Wikipedia (always available as supplement)
    if (shouldSearch('wikipedia') || shouldSearch('all')) {
      searchPromises.push(searchWikipedia(query, Math.min(limit, 3)).catch(e => {
        errors.push(`Wikipedia: ${e.message}`);
        return [];
      }));
    }

    // 7. News search (Google News via RSS)
    if (shouldSearch('news') || shouldSearch('all')) {
      searchPromises.push(searchGoogleNews(query, Math.min(limit, 5)).catch(e => {
        errors.push(`News: ${e.message}`);
        return [];
      }));
    }

    // Execute all searches in parallel
    const searchResults = await Promise.all(searchPromises);

    // Combine results
    for (const results of searchResults) {
      allResults.push(...results);
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      const normalizedUrl = r.url.toLowerCase().replace(/\/$/, '').replace(/^https?:\/\//, '');
      if (seenUrls.has(normalizedUrl)) return false;
      seenUrls.add(normalizedUrl);
      return true;
    });

    // Sort by source priority (diverse sources first)
    const sourceOrder = ['brave', 'google', 'bing', 'searxng', 'duckduckgo', 'news', 'wikipedia'];
    uniqueResults.sort((a, b) => {
      const aIndex = sourceOrder.indexOf(a.source || 'duckduckgo');
      const bIndex = sourceOrder.indexOf(b.source || 'duckduckgo');
      return aIndex - bIndex;
    });

    return new Response(JSON.stringify({
      query,
      results: uniqueResults.slice(0, limit),
      count: uniqueResults.length,
      sources_searched: searchPromises.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// ============================================================================
// Search Engine Implementations
// ============================================================================

/**
 * Brave Search API - High quality, privacy-focused
 * Free tier: 2,000 queries/month
 */
async function searchBrave(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.web?.results || []).map((r: { title: string; url: string; description: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
    source: 'brave',
  }));
}

/**
 * SerpAPI - Google search results
 * Free tier: 100 searches/month
 */
async function searchSerpAPI(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=${limit}`
  );

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();
  return (data.organic_results || []).map((r: { title: string; link: string; snippet: string }) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || '',
    source: 'google',
  }));
}

/**
 * Bing Web Search API
 * Free tier: 1,000 transactions/month
 */
async function searchBing(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.BING_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`,
    {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Bing API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.webPages?.value || []).map((r: { name: string; url: string; snippet: string }) => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet || '',
    source: 'bing',
  }));
}

/**
 * DuckDuckGo HTML scraping (no API key needed)
 * Uses POST request for reliable results
 */
async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  // DuckDuckGo HTML requires POST request for search results
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse result links with class="result__a" - these are the main result titles/URLs
  const resultLinkRegex = /<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  // Extract all result links
  const links: { url: string; title: string }[] = [];
  let match;

  while ((match = resultLinkRegex.exec(html)) !== null) {
    const url = match[1];
    const title = decodeHTMLEntities(match[2].trim());

    // Skip DuckDuckGo internal links
    if (url.includes('duckduckgo.com')) continue;

    links.push({ url, title });
  }

  // Extract all snippets
  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHTMLEntities(match[1].replace(/<[^>]+>/g, '').trim()));
  }

  // Combine links with snippets
  for (let i = 0; i < links.length && results.length < limit; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
      source: 'duckduckgo',
    });
  }

  return results;
}

/**
 * SearXNG - Self-hosted meta search engine
 * Configure SEARXNG_URL environment variable
 */
async function searchSearXNG(query: string, limit: number): Promise<SearchResult[]> {
  const searxngUrl = process.env.SEARXNG_URL;
  if (!searxngUrl) return [];

  const response = await fetch(
    `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=1`
  );

  if (!response.ok) {
    throw new Error(`SearXNG error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).slice(0, limit).map((r: { title: string; url: string; content: string; engine: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
    source: `searxng-${r.engine || 'mixed'}`,
  }));
}

/**
 * Wikipedia API search
 */
async function searchWikipedia(query: string, limit: number): Promise<SearchResult[]> {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`Wikipedia search failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.query?.search || []).map((r: { title: string; snippet: string }) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: r.snippet.replace(/<[^>]+>/g, ''),
    source: 'wikipedia',
  }));
}

/**
 * Google News via RSS feed
 */
async function searchGoogleNews(query: string, limit: number): Promise<SearchResult[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/2.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Google News RSS failed: ${response.status}`);
  }

  const xml = await response.text();
  const results: SearchResult[] = [];

  // Parse RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && results.length < limit) {
    const item = match[1];

    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    if (titleMatch && linkMatch) {
      results.push({
        title: decodeHTMLEntities(titleMatch[1].trim()),
        url: linkMatch[1].trim(),
        snippet: descMatch ? decodeHTMLEntities(descMatch[1].replace(/<[^>]+>/g, '').trim()).slice(0, 200) : '',
        source: 'news',
      });
    }
  }

  return results;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&[a-z]+;/gi, ' ')
    .trim();
}
