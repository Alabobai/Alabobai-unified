/**
 * Alabobai State Persistence - State Store
 * Durable SQLite-based storage for task states and checkpoints
 *
 * Provides:
 * - Atomic transactions for data consistency
 * - Efficient querying by task, timestamp, and checkpoint ID
 * - State serialization/deserialization with validation
 * - Automatic schema migration
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// TYPES
// ============================================================================

/** Serialized state record stored in database (raw from SQLite) */
export interface StoredStateRow {
  id: string;
  task_id: string;
  checkpoint_id: string;
  version: number;
  state: string; // JSON serialized
  state_hash: string;
  metadata: string; // JSON serialized
  created_at: string;
  expires_at: string | null;
  compressed: number; // SQLite uses 0/1 for boolean
  size: number;
}

/** Serialized state record (normalized interface) */
export interface StoredState {
  id: string;
  taskId: string;
  checkpointId: string;
  version: number;
  state: string; // JSON serialized
  stateHash: string;
  metadata: string; // JSON serialized
  createdAt: string;
  expiresAt: string | null;
  compressed: boolean;
  size: number;
}

/** Deserialized state with typed fields */
export interface StateRecord<T = unknown> {
  id: string;
  taskId: string;
  checkpointId: string;
  version: number;
  state: T;
  stateHash: string;
  metadata: StateMetadata;
  createdAt: Date;
  expiresAt: Date | null;
  compressed: boolean;
  size: number;
}

/** Metadata associated with stored state */
export interface StateMetadata {
  agentId?: string;
  agentName?: string;
  actionType?: string;
  actionIndex?: number;
  parentCheckpointId?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

/** Configuration for the state store */
export interface StateStoreConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Enable WAL mode for better concurrent performance */
  walMode: boolean;
  /** Default expiration time in milliseconds (0 = no expiration) */
  defaultExpirationMs: number;
  /** Enable automatic vacuum on startup */
  autoVacuum: boolean;
  /** Maximum state size in bytes before compression is recommended */
  maxUncompressedSize: number;
}

/** Options for state queries */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'version';
  orderDirection?: 'ASC' | 'DESC';
  includeExpired?: boolean;
}

/** Result of a transaction operation */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rowsAffected?: number;
}

// ============================================================================
// LOGGER
// ============================================================================

interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const createLogger = (prefix: string): Logger => ({
  debug: (msg, data) => console.debug(`[${prefix}] ${msg}`, data || ''),
  info: (msg, data) => console.info(`[${prefix}] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[${prefix}] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[${prefix}] ${msg}`, data || ''),
});

// ============================================================================
// STATE STORE CLASS
// ============================================================================

export class StateStore {
  private db: Database.Database;
  private config: StateStoreConfig;
  private logger: Logger;
  private initialized: boolean = false;
  private schemaVersion: number = 1;

