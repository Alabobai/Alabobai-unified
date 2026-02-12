/**
 * Alabobai Embedding Service
 *
 * Generates embeddings using Ollama's embedding models with support for:
 * - Multiple embedding models (nomic-embed-text, mxbai-embed-large)
 * - Batch embedding generation
 * - Text chunking strategies (fixed size, semantic, sentence-based)
 * - Long document handling with chunk tracking
 * - Embedding caching to avoid regeneration
 * - Vector normalization for cosine similarity
 * - Progress callbacks for large documents
 * - Rate limiting and retries
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported embedding models with their configurations
 */
export type EmbeddingModel = 'nomic-embed-text' | 'mxbai-embed-large';

/**
 * Model-specific configurations including embedding dimensions
 */
export interface ModelConfig {
  name: EmbeddingModel;
  dimensions: number;
  maxTokens: number;
  description: string;
}

/**
 * Available embedding model configurations
 */
export const EMBEDDING_MODELS: Record<EmbeddingModel, ModelConfig> = {
  'nomic-embed-text': {
    name: 'nomic-embed-text',
    dimensions: 768,
    maxTokens: 8192,
    description: 'Nomic AI text embedding model - good balance of quality and speed',
  },
  'mxbai-embed-large': {
    name: 'mxbai-embed-large',
    dimensions: 1024,
    maxTokens: 512,
    description: 'MixedBread AI large embedding model - higher quality, larger dimensions',
  },
};

/**
 * Text chunking strategy types
 */
export type ChunkingStrategy = 'fixed' | 'semantic' | 'sentence';

/**
 * Configuration for text chunking
 */
export interface ChunkingConfig {
  strategy: ChunkingStrategy;
  /** Maximum chunk size in characters (for fixed strategy) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters */
  overlap?: number;
  /** Minimum chunk size to keep */
  minChunkSize?: number;
  /** Semantic boundary markers for semantic chunking */
  semanticMarkers?: string[];
}

/**
 * A text chunk with metadata for tracking
 */
export interface TextChunk {
  id: string;
  text: string;
  index: number;
  startOffset: number;
  endOffset: number;
  metadata?: Record<string, unknown>;
}

/**
 * An embedded chunk with its vector
 */
export interface EmbeddedChunk extends TextChunk {
  embedding: number[];
  model: EmbeddingModel;
  normalized: boolean;
}

/**
 * Document representation for embedding
 */
export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Embedded document with all chunks
 */
export interface EmbeddedDocument {
  id: string;
  chunks: EmbeddedChunk[];
  model: EmbeddingModel;
  totalTokens: number;
  processedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Progress callback for tracking embedding generation
 */
export interface ProgressCallback {
  (progress: ProgressInfo): void;
}

/**
 * Progress information
 */
export interface ProgressInfo {
  currentChunk: number;
  totalChunks: number;
  currentDocument?: string;
  totalDocuments?: number;
  currentDocumentIndex?: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

/**
 * Cache entry for embeddings
 */
export interface CacheEntry {
  embedding: number[];
  model: EmbeddingModel;
  text: string;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerSecond: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
}

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
  ollamaBaseUrl?: string;
  defaultModel?: EmbeddingModel;
  chunking?: ChunkingConfig;
  rateLimit?: RateLimitConfig;
  cacheEnabled?: boolean;
  cacheMaxSize?: number;
  cacheTTLMs?: number;
  normalizeVectors?: boolean;
}

/**
 * Embedding request options
 */
export interface EmbeddingOptions {
  model?: EmbeddingModel;
  chunking?: ChunkingConfig;
  onProgress?: ProgressCallback;
  skipCache?: boolean;
  normalize?: boolean;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  documents: EmbeddedDocument[];
  totalChunks: number;
  totalTokens: number;
  cacheHits: number;
  cacheMisses: number;
  processingTimeMs: number;
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

/**
 * Splits text into chunks based on the configured strategy
 */
export class TextChunker {
  private config: Required<ChunkingConfig>;

