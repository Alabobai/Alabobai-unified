/**
 * Alabobai State Persistence - Checkpoint Manager
 * Save and restore task state at any point during execution
 *
 * Features:
 * - Automatic checkpointing after each agent action
 * - Manual milestone checkpoints
 * - Efficient state diffing for incremental saves
 * - Checkpoint pruning (configurable retention)
 * - State compression for large states
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { StateStore, StateMetadata, StateRecord, QueryOptions } from './StateStore.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// TYPES
// ============================================================================

/** Task state that can be checkpointed */
export interface TaskState {
  /** Current progress (0-100) */
  progress: number;
  /** Current phase/step of the task */
  phase: string;
  /** Data accumulated during task execution */
  data: Record<string, unknown>;
  /** Agent-specific state */
  agentState: Record<string, unknown>;
  /** Messages exchanged during task */
  messages: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>;
  /** Actions performed */
  actions: Array<{
    type: string;
    timestamp: Date;
    result?: unknown;
  }>;
  /** Any errors encountered */
  errors: Array<{
    message: string;
    timestamp: Date;
    recoverable: boolean;
  }>;
  /** Custom state from agents/plugins */
  custom?: Record<string, unknown>;
}

/** Checkpoint record with full metadata */
export interface Checkpoint {
  id: string;
  taskId: string;
  version: number;
  type: 'auto' | 'manual' | 'milestone' | 'error';
  label?: string;
  state: TaskState;
  metadata: CheckpointMetadata;
  createdAt: Date;
  size: number;
  compressed: boolean;
}

/** Extended metadata for checkpoints */
export interface CheckpointMetadata extends StateMetadata {
  triggerReason: 'action' | 'interval' | 'milestone' | 'error' | 'manual';
  actionType?: string;
  actionIndex?: number;
  phase?: string;
  progress?: number;
  isDiff?: boolean;
}

/** Configuration for the checkpoint manager */
export interface CheckpointManagerConfig {
  /** Maximum checkpoints to keep per task (default: 50) */
  maxCheckpointsPerTask: number;
  /** Enable automatic checkpointing (default: true) */
  autoCheckpoint: boolean;
  /** Minimum interval between auto checkpoints in ms (default: 5000) */
  minCheckpointInterval: number;
  /** Enable compression for states larger than threshold (default: true) */
  compressionEnabled: boolean;
  /** Compression threshold in bytes (default: 10KB) */
  compressionThreshold: number;
  /** Enable state diffing for space efficiency (default: true) */
  enableDiffing: boolean;
  /** Store instance to use */
  store?: StateStore;
}

/** Events emitted by the checkpoint manager */
export interface CheckpointManagerEvents {
  'checkpoint-created': { checkpoint: Checkpoint; duration: number };
  'checkpoint-restored': { checkpoint: Checkpoint; duration: number };
  'checkpoints-pruned': { taskId: string; prunedCount: number };
  'error': { operation: string; error: Error };
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
// CHECKPOINT MANAGER CLASS
// ============================================================================

export class CheckpointManager extends EventEmitter {
  private config: CheckpointManagerConfig;
  private store: StateStore;
  private logger: Logger;
  private lastCheckpointTime: Map<string, number> = new Map();
  private latestStates: Map<string, TaskState> = new Map();

  constructor(config?: Partial<CheckpointManagerConfig>) {
    super();

    this.config = {
      maxCheckpointsPerTask: 50,
      autoCheckpoint: true,
      minCheckpointInterval: 5000,
      compressionEnabled: true,
      compressionThreshold: 10 * 1024, // 10KB
      enableDiffing: true,
      ...config,
    };

    this.store = config?.store || new StateStore();
    this.logger = createLogger('CheckpointManager');
  }

  // ============================================================================
  // CHECKPOINT CREATION
  // ============================================================================

