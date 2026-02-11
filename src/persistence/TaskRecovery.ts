/**
 * Alabobai State Persistence - Task Recovery
 * Resume tasks from last checkpoint after crash or interruption
 *
 * Features:
 * - Automatic crash detection via heartbeat
 * - Graceful recovery from last known good state
 * - Recovery queue management
 * - Health monitoring and alerts
 * - Recovery strategies (resume, restart, skip)
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { CheckpointManager, TaskState, Checkpoint } from './CheckpointManager.js';
import { StateStore } from './StateStore.js';

// ============================================================================
// TYPES
// ============================================================================

/** Status of a recoverable task */
export type RecoveryStatus =
  | 'pending'        // Waiting to be recovered
  | 'recovering'     // Recovery in progress
  | 'recovered'      // Successfully recovered
  | 'failed'         // Recovery failed
  | 'skipped'        // User chose to skip
  | 'restarted';     // Task was restarted from beginning

/** Strategy for recovering a task */
export type RecoveryStrategy =
  | 'resume'         // Resume from last checkpoint
  | 'restart'        // Restart from beginning
  | 'skip'           // Skip this task
  | 'manual';        // Wait for manual intervention

/** Record of a task that needs recovery */
export interface RecoveryRecord {
  id: string;
  taskId: string;
  taskName?: string;
  lastCheckpointId: string;
  lastCheckpointTime: Date;
  crashedAt: Date;
  recoveryStatus: RecoveryStatus;
  recoveryAttempts: number;
  maxAttempts: number;
  strategy: RecoveryStrategy;
  error?: string;
  recoveredAt?: Date;
  recoveredState?: TaskState;
}

/** Information about a running task's health */
export interface TaskHeartbeat {
  taskId: string;
  lastBeat: Date;
  status: 'healthy' | 'stale' | 'dead';
  missedBeats: number;
}

/** Configuration for task recovery */
export interface TaskRecoveryConfig {
  /** Heartbeat interval in ms (default: 10000 = 10s) */
  heartbeatInterval: number;
  /** Number of missed heartbeats before marking task as dead (default: 3) */
  deadThreshold: number;
  /** Maximum recovery attempts per task (default: 3) */
  maxRecoveryAttempts: number;
  /** Default recovery strategy (default: 'resume') */
  defaultStrategy: RecoveryStrategy;
  /** Enable automatic recovery on startup (default: true) */
  autoRecoverOnStartup: boolean;
  /** Checkpoint manager to use */
  checkpointManager?: CheckpointManager;
  /** State store to use */
  store?: StateStore;
}

/** Result of a recovery operation */
export interface RecoveryResult {
  success: boolean;
  taskId: string;
  status: RecoveryStatus;
  checkpoint?: Checkpoint;
  state?: TaskState;
  error?: string;
}

/** Handler for executing recovered tasks */
export type TaskExecutor = (taskId: string, state: TaskState) => Promise<void>;

/** Events emitted by task recovery */
export interface TaskRecoveryEvents {
  'task-crashed': { taskId: string; lastCheckpointId: string };
  'recovery-started': { taskId: string; checkpointId: string };
  'recovery-completed': { taskId: string; status: RecoveryStatus };
  'recovery-failed': { taskId: string; error: string; attempts: number };
  'heartbeat-missed': { taskId: string; missedCount: number };
  'health-check': { healthy: number; stale: number; dead: number };
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
// TASK RECOVERY CLASS
// ============================================================================

export class TaskRecovery extends EventEmitter {
  private config: TaskRecoveryConfig;
  private checkpointManager: CheckpointManager;
  private store: StateStore;
  private logger: Logger;

  // Heartbeat tracking
  private heartbeats: Map<string, TaskHeartbeat> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Recovery queue
  private recoveryQueue: Map<string, RecoveryRecord> = new Map();
  private taskExecutors: Map<string, TaskExecutor> = new Map();

  // Shutdown handling
  private isShuttingDown: boolean = false;
  private activeRecoveries: Set<string> = new Set();

