/**
 * Alabobai Knowledge System - JSON Document Loader
 * Handles JSON and JSONL file formats
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
  ExtractedTable,
  LoaderOptions,
} from '../types.js';

// ============================================================================
// JSON LOADER
// ============================================================================

export interface JSONLoaderOptions extends LoaderOptions {
  /** JSON path to extract content from (e.g., "data.items") */
  contentPath?: string;
  /** Fields to extract as metadata */
  metadataFields?: string[];
  /** Text fields to concatenate for content */
  textFields?: string[];
  /** Whether to flatten nested objects */
  flatten?: boolean;
  /** Separator for flattened keys */
  flattenSeparator?: string;
  /** Maximum depth for nested extraction */
  maxDepth?: number;
}

export class JSONLoader implements DocumentLoader {
  public readonly supportedExtensions = ['.json', '.jsonl', '.ndjson'];
  public readonly supportedMimeTypes = [
    'application/json',
    'application/x-ndjson',
    'application/jsonl',
    'text/json',
  ];

  private options: JSONLoaderOptions;

  constructor(options: JSONLoaderOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 50 * 1024 * 1024, // 50MB default
      timeout: options.timeout ?? 30000,
      contentPath: options.contentPath,
      metadataFields: options.metadataFields ?? ['id', 'title', 'author', 'date', 'url', 'source'],
      textFields: options.textFields,
      flatten: options.flatten ?? false,
      flattenSeparator: options.flattenSeparator ?? '.',
      maxDepth: options.maxDepth ?? 10,
      options: options.options ?? {},
    };
  }

  getName(): string {
    return 'JSONLoader';
  }

  canLoad(source: DocumentSource): boolean {
    if (source.mimeType && this.supportedMimeTypes.includes(source.mimeType)) {
      return true;
    }

    const ext = path.extname(source.name).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async load(source: DocumentSource): Promise<ExtractedDocument> {
    let rawContent: string;
    let stats: { size?: number; mtime?: Date; birthtime?: Date } = {};

    // Load content based on source type
    if (source.type === 'text') {
      rawContent = source.content;
    } else if (source.type === 'file') {
      const filePath = source.content;

      try {
        const fileStats = await fs.stat(filePath);
        stats = {
          size: fileStats.size,
          mtime: fileStats.mtime,
          birthtime: fileStats.birthtime,
        };

        if (this.options.maxFileSize && fileStats.size > this.options.maxFileSize) {
          throw new Error(`File size ${fileStats.size} exceeds maximum allowed ${this.options.maxFileSize}`);
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${filePath}`);
        }
        throw error;
      }

      rawContent = await fs.readFile(filePath, 'utf-8');
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }

    // Detect format
    const ext = path.extname(source.name).toLowerCase();
    const isJSONL = ['.jsonl', '.ndjson'].includes(ext) ||
                    source.mimeType?.includes('ndjson') ||
                    source.mimeType?.includes('jsonl');

    // Parse JSON
    let data: unknown;
    let records: unknown[] = [];

    if (isJSONL) {
      // Parse JSONL (newline-delimited JSON)
      records = rawContent
        .split('\n')
        .filter(line => line.trim())
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch {
            throw new Error(`Invalid JSON on line ${index + 1}`);
          }
        });
      data = records;
    } else {
      // Parse standard JSON
      try {
        data = JSON.parse(rawContent);
      } catch (error: unknown) {
        throw new Error(`Invalid JSON: ${(error as Error).message}`);
      }

      // Handle arrays vs objects
      if (Array.isArray(data)) {
        records = data;
      } else {
        records = [data];
      }
    }

    // Extract content using configured path
    if (this.options.contentPath) {
      data = this.getNestedValue(data, this.options.contentPath);
      if (Array.isArray(data)) {
        records = data;
      } else if (data) {
        records = [data];
      }
    }

    // Generate content hash
    const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex');

    // Extract text content
    const content = this.extractTextContent(records);

    // Extract sections
    const sections = this.extractSections(records);

    // Extract tables if data is tabular
    const tables = this.extractTables(records);

    // Extract metadata from first record
    const extractedMeta = this.extractMetadata(records[0]);

    // Build metadata
    const metadata: DocumentMetadata = {
      id: uuid(),
      source,
      format: isJSONL ? 'jsonl' : 'json',
      title: extractedMeta.title || this.extractTitle(source.name),
      author: extractedMeta.author,
      createdAt: extractedMeta.date || stats.birthtime,
      modifiedAt: stats.mtime,
      size: stats.size ?? Buffer.byteLength(rawContent, 'utf-8'),
      wordCount: this.countWords(content),
      charCount: content.length,
      contentHash,
      version: 1,
      custom: {
        ...source.metadata,
        recordCount: records.length,
        isArray: Array.isArray(data),
        ...extractedMeta.custom,
      },
    };

    return {
      metadata,
      content,
      sections,
      tables: tables.length > 0 ? tables : undefined,
      extractedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getNestedValue(obj: unknown, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private extractTextContent(records: unknown[]): string {
    const textParts: string[] = [];

    for (const record of records) {
      if (typeof record === 'string') {
        textParts.push(record);
      } else if (typeof record === 'object' && record !== null) {
        const recordText = this.objectToText(record as Record<string, unknown>);
        textParts.push(recordText);
      }
    }

    return textParts.join('\n\n');
  }

  private objectToText(obj: Record<string, unknown>, depth = 0): string {
    if (depth > (this.options.maxDepth ?? 10)) {
      return '[max depth reached]';
    }

    const parts: string[] = [];

    // If specific text fields are configured, use them
    if (this.options.textFields && this.options.textFields.length > 0) {
      for (const field of this.options.textFields) {
        const value = this.getNestedValue(obj, field);
        if (value !== undefined && value !== null) {
          parts.push(String(value));
        }
      }
      return parts.join('\n');
    }

    // Otherwise, extract all text-like fields
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'string') {
        // Include if it looks like content (not an ID or technical field)
        if (value.length > 20 || !this.isTechnicalField(key)) {
          parts.push(`${key}: ${value}`);
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        parts.push(`${key}: ${value}`);
      } else if (Array.isArray(value)) {
        const arrayText = value
          .map(item =>
            typeof item === 'object' && item !== null
              ? this.objectToText(item as Record<string, unknown>, depth + 1)
              : String(item)
          )
          .join(', ');
        parts.push(`${key}: ${arrayText}`);
      } else if (typeof value === 'object') {
        const nestedText = this.objectToText(value as Record<string, unknown>, depth + 1);
        parts.push(`${key}:\n${nestedText}`);
      }
    }

    return parts.join('\n');
  }

  private isTechnicalField(key: string): boolean {
    const technicalPatterns = [
      /^_/, /id$/i, /uuid/i, /hash/i, /token/i,
      /password/i, /secret/i, /key$/i, /timestamp/i,
      /^created/, /^updated/, /^modified/,
    ];
    return technicalPatterns.some(pattern => pattern.test(key));
  }

  private extractSections(records: unknown[]): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let currentIndex = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      let title: string | undefined;
      let content: string;

      if (typeof record === 'object' && record !== null) {
        const obj = record as Record<string, unknown>;
        title = String(obj.title || obj.name || obj.heading || `Record ${i + 1}`);
        content = this.objectToText(obj);
      } else {
        title = `Record ${i + 1}`;
        content = String(record);
      }

      sections.push({
        title,
        content,
        startIndex: currentIndex,
        endIndex: currentIndex + content.length,
      });

      currentIndex += content.length + 2; // +2 for separator
    }

    return sections;
  }

  private extractTables(records: unknown[]): ExtractedTable[] {
    // Check if records are uniform enough to form a table
    if (records.length < 2) return [];

    const firstRecord = records[0];
    if (typeof firstRecord !== 'object' || firstRecord === null || Array.isArray(firstRecord)) {
      return [];
    }

    const headers = Object.keys(firstRecord as Record<string, unknown>);

    // Check if all records have similar structure
    const isTabular = records.every(record => {
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        return false;
      }
      const keys = Object.keys(record);
      return keys.length === headers.length &&
             keys.every(key => headers.includes(key));
    });

    if (!isTabular) return [];

    // Build table
    const rows = records.map(record =>
      headers.map(header => {
        const value = (record as Record<string, unknown>)[header];
        return value === null || value === undefined ? '' : String(value);
      })
    );

    return [{
      headers,
      rows,
      position: 0,
    }];
  }

  private extractMetadata(record: unknown): {
    title?: string;
    author?: string;
    date?: Date;
    custom: Record<string, unknown>;
  } {
    const result: {
      title?: string;
      author?: string;
      date?: Date;
      custom: Record<string, unknown>;
    } = { custom: {} };

    if (typeof record !== 'object' || record === null) {
      return result;
    }

    const obj = record as Record<string, unknown>;

    // Extract common metadata fields
    for (const field of this.options.metadataFields ?? []) {
      const value = this.getNestedValue(obj, field);
      if (value !== undefined && value !== null) {
        if (field === 'title' || field === 'name') {
          result.title = String(value);
        } else if (field === 'author' || field === 'creator') {
          result.author = String(value);
        } else if (field === 'date' || field === 'created' || field === 'timestamp') {
          const parsed = new Date(value as string | number);
          if (!isNaN(parsed.getTime())) {
            result.date = parsed;
          }
        } else {
          result.custom[field] = value;
        }
      }
    }

    return result;
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
}

// ============================================================================
// FACTORY
// ============================================================================

export function createJSONLoader(options?: JSONLoaderOptions): JSONLoader {
  return new JSONLoader(options);
}

export default JSONLoader;