  constructor(config?: Partial<StateStoreConfig>) {
    this.config = {
      dbPath: './data/persistence.db',
      walMode: true,
      defaultExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      autoVacuum: true,
      maxUncompressedSize: 1024 * 1024, // 1MB
      ...config,
    };

    this.logger = createLogger('StateStore');

    // Ensure directory exists
    const dir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.config.dbPath);
    this.initialize();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initialize(): void {
    if (this.initialized) return;

    try {
      // Enable WAL mode for better concurrent access
      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }

      // Performance optimizations
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache
      this.db.pragma('temp_store = MEMORY');

      // Create schema
      this.createSchema();

      // Run migrations if needed
      this.runMigrations();

      // Auto vacuum if enabled
      if (this.config.autoVacuum) {
        this.db.pragma('auto_vacuum = INCREMENTAL');
      }

      this.initialized = true;
      this.logger.info('StateStore initialized', { dbPath: this.config.dbPath });
    } catch (error) {
      this.logger.error('Failed to initialize StateStore', { error: String(error) });
      throw error;
    }
  }

  private createSchema(): void {
    this.db.exec(`
      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Main state storage table
      CREATE TABLE IF NOT EXISTS states (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        state TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        expires_at TEXT,
        compressed INTEGER DEFAULT 0,
        size INTEGER NOT NULL
      );

      -- Indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_states_task_id ON states(task_id);
      CREATE INDEX IF NOT EXISTS idx_states_checkpoint_id ON states(checkpoint_id);
      CREATE INDEX IF NOT EXISTS idx_states_task_version ON states(task_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_states_created_at ON states(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_states_expires_at ON states(expires_at);

      -- Task metadata table for tracking active tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        checkpoint_count INTEGER DEFAULT 0,
        latest_checkpoint_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      -- Checkpoint chain tracking for recovery
      CREATE TABLE IF NOT EXISTS checkpoint_chain (
        checkpoint_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        parent_id TEXT,
        sequence_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_chain_task ON checkpoint_chain(task_id);
      CREATE INDEX IF NOT EXISTS idx_chain_parent ON checkpoint_chain(parent_id);
    `);

    // Set initial schema version
    const existing = this.db.prepare('SELECT value FROM schema_info WHERE key = ?').get('version');
    if (!existing) {
      this.db.prepare('INSERT INTO schema_info (key, value) VALUES (?, ?)').run('version', String(this.schemaVersion));
    }
  }

  private runMigrations(): void {
    const row = this.db.prepare('SELECT value FROM schema_info WHERE key = ?').get('version') as { value: string } | undefined;
    const currentVersion = row ? parseInt(row.value, 10) : 0;

    if (currentVersion < this.schemaVersion) {
      this.logger.info('Running migrations', { from: currentVersion, to: this.schemaVersion });

      // Add migration logic here as schema evolves
      // Example:
      // if (currentVersion < 2) { ... }

      this.db.prepare('UPDATE schema_info SET value = ? WHERE key = ?').run(String(this.schemaVersion), 'version');
    }
  }

  // ============================================================================
  // STATE OPERATIONS
  // ============================================================================

  /**
   * Save a state to the store
   */
  saveState<T>(
    taskId: string,
    checkpointId: string,
    state: T,
    metadata: StateMetadata = {},
    options?: { expiresAt?: Date; compressed?: boolean }
  ): TransactionResult<StateRecord<T>> {
    const startTime = Date.now();

    try {
      const id = uuid();
      const now = new Date().toISOString();
      const serializedState = JSON.stringify(state);
      const stateHash = this.computeHash(serializedState);
      const serializedMetadata = JSON.stringify(metadata);
      const size = serializedState.length;

      // Determine expiration
      let expiresAt: string | null = null;
      if (options?.expiresAt) {
        expiresAt = options.expiresAt.toISOString();
      } else if (this.config.defaultExpirationMs > 0) {
        expiresAt = new Date(Date.now() + this.config.defaultExpirationMs).toISOString();
      }

      // Get next version for this task
      const versionRow = this.db.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 as next_version
        FROM states WHERE task_id = ?
      `).get(taskId) as { next_version: number };
      const version = versionRow.next_version;

      // Use transaction for atomicity
      const result = this.transaction(() => {
        // Insert state
        this.db.prepare(`
          INSERT INTO states (id, task_id, checkpoint_id, version, state, state_hash, metadata, created_at, expires_at, compressed, size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, taskId, checkpointId, version, serializedState, stateHash, serializedMetadata, now, expiresAt, options?.compressed ? 1 : 0, size);

        // Update task tracking
        this.db.prepare(`
          INSERT INTO tasks (id, status, checkpoint_count, latest_checkpoint_id, created_at, updated_at)
          VALUES (?, 'active', 1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            checkpoint_count = checkpoint_count + 1,
            latest_checkpoint_id = excluded.latest_checkpoint_id,
            updated_at = excluded.updated_at
        `).run(taskId, checkpointId, now, now);

        // Track checkpoint chain
        this.db.prepare(`
          INSERT INTO checkpoint_chain (checkpoint_id, task_id, parent_id, sequence_number, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(checkpointId, taskId, metadata.parentCheckpointId || null, version, now);

        return {
          id,
          taskId,
          checkpointId,
          version,
          state,
          stateHash,
          metadata,
          createdAt: new Date(now),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          compressed: options?.compressed || false,
          size,
        } as StateRecord<T>;
      });

      this.logger.debug('State saved', {
        taskId,
        checkpointId,
        version,
        size,
        duration: Date.now() - startTime,
      });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to save state', { taskId, checkpointId, error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get state by checkpoint ID
   */
  getState<T = unknown>(checkpointId: string): StateRecord<T> | null {
    try {
      const row = this.db.prepare(`
        SELECT * FROM states WHERE checkpoint_id = ?
      `).get(checkpointId) as StoredStateRow | undefined;

      if (!row) return null;

      return this.deserializeStateRecord<T>(row);
    } catch (error) {
      this.logger.error('Failed to get state', { checkpointId, error: String(error) });
      return null;
    }
  }

  /**
   * Get the latest state for a task
   */
  getLatest<T = unknown>(taskId: string): StateRecord<T> | null {
    try {
      const row = this.db.prepare(`
        SELECT * FROM states
        WHERE task_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY version DESC
        LIMIT 1
      `).get(taskId) as StoredStateRow | undefined;

      if (!row) return null;

      return this.deserializeStateRecord<T>(row);
    } catch (error) {
      this.logger.error('Failed to get latest state', { taskId, error: String(error) });
      return null;
    }
  }

  /**
   * Get state by timestamp (closest checkpoint before or at timestamp)
   */
  getByTimestamp<T = unknown>(taskId: string, timestamp: Date): StateRecord<T> | null {
    try {
      const row = this.db.prepare(`
        SELECT * FROM states
        WHERE task_id = ? AND created_at <= ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(taskId, timestamp.toISOString()) as StoredStateRow | undefined;

      if (!row) return null;

      return this.deserializeStateRecord<T>(row);
    } catch (error) {
      this.logger.error('Failed to get state by timestamp', { taskId, timestamp: timestamp.toISOString(), error: String(error) });
      return null;
    }
  }

  /**
   * List all checkpoints for a task
   */
  listCheckpoints(taskId: string, options: QueryOptions = {}): StateRecord[] {
    try {
      const {
        limit = 100,
        offset = 0,
        orderBy = 'createdAt',
        orderDirection = 'DESC',
        includeExpired = false,
      } = options;

      const orderColumn = orderBy === 'createdAt' ? 'created_at' : 'version';
      const expirationClause = includeExpired ? '' : "AND (expires_at IS NULL OR expires_at > datetime('now'))";

      const rows = this.db.prepare(`
        SELECT * FROM states
        WHERE task_id = ? ${expirationClause}
        ORDER BY ${orderColumn} ${orderDirection}
        LIMIT ? OFFSET ?
      `).all(taskId, limit, offset) as StoredStateRow[];

      return rows.map(row => this.deserializeStateRecord(row));
    } catch (error) {
      this.logger.error('Failed to list checkpoints', { taskId, error: String(error) });
      return [];
    }
  }

  /**
   * Get checkpoint chain (ancestry) for a checkpoint
   */
  getCheckpointChain(checkpointId: string): string[] {
    try {
      const chain: string[] = [];
      let currentId: string | null = checkpointId;

      while (currentId) {
        chain.unshift(currentId);
        const row = this.db.prepare(`
          SELECT parent_id FROM checkpoint_chain WHERE checkpoint_id = ?
        `).get(currentId) as { parent_id: string | null } | undefined;

        currentId = row?.parent_id || null;
      }

      return chain;
    } catch (error) {
      this.logger.error('Failed to get checkpoint chain', { checkpointId, error: String(error) });
      return [checkpointId];
    }
  }

  // ============================================================================
  // DELETION / PRUNING
  // ============================================================================

  /**
   * Delete a specific state
   */
  deleteState(checkpointId: string): TransactionResult<void> {
    try {
      const result = this.transaction(() => {
        this.db.prepare('DELETE FROM states WHERE checkpoint_id = ?').run(checkpointId);
        this.db.prepare('DELETE FROM checkpoint_chain WHERE checkpoint_id = ?').run(checkpointId);
      });

      this.logger.debug('State deleted', { checkpointId });
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to delete state', { checkpointId, error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Delete all states for a task
   */
  deleteTask(taskId: string): TransactionResult<{ deletedCount: number }> {
    try {
      const result = this.transaction(() => {
        const countRow = this.db.prepare('SELECT COUNT(*) as count FROM states WHERE task_id = ?').get(taskId) as { count: number };
        const deletedCount = countRow.count;

        this.db.prepare('DELETE FROM states WHERE task_id = ?').run(taskId);
        this.db.prepare('DELETE FROM checkpoint_chain WHERE task_id = ?').run(taskId);
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

        return { deletedCount };
      });

      this.logger.info('Task deleted', { taskId, deletedCount: result.deletedCount });
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to delete task', { taskId, error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Prune old checkpoints, keeping only the last N for each task
   */
  pruneCheckpoints(taskId: string, keepCount: number): TransactionResult<{ prunedCount: number }> {
    try {
      const result = this.transaction(() => {
        // Get IDs of checkpoints to delete
        const toDelete = this.db.prepare(`
          SELECT checkpoint_id FROM states
          WHERE task_id = ?
          ORDER BY version DESC
          LIMIT -1 OFFSET ?
        `).all(taskId, keepCount) as { checkpoint_id: string }[];

        if (toDelete.length === 0) {
          return { prunedCount: 0 };
        }

        const ids = toDelete.map(r => r.checkpoint_id);
        const placeholders = ids.map(() => '?').join(',');

        this.db.prepare(`DELETE FROM states WHERE checkpoint_id IN (${placeholders})`).run(...ids);
        this.db.prepare(`DELETE FROM checkpoint_chain WHERE checkpoint_id IN (${placeholders})`).run(...ids);

        // Update task checkpoint count
        this.db.prepare(`
          UPDATE tasks SET checkpoint_count = checkpoint_count - ?, updated_at = ?
          WHERE id = ?
        `).run(ids.length, new Date().toISOString(), taskId);

        return { prunedCount: ids.length };
      });

      this.logger.info('Checkpoints pruned', { taskId, prunedCount: result.prunedCount });
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to prune checkpoints', { taskId, error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Delete expired states
   */
  deleteExpired(): TransactionResult<{ deletedCount: number }> {
    try {
      const result = this.transaction(() => {
        const countRow = this.db.prepare(`
          SELECT COUNT(*) as count FROM states WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
        `).get() as { count: number };

        this.db.prepare(`
          DELETE FROM checkpoint_chain WHERE checkpoint_id IN (
            SELECT checkpoint_id FROM states WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
          )
        `).run();

        this.db.prepare(`
          DELETE FROM states WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
        `).run();

        return { deletedCount: countRow.count };
      });

      if (result.deletedCount > 0) {
        this.logger.info('Expired states deleted', { deletedCount: result.deletedCount });
      }

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Failed to delete expired states', { error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // TRANSACTION SUPPORT
  // ============================================================================

  /**
   * Execute a function within a transaction
   */
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }

  /**
   * Begin a manual transaction (for complex multi-step operations)
   */
  beginTransaction(): void {
    this.db.exec('BEGIN IMMEDIATE');
  }

  /**
   * Commit a manual transaction
   */
  commit(): void {
    this.db.exec('COMMIT');
  }

  /**
   * Rollback a manual transaction
   */
  rollback(): void {
    this.db.exec('ROLLBACK');
  }

  // ============================================================================
  // TASK MANAGEMENT
  // ============================================================================

  /**
   * Get all active tasks
   */
  getActiveTasks(): Array<{
    id: string;
    name: string | null;
    checkpointCount: number;
    latestCheckpointId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM tasks WHERE status = 'active'
        ORDER BY updated_at DESC
      `).all() as Array<{
        id: string;
        name: string | null;
        checkpoint_count: number;
        latest_checkpoint_id: string | null;
        created_at: string;
        updated_at: string;
      }>;

      return rows.map(row => ({
        id: row.id,
        name: row.name,
        checkpointCount: row.checkpoint_count,
        latestCheckpointId: row.latest_checkpoint_id,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.logger.error('Failed to get active tasks', { error: String(error) });
      return [];
    }
  }

  /**
   * Mark a task as completed
   */
  markTaskCompleted(taskId: string): TransactionResult<void> {
    try {
      this.db.prepare(`
        UPDATE tasks SET status = 'completed', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), taskId);

      this.logger.debug('Task marked as completed', { taskId });
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark task completed', { taskId, error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private computeHash(data: string): string {
    // Simple hash for integrity checking
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private deserializeStateRecord<T>(row: StoredStateRow): StateRecord<T> {
    return {
      id: row.id,
      taskId: row.task_id,
      checkpointId: row.checkpoint_id,
      version: row.version,
      state: JSON.parse(row.state) as T,
      stateHash: row.state_hash,
      metadata: JSON.parse(row.metadata) as StateMetadata,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      compressed: Boolean(row.compressed),
      size: row.size,
    };
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalStates: number;
    totalTasks: number;
    totalSize: number;
    oldestState: Date | null;
    newestState: Date | null;
  } {
    try {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total_states,
          COALESCE(SUM(size), 0) as total_size,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM states
      `).get() as {
        total_states: number;
        total_size: number;
        oldest: string | null;
        newest: string | null;
      };

      const taskCount = this.db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };

      return {
        totalStates: stats.total_states,
        totalTasks: taskCount.count,
        totalSize: stats.total_size,
        oldestState: stats.oldest ? new Date(stats.oldest) : null,
        newestState: stats.newest ? new Date(stats.newest) : null,
      };
    } catch (error) {
      this.logger.error('Failed to get stats', { error: String(error) });
      return {
        totalStates: 0,
        totalTasks: 0,
        totalSize: 0,
        oldestState: null,
        newestState: null,
      };
    }
  }

  /**
   * Verify state integrity
   */
  verifyIntegrity(checkpointId: string): boolean {
    try {
      const row = this.db.prepare('SELECT state, state_hash FROM states WHERE checkpoint_id = ?').get(checkpointId) as { state: string; state_hash: string } | undefined;

      if (!row) return false;

      const computedHash = this.computeHash(row.state);
      return computedHash === row.state_hash;
    } catch (error) {
      this.logger.error('Failed to verify integrity', { checkpointId, error: String(error) });
      return false;
    }
  }

  /**
   * Run database vacuum to reclaim space
   */
  vacuum(): void {
    try {
      this.db.exec('VACUUM');
      this.logger.info('Database vacuumed');
    } catch (error) {
      this.logger.error('Failed to vacuum database', { error: String(error) });
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('StateStore closed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createStateStore(config?: Partial<StateStoreConfig>): StateStore {
  return new StateStore(config);
}
