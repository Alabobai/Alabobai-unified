/**
 * Vector Store - Embedding Generation and Similarity Search
 *
 * Provides vector storage and semantic search capabilities:
 * - Embedding generation (TF-IDF-like local implementation)
 * - Vector similarity search using cosine similarity
 * - SQLite-based storage for persistence
 * - Index management
 */

import Database from 'better-sqlite3';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface SearchResult {
  id: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  filter?: {
    userId?: string;
    type?: string | string[];
    tags?: string[];
  };
}

// ============================================================================
// Embedding Generation (Local Implementation)
// ============================================================================

const EMBEDDING_DIMENSIONS = 256;

/**
 * Hash string to integer (DJB2 algorithm)
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Generate text embedding using character n-grams and word features
 * This is a simple local implementation - can be upgraded to use AI embeddings
 */
export function generateEmbedding(text: string, dimensions: number = EMBEDDING_DIMENSIONS): number[] {
  const embedding = new Array(dimensions).fill(0);
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);

  // Character trigrams
  for (let i = 0; i < normalizedText.length - 2; i++) {
    const trigram = normalizedText.substring(i, i + 3);
    const hash = hashString(trigram);
    const idx = hash % dimensions;
    embedding[idx] += 1;
  }

  // Word features (weighted higher)
  for (const word of words) {
    const hash = hashString(word);
    const idx = hash % dimensions;
    embedding[idx] += 2;

    // Word length feature
    const lengthIdx = (hash + word.length) % dimensions;
    embedding[lengthIdx] += 0.5;

    // Word bigrams
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word.substring(i, i + 2);
      const bigramHash = hashString(bigram);
      const bigramIdx = bigramHash % dimensions;
      embedding[bigramIdx] += 0.5;
    }
  }

  // Word pairs (capture some semantic relationships)
  for (let i = 0; i < words.length - 1; i++) {
    const pair = words[i] + '_' + words[i + 1];
    const pairHash = hashString(pair);
    const pairIdx = pairHash % dimensions;
    embedding[pairIdx] += 1.5;
  }

  // L2 normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

// ============================================================================
// Vector Store Class
// ============================================================================

export class VectorStore {
  private db: Database.Database;
  private cache: Map<string, number[]> = new Map();
  private cacheLimit: number;

  constructor(databasePath: string = './data/vectors.db', cacheLimit: number = 1000) {
    const dbDir = path.dirname(databasePath);

    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(databasePath);
    this.cacheLimit = cacheLimit;

    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vectors_created ON vectors(created_at DESC);
    `);

    // Create metadata index table for filtering
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_metadata (
        vector_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (vector_id, key),
        FOREIGN KEY (vector_id) REFERENCES vectors(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_metadata_key ON vector_metadata(key, value);
    `);

