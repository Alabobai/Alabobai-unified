/**
 * Alabobai File Processor Service
 * Handles file upload processing, parsing, and analysis preparation
 */

import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

// ============================================================================
// TYPES
// ============================================================================

export interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  extension: string;
  uploadedAt: Date;
  processedAt?: Date;
  userId?: string;
  sessionId?: string;
  hash?: string;
  processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  processingError?: string;
}

export interface ProcessedFile extends FileMetadata {
  storagePath: string;
  thumbnailPath?: string;
  extractedText?: string;
  chunks?: TextChunk[];
  metadata?: Record<string, unknown>;
  analysisReady: boolean;
}

export interface TextChunk {
  id: string;
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
  metadata?: Record<string, unknown>;
}

export interface ImageAnalysisPrep {
  resizedPath: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  base64?: string;
}

export interface SpreadsheetData {
  sheets: SheetData[];
  metadata: {
    sheetCount: number;
    totalRows: number;
    totalColumns: number;
  };
}

export interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  columnCount: number;
}

export interface FileProcessorOptions {
  maxFileSizeMB?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
  imageQuality?: number;
  allowedMimeTypes?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<FileProcessorOptions> = {
  maxFileSizeMB: 50,
  chunkSize: 1000, // characters per chunk
  chunkOverlap: 200, // overlap between chunks
  imageMaxWidth: 1024,
  imageMaxHeight: 1024,
  imageQuality: 85,
  allowedMimeTypes: [
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    // Images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    // Spreadsheets
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    // Code files
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'application/typescript',
    'text/html',
    'text/css',
    'application/json',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-cpp',
    'text/x-go',
    'text/x-rust',
  ],
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'text/typescript': '.ts',
  'application/typescript': '.ts',
  'text/html': '.html',
  'text/css': '.css',
  'application/json': '.json',
  'text/x-python': '.py',
  'text/x-java': '.java',
  'text/x-c': '.c',
  'text/x-cpp': '.cpp',
  'text/x-go': '.go',
  'text/x-rust': '.rs',
};

// File signatures for type detection
const FILE_SIGNATURES: Array<{ bytes: number[]; offset: number; mimeType: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0, mimeType: 'application/pdf' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, mimeType: 'image/png' },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, mimeType: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, mimeType: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, mimeType: 'image/webp' }, // RIFF header
  { bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0, mimeType: 'application/zip' }, // Could be xlsx
];

// ============================================================================
// FILE PROCESSOR CLASS
// ============================================================================

export class FileProcessor {
  private options: Required<FileProcessorOptions>;

  constructor(options: FileProcessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // --------------------------------------------------------------------------
  // FILE TYPE DETECTION & VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Detect file type from buffer contents
   */
  async detectFileType(buffer: Buffer): Promise<string | null> {
    for (const sig of FILE_SIGNATURES) {
      const slice = buffer.slice(sig.offset, sig.offset + sig.bytes.length);
      if (slice.every((byte, i) => byte === sig.bytes[i])) {
        // Special case for XLSX (ZIP with specific content)
        if (sig.mimeType === 'application/zip') {
          const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1000));
          if (content.includes('[Content_Types].xml') || content.includes('xl/')) {
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          }
        }
        return sig.mimeType;
      }
    }

    // Check for text-based files
    const sample = buffer.slice(0, Math.min(buffer.length, 8000)).toString('utf-8');

    if (sample.includes('<!DOCTYPE html') || sample.includes('<html')) {
      return 'text/html';
    }
    if (sample.startsWith('{') || sample.startsWith('[')) {
      try {
        JSON.parse(sample);
        return 'application/json';
      } catch {
        // Not valid JSON
      }
    }
    if (sample.includes('def ') || sample.includes('import ') && sample.includes('from ')) {
      return 'text/x-python';
    }
    if (sample.includes('function ') || sample.includes('const ') || sample.includes('let ')) {
      return 'text/javascript';
    }
    if (sample.includes('interface ') || sample.includes(': string') || sample.includes(': number')) {
      return 'text/typescript';
    }

