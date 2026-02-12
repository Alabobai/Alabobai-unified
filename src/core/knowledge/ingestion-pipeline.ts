/**
 * Alabobai Knowledge System - Ingestion Pipeline
 * Complete document ingestion pipeline with chunking, embedding, and storage
 */

import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  DocumentSource,
  DocumentMetadata,
  ExtractedDocument,
  DocumentChunk,
  ChunkMetadata,
  ChunkingConfig,
  ChunkingStrategy,
  EmbeddingConfig,
  EmbeddingResult,
  VectorStoreConfig,
  VectorSearchResult,
  VectorSearchOptions,
  IngestionConfig,
  IngestionJob,
  IngestionStatus,
  IngestionStats,
  IngestionResult,
  DocumentUpdate,
  DocumentVersion,
  DocumentLoader,
} from './types.js';

import {
  TextLoader,
  PDFLoader,
  JSONLoader,
  CSVLoader,
  WebLoader,
} from './loaders/index.js';

// ============================================================================
// CHUNKING ENGINE
// ============================================================================

export class ChunkingEngine {
  private config: ChunkingConfig;

  constructor(config: ChunkingConfig) {
    this.config = config;
  }

  async chunk(document: ExtractedDocument): Promise<DocumentChunk[]> {
    const { strategy } = this.config;

    switch (strategy) {
      case 'fixed':
        return this.fixedChunking(document);
      case 'sentence':
        return this.sentenceChunking(document);
      case 'paragraph':
        return this.paragraphChunking(document);
      case 'section':
        return this.sectionChunking(document);
      case 'recursive':
        return this.recursiveChunking(document);
      case 'markdown':
        return this.markdownChunking(document);
      case 'code':
        return this.codeChunking(document);
      case 'adaptive':
        return this.adaptiveChunking(document);
      case 'semantic':
        return this.semanticChunking(document);
      default:
        return this.recursiveChunking(document);
    }
  }

  private fixedChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { chunkSize, chunkOverlap } = this.config;
    const content = document.content;

