export const config = {
  runtime: 'edge',
};

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
    const { command, url } = await req.json();

    // Web agent commands
    const actions = {
      search: async (query: string) => {
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)' },
        });
        const html = await response.text();
        // Extract search results (simplified)
        const results: string[] = [];
        const regex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
          results.push(`${match[2]}: ${match[1]}`);
        }
        return { results };
      },

      fetch: async (targetUrl: string) => {
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)' },
        });
        const text = await response.text();
        // Return truncated content
        return {
          url: targetUrl,
          status: response.status,
          contentLength: text.length,
          preview: text.substring(0, 2000),
        };
      },

      extract: async (targetUrl: string) => {
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/1.0)' },
        });
        const html = await response.text();

        // Extract title
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : '';

        // Extract meta description
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const description = descMatch ? descMatch[1] : '';

        // Extract headings
        const headings: string[] = [];
        const h1Regex = /<h1[^>]*>([^<]+)<\/h1>/gi;
        let match;
        while ((match = h1Regex.exec(html)) !== null) {
          headings.push(match[1].trim());
        }

        return { title, description, headings, url: targetUrl };
      },
    };

    let result;
    switch (command) {
      case 'search':
        result = await actions.search(url);
        break;
      case 'fetch':
        result = await actions.fetch(url);
        break;
      case 'extract':
        result = await actions.extract(url);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown command' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Web Agent Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to execute command' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