    console.log('[VectorStore] Database initialized');
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return generateEmbedding(text);
  }

  /**
   * Add a vector to the store
   */
  async addVector(
    id: string,
    embedding: number[],
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const now = Date.now();

    // Store embedding as binary blob
    const embeddingBuffer = Buffer.from(new Float64Array(embedding).buffer);

    this.db.prepare(`
      INSERT OR REPLACE INTO vectors (id, embedding, metadata, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, embeddingBuffer, JSON.stringify(metadata), now);

    // Store searchable metadata
    const metadataStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vector_metadata (vector_id, key, value)
      VALUES (?, ?, ?)
    `);

    // Delete old metadata
    this.db.prepare(`DELETE FROM vector_metadata WHERE vector_id = ?`).run(id);

    // Insert new metadata
    for (const [key, value] of Object.entries(metadata)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          metadataStmt.run(id, key, String(v));
        }
      } else if (value !== null && value !== undefined) {
        metadataStmt.run(id, key, String(value));
      }
    }

    // Update cache
    this.cache.set(id, embedding);
    this.pruneCache();
  }

  /**
   * Get a vector by ID
   */
  async getVector(id: string): Promise<VectorEntry | null> {
    const row = this.db.prepare(`SELECT * FROM vectors WHERE id = ?`).get(id) as any;

    if (!row) return null;

    const embedding = Array.from(new Float64Array(row.embedding.buffer));

    return {
      id: row.id,
      embedding,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
    };
  }

  /**
   * Update a vector
   */
  async updateVector(id: string, embedding: number[], metadata?: Record<string, unknown>): Promise<void> {
    const embeddingBuffer = Buffer.from(new Float64Array(embedding).buffer);

    if (metadata) {
      this.db.prepare(`
        UPDATE vectors SET embedding = ?, metadata = ? WHERE id = ?
      `).run(embeddingBuffer, JSON.stringify(metadata), id);

      // Update metadata index
      this.db.prepare(`DELETE FROM vector_metadata WHERE vector_id = ?`).run(id);
      const metadataStmt = this.db.prepare(`
        INSERT INTO vector_metadata (vector_id, key, value) VALUES (?, ?, ?)
      `);

      for (const [key, value] of Object.entries(metadata)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            metadataStmt.run(id, key, String(v));
          }
        } else if (value !== null && value !== undefined) {
          metadataStmt.run(id, key, String(value));
        }
      }
    } else {
      this.db.prepare(`UPDATE vectors SET embedding = ? WHERE id = ?`).run(embeddingBuffer, id);
    }

    // Update cache
    this.cache.set(id, embedding);
    this.pruneCache();
  }

  /**
   * Delete a vector
   */
  async deleteVector(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM vectors WHERE id = ?`).run(id);
    this.cache.delete(id);
    return result.changes > 0;
  }

  /**
   * Search for similar vectors
   */
  async search(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, minSimilarity = 0.0, filter } = options;

    // Build query with filters
    let sql = 'SELECT id, embedding, metadata FROM vectors';
    const params: any[] = [];

    if (filter) {
      const conditions: string[] = [];

      if (filter.userId) {
        conditions.push(`
          EXISTS (
            SELECT 1 FROM vector_metadata vm
            WHERE vm.vector_id = vectors.id AND vm.key = 'userId' AND vm.value = ?
          )
        `);
        params.push(filter.userId);
      }

      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        const typePlaceholders = types.map(() => '?').join(',');
        conditions.push(`
          EXISTS (
            SELECT 1 FROM vector_metadata vm
            WHERE vm.vector_id = vectors.id AND vm.key = 'type' AND vm.value IN (${typePlaceholders})
          )
        `);
        params.push(...types);
      }

      if (filter.tags?.length) {
        const tagPlaceholders = filter.tags.map(() => '?').join(',');
        conditions.push(`
          EXISTS (
            SELECT 1 FROM vector_metadata vm
            WHERE vm.vector_id = vectors.id AND vm.key = 'tags' AND vm.value IN (${tagPlaceholders})
          )
        `);
        params.push(...filter.tags);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
    }

    const rows = this.db.prepare(sql).all(...params) as any[];

    // Calculate similarities
    const results: SearchResult[] = [];

    for (const row of rows) {
      // Check cache first
      let embedding: number[];
      if (this.cache.has(row.id)) {
        embedding = this.cache.get(row.id)!;
      } else {
        embedding = Array.from(new Float64Array(row.embedding.buffer));
        this.cache.set(row.id, embedding);
      }

      const similarity = cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= minSimilarity) {
        results.push({
          id: row.id,
          similarity,
          metadata: JSON.parse(row.metadata || '{}'),
        });
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    this.pruneCache();

    return results.slice(0, limit);
  }

  /**
   * Calculate similarity between two stored vectors
   */
  async similarity(id1: string, id2: string): Promise<number> {
    const v1 = await this.getVector(id1);
    const v2 = await this.getVector(id2);

    if (!v1 || !v2) return 0;

    return cosineSimilarity(v1.embedding, v2.embedding);
  }

  /**
   * Get all vectors for a user
   */
  async getUserVectors(userId: string, limit: number = 1000): Promise<VectorEntry[]> {
    const rows = this.db.prepare(`
      SELECT v.* FROM vectors v
      JOIN vector_metadata vm ON v.id = vm.vector_id
      WHERE vm.key = 'userId' AND vm.value = ?
      ORDER BY v.created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      embedding: Array.from(new Float64Array(row.embedding.buffer)),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
    }));
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalVectors: number;
    cacheSize: number;
    dimensions: number;
  } {
    const count = this.db.prepare(`SELECT COUNT(*) as count FROM vectors`).get() as { count: number };

    return {
      totalVectors: count.count,
      cacheSize: this.cache.size,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  /**
   * Prune cache if exceeds limit
   */
  private pruneCache(): void {
    if (this.cache.size > this.cacheLimit) {
      // Remove oldest entries (first half)
      const keysToRemove = Array.from(this.cache.keys()).slice(0, this.cacheLimit / 2);
      for (const key of keysToRemove) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all vectors
   */
  clearAll(): void {
    this.db.exec('DELETE FROM vectors');
    this.db.exec('DELETE FROM vector_metadata');
    this.cache.clear();
  }

  /**
   * Shutdown the store
   */
  shutdown(): void {
    this.cache.clear();
    this.db.close();
    console.log('[VectorStore] Shutdown complete');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(databasePath?: string): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(databasePath);
  }
  return vectorStoreInstance;
}

export function createVectorStore(databasePath?: string): VectorStore {
  return new VectorStore(databasePath);
}

export default {
  VectorStore,
  getVectorStore,
  createVectorStore,
  generateEmbedding,
  cosineSimilarity,
  euclideanDistance,
};
