/**
 * Embedding Service
 * Generates vector embeddings for text using Ollama or OpenAI
 */

import { EventEmitter } from 'events';
import type {
  EmbeddingConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  ServiceStatus,
} from '../llm/types.js';
import { OllamaService } from './OllamaService.js';

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

export class EmbeddingService extends EventEmitter {
  private provider: 'ollama' | 'openai' | 'local';
  private model: string;
  private dimensions: number;
  private batchSize: number;
  private maxRetries: number;
  private ollamaService?: OllamaService;
  private openaiApiKey?: string;
  private cache: Map<string, number[]> = new Map();
  private cacheMaxSize: number = 10000;

  constructor(config: Partial<EmbeddingConfig> = {}, ollamaService?: OllamaService) {
    super();
    const defaults = {
      provider: 'ollama' as const,
      model: 'nomic-embed-text',
      dimensions: 768,
      batchSize: 32,
      maxRetries: 3,
    };

    this.provider = config.provider ?? defaults.provider;
    this.model = config.model ?? defaults.model;
    this.dimensions = config.dimensions ?? defaults.dimensions;
    this.batchSize = config.batchSize ?? defaults.batchSize;
    this.maxRetries = config.maxRetries ?? defaults.maxRetries;
    this.ollamaService = ollamaService;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  setOllamaService(service: OllamaService): void {
    this.ollamaService = service;
  }

  setOpenAIKey(apiKey: string): void {
    this.openaiApiKey = apiKey;
  }

  // ============================================================================
  // SINGLE EMBEDDING
  // ============================================================================

  async embed(text: string, options: { useCache?: boolean } = {}): Promise<EmbeddingResult> {
    const { useCache = true } = options;

    // Check cache
    if (useCache) {
      const cached = this.cache.get(text);
      if (cached) {
        return {
          embedding: cached,
          model: this.model,
        };
      }
    }

    let embedding: number[];
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        switch (this.provider) {
          case 'ollama':
            embedding = await this.embedWithOllama(text);
            break;
          case 'openai':
            embedding = await this.embedWithOpenAI(text);
            break;
          case 'local':
            embedding = await this.embedWithLocal(text);
            break;
          default:
            throw new Error(`Unknown embedding provider: ${this.provider}`);
        }

        // Cache the result
        if (useCache) {
          this.addToCache(text, embedding);
        }

        return {
          embedding,
          model: this.model,
        };
      } catch (error) {
        retries++;
        if (retries >= this.maxRetries) {
          throw error;
        }
        // Wait before retry with exponential backoff
        await this.sleep(Math.pow(2, retries) * 100);
      }
    }

    throw new Error('Failed to generate embedding after max retries');
  }

  // ============================================================================
  // BATCH EMBEDDING
  // ============================================================================

  async embedBatch(
    texts: string[],
    options: { useCache?: boolean; onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<BatchEmbeddingResult> {
    const { useCache = true, onProgress } = options;
    const embeddings: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      if (useCache) {
        const cached = this.cache.get(texts[i]);
        if (cached) {
          embeddings[i] = cached;
          continue;
        }
      }
      uncachedTexts.push(texts[i]);
      uncachedIndices.push(i);
    }

    // Process uncached texts in batches
    let completed = texts.length - uncachedTexts.length;
    onProgress?.(completed, texts.length);

    for (let i = 0; i < uncachedTexts.length; i += this.batchSize) {
      const batch = uncachedTexts.slice(i, i + this.batchSize);
      const batchIndices = uncachedIndices.slice(i, i + this.batchSize);

      let batchEmbeddings: number[][];

      switch (this.provider) {
        case 'ollama':
          batchEmbeddings = await this.embedBatchWithOllama(batch);
          break;
        case 'openai':
          batchEmbeddings = await this.embedBatchWithOpenAI(batch);
          break;
        case 'local':
          batchEmbeddings = await this.embedBatchWithLocal(batch);
          break;
        default:
          throw new Error(`Unknown embedding provider: ${this.provider}`);
      }

      // Store results and cache
      for (let j = 0; j < batchEmbeddings.length; j++) {
        const idx = batchIndices[j];
        embeddings[idx] = batchEmbeddings[j];

        if (useCache) {
          this.addToCache(batch[j], batchEmbeddings[j]);
        }
      }

      completed += batch.length;
      onProgress?.(completed, texts.length);
    }

    return {
      embeddings,
      model: this.model,
    };
  }

  // ============================================================================
  // OLLAMA EMBEDDING
  // ============================================================================

  private async embedWithOllama(text: string): Promise<number[]> {
    if (!this.ollamaService) {
      throw new Error('Ollama service not configured');
    }

    return await this.ollamaService.embed(text, this.model);
  }

  private async embedBatchWithOllama(texts: string[]): Promise<number[][]> {
    if (!this.ollamaService) {
      throw new Error('Ollama service not configured');
    }

    return await this.ollamaService.embedBatch(texts, this.model);
  }

  // ============================================================================
  // OPENAI EMBEDDING
  // ============================================================================

  private async embedWithOpenAI(text: string): Promise<number[]> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model || 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  private async embedBatchWithOpenAI(texts: string[]): Promise<number[][]> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model || 'text-embedding-3-small',
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);
  }

  // ============================================================================
  // LOCAL EMBEDDING (FALLBACK)
  // ============================================================================

  private async embedWithLocal(text: string): Promise<number[]> {
    // Simple TF-IDF-like embedding for fallback
    // This is a basic implementation - in production, use a proper local model
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Create a simple hash-based embedding
    const embedding = new Array(this.dimensions).fill(0);
    let idx = 0;

    for (const [word, count] of wordCounts) {
      const hash = this.simpleHash(word);
      const position = Math.abs(hash) % this.dimensions;
      embedding[position] += count / words.length;
      idx++;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  private async embedBatchWithLocal(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embedWithLocal(text)));
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  // ============================================================================
  // SIMILARITY CALCULATION
  // ============================================================================

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  private addToCache(text: string, embedding: number[]): void {
    // Implement LRU-like behavior by removing oldest entries when cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, embedding);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  async getStatus(): Promise<ServiceStatus> {
    const startTime = Date.now();
    let available = false;
    let error: string | undefined;

    try {
      // Test embedding generation
      await this.embed('test', { useCache: false });
      available = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    }

    return {
      name: 'Embedding',
      available,
      latency: Date.now() - startTime,
      lastChecked: new Date(),
      error,
      details: {
        provider: this.provider,
        model: this.model,
        dimensions: this.dimensions,
        cacheSize: this.cache.size,
      },
    };
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }

  getProvider(): string {
    return this.provider;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createEmbeddingService(
  config?: Partial<EmbeddingConfig>,
  ollamaService?: OllamaService
): EmbeddingService {
  return new EmbeddingService(config, ollamaService);
}

export default EmbeddingService;