  constructor(config?: ChunkingConfig) {
    this.config = {
      strategy: config?.strategy ?? 'sentence',
      maxChunkSize: config?.maxChunkSize ?? 1000,
      overlap: config?.overlap ?? 100,
      minChunkSize: config?.minChunkSize ?? 50,
      semanticMarkers: config?.semanticMarkers ?? [
        '\n\n',      // Paragraph breaks
        '\n# ',      // Markdown headers
        '\n## ',
        '\n### ',
        '\n---',     // Horizontal rules
        '\n***',
        '.\n',       // Sentence endings with newlines
      ],
    };
  }

  /**
   * Chunk text using the configured strategy
   */
  chunk(text: string, documentId: string): TextChunk[] {
    switch (this.config.strategy) {
      case 'fixed':
        return this.fixedChunking(text, documentId);
      case 'semantic':
        return this.semanticChunking(text, documentId);
      case 'sentence':
        return this.sentenceChunking(text, documentId);
      default:
        return this.sentenceChunking(text, documentId);
    }
  }

  /**
   * Fixed-size chunking with overlap
   */
  private fixedChunking(text: string, documentId: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const { maxChunkSize, overlap, minChunkSize } = this.config;

    let startOffset = 0;
    let index = 0;

    while (startOffset < text.length) {
      let endOffset = Math.min(startOffset + maxChunkSize, text.length);

      // Try to break at word boundary
      if (endOffset < text.length) {
        const lastSpace = text.lastIndexOf(' ', endOffset);
        if (lastSpace > startOffset + minChunkSize) {
          endOffset = lastSpace;
        }
      }

      const chunkText = text.slice(startOffset, endOffset).trim();

      if (chunkText.length >= minChunkSize) {
        chunks.push({
          id: `${documentId}_chunk_${index}`,
          text: chunkText,
          index,
          startOffset,
          endOffset,
        });
        index++;
      }

      // Move start position with overlap
      startOffset = endOffset - overlap;
      if (startOffset <= chunks[chunks.length - 1]?.startOffset) {
        startOffset = endOffset;
      }
    }

    return chunks;
  }

  /**
   * Semantic chunking based on document structure
   */
  private semanticChunking(text: string, documentId: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const { maxChunkSize, minChunkSize, semanticMarkers, overlap } = this.config;

    // Find all semantic boundaries
    const boundaries: number[] = [0];

    for (const marker of semanticMarkers) {
      let pos = 0;
      while ((pos = text.indexOf(marker, pos)) !== -1) {
        boundaries.push(pos);
        pos += marker.length;
      }
    }

    boundaries.push(text.length);
    boundaries.sort((a, b) => a - b);

    // Deduplicate and filter
    const uniqueBoundaries = [...new Set(boundaries)];

    // Create chunks from boundaries, merging small sections
    let currentStart = 0;
    let currentText = '';
    let index = 0;

    for (let i = 1; i < uniqueBoundaries.length; i++) {
      const segmentText = text.slice(uniqueBoundaries[i - 1], uniqueBoundaries[i]);

      if (currentText.length + segmentText.length <= maxChunkSize) {
        currentText += segmentText;
      } else {
        // Save current chunk if big enough
        if (currentText.trim().length >= minChunkSize) {
          chunks.push({
            id: `${documentId}_chunk_${index}`,
            text: currentText.trim(),
            index,
            startOffset: currentStart,
            endOffset: uniqueBoundaries[i - 1],
          });
          index++;
        }

        // Start new chunk with overlap
        const overlapStart = Math.max(0, currentText.length - overlap);
        currentStart = uniqueBoundaries[i - 1] - (currentText.length - overlapStart);
        currentText = currentText.slice(overlapStart) + segmentText;
      }
    }

    // Add final chunk
    if (currentText.trim().length >= minChunkSize) {
      chunks.push({
        id: `${documentId}_chunk_${index}`,
        text: currentText.trim(),
        index,
        startOffset: currentStart,
        endOffset: text.length,
      });
    }

    return chunks;
  }

