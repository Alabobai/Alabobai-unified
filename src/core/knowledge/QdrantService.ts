/**
 * Qdrant Vector Database Service
 * Handles communication with Qdrant for vector storage and similarity search
 */

import { EventEmitter } from 'events';
import type {
  QdrantConfig,
  QdrantPoint,
  QdrantSearchResult,
  QdrantCollectionInfo,
  QdrantFilter,
  QdrantCondition,
  ServiceStatus,
} from '../llm/types.js';

// ============================================================================
// QDRANT SERVICE
// ============================================================================

export class QdrantService extends EventEmitter {
  private url: string;
  private apiKey?: string;
  private timeout: number;
  private isRunning: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000;

  constructor(config: Partial<QdrantConfig> = {}) {
    super();
    this.url = config.url ?? 'http://localhost:6333';
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  // ============================================================================
  // HTTP HELPERS
  // ============================================================================

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
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.url}${path}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  async checkHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isRunning) {
      return this.isRunning;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.url}/healthz`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      this.isRunning = response.ok;
      this.lastHealthCheck = now;

      if (this.isRunning) {
        this.emit('connected');
      }

      return this.isRunning;
    } catch (error) {
      this.isRunning = false;
      this.lastHealthCheck = now;
      this.emit('disconnected', { error });
      return false;
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    const startTime = Date.now();
    const available = await this.checkHealth();
    const latency = Date.now() - startTime;

    let details: Record<string, unknown> = {
      url: this.url,
    };

    if (available) {
      try {
        const collections = await this.listCollections();
        details.collectionCount = collections.length;
        details.collections = collections.map(c => c.name);
      } catch {
        // Ignore collection fetch errors
      }
    }

    return {
      name: 'Qdrant',
      available,
      latency,
      lastChecked: new Date(),
      details,
    };
  }

  // ============================================================================
  // COLLECTION MANAGEMENT
  // ============================================================================

  async listCollections(): Promise<QdrantCollectionInfo[]> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const response = await this.request<{ result: { collections: { name: string }[] } }>(
      'GET',
      '/collections'
    );

    const collections: QdrantCollectionInfo[] = [];

    for (const col of response.result.collections) {
      try {
        const info = await this.getCollectionInfo(col.name);
        collections.push(info);
      } catch {
        collections.push({
          name: col.name,
          vectorSize: 0,
          pointsCount: 0,
          status: 'red',
        });
      }
    }

    return collections;
  }

  async getCollectionInfo(name: string): Promise<QdrantCollectionInfo> {
    const response = await this.request<{
      result: {
        vectors_count: number;
        points_count: number;
        status: string;
        config: {
          params: {
            vectors: {
              size: number;
            } | {
              [key: string]: { size: number };
            };
          };
        };
      };
    }>('GET', `/collections/${name}`);

    const vectors = response.result.config.params.vectors;
    let vectorSize = 0;

    if (typeof vectors === 'object' && 'size' in vectors) {
      vectorSize = vectors.size;
    } else if (typeof vectors === 'object') {
      const firstKey = Object.keys(vectors)[0];
      if (firstKey && vectors[firstKey]) {
        vectorSize = vectors[firstKey].size;
      }
    }

    return {
      name,
      vectorSize,
      pointsCount: response.result.points_count || 0,
      status: response.result.status === 'green' ? 'green' :
              response.result.status === 'yellow' ? 'yellow' : 'red',
    };
  }

  async createCollection(
    name: string,
    vectorSize: number,
    options: {
      distance?: 'Cosine' | 'Euclidean' | 'Dot';
      onDiskPayload?: boolean;
    } = {}
  ): Promise<boolean> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    try {
      await this.request('PUT', `/collections/${name}`, {
        vectors: {
          size: vectorSize,
          distance: options.distance ?? 'Cosine',
        },
        on_disk_payload: options.onDiskPayload ?? true,
      });

      this.emit('collectionCreated', { name, vectorSize });
      return true;
    } catch (error) {
      // Check if collection already exists
      if (error instanceof Error && error.message.includes('already exists')) {
        return true;
      }
      throw error;
    }
  }

  async deleteCollection(name: string): Promise<boolean> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    try {
      await this.request('DELETE', `/collections/${name}`);
      this.emit('collectionDeleted', { name });
      return true;
    } catch {
      return false;
    }
  }

  async ensureCollection(name: string, vectorSize: number): Promise<void> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    try {
      await this.getCollectionInfo(name);
    } catch {
      await this.createCollection(name, vectorSize);
    }
  }

  // ============================================================================
  // POINT OPERATIONS
  // ============================================================================

  async upsertPoints(
    collectionName: string,
    points: QdrantPoint[]
  ): Promise<boolean> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    await this.request('PUT', `/collections/${collectionName}/points`, {
      points: points.map(p => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });

    this.emit('pointsUpserted', { collection: collectionName, count: points.length });
    return true;
  }

  async upsertPoint(
    collectionName: string,
    id: string | number,
    vector: number[],
    payload: Record<string, unknown>
  ): Promise<boolean> {
    return this.upsertPoints(collectionName, [{ id, vector, payload }]);
  }

  async deletePoints(
    collectionName: string,
    ids: (string | number)[]
  ): Promise<boolean> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    await this.request('POST', `/collections/${collectionName}/points/delete`, {
      points: ids,
    });

    this.emit('pointsDeleted', { collection: collectionName, count: ids.length });
    return true;
  }

  async getPoints(
    collectionName: string,
    ids: (string | number)[],
    withVector: boolean = false
  ): Promise<QdrantSearchResult[]> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const response = await this.request<{
      result: Array<{
        id: string | number;
        payload: Record<string, unknown>;
        vector?: number[];
      }>;
    }>('POST', `/collections/${collectionName}/points`, {
      ids,
      with_payload: true,
      with_vector: withVector,
    });

    return response.result.map(p => ({
      id: p.id,
      score: 1.0,
      payload: p.payload,
      vector: p.vector,
    }));
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  async search(
    collectionName: string,
    vector: number[],
    options: {
      limit?: number;
      scoreThreshold?: number;
      filter?: QdrantFilter;
      withPayload?: boolean;
      withVector?: boolean;
    } = {}
  ): Promise<QdrantSearchResult[]> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const requestBody: Record<string, unknown> = {
      vector,
      limit: options.limit ?? 10,
      with_payload: options.withPayload ?? true,
      with_vector: options.withVector ?? false,
    };

    if (options.scoreThreshold !== undefined) {
      requestBody.score_threshold = options.scoreThreshold;
    }

    if (options.filter) {
      requestBody.filter = this.convertFilter(options.filter);
    }

    const response = await this.request<{
      result: Array<{
        id: string | number;
        score: number;
        payload: Record<string, unknown>;
        vector?: number[];
      }>;
    }>('POST', `/collections/${collectionName}/points/search`, requestBody);

    return response.result.map(r => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
      vector: r.vector,
    }));
  }

  async searchBatch(
    collectionName: string,
    vectors: number[][],
    options: {
      limit?: number;
      scoreThreshold?: number;
      filter?: QdrantFilter;
    } = {}
  ): Promise<QdrantSearchResult[][]> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const searches = vectors.map(vector => ({
      vector,
      limit: options.limit ?? 10,
      with_payload: true,
      filter: options.filter ? this.convertFilter(options.filter) : undefined,
      score_threshold: options.scoreThreshold,
    }));

    const response = await this.request<{
      result: Array<Array<{
        id: string | number;
        score: number;
        payload: Record<string, unknown>;
      }>>;
    }>('POST', `/collections/${collectionName}/points/search/batch`, {
      searches,
    });

    return response.result.map(results =>
      results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
      }))
    );
  }

  // ============================================================================
  // SCROLL (PAGINATION)
  // ============================================================================

  async scroll(
    collectionName: string,
    options: {
      limit?: number;
      offset?: string | number;
      filter?: QdrantFilter;
      withPayload?: boolean;
      withVector?: boolean;
    } = {}
  ): Promise<{ points: QdrantSearchResult[]; nextOffset?: string | number }> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const requestBody: Record<string, unknown> = {
      limit: options.limit ?? 100,
      with_payload: options.withPayload ?? true,
      with_vector: options.withVector ?? false,
    };

    if (options.offset !== undefined) {
      requestBody.offset = options.offset;
    }

    if (options.filter) {
      requestBody.filter = this.convertFilter(options.filter);
    }

    const response = await this.request<{
      result: {
        points: Array<{
          id: string | number;
          payload: Record<string, unknown>;
          vector?: number[];
        }>;
        next_page_offset?: string | number;
      };
    }>('POST', `/collections/${collectionName}/points/scroll`, requestBody);

    return {
      points: response.result.points.map(p => ({
        id: p.id,
        score: 1.0,
        payload: p.payload,
        vector: p.vector,
      })),
      nextOffset: response.result.next_page_offset,
    };
  }

  // ============================================================================
  // FILTER CONVERSION
  // ============================================================================

  private convertFilter(filter: QdrantFilter): Record<string, unknown> {
    const converted: Record<string, unknown> = {};

    if (filter.must) {
      converted.must = filter.must.map(c => this.convertCondition(c));
    }

    if (filter.should) {
      converted.should = filter.should.map(c => this.convertCondition(c));
    }

    if (filter.mustNot) {
      converted.must_not = filter.mustNot.map(c => this.convertCondition(c));
    }

    return converted;
  }

  private convertCondition(condition: QdrantCondition): Record<string, unknown> {
    if (condition.match) {
      return {
        key: condition.key,
        match: condition.match,
      };
    }

    if (condition.range) {
      return {
        key: condition.key,
        range: condition.range,
      };
    }

    return { key: condition.key };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getUrl(): string {
    return this.url;
  }

  isAvailable(): boolean {
    return this.isRunning;
  }

  async countPoints(
    collectionName: string,
    filter?: QdrantFilter
  ): Promise<number> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Qdrant is not available');
    }

    const requestBody: Record<string, unknown> = {
      exact: true,
    };

    if (filter) {
      requestBody.filter = this.convertFilter(filter);
    }

    const response = await this.request<{
      result: { count: number };
    }>('POST', `/collections/${collectionName}/points/count`, requestBody);

    return response.result.count;
  }
}

// ============================================================================
// FACTORY AND SINGLETON
// ============================================================================

let defaultQdrantService: QdrantService | null = null;

export function createQdrantService(config?: Partial<QdrantConfig>): QdrantService {
  return new QdrantService(config);
}

export function getDefaultQdrantService(): QdrantService {
  if (!defaultQdrantService) {
    defaultQdrantService = new QdrantService();
  }
  return defaultQdrantService;
}

export default QdrantService;
