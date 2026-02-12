/**
 * RAG (Retrieval Augmented Generation) Service
 * Combines vector search with LLM generation for knowledge-enhanced responses
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type {
  RAGConfig,
  RAGDocument,
  RAGQuery,
  RAGResult,
  RAGContext,
  DocumentMetadata,
  DocumentChunk,
  ChunkingConfig,
  ProcessedDocument,
  QdrantFilter,
  IngestionOptions,
  IngestionResult,
} from '../llm/types.js';
import { QdrantService } from './QdrantService.js';
import { EmbeddingService } from './EmbeddingService.js';

// ============================================================================
// RAG SERVICE
// ============================================================================

export class RAGService extends EventEmitter {
  private qdrantService: QdrantService;
  private embeddingService: EmbeddingService;
  private config: RAGConfig;
  private chunkingConfig: ChunkingConfig;
  private defaultCollection: string;
  private vectorSize: number;

  constructor(
    qdrantService: QdrantService,
    embeddingService: EmbeddingService,
    config: Partial<RAGConfig> = {},
    chunkingConfig: Partial<ChunkingConfig> = {}
  ) {
    super();
    this.qdrantService = qdrantService;
    this.embeddingService = embeddingService;

    // Apply defaults
    this.config = {
      topK: config.topK ?? 5,
      minScore: config.minScore ?? 0.7,
      maxContextTokens: config.maxContextTokens ?? 4000,
      includeMetadata: config.includeMetadata ?? true,
      reranking: config.reranking ?? false,
      hybridSearch: config.hybridSearch ?? false,
    };

    this.chunkingConfig = {
      chunkSize: chunkingConfig.chunkSize ?? 1000,
      chunkOverlap: chunkingConfig.chunkOverlap ?? 200,
      separator: chunkingConfig.separator ?? '\n\n',
      minChunkSize: chunkingConfig.minChunkSize ?? 100,
      preserveParagraphs: chunkingConfig.preserveParagraphs ?? true,
    };

    this.defaultCollection = 'alabobai_knowledge';
    this.vectorSize = embeddingService.getDimensions();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    // Ensure default collection exists
    await this.qdrantService.ensureCollection(this.defaultCollection, this.vectorSize);
    this.emit('initialized');
  }

  setDefaultCollection(name: string): void {
    this.defaultCollection = name;
  }

  // ============================================================================
  // DOCUMENT INGESTION
  // ============================================================================

  async ingestText(
    text: string,
    source: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const collection = options.collection ?? this.defaultCollection;
    const documentId = uuid();

    try {
      // Ensure collection exists
      await this.qdrantService.ensureCollection(collection, this.vectorSize);

      // Chunk the text
      const chunkConfig = { ...this.chunkingConfig, ...options.chunkingOverride };
      const chunks = this.chunkText(text, chunkConfig);

      if (chunks.length === 0) {
        return {
          documentId,
          source,
          chunksCreated: 0,
          totalTokens: 0,
          processingTime: Date.now() - startTime,
          collection,
          success: false,
          error: 'No chunks created from text',
        };
      }

      // Generate embeddings for all chunks
      const chunkTexts = chunks.map(c => c.content);
      const { embeddings } = await this.embeddingService.embedBatch(chunkTexts, {
        onProgress: (completed, total) => {
          this.emit('embeddingProgress', { documentId, completed, total });
        },
      });

      // Prepare points for Qdrant
      const points = chunks.map((chunk, idx) => ({
        id: `${documentId}_${idx}`,
        vector: embeddings[idx],
        payload: {
          content: chunk.content,
          documentId,
          source,
          sourceType: 'manual' as const,
          chunkIndex: idx,
          totalChunks: chunks.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tokenCount: chunk.tokenCount,
          ...options.metadata,
          tags: options.tags || [],
        },
      }));

      // Upsert to Qdrant
      await this.qdrantService.upsertPoints(collection, points);

      const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

      this.emit('documentIngested', {
        documentId,
        source,
        chunksCreated: chunks.length,
        collection,
      });

      return {
        documentId,
        source,
        chunksCreated: chunks.length,
        totalTokens,
        processingTime: Date.now() - startTime,
        collection,
        success: true,
      };
    } catch (error) {
      return {
        documentId,
        source,
        chunksCreated: 0,
        totalTokens: 0,
        processingTime: Date.now() - startTime,
        collection,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async ingestFile(
    filePath: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    // Read file content based on extension
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');

    const ext = path.extname(filePath).toLowerCase();
    let content: string;
    let metadata: Partial<DocumentMetadata> = {
      source: filePath,
      sourceType: 'file',
      filename: path.basename(filePath),
      fileType: ext,
    };

    try {
      switch (ext) {
        case '.txt':
        case '.md':
        case '.markdown':
          content = await fs.readFile(filePath, 'utf-8');
          break;

        case '.json':
          const jsonContent = await fs.readFile(filePath, 'utf-8');
          content = JSON.stringify(JSON.parse(jsonContent), null, 2);
          break;

        case '.csv':
          content = await fs.readFile(filePath, 'utf-8');
          // Convert CSV to more readable format
          const lines = content.split('\n');
          if (lines.length > 1) {
            const headers = lines[0].split(',');
            content = lines.slice(1).map(line => {
              const values = line.split(',');
              return headers.map((h, i) => `${h.trim()}: ${values[i]?.trim() || ''}`).join('\n');
            }).join('\n\n');
          }
          break;

        case '.html':
        case '.htm':
          const htmlContent = await fs.readFile(filePath, 'utf-8');
          // Basic HTML to text conversion
          content = htmlContent
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          break;

        default:
          // Try to read as text
          content = await fs.readFile(filePath, 'utf-8');
      }

      return await this.ingestText(content, filePath, {
        ...options,
        metadata: { ...metadata, ...options.metadata },
      });
    } catch (error) {
      return {
        documentId: uuid(),
        source: filePath,
        chunksCreated: 0,
        totalTokens: 0,
        processingTime: 0,
        collection: options.collection ?? this.defaultCollection,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }

  async ingestUrl(
    url: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let content: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        const html = await response.text();
        // Basic HTML to text conversion
        content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      return await this.ingestText(content, url, {
        ...options,
        metadata: {
          sourceType: 'url',
          url,
          ...options.metadata,
        },
      });
    } catch (error) {
      return {
        documentId: uuid(),
        source: url,
        chunksCreated: 0,
        totalTokens: 0,
        processingTime: 0,
        collection: options.collection ?? this.defaultCollection,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch URL',
      };
    }
  }

  // ============================================================================
  // SEARCH AND RETRIEVAL
  // ============================================================================

  async search(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();

    // Generate query embedding
    const { embedding } = await this.embeddingService.embed(query.query);

    // Determine collections to search
    const collections = query.collections ?? [this.defaultCollection];
    const allResults: RAGDocument[] = [];

    for (const collection of collections) {
      try {
        const results = await this.qdrantService.search(collection, embedding, {
          limit: query.topK ?? this.config.topK,
          scoreThreshold: query.minScore ?? this.config.minScore,
          filter: query.filter,
          withPayload: true,
        });

        for (const result of results) {
          allResults.push({
            id: String(result.id),
            content: result.payload.content as string,
            metadata: {
              source: result.payload.source as string,
              sourceType: result.payload.sourceType as 'file' | 'url' | 'api' | 'manual',
              filename: result.payload.filename as string | undefined,
              fileType: result.payload.fileType as string | undefined,
              url: result.payload.url as string | undefined,
              title: result.payload.title as string | undefined,
              createdAt: new Date(result.payload.createdAt as string),
              updatedAt: new Date(result.payload.updatedAt as string),
              chunkIndex: result.payload.chunkIndex as number | undefined,
              totalChunks: result.payload.totalChunks as number | undefined,
              tags: result.payload.tags as string[] | undefined,
              collection,
            },
            score: result.score,
          });
        }
      } catch (error) {
        console.warn(`[RAGService] Failed to search collection ${collection}:`, error);
      }
    }

    // Sort by score and take top K
    allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topResults = allResults.slice(0, query.topK ?? this.config.topK);

    // Optionally rerank results
    let reranked = false;
    if (this.config.reranking && topResults.length > 1) {
      // Simple reranking based on query term overlap
      const queryTerms = new Set(query.query.toLowerCase().split(/\s+/));
      topResults.forEach(doc => {
        const docTerms = new Set(doc.content.toLowerCase().split(/\s+/));
        const overlap = [...queryTerms].filter(t => docTerms.has(t)).length;
        doc.score = (doc.score ?? 0) * (1 + overlap * 0.1);
      });
      topResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      reranked = true;
    }

    return {
      query: query.query,
      documents: topResults,
      totalFound: allResults.length,
      searchTime: Date.now() - startTime,
      reranked,
    };
  }

  async buildContext(query: string, options: Partial<RAGQuery> = {}): Promise<RAGContext> {
    const result = await this.search({
      query,
      ...options,
    });

    // Build context text from retrieved documents
    let contextText = '';
    let totalTokens = 0;
    const usedDocs: RAGDocument[] = [];
    const citations: string[] = [];

    for (const doc of result.documents) {
      const docText = this.formatDocumentForContext(doc);
      const tokenCount = this.estimateTokens(docText);

      if (totalTokens + tokenCount <= this.config.maxContextTokens) {
        contextText += docText + '\n\n';
        totalTokens += tokenCount;
        usedDocs.push(doc);

        // Add citation
        const citation = doc.metadata.title || doc.metadata.filename || doc.metadata.source;
        if (citation && !citations.includes(citation)) {
          citations.push(citation);
        }
      }
    }

    return {
      documents: usedDocs,
      contextText: contextText.trim(),
      totalTokens,
      sourceCitations: citations,
    };
  }

  private formatDocumentForContext(doc: RAGDocument): string {
    let formatted = '';

    if (this.config.includeMetadata) {
      const source = doc.metadata.title || doc.metadata.filename || doc.metadata.source;
      if (source) {
        formatted += `[Source: ${source}]\n`;
      }
    }

    formatted += doc.content;
    return formatted;
  }

  // ============================================================================
  // DOCUMENT MANAGEMENT
  // ============================================================================

  async deleteDocument(documentId: string, collection?: string): Promise<boolean> {
    const targetCollection = collection ?? this.defaultCollection;

    try {
      // Find all points with this document ID
      const { points } = await this.qdrantService.scroll(targetCollection, {
        filter: {
          must: [{ key: 'documentId', match: { value: documentId } }],
        },
        limit: 1000,
      });

      if (points.length === 0) {
        return false;
      }

      // Delete all points
      const ids = points.map(p => p.id);
      await this.qdrantService.deletePoints(targetCollection, ids);

      this.emit('documentDeleted', { documentId, collection: targetCollection, chunksDeleted: ids.length });
      return true;
    } catch (error) {
      console.error('[RAGService] Failed to delete document:', error);
      return false;
    }
  }

  async listDocuments(collection?: string): Promise<{ documentId: string; source: string; chunkCount: number }[]> {
    const targetCollection = collection ?? this.defaultCollection;
    const documents = new Map<string, { source: string; count: number }>();

    let offset: string | number | undefined;
    do {
      const { points, nextOffset } = await this.qdrantService.scroll(targetCollection, {
        limit: 100,
        offset,
      });

      for (const point of points) {
        const docId = point.payload.documentId as string;
        const source = point.payload.source as string;

        if (!documents.has(docId)) {
          documents.set(docId, { source, count: 0 });
        }
        documents.get(docId)!.count++;
      }

      offset = nextOffset;
    } while (offset);

    return Array.from(documents.entries()).map(([documentId, { source, count }]) => ({
      documentId,
      source,
      chunkCount: count,
    }));
  }

  // ============================================================================
  // TEXT CHUNKING
  // ============================================================================

  private chunkText(text: string, config: ChunkingConfig): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;

    // Split by separator first if preserving paragraphs
    let segments: string[];
    if (config.preserveParagraphs) {
      segments = text.split(config.separator);
    } else {
      segments = [text];
    }

    let currentChunk = '';
    let chunkStartIndex = 0;

    for (const segment of segments) {
      const segmentWithSeparator = segment + config.separator;

      if (currentChunk.length + segmentWithSeparator.length <= config.chunkSize) {
        if (currentChunk === '') {
          chunkStartIndex = startIndex;
        }
        currentChunk += segmentWithSeparator;
      } else {
        // Save current chunk if it meets minimum size
        if (currentChunk.length >= config.minChunkSize) {
          chunks.push(this.createChunk(currentChunk.trim(), chunkStartIndex, chunks.length));
        }

        // Handle overlap
        if (config.chunkOverlap > 0 && currentChunk.length > config.chunkOverlap) {
          const overlapText = currentChunk.slice(-config.chunkOverlap);
          currentChunk = overlapText + segmentWithSeparator;
          chunkStartIndex = startIndex - config.chunkOverlap;
        } else {
          currentChunk = segmentWithSeparator;
          chunkStartIndex = startIndex;
        }

        // If segment is too large, split it further
        while (currentChunk.length > config.chunkSize) {
          const chunkEnd = config.chunkSize;
          const chunkText = currentChunk.slice(0, chunkEnd);

          if (chunkText.trim().length >= config.minChunkSize) {
            chunks.push(this.createChunk(chunkText.trim(), chunkStartIndex, chunks.length));
          }

          // Overlap for next chunk
          const overlapStart = Math.max(0, chunkEnd - config.chunkOverlap);
          currentChunk = currentChunk.slice(overlapStart);
          chunkStartIndex += overlapStart;
        }
      }

      startIndex += segmentWithSeparator.length;
    }

    // Add final chunk
    if (currentChunk.trim().length >= config.minChunkSize) {
      chunks.push(this.createChunk(currentChunk.trim(), chunkStartIndex, chunks.length));
    }

    return chunks;
  }

  private createChunk(content: string, startIndex: number, index: number): DocumentChunk {
    return {
      id: `chunk_${index}`,
      content,
      metadata: {
        source: '',
        sourceType: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        chunkIndex: index,
      },
      startIndex,
      endIndex: startIndex + content.length,
      tokenCount: this.estimateTokens(content),
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
  }

  updateChunkingConfig(config: Partial<ChunkingConfig>): void {
    this.chunkingConfig = { ...this.chunkingConfig, ...config };
  }

  getConfig(): RAGConfig {
    return { ...this.config };
  }

  getChunkingConfig(): ChunkingConfig {
    return { ...this.chunkingConfig };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createRAGService(
  qdrantService: QdrantService,
  embeddingService: EmbeddingService,
  config?: Partial<RAGConfig>,
  chunkingConfig?: Partial<ChunkingConfig>
): RAGService {
  return new RAGService(qdrantService, embeddingService, config, chunkingConfig);
}

export default RAGService;
