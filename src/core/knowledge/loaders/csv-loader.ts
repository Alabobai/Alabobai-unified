/**
 * Alabobai Knowledge System - CSV Document Loader
 * Handles CSV file extraction
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
// CSV LOADER
// ============================================================================

export interface CSVLoaderOptions extends LoaderOptions {
  /** CSV delimiter character */
  delimiter?: string;
  /** Quote character for fields */
  quote?: string;
  /** Escape character */
  escape?: string;
  /** Whether first row is header */
  hasHeader?: boolean;
  /** Columns to use for text content */
  textColumns?: string[] | number[];
  /** Columns to use as metadata */
  metadataColumns?: string[] | number[];
  /** How to format rows as text */
  rowFormat?: 'json' | 'keyvalue' | 'concat';
  /** Skip empty rows */
  skipEmpty?: boolean;
  /** Maximum rows to process */
  maxRows?: number;
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  rawRows: string[];
}

export class CSVLoader implements DocumentLoader {
  public readonly supportedExtensions = ['.csv', '.tsv'];
  public readonly supportedMimeTypes = [
    'text/csv',
    'text/tab-separated-values',
    'application/csv',
  ];

  private options: CSVLoaderOptions;

  constructor(options: CSVLoaderOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 100 * 1024 * 1024, // 100MB default
      timeout: options.timeout ?? 30000,
      delimiter: options.delimiter ?? ',',
      quote: options.quote ?? '"',
      escape: options.escape ?? '"',
      hasHeader: options.hasHeader ?? true,
      textColumns: options.textColumns,
      metadataColumns: options.metadataColumns,
      rowFormat: options.rowFormat ?? 'keyvalue',
      skipEmpty: options.skipEmpty ?? true,
      maxRows: options.maxRows,
      options: options.options ?? {},
    };
  }

  getName(): string {
    return 'CSVLoader';
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

    // Auto-detect delimiter if TSV
    const ext = path.extname(source.name).toLowerCase();
    if (ext === '.tsv' && this.options.delimiter === ',') {
      this.options.delimiter = '\t';
    }

    // Generate content hash
    const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex');

    // Parse CSV
    const parsed = this.parseCSV(rawContent);

    // Apply row limit
    if (this.options.maxRows && parsed.rows.length > this.options.maxRows) {
      parsed.rows = parsed.rows.slice(0, this.options.maxRows);
    }

    // Extract text content
    const content = this.extractTextContent(parsed);

    // Extract sections (group by some column or treat each row as section)
    const sections = this.extractSections(parsed);

    // Create table representation
    const tables: ExtractedTable[] = [{
      headers: parsed.headers,
      rows: parsed.rows,
      position: 0,
    }];

    // Build metadata
    const metadata: DocumentMetadata = {
      id: uuid(),
      source,
      format: 'csv',
      title: this.extractTitle(source.name),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      size: stats.size ?? Buffer.byteLength(rawContent, 'utf-8'),
      wordCount: this.countWords(content),
      charCount: content.length,
      contentHash,
      version: 1,
      custom: {
        ...source.metadata,
        rowCount: parsed.rows.length,
        columnCount: parsed.headers.length,
        columns: parsed.headers,
        delimiter: this.options.delimiter,
      },
    };

    return {
      metadata,
      content,
      sections,
      tables,
      extractedAt: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private parseCSV(content: string): ParsedCSV {
    const lines = this.splitLines(content);
    const rows: string[][] = [];
    const rawRows: string[] = [];

    for (const line of lines) {
      if (this.options.skipEmpty && !line.trim()) {
        continue;
      }

      const row = this.parseLine(line);
      rows.push(row);
      rawRows.push(line);
    }

    // Extract headers
    let headers: string[];
    if (this.options.hasHeader && rows.length > 0) {
      headers = rows.shift()!;
      rawRows.shift();
    } else {
      // Generate column names
      const colCount = rows[0]?.length ?? 0;
      headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
    }

    // Normalize row lengths
    const maxCols = Math.max(headers.length, ...rows.map(r => r.length));
    headers = this.padArray(headers, maxCols, '');

    for (let i = 0; i < rows.length; i++) {
      rows[i] = this.padArray(rows[i], maxCols, '');
    }

    return { headers, rows, rawRows };
  }

  private splitLines(content: string): string[] {
    // Handle different line endings and quoted fields with newlines
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    const quote = this.options.quote!;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === quote) {
        if (inQuotes && nextChar === quote) {
          // Escaped quote
          currentLine += char;
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
        currentLine += char;
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        lines.push(currentLine);
        currentLine = '';
        if (char === '\r') i++; // Skip \n in \r\n
      } else if (char === '\r' && !inQuotes) {
        lines.push(currentLine);
        currentLine = '';
      } else {
        currentLine += char;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private parseLine(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    const delimiter = this.options.delimiter!;
    const quote = this.options.quote!;
    const escape = this.options.escape!;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === quote && !inQuotes) {
        // Start of quoted field
        inQuotes = true;
      } else if (char === quote && inQuotes) {
        if (nextChar === quote) {
          // Escaped quote
          currentField += quote;
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else if (char === escape && inQuotes && nextChar === quote) {
        // Escaped quote (alternate escape style)
        currentField += quote;
        i++;
      } else if (char === delimiter && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }

    fields.push(currentField.trim());
    return fields;
  }

  private padArray<T>(arr: T[], length: number, fillValue: T): T[] {
    const result = [...arr];
    while (result.length < length) {
      result.push(fillValue);
    }
    return result;
  }

  private extractTextContent(parsed: ParsedCSV): string {
    const textParts: string[] = [];
    const textColIndices = this.getColumnIndices(parsed.headers, this.options.textColumns);

    for (const row of parsed.rows) {
      let rowText: string;

      if (this.options.rowFormat === 'json') {
        const obj: Record<string, string> = {};
        parsed.headers.forEach((header, i) => {
          if (textColIndices.length === 0 || textColIndices.includes(i)) {
            obj[header] = row[i];
          }
        });
        rowText = JSON.stringify(obj);
      } else if (this.options.rowFormat === 'concat') {
        const values = textColIndices.length > 0
          ? textColIndices.map(i => row[i])
          : row;
        rowText = values.filter(v => v).join(' ');
      } else {
        // keyvalue format (default)
        const pairs: string[] = [];
        parsed.headers.forEach((header, i) => {
          if (textColIndices.length === 0 || textColIndices.includes(i)) {
            if (row[i]) {
              pairs.push(`${header}: ${row[i]}`);
            }
          }
        });
        rowText = pairs.join('\n');
      }

      if (rowText.trim()) {
        textParts.push(rowText);
      }
    }

    return textParts.join('\n\n');
  }

  private getColumnIndices(headers: string[], columns?: string[] | number[]): number[] {
    if (!columns || columns.length === 0) {
      return [];
    }

    return columns.map(col => {
      if (typeof col === 'number') {
        return col;
      }
      const index = headers.findIndex(h =>
        h.toLowerCase() === col.toLowerCase()
      );
      return index;
    }).filter(i => i >= 0);
  }

  private extractSections(parsed: ParsedCSV): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let currentIndex = 0;

    // Create a section for each row
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const pairs = parsed.headers
        .map((header, j) => row[j] ? `${header}: ${row[j]}` : null)
        .filter(Boolean);

      const content = pairs.join('\n');

      // Use first non-empty field as title
      const title = row.find(cell => cell.trim()) || `Row ${i + 1}`;

      sections.push({
        title: String(title).slice(0, 100),
        content,
        startIndex: currentIndex,
        endIndex: currentIndex + content.length,
      });

      currentIndex += content.length + 2;
    }

    return sections;
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

export function createCSVLoader(options?: CSVLoaderOptions): CSVLoader {
  return new CSVLoader(options);
}

export default CSVLoader;
