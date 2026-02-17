/**
 * Memory Service - Persistent Memory System for Alabobai
 *
 * Stores and retrieves memories (facts, preferences, context)
 * - Memory types: user_preference, conversation_summary, fact, project_context
 * - Importance scoring and decay
 * - Memory consolidation (merge similar memories)
 * - Semantic search over memories
 * - Memory expiration and cleanup
 */

import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { VectorStore, createVectorStore } from './vectorStore.js';

// ============================================================================
// Types and Interfaces
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
  importance: number; // 0-100
  embedding?: number[];
  tags: string[];
  metadata: Record<string, unknown>;
  privacy: PrivacySetting;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  expiresAt?: number;
  decayedImportance?: number;
}

export interface MemoryCreateInput {
  userId: string;
  type: MemoryType;
  content: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  privacy?: PrivacySetting;
  expiresAt?: number;
}

export interface MemorySearchOptions {
  query: string;
  userId?: string;
  types?: MemoryType[];
  minImportance?: number;
  minRelevance?: number;
  limit?: number;
  includeTags?: string[];
  excludeTags?: string[];
  privacy?: PrivacySetting[];
}

export interface MemorySearchResult {
  memory: Memory;
  relevance: number;
  matchedTags: string[];
}

export interface ConsolidationResult {
  memoriesMerged: number;
  memoriesRemoved: number;
  newConnections: number;
  spaceReclaimed: number;
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract keywords from text for tagging
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'although', 'though', 'this', 'that',
    'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
    'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom'
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Return top keywords by frequency
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

/**
 * Calculate importance decay based on time and access patterns
 */
function calculateDecayedImportance(memory: Memory, currentTime: number = Date.now()): number {
  const daysSinceAccess = (currentTime - memory.accessedAt) / (1000 * 60 * 60 * 24);
  const accessBoost = Math.min(memory.accessCount * 2, 20);

  // Decay formula: importance reduces by ~10% per week of non-access
  const decayFactor = Math.pow(0.9, daysSinceAccess / 7);

  return Math.max(0, Math.min(100, memory.importance * decayFactor + accessBoost));
}

/**
 * Compress content for storage
 */
function compressContent(content: string): string {
  let compressed = content.replace(/\s+/g, ' ').trim();

  if (compressed.length > 10000) {
    compressed = compressed.substring(0, 9900) + '... [truncated]';
  }

  return compressed;
}

// ============================================================================
// Memory Service Class
// ============================================================================

export class MemoryService {
  private db: Database.Database;
  private vectorStore: VectorStore;
  private consolidationTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(databasePath: string = './data/memories.db') {
    const dbDir = path.dirname(databasePath);

    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(databasePath);
    this.vectorStore = createVectorStore(databasePath.replace('.db', '_vectors.db'));

    this.initializeDatabase();
    this.startBackgroundTasks();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    // Main memories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER DEFAULT 50,
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        privacy TEXT DEFAULT 'private',
        created_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        expires_at INTEGER,
        compressed INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(accessed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);
    `);

    // Memory relations for knowledge graph
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        strength REAL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_relations_source ON memory_relations(source_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON memory_relations(target_id);
    `);

