/**
 * Alabobai Knowledge System - Text Document Loader
 * Handles TXT and MD file formats
 */

import { promises as fs } from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import type {
  DocumentLoader,
  DocumentSource,
  ExtractedDocument,
  DocumentMetadata,
  DocumentSection,
  ExtractedLink,
  LoaderOptions,
} from '../types.js';

// ============================================================================
// TEXT LOADER
// ============================================================================

export class TextLoader implements DocumentLoader {
  public readonly supportedExtensions = ['.txt', '.md', '.markdown', '.text', '.rst', '.asciidoc'];
  public readonly supportedMimeTypes = [
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'text/x-rst',
    'text/asciidoc',
  ];

  private options: LoaderOptions;

  constructor(options: LoaderOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 50 * 1024 * 1024, // 50MB default
      timeout: options.timeout ?? 30000,
      options: options.options ?? {},
    };
  }

  getName(): string {
    return 'TextLoader';
  }

  canLoad(source: DocumentSource): boolean {
    if (source.type === 'text') {
      return true;
    }

    if (source.mimeType && this.supportedMimeTypes.includes(source.mimeType)) {
      return true;
    }

    const ext = path.extname(source.name).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async load(source: DocumentSource): Promise<ExtractedDocument> {
    let content: string;
    let stats: { size?: number; mtime?: Date; birthtime?: Date } = {};

    // Load content based on source type
    if (source.type === 'text') {
      content = source.content;
    } else if (source.type === 'file') {
      const filePath = source.content;

      // Check file exists and get stats
      try {
        const fileStats = await fs.stat(filePath);
        stats = {
          size: fileStats.size,
          mtime: fileStats.mtime,
          birthtime: fileStats.birthtime,
        };

        // Check file size
        if (this.options.maxFileSize && fileStats.size > this.options.maxFileSize) {
          throw new Error(`File size ${fileStats.size} exceeds maximum allowed ${this.options.maxFileSize}`);
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${filePath}`);
        }
        throw error;
      }

      content = await fs.readFile(filePath, 'utf-8');
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }

    // Generate content hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // Detect format
    const ext = path.extname(source.name).toLowerCase();
    const isMarkdown = ['.md', '.markdown'].includes(ext) ||
                       (source.mimeType?.includes('markdown') ?? false);

    // Extract sections and links based on format
    const sections = isMarkdown
      ? this.extractMarkdownSections(content)
      : this.extractTextSections(content);

    const links = isMarkdown
      ? this.extractMarkdownLinks(content)
      : [];

    // Build metadata
    const metadata: DocumentMetadata = {
      id: uuid(),
      source,
      format: isMarkdown ? 'md' : 'txt',
      title: this.extractTitle(content, source.name, isMarkdown),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      size: stats.size ?? Buffer.byteLength(content, 'utf-8'),
      wordCount: this.countWords(content),
      charCount: content.length,
      language: this.detectLanguage(content),
      contentHash,
      version: 1,
      custom: source.metadata,
    };

    return {
      metadata,
      content,
      sections,
      links,
      extractedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private extractTitle(content: string, filename: string, isMarkdown: boolean): string {
    if (isMarkdown) {
      // Try to find H1 heading
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) {
        return h1Match[1].trim();
      }

      // Try front matter title
      const frontMatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
      if (frontMatterMatch) {
        return frontMatterMatch[1].trim();
      }
    }

    // First non-empty line for text files
    const firstLine = content.split('\n').find(line => line.trim().length > 0);
    if (firstLine && firstLine.length < 200) {
      return firstLine.trim();
    }

    // Fall back to filename without extension
    return path.basename(filename, path.extname(filename));
  }

  private extractMarkdownSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const lines = content.split('\n');
    let currentSection: DocumentSection | null = null;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // Save previous section
        if (currentSection) {
          currentSection.endIndex = currentIndex - 1;
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: headingMatch[2].trim(),
          level: headingMatch[1].length,
          content: '',
          startIndex: currentIndex,
          endIndex: currentIndex,
        };
      } else if (currentSection) {
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      }

      currentIndex += line.length + 1; // +1 for newline
    }

    // Save last section
    if (currentSection) {
      currentSection.endIndex = currentIndex;
      sections.push(currentSection);
    }

    return sections;
  }

  private extractTextSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];

    // Split by double newlines (paragraphs)
    const paragraphs = content.split(/\n\s*\n/);
    let currentIndex = 0;

    for (const para of paragraphs) {
      if (para.trim()) {
        sections.push({
          content: para.trim(),
          startIndex: currentIndex,
          endIndex: currentIndex + para.length,
        });
      }
      currentIndex += para.length + 2; // +2 for double newline
    }

    return sections;
  }

  private extractMarkdownLinks(content: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];

    // Standard markdown links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      links.push({
        text: match[1],
        url,
        type: this.classifyLinkType(url),
        position: match.index,
      });
    }

    // Reference-style links [text][ref] with [ref]: url
    const refRegex = /^\[([^\]]+)\]:\s*(.+)$/gm;
    while ((match = refRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2].trim(),
        type: this.classifyLinkType(match[2]),
        position: match.index,
      });
    }

    // Auto-links <url>
    const autoLinkRegex = /<(https?:\/\/[^>]+)>/g;
    while ((match = autoLinkRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[1],
        type: 'external',
        position: match.index,
      });
    }

    return links;
  }

  private classifyLinkType(url: string): 'internal' | 'external' | 'anchor' {
    if (url.startsWith('#')) {
      return 'anchor';
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return 'external';
    }
    return 'internal';
  }

  private countWords(text: string): number {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }

  private detectLanguage(content: string): string {
    // Simple heuristic language detection
    // In production, use a library like franc or langdetect

    const sample = content.slice(0, 1000).toLowerCase();

    // Check for common language patterns
    const patterns: Record<string, RegExp[]> = {
      en: [/\bthe\b/, /\band\b/, /\bof\b/, /\bis\b/, /\bto\b/],
      es: [/\bel\b/, /\bla\b/, /\bde\b/, /\bque\b/, /\by\b/],
      fr: [/\ble\b/, /\bla\b/, /\bde\b/, /\bet\b/, /\best\b/],
      de: [/\bder\b/, /\bdie\b/, /\bund\b/, /\bist\b/, /\bzu\b/],
      pt: [/\bo\b/, /\ba\b/, /\bde\b/, /\bque\b/, /\be\b/],
      zh: [/[\u4e00-\u9fff]/],
      ja: [/[\u3040-\u309f\u30a0-\u30ff]/],
      ko: [/[\uac00-\ud7a3]/],
      ar: [/[\u0600-\u06ff]/],
      ru: [/[\u0400-\u04ff]/],
    };

    const scores: Record<string, number> = {};

    for (const [lang, regexes] of Object.entries(patterns)) {
      scores[lang] = regexes.filter(regex => regex.test(sample)).length;
    }

    const bestMatch = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0];

    return bestMatch && bestMatch[1] > 0 ? bestMatch[0] : 'unknown';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createTextLoader(options?: LoaderOptions): TextLoader {
  return new TextLoader(options);
}

export default TextLoader;