  constructor(config?: Partial<TaskRecoveryConfig>) {
    super();

    this.config = {
      heartbeatInterval: 10000,
      deadThreshold: 3,
      maxRecoveryAttempts: 3,
      defaultStrategy: 'resume',
      autoRecoverOnStartup: true,
      ...config,
    };

    this.store = config?.store || new StateStore();
    this.checkpointManager = config?.checkpointManager || new CheckpointManager({ store: this.store });
    this.logger = createLogger('TaskRecovery');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize task recovery and optionally recover pending tasks
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing TaskRecovery');

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();

    // Check for tasks that need recovery
    if (this.config.autoRecoverOnStartup) {
      await this.detectAndQueueCrashedTasks();
    }
  }

  /**
   * Detect tasks that crashed (have checkpoints but weren't completed)
   */
  private async detectAndQueueCrashedTasks(): Promise<void> {
    try {
      const activeTasks = this.store.getActiveTasks();

      for (const task of activeTasks) {
        // Check if task has a latest checkpoint
        const latest = await this.checkpointManager.getLatest(task.id);

        if (latest) {
          // Task has checkpoint but is still marked active - potential crash
          this.queueForRecovery(task.id, latest.id, {
            taskName: task.name || undefined,
            crashedAt: new Date(), // We don't know exact time, use now
          });
        }
      }

      if (this.recoveryQueue.size > 0) {
        this.logger.info('Found tasks requiring recovery', {
          count: this.recoveryQueue.size,
        });
      }
    } catch (error) {
      this.logger.error('Failed to detect crashed tasks', { error: String(error) });
    }
  }

  // ============================================================================
  // HEARTBEAT MONITORING
  // ============================================================================

  /**
   * Register a heartbeat for a running task
   */
  registerHeartbeat(taskId: string): void {
    const existing = this.heartbeats.get(taskId);

    this.heartbeats.set(taskId, {
      taskId,
      lastBeat: new Date(),
      status: 'healthy',
      missedBeats: 0,
    });

    if (!existing) {
      this.logger.debug('Task registered for heartbeat monitoring', { taskId });
    }
  }

  /**
   * Unregister heartbeat monitoring for a task (task completed normally)
   */
  unregisterHeartbeat(taskId: string): void {
    this.heartbeats.delete(taskId);
    this.logger.debug('Task unregistered from heartbeat monitoring', { taskId });
  }

  /**
   * Start the heartbeat monitoring loop
   */
  private startHeartbeatMonitoring(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatInterval);

    this.logger.debug('Heartbeat monitoring started', {
      interval: this.config.heartbeatInterval,
    });
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeatMonitoring(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.logger.debug('Heartbeat monitoring stopped');
    }
  }

  /**
   * Check all heartbeats and detect crashed tasks
   */
  private async checkHeartbeats(): Promise<void> {
    const now = Date.now();
    let healthy = 0;
    let stale = 0;
    let dead = 0;

    for (const [taskId, heartbeat] of Array.from(this.heartbeats.entries())) {
      const timeSinceLastBeat = now - heartbeat.lastBeat.getTime();
      const missedBeats = Math.floor(timeSinceLastBeat / this.config.heartbeatInterval);

      if (missedBeats === 0) {
        heartbeat.status = 'healthy';
        heartbeat.missedBeats = 0;
        healthy++;
      } else if (missedBeats < this.config.deadThreshold) {
        heartbeat.status = 'stale';
        heartbeat.missedBeats = missedBeats;
        stale++;
        this.emit('heartbeat-missed', { taskId, missedCount: missedBeats });
      } else {
        heartbeat.status = 'dead';
        heartbeat.missedBeats = missedBeats;
        dead++;

        // Task is dead, handle crash
        await this.handleTaskCrash(taskId);
      }
    }

    this.emit('health-check', { healthy, stale, dead });
  }