  /**
   * Sentence-based chunking
   */
  private sentenceChunking(text: string, documentId: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const { maxChunkSize, minChunkSize, overlap } = this.config;

    // Split into sentences (handles common abbreviations)
    const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])\s*\n/g;
    const sentences: { text: string; start: number; end: number }[] = [];

    let lastEnd = 0;
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
      sentences.push({
        text: text.slice(lastEnd, match.index + 1),
        start: lastEnd,
        end: match.index + 1,
      });
      lastEnd = match.index + match[0].length;
    }

    // Add remaining text
    if (lastEnd < text.length) {
      sentences.push({
        text: text.slice(lastEnd),
        start: lastEnd,
        end: text.length,
      });
    }

    // Group sentences into chunks
    let currentChunk = '';
    let currentStart = 0;
    let index = 0;
    let sentencesInChunk: typeof sentences = [];

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.text.length <= maxChunkSize) {
        currentChunk += sentence.text;
        sentencesInChunk.push(sentence);
      } else {
        // Save current chunk
        if (currentChunk.trim().length >= minChunkSize) {
          chunks.push({
            id: `${documentId}_chunk_${index}`,
            text: currentChunk.trim(),
            index,
            startOffset: currentStart,
            endOffset: sentencesInChunk[sentencesInChunk.length - 1]?.end ?? currentStart,
          });
          index++;
        }

        // Calculate overlap sentences
        let overlapLength = 0;
        const overlapSentences: typeof sentences = [];

        for (let i = sentencesInChunk.length - 1; i >= 0 && overlapLength < overlap; i--) {
          overlapSentences.unshift(sentencesInChunk[i]);
          overlapLength += sentencesInChunk[i].text.length;
        }

        // Start new chunk with overlap
        currentChunk = overlapSentences.map(s => s.text).join('') + sentence.text;
        currentStart = overlapSentences[0]?.start ?? sentence.start;
        sentencesInChunk = [...overlapSentences, sentence];
      }
    }

    // Add final chunk
    if (currentChunk.trim().length >= minChunkSize) {
      chunks.push({
        id: `${documentId}_chunk_${index}`,
        text: currentChunk.trim(),
        index,
        startOffset: currentStart,
        endOffset: text.length,
      });
    }

    return chunks;
  }
}

// ============================================================================
// EMBEDDING CACHE
// ============================================================================

/**
 * LRU cache for embeddings with TTL support
 */
export class EmbeddingCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 10000, ttlMs = 24 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from text and model
   */
  private getKey(text: string, model: EmbeddingModel): string {
    // Simple hash for the key
    let hash = 0;
    const str = `${model}:${text}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${model}_${hash}`;
  }

  /**
   * Get embedding from cache
   */
  get(text: string, model: EmbeddingModel): number[] | null {
    const key = this.getKey(text, model);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt.getTime() > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = new Date();

    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, model: EmbeddingModel, embedding: number[]): void {
    const key = this.getKey(text, model);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      embedding,
      model,
      text,
      createdAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date(),
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = entry.lastAccessedAt.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt.getTime() > this.ttlMs) {
        this.cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

/**
 * Token bucket rate limiter with retry support
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private config: Required<RateLimitConfig>;

  constructor(config?: RateLimitConfig) {
    this.config = {
      requestsPerSecond: config?.requestsPerSecond ?? 10,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      retryBackoffMultiplier: config?.retryBackoffMultiplier ?? 2,
    };
    this.tokens = this.config.requestsPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Wait for a token to become available
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for next token
    const waitTime = 1000 / this.config.requestsPerSecond;
    await this.sleep(waitTime);
    this.refill();
    this.tokens--;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / 1000) * this.config.requestsPerSecond;

    this.tokens = Math.min(
      this.config.requestsPerSecond,
      this.tokens + newTokens
    );
    this.lastRefill = now;
  }

  /**
   * Execute with retry logic
   */
  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.config.retryDelayMs;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.acquire();
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          await this.sleep(delay);
          delay *= this.config.retryBackoffMultiplier;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      // Retry on network errors and rate limits
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503')
      );
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// VECTOR UTILITIES
// ============================================================================