  /**
   * Create a checkpoint for a task
   */
  async createCheckpoint(
    taskId: string,
    state: TaskState,
    options: {
      type?: 'auto' | 'manual' | 'milestone' | 'error';
      label?: string;
      triggerReason?: CheckpointMetadata['triggerReason'];
      actionType?: string;
      actionIndex?: number;
      force?: boolean;
    } = {}
  ): Promise<Checkpoint> {
    const startTime = Date.now();
    const {
      type = 'manual',
      label,
      triggerReason = 'manual',
      actionType,
      actionIndex,
      force = false,
    } = options;

    // Check minimum interval for auto checkpoints
    if (type === 'auto' && !force) {
      const lastTime = this.lastCheckpointTime.get(taskId) || 0;
      if (Date.now() - lastTime < this.config.minCheckpointInterval) {
        throw new Error('Checkpoint too soon after previous checkpoint');
      }
    }

    try {
      const checkpointId = uuid();
      const previousState = this.latestStates.get(taskId);

      // Prepare state for storage
      let stateToStore: TaskState | Partial<TaskState> = state;
      let isDiff = false;

      if (this.config.enableDiffing && previousState && type === 'auto') {
        const diff = this.computeStateDiff(previousState, state);
        if (diff) {
          stateToStore = diff;
          isDiff = true;
        }
      }

      // Serialize state
      let serializedState = JSON.stringify(stateToStore);
      let compressed = false;

      // Compress if needed
      if (this.config.compressionEnabled && serializedState.length > this.config.compressionThreshold) {
        const compressedBuffer = await gzip(Buffer.from(serializedState));
        serializedState = compressedBuffer.toString('base64');
        compressed = true;
      }

      // Get parent checkpoint ID
      const latest = this.store.getLatest(taskId);
      const parentCheckpointId = latest?.checkpointId;

      // Build metadata
      const metadata: CheckpointMetadata = {
        triggerReason,
        actionType,
        actionIndex,
        phase: state.phase,
        progress: state.progress,
        isDiff,
        parentCheckpointId,
      };

      // Save to store
      const result = this.store.saveState(
        taskId,
        checkpointId,
        compressed ? { compressed: true, data: serializedState } : stateToStore,
        metadata,
        { compressed }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to save checkpoint');
      }

      // Update tracking
      this.lastCheckpointTime.set(taskId, Date.now());
      this.latestStates.set(taskId, state);

      // Prune if over limit
      await this.autoPrune(taskId);

      const checkpoint: Checkpoint = {
        id: checkpointId,
        taskId,
        version: result.data!.version,
        type,
        label,
        state,
        metadata,
        createdAt: new Date(),
        size: serializedState.length,
        compressed,
      };

      const duration = Date.now() - startTime;
      this.emit('checkpoint-created', { checkpoint, duration });
      this.logger.debug('Checkpoint created', {
        taskId,
        checkpointId,
        type,
        version: checkpoint.version,
        size: checkpoint.size,
        compressed,
        duration,
      });

      return checkpoint;
    } catch (error) {
      this.logger.error('Failed to create checkpoint', {
        taskId,
        error: String(error),
      });
      this.emit('error', { operation: 'createCheckpoint', error: error as Error });
      throw error;
    }
  }

  /**
   * Create an automatic checkpoint (called after agent actions)
   */
  async autoCheckpoint(
    taskId: string,
    state: TaskState,
    actionType: string,
    actionIndex: number
  ): Promise<Checkpoint | null> {
    if (!this.config.autoCheckpoint) {
      return null;
    }

    try {
      return await this.createCheckpoint(taskId, state, {
        type: 'auto',
        triggerReason: 'action',
        actionType,
        actionIndex,
      });
    } catch (error) {
      // Auto checkpoint failures should not break execution
      if ((error as Error).message.includes('too soon')) {
        return null;
      }
      this.logger.warn('Auto checkpoint failed', { taskId, error: String(error) });
      return null;
    }
  }