  /**
   * Handle a detected task crash
   */
  private async handleTaskCrash(taskId: string): Promise<void> {
    // Remove from heartbeat monitoring
    this.heartbeats.delete(taskId);

    // Get latest checkpoint
    const latest = await this.checkpointManager.getLatest(taskId);

    if (latest) {
      this.logger.warn('Task crash detected', { taskId, lastCheckpointId: latest.id });
      this.emit('task-crashed', { taskId, lastCheckpointId: latest.id });

      // Queue for recovery
      this.queueForRecovery(taskId, latest.id, {
        crashedAt: new Date(),
      });
    } else {
      this.logger.error('Task crashed with no checkpoints', { taskId });
    }
  }

  // ============================================================================
  // RECOVERY QUEUE MANAGEMENT
  // ============================================================================

  /**
   * Queue a task for recovery
   */
  queueForRecovery(
    taskId: string,
    lastCheckpointId: string,
    options: {
      taskName?: string;
      crashedAt?: Date;
      strategy?: RecoveryStrategy;
    } = {}
  ): RecoveryRecord {
    const record: RecoveryRecord = {
      id: uuid(),
      taskId,
      taskName: options.taskName,
      lastCheckpointId,
      lastCheckpointTime: new Date(), // Will be updated when we load the checkpoint
      crashedAt: options.crashedAt || new Date(),
      recoveryStatus: 'pending',
      recoveryAttempts: 0,
      maxAttempts: this.config.maxRecoveryAttempts,
      strategy: options.strategy || this.config.defaultStrategy,
    };

    this.recoveryQueue.set(taskId, record);
    this.logger.info('Task queued for recovery', {
      taskId,
      checkpointId: lastCheckpointId,
      strategy: record.strategy,
    });

    return record;
  }

  /**
   * Get all pending recovery records
   */
  getPendingRecoveries(): RecoveryRecord[] {
    return Array.from(this.recoveryQueue.values()).filter(
      r => r.recoveryStatus === 'pending'
    );
  }

  /**
   * Get a specific recovery record
   */
  getRecoveryRecord(taskId: string): RecoveryRecord | undefined {
    return this.recoveryQueue.get(taskId);
  }

  /**
   * Update recovery strategy for a task
   */
  setRecoveryStrategy(taskId: string, strategy: RecoveryStrategy): void {
    const record = this.recoveryQueue.get(taskId);
    if (record) {
      record.strategy = strategy;
      this.logger.info('Recovery strategy updated', { taskId, strategy });
    }
  }

  // ============================================================================
  // RECOVERY EXECUTION
  // ============================================================================

  /**
   * Register an executor for recovering a specific task type
   */
  registerTaskExecutor(taskId: string, executor: TaskExecutor): void {
    this.taskExecutors.set(taskId, executor);
  }

  /**
   * Register a default executor for all tasks
   */
  registerDefaultExecutor(executor: TaskExecutor): void {
    this.taskExecutors.set('__default__', executor);
  }

