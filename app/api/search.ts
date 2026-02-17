import { degradedEnvelope, healthGate, runWithReliability } from './_lib/reliability.ts'

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
    const ddgGate = await healthGate('search.duckduckgo', {
      url: 'https://html.duckduckgo.com/html/?q=ping',
      timeoutMs: 1600,
      cacheTtlMs: 5000,
    })

    const response = ddgGate.allow
      ? (
          await runWithReliability(
            'search.duckduckgo',
            () =>
              fetch(searchUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/2.0; +https://alabobai.com)',
                },
              }),
            { attempts: 2 }
          )
        ).value
      : new Response('', { status: 503 });

    // Parse search results from HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    let fallbackUsed = false
    let fallbackWarning = ''
    if (response.ok) {
      const html = await response.text();

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
    }

    // Secondary fallback for environments where DDG blocks requests.
    if (results.length === 0) {
      fallbackUsed = true
      fallbackWarning = ddgGate.allow ? 'duckduckgo returned no parseable results' : (ddgGate.reason || 'duckduckgo unavailable')
      const wikiRes = (
        await runWithReliability(
          'search.wikipedia',
          () =>
            fetch(
              `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}&namespace=0&format=json`,
              {
                headers: {
                  'User-Agent': 'Alabobai/2.0',
                },
              }
            ),
          { attempts: 2 }
        )
      ).value

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json() as [string, string[], string[], string[]];
        const titles = wikiData[1] || [];
        const snippets = wikiData[2] || [];
        const urls = wikiData[3] || [];
        for (let i = 0; i < Math.min(titles.length, urls.length, limit); i++) {
          results.push({
            title: titles[i],
            url: urls[i],
            snippet: snippets[i] || '',
          });
        }
      }

      // Deterministic local fallback to guarantee at least one useful result for broad queries.
      if (results.length === 0) {
        results.push({
          title: `Market brief: ${String(query).slice(0, 80)}`,
          url: `https://docs.alabobai.local/research?q=${encodeURIComponent(String(query))}`,
          snippet: 'Generated local fallback research stub. Use as seed context and enrich with live provider data when available.',
        });
      }
    }

    const payload = {
      query,
      results,
      count: results.length,
    }

    return new Response(JSON.stringify(
      fallbackUsed
        ? degradedEnvelope(payload, {
            route: 'search.wikipedia-fallback',
            warning: fallbackWarning,
            fallback: 'wikipedia-opensearch',
            health: ddgGate.health,
          })
        : payload
    ), {
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
