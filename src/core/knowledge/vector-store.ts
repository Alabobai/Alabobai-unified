/**
 * Alabobai Vector Store - Qdrant Integration
 *
 * A comprehensive vector database service for semantic search and knowledge management.
 * Supports multiple knowledge types, hybrid search, and intelligent document chunking.
 *
 * Features:
 * - Connect to local Qdrant instance
 * - Create and manage collections for different knowledge types
 * - Store vectors with rich metadata
 * - Similarity search with filters
 * - Batch upsert operations
 * - Collection schema management
 * - HNSW index configuration
 * - Hybrid search (vector + keyword)
 * - Collection statistics and health checks
 * - Document chunking strategies
 *
 * @example
 * ```typescript
 * import { createVectorStore } from './vector-store.js';
 *
 * const store = await createVectorStore({
 *   url: 'http://localhost:6333',
 *   apiKey: process.env.QDRANT_API_KEY,
 * });
 *
 * // Create a collection
 * await store.createCollection('documents', {
 *   vectorSize: 1536,
 *   distance: 'Cosine',
 *   hnswConfig: { m: 16, efConstruct: 100 },
 * });
 *
 * // Upsert vectors
 * await store.upsert('documents', [{
 *   id: 'doc-1',
 *   vector: embedding,
 *   payload: { source: 'manual', type: 'policy', content: '...' },
 * }]);
 *
 * // Search
 * const results = await store.search('documents', queryVector, {
 *   limit: 10,
 *   filter: { type: 'policy' },
 * });
 * ```
 */

import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Distance metrics for vector similarity
 */
export type DistanceMetric = 'Cosine' | 'Euclid' | 'Dot';

/**
 * Knowledge types supported by the platform
 */
export type KnowledgeType =
  | 'document'
  | 'conversation'
  | 'fact'
  | 'preference'
  | 'code'
  | 'research'
  | 'policy'
  | 'faq'
  | 'agent-memory'
  | 'custom';

/**
 * Chunking strategy for documents
 */
export type ChunkingStrategy =
  | 'fixed-size'
  | 'sentence'
  | 'paragraph'
  | 'semantic'
  | 'recursive'
  | 'none';

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  /** Qdrant server URL (default: http://localhost:6333) */
  url?: string;
  /** API key for authentication (optional for local) */
  apiKey?: string;
  /** Default collection name */
  defaultCollection?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable request retries */
  retryEnabled?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * HNSW index configuration
 * @see https://qdrant.tech/documentation/concepts/indexing/#vector-index
 */
export interface HnswConfig {
  /** Number of edges per node (default: 16) */
  m?: number;
  /** Number of neighbors to consider during construction (default: 100) */
  efConstruct?: number;
  /** Minimal size of vectors for additional payload-based indexing */
  fullScanThreshold?: number;
  /** Maximum size of a segment to trigger background indexing */
  maxIndexingThreads?: number;
  /** Store vectors on disk instead of RAM */
  onDisk?: boolean;
  /** Custom payload index configuration */
  payloadM?: number;
}

/**
 * Quantization configuration for memory optimization
 */
export interface QuantizationConfig {
  /** Quantization type */
  type: 'scalar' | 'product' | 'binary';
  /** Quantile for scalar quantization (0.0-1.0) */
  quantile?: number;
  /** Always keep original vectors */
  alwaysRam?: boolean;
}

/**
 * Collection configuration
 */
export interface CollectionConfig {
  /** Vector dimension size */
  vectorSize: number;
  /** Distance metric */
  distance?: DistanceMetric;
  /** HNSW index configuration */
  hnswConfig?: HnswConfig;
  /** Quantization configuration */
  quantization?: QuantizationConfig;
  /** Shard number for distributed setup */
  shardNumber?: number;
  /** Replication factor */
  replicationFactor?: number;
  /** Write consistency factor */
  writeConsistencyFactor?: number;
  /** On-disk payload storage */
  onDiskPayload?: boolean;
  /** Sparse vector configuration */
  sparseVectors?: Record<string, SparseVectorConfig>;
}

/**
 * Sparse vector configuration for hybrid search
 */
export interface SparseVectorConfig {
  /** Index configuration */
  index?: {
    fullScanThreshold?: number;
    onDisk?: boolean;
  };
}

/**
 * Vector metadata/payload
 */