  /**
   * Recover a specific task
   */
  async recoverTask(taskId: string): Promise<RecoveryResult> {
    const record = this.recoveryQueue.get(taskId);

    if (!record) {
      return {
        success: false,
        taskId,
        status: 'failed',
        error: 'No recovery record found for task',
      };
    }

    if (record.recoveryStatus === 'recovering') {
      return {
        success: false,
        taskId,
        status: 'recovering',
        error: 'Recovery already in progress',
      };
    }

    // Check max attempts
    if (record.recoveryAttempts >= record.maxAttempts) {
      record.recoveryStatus = 'failed';
      record.error = 'Maximum recovery attempts exceeded';
      return {
        success: false,
        taskId,
        status: 'failed',
        error: record.error,
      };
    }

    // Update status
    record.recoveryStatus = 'recovering';
    record.recoveryAttempts++;
    this.activeRecoveries.add(taskId);

    this.emit('recovery-started', {
      taskId,
      checkpointId: record.lastCheckpointId,
    });

    this.logger.info('Starting task recovery', {
      taskId,
      attempt: record.recoveryAttempts,
      strategy: record.strategy,
    });

    try {
      let result: RecoveryResult;

      switch (record.strategy) {
        case 'resume':
          result = await this.executeResumeRecovery(record);
          break;
        case 'restart':
          result = await this.executeRestartRecovery(record);
          break;
        case 'skip':
          result = await this.executeSkipRecovery(record);
          break;
        case 'manual':
          result = {
            success: true,
            taskId,
            status: 'pending',
          };
          record.recoveryStatus = 'pending';
          break;
        default:
          result = await this.executeResumeRecovery(record);
      }

      this.emit('recovery-completed', { taskId, status: result.status });
      return result;
    } catch (error) {
      record.recoveryStatus = 'failed';
      record.error = String(error);

      this.emit('recovery-failed', {
        taskId,
        error: String(error),
        attempts: record.recoveryAttempts,
      });

      this.logger.error('Task recovery failed', {
        taskId,
        error: String(error),
        attempts: record.recoveryAttempts,
      });

      return {
        success: false,
        taskId,
        status: 'failed',
        error: String(error),
      };
    } finally {
      this.activeRecoveries.delete(taskId);
    }
  }

  /**
   * Execute resume recovery strategy
   */
  private async executeResumeRecovery(record: RecoveryRecord): Promise<RecoveryResult> {
    // Restore state from checkpoint
    const state = await this.checkpointManager.restoreCheckpoint(record.lastCheckpointId);
    const checkpoint = await this.checkpointManager.getLatest(record.taskId);

    // Get executor
    const executor =
      this.taskExecutors.get(record.taskId) ||
      this.taskExecutors.get('__default__');

    if (executor) {
      // Execute the task with recovered state
      await executor(record.taskId, state);
    }

    record.recoveryStatus = 'recovered';
    record.recoveredAt = new Date();
    record.recoveredState = state;

    this.logger.info('Task recovered via resume', { taskId: record.taskId });

    return {
      success: true,
      taskId: record.taskId,
      status: 'recovered',
      checkpoint: checkpoint || undefined,
      state,
    };
  }

  /**
   * Execute restart recovery strategy
   */
  private async executeRestartRecovery(record: RecoveryRecord): Promise<RecoveryResult> {
    // Clear existing checkpoints
    await this.checkpointManager.clearTask(record.taskId);

    // Create initial state
    const initialState: TaskState = {
      progress: 0,
      phase: 'initial',
      data: {},
      agentState: {},
      messages: [],
      actions: [],
      errors: [],
    };

    // Get executor
    const executor =
      this.taskExecutors.get(record.taskId) ||
      this.taskExecutors.get('__default__');

    if (executor) {
      // Execute the task from beginning
      await executor(record.taskId, initialState);
    }

    record.recoveryStatus = 'restarted';
    record.recoveredAt = new Date();
    record.recoveredState = initialState;

    this.logger.info('Task recovered via restart', { taskId: record.taskId });

    return {
      success: true,
      taskId: record.taskId,
      status: 'restarted',
      state: initialState,
    };
  }

  /**
   * Execute skip recovery strategy
   */
  private async executeSkipRecovery(record: RecoveryRecord): Promise<RecoveryResult> {
    // Mark task as completed/skipped
    this.store.markTaskCompleted(record.taskId);

    record.recoveryStatus = 'skipped';
    record.recoveredAt = new Date();

    this.logger.info('Task skipped', { taskId: record.taskId });

    return {
      success: true,
      taskId: record.taskId,
      status: 'skipped',
    };
  }

  /**
   * Recover all pending tasks
   */
  async recoverAllPending(): Promise<RecoveryResult[]> {
    const pending = this.getPendingRecoveries();
    const results: RecoveryResult[] = [];

    for (const record of pending) {
      const result = await this.recoverTask(record.taskId);
      results.push(result);
    }

    return results;
  }

  // ============================================================================
  // MANUAL INTERVENTION
  // ============================================================================

