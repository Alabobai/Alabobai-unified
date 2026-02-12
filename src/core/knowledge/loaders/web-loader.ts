/**
 * Alabobai Knowledge System - Web Document Loader
 * Handles URL content extraction
 */

import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import type {
  DocumentLoader,
  DocumentSource,
  ExtractedDocument,
  DocumentMetadata,
  DocumentSection,
  ExtractedLink,
  ExtractedImage,
  LoaderOptions,
} from '../types.js';

// ============================================================================
// WEB LOADER
// ============================================================================

export interface WebLoaderOptions extends LoaderOptions {
  /** User agent string */
  userAgent?: string;
  /** Follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Include images in extraction */
  includeImages?: boolean;
  /** Include links in extraction */
  includeLinks?: boolean;
  /** CSS selectors to extract (main content) */
  contentSelectors?: string[];
  /** CSS selectors to exclude (ads, nav, etc.) */
  excludeSelectors?: string[];
  /** Extract metadata from meta tags */
  extractMetaTags?: boolean;
  /** Render JavaScript (requires browser) */
  renderJS?: boolean;
  /** Wait time for JS rendering in ms */
  renderWait?: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request cookies */
  cookies?: string;
}

interface HTMLMetadata {
  title?: string;
  description?: string;
  author?: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  canonicalUrl?: string;
  publishedTime?: string;
  modifiedTime?: string;
  siteName?: string;
  type?: string;
}

export class WebLoader implements DocumentLoader {
  public readonly supportedExtensions = ['.html', '.htm'];
  public readonly supportedMimeTypes = [
    'text/html',
    'application/xhtml+xml',
  ];

  private options: WebLoaderOptions;

