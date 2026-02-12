/**
 * Proxy API for Browser Automation
 *
 * Handles:
 * - Fetching page content server-side
 * - Extracting page information
 * - Bypassing CORS restrictions
 * - Taking screenshots (via external service)
 */

export const config = {
  runtime: 'edge',
}

interface ProxyRequest {
  action: 'navigate' | 'fetch' | 'extract' | 'screenshot' | 'search'
  url?: string
  query?: string
}

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body: ProxyRequest = await req.json()
    const { action, url, query } = body

    switch (action) {
      case 'navigate':
      case 'fetch':
        return await handleFetch(url!)

      case 'extract':
        return await handleExtract(url!)

      case 'screenshot':
        return await handleScreenshot(url!)

      case 'search':
        return await handleSearch(query!)

      default:
        return errorResponse('Unknown action', 400)
    }
  } catch (error) {
    console.error('Proxy error:', error)
    return errorResponse('Proxy request failed', 500)
  }
}

async function handleFetch(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    const html = await response.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : ''

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
    const description = descMatch ? decodeEntities(descMatch[1]) : ''

    // Create a sanitized version of the HTML for iframe display
    const sanitizedHtml = sanitizeHtmlForIframe(html, url)

    return jsonResponse({
      success: true,
      url,
      title,
      description,
      content: sanitizedHtml,
      rawLength: html.length,
    })
  } catch (error) {
    console.error('Fetch error:', error)
    return errorResponse('Failed to fetch URL', 500)
  }
}

async function handleExtract(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    const html = await response.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : ''

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    const description = descMatch ? decodeEntities(descMatch[1]) : ''

    // Extract headings
    const headings: string[] = []
    const headingRegex = /<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi
    let match
    while ((match = headingRegex.exec(html)) !== null && headings.length < 10) {
      const heading = decodeEntities(match[1].trim())
      if (heading && heading.length > 2) {
        headings.push(heading)
      }
    }

    // Extract main text content (simplified)
    const textContent = extractTextContent(html)

    // Extract links
    const links: { text: string; href: string }[] = []
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    while ((match = linkRegex.exec(html)) !== null && links.length < 20) {
      const href = match[1]
      const text = decodeEntities(match[2].trim())
      if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({
          text: text.slice(0, 100),
          href: href.startsWith('http') ? href : new URL(href, url).href,
        })
      }
    }

    // Extract images
    const images: { alt: string; src: string }[] = []
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi
    while ((match = imgRegex.exec(html)) !== null && images.length < 10) {
      const src = match[1]
      const alt = match[2] || ''
      if (src && !src.startsWith('data:')) {
        images.push({
          alt: decodeEntities(alt),
          src: src.startsWith('http') ? src : new URL(src, url).href,
        })
      }
    }

    return jsonResponse({
      url,
      title,
      description,
      headings,
      text: textContent.slice(0, 5000),
      links,
      images,
    })
  } catch (error) {
    console.error('Extract error:', error)
    return errorResponse('Failed to extract content', 500)
  }
}

async function handleScreenshot(url: string) {
  // Use a free screenshot service
  // Options: screenshotmachine.com, screenshot.guru, or similar
  try {
    // Using a placeholder screenshot service
    // In production, you would use a real service like Puppeteer/Playwright
    // or a screenshot API service

    // For now, we'll generate a placeholder that indicates the URL
    const placeholderSvg = generatePlaceholderScreenshot(url)

    return jsonResponse({
      success: true,
      url,
      screenshot: `data:image/svg+xml;base64,${btoa(placeholderSvg)}`,
    })
  } catch (error) {
    console.error('Screenshot error:', error)
    return errorResponse('Failed to take screenshot', 500)
  }
}

async function handleSearch(query: string) {
  try {
    // Use DuckDuckGo HTML API (no auth required)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const html = await response.text()

    // Extract search results
    const results: { title: string; url: string; snippet: string }[] = []
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi

    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
      results.push({
        url: match[1],
        title: decodeEntities(match[2].trim()),
        snippet: decodeEntities(match[3].trim()),
      })
    }

    // If the above regex doesn't work, try a simpler approach
    if (results.length === 0) {
      const simpleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
      while ((match = simpleRegex.exec(html)) !== null && results.length < 10) {
        results.push({
          url: match[1],
          title: decodeEntities(match[2].trim()),
          snippet: '',
        })
      }
    }

    return jsonResponse({
      query,
      results,
      resultCount: results.length,
    })
  } catch (error) {
    console.error('Search error:', error)
    return errorResponse('Search failed', 500)
  }
}

// Helper functions

function sanitizeHtmlForIframe(html: string, baseUrl: string): string {
  // Add base tag for relative URLs
  const baseTag = `<base href="${baseUrl}" target="_blank">`

  // Remove scripts and potentially dangerous elements
  let sanitized = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')

  // Inject base tag after head
  if (sanitized.includes('<head>')) {
    sanitized = sanitized.replace('<head>', `<head>${baseTag}`)
  } else if (sanitized.includes('<html>')) {
    sanitized = sanitized.replace('<html>', `<html><head>${baseTag}</head>`)
  } else {
    sanitized = `<html><head>${baseTag}</head><body>${sanitized}</body></html>`
  }

  return sanitized
}

function extractTextContent(html: string): string {
  // Remove scripts, styles, and tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return decodeEntities(text)
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '--',
    '&ndash;': '-',
    '&hellip;': '...',
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char)
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  )

  return result
}

function generatePlaceholderScreenshot(url: string): string {
  const hostname = new URL(url).hostname
  return `
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      <rect x="0" y="0" width="100%" height="60" fill="#1e293b"/>
      <circle cx="30" cy="30" r="8" fill="#ef4444"/>
      <circle cx="55" cy="30" r="8" fill="#eab308"/>
      <circle cx="80" cy="30" r="8" fill="#22c55e"/>
      <rect x="120" y="18" width="960" height="24" rx="12" fill="#334155"/>
      <text x="140" y="36" fill="#94a3b8" font-family="system-ui" font-size="14">${hostname}</text>
      <rect x="40" y="100" width="400" height="32" rx="4" fill="#e2e8f0"/>
      <rect x="40" y="160" width="100%" height="1" fill="#e2e8f0"/>
      <rect x="40" y="200" width="600" height="24" rx="4" fill="#e2e8f0"/>
      <rect x="40" y="240" width="500" height="16" rx="4" fill="#f1f5f9"/>
      <rect x="40" y="270" width="550" height="16" rx="4" fill="#f1f5f9"/>
      <rect x="40" y="300" width="450" height="16" rx="4" fill="#f1f5f9"/>
      <rect x="40" y="360" width="300" height="200" rx="8" fill="#e2e8f0"/>
      <rect x="360" y="360" width="300" height="200" rx="8" fill="#e2e8f0"/>
      <rect x="680" y="360" width="300" height="200" rx="8" fill="#e2e8f0"/>
      <text x="600" y="700" fill="#94a3b8" font-family="system-ui" font-size="16" text-anchor="middle">
        Preview of ${hostname}
      </text>
    </svg>
  `
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