  /**
   * Manually resolve a recovery with provided state
   */
  async manualResolve(taskId: string, state: TaskState): Promise<RecoveryResult> {
    const record = this.recoveryQueue.get(taskId);

    if (!record) {
      return {
        success: false,
        taskId,
        status: 'failed',
        error: 'No recovery record found',
      };
    }

    // Create a new checkpoint with the provided state
    const checkpoint = await this.checkpointManager.createCheckpoint(taskId, state, {
      type: 'manual',
      label: 'Manual recovery',
      triggerReason: 'manual',
      force: true,
    });

    record.recoveryStatus = 'recovered';
    record.recoveredAt = new Date();
    record.recoveredState = state;

    this.logger.info('Task manually resolved', { taskId });

    return {
      success: true,
      taskId,
      status: 'recovered',
      checkpoint,
      state,
    };
  }

  /**
   * Dismiss a recovery record (user acknowledges but doesn't want recovery)
   */
  dismissRecovery(taskId: string): void {
    const record = this.recoveryQueue.get(taskId);
    if (record) {
      record.recoveryStatus = 'skipped';
      record.recoveredAt = new Date();
      this.logger.info('Recovery dismissed', { taskId });
    }
  }

  // ============================================================================
  // STATE INSPECTION
  // ============================================================================

  /**
   * Preview the state that would be recovered
   */
  async previewRecoveryState(taskId: string): Promise<TaskState | null> {
    const record = this.recoveryQueue.get(taskId);
    if (!record) return null;

    try {
      return await this.checkpointManager.restoreCheckpoint(record.lastCheckpointId);
    } catch (error) {
      this.logger.error('Failed to preview recovery state', {
        taskId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Get the recovery checkpoint
   */
  async getRecoveryCheckpoint(taskId: string): Promise<Checkpoint | null> {
    const record = this.recoveryQueue.get(taskId);
    if (!record) return null;

    return this.checkpointManager.getLatest(taskId);
  }

  // ============================================================================
  // HEALTH STATUS
  // ============================================================================

  /**
   * Get overall health status
   */
  getHealthStatus(): {
    monitored: number;
    healthy: number;
    stale: number;
    dead: number;
    pendingRecoveries: number;
    activeRecoveries: number;
  } {
    let healthy = 0;
    let stale = 0;
    let dead = 0;

    for (const heartbeat of Array.from(this.heartbeats.values())) {
      switch (heartbeat.status) {
        case 'healthy':
          healthy++;
          break;
        case 'stale':
          stale++;
          break;
        case 'dead':
          dead++;
          break;
      }
    }

    return {
      monitored: this.heartbeats.size,
      healthy,
      stale,
      dead,
      pendingRecoveries: this.getPendingRecoveries().length,
      activeRecoveries: this.activeRecoveries.size,
    };
  }

  /**
   * Get heartbeat status for a specific task
   */
  getTaskHealth(taskId: string): TaskHeartbeat | null {
    return this.heartbeats.get(taskId) || null;
  }

  // ============================================================================
  // SHUTDOWN
  // ============================================================================

  /**
   * Graceful shutdown - wait for active recoveries
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('TaskRecovery shutting down');

    // Stop heartbeat monitoring
    this.stopHeartbeatMonitoring();

    // Wait for active recoveries to complete
    if (this.activeRecoveries.size > 0) {
      this.logger.info('Waiting for active recoveries', {
        count: this.activeRecoveries.size,
      });

      const startTime = Date.now();
      while (this.activeRecoveries.size > 0 && Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.activeRecoveries.size > 0) {
        this.logger.warn('Shutdown timeout, active recoveries abandoned', {
          remaining: this.activeRecoveries.size,
        });
      }
    }

    // Close checkpoint manager
    this.checkpointManager.close();

    this.logger.info('TaskRecovery shutdown complete');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export async function createTaskRecovery(
  config?: Partial<TaskRecoveryConfig>
): Promise<TaskRecovery> {
  const recovery = new TaskRecovery(config);
  await recovery.initialize();
  return recovery;
}