  /**
   * Create a milestone checkpoint with a label
   */
  async createMilestone(
    taskId: string,
    state: TaskState,
    label: string
  ): Promise<Checkpoint> {
    return this.createCheckpoint(taskId, state, {
      type: 'milestone',
      label,
      triggerReason: 'milestone',
      force: true,
    });
  }

  /**
   * Create an error checkpoint for recovery
   */
  async createErrorCheckpoint(
    taskId: string,
    state: TaskState,
    errorMessage: string
  ): Promise<Checkpoint> {
    return this.createCheckpoint(taskId, state, {
      type: 'error',
      label: `Error: ${errorMessage}`,
      triggerReason: 'error',
      force: true,
    });
  }

  // ============================================================================
  // CHECKPOINT RESTORATION
  // ============================================================================

  /**
   * Restore state from a checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<TaskState> {
    const startTime = Date.now();

    try {
      const record = this.store.getState<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>(checkpointId);

      if (!record) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      let state: TaskState;

      // If this was a diff, reconstruct full state
      if ((record.metadata as CheckpointMetadata).isDiff) {
        state = await this.reconstructFullState(record.taskId, checkpointId);
      } else {
        state = await this.deserializeFullState(record);
      }

      // Update latest state cache
      this.latestStates.set(record.taskId, state);

      const duration = Date.now() - startTime;
      const checkpoint: Checkpoint = {
        id: checkpointId,
        taskId: record.taskId,
        version: record.version,
        type: 'manual', // Type is not stored, default to manual
        state,
        metadata: record.metadata as CheckpointMetadata,
        createdAt: record.createdAt,
        size: record.size,
        compressed: record.compressed,
      };

      this.emit('checkpoint-restored', { checkpoint, duration });
      this.logger.info('Checkpoint restored', {
        checkpointId,
        taskId: record.taskId,
        version: record.version,
        duration,
      });

      return state;
    } catch (error) {
      this.logger.error('Failed to restore checkpoint', {
        checkpointId,
        error: String(error),
      });
      this.emit('error', { operation: 'restoreCheckpoint', error: error as Error });
      throw error;
    }
  }

  /**
   * Get the latest checkpoint for a task
   */
  async getLatest(taskId: string): Promise<Checkpoint | null> {
    const record = this.store.getLatest<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>(taskId);
    if (!record) return null;

    let state: TaskState;
    if ((record.metadata as CheckpointMetadata).isDiff) {
      state = await this.reconstructFullState(taskId, record.checkpointId);
    } else {
      state = await this.deserializeFullState(record);
    }

    return {
      id: record.checkpointId,
      taskId: record.taskId,
      version: record.version,
      type: 'manual',
      state,
      metadata: record.metadata as CheckpointMetadata,
      createdAt: record.createdAt,
      size: record.size,
      compressed: record.compressed,
    };
  }

  /**
   * Get checkpoint closest to a timestamp
   */
  async getByTimestamp(taskId: string, timestamp: Date): Promise<Checkpoint | null> {
    const record = this.store.getByTimestamp<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>(taskId, timestamp);
    if (!record) return null;

    let state: TaskState;
    if ((record.metadata as CheckpointMetadata).isDiff) {
      state = await this.reconstructFullState(taskId, record.checkpointId);
    } else {
      state = await this.deserializeFullState(record);
    }

    return {
      id: record.checkpointId,
      taskId: record.taskId,
      version: record.version,
      type: 'manual',
      state,
      metadata: record.metadata as CheckpointMetadata,
      createdAt: record.createdAt,
      size: record.size,
      compressed: record.compressed,
    };
  }

  /**
   * List all checkpoints for a task
   */
  listCheckpoints(taskId: string, options?: QueryOptions): Checkpoint[] {
    const records = this.store.listCheckpoints(taskId, options);

    return records.map(record => ({
      id: record.checkpointId,
      taskId: record.taskId,
      version: record.version,
      type: 'manual' as const,
      state: {} as TaskState, // Don't deserialize all states for listing
      metadata: record.metadata as CheckpointMetadata,
      createdAt: record.createdAt,
      size: record.size,
      compressed: record.compressed,
    }));
  }

