/**
 * Alabobai Knowledge System - PDF Document Loader
 * Handles PDF file extraction using pdf-parse
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
  LoaderOptions,
} from '../types.js';

// ============================================================================
// PDF LOADER
// ============================================================================

export interface PDFLoaderOptions extends LoaderOptions {
  /** Maximum number of pages to process */
  maxPages?: number;
  /** Whether to extract page-by-page */
  extractByPage?: boolean;
  /** OCR fallback for scanned PDFs */
  enableOCR?: boolean;
}

interface PDFData {
  numpages: number;
  numrender: number;
  info: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  };
  metadata: Record<string, unknown> | null;
  text: string;
  version: string;
}

interface PDFPageData {
  pageIndex: number;
  pageContent: string;
}

export class PDFLoader implements DocumentLoader {
  public readonly supportedExtensions = ['.pdf'];
  public readonly supportedMimeTypes = ['application/pdf'];

  private options: PDFLoaderOptions;
  private pdfParse: ((dataBuffer: Buffer) => Promise<PDFData>) | null = null;

  constructor(options: PDFLoaderOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 100 * 1024 * 1024, // 100MB default
      timeout: options.timeout ?? 60000,
      maxPages: options.maxPages,
      extractByPage: options.extractByPage ?? true,
      enableOCR: options.enableOCR ?? false,
      options: options.options ?? {},
    };
  }

  getName(): string {
    return 'PDFLoader';
  }

  canLoad(source: DocumentSource): boolean {
    if (source.mimeType === 'application/pdf') {
      return true;
    }

    const ext = path.extname(source.name).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async load(source: DocumentSource): Promise<ExtractedDocument> {
    if (source.type !== 'file') {
      throw new Error('PDF loader only supports file sources');
    }

    const filePath = source.content;

    // Check file exists and get stats
    let stats: { size: number; mtime: Date; birthtime: Date };
    try {
      stats = await fs.stat(filePath);

      // Check file size
      if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds maximum allowed ${this.options.maxFileSize}`);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }

    // Dynamically import pdf-parse
    await this.ensurePdfParse();

    // Read and parse PDF
    const dataBuffer = await fs.readFile(filePath);
    const contentHash = crypto.createHash('sha256').update(dataBuffer).digest('hex');

    let pdfData: PDFData;
    try {
      pdfData = await this.pdfParse!(dataBuffer);
    } catch (error: unknown) {
      throw new Error(`Failed to parse PDF: ${(error as Error).message}`);
    }

    // Extract text content
    let content = pdfData.text;

    // Apply max pages limit if set
    if (this.options.maxPages && pdfData.numpages > this.options.maxPages) {
      // Re-extract with page limit (pdf-parse doesn't support this directly)
      // We'll truncate the content approximately
      const avgPageLength = content.length / pdfData.numpages;
      content = content.slice(0, Math.floor(avgPageLength * this.options.maxPages));
    }

    // Extract sections (page-based for PDFs)
    const sections = this.options.extractByPage
      ? await this.extractPageSections(content, pdfData.numpages)
      : this.extractTextSections(content);

    // Parse PDF dates
    const createdAt = this.parsePDFDate(pdfData.info.CreationDate);
    const modifiedAt = this.parsePDFDate(pdfData.info.ModDate);

    // Build metadata
    const metadata: DocumentMetadata = {
      id: uuid(),
      source,
      format: 'pdf',
      title: pdfData.info.Title || this.extractTitle(source.name),
      author: pdfData.info.Author,
      createdAt: createdAt || stats.birthtime,
      modifiedAt: modifiedAt || stats.mtime,
      size: stats.size,
      pageCount: pdfData.numpages,
      wordCount: this.countWords(content),
      charCount: content.length,
      language: this.detectLanguage(content),
      contentHash,
      version: 1,
      custom: {
        ...source.metadata,
        pdfProducer: pdfData.info.Producer,
        pdfCreator: pdfData.info.Creator,
        pdfVersion: pdfData.version,
        pdfSubject: pdfData.info.Subject,
        pdfKeywords: pdfData.info.Keywords,
      },
    };

    return {
      metadata,
      content,
      sections,
      extractedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async ensurePdfParse(): Promise<void> {
    if (this.pdfParse) return;

    try {
      // Dynamic import for optional dependency
      // @ts-expect-error - pdf-parse is an optional dependency
      const pdfParseModule = await import('pdf-parse');
      this.pdfParse = pdfParseModule.default || pdfParseModule;
    } catch {
      throw new Error(
        'pdf-parse is required for PDF loading. Install it with: npm install pdf-parse'
      );
    }
  }

  private async extractPageSections(content: string, pageCount: number): Promise<DocumentSection[]> {
    const sections: DocumentSection[] = [];

    // PDF page markers are typically form feeds (\f) or similar
    // If content has form feeds, use them; otherwise estimate
    const pageBreaks = content.split('\f');

    if (pageBreaks.length > 1) {
      let currentIndex = 0;
      pageBreaks.forEach((pageContent, index) => {
        if (pageContent.trim()) {
          sections.push({
            title: `Page ${index + 1}`,
            level: 1,
            content: pageContent.trim(),
            startIndex: currentIndex,
            endIndex: currentIndex + pageContent.length,
          });
        }
        currentIndex += pageContent.length + 1; // +1 for form feed
      });
    } else {
      // Estimate page breaks based on content length
      const avgPageLength = Math.ceil(content.length / pageCount);

      for (let i = 0; i < pageCount; i++) {
        const startIndex = i * avgPageLength;
        const endIndex = Math.min((i + 1) * avgPageLength, content.length);
        const pageContent = content.slice(startIndex, endIndex);

        if (pageContent.trim()) {
          sections.push({
            title: `Page ${i + 1}`,
            level: 1,
            content: pageContent.trim(),
            startIndex,
            endIndex,
          });
        }
      }
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
      currentIndex += para.length + 2;
    }

    return sections;
  }

  private parsePDFDate(dateStr?: string): Date | undefined {
    if (!dateStr) return undefined;

    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }

    // Try standard date parsing
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private extractTitle(filename: string): string {
    return path.basename(filename, path.extname(filename));
  }

  private countWords(text: string): number {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }

  private detectLanguage(content: string): string {
    const sample = content.slice(0, 1000).toLowerCase();

    const patterns: Record<string, RegExp[]> = {
      en: [/\bthe\b/, /\band\b/, /\bof\b/, /\bis\b/, /\bto\b/],
      es: [/\bel\b/, /\bla\b/, /\bde\b/, /\bque\b/, /\by\b/],
      fr: [/\ble\b/, /\bla\b/, /\bde\b/, /\bet\b/, /\best\b/],
      de: [/\bder\b/, /\bdie\b/, /\bund\b/, /\bist\b/, /\bzu\b/],
    };

    const scores: Record<string, number> = {};

    for (const [lang, regexes] of Object.entries(patterns)) {
      scores[lang] = regexes.filter(regex => regex.test(sample)).length;
    }

    const bestMatch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return bestMatch && bestMatch[1] > 0 ? bestMatch[0] : 'unknown';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPDFLoader(options?: PDFLoaderOptions): PDFLoader {
  return new PDFLoader(options);
}

export default PDFLoader;