/**
 * Normalize a vector for cosine similarity
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two normalized vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  return Math.sqrt(
    a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
  );
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

/**
 * Main embedding service for generating and managing embeddings
 */
export class EmbeddingService {
  private baseUrl: string;
  private defaultModel: EmbeddingModel;
  private chunker: TextChunker;
  private cache: EmbeddingCache;
  private rateLimiter: RateLimiter;
  private normalizeVectors: boolean;
  private cacheEnabled: boolean;

  constructor(config?: EmbeddingServiceConfig) {
    this.baseUrl = config?.ollamaBaseUrl ?? 'http://localhost:11434';
    this.defaultModel = config?.defaultModel ?? 'nomic-embed-text';
    this.chunker = new TextChunker(config?.chunking);
    this.cache = new EmbeddingCache(
      config?.cacheMaxSize ?? 10000,
      config?.cacheTTLMs ?? 24 * 60 * 60 * 1000
    );
    this.rateLimiter = new RateLimiter(config?.rateLimit);
    this.normalizeVectors = config?.normalizeVectors ?? true;
    this.cacheEnabled = config?.cacheEnabled ?? true;
  }

  /**
   * Get model configuration
   */
  getModelConfig(model?: EmbeddingModel): ModelConfig {
    return EMBEDDING_MODELS[model ?? this.defaultModel];
  }