  /**
   * Get only milestone checkpoints
   */
  getMilestones(taskId: string): Checkpoint[] {
    const all = this.listCheckpoints(taskId);
    return all.filter(c => c.type === 'milestone');
  }

  // ============================================================================
  // PRUNING
  // ============================================================================

  /**
   * Prune old checkpoints, keeping only the configured maximum
   */
  async pruneCheckpoints(taskId: string, keepCount?: number): Promise<number> {
    const keep = keepCount || this.config.maxCheckpointsPerTask;
    const result = this.store.pruneCheckpoints(taskId, keep);

    if (result.success && result.data!.prunedCount > 0) {
      this.emit('checkpoints-pruned', { taskId, prunedCount: result.data!.prunedCount });
      this.logger.info('Checkpoints pruned', { taskId, prunedCount: result.data!.prunedCount });
    }

    return result.data?.prunedCount || 0;
  }

  /**
   * Auto prune if over limit
   */
  private async autoPrune(taskId: string): Promise<void> {
    const checkpoints = this.listCheckpoints(taskId);
    if (checkpoints.length > this.config.maxCheckpointsPerTask) {
      await this.pruneCheckpoints(taskId);
    }
  }

  // ============================================================================
  // STATE DIFFING
  // ============================================================================

  /**
   * Compute difference between two states
   */
  private computeStateDiff(previous: TaskState, current: TaskState): Partial<TaskState> | null {
    const diff: Partial<TaskState> = {};
    let hasDiff = false;

    // Compare simple fields
    if (previous.progress !== current.progress) {
      diff.progress = current.progress;
      hasDiff = true;
    }

    if (previous.phase !== current.phase) {
      diff.phase = current.phase;
      hasDiff = true;
    }

    // Compare messages (only new ones)
    if (current.messages.length > previous.messages.length) {
      diff.messages = current.messages.slice(previous.messages.length);
      hasDiff = true;
    }

    // Compare actions (only new ones)
    if (current.actions.length > previous.actions.length) {
      diff.actions = current.actions.slice(previous.actions.length);
      hasDiff = true;
    }

    // Compare errors (only new ones)
    if (current.errors.length > previous.errors.length) {
      diff.errors = current.errors.slice(previous.errors.length);
      hasDiff = true;
    }

    // Compare data (full replacement if changed)
    if (JSON.stringify(previous.data) !== JSON.stringify(current.data)) {
      diff.data = current.data;
      hasDiff = true;
    }

    // Compare agent state (full replacement if changed)
    if (JSON.stringify(previous.agentState) !== JSON.stringify(current.agentState)) {
      diff.agentState = current.agentState;
      hasDiff = true;
    }

    // Compare custom (full replacement if changed)
    if (JSON.stringify(previous.custom) !== JSON.stringify(current.custom)) {
      diff.custom = current.custom;
      hasDiff = true;
    }

    return hasDiff ? diff : null;
  }

  /**
   * Apply a diff to a base state
   */
  private applyDiff(base: TaskState, diff: Partial<TaskState>): TaskState {
    const result = { ...base };

    if (diff.progress !== undefined) result.progress = diff.progress;
    if (diff.phase !== undefined) result.phase = diff.phase;
    if (diff.messages) result.messages = [...base.messages, ...diff.messages];
    if (diff.actions) result.actions = [...base.actions, ...diff.actions];
    if (diff.errors) result.errors = [...base.errors, ...diff.errors];
    if (diff.data) result.data = diff.data;
    if (diff.agentState) result.agentState = diff.agentState;
    if (diff.custom) result.custom = diff.custom;

    return result;
  }

