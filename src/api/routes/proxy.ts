import { Router, Request, Response } from 'express';

const router = Router();

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHtmlForIframe(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl}" target="_blank">`;
  let sanitized = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');

  if (sanitized.includes('<head>')) {
    sanitized = sanitized.replace('<head>', `<head>${baseTag}`);
  } else {
    sanitized = `<html><head>${baseTag}</head><body>${sanitized}</body></html>`;
  }

  return sanitized;
}

router.post('/', async (req: Request, res: Response) => {
  const { action, url, query } = req.body || {};

  if (action === 'search') {
    if (!query) return res.status(400).json({ error: 'query is required' });
    return res.json({ query, results: [] });
  }

  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AlabobaiProxy/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await response.text();

    if (action === 'extract') {
      const text = decodeEntities(
        html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
      ).slice(0, 8000);

      return res.json({ url, text, title: '' });
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : '';
    const content = sanitizeHtmlForIframe(html, url);

    return res.json({ success: true, url, title, content });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Proxy request failed' });
  }
});

export function createProxyRouter() {
  return router;
}