    // User preferences table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        updated_at INTEGER NOT NULL,
        application_count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, key)
      );

      CREATE INDEX IF NOT EXISTS idx_prefs_user ON user_preferences(user_id);
      CREATE INDEX IF NOT EXISTS idx_prefs_category ON user_preferences(category);
    `);

    // Memory privacy settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_settings (
        user_id TEXT PRIMARY KEY,
        memory_enabled INTEGER DEFAULT 1,
        auto_extract INTEGER DEFAULT 1,
        retention_days INTEGER DEFAULT 365,
        max_memories INTEGER DEFAULT 10000,
        updated_at INTEGER NOT NULL
      );
    `);

    console.log('[MemoryService] Database initialized');
  }

  /**
   * Start background consolidation and cleanup tasks
   */
  private startBackgroundTasks(): void {
    // Run consolidation every hour
    this.consolidationTimer = setInterval(() => {
      this.consolidate().catch(err => {
        console.error('[MemoryService] Consolidation error:', err);
      });
    }, 60 * 60 * 1000);

    // Run cleanup every 6 hours
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => {
        console.error('[MemoryService] Cleanup error:', err);
      });
    }, 6 * 60 * 60 * 1000);
  }

  // ==========================================================================
  // Core Memory Operations
  // ==========================================================================

  /**
   * Store a new memory
   */
  async store(input: MemoryCreateInput): Promise<Memory> {
    const now = Date.now();
    const id = uuid();

    // Extract keywords if no tags provided
    const tags = input.tags?.length
      ? input.tags
      : extractKeywords(input.content);

    // Compress content if needed
    const content = compressContent(input.content);

    // Generate embedding
    const embedding = await this.vectorStore.generateEmbedding(content);

    const memory: Memory = {
      id,
      userId: input.userId,
      type: input.type,
      content,
      importance: input.importance ?? 50,
      embedding,
      tags,
      metadata: input.metadata ?? {},
      privacy: input.privacy ?? 'private',
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
      expiresAt: input.expiresAt,
    };

    // Store in database
    const stmt = this.db.prepare(`
      INSERT INTO memories (id, user_id, type, content, importance, tags, metadata, privacy, created_at, accessed_at, access_count, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.userId,
      memory.type,
      memory.content,
      memory.importance,
      JSON.stringify(memory.tags),
      JSON.stringify(memory.metadata),
      memory.privacy,
      memory.createdAt,
      memory.accessedAt,
      memory.accessCount,
      memory.expiresAt ?? null
    );

    // Store vector embedding
    await this.vectorStore.addVector(memory.id, embedding, {
      userId: memory.userId,
      type: memory.type,
      tags: memory.tags,
    });

    console.log(`[MemoryService] Stored memory: ${id} (type: ${input.type})`);
    return memory;
  }

  /**
   * Retrieve a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    // Update access stats
    this.db.prepare(`
      UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?
    `).run(Date.now(), id);

    return this.rowToMemory(row);
  }

  /**
   * Semantic search over memories
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const {
      query,
      userId,
      types,
      minImportance = 0,
      minRelevance = 0.3,
      limit = 10,
      includeTags,
      excludeTags,
      privacy,
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.vectorStore.generateEmbedding(query);
    const queryKeywords = new Set(extractKeywords(query));

    // Vector similarity search
    const vectorResults = await this.vectorStore.search(queryEmbedding, {
      limit: limit * 3,
      filter: {
        userId,
        type: types,
      },
    });

    // Get memory IDs from vector search
    const memoryIds = vectorResults.map(r => r.id);
    if (memoryIds.length === 0) return [];

    // Build SQL query for filtering
    const placeholders = memoryIds.map(() => '?').join(',');
    let sql = `
      SELECT * FROM memories
      WHERE id IN (${placeholders})
      AND importance >= ?
    `;
    const params: any[] = [...memoryIds, minImportance];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (types?.length) {
      sql += ` AND type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }

    if (privacy?.length) {
      sql += ` AND privacy IN (${privacy.map(() => '?').join(',')})`;
      params.push(...privacy);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];

    // Calculate final relevance scores
    const results: MemorySearchResult[] = [];

    for (const row of rows) {
      const memory = this.rowToMemory(row);
      const vectorResult = vectorResults.find(r => r.id === memory.id);

      if (!vectorResult) continue;

      // Calculate tag overlap
      const memoryTags = new Set(memory.tags);
      const matchedTags = [...queryKeywords].filter(k => memoryTags.has(k));
      const tagScore = queryKeywords.size > 0
        ? matchedTags.length / queryKeywords.size
        : 0;

      // Filter by tags if specified
      if (includeTags?.length && !includeTags.some(t => memoryTags.has(t))) {
        continue;
      }
      if (excludeTags?.length && excludeTags.some(t => memoryTags.has(t))) {
        continue;
      }

      // Calculate decayed importance
      const decayedImportance = calculateDecayedImportance(memory);

      // Combined relevance score
      const relevance =
        vectorResult.similarity * 0.5 +
        tagScore * 0.25 +
        (decayedImportance / 100) * 0.25;

      if (relevance >= minRelevance) {
        results.push({
          memory: { ...memory, decayedImportance },
          relevance,
          matchedTags,
        });
      }
    }

    // Sort by relevance and limit
    results.sort((a, b) => b.relevance - a.relevance);
    const limitedResults = results.slice(0, limit);

    // Update access stats for returned memories
    const now = Date.now();
    const updateStmt = this.db.prepare(`
      UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?
    `);

    for (const result of limitedResults) {
      updateStmt.run(now, result.memory.id);
    }

    return limitedResults;
  }

  /**
   * Get all memories for a user
   */
  async getUserMemories(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      types?: MemoryType[];
      sortBy?: 'created' | 'accessed' | 'importance';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<Memory[]> {
    const {
      limit = 50,
      offset = 0,
      types,
      sortBy = 'accessed',
      sortOrder = 'desc',
    } = options;

    const sortColumn = {
      created: 'created_at',
      accessed: 'accessed_at',
      importance: 'importance',
    }[sortBy];

    let sql = `SELECT * FROM memories WHERE user_id = ?`;
    const params: any[] = [userId];

    if (types?.length) {
      sql += ` AND type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }

    sql += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Update a memory
   */
  async update(id: string, updates: Partial<Omit<Memory, 'id' | 'userId' | 'createdAt'>>): Promise<Memory | null> {
    const memory = await this.get(id);
    if (!memory) return null;

    const updateFields: string[] = [];
    const params: any[] = [];

    if (updates.content !== undefined) {
      updateFields.push('content = ?');
      params.push(compressContent(updates.content));

      // Update embedding
      const embedding = await this.vectorStore.generateEmbedding(updates.content);
      await this.vectorStore.updateVector(id, embedding);
    }

    if (updates.importance !== undefined) {
      updateFields.push('importance = ?');
      params.push(updates.importance);
    }

    if (updates.tags !== undefined) {
      updateFields.push('tags = ?');
      params.push(JSON.stringify(updates.tags));
    }

    if (updates.metadata !== undefined) {
      updateFields.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }

    if (updates.privacy !== undefined) {
      updateFields.push('privacy = ?');
      params.push(updates.privacy);
    }

    if (updates.expiresAt !== undefined) {
      updateFields.push('expires_at = ?');
      params.push(updates.expiresAt);
    }

    if (updateFields.length === 0) return memory;

    params.push(id);
    this.db.prepare(`
      UPDATE memories SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...params);

    return this.get(id);
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);

    if (result.changes > 0) {
      await this.vectorStore.deleteVector(id);

      // Delete relations
      this.db.prepare(`DELETE FROM memory_relations WHERE source_id = ? OR target_id = ?`).run(id, id);

      console.log(`[MemoryService] Deleted memory: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * Bulk delete memories for a user
   */
  async bulkDelete(userId: string, memoryIds?: string[]): Promise<number> {
    if (memoryIds?.length) {
      const placeholders = memoryIds.map(() => '?').join(',');
      const result = this.db.prepare(`
        DELETE FROM memories WHERE user_id = ? AND id IN (${placeholders})
      `).run(userId, ...memoryIds);

      for (const id of memoryIds) {
        await this.vectorStore.deleteVector(id);
      }

      return result.changes;
    } else {
      // Delete all user memories
      const allMemories = this.db.prepare(`SELECT id FROM memories WHERE user_id = ?`).all(userId) as { id: string }[];

      const result = this.db.prepare(`DELETE FROM memories WHERE user_id = ?`).run(userId);

      for (const { id } of allMemories) {
        await this.vectorStore.deleteVector(id);
      }

      return result.changes;
    }
  }

  // ==========================================================================
  // Memory Consolidation
  // ==========================================================================

  /**
   * Consolidate similar memories
   */
  async consolidate(): Promise<ConsolidationResult> {
    console.log('[MemoryService] Starting consolidation...');

    const result: ConsolidationResult = {
      memoriesMerged: 0,
      memoriesRemoved: 0,
      newConnections: 0,
      spaceReclaimed: 0,
    };

    // Get all memories grouped by type
    const types: MemoryType[] = [
      'user_preference', 'conversation_summary', 'fact', 'project_context',
      'decision', 'code_pattern', 'error_resolution', 'knowledge'
    ];

    for (const type of types) {
      const memories = this.db.prepare(`
        SELECT * FROM memories WHERE type = ? ORDER BY importance DESC
      `).all(type) as any[];

      if (memories.length < 2) continue;

      // Find similar memories
      const toMerge: [any, any][] = [];

      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const similarity = await this.calculateSimilarity(memories[i].id, memories[j].id);

          if (similarity > 0.85) {
            toMerge.push([memories[i], memories[j]]);
          }
        }
      }

      // Merge similar memories
      for (const [a, b] of toMerge) {
        const keep = a.importance >= b.importance ? a : b;
        const remove = keep === a ? b : a;

        // Merge content if different
        if (a.content !== b.content) {
          const mergedContent = `${keep.content}\n\n[Related]: ${remove.content.substring(0, 500)}`;
          this.db.prepare(`UPDATE memories SET content = ? WHERE id = ?`).run(
            compressContent(mergedContent),
            keep.id
          );
        }

        // Merge tags
        const keepTags = JSON.parse(keep.tags);
        const removeTags = JSON.parse(remove.tags);
        const mergedTags = [...new Set([...keepTags, ...removeTags])];
        this.db.prepare(`UPDATE memories SET tags = ? WHERE id = ?`).run(
          JSON.stringify(mergedTags),
          keep.id
        );

        // Delete duplicate
        result.spaceReclaimed += remove.content.length;
        await this.delete(remove.id);
        result.memoriesMerged++;
      }
    }

    // Remove very old, low-importance memories
    const now = Date.now();
    const oldMemories = this.db.prepare(`
      SELECT * FROM memories
      WHERE accessed_at < ? AND importance < 30 AND access_count < 2
    `).all(now - 90 * 24 * 60 * 60 * 1000) as any[];

    for (const memory of oldMemories) {
      result.spaceReclaimed += memory.content.length;
      await this.delete(memory.id);
      result.memoriesRemoved++;
    }

    console.log(`[MemoryService] Consolidation complete:`, result);
    return result;
  }

  /**
   * Calculate similarity between two memories
   */
  private async calculateSimilarity(id1: string, id2: string): Promise<number> {
    return this.vectorStore.similarity(id1, id2);
  }

  // ==========================================================================
  // Memory Cleanup
  // ==========================================================================

  /**
   * Clean up expired and low-value memories
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    // Remove expired memories
    const expired = this.db.prepare(`
      SELECT id FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?
    `).all(now) as { id: string }[];

    for (const { id } of expired) {
      await this.delete(id);
      removed++;
    }

    // Check user retention settings
    const settings = this.db.prepare(`SELECT * FROM memory_settings`).all() as any[];

    for (const setting of settings) {
      if (!setting.memory_enabled) {
        // Delete all memories for disabled users
        const deleted = await this.bulkDelete(setting.user_id);
        removed += deleted;
        continue;
      }

      const retentionMs = setting.retention_days * 24 * 60 * 60 * 1000;
      const oldMemories = this.db.prepare(`
        SELECT id FROM memories
        WHERE user_id = ? AND created_at < ?
      `).all(setting.user_id, now - retentionMs) as { id: string }[];

      for (const { id } of oldMemories) {
        await this.delete(id);
        removed++;
      }

      // Enforce max memories limit
      const count = this.db.prepare(`
        SELECT COUNT(*) as count FROM memories WHERE user_id = ?
      `).get(setting.user_id) as { count: number };

      if (count.count > setting.max_memories) {
        const excess = count.count - setting.max_memories;
        const toRemove = this.db.prepare(`
          SELECT id FROM memories
          WHERE user_id = ?
          ORDER BY importance ASC, accessed_at ASC
          LIMIT ?
        `).all(setting.user_id, excess) as { id: string }[];

        for (const { id } of toRemove) {
          await this.delete(id);
          removed++;
        }
      }
    }

    console.log(`[MemoryService] Cleanup removed ${removed} memories`);
    return removed;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get memory statistics
   */
  async getStats(userId?: string): Promise<MemoryStats> {
    let baseQuery = 'FROM memories';
    const params: any[] = [];

    if (userId) {
      baseQuery += ' WHERE user_id = ?';
      params.push(userId);
    }

    const total = this.db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };

    const byType = this.db.prepare(`
      SELECT type, COUNT(*) as count ${baseQuery} GROUP BY type
    `).all(...params) as { type: MemoryType; count: number }[];

    const byUser = this.db.prepare(`
      SELECT user_id, COUNT(*) as count ${baseQuery} GROUP BY user_id
    `).all(...params) as { user_id: string; count: number }[];

    const avgImportance = this.db.prepare(`
      SELECT AVG(importance) as avg ${baseQuery}
    `).get(...params) as { avg: number | null };

    const dates = this.db.prepare(`
      SELECT MIN(created_at) as oldest, MAX(created_at) as newest ${baseQuery}
    `).get(...params) as { oldest: number | null; newest: number | null };

    const now = Date.now();
    const expiringQuery = userId
      ? `SELECT COUNT(*) as count FROM memories WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at < ?`
      : `SELECT COUNT(*) as count FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?`;
    const expiringParams = userId ? [userId, now + 7 * 24 * 60 * 60 * 1000] : [now + 7 * 24 * 60 * 60 * 1000];
    const expiring = this.db.prepare(expiringQuery).get(...expiringParams) as { count: number };

    // Calculate storage
    const storage = this.db.prepare(`
      SELECT SUM(LENGTH(content)) as bytes ${baseQuery}
    `).get(...params) as { bytes: number | null };

    const memoriesByType: Record<MemoryType, number> = {
      user_preference: 0,
      conversation_summary: 0,
      fact: 0,
      project_context: 0,
      decision: 0,
      code_pattern: 0,
      error_resolution: 0,
      knowledge: 0,
    };

    for (const { type, count } of byType) {
      memoriesByType[type] = count;
    }

    const memoriesByUser: Record<string, number> = {};
    for (const { user_id, count } of byUser) {
      memoriesByUser[user_id] = count;
    }

    return {
      totalMemories: total.count,
      memoriesByType,
      memoriesByUser,
      averageImportance: avgImportance.avg ?? 0,
      totalStorageBytes: storage.bytes ?? 0,
      oldestMemory: dates.oldest,
      newestMemory: dates.newest,
      expiringCount: expiring.count,
    };
  }

  // ==========================================================================
  // User Settings
  // ==========================================================================

  /**
   * Get user memory settings
   */
  getSettings(userId: string): {
    memoryEnabled: boolean;
    autoExtract: boolean;
    retentionDays: number;
    maxMemories: number;
  } {
    const row = this.db.prepare(`
      SELECT * FROM memory_settings WHERE user_id = ?
    `).get(userId) as any;

    if (!row) {
      return {
        memoryEnabled: true,
        autoExtract: true,
        retentionDays: 365,
        maxMemories: 10000,
      };
    }

    return {
      memoryEnabled: row.memory_enabled === 1,
      autoExtract: row.auto_extract === 1,
      retentionDays: row.retention_days,
      maxMemories: row.max_memories,
    };
  }

  /**
   * Update user memory settings
   */
  updateSettings(
    userId: string,
    settings: {
      memoryEnabled?: boolean;
      autoExtract?: boolean;
      retentionDays?: number;
      maxMemories?: number;
    }
  ): void {
    const existing = this.db.prepare(`SELECT * FROM memory_settings WHERE user_id = ?`).get(userId);

    if (existing) {
      const updates: string[] = [];
      const params: any[] = [];

      if (settings.memoryEnabled !== undefined) {
        updates.push('memory_enabled = ?');
        params.push(settings.memoryEnabled ? 1 : 0);
      }
      if (settings.autoExtract !== undefined) {
        updates.push('auto_extract = ?');
        params.push(settings.autoExtract ? 1 : 0);
      }
      if (settings.retentionDays !== undefined) {
        updates.push('retention_days = ?');
        params.push(settings.retentionDays);
      }
      if (settings.maxMemories !== undefined) {
        updates.push('max_memories = ?');
        params.push(settings.maxMemories);
      }

      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(userId);

      this.db.prepare(`
        UPDATE memory_settings SET ${updates.join(', ')} WHERE user_id = ?
      `).run(...params);
    } else {
      this.db.prepare(`
        INSERT INTO memory_settings (user_id, memory_enabled, auto_extract, retention_days, max_memories, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        settings.memoryEnabled !== false ? 1 : 0,
        settings.autoExtract !== false ? 1 : 0,
        settings.retentionDays ?? 365,
        settings.maxMemories ?? 10000,
        Date.now()
      );
    }
  }

  // ==========================================================================
  // Export/Import
  // ==========================================================================

  /**
   * Export user memories
   */
  async exportMemories(userId: string): Promise<{
    memories: Memory[];
    preferences: any[];
    exportedAt: number;
    version: string;
  }> {
    const memories = await this.getUserMemories(userId, { limit: 100000 });
    const preferences = this.db.prepare(`
      SELECT * FROM user_preferences WHERE user_id = ?
    `).all(userId);

    return {
      memories,
      preferences,
      exportedAt: Date.now(),
      version: '1.0.0',
    };
  }

  /**
   * Import memories from export
   */
  async importMemories(
    userId: string,
    data: { memories: Memory[]; preferences?: any[] }
  ): Promise<{ imported: number; errors: number }> {
    let imported = 0;
    let errors = 0;

    for (const memory of data.memories) {
      try {
        await this.store({
          userId,
          type: memory.type,
          content: memory.content,
          importance: memory.importance,
          tags: memory.tags,
          metadata: memory.metadata,
          privacy: memory.privacy,
        });
        imported++;
      } catch (err) {
        errors++;
      }
    }

    return { imported, errors };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Convert database row to Memory object
   */
  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as MemoryType,
      content: row.content,
      importance: row.importance,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      privacy: row.privacy as PrivacySetting,
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count,
      expiresAt: row.expires_at ?? undefined,
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.db.close();
    this.vectorStore.shutdown();
    console.log('[MemoryService] Shutdown complete');
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(databasePath?: string): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService(databasePath);
  }
  return memoryServiceInstance;
}

export function createMemoryService(databasePath?: string): MemoryService {
  return new MemoryService(databasePath);
}

export default { getMemoryService, createMemoryService, MemoryService };