  constructor(options: WebLoaderOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 10 * 1024 * 1024, // 10MB default
      timeout: options.timeout ?? 30000,
      userAgent: options.userAgent ?? 'Alabobai Knowledge Bot/1.0',
      followRedirects: options.followRedirects ?? true,
      maxRedirects: options.maxRedirects ?? 5,
      includeImages: options.includeImages ?? false,
      includeLinks: options.includeLinks ?? true,
      contentSelectors: options.contentSelectors ?? ['article', 'main', '.content', '#content', '.post', '.article'],
      excludeSelectors: options.excludeSelectors ?? ['nav', 'header', 'footer', '.sidebar', '.ads', '.advertisement', 'script', 'style', 'noscript'],
      extractMetaTags: options.extractMetaTags ?? true,
      renderJS: options.renderJS ?? false,
      renderWait: options.renderWait ?? 2000,
      headers: options.headers ?? {},
      cookies: options.cookies,
      options: options.options ?? {},
    };
  }

  getName(): string {
    return 'WebLoader';
  }

  canLoad(source: DocumentSource): boolean {
    if (source.type === 'url') {
      return true;
    }

    if (source.mimeType && this.supportedMimeTypes.includes(source.mimeType)) {
      return true;
    }

    // Check if content looks like a URL
    if (source.type === 'text' && this.isValidURL(source.content)) {
      return true;
    }

    return false;
  }

  async load(source: DocumentSource): Promise<ExtractedDocument> {
    let url: string;
    let html: string;

    // Determine URL
    if (source.type === 'url') {
      url = source.content;
    } else if (source.type === 'text' && this.isValidURL(source.content)) {
      url = source.content;
    } else if (source.type === 'text') {
      // Raw HTML content
      url = source.name;
      html = source.content;
    } else {
      throw new Error(`Unsupported source type for web loader: ${source.type}`);
    }

    // Fetch content if URL
    if (!html!) {
      html = await this.fetchURL(url);
    }

    // Generate content hash
    const contentHash = crypto.createHash('sha256').update(html).digest('hex');

    // Extract metadata from HTML
    const htmlMeta = this.options.extractMetaTags
      ? this.extractHTMLMetadata(html)
      : {};

    // Extract main content
    const content = this.extractMainContent(html);

    // Extract sections
    const sections = this.extractSections(html);

    // Extract links if enabled
    const links = this.options.includeLinks
      ? this.extractLinks(html, url)
      : undefined;

    // Extract images if enabled
    const images = this.options.includeImages
      ? this.extractImages(html, url)
      : undefined;

    // Build metadata
    const metadata: DocumentMetadata = {
      id: uuid(),
      source: {
        ...source,
        type: 'url',
        content: url,
      },
      format: 'html',
      title: htmlMeta.ogTitle || htmlMeta.title || this.extractTitle(url),
      author: htmlMeta.author,
      createdAt: htmlMeta.publishedTime ? new Date(htmlMeta.publishedTime) : undefined,
      modifiedAt: htmlMeta.modifiedTime ? new Date(htmlMeta.modifiedTime) : undefined,
      size: Buffer.byteLength(html, 'utf-8'),
      wordCount: this.countWords(content),
      charCount: content.length,
      contentHash,
      version: 1,
      custom: {
        ...source.metadata,
        url,
        canonicalUrl: htmlMeta.canonicalUrl,
        description: htmlMeta.ogDescription || htmlMeta.description,
        keywords: htmlMeta.keywords,
        siteName: htmlMeta.siteName,
        ogImage: htmlMeta.ogImage,
        pageType: htmlMeta.type,
      },
    };

    return {
      metadata,
      content,
      sections,
      links,
      images,
      extractedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private isValidURL(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async fetchURL(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const headers: Record<string, string> = {
        'User-Agent': this.options.userAgent!,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...this.options.headers,
      };

      if (this.options.cookies) {
        headers['Cookie'] = this.options.cookies;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: this.options.followRedirects ? 'follow' : 'manual',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      const html = await response.text();

      // Check size
      if (this.options.maxFileSize && html.length > this.options.maxFileSize) {
        throw new Error(`Content size exceeds maximum allowed ${this.options.maxFileSize}`);
      }

      return html;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractHTMLMetadata(html: string): HTMLMetadata {
    const meta: HTMLMetadata = {};

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      meta.title = this.decodeHTMLEntities(titleMatch[1].trim());
    }

    // Helper to extract meta tag content
    const getMetaContent = (nameOrProperty: string): string | undefined => {
      const patterns = [
        new RegExp(`<meta[^>]+name=["']${nameOrProperty}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${nameOrProperty}["']`, 'i'),
        new RegExp(`<meta[^>]+property=["']${nameOrProperty}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${nameOrProperty}["']`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          return this.decodeHTMLEntities(match[1]);
        }
      }
      return undefined;
    };

    // Standard meta tags
    meta.description = getMetaContent('description');
    meta.author = getMetaContent('author');
    const keywords = getMetaContent('keywords');
    if (keywords) {
      meta.keywords = keywords.split(',').map(k => k.trim());
    }

    // Open Graph tags
    meta.ogTitle = getMetaContent('og:title');
    meta.ogDescription = getMetaContent('og:description');
    meta.ogImage = getMetaContent('og:image');
    meta.ogUrl = getMetaContent('og:url');
    meta.siteName = getMetaContent('og:site_name');
    meta.type = getMetaContent('og:type');

    // Article metadata
    meta.publishedTime = getMetaContent('article:published_time') ||
                         getMetaContent('datePublished');
    meta.modifiedTime = getMetaContent('article:modified_time') ||
                        getMetaContent('dateModified');

    // Canonical URL
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (canonicalMatch) {
      meta.canonicalUrl = canonicalMatch[1];
    }

    return meta;
  }

  private extractMainContent(html: string): string {
    // Remove excluded elements
    let processedHtml = html;
    for (const selector of this.options.excludeSelectors!) {
      // Simple tag removal
      if (selector.startsWith('.') || selector.startsWith('#')) {
        // Skip class/id selectors for simple processing
        continue;
      }
      const tagRegex = new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>`, 'gi');
      processedHtml = processedHtml.replace(tagRegex, '');
    }

    // Try to find main content areas
    let mainContent = '';
    for (const selector of this.options.contentSelectors!) {
      if (selector.startsWith('.') || selector.startsWith('#')) {
        continue; // Skip complex selectors
      }
      const contentMatch = processedHtml.match(
        new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'i')
      );
      if (contentMatch && contentMatch[1].length > mainContent.length) {
        mainContent = contentMatch[1];
      }
    }

    // Fall back to body content
    if (!mainContent) {
      const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      mainContent = bodyMatch ? bodyMatch[1] : processedHtml;
    }

    // Convert HTML to plain text
    return this.htmlToText(mainContent);
  }

  private htmlToText(html: string): string {
    let text = html;

    // Remove script and style content
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Convert block elements to newlines
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');

    // Convert list items
    text = text.replace(/<li[^>]*>/gi, '\n- ');

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = this.decodeHTMLEntities(text);

    // Normalize whitespace
    text = text.replace(/\t/g, ' ');
    text = text.replace(/  +/g, ' ');
    text = text.replace(/\n +/g, '\n');
    text = text.replace(/ +\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&mdash;': '-',
      '&ndash;': '-',
      '&hellip;': '...',
      '&copy;': '(c)',
      '&reg;': '(R)',
      '&trade;': '(TM)',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }

    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

    return decoded;
  }

  private extractSections(html: string): DocumentSection[] {
    const sections: DocumentSection[] = [];

    // Extract headings and their content
    const headingRegex = /<h([1-6])[^>]*>([^<]*)<\/h\1>/gi;
    let match;
    let lastIndex = 0;
    let lastHeading: { level: number; title: string; startIndex: number } | null = null;

    while ((match = headingRegex.exec(html)) !== null) {
      // Save previous section
      if (lastHeading) {
        const content = this.htmlToText(html.slice(lastHeading.startIndex, match.index));
        if (content.trim()) {
          sections.push({
            title: lastHeading.title,
            level: lastHeading.level,
            content: content.trim(),
            startIndex: lastHeading.startIndex,
            endIndex: match.index,
          });
        }
      }

      lastHeading = {
        level: parseInt(match[1]),
        title: this.decodeHTMLEntities(match[2].trim()),
        startIndex: match.index + match[0].length,
      };
      lastIndex = match.index;
    }

    // Add final section
    if (lastHeading) {
      const content = this.htmlToText(html.slice(lastHeading.startIndex));
      if (content.trim()) {
        sections.push({
          title: lastHeading.title,
          level: lastHeading.level,
          content: content.trim(),
          startIndex: lastHeading.startIndex,
          endIndex: html.length,
        });
      }
    }

    return sections;
  }

  private extractLinks(html: string, baseUrl: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      const text = this.decodeHTMLEntities(match[2].trim());

      // Skip empty or javascript links
      if (!url || url.startsWith('javascript:') || url.startsWith('#')) {
        if (url.startsWith('#')) {
          links.push({
            text: text || url,
            url,
            type: 'anchor',
            position: match.index,
          });
        }
        continue;
      }

      // Resolve relative URLs
      try {
        url = new URL(url, baseUrl).href;
      } catch {
        continue;
      }

      // Determine link type
      const baseHost = new URL(baseUrl).host;
      const linkHost = new URL(url).host;
      const type = baseHost === linkHost ? 'internal' : 'external';

      links.push({
        text: text || url,
        url,
        type,
        position: match.index,
      });
    }

    return links;
  }

  private extractImages(html: string, baseUrl: string): ExtractedImage[] {
    const images: ExtractedImage[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      let src = match[1];
      const alt = match[2] ? this.decodeHTMLEntities(match[2]) : undefined;

      // Skip data URIs and empty sources
      if (!src || src.startsWith('data:')) {
        continue;
      }

      // Resolve relative URLs
      try {
        src = new URL(src, baseUrl).href;
      } catch {
        continue;
      }

      images.push({
        caption: alt,
        url: src,
        position: match.index,
      });
    }

    return images;
  }

  private extractTitle(url: string): string {
    try {
      const parsed = new URL(url);
      // Get last path segment or host
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        return decodeURIComponent(pathSegments[pathSegments.length - 1])
          .replace(/[-_]/g, ' ')
          .replace(/\.\w+$/, ''); // Remove extension
      }
      return parsed.host;
    } catch {
      return url;
    }
  }

  private countWords(text: string): number {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createWebLoader(options?: WebLoaderOptions): WebLoader {
  return new WebLoader(options);
}

export default WebLoader;
