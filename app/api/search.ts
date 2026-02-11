export const config = {
  runtime: 'edge',
};

// Web search using DuckDuckGo (no API key needed)
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
    const { query, limit = 5 } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Use DuckDuckGo HTML search (no API key needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/2.0; +https://alabobai.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const html = await response.text();

    // Parse search results from HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Extract results using regex (simple parsing)
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1];
      const title = match[2].trim();
      const snippet = match[3].trim();

      if (url && title && !url.includes('duckduckgo.com')) {
        results.push({ title, url, snippet });
      }
    }

    // Fallback: simpler parsing if regex fails
    if (results.length === 0) {
      const titleRegex = /<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>/gi;
      const urlRegex = /href="(https?:\/\/[^"]+)"/gi;

      const titles: string[] = [];
      const urls: string[] = [];

      while ((match = titleRegex.exec(html)) !== null) {
        titles.push(match[1].trim());
      }

      while ((match = urlRegex.exec(html)) !== null) {
        if (!match[1].includes('duckduckgo.com')) {
          urls.push(match[1]);
        }
      }

      for (let i = 0; i < Math.min(titles.length, urls.length, limit); i++) {
        results.push({
          title: titles[i],
          url: urls[i],
          snippet: '',
        });
      }
    }

    return new Response(JSON.stringify({
      query,
      results,
      count: results.length,
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