    let startIndex = 0;
    let index = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + chunkSize, content.length);
      const chunkContent = content.slice(startIndex, endIndex);

      if (chunkContent.trim()) {
        chunks.push(this.createChunk(
          document,
          chunkContent,
          index,
          startIndex,
          endIndex
        ));
        index++;
      }

      startIndex = endIndex - chunkOverlap;
      if (startIndex >= content.length - chunkOverlap) break;
    }

    return chunks;
  }

  private sentenceChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { chunkSize, chunkOverlap } = this.config;
    const content = document.content;

    // Split into sentences
    const sentenceRegex = /[^.!?]*[.!?]+\s*/g;
    const sentences: { text: string; start: number; end: number }[] = [];
    let match;

    while ((match = sentenceRegex.exec(content)) !== null) {
      sentences.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Group sentences into chunks
    let currentChunk: string[] = [];
    let currentLength = 0;
    let chunkStartIndex = 0;
    let index = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      if (currentLength + sentence.text.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        const chunkContent = currentChunk.join('');
        chunks.push(this.createChunk(
          document,
          chunkContent,
          index,
          chunkStartIndex,
          sentences[i - 1].end
        ));
        index++;

        // Start new chunk with overlap
        const overlapSentences = this.getOverlapSentences(
          currentChunk,
          chunkOverlap
        );
        currentChunk = overlapSentences;
        currentLength = overlapSentences.join('').length;
        chunkStartIndex = sentences[i - overlapSentences.length]?.start ?? sentence.start;
      }

      currentChunk.push(sentence.text);
      currentLength += sentence.text.length;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('');
      chunks.push(this.createChunk(
        document,
        chunkContent,
        index,
        chunkStartIndex,
        content.length
      ));
    }

    return chunks;
  }

  private paragraphChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;
    const content = document.content;

    // Split into paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk: string[] = [];
    let currentLength = 0;
    let currentStartIndex = 0;
    let index = 0;
    let contentIndex = 0;

    for (const paragraph of paragraphs) {
      const paraText = paragraph.trim();
      if (!paraText) {
        contentIndex += paragraph.length + 2;
        continue;
      }

      if (currentLength + paraText.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        const chunkContent = currentChunk.join('\n\n');
        if (chunkContent.length >= (minChunkSize ?? 50)) {
          chunks.push(this.createChunk(
            document,
            chunkContent,
            index,
            currentStartIndex,
            contentIndex
          ));
          index++;
        }

        // Calculate overlap
        const overlapText = this.getOverlapText(chunkContent, chunkOverlap);
        currentChunk = overlapText ? [overlapText] : [];
        currentLength = overlapText?.length ?? 0;
        currentStartIndex = contentIndex - (overlapText?.length ?? 0);
      }

      currentChunk.push(paraText);
      currentLength += paraText.length + 2;
      contentIndex += paragraph.length + 2;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n\n');
      if (chunkContent.length >= (minChunkSize ?? 50)) {
        chunks.push(this.createChunk(
          document,
          chunkContent,
          index,
          currentStartIndex,
          content.length
        ));
      }
    }

    return chunks;
  }

  private sectionChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    if (!document.sections || document.sections.length === 0) {
      // Fall back to paragraph chunking
      return this.paragraphChunking(document);
    }

    const { chunkSize, minChunkSize, maxChunkSize } = this.config;

    for (let i = 0; i < document.sections.length; i++) {
      const section = document.sections[i];
      const sectionText = section.title
        ? `${section.title}\n\n${section.content}`
        : section.content;

      // If section is too large, split it
      if (sectionText.length > (maxChunkSize ?? chunkSize * 2)) {
        const subChunks = this.splitLargeSection(
          document,
          sectionText,
          chunks.length,
          section.startIndex,
          section.title
        );
        chunks.push(...subChunks);
      } else if (sectionText.length >= (minChunkSize ?? 50)) {
        chunks.push(this.createChunk(
          document,
          sectionText,
          chunks.length,
          section.startIndex,
          section.endIndex,
          { section: section.title }
        ));
      }
    }

    return chunks;
  }

  private recursiveChunking(document: ExtractedDocument): DocumentChunk[] {
    const { chunkSize, chunkOverlap, separators } = this.config;

    const defaultSeparators = separators ?? [
      '\n\n\n',
      '\n\n',
      '\n',
      '. ',
      '! ',
      '? ',
      '; ',
      ', ',
      ' ',
      '',
    ];

    const splitRecursively = (
      text: string,
      seps: string[],
      startOffset: number
    ): DocumentChunk[] => {
      const chunks: DocumentChunk[] = [];

      if (text.length <= chunkSize || seps.length === 0) {
        if (text.trim()) {
          chunks.push(this.createChunk(
            document,
            text,
            0, // Index will be reassigned later
            startOffset,
            startOffset + text.length
          ));
        }
        return chunks;
      }

      const sep = seps[0];
      const parts = sep ? text.split(sep) : [text];
      let currentChunk = '';
      let currentStart = startOffset;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] + (i < parts.length - 1 ? sep : '');

        if (currentChunk.length + part.length > chunkSize) {
          if (currentChunk.length > chunkSize) {
            // Need to split further
            const subChunks = splitRecursively(currentChunk, seps.slice(1), currentStart);
            chunks.push(...subChunks);
          } else if (currentChunk.trim()) {
            chunks.push(this.createChunk(
              document,
              currentChunk,
              0,
              currentStart,
              currentStart + currentChunk.length
            ));
          }

          // Handle overlap
          const overlap = this.getOverlapText(currentChunk, chunkOverlap);
          currentChunk = overlap + part;
          currentStart = currentStart + currentChunk.length - overlap.length - part.length;
        } else {
          currentChunk += part;
        }
      }

      // Handle remaining text
      if (currentChunk.length > chunkSize) {
        const subChunks = splitRecursively(currentChunk, seps.slice(1), currentStart);
        chunks.push(...subChunks);
      } else if (currentChunk.trim()) {
        chunks.push(this.createChunk(
          document,
          currentChunk,
          0,
          currentStart,
          currentStart + currentChunk.length
        ));
      }

      return chunks;
    };

    const chunks = splitRecursively(document.content, defaultSeparators, 0);

    // Reassign indices
    return chunks.map((chunk, i) => ({
      ...chunk,
      index: i,
    }));
  }

  private markdownChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { chunkSize } = this.config;
    const content = document.content;

    // Split by markdown headers
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    const sections: { level: number; title: string; start: number; end: number; content: string }[] = [];
    let match;
    let lastEnd = 0;

    while ((match = headerRegex.exec(content)) !== null) {
      if (sections.length > 0) {
        sections[sections.length - 1].end = match.index;
        sections[sections.length - 1].content = content.slice(
          sections[sections.length - 1].start,
          match.index
        );
      }

      sections.push({
        level: match[1].length,
        title: match[2],
        start: match.index,
        end: content.length,
        content: '',
      });
      lastEnd = match.index + match[0].length;
    }

    // Set content for last section
    if (sections.length > 0) {
      sections[sections.length - 1].content = content.slice(sections[sections.length - 1].start);
    }

    // If no headers found, use paragraph chunking
    if (sections.length === 0) {
      return this.paragraphChunking(document);
    }

    // Create chunks from sections
    for (const section of sections) {
      const sectionContent = section.content.trim();

      if (sectionContent.length > chunkSize * 2) {
        // Split large sections
        const subDoc: ExtractedDocument = {
          ...document,
          content: sectionContent,
        };
        const subChunks = this.paragraphChunking(subDoc);
        for (const subChunk of subChunks) {
          chunks.push({
            ...subChunk,
            index: chunks.length,
            startIndex: section.start + subChunk.startIndex,
            endIndex: section.start + subChunk.endIndex,
            metadata: {
              ...subChunk.metadata,
              section: section.title,
              headings: [section.title],
            },
          });
        }
      } else if (sectionContent.length > 0) {
        chunks.push(this.createChunk(
          document,
          sectionContent,
          chunks.length,
          section.start,
          section.end,
          { section: section.title, headings: [section.title] }
        ));
      }
    }

    return chunks;
  }

  private codeChunking(document: ExtractedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { chunkSize, preserveCodeBlocks } = this.config;
    const content = document.content;

    if (!preserveCodeBlocks) {
      return this.recursiveChunking(document);
    }

    // Split by code blocks first
    const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
    const parts: { type: 'text' | 'code'; content: string; start: number }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
          start: lastIndex,
        });
      }
      parts.push({
        type: 'code',
        content: match[0],
        start: match.index,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex),
        start: lastIndex,
      });
    }

    // Process parts
    let currentChunk = '';
    let currentStart = 0;

    for (const part of parts) {
      if (part.type === 'code') {
        // Code blocks are kept together if possible
        if (currentChunk && currentChunk.length + part.content.length > chunkSize) {
          if (currentChunk.trim()) {
            chunks.push(this.createChunk(
              document,
              currentChunk,
              chunks.length,
              currentStart,
              part.start
            ));
          }
          currentChunk = part.content;
          currentStart = part.start;
        } else {
          currentChunk += part.content;
        }
      } else {
        // Text can be split
        if (currentChunk.length + part.content.length > chunkSize) {
          if (currentChunk.trim()) {
            chunks.push(this.createChunk(
              document,
              currentChunk,
              chunks.length,
              currentStart,
              part.start
            ));
          }

          // Chunk the text part
          const subDoc: ExtractedDocument = {
            ...document,
            content: part.content,
          };
          const subChunks = this.paragraphChunking(subDoc);
          for (const subChunk of subChunks) {
            chunks.push({
              ...subChunk,
              index: chunks.length,
              startIndex: part.start + subChunk.startIndex,
              endIndex: part.start + subChunk.endIndex,
            });
          }
          currentChunk = '';
          currentStart = part.start + part.content.length;
        } else {
          currentChunk += part.content;
        }
      }
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        document,
        currentChunk,
        chunks.length,
        currentStart,
        content.length
      ));
    }

    return chunks;
  }

  private adaptiveChunking(document: ExtractedDocument): DocumentChunk[] {
    const format = document.metadata.format;

    switch (format) {
      case 'md':
        return this.markdownChunking(document);
      case 'pdf':
        // Use section-based for PDFs
        return this.sectionChunking(document);
      case 'json':
      case 'jsonl':
        // Use section-based for structured data
        return this.sectionChunking(document);
      case 'csv':
        // Each row as a chunk for CSV
        return this.sectionChunking(document);
      case 'html':
        // Section-based for web content
        return this.sectionChunking(document);
      default:
        return this.recursiveChunking(document);
    }
  }

  private semanticChunking(document: ExtractedDocument): DocumentChunk[] {
    // Semantic chunking would require embedding similarity
    // Fall back to paragraph-based as a simple approximation
    // In a full implementation, you would:
    // 1. Split into sentences
    // 2. Compute embeddings for each sentence
    // 3. Group sentences with high cosine similarity
    return this.paragraphChunking(document);
  }

  private splitLargeSection(
    document: ExtractedDocument,
    text: string,
    startIndex: number,
    offset: number,
    sectionTitle?: string
  ): DocumentChunk[] {
    const subDoc: ExtractedDocument = {
      ...document,
      content: text,
    };

    const chunks = this.paragraphChunking(subDoc);

    return chunks.map((chunk, i) => ({
      ...chunk,
      index: startIndex + i,
      startIndex: offset + chunk.startIndex,
      endIndex: offset + chunk.endIndex,
      metadata: {
        ...chunk.metadata,
        section: sectionTitle,
      },
    }));
  }

  private getOverlapSentences(sentences: string[], overlapChars: number): string[] {
    const result: string[] = [];
    let totalLength = 0;

    for (let i = sentences.length - 1; i >= 0 && totalLength < overlapChars; i--) {
      result.unshift(sentences[i]);
      totalLength += sentences[i].length;
    }

    return result;
  }

  private getOverlapText(text: string, overlapChars: number): string {
    if (text.length <= overlapChars) {
      return text;
    }

    // Try to break at a sentence or paragraph boundary
    const endPart = text.slice(-overlapChars);
    const sentenceBreak = endPart.search(/[.!?]\s+/);
    const paraBreak = endPart.indexOf('\n\n');

    if (paraBreak > 0) {
      return endPart.slice(paraBreak + 2);
    }
    if (sentenceBreak > 0) {
      return endPart.slice(sentenceBreak + 2);
    }

    // Fall back to word boundary
    const wordBreak = endPart.indexOf(' ');
    return wordBreak > 0 ? endPart.slice(wordBreak + 1) : endPart;
  }

  private createChunk(
    document: ExtractedDocument,
    content: string,
    index: number,
    startIndex: number,
    endIndex: number,
    extraMetadata?: Partial<ChunkMetadata>
  ): DocumentChunk {
    const contentHash = crypto.createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);

    return {
      id: uuid(),
      documentId: document.metadata.id,
      index,
      content: content.trim(),
      startIndex,
      endIndex,
      charCount: content.length,
      tokenCount: this.estimateTokens(content),
      metadata: {
        documentTitle: document.metadata.title,
        contentHash,
        createdAt: new Date(),
        ...extraMetadata,
      },
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// EMBEDDING ENGINE
// ============================================================================

export class EmbeddingEngine {
  private config: EmbeddingConfig;
  private requestQueue: { chunk: DocumentChunk; resolve: (result: EmbeddingResult) => void; reject: (error: Error) => void }[] = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  async embedChunks(chunks: DocumentChunk[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < chunks.length; i += this.config.batchSize) {
      const batch = chunks.slice(i, i + this.config.batchSize);
      const batchResults = await this.embedBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  async embedQuery(query: string): Promise<number[]> {
    const result = await this.generateEmbedding(query);
    return result;
  }

  private async embedBatch(chunks: DocumentChunk[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const startTime = Date.now();

    // Rate limiting
    await this.waitForRateLimit();

    try {
      const texts = chunks.map(c => c.content);
      const embeddings = await this.generateEmbeddings(texts);

      for (let i = 0; i < chunks.length; i++) {
        results.push({
          chunkId: chunks[i].id,
          embedding: embeddings[i],
          model: this.config.model,
          tokenCount: chunks[i].tokenCount ?? this.estimateTokens(chunks[i].content),
          processingTime: Date.now() - startTime,
        });
      }
    } catch (error) {
      // Fall back to individual embedding
      for (const chunk of chunks) {
        try {
          const embedding = await this.generateEmbedding(chunk.content);
          results.push({
            chunkId: chunk.id,
            embedding,
            model: this.config.model,
            tokenCount: chunk.tokenCount ?? this.estimateTokens(chunk.content),
            processingTime: Date.now() - startTime,
          });
        } catch (err) {
          throw new Error(`Failed to embed chunk ${chunk.id}: ${(err as Error).message}`);
        }
      }
    }

    return results;
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    switch (this.config.provider) {
      case 'openai':
        return this.openaiEmbeddings(texts);
      case 'local':
        return this.localEmbeddings(texts);
      default:
        throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  private async openaiEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key required for embeddings');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${error}`);
    }

    const data = await response.json() as { data: { embedding: number[] }[] };
    return data.data.map(d => d.embedding);
  }

  private async localEmbeddings(texts: string[]): Promise<number[][]> {
    // Simple local embedding using character n-grams
    // In production, use a proper local model like sentence-transformers
    return texts.map(text => this.simpleEmbedding(text));
  }

  private simpleEmbedding(text: string): number[] {
    // Simple embedding based on character frequencies and n-grams
    // This is a placeholder - use a real model in production
    const dimension = this.config.dimension;
    const embedding = new Array(dimension).fill(0);

    // Normalize text
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const words = normalized.split(/\s+/);

    // Character frequency features
    for (const char of normalized) {
      const code = char.charCodeAt(0);
      const index = code % dimension;
      embedding[index] += 1;
    }

    // Word hash features
    for (const word of words) {
      const hash = this.hashString(word);
      const index = hash % dimension;
      embedding[index] += 1;
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0)) || 1;
    return embedding.map(x => x / norm);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async waitForRateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;

    const now = Date.now();
    const minInterval = 60000 / this.config.rateLimit.requestsPerMinute;
    const elapsed = now - this.lastRequestTime;

    if (elapsed < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - elapsed));
    }

    this.lastRequestTime = Date.now();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// VECTOR STORE
// ============================================================================

export interface VectorStore {
  add(chunks: DocumentChunk[], embeddings: EmbeddingResult[]): Promise<void>;
  search(query: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]>;
  delete(documentIds: string[]): Promise<void>;
  deleteChunks(chunkIds: string[]): Promise<void>;
  getDocumentChunks(documentId: string): Promise<DocumentChunk[]>;
  exists(contentHash: string): Promise<boolean>;
  getStats(): Promise<{ totalChunks: number; totalDocuments: number }>;
}

export class InMemoryVectorStore implements VectorStore {
  private chunks: Map<string, DocumentChunk> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private documentChunks: Map<string, Set<string>> = new Map();
  private contentHashes: Set<string> = new Set();
  private config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  async add(chunks: DocumentChunk[], embeddingResults: EmbeddingResult[]): Promise<void> {
    const embeddingMap = new Map(embeddingResults.map(e => [e.chunkId, e.embedding]));

    for (const chunk of chunks) {
      const embedding = embeddingMap.get(chunk.id);
      if (!embedding) continue;

      this.chunks.set(chunk.id, chunk);
      this.embeddings.set(chunk.id, embedding);
      this.contentHashes.add(chunk.metadata.contentHash);

      // Track document chunks
      if (!this.documentChunks.has(chunk.documentId)) {
        this.documentChunks.set(chunk.documentId, new Set());
      }
      this.documentChunks.get(chunk.documentId)!.add(chunk.id);
    }
  }

  async search(queryEmbedding: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [chunkId, embedding] of this.embeddings) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;

      // Apply filters
      if (options.documentIds && !options.documentIds.includes(chunk.documentId)) {
        continue;
      }

      const score = this.cosineSimilarity(queryEmbedding, embedding);

      if (options.minScore && score < options.minScore) {
        continue;
      }

      results.push({
        chunkId,
        documentId: chunk.documentId,
        content: chunk.content,
        score,
        metadata: chunk.metadata,
      });
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.topK);
  }

  async delete(documentIds: string[]): Promise<void> {
    for (const docId of documentIds) {
      const chunkIds = this.documentChunks.get(docId);
      if (chunkIds) {
        for (const chunkId of chunkIds) {
          const chunk = this.chunks.get(chunkId);
          if (chunk) {
            this.contentHashes.delete(chunk.metadata.contentHash);
          }
          this.chunks.delete(chunkId);
          this.embeddings.delete(chunkId);
        }
        this.documentChunks.delete(docId);
      }
    }
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      const chunk = this.chunks.get(chunkId);
      if (chunk) {
        this.contentHashes.delete(chunk.metadata.contentHash);
        this.documentChunks.get(chunk.documentId)?.delete(chunkId);
      }
      this.chunks.delete(chunkId);
      this.embeddings.delete(chunkId);
    }
  }

  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    const chunkIds = this.documentChunks.get(documentId);
    if (!chunkIds) return [];

    return Array.from(chunkIds)
      .map(id => this.chunks.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
  }

  async exists(contentHash: string): Promise<boolean> {
    return this.contentHashes.has(contentHash);
  }

  async getStats(): Promise<{ totalChunks: number; totalDocuments: number }> {
    return {
      totalChunks: this.chunks.size,
      totalDocuments: this.documentChunks.size,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// ============================================================================
// INGESTION PIPELINE
// ============================================================================

export interface IngestionPipelineEvents {
  'job:started': (job: IngestionJob) => void;
  'job:progress': (job: IngestionJob, stage: IngestionStatus, progress: number) => void;
  'job:completed': (job: IngestionJob, result: IngestionResult) => void;
  'job:failed': (job: IngestionJob, error: Error) => void;
  'document:loaded': (doc: ExtractedDocument) => void;
  'document:chunked': (docId: string, chunkCount: number) => void;
  'document:embedded': (docId: string, embeddingCount: number) => void;
  'document:stored': (docId: string) => void;
  'document:error': (source: DocumentSource, error: Error) => void;
  'document:duplicate': (source: DocumentSource, existingHash: string) => void;
}

export class IngestionPipeline extends EventEmitter {
  private config: IngestionConfig;
  private loaders: DocumentLoader[];
  private chunkingEngine: ChunkingEngine;
  private embeddingEngine: EmbeddingEngine;
  private vectorStore: VectorStore;
  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private documentVersions: Map<string, DocumentVersion[]> = new Map();
  private jobs: Map<string, IngestionJob> = new Map();

  constructor(
    config: IngestionConfig,
    vectorStore?: VectorStore
  ) {
    super();
    this.config = config;

    // Initialize loaders
    this.loaders = [
      new TextLoader(),
      new PDFLoader(),
      new JSONLoader(),
      new CSVLoader(),
      new WebLoader(),
    ];

    // Initialize engines
    this.chunkingEngine = new ChunkingEngine(config.chunking);
    this.embeddingEngine = new EmbeddingEngine(config.embedding);

    // Initialize vector store
    this.vectorStore = vectorStore ?? new InMemoryVectorStore(config.vectorStore);
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Ingest documents from multiple sources
   */
  async ingest(sources: DocumentSource[]): Promise<IngestionResult> {
    const job = this.createJob(sources);
    this.jobs.set(job.id, job);

    try {
      this.emit('job:started', job);
      job.status = 'loading';
      job.startedAt = new Date();

      const stats: IngestionStats = {
        documentsProcessed: 0,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        tokensUsed: 0,
        duplicatesSkipped: 0,
        errorsCount: 0,
        totalTime: 0,
        avgTimePerDocument: 0,
      };

      const documentIds: string[] = [];
      const chunkIds: string[] = [];

      // Process sources in batches
      for (let i = 0; i < sources.length; i += this.config.batchSize) {
        const batch = sources.slice(i, i + this.config.batchSize);
        const results = await Promise.allSettled(
          batch.map((source, batchIndex) =>
            this.processDocument(source, i + batchIndex, job, stats)
          )
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            documentIds.push(result.value.documentId);
            chunkIds.push(...result.value.chunkIds);
          }
        }

        // Update progress
        job.processedCount = Math.min(i + batch.length, sources.length);
        job.progress = Math.round((job.processedCount / job.totalCount) * 100);
        this.emit('job:progress', job, job.status, job.progress);
      }

      // Finalize
      stats.totalTime = Date.now() - job.startedAt!.getTime();
      stats.avgTimePerDocument = stats.documentsProcessed > 0
        ? stats.totalTime / stats.documentsProcessed
        : 0;

      job.status = 'completed';
      job.completedAt = new Date();
      job.stats = stats;
      job.progress = 100;

      const result: IngestionResult = {
        job,
        documentIds,
        chunkIds,
        stats,
      };

      this.emit('job:completed', job, result);
      return result;

    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      this.emit('job:failed', job, error as Error);
      throw error;
    }
  }

  /**
   * Add a single document
   */
  async addDocument(source: DocumentSource): Promise<{ documentId: string; chunkIds: string[] }> {
    const result = await this.ingest([source]);
    return {
      documentId: result.documentIds[0],
      chunkIds: result.chunkIds,
    };
  }

  /**
   * Update an existing document
   */
  async updateDocument(documentId: string, source: DocumentSource): Promise<{ chunkIds: string[] }> {
    const existingMeta = this.documentMetadata.get(documentId);
    if (!existingMeta) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Delete old chunks
    await this.vectorStore.delete([documentId]);

    // Process new content
    const result = await this.processDocument(
      source,
      0,
      null,
      { documentsProcessed: 0, chunksCreated: 0, embeddingsGenerated: 0, tokensUsed: 0, duplicatesSkipped: 0, errorsCount: 0, totalTime: 0, avgTimePerDocument: 0 },
      documentId
    );

    if (!result) {
      throw new Error('Failed to process updated document');
    }

    // Update version
    this.addDocumentVersion(documentId, result.contentHash);

    return { chunkIds: result.chunkIds };
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.vectorStore.delete([documentId]);
    this.documentMetadata.delete(documentId);
    this.documentVersions.delete(documentId);
  }

  /**
   * Delete multiple documents
   */
  async deleteDocuments(documentIds: string[]): Promise<void> {
    await this.vectorStore.delete(documentIds);
    for (const id of documentIds) {
      this.documentMetadata.delete(id);
      this.documentVersions.delete(id);
    }
  }

  /**
   * Search the knowledge base
   */
  async search(query: string, options?: Partial<VectorSearchOptions>): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.embeddingEngine.embedQuery(query);

    const searchOptions: VectorSearchOptions = {
      topK: 10,
      ...options,
    };

    const results = await this.vectorStore.search(queryEmbedding, searchOptions);

    // Optionally include document metadata
    if (searchOptions.includeDocumentMetadata) {
      for (const result of results) {
        result.documentMetadata = this.documentMetadata.get(result.documentId);
      }
    }

    return results;
  }

  /**
   * Get document metadata
   */
  getDocumentMetadata(documentId: string): DocumentMetadata | undefined {
    return this.documentMetadata.get(documentId);
  }

  /**
   * Get document versions
   */
  getDocumentVersions(documentId: string): DocumentVersion[] {
    return this.documentVersions.get(documentId) ?? [];
  }

  /**
   * Get document chunks
   */
  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    return this.vectorStore.getDocumentChunks(documentId);
  }

  /**
   * Get job status
   */
  getJob(jobId: string): IngestionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): IngestionJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{ totalChunks: number; totalDocuments: number }> {
    return this.vectorStore.getStats();
  }

  /**
   * Register a custom document loader
   */
  registerLoader(loader: DocumentLoader): void {
    this.loaders.unshift(loader); // Add to front for priority
  }

  /**
   * Apply batch updates
   */
  async applyUpdates(updates: DocumentUpdate[]): Promise<void> {
    for (const update of updates) {
      switch (update.operation) {
        case 'add':
          if (update.source) {
            await this.addDocument(update.source);
          }
          break;
        case 'update':
          if (update.source) {
            await this.updateDocument(update.documentId, update.source);
          }
          break;
        case 'delete':
          await this.deleteDocument(update.documentId);
          break;
      }
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createJob(sources: DocumentSource[]): IngestionJob {
    return {
      id: uuid(),
      sources,
      status: 'pending',
      progress: 0,
      processedCount: 0,
      totalCount: sources.length,
      config: this.config,
      createdAt: new Date(),
      errors: [],
    };
  }

  private async processDocument(
    source: DocumentSource,
    index: number,
    job: IngestionJob | null,
    stats: IngestionStats,
    existingDocId?: string
  ): Promise<{ documentId: string; chunkIds: string[]; contentHash: string } | null> {
    try {
      // Find appropriate loader
      const loader = this.loaders.find(l => l.canLoad(source));
      if (!loader) {
        throw new Error(`No loader available for source: ${source.name}`);
      }

      // Update status
      if (job) {
        job.status = 'loading';
        this.emit('job:progress', job, 'loading', job.progress);
      }

      // Load document
      const document = await loader.load(source);
      this.emit('document:loaded', document);

      // Check for duplicates
      if (this.config.deduplication && !existingDocId) {
        const exists = await this.vectorStore.exists(document.metadata.contentHash);
        if (exists) {
          stats.duplicatesSkipped++;
          this.emit('document:duplicate', source, document.metadata.contentHash);
          return null;
        }
      }

      // Use existing ID or generated one
      if (existingDocId) {
        document.metadata.id = existingDocId;
        document.metadata.version = (this.documentMetadata.get(existingDocId)?.version ?? 0) + 1;
      }

      // Apply collection and tags
      if (this.config.collectionId) {
        document.metadata.collectionId = this.config.collectionId;
      }
      if (this.config.tags) {
        document.metadata.tags = [...(document.metadata.tags ?? []), ...this.config.tags];
      }
      if (this.config.metadata) {
        document.metadata.custom = { ...document.metadata.custom, ...this.config.metadata };
      }

      // Update status
      if (job) {
        job.status = 'chunking';
        this.emit('job:progress', job, 'chunking', job.progress);
      }

      // Chunk document
      const chunks = await this.chunkingEngine.chunk(document);
      stats.chunksCreated += chunks.length;
      this.emit('document:chunked', document.metadata.id, chunks.length);

      // Update status
      if (job) {
        job.status = 'embedding';
        this.emit('job:progress', job, 'embedding', job.progress);
      }

      // Generate embeddings
      const embeddings = await this.embeddingEngine.embedChunks(chunks);
      stats.embeddingsGenerated += embeddings.length;
      stats.tokensUsed += embeddings.reduce((sum, e) => sum + e.tokenCount, 0);
      this.emit('document:embedded', document.metadata.id, embeddings.length);

      // Attach embeddings to chunks
      const embeddingMap = new Map(embeddings.map(e => [e.chunkId, e.embedding]));
      for (const chunk of chunks) {
        chunk.embedding = embeddingMap.get(chunk.id);
        chunk.embeddingModel = this.config.embedding.model;
      }

      // Update status
      if (job) {
        job.status = 'storing';
        this.emit('job:progress', job, 'storing', job.progress);
      }

      // Store in vector database
      await this.vectorStore.add(chunks, embeddings);
      this.emit('document:stored', document.metadata.id);

      // Store metadata
      this.documentMetadata.set(document.metadata.id, document.metadata);
      this.addDocumentVersion(document.metadata.id, document.metadata.contentHash);

      stats.documentsProcessed++;

      return {
        documentId: document.metadata.id,
        chunkIds: chunks.map(c => c.id),
        contentHash: document.metadata.contentHash,
      };

    } catch (error) {
      stats.errorsCount++;

      if (job) {
        job.errors = job.errors ?? [];
        job.errors.push({ sourceIndex: index, error: (error as Error).message });
      }

      this.emit('document:error', source, error as Error);

      if (!this.config.continueOnError) {
        throw error;
      }

      return null;
    }
  }

  private addDocumentVersion(documentId: string, contentHash: string): void {
    const versions = this.documentVersions.get(documentId) ?? [];
    const newVersion: DocumentVersion = {
      version: versions.length + 1,
      contentHash,
      timestamp: new Date(),
      size: 0, // Could be calculated if needed
      previousVersion: versions.length > 0 ? versions.length : undefined,
    };
    versions.push(newVersion);
    this.documentVersions.set(documentId, versions);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createIngestionPipeline(
  config: Partial<IngestionConfig> = {},
  vectorStore?: VectorStore
): IngestionPipeline {
  const defaultConfig: IngestionConfig = {
    chunking: {
      strategy: 'recursive',
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100,
      maxChunkSize: 2000,
    },
    embedding: {
      provider: 'local',
      model: 'local-embedding',
      dimension: 384,
      batchSize: 10,
    },
    vectorStore: {
      type: 'memory',
      collectionName: 'knowledge',
      dimension: 384,
      metric: 'cosine',
    },
    deduplication: true,
    continueOnError: true,
    batchSize: 10,
    maxConcurrency: 5,
  };

  const mergedConfig: IngestionConfig = {
    ...defaultConfig,
    ...config,
    chunking: { ...defaultConfig.chunking, ...config.chunking },
    embedding: { ...defaultConfig.embedding, ...config.embedding },
    vectorStore: { ...defaultConfig.vectorStore, ...config.vectorStore },
  };

  return new IngestionPipeline(mergedConfig, vectorStore);
}

export function createChunkingEngine(config: Partial<ChunkingConfig> = {}): ChunkingEngine {
  const defaultConfig: ChunkingConfig = {
    strategy: 'recursive',
    chunkSize: 1000,
    chunkOverlap: 200,
  };

  return new ChunkingEngine({ ...defaultConfig, ...config });
}

export function createEmbeddingEngine(config: Partial<EmbeddingConfig> = {}): EmbeddingEngine {
  const defaultConfig: EmbeddingConfig = {
    provider: 'local',
    model: 'local-embedding',
    dimension: 384,
    batchSize: 10,
  };

  return new EmbeddingEngine({ ...defaultConfig, ...config });
}

export function createInMemoryVectorStore(config: Partial<VectorStoreConfig> = {}): InMemoryVectorStore {
  const defaultConfig: VectorStoreConfig = {
    type: 'memory',
    collectionName: 'knowledge',
    dimension: 384,
    metric: 'cosine',
  };

  return new InMemoryVectorStore({ ...defaultConfig, ...config });
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default IngestionPipeline;