export interface VectorPayload {
  /** Source of the content (e.g., 'upload', 'web', 'api', 'manual') */
  source: string;
  /** Timestamp when the vector was created */
  timestamp: string;
  /** Type of knowledge */
  type: KnowledgeType;
  /** Tags for categorization */
  tags: string[];
  /** Original text content */
  content?: string;
  /** Document title or name */
  title?: string;
  /** URL if from web source */
  url?: string;
  /** User ID who created this */
  userId?: string;
  /** Session ID for context */
  sessionId?: string;
  /** Parent document ID for chunks */
  parentId?: string;
  /** Chunk index within parent */
  chunkIndex?: number;
  /** Total chunks in parent */
  totalChunks?: number;
  /** Additional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Point (vector with ID and payload)
 */
export interface VectorPoint {
  /** Unique identifier */
  id: string;
  /** Dense vector embedding */
  vector: number[];
  /** Sparse vector for hybrid search */
  sparseVector?: SparseVector;
  /** Metadata payload */
  payload: VectorPayload;
}

/**
 * Sparse vector for keyword/BM25 search
 */
export interface SparseVector {
  /** Indices of non-zero elements */
  indices: number[];
  /** Values of non-zero elements */
  values: number[];
}

/**
 * Filter conditions for search
 */
export interface FilterCondition {
  /** Field to filter on */
  key: string;
  /** Match exact value */
  match?: string | number | boolean;
  /** Match any of these values */
  matchAny?: (string | number)[];
  /** Match none of these values */
  matchExcept?: (string | number)[];
  /** Range filter */
  range?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
  /** Geo filter */
  geo?: {
    center: { lat: number; lon: number };
    radius: number;
  };
  /** Text contains */
  text?: string;
  /** Is null */
  isNull?: boolean;
  /** Is empty */
  isEmpty?: boolean;
}

/**
 * Search filter combining multiple conditions
 */
export interface SearchFilter {
  /** All conditions must match (AND) */
  must?: FilterCondition[];
  /** At least one condition must match (OR) */
  should?: FilterCondition[];
  /** None of these conditions should match (NOT) */
  mustNot?: FilterCondition[];
  /** Minimum number of should conditions to match */
  minShould?: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter conditions */
  filter?: SearchFilter;
  /** Include vector in results */
  withVector?: boolean;
  /** Include payload in results */
  withPayload?: boolean | string[];
  /** Score threshold (0-1) */
  scoreThreshold?: number;
  /** Search parameters */
  params?: {
    /** HNSW ef parameter for search */
    hnsw?: { ef?: number };
    /** Exact search (disable ANN) */
    exact?: boolean;
    /** Quantization parameters */
    quantization?: {
      ignore?: boolean;
      rescore?: boolean;
      oversampling?: number;
    };
  };
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions extends SearchOptions {
  /** Weight for dense vector (0-1) */
  denseWeight?: number;
  /** Weight for sparse vector (0-1) */
  sparseWeight?: number;
  /** Sparse vector name in collection */
  sparseVectorName?: string;
  /** Fusion method */
  fusion?: 'rrf' | 'dbsf';
}

/**
 * Search result
 */
export interface SearchResult {
  /** Point ID */
  id: string;
  /** Similarity score */
  score: number;
  /** Payload data */
  payload?: VectorPayload;
  /** Vector if requested */
  vector?: number[];
}

/**
 * Batch upsert result
 */
export interface BatchUpsertResult {
  /** Number of successfully upserted points */
  upserted: number;
  /** IDs of failed points */
  failed: string[];
  /** Error messages for failed points */
  errors: Record<string, string>;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  /** Collection name */
  name: string;
  /** Total number of vectors */
  vectorCount: number;
  /** Number of indexed vectors */
  indexedVectorCount: number;
  /** Number of points */
  pointCount: number;
  /** Number of segments */
  segmentCount: number;
  /** Collection status */
  status: 'green' | 'yellow' | 'red';
  /** Optimizer status */
  optimizerStatus: 'ok' | 'indexing' | 'error';
  /** Disk usage in bytes */
  diskUsageBytes: number;
  /** RAM usage in bytes */
  ramUsageBytes: number;
  /** Collection configuration */
  config: CollectionConfig;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;
  /** Qdrant server version */
  version?: string;
  /** Number of collections */
  collectionsCount: number;
  /** Status of each collection */
  collections: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  /** Chunking strategy */
  strategy: ChunkingStrategy;
  /** Maximum chunk size in characters */
  chunkSize?: number;
  /** Overlap between chunks in characters */
  chunkOverlap?: number;
  /** Minimum chunk size (skip smaller) */
  minChunkSize?: number;
  /** Separators for recursive chunking */
  separators?: string[];
  /** Preserve sentence boundaries */
  preserveSentences?: boolean;
}

/**
 * Document chunk
 */
export interface DocumentChunk {
  /** Chunk content */
  content: string;
  /** Chunk index */
  index: number;
  /** Start character position */
  startChar: number;
  /** End character position */
  endChar: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// VECTOR STORE CLASS
// ============================================================================

/**
 * Qdrant vector store service
 */
export class QdrantVectorStore {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly retryEnabled: boolean;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly defaultCollection?: string;