  /**
   * Get embedding dimensions for a model
   */
  getDimensions(model?: EmbeddingModel): number {
    return this.getModelConfig(model).dimensions;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const model = options?.model ?? this.defaultModel;
    const shouldNormalize = options?.normalize ?? this.normalizeVectors;

    // Check cache first
    if (this.cacheEnabled && !options?.skipCache) {
      const cached = this.cache.get(text, model);
      if (cached) {
        return shouldNormalize ? normalizeVector(cached) : cached;
      }
    }

    // Generate embedding via Ollama
    const embedding = await this.rateLimiter.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama embedding error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.embedding as number[];
    });

    // Cache the result
    if (this.cacheEnabled && !options?.skipCache) {
      this.cache.set(text, model, embedding);
    }

    return shouldNormalize ? normalizeVector(embedding) : embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(
    texts: string[],
    options?: EmbeddingOptions
  ): Promise<number[][]> {
    const model = options?.model ?? this.defaultModel;
    const embeddings: number[][] = [];
    const startTime = Date.now();

    for (let i = 0; i < texts.length; i++) {
      const embedding = await this.embed(texts[i], { ...options, model });
      embeddings.push(embedding);

      // Report progress
      if (options?.onProgress) {
        const elapsed = Date.now() - startTime;
        const avgTimePerChunk = elapsed / (i + 1);
        const remaining = (texts.length - i - 1) * avgTimePerChunk;

        options.onProgress({
          currentChunk: i + 1,
          totalChunks: texts.length,
          percentComplete: ((i + 1) / texts.length) * 100,
          estimatedTimeRemaining: remaining,
        });
      }
    }

    return embeddings;
  }

  /**
   * Embed a document with chunking
   */
  async embedDocument(
    document: Document,
    options?: EmbeddingOptions
  ): Promise<EmbeddedDocument> {
    const model = options?.model ?? this.defaultModel;
    const chunkingConfig = options?.chunking ?? undefined;
    const startTime = Date.now();

    // Use custom chunker if provided
    const chunker = chunkingConfig ? new TextChunker(chunkingConfig) : this.chunker;
    const chunks = chunker.chunk(document.content, document.id);

    const embeddedChunks: EmbeddedChunk[] = [];
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.embed(chunk.text, { ...options, model });

      embeddedChunks.push({
        ...chunk,
        embedding,
        model,
        normalized: options?.normalize ?? this.normalizeVectors,
      });

      totalTokens += estimateTokenCount(chunk.text);

      // Report progress
      if (options?.onProgress) {
        const elapsed = Date.now() - startTime;
        const avgTimePerChunk = elapsed / (i + 1);
        const remaining = (chunks.length - i - 1) * avgTimePerChunk;

        options.onProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          currentDocument: document.id,
          percentComplete: ((i + 1) / chunks.length) * 100,
          estimatedTimeRemaining: remaining,
        });
      }
    }

    return {
      id: document.id,
      chunks: embeddedChunks,
      model,
      totalTokens,
      processedAt: new Date(),
      metadata: document.metadata,
    };
  }

  /**
   * Embed multiple documents with batch processing
   */
  async embedDocuments(
    documents: Document[],
    options?: EmbeddingOptions
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const results: EmbeddedDocument[] = [];
    let totalChunks = 0;
    let totalTokens = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    // Track cache stats before
    const initialCacheSize = this.cache.getStats().size;

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const document = documents[docIndex];

      // Create progress wrapper that includes document-level progress
      const docProgress: ProgressCallback = (progress) => {
        if (options?.onProgress) {
          options.onProgress({
            ...progress,
            currentDocument: document.id,
            totalDocuments: documents.length,
            currentDocumentIndex: docIndex + 1,
          });
        }
      };

      const embeddedDoc = await this.embedDocument(document, {
        ...options,
        onProgress: docProgress,
      });

      results.push(embeddedDoc);
      totalChunks += embeddedDoc.chunks.length;
      totalTokens += embeddedDoc.totalTokens;
    }

    // Calculate cache stats
    const finalCacheSize = this.cache.getStats().size;
    cacheMisses = finalCacheSize - initialCacheSize;
    cacheHits = totalChunks - cacheMisses;

    return {
      documents: results,
      totalChunks,
      totalTokens,
      cacheHits: Math.max(0, cacheHits),
      cacheMisses,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find most similar chunks to a query
   */
  async findSimilar(
    query: string,
    embeddedDocuments: EmbeddedDocument[],
    options?: {
      topK?: number;
      threshold?: number;
      model?: EmbeddingModel;
    }
  ): Promise<Array<EmbeddedChunk & { similarity: number; documentId: string }>> {
    const topK = options?.topK ?? 5;
    const threshold = options?.threshold ?? 0;
    const model = options?.model ?? this.defaultModel;

    // Embed the query
    const queryEmbedding = await this.embed(query, { model, normalize: true });

    // Calculate similarities for all chunks
    const similarities: Array<EmbeddedChunk & { similarity: number; documentId: string }> = [];

    for (const doc of embeddedDocuments) {
      for (const chunk of doc.chunks) {
        // Ensure chunk embedding is normalized for comparison
        const chunkEmbedding = chunk.normalized
          ? chunk.embedding
          : normalizeVector(chunk.embedding);

        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

        if (similarity >= threshold) {
          similarities.push({
            ...chunk,
            similarity,
            documentId: doc.id,
          });
        }
      }
    }

    // Sort by similarity and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return this.cache.getStats();
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available embedding models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.models || [])
        .map((m: { name: string }) => m.name)
        .filter((name: string) =>
          name.includes('embed') ||
          name.includes('nomic') ||
          name.includes('mxbai')
        );
    } catch {
      return [];
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an embedding service with default configuration
 */
export function createEmbeddingService(
  config?: EmbeddingServiceConfig
): EmbeddingService {
  return new EmbeddingService(config);
}

/**
 * Create a text chunker with custom configuration
 */
export function createTextChunker(config?: ChunkingConfig): TextChunker {
  return new TextChunker(config);
}

/**
 * Get the default embedding service instance (singleton)
 */
let defaultService: EmbeddingService | null = null;

export function getDefaultEmbeddingService(): EmbeddingService {
  if (!defaultService) {
    defaultService = createEmbeddingService({
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: (process.env.EMBEDDING_MODEL as EmbeddingModel) || 'nomic-embed-text',
      cacheEnabled: process.env.EMBEDDING_CACHE_ENABLED !== 'false',
    });
  }
  return defaultService;
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export {
  normalizeVector as normalize,
  cosineSimilarity as similarity,
  euclideanDistance as distance,
  estimateTokenCount as estimateTokens,
};
