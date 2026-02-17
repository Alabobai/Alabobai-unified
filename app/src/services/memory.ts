/**
 * Memory Service Client
 * Frontend service for interacting with the Memory API
 */

// ============================================================================
// Types
// ============================================================================

export type MemoryType =
  | 'user_preference'
  | 'conversation_summary'
  | 'fact'
  | 'project_context'
  | 'decision'
  | 'code_pattern'
  | 'error_resolution'
  | 'knowledge';

export type PrivacySetting = 'private' | 'shared' | 'public';

export interface Memory {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
  privacy: PrivacySetting;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  expiresAt?: number;
  decayedImportance?: number;
}

export interface MemorySearchResult {
  memory: Memory;
  relevance: number;
  matchedTags: string[];
}

export interface MemoryStats {
  totalMemories: number;
  memoriesByType: Record<MemoryType, number>;
  memoriesByUser: Record<string, number>;
  averageImportance: number;
  totalStorageBytes: number;
  oldestMemory: number | null;
  newestMemory: number | null;
  expiringCount: number;
}

export interface MemorySettings {
  memoryEnabled: boolean;
  autoExtract: boolean;
  retentionDays: number;
  maxMemories: number;
}

export interface ConsolidationResult {
  memoriesMerged: number;
  memoriesRemoved: number;
  newConnections: number;
  spaceReclaimed: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ExtractionResult {
  facts: {
    content: string;
    type: MemoryType;
    importance: number;
    tags: string[];
  }[];
  preferences: {
    key: string;
    value: unknown;
    category: string;
    confidence: number;
  }[];
  summary?: string;
  shouldRemember: boolean;
}

export interface MemoryContext {
  memories: Memory[];
  contextPrompt: string;
  count: number;
}

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE = '/api/memory';

// Helper for API requests
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Memory Service
// ============================================================================

class MemoryServiceClient {
  private userId: string = 'default';