  constructor(config: VectorStoreConfig = {}) {
    this.baseUrl = (config.url || 'http://localhost:6333').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
    this.retryEnabled = config.retryEnabled ?? true;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.defaultCollection = config.defaultCollection;
  }

  // --------------------------------------------------------------------------
  // HTTP HELPERS
  // --------------------------------------------------------------------------

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qdrant API error (${response.status}): ${error}`);
      }

      const data = await response.json();
      return data.result !== undefined ? data.result : data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (this.retryEnabled && retryCount < this.maxRetries) {
        const isRetryable =
          error instanceof Error &&
          (error.name === 'AbortError' ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('503'));

        if (isRetryable) {
          await this.sleep(this.retryDelay * Math.pow(2, retryCount));
          return this.request<T>(method, path, body, retryCount + 1);
        }
      }

      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --------------------------------------------------------------------------
  // COLLECTION MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Create a new collection
   */
  async createCollection(
    name: string,
    config: CollectionConfig
  ): Promise<void> {
    const body: Record<string, unknown> = {
      vectors: {
        size: config.vectorSize,
        distance: config.distance || 'Cosine',
        on_disk: config.hnswConfig?.onDisk,
      },
      shard_number: config.shardNumber,
      replication_factor: config.replicationFactor,
      write_consistency_factor: config.writeConsistencyFactor,
      on_disk_payload: config.onDiskPayload,
    };

    // Add HNSW configuration
    if (config.hnswConfig) {
      body.hnsw_config = {
        m: config.hnswConfig.m,
        ef_construct: config.hnswConfig.efConstruct,
        full_scan_threshold: config.hnswConfig.fullScanThreshold,
        max_indexing_threads: config.hnswConfig.maxIndexingThreads,
        payload_m: config.hnswConfig.payloadM,
      };
    }

    // Add quantization configuration
    if (config.quantization) {
      body.quantization_config = {
        [config.quantization.type]: {
          quantile: config.quantization.quantile,
          always_ram: config.quantization.alwaysRam,
        },
      };
    }

    // Add sparse vectors for hybrid search
    if (config.sparseVectors) {
      body.sparse_vectors = {};
      for (const [name, sparseConfig] of Object.entries(config.sparseVectors)) {
        (body.sparse_vectors as Record<string, unknown>)[name] = {
          index: sparseConfig.index,
        };
      }
    }

    await this.request('PUT', `/collections/${name}`, body);
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    await this.request('DELETE', `/collections/${name}`);
  }

  /**
   * Check if a collection exists
   */
  async collectionExists(name: string): Promise<boolean> {
    try {
      await this.request('GET', `/collections/${name}`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    const result = await this.request<{ collections: { name: string }[] }>(
      'GET',
      '/collections'
    );
    return result.collections.map(c => c.name);
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(name: string): Promise<CollectionStats> {
    const result = await this.request<Record<string, unknown>>(
      'GET',
      `/collections/${name}`
    );

    return {
      name,
      vectorCount: (result.vectors_count as number) || 0,
      indexedVectorCount: (result.indexed_vectors_count as number) || 0,
      pointCount: (result.points_count as number) || 0,
      segmentCount: ((result.segments_count as number) || 0),
      status: this.mapStatus(result.status as string),
      optimizerStatus: this.mapOptimizerStatus(result.optimizer_status as Record<string, unknown>),
      diskUsageBytes: 0, // Would need telemetry endpoint
      ramUsageBytes: 0,
      config: this.parseCollectionConfig(result.config as Record<string, unknown>),
    };
  }

  private mapStatus(status: string): 'green' | 'yellow' | 'red' {
    switch (status) {
      case 'green':
        return 'green';
      case 'yellow':
        return 'yellow';
      default:
        return 'red';
    }
  }

  private mapOptimizerStatus(status: Record<string, unknown>): 'ok' | 'indexing' | 'error' {
    if (status?.ok !== undefined) return 'ok';
    if (status?.indexing !== undefined) return 'indexing';
    return 'error';
  }

  private parseCollectionConfig(config: Record<string, unknown>): CollectionConfig {
    const params = config?.params as Record<string, unknown> || {};
    const vectors = params?.vectors as Record<string, unknown> || {};
    const hnswConfig = config?.hnsw_config as Record<string, unknown> || {};

    return {
      vectorSize: (vectors.size as number) || 0,
      distance: (vectors.distance as DistanceMetric) || 'Cosine',
      hnswConfig: {
        m: hnswConfig.m as number,
        efConstruct: hnswConfig.ef_construct as number,
        fullScanThreshold: hnswConfig.full_scan_threshold as number,
      },
    };
  }

  /**
   * Create payload index for efficient filtering
   */
  async createPayloadIndex(
    collection: string,
    fieldName: string,
    fieldType: 'keyword' | 'integer' | 'float' | 'bool' | 'geo' | 'datetime' | 'text'
  ): Promise<void> {
    await this.request('PUT', `/collections/${collection}/index`, {
      field_name: fieldName,
      field_schema: fieldType,
    });
  }

  // --------------------------------------------------------------------------
  // VECTOR OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Upsert a single point
   */
  async upsert(
    collection: string,
    point: VectorPoint
  ): Promise<void> {
    await this.batchUpsert(collection, [point]);
  }

  /**
   * Batch upsert multiple points
   */
  async batchUpsert(
    collection: string,
    points: VectorPoint[],
    batchSize = 100
  ): Promise<BatchUpsertResult> {
    const result: BatchUpsertResult = {
      upserted: 0,
      failed: [],
      errors: {},
    };

    // Process in batches
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const qdrantPoints = batch.map(p => this.toQdrantPoint(p));

      try {
        await this.request('PUT', `/collections/${collection}/points`, {
          points: qdrantPoints,
        });
        result.upserted += batch.length;
      } catch (error) {
        // Try individual upserts for failed batch
        for (const point of batch) {
          try {
            await this.request('PUT', `/collections/${collection}/points`, {
              points: [this.toQdrantPoint(point)],
            });
            result.upserted++;
          } catch (innerError) {
            result.failed.push(point.id);
            result.errors[point.id] =
              innerError instanceof Error ? innerError.message : 'Unknown error';
          }
        }
      }
    }

    return result;
  }

  private toQdrantPoint(point: VectorPoint): Record<string, unknown> {
    const qdrantPoint: Record<string, unknown> = {
      id: point.id,
      vector: point.vector,
      payload: point.payload,
    };

    // Add sparse vector if present
    if (point.sparseVector) {
      qdrantPoint.vector = {
        '': point.vector, // Default dense vector
        sparse: {
          indices: point.sparseVector.indices,
          values: point.sparseVector.values,
        },
      };
    }

    return qdrantPoint;
  }

  /**
   * Delete points by IDs
   */
  async delete(collection: string, ids: string[]): Promise<void> {
    await this.request('POST', `/collections/${collection}/points/delete`, {
      points: ids,
    });
  }

  /**
   * Delete points by filter
   */
  async deleteByFilter(collection: string, filter: SearchFilter): Promise<void> {
    await this.request('POST', `/collections/${collection}/points/delete`, {
      filter: this.buildFilter(filter),
    });
  }

  /**
   * Get points by IDs
   */
  async getPoints(
    collection: string,
    ids: string[],
    withVector = false
  ): Promise<SearchResult[]> {
    const result = await this.request<{ points: Record<string, unknown>[] }>(
      'POST',
      `/collections/${collection}/points`,
      {
        ids,
        with_vector: withVector,
        with_payload: true,
      }
    );

    return result.points?.map(p => ({
      id: p.id as string,
      score: 1,
      payload: p.payload as VectorPayload,
      vector: withVector ? (p.vector as number[]) : undefined,
    })) || [];
  }

  /**
   * Count points matching a filter
   */
  async count(collection: string, filter?: SearchFilter): Promise<number> {
    const body: Record<string, unknown> = {
      exact: true,
    };
    if (filter) {
      body.filter = this.buildFilter(filter);
    }

    const result = await this.request<{ count: number }>(
      'POST',
      `/collections/${collection}/points/count`,
      body
    );

    return result.count;
  }

  // --------------------------------------------------------------------------
  // SEARCH OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Similarity search
   */
  async search(
    collection: string,
    vector: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      vector,
      limit: options.limit || 10,
      offset: options.offset || 0,
      with_vector: options.withVector || false,
      with_payload: options.withPayload ?? true,
      score_threshold: options.scoreThreshold,
    };

    if (options.filter) {
      body.filter = this.buildFilter(options.filter);
    }

    if (options.params) {
      body.params = {
        hnsw_ef: options.params.hnsw?.ef,
        exact: options.params.exact,
        quantization: options.params.quantization,
      };
    }

    const result = await this.request<Record<string, unknown>[]>(
      'POST',
      `/collections/${collection}/points/search`,
      body
    );

    return result.map(r => ({
      id: r.id as string,
      score: r.score as number,
      payload: r.payload as VectorPayload,
      vector: options.withVector ? (r.vector as number[]) : undefined,
    }));
  }

  /**
   * Hybrid search (dense + sparse vectors)
   */
  async hybridSearch(
    collection: string,
    denseVector: number[],
    sparseVector: SparseVector,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const denseWeight = options.denseWeight ?? 0.7;
    const sparseWeight = options.sparseWeight ?? 0.3;
    const sparseVectorName = options.sparseVectorName || 'sparse';

    // Build prefetch queries for both vector types
    const body: Record<string, unknown> = {
      prefetch: [
        {
          query: denseVector,
          using: '', // Default dense vector
          limit: (options.limit || 10) * 2,
        },
        {
          query: {
            indices: sparseVector.indices,
            values: sparseVector.values,
          },
          using: sparseVectorName,
          limit: (options.limit || 10) * 2,
        },
      ],
      query: {
        fusion: options.fusion || 'rrf',
      },
      limit: options.limit || 10,
      with_payload: options.withPayload ?? true,
    };

    if (options.filter) {
      body.filter = this.buildFilter(options.filter);
    }

    const result = await this.request<Record<string, unknown>[]>(
      'POST',
      `/collections/${collection}/points/query`,
      body
    );

    return result.map(r => ({
      id: r.id as string,
      score: r.score as number,
      payload: r.payload as VectorPayload,
      vector: options.withVector ? (r.vector as number[]) : undefined,
    }));
  }

  /**
   * Recommend similar points based on positive/negative examples
   */
  async recommend(
    collection: string,
    positiveIds: string[],
    negativeIds: string[] = [],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      positive: positiveIds,
      negative: negativeIds,
      limit: options.limit || 10,
      offset: options.offset || 0,
      with_vector: options.withVector || false,
      with_payload: options.withPayload ?? true,
      score_threshold: options.scoreThreshold,
    };

    if (options.filter) {
      body.filter = this.buildFilter(options.filter);
    }

    const result = await this.request<Record<string, unknown>[]>(
      'POST',
      `/collections/${collection}/points/recommend`,
      body
    );

    return result.map(r => ({
      id: r.id as string,
      score: r.score as number,
      payload: r.payload as VectorPayload,
      vector: options.withVector ? (r.vector as number[]) : undefined,
    }));
  }

  /**
   * Scroll through all points (for bulk operations)
   */
  async scroll(
    collection: string,
    options: {
      filter?: SearchFilter;
      limit?: number;
      offset?: string;
      withVector?: boolean;
      withPayload?: boolean;
    } = {}
  ): Promise<{ points: SearchResult[]; nextOffset?: string }> {
    const body: Record<string, unknown> = {
      limit: options.limit || 100,
      offset: options.offset,
      with_vector: options.withVector || false,
      with_payload: options.withPayload ?? true,
    };

    if (options.filter) {
      body.filter = this.buildFilter(options.filter);
    }

    const result = await this.request<{
      points: Record<string, unknown>[];
      next_page_offset?: string;
    }>('POST', `/collections/${collection}/points/scroll`, body);

    return {
      points: result.points.map(p => ({
        id: p.id as string,
        score: 1,
        payload: p.payload as VectorPayload,
        vector: options.withVector ? (p.vector as number[]) : undefined,
      })),
      nextOffset: result.next_page_offset,
    };
  }

  // --------------------------------------------------------------------------
  // FILTER BUILDING
  // --------------------------------------------------------------------------

  private buildFilter(filter: SearchFilter): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (filter.must && filter.must.length > 0) {
      result.must = filter.must.map(c => this.buildCondition(c));
    }

    if (filter.should && filter.should.length > 0) {
      result.should = filter.should.map(c => this.buildCondition(c));
      if (filter.minShould) {
        result.min_should = { conditions: result.should, min_count: filter.minShould };
        delete result.should;
      }
    }

    if (filter.mustNot && filter.mustNot.length > 0) {
      result.must_not = filter.mustNot.map(c => this.buildCondition(c));
    }

    return result;
  }

  private buildCondition(condition: FilterCondition): Record<string, unknown> {
    const result: Record<string, unknown> = {
      key: condition.key,
    };

    if (condition.match !== undefined) {
      result.match = { value: condition.match };
    } else if (condition.matchAny) {
      result.match = { any: condition.matchAny };
    } else if (condition.matchExcept) {
      result.match = { except: condition.matchExcept };
    } else if (condition.range) {
      result.range = condition.range;
    } else if (condition.geo) {
      result.geo_radius = {
        center: condition.geo.center,
        radius: condition.geo.radius,
      };
    } else if (condition.text) {
      result.match = { text: condition.text };
    } else if (condition.isNull !== undefined) {
      result.is_null = { is_null: condition.isNull };
    } else if (condition.isEmpty !== undefined) {
      result.is_empty = { is_empty: condition.isEmpty };
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // HEALTH & STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check cluster health
      const clusterInfo = await this.request<{ version?: string }>(
        'GET',
        '/cluster'
      );

      // Get collections
      const collections = await this.listCollections();
      const collectionStatuses: Record<string, 'healthy' | 'degraded' | 'unhealthy'> = {};

      for (const name of collections) {
        try {
          const info = await this.getCollectionInfo(name);
          collectionStatuses[name] =
            info.status === 'green'
              ? 'healthy'
              : info.status === 'yellow'
              ? 'degraded'
              : 'unhealthy';
        } catch {
          collectionStatuses[name] = 'unhealthy';
        }
      }

      return {
        healthy: true,
        version: clusterInfo.version,
        collectionsCount: collections.length,
        collections: collectionStatuses,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        collectionsCount: 0,
        collections: {},
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get telemetry/statistics
   */
  async getTelemetry(): Promise<Record<string, unknown>> {
    return this.request('GET', '/telemetry');
  }

  // --------------------------------------------------------------------------
  // DOCUMENT CHUNKING
  // --------------------------------------------------------------------------

  /**
   * Chunk a document into smaller pieces
   */
  chunkDocument(
    content: string,
    options: ChunkingOptions = { strategy: 'recursive' }
  ): DocumentChunk[] {
    switch (options.strategy) {
      case 'fixed-size':
        return this.chunkFixedSize(content, options);
      case 'sentence':
        return this.chunkBySentence(content, options);
      case 'paragraph':
        return this.chunkByParagraph(content, options);
      case 'recursive':
        return this.chunkRecursive(content, options);
      case 'semantic':
        return this.chunkSemantic(content, options);
      case 'none':
      default:
        return [{ content, index: 0, startChar: 0, endChar: content.length }];
    }
  }

  private chunkFixedSize(
    content: string,
    options: ChunkingOptions
  ): DocumentChunk[] {
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.chunkOverlap || 200;
    const minSize = options.minChunkSize || 100;
    const chunks: DocumentChunk[] = [];

    let start = 0;
    let index = 0;

    while (start < content.length) {
      let end = Math.min(start + chunkSize, content.length);

      // Try to end at a word boundary
      if (end < content.length && options.preserveSentences !== false) {
        const lastSpace = content.lastIndexOf(' ', end);
        if (lastSpace > start + chunkSize * 0.8) {
          end = lastSpace;
        }
      }

      const chunk = content.slice(start, end).trim();
      if (chunk.length >= minSize) {
        chunks.push({
          content: chunk,
          index,
          startChar: start,
          endChar: end,
        });
        index++;
      }

      start = end - overlap;
      if (start <= chunks[chunks.length - 1]?.startChar) {
        start = end;
      }
    }

    return chunks;
  }

  private chunkBySentence(
    content: string,
    options: ChunkingOptions
  ): DocumentChunk[] {
    const maxChunkSize = options.chunkSize || 1000;
    const minSize = options.minChunkSize || 50;

    // Split by sentence-ending punctuation
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let startChar = 0;
    let chunkStartChar = 0;
    let index = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
        if (currentChunk.trim().length >= minSize) {
          chunks.push({
            content: currentChunk.trim(),
            index,
            startChar: chunkStartChar,
            endChar: startChar,
          });
          index++;
        }
        chunkStartChar = startChar;
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
      startChar += sentence.length;
    }

    // Add remaining content
    if (currentChunk.trim().length >= minSize) {
      chunks.push({
        content: currentChunk.trim(),
        index,
        startChar: chunkStartChar,
        endChar: content.length,
      });
    }

    return chunks;
  }

  private chunkByParagraph(
    content: string,
    options: ChunkingOptions
  ): DocumentChunk[] {
    const maxChunkSize = options.chunkSize || 2000;
    const minSize = options.minChunkSize || 100;

    // Split by double newlines (paragraphs)
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let startChar = 0;
    let chunkStartChar = 0;
    let index = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithBreak = paragraph + '\n\n';

      if (currentChunk.length + paragraphWithBreak.length > maxChunkSize && currentChunk.length > 0) {
        if (currentChunk.trim().length >= minSize) {
          chunks.push({
            content: currentChunk.trim(),
            index,
            startChar: chunkStartChar,
            endChar: startChar,
          });
          index++;
        }
        chunkStartChar = startChar;
        currentChunk = paragraphWithBreak;
      } else {
        currentChunk += paragraphWithBreak;
      }
      startChar += paragraphWithBreak.length;
    }

    // Add remaining content
    if (currentChunk.trim().length >= minSize) {
      chunks.push({
        content: currentChunk.trim(),
        index,
        startChar: chunkStartChar,
        endChar: content.length,
      });
    }

    return chunks;
  }

  private chunkRecursive(
    content: string,
    options: ChunkingOptions
  ): DocumentChunk[] {
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.chunkOverlap || 200;
    const minSize = options.minChunkSize || 100;
    const separators = options.separators || ['\n\n', '\n', '. ', ', ', ' ', ''];

    const chunks: DocumentChunk[] = [];

    const recursiveSplit = (
      text: string,
      separatorIndex: number,
      startOffset: number
    ): void => {
      if (text.length <= chunkSize) {
        if (text.trim().length >= minSize) {
          chunks.push({
            content: text.trim(),
            index: chunks.length,
            startChar: startOffset,
            endChar: startOffset + text.length,
          });
        }
        return;
      }

      const separator = separators[separatorIndex];
      if (separator === '') {
        // Fall back to fixed-size splitting
        const fixedChunks = this.chunkFixedSize(text, { ...options, strategy: 'fixed-size' });
        for (const chunk of fixedChunks) {
          chunk.startChar += startOffset;
          chunk.endChar += startOffset;
          chunk.index = chunks.length;
          chunks.push(chunk);
        }
        return;
      }

      const parts = text.split(separator);
      let currentPart = '';
      let currentOffset = startOffset;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] + (i < parts.length - 1 ? separator : '');

        if (currentPart.length + part.length > chunkSize) {
          if (currentPart.length > 0) {
            if (currentPart.length > chunkSize) {
              // Need to split further
              recursiveSplit(currentPart, separatorIndex + 1, currentOffset);
            } else if (currentPart.trim().length >= minSize) {
              chunks.push({
                content: currentPart.trim(),
                index: chunks.length,
                startChar: currentOffset,
                endChar: currentOffset + currentPart.length,
              });
            }
          }
          currentOffset += currentPart.length;
          currentPart = part;
        } else {
          currentPart += part;
        }
      }

      // Handle remaining content
      if (currentPart.length > 0) {
        if (currentPart.length > chunkSize) {
          recursiveSplit(currentPart, separatorIndex + 1, currentOffset);
        } else if (currentPart.trim().length >= minSize) {
          chunks.push({
            content: currentPart.trim(),
            index: chunks.length,
            startChar: currentOffset,
            endChar: currentOffset + currentPart.length,
          });
        }
      }
    };

    recursiveSplit(content, 0, 0);

    // Add overlap between chunks
    if (overlap > 0 && chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        const prevChunk = chunks[i - 1];
        const overlapText = prevChunk.content.slice(-overlap);
        const lastBreak = overlapText.lastIndexOf(' ');
        if (lastBreak > overlap * 0.5) {
          const actualOverlap = overlapText.slice(lastBreak + 1);
          if (!chunks[i].content.startsWith(actualOverlap)) {
            chunks[i].content = actualOverlap + ' ' + chunks[i].content;
          }
        }
      }
    }

    return chunks;
  }

  private chunkSemantic(
    content: string,
    options: ChunkingOptions
  ): DocumentChunk[] {
    // Semantic chunking tries to keep related content together
    // This is a simplified version - full semantic chunking would use embeddings
    const maxChunkSize = options.chunkSize || 1500;
    const minSize = options.minChunkSize || 100;

    // Identify semantic boundaries (headers, topic changes)
    const headerPattern = /^#{1,6}\s+.+$|^.+\n[=-]+$/gm;
    const listPattern = /^[-*+]\s+|^\d+\.\s+/gm;

    const boundaries: number[] = [0];
    let match;

    // Find header positions
    const headerRegex = new RegExp(headerPattern);
    const contentForHeaders = content;
    while ((match = headerRegex.exec(contentForHeaders)) !== null) {
      boundaries.push(match.index);
    }

    boundaries.push(content.length);
    boundaries.sort((a, b) => a - b);

    // Create chunks based on boundaries
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let chunkStartChar = 0;

    for (let i = 0; i < boundaries.length - 1; i++) {
      const section = content.slice(boundaries[i], boundaries[i + 1]);

      if (currentChunk.length + section.length > maxChunkSize && currentChunk.length > 0) {
        if (currentChunk.trim().length >= minSize) {
          chunks.push({
            content: currentChunk.trim(),
            index: chunks.length,
            startChar: chunkStartChar,
            endChar: boundaries[i],
          });
        }
        chunkStartChar = boundaries[i];
        currentChunk = section;
      } else {
        currentChunk += section;
      }
    }

    // Add remaining content
    if (currentChunk.trim().length >= minSize) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunks.length,
        startChar: chunkStartChar,
        endChar: content.length,
      });
    }

    // If chunks are still too large, use recursive chunking
    const finalChunks: DocumentChunk[] = [];
    for (const chunk of chunks) {
      if (chunk.content.length > maxChunkSize) {
        const subChunks = this.chunkRecursive(chunk.content, {
          ...options,
          strategy: 'recursive',
        });
        for (const subChunk of subChunks) {
          subChunk.startChar += chunk.startChar;
          subChunk.endChar += chunk.startChar;
          subChunk.index = finalChunks.length;
          finalChunks.push(subChunk);
        }
      } else {
        chunk.index = finalChunks.length;
        finalChunks.push(chunk);
      }
    }

    return finalChunks;
  }

  // --------------------------------------------------------------------------
  // CONVENIENCE METHODS
  // --------------------------------------------------------------------------

  /**
   * Store document with automatic chunking
   */
  async storeDocument(
    collection: string,
    content: string,
    vectors: number[][],
    payload: Omit<VectorPayload, 'content' | 'chunkIndex' | 'totalChunks'>,
    chunkingOptions?: ChunkingOptions
  ): Promise<BatchUpsertResult> {
    const chunks = this.chunkDocument(content, chunkingOptions || { strategy: 'recursive' });
    const parentId = payload.parentId || uuid();

    if (chunks.length !== vectors.length) {
      throw new Error(
        `Vector count (${vectors.length}) must match chunk count (${chunks.length})`
      );
    }

    const points: VectorPoint[] = chunks.map((chunk, index) => ({
      id: `${parentId}-${index}`,
      vector: vectors[index],
      payload: {
        ...payload,
        content: chunk.content,
        parentId,
        chunkIndex: index,
        totalChunks: chunks.length,
        metadata: {
          ...payload.metadata,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
        },
      },
    }));

    return this.batchUpsert(collection, points);
  }

  /**
   * Retrieve full document from chunks
   */
  async retrieveDocument(
    collection: string,
    parentId: string
  ): Promise<{ content: string; chunks: SearchResult[] } | null> {
    const { points } = await this.scroll(collection, {
      filter: {
        must: [{ key: 'parentId', match: parentId }],
      },
      withPayload: true,
      limit: 1000,
    });

    if (points.length === 0) {
      return null;
    }

    // Sort by chunk index
    points.sort((a, b) => {
      const aIndex = a.payload?.chunkIndex || 0;
      const bIndex = b.payload?.chunkIndex || 0;
      return aIndex - bIndex;
    });

    const content = points.map(p => p.payload?.content || '').join('\n\n');

    return { content, chunks: points };
  }

  /**
   * Create standard collections for Alabobai platform
   */
  async initializeStandardCollections(vectorSize = 1536): Promise<void> {
    const collections: Array<{ name: string; config: CollectionConfig }> = [
      {
        name: 'documents',
        config: {
          vectorSize,
          distance: 'Cosine',
          hnswConfig: { m: 16, efConstruct: 100 },
          sparseVectors: { sparse: { index: { fullScanThreshold: 10000 } } },
        },
      },
      {
        name: 'conversations',
        config: {
          vectorSize,
          distance: 'Cosine',
          hnswConfig: { m: 12, efConstruct: 64 },
        },
      },
      {
        name: 'agent-memories',
        config: {
          vectorSize,
          distance: 'Cosine',
          hnswConfig: { m: 16, efConstruct: 100 },
        },
      },
      {
        name: 'knowledge-base',
        config: {
          vectorSize,
          distance: 'Cosine',
          hnswConfig: { m: 16, efConstruct: 128 },
          sparseVectors: { sparse: { index: { fullScanThreshold: 10000 } } },
        },
      },
      {
        name: 'code-snippets',
        config: {
          vectorSize,
          distance: 'Cosine',
          hnswConfig: { m: 12, efConstruct: 64 },
        },
      },
    ];

    for (const { name, config } of collections) {
      const exists = await this.collectionExists(name);
      if (!exists) {
        await this.createCollection(name, config);

        // Create common payload indexes
        await this.createPayloadIndex(name, 'source', 'keyword');
        await this.createPayloadIndex(name, 'type', 'keyword');
        await this.createPayloadIndex(name, 'tags', 'keyword');
        await this.createPayloadIndex(name, 'userId', 'keyword');
        await this.createPayloadIndex(name, 'timestamp', 'datetime');
      }
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new vector store instance
 */
export function createVectorStore(config?: VectorStoreConfig): QdrantVectorStore {
  return new QdrantVectorStore(config);
}

/**
 * Create a vector store instance with async initialization
 */
export async function createVectorStoreAsync(
  config?: VectorStoreConfig,
  initializeCollections = false
): Promise<QdrantVectorStore> {
  const store = new QdrantVectorStore(config);

  if (initializeCollections) {
    await store.initializeStandardCollections();
  }

  return store;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default QdrantVectorStore;
