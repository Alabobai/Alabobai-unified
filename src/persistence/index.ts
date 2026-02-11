/**
 * Alabobai State Persistence Module
 *
 * A comprehensive checkpointing and state persistence system for the Alabobai platform.
 * Provides durable storage, automatic checkpointing, and crash recovery capabilities.
 *
 * Components:
 * - StateStore: SQLite-based durable storage with transaction support
 * - CheckpointManager: Save/restore task state at any point
 * - TaskRecovery: Resume tasks from last checkpoint after crash
 *
 * Features:
 * - Automatic checkpointing after each agent action
 * - Checkpoint pruning (configurable retention)
 * - State serialization/deserialization with compression
 * - Transaction support for atomic updates
 * - Heartbeat-based crash detection
 * - Multiple recovery strategies (resume, restart, skip)
 *
 * @example
 * ```typescript
 * import {
 *   createStateStore,
 *   createCheckpointManager,
 *   createTaskRecovery,
 *   TaskState
 * } from './persistence';
 *
 * // Create the persistence stack
 * const store = createStateStore({ dbPath: './data/persistence.db' });
 * const checkpointManager = createCheckpointManager({ store });
 * const taskRecovery = await createTaskRecovery({ checkpointManager, store });
 *
 * // Register heartbeat for a running task
 * taskRecovery.registerHeartbeat('task-123');
 *
 * // Create checkpoints during execution
 * const state: TaskState = {
 *   progress: 50,
 *   phase: 'processing',
 *   data: { result: 'partial' },
 *   agentState: {},
 *   messages: [],
 *   actions: [{ type: 'fetch', timestamp: new Date() }],
 *   errors: []
 * };
 *
 * await checkpointManager.createCheckpoint('task-123', state, {
 *   type: 'auto',
 *   actionType: 'fetch',
 *   actionIndex: 0
 * });
 *
 * // Or use auto-checkpoint after actions
 * await checkpointManager.autoCheckpoint('task-123', state, 'fetch', 0);
 *
 * // Create milestone checkpoints for important states
 * await checkpointManager.createMilestone('task-123', state, 'Data fetched');
 *
 * // Query checkpoints
 * const latest = await checkpointManager.getLatest('task-123');
 * const byTime = await checkpointManager.getByTimestamp('task-123', new Date());
 * const all = checkpointManager.listCheckpoints('task-123', { limit: 10 });
 *
 * // Recover from crash
 * const pendingRecoveries = taskRecovery.getPendingRecoveries();
 * for (const record of pendingRecoveries) {
 *   const result = await taskRecovery.recoverTask(record.taskId);
 *   console.log(`Recovery ${result.success ? 'succeeded' : 'failed'}: ${record.taskId}`);
 * }
 *
 * // Shutdown gracefully
 * await taskRecovery.shutdown();
 * ```
 */

// State Store - Durable SQLite storage
export {
  StateStore,
  createStateStore,
  type StoredState,
  type StateRecord,
  type StateMetadata,
  type StateStoreConfig,
  type QueryOptions,
  type TransactionResult,
} from './StateStore.js';

// Checkpoint Manager - Save/restore task state
export {
  CheckpointManager,
  createCheckpointManager,
  type TaskState,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointManagerConfig,
  type CheckpointManagerEvents,
} from './CheckpointManager.js';

// Task Recovery - Resume from crashes
export {
  TaskRecovery,
  createTaskRecovery,
  type RecoveryStatus,
  type RecoveryStrategy,
  type RecoveryRecord,
  type TaskHeartbeat,
  type TaskRecoveryConfig,
  type RecoveryResult,
  type TaskExecutor,
  type TaskRecoveryEvents,
} from './TaskRecovery.js';

// ============================================================================
// CONVENIENCE FACTORY
// ============================================================================

import { StateStore, StateStoreConfig } from './StateStore.js';
import { CheckpointManager, CheckpointManagerConfig } from './CheckpointManager.js';
import { TaskRecovery, TaskRecoveryConfig } from './TaskRecovery.js';

/**
 * Configuration for the complete persistence stack
 */
export interface PersistenceStackConfig {
  store?: Partial<StateStoreConfig>;
  checkpointManager?: Partial<CheckpointManagerConfig>;
  taskRecovery?: Partial<TaskRecoveryConfig>;
}

/**
 * Complete persistence stack with all components
 */
export interface PersistenceStack {
  store: StateStore;
  checkpointManager: CheckpointManager;
  taskRecovery: TaskRecovery;

  /** Shutdown all components gracefully */
  shutdown(): Promise<void>;
}

/**
 * Create a complete persistence stack with all components wired together
 *
 * @example
 * ```typescript
 * const persistence = await createPersistenceStack({
 *   store: { dbPath: './data/persistence.db' },
 *   checkpointManager: { maxCheckpointsPerTask: 100 },
 *   taskRecovery: { autoRecoverOnStartup: true }
 * });
 *
 * // Use the components
 * await persistence.checkpointManager.createCheckpoint(taskId, state);
 *
 * // Shutdown when done
 * await persistence.shutdown();
 * ```
 */
export async function createPersistenceStack(
  config?: PersistenceStackConfig
): Promise<PersistenceStack> {
  // Create store
  const store = new StateStore(config?.store);

  // Create checkpoint manager with shared store
  const checkpointManager = new CheckpointManager({
    ...config?.checkpointManager,
    store,
  });

  // Create task recovery with shared components
  const taskRecovery = new TaskRecovery({
    ...config?.taskRecovery,
    store,
    checkpointManager,
  });

  // Initialize recovery system
  await taskRecovery.initialize();

  return {
    store,
    checkpointManager,
    taskRecovery,

    async shutdown(): Promise<void> {
      await taskRecovery.shutdown();
      checkpointManager.close();
      store.close();
    },
  };
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

let defaultStack: PersistenceStack | null = null;

/**
 * Get or create the default persistence stack
 *
 * @example
 * ```typescript
 * const persistence = await getDefaultPersistenceStack();
 * await persistence.checkpointManager.createCheckpoint(taskId, state);
 * ```
 */
export async function getDefaultPersistenceStack(): Promise<PersistenceStack> {
  if (!defaultStack) {
    defaultStack = await createPersistenceStack();
  }
  return defaultStack;
}

/**
 * Shutdown the default persistence stack
 */
export async function shutdownDefaultPersistenceStack(): Promise<void> {
  if (defaultStack) {
    await defaultStack.shutdown();
    defaultStack = null;
  }
}