  /**
   * Set the current user ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  // ==========================================================================
  // Memory CRUD Operations
  // ==========================================================================

  /**
   * Store a new memory
   */
  async store(memory: {
    type: MemoryType;
    content: string;
    importance?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
    privacy?: PrivacySetting;
    expiresAt?: number;
  }): Promise<Memory> {
    const response = await apiRequest<{ memory: Memory }>('/', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        ...memory,
      }),
    });
    return response.memory;
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    try {
      const response = await apiRequest<{ memory: Memory }>(`/${id}`);
      return response.memory;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update a memory
   */
  async update(
    id: string,
    updates: {
      content?: string;
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
      privacy?: PrivacySetting;
      expiresAt?: number;
    }
  ): Promise<Memory | null> {
    try {
      const response = await apiRequest<{ memory: Memory }>(`/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return response.memory;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    try {
      await apiRequest(`/${id}`, { method: 'DELETE' });
      return true;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Bulk delete memories
   */
  async bulkDelete(memoryIds?: string[]): Promise<number> {
    const response = await apiRequest<{ deletedCount: number }>('/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        memoryIds,
      }),
    });
    return response.deletedCount;
  }

  // ==========================================================================
  // Search and Retrieval
  // ==========================================================================

  /**
   * Semantic search over memories
   */
  async search(options: {
    query: string;
    types?: MemoryType[];
    minImportance?: number;
    minRelevance?: number;
    limit?: number;
    includeTags?: string[];
    excludeTags?: string[];
    privacy?: PrivacySetting[];
  }): Promise<MemorySearchResult[]> {
    const params = new URLSearchParams();
    params.set('query', options.query);
    params.set('userId', this.userId);

    if (options.types?.length) {
      params.set('types', options.types.join(','));
    }
    if (options.minImportance !== undefined) {
      params.set('minImportance', String(options.minImportance));
    }
    if (options.minRelevance !== undefined) {
      params.set('minRelevance', String(options.minRelevance));
    }
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.includeTags?.length) {
      params.set('includeTags', options.includeTags.join(','));
    }
    if (options.excludeTags?.length) {
      params.set('excludeTags', options.excludeTags.join(','));
    }
    if (options.privacy?.length) {
      params.set('privacy', options.privacy.join(','));
    }

    const response = await apiRequest<{ results: MemorySearchResult[] }>(
      `/search?${params.toString()}`
    );
    return response.results;
  }

  /**
   * Get all memories for current user
   */
  async getAll(options?: {
    limit?: number;
    offset?: number;
    types?: MemoryType[];
    sortBy?: 'created' | 'accessed' | 'importance';
    sortOrder?: 'asc' | 'desc';
  }): Promise<Memory[]> {
    const params = new URLSearchParams();

    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.offset !== undefined) {
      params.set('offset', String(options.offset));
    }
    if (options?.types?.length) {
      params.set('types', options.types.join(','));
    }
    if (options?.sortBy) {
      params.set('sortBy', options.sortBy);
    }
    if (options?.sortOrder) {
      params.set('sortOrder', options.sortOrder);
    }

    const queryString = params.toString();
    const response = await apiRequest<{ memories: Memory[] }>(
      `/user/${this.userId}${queryString ? `?${queryString}` : ''}`
    );
    return response.memories;
  }

  // ==========================================================================
  // Memory Extraction
  // ==========================================================================

  /**
   * Extract memories from conversation
   */
  async extract(
    messages: ConversationMessage[],
    options?: {
      extractFacts?: boolean;
      extractPreferences?: boolean;
      extractSummary?: boolean;
      extractPatterns?: boolean;
      store?: boolean;
    }
  ): Promise<{
    extraction: ExtractionResult;
    stored: { id: string; type: MemoryType }[];
  }> {
    const response = await apiRequest<{
      extraction: ExtractionResult;
      stored: { id: string; type: MemoryType }[];
    }>('/extract', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        messages,
        options,
      }),
    });
    return response;
  }

  /**
   * Get relevant context for a query
   */
  async getContext(query: string, limit?: number): Promise<MemoryContext> {
    const response = await apiRequest<MemoryContext>('/context', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        query,
        limit,
      }),
    });
    return response;
  }

  // ==========================================================================
  // Memory Commands
  // ==========================================================================

  /**
   * Explicitly remember something
   */
  async remember(content: string, type: MemoryType = 'fact'): Promise<{
    success: boolean;
    memory: Memory;
    message: string;
  }> {
    const response = await apiRequest<{
      success: boolean;
      memory: Memory;
      message: string;
    }>('/remember', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        content,
        type,
      }),
    });
    return response;
  }

  /**
   * Forget memories matching query
   */
  async forget(query: string): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> {
    const response = await apiRequest<{
      success: boolean;
      deletedCount: number;
      message: string;
    }>('/forget', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userId,
        query,
      }),
    });
    return response;
  }

  // ==========================================================================
  // Statistics and Management
  // ==========================================================================

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    const response = await apiRequest<{ stats: MemoryStats }>(
      `/stats?userId=${this.userId}`
    );
    return response.stats;
  }

  /**
   * Trigger memory consolidation
   */
  async consolidate(): Promise<ConsolidationResult> {
    const response = await apiRequest<{ result: ConsolidationResult }>(
      '/consolidate',
      { method: 'POST' }
    );
    return response.result;
  }

  // ==========================================================================
  // Settings
  // ==========================================================================

  /**
   * Get memory settings
   */
  async getSettings(): Promise<MemorySettings> {
    const response = await apiRequest<{ settings: MemorySettings }>(
      `/settings/${this.userId}`
    );
    return response.settings;
  }

  /**
   * Update memory settings
   */
  async updateSettings(settings: Partial<MemorySettings>): Promise<MemorySettings> {
    const response = await apiRequest<{ settings: MemorySettings }>(
      `/settings/${this.userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      }
    );
    return response.settings;
  }

  // ==========================================================================
  // Export/Import
  // ==========================================================================

  /**
   * Export memories
   */
  async export(): Promise<{
    memories: Memory[];
    preferences: any[];
    exportedAt: number;
    version: string;
  }> {
    const response = await fetch(`${API_BASE}/export/${this.userId}`);
    if (!response.ok) {
      throw new Error('Export failed');
    }
    return response.json();
  }

  /**
   * Import memories
   */
  async import(data: {
    memories: Memory[];
    preferences?: any[];
  }): Promise<{ imported: number; errors: number }> {
    const response = await apiRequest<{ imported: number; errors: number }>(
      `/import/${this.userId}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response;
  }

  /**
   * Download memories as JSON file
   */
  async downloadExport(): Promise<void> {
    const data = await this.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memories-${this.userId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const memoryService = new MemoryServiceClient();

export default memoryService;