    // Check if it's valid UTF-8 text
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      decoder.decode(buffer.slice(0, Math.min(buffer.length, 1000)));
      return 'text/plain';
    } catch {
      return null;
    }
  }

  /**
   * Validate file against allowed types and size
   */
  validateFile(
    mimeType: string,
    size: number,
    originalName: string
  ): { valid: boolean; error?: string } {
    // Check file size
    const maxBytes = this.options.maxFileSizeMB * 1024 * 1024;
    if (size > maxBytes) {
      return {
        valid: false,
        error: `File size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${this.options.maxFileSizeMB}MB)`,
      };
    }

    // Check MIME type
    if (!this.options.allowedMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `File type "${mimeType}" is not allowed. Allowed types: ${this.options.allowedMimeTypes.join(', ')}`,
      };
    }

    // Check for potentially dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.dll', '.scr'];
    const ext = path.extname(originalName).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      return {
        valid: false,
        error: `File extension "${ext}" is not allowed for security reasons`,
      };
    }

    return { valid: true };
  }

  /**
   * Placeholder for virus/malware scanning
   * In production, integrate with ClamAV or cloud scanning service
   */
  async scanForMalware(buffer: Buffer, filename: string): Promise<{ safe: boolean; threat?: string }> {
    console.log(`[FileProcessor] Malware scan placeholder for: ${filename}`);

    // Basic heuristic checks (not a real scanner)
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));

    // Check for common suspicious patterns
    const suspiciousPatterns = [
      /eval\s*\(\s*base64_decode/gi,
      /document\.write\s*\(\s*unescape/gi,
      /<script[^>]*>.*?eval\s*\(/gis,
      /powershell\s+-enc/gi,
      /cmd\.exe\s+\/c/gi,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return {
          safe: false,
          threat: 'Potentially malicious code pattern detected',
        };
      }
    }

    // TODO: In production, implement real scanning:
    // - ClamAV: await clamav.scanBuffer(buffer)
    // - VirusTotal API: await virustotal.scanFile(buffer)
    // - AWS Macie: await macie.scanObject(buffer)

    return { safe: true };
  }

  // --------------------------------------------------------------------------
  // PDF PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Extract text and metadata from PDF
   * Uses pdf-parse or similar library
   */
  async processPDF(buffer: Buffer): Promise<{
    text: string;
    metadata: Record<string, unknown>;
    pageCount: number;
  }> {
    try {
      // Dynamic import for pdf-parse (optional dependency)
      const pdfParse = await import('pdf-parse').then(m => m.default).catch(() => null);

      if (pdfParse) {
        const data = await pdfParse(buffer);
        return {
          text: data.text,
          metadata: {
            title: data.info?.Title || null,
            author: data.info?.Author || null,
            subject: data.info?.Subject || null,
            creator: data.info?.Creator || null,
            producer: data.info?.Producer || null,
            creationDate: data.info?.CreationDate || null,
            modificationDate: data.info?.ModDate || null,
          },
          pageCount: data.numpages,
        };
      }

      // Fallback: Basic text extraction attempt
      console.warn('[FileProcessor] pdf-parse not available, using basic extraction');
      const text = this.extractTextFromPDFBasic(buffer);
      return {
        text,
        metadata: {},
        pageCount: 0,
      };
    } catch (error) {
      console.error('[FileProcessor] PDF processing error:', error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Basic PDF text extraction fallback
   */
  private extractTextFromPDFBasic(buffer: Buffer): string {
    // Very basic extraction - looks for text streams
    const content = buffer.toString('latin1');
    const textMatches: string[] = [];

    // Look for text between BT and ET markers
    const streamRegex = /BT[\s\S]*?ET/g;
    let match;
    while ((match = streamRegex.exec(content)) !== null) {
      const stream = match[0];
      // Extract text from Tj and TJ operators
      const tjRegex = /\(([^)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(stream)) !== null) {
        const text = tjMatch[1] || tjMatch[2] || '';
        textMatches.push(text.replace(/\\[0-7]{3}/g, ' '));
      }
    }

    return textMatches.join(' ').replace(/\s+/g, ' ').trim();
  }

  // --------------------------------------------------------------------------
  // IMAGE PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Prepare image for vision API analysis
   */
  async prepareImageForAnalysis(
    buffer: Buffer,
    outputPath: string
  ): Promise<ImageAnalysisPrep> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Determine if resizing is needed
    const needsResize =
      (metadata.width && metadata.width > this.options.imageMaxWidth) ||
      (metadata.height && metadata.height > this.options.imageMaxHeight);

    let processedImage = image;

    if (needsResize) {
      processedImage = image.resize(this.options.imageMaxWidth, this.options.imageMaxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to JPEG for consistent format (unless PNG transparency needed)
    const hasAlpha = metadata.hasAlpha;
    const format = hasAlpha ? 'png' : 'jpeg';

    if (format === 'jpeg') {
      processedImage = processedImage.jpeg({ quality: this.options.imageQuality });
    } else {
      processedImage = processedImage.png({ quality: this.options.imageQuality });
    }

    // Save processed image
    await processedImage.toFile(outputPath);

    // Get final dimensions
    const finalMetadata = await sharp(outputPath).metadata();

    // Generate base64 for API calls
    const processedBuffer = await sharp(outputPath).toBuffer();
    const base64 = processedBuffer.toString('base64');

    return {
      resizedPath: outputPath,
      width: finalMetadata.width || 0,
      height: finalMetadata.height || 0,
      format: format as 'jpeg' | 'png',
      base64: `data:image/${format};base64,${base64}`,
    };
  }

  /**
   * Generate thumbnail for preview
   */
  async generateThumbnail(
    buffer: Buffer,
    outputPath: string,
    width: number = 200,
    height: number = 200
  ): Promise<string> {
    await sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    return outputPath;
  }

  // --------------------------------------------------------------------------
  // SPREADSHEET PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Process CSV file
   */
  async processCSV(buffer: Buffer): Promise<SpreadsheetData> {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      return {
        sheets: [],
        metadata: { sheetCount: 0, totalRows: 0, totalColumns: 0 },
      };
    }

    // Parse CSV (simple implementation, handles quoted fields)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return {
      sheets: [
        {
          name: 'Sheet1',
          headers,
          rows,
          rowCount: rows.length,
          columnCount: headers.length,
        },
      ],
      metadata: {
        sheetCount: 1,
        totalRows: rows.length,
        totalColumns: headers.length,
      },
    };
  }

  /**
   * Process Excel file (XLSX)
   */
  async processExcel(buffer: Buffer): Promise<SpreadsheetData> {
    try {
      // Dynamic import for xlsx (optional dependency)
      const XLSX = await import('xlsx').then(m => m.default || m).catch(() => null);

      if (!XLSX) {
        console.warn('[FileProcessor] xlsx not available, cannot process Excel files');
        throw new Error('Excel processing not available. Install xlsx package.');
      }

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: SheetData[] = [];
      let totalRows = 0;
      let totalColumns = 0;

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) continue;

        const headers = (jsonData[0] as string[]).map(h => String(h || ''));
        const rows: Record<string, unknown>[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const rowData = jsonData[i] as unknown[];
          const row: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            row[header] = rowData[index] ?? '';
          });
          rows.push(row);
        }

        sheets.push({
          name: sheetName,
          headers,
          rows,
          rowCount: rows.length,
          columnCount: headers.length,
        });

        totalRows += rows.length;
        totalColumns = Math.max(totalColumns, headers.length);
      }

      return {
        sheets,
        metadata: {
          sheetCount: sheets.length,
          totalRows,
          totalColumns,
        },
      };
    } catch (error) {
      console.error('[FileProcessor] Excel processing error:', error);
      throw new Error(`Failed to process Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEXT PROCESSING & CHUNKING
  // --------------------------------------------------------------------------

  /**
   * Process text/code files
   */
  async processText(buffer: Buffer): Promise<{ text: string; lineCount: number }> {
    const text = buffer.toString('utf-8');
    const lineCount = text.split(/\r?\n/).length;
    return { text, lineCount };
  }

  /**
   * Chunk large text for processing
   */
  chunkText(text: string, options?: { chunkSize?: number; overlap?: number }): TextChunk[] {
    const chunkSize = options?.chunkSize || this.options.chunkSize;
    const overlap = options?.overlap || this.options.chunkOverlap;

    if (text.length <= chunkSize) {
      return [
        {
          id: uuid(),
          content: text,
          index: 0,
          startOffset: 0,
          endOffset: text.length,
        },
      ];
    }

    const chunks: TextChunk[] = [];
    let startOffset = 0;
    let index = 0;

    while (startOffset < text.length) {
      let endOffset = Math.min(startOffset + chunkSize, text.length);

      // Try to break at sentence or paragraph boundary
      if (endOffset < text.length) {
        const searchWindow = text.slice(endOffset - 100, endOffset);
        const sentenceEnd = Math.max(
          searchWindow.lastIndexOf('. '),
          searchWindow.lastIndexOf('.\n'),
          searchWindow.lastIndexOf('! '),
          searchWindow.lastIndexOf('? ')
        );

        if (sentenceEnd > 0) {
          endOffset = endOffset - 100 + sentenceEnd + 1;
        }
      }

      chunks.push({
        id: uuid(),
        content: text.slice(startOffset, endOffset).trim(),
        index,
        startOffset,
        endOffset,
      });

      // Move to next chunk with overlap
      startOffset = endOffset - overlap;
      if (startOffset >= text.length - overlap) break;
      index++;
    }

    return chunks;
  }

  // --------------------------------------------------------------------------
  // MAIN PROCESSING PIPELINE
  // --------------------------------------------------------------------------

  /**
   * Process uploaded file through complete pipeline
   */
  async processFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    storagePath: string,
    options?: {
      userId?: string;
      sessionId?: string;
      generateThumbnail?: boolean;
      extractText?: boolean;
      prepareForAnalysis?: boolean;
    }
  ): Promise<ProcessedFile> {
    const fileId = uuid();
    const extension = path.extname(originalName).toLowerCase() || MIME_TO_EXTENSION[mimeType] || '';

    const metadata: FileMetadata = {
      id: fileId,
      originalName,
      mimeType,
      size: buffer.length,
      extension,
      uploadedAt: new Date(),
      userId: options?.userId,
      sessionId: options?.sessionId,
      processingStatus: 'processing',
    };

    try {
      // Validate file
      const validation = this.validateFile(mimeType, buffer.length, originalName);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Scan for malware
      const scanResult = await this.scanForMalware(buffer, originalName);
      if (!scanResult.safe) {
        throw new Error(`Security scan failed: ${scanResult.threat}`);
      }

      // Calculate hash for deduplication
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const processedFile: ProcessedFile = {
        ...metadata,
        storagePath,
        hash,
        analysisReady: false,
      };

      // Process based on file type
      if (mimeType === 'application/pdf') {
        const pdfResult = await this.processPDF(buffer);
        processedFile.extractedText = pdfResult.text;
        processedFile.metadata = pdfResult.metadata;
        processedFile.chunks = this.chunkText(pdfResult.text);
        processedFile.analysisReady = true;
      } else if (mimeType.startsWith('image/')) {
        if (options?.prepareForAnalysis) {
          const analysisPrep = await this.prepareImageForAnalysis(
            buffer,
            storagePath.replace(extension, `_analysis${extension}`)
          );
          processedFile.metadata = {
            width: analysisPrep.width,
            height: analysisPrep.height,
            format: analysisPrep.format,
          };
          processedFile.analysisReady = true;
        }
        if (options?.generateThumbnail) {
          processedFile.thumbnailPath = await this.generateThumbnail(
            buffer,
            storagePath.replace(extension, '_thumb.jpg')
          );
        }
      } else if (mimeType === 'text/csv') {
        const csvResult = await this.processCSV(buffer);
        processedFile.metadata = csvResult.metadata;
        // Convert to text for chunking
        const textContent = csvResult.sheets
          .map(s => s.rows.map(r => Object.values(r).join(', ')).join('\n'))
          .join('\n\n');
        processedFile.extractedText = textContent;
        processedFile.chunks = this.chunkText(textContent);
        processedFile.analysisReady = true;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
      ) {
        const excelResult = await this.processExcel(buffer);
        processedFile.metadata = excelResult.metadata;
        const textContent = excelResult.sheets
          .map(s => `[${s.name}]\n${s.rows.map(r => Object.values(r).join(', ')).join('\n')}`)
          .join('\n\n');
        processedFile.extractedText = textContent;
        processedFile.chunks = this.chunkText(textContent);
        processedFile.analysisReady = true;
      } else if (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/javascript'
      ) {
        const textResult = await this.processText(buffer);
        processedFile.extractedText = textResult.text;
        processedFile.metadata = { lineCount: textResult.lineCount };
        processedFile.chunks = this.chunkText(textResult.text);
        processedFile.analysisReady = true;
      }

      processedFile.processingStatus = 'complete';
      processedFile.processedAt = new Date();

      return processedFile;
    } catch (error) {
      return {
        ...metadata,
        storagePath,
        processingStatus: 'error',
        processingError: error instanceof Error ? error.message : 'Unknown error',
        analysisReady: false,
      };
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let fileProcessorInstance: FileProcessor | null = null;

export function getFileProcessor(options?: FileProcessorOptions): FileProcessor {
  if (!fileProcessorInstance) {
    fileProcessorInstance = new FileProcessor(options);
  }
  return fileProcessorInstance;
}

export function createFileProcessor(options?: FileProcessorOptions): FileProcessor {
  return new FileProcessor(options);
}

export default FileProcessor;