  /**
   * Reconstruct full state from chain of diffs
   */
  private async reconstructFullState(_taskId: string, checkpointId: string): Promise<TaskState> {
    // Get the checkpoint chain
    const chain = this.store.getCheckpointChain(checkpointId);

    if (chain.length === 0) {
      throw new Error(`Empty checkpoint chain for ${checkpointId}`);
    }

    // Load and apply each checkpoint in order
    let state: TaskState | null = null;

    for (const cpId of chain) {
      const record = this.store.getState<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>(cpId);
      if (!record) {
        throw new Error(`Checkpoint in chain not found: ${cpId}`);
      }

      const cpState = await this.deserializeState(record);

      if (state === null) {
        // First checkpoint is the base - must be a full TaskState
        state = cpState as TaskState;
      } else if ((record.metadata as CheckpointMetadata).isDiff) {
        // Apply diff
        state = this.applyDiff(state, cpState as Partial<TaskState>);
      } else {
        // Full state, replace
        state = cpState as TaskState;
      }
    }

    if (!state) {
      throw new Error(`Failed to reconstruct state for ${checkpointId}`);
    }

    return state;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Deserialize and decompress state data, returning as-is (could be full or diff)
   */
  private async deserializeState(
    record: StateRecord<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>
  ): Promise<TaskState | Partial<TaskState>> {
    let state = record.state;

    // Handle compressed state
    if (typeof state === 'object' && 'compressed' in state && (state as { compressed: boolean }).compressed) {
      const compressedState = state as { compressed: boolean; data: string };
      const buffer = Buffer.from(compressedState.data, 'base64');
      const decompressed = await gunzip(buffer);
      state = JSON.parse(decompressed.toString());
    }

    return state as TaskState | Partial<TaskState>;
  }

  /**
   * Deserialize state and ensure it's a full TaskState (not a diff)
   */
  private async deserializeFullState(
    record: StateRecord<TaskState | Partial<TaskState> | { compressed: boolean; data: string }>
  ): Promise<TaskState> {
    const state = await this.deserializeState(record);
    return state as TaskState;
  }

  // ============================================================================
  // TASK MANAGEMENT
  // ============================================================================

  /**
   * Clear all checkpoints for a task
   */
  async clearTask(taskId: string): Promise<void> {
    this.store.deleteTask(taskId);
    this.lastCheckpointTime.delete(taskId);
    this.latestStates.delete(taskId);
    this.logger.info('Task checkpoints cleared', { taskId });
  }

  /**
   * Get tasks that have checkpoints
   */
  getTasksWithCheckpoints(): string[] {
    const tasks = this.store.getActiveTasks();
    return tasks.map(t => t.id);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get statistics for a task's checkpoints
   */
  getTaskStats(taskId: string): {
    checkpointCount: number;
    totalSize: number;
    oldestCheckpoint: Date | null;
    newestCheckpoint: Date | null;
    milestoneCount: number;
  } {
    const checkpoints = this.listCheckpoints(taskId);

    return {
      checkpointCount: checkpoints.length,
      totalSize: checkpoints.reduce((sum, c) => sum + c.size, 0),
      oldestCheckpoint: checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].createdAt : null,
      newestCheckpoint: checkpoints.length > 0 ? checkpoints[0].createdAt : null,
      milestoneCount: checkpoints.filter(c => c.type === 'milestone').length,
    };
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    totalTasks: number;
    totalCheckpoints: number;
    totalSize: number;
  } {
    const stats = this.store.getStats();
    return {
      totalTasks: stats.totalTasks,
      totalCheckpoints: stats.totalStates,
      totalSize: stats.totalSize,
    };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Close the checkpoint manager
   */
  close(): void {
    this.store.close();
    this.lastCheckpointTime.clear();
    this.latestStates.clear();
    this.logger.info('CheckpointManager closed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createCheckpointManager(
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  return new CheckpointManager(config);
}
