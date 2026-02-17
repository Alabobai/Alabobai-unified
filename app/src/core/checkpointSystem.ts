/**
 * Alabobai Checkpoint & Retry System
 *
 * A comprehensive system for managing task state persistence, recovery, and retry logic.
 * Provides git-like checkpoint management with parent references, compression, and diff support.
 *
 * Features:
 * - Save and restore complete task state at each step
 * - Unique checkpoint IDs with parent references (like git commits)
 * - IndexedDB persistence with optional compression
 * - Configurable retry strategies (exponential backoff, linear, immediate)
 * - Circuit breaker pattern for failing tasks
 * - Auto-resume interrupted tasks on app restart
 * - Event emitter for checkpoint lifecycle events
 * - Integration wrappers for async operations
 *
 * @module checkpointSystem
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Error types that can occur during task execution
 */
export type ErrorType = 'network' | 'logic' | 'timeout' | 'validation' | 'permission' | 'unknown'

/**
 * Retry strategy types
 */
export type RetryStrategy = 'exponential' | 'linear' | 'immediate' | 'custom'

/**
 * Checkpoint status
 */
export type CheckpointStatus = 'created' | 'active' | 'completed' | 'failed' | 'abandoned'

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Checkpoint event types
 */
export type CheckpointEventType =
  | 'checkpoint:created'
  | 'checkpoint:restored'
  | 'checkpoint:deleted'
  | 'checkpoint:compressed'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:resumed'
  | 'task:paused'
  | 'step:started'
  | 'step:completed'
  | 'step:failed'
  | 'step:retrying'
  | 'circuit:opened'
  | 'circuit:closed'
  | 'circuit:half-open'

/**
 * Metadata about checkpoint timing and context
 */
export interface CheckpointMetadata {
  /** When the checkpoint was created */
  createdAt: number
  /** When the checkpoint was last updated */
  updatedAt: number
  /** Duration of the step that led to this checkpoint (ms) */
  stepDuration: number
  /** Total elapsed time from task start to this checkpoint */
  totalElapsed: number
  /** Error information if the step failed */
  error?: {
    type: ErrorType
    message: string
    stack?: string
    code?: string
  }
  /** Number of retries attempted for this step */
  retryCount: number
  /** Whether this checkpoint was created after a retry */
  isRetryResult: boolean
  /** Custom tags for filtering/searching */
  tags: string[]
  /** Arbitrary metadata from the user */
  custom: Record<string, unknown>
}

/**
 * Individual step checkpoint - captures state after a single step
 */
export interface StepCheckpoint<TInput = unknown, TOutput = unknown, TContext = unknown> {
  /** Unique checkpoint ID */
  id: string
  /** Parent checkpoint ID (like git parent commit) */
  parentId: string | null
  /** Task ID this checkpoint belongs to */
  taskId: string
  /** Step number (0-indexed) */
  stepIndex: number
  /** Step name/identifier */
  stepName: string
  /** Input data for this step */
  input: TInput
  /** Output data from this step (null if failed) */
  output: TOutput | null
  /** Context/state passed between steps */
  context: TContext
  /** Status of this checkpoint */
  status: CheckpointStatus
  /** Metadata about timing and errors */
  metadata: CheckpointMetadata
  /** Whether the state is compressed */
  isCompressed: boolean
  /** Checksum for integrity verification */
  checksum: string
}

/**
 * Full task checkpoint - captures entire task state
 */
export interface TaskCheckpoint<TContext = unknown> {
  /** Unique task ID */
  id: string
  /** Human-readable task name */
  name: string
  /** Task description */
  description?: string
  /** Current task status */
  status: TaskStatus
  /** Index of the current/last completed step */
  currentStepIndex: number
  /** Total number of steps in the task */
  totalSteps: number
  /** All step checkpoints for this task */
  stepCheckpoints: string[] // Array of checkpoint IDs
  /** Global task context */
  context: TContext
  /** When the task was created */
  createdAt: number
  /** When the task was last updated */
  updatedAt: number
  /** When the task started executing */
  startedAt: number | null
  /** When the task completed (success or failure) */
  completedAt: number | null
  /** Total retry count across all steps */
  totalRetries: number
  /** Whether this task was resumed from a checkpoint */
  wasResumed: boolean
  /** ID of the checkpoint this task was resumed from */
  resumedFromCheckpointId: string | null
  /** Custom metadata */
  metadata: Record<string, unknown>
}

/**
 * Retry configuration for a specific error type
 */
export interface RetryConfig {
  /** Retry strategy to use */
  strategy: RetryStrategy
  /** Maximum number of retry attempts */
  maxAttempts: number
  /** Base delay in milliseconds */
  baseDelay: number
  /** Maximum delay in milliseconds */
  maxDelay: number
  /** Multiplier for exponential backoff */
  multiplier: number
  /** Jitter factor (0-1) for randomizing delays */
  jitter: number
  /** Custom delay function for 'custom' strategy */
  customDelayFn?: (attempt: number, baseDelay: number) => number
}

/**
 * Retry policy mapping error types to retry configurations
 */
export interface RetryPolicy {
  /** Default retry config for unspecified error types */
  default: RetryConfig
  /** Specific configs for each error type */
  network?: RetryConfig
  logic?: RetryConfig
  timeout?: RetryConfig
  validation?: RetryConfig
  permission?: RetryConfig
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number
  /** Number of successes in half-open state to close the circuit */
  successThreshold: number
  /** Time to wait before transitioning from open to half-open (ms) */
  resetTimeout: number
  /** Maximum requests allowed in half-open state */
  halfOpenMaxRequests: number
  /** Time window for counting failures (ms) */
  failureWindow: number
}

/**
 * Circuit breaker state tracking
 */
export interface CircuitBreakerState {
  /** Current state of the circuit */
  state: CircuitState
  /** Number of failures in the current window */
  failures: number
  /** Number of successes in half-open state */
  successes: number
  /** Timestamp when the circuit was last opened */
  openedAt: number | null
  /** Timestamp of the last failure */
  lastFailureAt: number | null
  /** Requests made in half-open state */
  halfOpenRequests: number
  /** Failure timestamps for windowed counting */
  failureTimestamps: number[]
}

/**
 * Checkpoint event data
 */
export interface CheckpointEvent<T = unknown> {
  /** Event type */
  type: CheckpointEventType
  /** Timestamp of the event */
  timestamp: number
  /** Task ID related to the event */
  taskId: string
  /** Checkpoint ID (if applicable) */
  checkpointId?: string
  /** Step index (if applicable) */
  stepIndex?: number
  /** Event-specific data */
  data: T
}

/**
 * Event handler type
 */
export type CheckpointEventHandler<T = unknown> = (event: CheckpointEvent<T>) => void

/**
 * Options for wrapping an async operation with checkpoint support
 */
export interface CheckpointWrapperOptions<TInput, TOutput, TContext> {
  /** Task ID */
  taskId: string
  /** Step name */
  stepName: string
  /** Step index */
  stepIndex: number
  /** Input to the operation */
  input: TInput
  /** Current context */
  context: TContext
  /** Retry policy to use */
  retryPolicy?: RetryPolicy
  /** Whether to save checkpoint on success */
  saveOnSuccess?: boolean
  /** Whether to save checkpoint on failure */
  saveOnFailure?: boolean
  /** Transform output before saving */
  transformOutput?: (output: TOutput) => TOutput
  /** Custom error classifier */
  classifyError?: (error: Error) => ErrorType
  /** Tags for the checkpoint */
  tags?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Result of a wrapped operation
 */
export interface WrappedOperationResult<TOutput> {
  /** Whether the operation succeeded */
  success: boolean
  /** Output if successful */
  output?: TOutput
  /** Error if failed */
  error?: Error
  /** Error type if failed */
  errorType?: ErrorType
  /** Number of retries attempted */
  retries: number
  /** Total duration including retries (ms) */
  duration: number
  /** Checkpoint ID created */
  checkpointId: string
  /** Whether the circuit breaker tripped */
  circuitBreakerTripped: boolean
}

/**
 * Diff between two checkpoints
 */
export interface CheckpointDiff {
  /** First checkpoint ID */
  fromCheckpointId: string
  /** Second checkpoint ID */
  toCheckpointId: string
  /** Changes to input */
  inputChanges: DiffChange[]
  /** Changes to output */
  outputChanges: DiffChange[]
  /** Changes to context */
  contextChanges: DiffChange[]
  /** Time difference (ms) */
  timeDelta: number
  /** Steps between checkpoints */
  stepDelta: number
}

/**
 * A single change in a diff
 */
export interface DiffChange {
  /** Path to the changed value (dot-notation) */
  path: string
  /** Type of change */
  type: 'added' | 'removed' | 'modified'
  /** Old value (for modified/removed) */
  oldValue?: unknown
  /** New value (for modified/added) */
  newValue?: unknown
}

/**
 * Progress information for UI hooks
 */
export interface CheckpointProgress {
  /** Task ID */
  taskId: string
  /** Task name */
  taskName: string
  /** Current step index */
  currentStep: number
  /** Total steps */
  totalSteps: number
  /** Progress percentage (0-100) */
  percentage: number
  /** Current step name */
  currentStepName: string
  /** Status */
  status: TaskStatus
  /** Time elapsed (ms) */
  elapsed: number
  /** Estimated time remaining (ms) */
  estimatedRemaining: number | null
  /** Current retry count for this step */
  retryCount: number
  /** Circuit breaker state */
  circuitState: CircuitState
  /** Last error message */
  lastError?: string
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID for checkpoints
 */
function generateCheckpointId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `ckpt_${timestamp}_${random}`
}

/**
 * Generate a unique ID for tasks
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `task_${timestamp}_${random}`
}

/**
 * Calculate a simple checksum for data integrity
 */
function calculateChecksum(data: unknown): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Compress data using a simple LZ-style compression
 * In production, you might want to use a proper compression library
 */
function compressData(data: string): string {
  // Simple run-length encoding for demonstration
  // In production, use pako or similar for gzip compression
  try {
    return btoa(encodeURIComponent(data))
  } catch {
    return data
  }
}

/**
 * Decompress data
 */
function decompressData(data: string): string {
  try {
    return decodeURIComponent(atob(data))
  } catch {
    return data
  }
}

/**
 * Calculate delay based on retry strategy
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  let delay: number

  switch (config.strategy) {
    case 'exponential':
      delay = Math.min(
        config.baseDelay * Math.pow(config.multiplier, attempt),
        config.maxDelay
      )
      break
    case 'linear':
      delay = Math.min(
        config.baseDelay * (attempt + 1),
        config.maxDelay
      )
      break
    case 'immediate':
      delay = 0
      break
    case 'custom':
      delay = config.customDelayFn?.(attempt, config.baseDelay) ?? config.baseDelay
      break
    default:
      delay = config.baseDelay
  }

  // Apply jitter
  if (config.jitter > 0) {
    const jitterAmount = delay * config.jitter * (Math.random() * 2 - 1)
    delay = Math.max(0, delay + jitterAmount)
  }

  return Math.round(delay)
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Classify an error based on its characteristics
 */
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('cors') ||
    name.includes('networkerror') ||
    name.includes('aborterror')
  ) {
    return 'network'
  }

  // Timeout errors
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    name.includes('timeouterror')
  ) {
    return 'timeout'
  }

  // Validation errors
  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('schema') ||
    message.includes('type')
  ) {
    return 'validation'
  }

  // Permission errors
  if (
    message.includes('permission') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('403') ||
    message.includes('401')
  ) {
    return 'permission'
  }

  // Logic errors (usually not retryable)
  if (
    message.includes('reference') ||
    message.includes('undefined') ||
    message.includes('null') ||
    name.includes('typeerror') ||
    name.includes('referenceerror')
  ) {
    return 'logic'
  }

  return 'unknown'
}

/**
 * Deep diff between two objects
 */
function deepDiff(
  oldObj: unknown,
  newObj: unknown,
  path: string = ''
): DiffChange[] {
  const changes: DiffChange[] = []

  if (oldObj === newObj) {
    return changes
  }

  if (typeof oldObj !== typeof newObj) {
    changes.push({
      path: path || '.',
      type: 'modified',
      oldValue: oldObj,
      newValue: newObj
    })
    return changes
  }

  if (oldObj === null || newObj === null) {
    if (oldObj !== newObj) {
      changes.push({
        path: path || '.',
        type: oldObj === null ? 'added' : 'removed',
        oldValue: oldObj,
        newValue: newObj
      })
    }
    return changes
  }

  if (typeof oldObj !== 'object') {
    if (oldObj !== newObj) {
      changes.push({
        path: path || '.',
        type: 'modified',
        oldValue: oldObj,
        newValue: newObj
      })
    }
    return changes
  }

  const oldKeys = Object.keys(oldObj as Record<string, unknown>)
  const newKeys = Object.keys(newObj as Record<string, unknown>)
  const allKeys = Array.from(new Set([...oldKeys, ...newKeys]))

  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key
    const oldValue = (oldObj as Record<string, unknown>)[key]
    const newValue = (newObj as Record<string, unknown>)[key]

    if (!(key in (oldObj as Record<string, unknown>))) {
      changes.push({ path: newPath, type: 'added', newValue })
    } else if (!(key in (newObj as Record<string, unknown>))) {
      changes.push({ path: newPath, type: 'removed', oldValue })
    } else {
      changes.push(...deepDiff(oldValue, newValue, newPath))
    }
  }

  return changes
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  jitter: 0.2
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  default: DEFAULT_RETRY_CONFIG,
  network: {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 5,
    baseDelay: 500
  },
  timeout: {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 3,
    baseDelay: 2000
  },
  logic: {
    strategy: 'immediate',
    maxAttempts: 0, // Don't retry logic errors
    baseDelay: 0,
    maxDelay: 0,
    multiplier: 1,
    jitter: 0
  },
  validation: {
    strategy: 'immediate',
    maxAttempts: 0, // Don't retry validation errors
    baseDelay: 0,
    maxDelay: 0,
    multiplier: 1,
    jitter: 0
  },
  permission: {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 1, // One retry for permission errors (token refresh)
    baseDelay: 1000
  }
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 30000,
  halfOpenMaxRequests: 3,
  failureWindow: 60000
}

// ============================================================================
// IndexedDB Storage
// ============================================================================

const DB_NAME = 'alabobai_checkpoints'
const DB_VERSION = 1
const CHECKPOINT_STORE = 'checkpoints'
const TASK_STORE = 'tasks'
const METADATA_STORE = 'metadata'

/**
 * Initialize IndexedDB for checkpoint storage
 */
async function initDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Checkpoints store with indexes
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        const checkpointStore = db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'id' })
        checkpointStore.createIndex('taskId', 'taskId', { unique: false })
        checkpointStore.createIndex('stepIndex', 'stepIndex', { unique: false })
        checkpointStore.createIndex('status', 'status', { unique: false })
        checkpointStore.createIndex('createdAt', 'metadata.createdAt', { unique: false })
      }

      // Tasks store with indexes
      if (!db.objectStoreNames.contains(TASK_STORE)) {
        const taskStore = db.createObjectStore(TASK_STORE, { keyPath: 'id' })
        taskStore.createIndex('status', 'status', { unique: false })
        taskStore.createIndex('createdAt', 'createdAt', { unique: false })
        taskStore.createIndex('name', 'name', { unique: false })
      }

      // Metadata store for system state
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' })
      }
    }
  })
}

// ============================================================================
// Checkpoint Manager Class
// ============================================================================

/**
 * Checkpoint Manager
 *
 * Manages the lifecycle of checkpoints including creation, storage,
 * retrieval, compression, and deletion.
 */
export class CheckpointManager {
  private db: IDBDatabase | null = null
  private initialized: boolean = false
  private compressionThreshold: number = 10000 // Compress states larger than 10KB
  private eventListeners: Map<CheckpointEventType, Set<CheckpointEventHandler>> = new Map()
  private allEventListeners: Set<CheckpointEventHandler> = new Set()

  /**
   * Initialize the checkpoint manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      this.db = await initDatabase()
      this.initialized = true
      console.log('[CheckpointManager] Initialized successfully')
    } catch (error) {
      console.error('[CheckpointManager] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Create a new step checkpoint
   */
  async createStepCheckpoint<TInput, TOutput, TContext>(
    taskId: string,
    stepIndex: number,
    stepName: string,
    input: TInput,
    output: TOutput | null,
    context: TContext,
    options: {
      parentId?: string | null
      status?: CheckpointStatus
      error?: { type: ErrorType; message: string; stack?: string; code?: string }
      retryCount?: number
      isRetryResult?: boolean
      stepDuration?: number
      taskStartTime?: number
      tags?: string[]
      custom?: Record<string, unknown>
    } = {}
  ): Promise<StepCheckpoint<TInput, TOutput, TContext>> {
    await this.ensureInitialized()

    const now = Date.now()
    const checkpointId = generateCheckpointId()

    // Determine if compression is needed
    const stateSize = JSON.stringify({ input, output, context }).length
    const shouldCompress = stateSize > this.compressionThreshold

    // Prepare the state data
    let storedInput = input
    let storedOutput = output
    let storedContext = context

    if (shouldCompress) {
      storedInput = compressData(JSON.stringify(input)) as unknown as TInput
      storedOutput = output !== null ? compressData(JSON.stringify(output)) as unknown as TOutput : null
      storedContext = compressData(JSON.stringify(context)) as unknown as TContext
    }

    const checkpoint: StepCheckpoint<TInput, TOutput, TContext> = {
      id: checkpointId,
      parentId: options.parentId ?? null,
      taskId,
      stepIndex,
      stepName,
      input: storedInput,
      output: storedOutput,
      context: storedContext,
      status: options.status ?? 'created',
      isCompressed: shouldCompress,
      checksum: calculateChecksum({ input, output, context }),
      metadata: {
        createdAt: now,
        updatedAt: now,
        stepDuration: options.stepDuration ?? 0,
        totalElapsed: options.taskStartTime ? now - options.taskStartTime : 0,
        error: options.error,
        retryCount: options.retryCount ?? 0,
        isRetryResult: options.isRetryResult ?? false,
        tags: options.tags ?? [],
        custom: options.custom ?? {}
      }
    }

    // Store in IndexedDB
    await this.storeCheckpoint(checkpoint)

    // Emit event
    this.emitEvent({
      type: 'checkpoint:created',
      timestamp: now,
      taskId,
      checkpointId,
      stepIndex,
      data: { stepName, status: checkpoint.status, isCompressed: shouldCompress }
    })

    if (shouldCompress) {
      this.emitEvent({
        type: 'checkpoint:compressed',
        timestamp: now,
        taskId,
        checkpointId,
        stepIndex,
        data: { originalSize: stateSize }
      })
    }

    return checkpoint
  }

  /**
   * Get a step checkpoint by ID
   */
  async getStepCheckpoint<TInput = unknown, TOutput = unknown, TContext = unknown>(
    checkpointId: string
  ): Promise<StepCheckpoint<TInput, TOutput, TContext> | null> {
    await this.ensureInitialized()

    const checkpoint = await this.retrieveCheckpoint<StepCheckpoint<TInput, TOutput, TContext>>(checkpointId)

    if (!checkpoint) return null

    // Decompress if needed
    if (checkpoint.isCompressed) {
      return {
        ...checkpoint,
        input: JSON.parse(decompressData(checkpoint.input as unknown as string)) as TInput,
        output: checkpoint.output !== null
          ? JSON.parse(decompressData(checkpoint.output as unknown as string)) as TOutput
          : null,
        context: JSON.parse(decompressData(checkpoint.context as unknown as string)) as TContext
      }
    }

    return checkpoint
  }

  /**
   * Create a new task checkpoint
   */
  async createTaskCheckpoint<TContext>(
    name: string,
    totalSteps: number,
    context: TContext,
    options: {
      description?: string
      metadata?: Record<string, unknown>
    } = {}
  ): Promise<TaskCheckpoint<TContext>> {
    await this.ensureInitialized()

    const now = Date.now()
    const taskId = generateTaskId()

    const task: TaskCheckpoint<TContext> = {
      id: taskId,
      name,
      description: options.description,
      status: 'pending',
      currentStepIndex: -1,
      totalSteps,
      stepCheckpoints: [],
      context,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      totalRetries: 0,
      wasResumed: false,
      resumedFromCheckpointId: null,
      metadata: options.metadata ?? {}
    }

    await this.storeTask(task)

    this.emitEvent({
      type: 'task:started',
      timestamp: now,
      taskId,
      data: { name, totalSteps }
    })

    return task
  }

  /**
   * Get a task checkpoint by ID
   */
  async getTaskCheckpoint<TContext = unknown>(
    taskId: string
  ): Promise<TaskCheckpoint<TContext> | null> {
    await this.ensureInitialized()
    return this.retrieveTask<TContext>(taskId)
  }

  /**
   * Update a task checkpoint
   */
  async updateTaskCheckpoint<TContext>(
    taskId: string,
    updates: Partial<Omit<TaskCheckpoint<TContext>, 'id' | 'createdAt'>>
  ): Promise<TaskCheckpoint<TContext> | null> {
    await this.ensureInitialized()

    const task = await this.getTaskCheckpoint<TContext>(taskId)
    if (!task) return null

    const updatedTask: TaskCheckpoint<TContext> = {
      ...task,
      ...updates,
      updatedAt: Date.now()
    }

    await this.storeTask(updatedTask)

    return updatedTask
  }

  /**
   * Add a step checkpoint to a task
   */
  async addStepToTask(taskId: string, checkpointId: string): Promise<void> {
    await this.ensureInitialized()

    const task = await this.getTaskCheckpoint(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.stepCheckpoints.push(checkpointId)
    task.updatedAt = Date.now()

    await this.storeTask(task)
  }

  /**
   * List all checkpoints for a task
   */
  async listCheckpointsForTask<TInput = unknown, TOutput = unknown, TContext = unknown>(
    taskId: string
  ): Promise<StepCheckpoint<TInput, TOutput, TContext>[]> {
    await this.ensureInitialized()

    const task = await this.getTaskCheckpoint(taskId)
    if (!task) return []

    const checkpoints: StepCheckpoint<TInput, TOutput, TContext>[] = []
    for (const checkpointId of task.stepCheckpoints) {
      const checkpoint = await this.getStepCheckpoint<TInput, TOutput, TContext>(checkpointId)
      if (checkpoint) {
        checkpoints.push(checkpoint)
      }
    }

    return checkpoints.sort((a, b) => a.stepIndex - b.stepIndex)
  }

  /**
   * Get the latest checkpoint for a task
   */
  async getLatestCheckpoint<TInput = unknown, TOutput = unknown, TContext = unknown>(
    taskId: string
  ): Promise<StepCheckpoint<TInput, TOutput, TContext> | null> {
    const checkpoints = await this.listCheckpointsForTask<TInput, TOutput, TContext>(taskId)
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null
  }

  /**
   * Calculate diff between two checkpoints
   */
  async diffCheckpoints(
    fromCheckpointId: string,
    toCheckpointId: string
  ): Promise<CheckpointDiff | null> {
    const fromCheckpoint = await this.getStepCheckpoint(fromCheckpointId)
    const toCheckpoint = await this.getStepCheckpoint(toCheckpointId)

    if (!fromCheckpoint || !toCheckpoint) {
      return null
    }

    return {
      fromCheckpointId,
      toCheckpointId,
      inputChanges: deepDiff(fromCheckpoint.input, toCheckpoint.input),
      outputChanges: deepDiff(fromCheckpoint.output, toCheckpoint.output),
      contextChanges: deepDiff(fromCheckpoint.context, toCheckpoint.context),
      timeDelta: toCheckpoint.metadata.createdAt - fromCheckpoint.metadata.createdAt,
      stepDelta: toCheckpoint.stepIndex - fromCheckpoint.stepIndex
    }
  }

  /**
   * List all interrupted (resumable) tasks
   */
  async listInterruptedTasks(): Promise<TaskCheckpoint[]> {
    await this.ensureInitialized()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(TASK_STORE, 'readonly')
      const store = transaction.objectStore(TASK_STORE)
      const index = store.index('status')

      const tasks: TaskCheckpoint[] = []

      // Get running tasks
      const runningRequest = index.openCursor(IDBKeyRange.only('running'))
      runningRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          tasks.push(cursor.value)
          cursor.continue()
        }
      }

      // Get paused tasks
      const pausedRequest = index.openCursor(IDBKeyRange.only('paused'))
      pausedRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          tasks.push(cursor.value)
          cursor.continue()
        }
      }

      transaction.oncomplete = () => {
        resolve(tasks)
      }

      transaction.onerror = () => {
        reject(new Error(`Failed to list interrupted tasks: ${transaction.error?.message}`))
      }
    })
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.ensureInitialized()

    const checkpoint = await this.getStepCheckpoint(checkpointId)
    if (!checkpoint) return

    await new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(CHECKPOINT_STORE, 'readwrite')
      const store = transaction.objectStore(CHECKPOINT_STORE)
      const request = store.delete(checkpointId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to delete checkpoint: ${request.error?.message}`))
    })

    this.emitEvent({
      type: 'checkpoint:deleted',
      timestamp: Date.now(),
      taskId: checkpoint.taskId,
      checkpointId,
      stepIndex: checkpoint.stepIndex,
      data: {}
    })
  }

  /**
   * Delete a task and all its checkpoints
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.ensureInitialized()

    const task = await this.getTaskCheckpoint(taskId)
    if (!task) return

    // Delete all checkpoints
    for (const checkpointId of task.stepCheckpoints) {
      await this.deleteCheckpoint(checkpointId)
    }

    // Delete the task
    await new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(TASK_STORE, 'readwrite')
      const store = transaction.objectStore(TASK_STORE)
      const request = store.delete(taskId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to delete task: ${request.error?.message}`))
    })
  }

  /**
   * Clean up old checkpoints (garbage collection)
   */
  async cleanupOldCheckpoints(options: {
    maxAge?: number // Maximum age in ms
    maxCount?: number // Maximum number of checkpoints per task
    keepCompleted?: boolean // Keep completed task checkpoints
  } = {}): Promise<number> {
    await this.ensureInitialized()

    const maxAge = options.maxAge ?? 7 * 24 * 60 * 60 * 1000 // 7 days default
    const now = Date.now()
    let deletedCount = 0

    const tasks = await this.listAllTasks()

    for (const task of tasks) {
      // Skip completed tasks if requested
      if (options.keepCompleted && task.status === 'completed') {
        continue
      }

      // Check age
      if (now - task.createdAt > maxAge) {
        await this.deleteTask(task.id)
        deletedCount++
        continue
      }

      // Check checkpoint count
      if (options.maxCount && task.stepCheckpoints.length > options.maxCount) {
        const toDelete = task.stepCheckpoints.slice(0, task.stepCheckpoints.length - options.maxCount)
        for (const checkpointId of toDelete) {
          await this.deleteCheckpoint(checkpointId)
          deletedCount++
        }

        // Update task
        task.stepCheckpoints = task.stepCheckpoints.slice(-options.maxCount)
        await this.storeTask(task)
      }
    }

    return deletedCount
  }

  /**
   * Set compression threshold
   */
  setCompressionThreshold(bytes: number): void {
    this.compressionThreshold = bytes
  }

  /**
   * Add event listener
   */
  addEventListener(type: CheckpointEventType | '*', handler: CheckpointEventHandler): () => void {
    if (type === '*') {
      this.allEventListeners.add(handler)
      return () => this.allEventListeners.delete(handler)
    }

    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set())
    }
    this.eventListeners.get(type)!.add(handler)
    return () => this.eventListeners.get(type)?.delete(handler)
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: CheckpointEventType | '*', handler: CheckpointEventHandler): void {
    if (type === '*') {
      this.allEventListeners.delete(handler)
    } else {
      this.eventListeners.get(type)?.delete(handler)
    }
  }

  // ===== Private Methods =====

  private emitEvent(event: CheckpointEvent): void {
    // Notify type-specific listeners
    const listeners = this.eventListeners.get(event.type)
    if (listeners) {
      Array.from(listeners).forEach(handler => {
        try {
          handler(event)
        } catch (e) {
          console.error('[CheckpointManager] Event handler error:', e)
        }
      })
    }

    // Notify all-event listeners
    Array.from(this.allEventListeners).forEach(handler => {
      try {
        handler(event)
      } catch (e) {
        console.error('[CheckpointManager] Event handler error:', e)
      }
    })
  }

  private async storeCheckpoint(checkpoint: StepCheckpoint): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(CHECKPOINT_STORE, 'readwrite')
      const store = transaction.objectStore(CHECKPOINT_STORE)
      const request = store.put(checkpoint)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to store checkpoint: ${request.error?.message}`))
    })
  }

  private async retrieveCheckpoint<T>(id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(CHECKPOINT_STORE, 'readonly')
      const store = transaction.objectStore(CHECKPOINT_STORE)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error(`Failed to retrieve checkpoint: ${request.error?.message}`))
    })
  }

  private async storeTask(task: TaskCheckpoint): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(TASK_STORE, 'readwrite')
      const store = transaction.objectStore(TASK_STORE)
      const request = store.put(task)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to store task: ${request.error?.message}`))
    })
  }

  private async retrieveTask<TContext>(id: string): Promise<TaskCheckpoint<TContext> | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(TASK_STORE, 'readonly')
      const store = transaction.objectStore(TASK_STORE)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error(`Failed to retrieve task: ${request.error?.message}`))
    })
  }

  private async listAllTasks(): Promise<TaskCheckpoint[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction(TASK_STORE, 'readonly')
      const store = transaction.objectStore(TASK_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(new Error(`Failed to list tasks: ${request.error?.message}`))
    })
  }
}

// ============================================================================
// Retry Manager Class
// ============================================================================

/**
 * Retry Manager
 *
 * Handles retry logic with configurable strategies and circuit breaker pattern.
 */
export class RetryManager {
  private policy: RetryPolicy
  private circuitBreakerConfig: CircuitBreakerConfig
  private circuitBreakerStates: Map<string, CircuitBreakerState> = new Map()
  private checkpointManager: CheckpointManager
  private eventListeners: Map<CheckpointEventType, Set<CheckpointEventHandler>> = new Map()
  private allEventListeners: Set<CheckpointEventHandler> = new Set()

  constructor(
    checkpointManager: CheckpointManager,
    policy?: Partial<RetryPolicy>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.checkpointManager = checkpointManager
    this.policy = { ...DEFAULT_RETRY_POLICY, ...policy }
    this.circuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig }
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<TInput, TOutput, TContext>(
    operation: () => Promise<TOutput>,
    options: CheckpointWrapperOptions<TInput, TOutput, TContext>
  ): Promise<WrappedOperationResult<TOutput>> {
    const {
      taskId,
      stepName,
      stepIndex,
      input,
      context,
      retryPolicy = this.policy,
      saveOnSuccess = true,
      saveOnFailure = true,
      transformOutput,
      classifyError: customClassifyError,
      tags = [],
      metadata = {}
    } = options

    const circuitKey = `${taskId}:${stepName}`
    const startTime = Date.now()
    let lastCheckpointId: string | null = null
    let totalRetries = 0
    let lastError: Error | undefined
    let lastErrorType: ErrorType | undefined

    // Check circuit breaker
    if (this.isCircuitOpen(circuitKey)) {
      const circuitState = this.circuitBreakerStates.get(circuitKey)!
      const resetTime = circuitState.openedAt! + this.circuitBreakerConfig.resetTimeout

      if (Date.now() < resetTime) {
        // Circuit is open, fail fast
        return {
          success: false,
          error: new Error('Circuit breaker is open'),
          errorType: 'unknown',
          retries: 0,
          duration: 0,
          checkpointId: '',
          circuitBreakerTripped: true
        }
      }

      // Transition to half-open
      this.transitionCircuit(circuitKey, 'half-open')
    }

    // Get retry config based on error type (will update on each retry)
    let retryConfig = retryPolicy.default

    for (let attempt = 0; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        // Execute the operation
        const rawOutput = await operation()

        // Transform output if needed
        const output = transformOutput ? transformOutput(rawOutput) : rawOutput

        // Record success for circuit breaker
        this.recordSuccess(circuitKey)

        // Create success checkpoint
        if (saveOnSuccess) {
          const checkpoint = await this.checkpointManager.createStepCheckpoint(
            taskId,
            stepIndex,
            stepName,
            input,
            output,
            context,
            {
              status: 'completed',
              retryCount: totalRetries,
              isRetryResult: totalRetries > 0,
              stepDuration: Date.now() - startTime,
              tags,
              custom: metadata
            }
          )
          lastCheckpointId = checkpoint.id

          // Add to task
          await this.checkpointManager.addStepToTask(taskId, checkpoint.id)
        }

        this.emitEvent({
          type: 'step:completed',
          timestamp: Date.now(),
          taskId,
          checkpointId: lastCheckpointId ?? undefined,
          stepIndex,
          data: { stepName, retries: totalRetries, duration: Date.now() - startTime }
        })

        return {
          success: true,
          output,
          retries: totalRetries,
          duration: Date.now() - startTime,
          checkpointId: lastCheckpointId ?? '',
          circuitBreakerTripped: false
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        lastErrorType = customClassifyError?.(lastError) ?? classifyError(lastError)

        // Update retry config based on error type
        const retryPolicyKey: keyof RetryPolicy =
          lastErrorType === 'unknown' ? 'default' : lastErrorType
        retryConfig = retryPolicy[retryPolicyKey] ?? retryPolicy.default

        // Check if we should retry
        if (attempt >= retryConfig.maxAttempts) {
          break
        }

        // Record failure for circuit breaker
        this.recordFailure(circuitKey)

        // Check if circuit breaker tripped
        if (this.isCircuitOpen(circuitKey)) {
          break
        }

        // Emit retry event
        this.emitEvent({
          type: 'step:retrying',
          timestamp: Date.now(),
          taskId,
          stepIndex,
          data: {
            stepName,
            attempt: attempt + 1,
            maxAttempts: retryConfig.maxAttempts,
            errorType: lastErrorType,
            error: lastError.message
          }
        })

        totalRetries++

        // Calculate and wait for delay
        const delay = calculateRetryDelay(attempt, retryConfig)
        if (delay > 0) {
          await sleep(delay)
        }
      }
    }

    // All retries exhausted, create failure checkpoint
    if (saveOnFailure) {
      const checkpoint = await this.checkpointManager.createStepCheckpoint(
        taskId,
        stepIndex,
        stepName,
        input,
        null,
        context,
        {
          status: 'failed',
          error: {
            type: lastErrorType!,
            message: lastError!.message,
            stack: lastError!.stack
          },
          retryCount: totalRetries,
          isRetryResult: totalRetries > 0,
          stepDuration: Date.now() - startTime,
          tags,
          custom: metadata
        }
      )
      lastCheckpointId = checkpoint.id

      // Add to task
      await this.checkpointManager.addStepToTask(taskId, checkpoint.id)
    }

    this.emitEvent({
      type: 'step:failed',
      timestamp: Date.now(),
      taskId,
      checkpointId: lastCheckpointId ?? undefined,
      stepIndex,
      data: {
        stepName,
        retries: totalRetries,
        errorType: lastErrorType,
        error: lastError?.message,
        circuitOpen: this.isCircuitOpen(circuitKey)
      }
    })

    return {
      success: false,
      error: lastError,
      errorType: lastErrorType,
      retries: totalRetries,
      duration: Date.now() - startTime,
      checkpointId: lastCheckpointId ?? '',
      circuitBreakerTripped: this.isCircuitOpen(circuitKey)
    }
  }

  /**
   * Check if circuit breaker is open for a key
   */
  isCircuitOpen(key: string): boolean {
    const state = this.circuitBreakerStates.get(key)
    return state?.state === 'open'
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(key: string): CircuitBreakerState | null {
    return this.circuitBreakerStates.get(key) ?? null
  }

  /**
   * Reset circuit breaker for a key
   */
  resetCircuit(key: string): void {
    this.circuitBreakerStates.delete(key)
    this.emitEvent({
      type: 'circuit:closed',
      timestamp: Date.now(),
      taskId: key.split(':')[0],
      data: { key, reason: 'manual_reset' }
    })
  }

  /**
   * Update retry policy
   */
  setRetryPolicy(policy: Partial<RetryPolicy>): void {
    this.policy = { ...this.policy, ...policy }
  }

  /**
   * Update circuit breaker config
   */
  setCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config }
  }

  /**
   * Add event listener
   */
  addEventListener(type: CheckpointEventType | '*', handler: CheckpointEventHandler): () => void {
    if (type === '*') {
      this.allEventListeners.add(handler)
      return () => this.allEventListeners.delete(handler)
    }

    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set())
    }
    this.eventListeners.get(type)!.add(handler)
    return () => this.eventListeners.get(type)?.delete(handler)
  }

  // ===== Private Methods =====

  private getOrCreateCircuitState(key: string): CircuitBreakerState {
    if (!this.circuitBreakerStates.has(key)) {
      this.circuitBreakerStates.set(key, {
        state: 'closed',
        failures: 0,
        successes: 0,
        openedAt: null,
        lastFailureAt: null,
        halfOpenRequests: 0,
        failureTimestamps: []
      })
    }
    return this.circuitBreakerStates.get(key)!
  }

  private recordSuccess(key: string): void {
    const state = this.getOrCreateCircuitState(key)

    if (state.state === 'half-open') {
      state.successes++
      if (state.successes >= this.circuitBreakerConfig.successThreshold) {
        this.transitionCircuit(key, 'closed')
      }
    } else {
      // Reset failures on success
      state.failures = 0
      state.failureTimestamps = []
    }
  }

  private recordFailure(key: string): void {
    const state = this.getOrCreateCircuitState(key)
    const now = Date.now()

    state.lastFailureAt = now
    state.failureTimestamps.push(now)

    // Remove failures outside the window
    state.failureTimestamps = state.failureTimestamps.filter(
      ts => now - ts < this.circuitBreakerConfig.failureWindow
    )

    state.failures = state.failureTimestamps.length

    if (state.state === 'half-open') {
      // Any failure in half-open triggers open
      this.transitionCircuit(key, 'open')
    } else if (state.state === 'closed' && state.failures >= this.circuitBreakerConfig.failureThreshold) {
      this.transitionCircuit(key, 'open')
    }
  }

  private transitionCircuit(key: string, newState: CircuitState): void {
    const state = this.getOrCreateCircuitState(key)
    const oldState = state.state
    state.state = newState

    if (newState === 'open') {
      state.openedAt = Date.now()
      state.successes = 0
      state.halfOpenRequests = 0

      this.emitEvent({
        type: 'circuit:opened',
        timestamp: Date.now(),
        taskId: key.split(':')[0],
        data: { key, failures: state.failures, previousState: oldState }
      })
    } else if (newState === 'half-open') {
      state.halfOpenRequests = 0
      state.successes = 0

      this.emitEvent({
        type: 'circuit:half-open',
        timestamp: Date.now(),
        taskId: key.split(':')[0],
        data: { key, previousState: oldState }
      })
    } else if (newState === 'closed') {
      state.failures = 0
      state.failureTimestamps = []
      state.openedAt = null
      state.successes = 0

      this.emitEvent({
        type: 'circuit:closed',
        timestamp: Date.now(),
        taskId: key.split(':')[0],
        data: { key, previousState: oldState }
      })
    }
  }

  private emitEvent(event: CheckpointEvent): void {
    // Notify type-specific listeners
    const listeners = this.eventListeners.get(event.type)
    if (listeners) {
      Array.from(listeners).forEach(handler => {
        try {
          handler(event)
        } catch (e) {
          console.error('[RetryManager] Event handler error:', e)
        }
      })
    }

    // Notify all-event listeners
    Array.from(this.allEventListeners).forEach(handler => {
      try {
        handler(event)
      } catch (e) {
        console.error('[RetryManager] Event handler error:', e)
      }
    })
  }
}

// ============================================================================
// Resume Manager Class
// ============================================================================

/**
 * Resume Manager
 *
 * Handles resuming interrupted tasks from checkpoints.
 */
export class ResumeManager {
  private checkpointManager: CheckpointManager
  private retryManager: RetryManager
  private autoResumeEnabled: boolean = false
  private resumeListeners: Set<(task: TaskCheckpoint) => void> = new Set()

  constructor(checkpointManager: CheckpointManager, retryManager: RetryManager) {
    this.checkpointManager = checkpointManager
    this.retryManager = retryManager
  }

  /**
   * Resume a task from a specific checkpoint
   */
  async resumeFromCheckpoint<TInput, TOutput, TContext>(
    checkpointId: string,
    stepExecutor: (
      stepIndex: number,
      input: TInput,
      context: TContext
    ) => Promise<TOutput>
  ): Promise<TaskCheckpoint<TContext> | null> {
    const checkpoint = await this.checkpointManager.getStepCheckpoint<TInput, TOutput, TContext>(
      checkpointId
    )

    if (!checkpoint) {
      console.error(`[ResumeManager] Checkpoint ${checkpointId} not found`)
      return null
    }

    const task = await this.checkpointManager.getTaskCheckpoint<TContext>(checkpoint.taskId)
    if (!task) {
      console.error(`[ResumeManager] Task ${checkpoint.taskId} not found`)
      return null
    }

    return this.resumeTask(task, checkpoint.stepIndex, stepExecutor)
  }

  /**
   * Resume a task from a specific step
   */
  async resumeTask<TInput, TOutput, TContext>(
    task: TaskCheckpoint<TContext>,
    fromStepIndex: number,
    stepExecutor: (
      stepIndex: number,
      input: TInput,
      context: TContext
    ) => Promise<TOutput>
  ): Promise<TaskCheckpoint<TContext>> {
    // Update task status
    await this.checkpointManager.updateTaskCheckpoint(task.id, {
      status: 'running',
      wasResumed: true,
      resumedFromCheckpointId: task.stepCheckpoints[fromStepIndex] ?? null,
      startedAt: task.startedAt ?? Date.now()
    })

    this.checkpointManager.addEventListener('task:resumed', () => {})

    // Get the latest checkpoint to restore context
    const latestCheckpoint = await this.checkpointManager.getStepCheckpoint<TInput, TOutput, TContext>(
      task.stepCheckpoints[fromStepIndex - 1] ?? task.stepCheckpoints[0]
    )

    let currentContext = latestCheckpoint?.context ?? task.context

    // Execute remaining steps
    for (let stepIndex = fromStepIndex; stepIndex < task.totalSteps; stepIndex++) {
      const result = await this.retryManager.executeWithRetry(
        () => stepExecutor(stepIndex, {} as TInput, currentContext),
        {
          taskId: task.id,
          stepName: `step_${stepIndex}`,
          stepIndex,
          input: {} as TInput,
          context: currentContext
        }
      )

      if (!result.success) {
        // Update task as failed
        await this.checkpointManager.updateTaskCheckpoint<TContext>(task.id, {
          status: 'failed',
          currentStepIndex: stepIndex,
          completedAt: Date.now()
        })

        return (await this.checkpointManager.getTaskCheckpoint<TContext>(task.id))!
      }

      // Update context with output if available
      if (result.output !== undefined) {
        currentContext = result.output as unknown as TContext
      }

      // Update task progress
      await this.checkpointManager.updateTaskCheckpoint<TContext>(task.id, {
        currentStepIndex: stepIndex,
        context: currentContext,
        totalRetries: task.totalRetries + result.retries
      })
    }

    // Mark task as completed
    await this.checkpointManager.updateTaskCheckpoint<TContext>(task.id, {
      status: 'completed',
      currentStepIndex: task.totalSteps - 1,
      completedAt: Date.now()
    })

    return (await this.checkpointManager.getTaskCheckpoint<TContext>(task.id))!
  }

  /**
   * Enable auto-resume on app startup
   */
  async enableAutoResume(): Promise<void> {
    this.autoResumeEnabled = true

    // Check for interrupted tasks
    const interruptedTasks = await this.checkpointManager.listInterruptedTasks()

    for (const task of interruptedTasks) {
      console.log(`[ResumeManager] Found interrupted task: ${task.name} (${task.id})`)

      // Notify listeners
      Array.from(this.resumeListeners).forEach(listener => {
        try {
          listener(task)
        } catch (e) {
          console.error('[ResumeManager] Resume listener error:', e)
        }
      })
    }
  }

  /**
   * Disable auto-resume
   */
  disableAutoResume(): void {
    this.autoResumeEnabled = false
  }

  /**
   * Add listener for tasks that can be resumed
   */
  onTaskResumable(listener: (task: TaskCheckpoint) => void): () => void {
    this.resumeListeners.add(listener)
    return () => this.resumeListeners.delete(listener)
  }

  /**
   * Get progress information for UI
   */
  async getProgress(taskId: string): Promise<CheckpointProgress | null> {
    const task = await this.checkpointManager.getTaskCheckpoint(taskId)
    if (!task) return null

    const latestCheckpoint = await this.checkpointManager.getLatestCheckpoint(taskId)

    const elapsed = task.startedAt ? Date.now() - task.startedAt : 0
    const completedSteps = task.currentStepIndex + 1
    const percentage = (completedSteps / task.totalSteps) * 100

    // Estimate remaining time based on average step duration
    let estimatedRemaining: number | null = null
    if (completedSteps > 0 && elapsed > 0) {
      const avgStepTime = elapsed / completedSteps
      const remainingSteps = task.totalSteps - completedSteps
      estimatedRemaining = avgStepTime * remainingSteps
    }

    const circuitKey = `${taskId}:step_${task.currentStepIndex}`
    const circuitState = this.retryManager.getCircuitState(circuitKey)

    return {
      taskId,
      taskName: task.name,
      currentStep: task.currentStepIndex,
      totalSteps: task.totalSteps,
      percentage,
      currentStepName: latestCheckpoint?.stepName ?? 'unknown',
      status: task.status,
      elapsed,
      estimatedRemaining,
      retryCount: latestCheckpoint?.metadata.retryCount ?? 0,
      circuitState: circuitState?.state ?? 'closed',
      lastError: latestCheckpoint?.metadata.error?.message
    }
  }
}

// ============================================================================
// Integration Wrappers
// ============================================================================

/**
 * Wrap any async operation with checkpoint support
 */
export function withCheckpoint<TInput, TOutput, TContext = unknown>(
  checkpointManager: CheckpointManager,
  retryManager: RetryManager
) {
  return async function wrappedOperation(
    operation: () => Promise<TOutput>,
    options: CheckpointWrapperOptions<TInput, TOutput, TContext>
  ): Promise<WrappedOperationResult<TOutput>> {
    return retryManager.executeWithRetry(operation, options)
  }
}

/**
 * Create a checkpoint-enabled task executor
 */
export function createTaskExecutor<TContext = unknown>(
  checkpointManager: CheckpointManager,
  retryManager: RetryManager
) {
  return {
    /**
     * Start a new task
     */
    async startTask(
      name: string,
      totalSteps: number,
      initialContext: TContext,
      options?: { description?: string; metadata?: Record<string, unknown> }
    ): Promise<TaskCheckpoint<TContext>> {
      const task = await checkpointManager.createTaskCheckpoint(
        name,
        totalSteps,
        initialContext,
        options
      )

      await checkpointManager.updateTaskCheckpoint(task.id, {
        status: 'running',
        startedAt: Date.now()
      })

      return task
    },

    /**
     * Execute a step with checkpointing
     */
    async executeStep<TInput, TOutput>(
      taskId: string,
      stepIndex: number,
      stepName: string,
      operation: () => Promise<TOutput>,
      input: TInput,
      context: TContext,
      options?: Partial<CheckpointWrapperOptions<TInput, TOutput, TContext>>
    ): Promise<WrappedOperationResult<TOutput>> {
      return retryManager.executeWithRetry(operation, {
        taskId,
        stepName,
        stepIndex,
        input,
        context,
        ...options
      })
    },

    /**
     * Complete a task
     */
    async completeTask(taskId: string): Promise<TaskCheckpoint<TContext> | null> {
      return checkpointManager.updateTaskCheckpoint<TContext>(taskId, {
        status: 'completed',
        completedAt: Date.now()
      })
    },

    /**
     * Fail a task
     */
    async failTask(taskId: string, error?: string): Promise<TaskCheckpoint<TContext> | null> {
      return checkpointManager.updateTaskCheckpoint<TContext>(taskId, {
        status: 'failed',
        completedAt: Date.now(),
        metadata: error ? { finalError: error } : undefined
      })
    },

    /**
     * Pause a task
     */
    async pauseTask(taskId: string): Promise<TaskCheckpoint<TContext> | null> {
      return checkpointManager.updateTaskCheckpoint<TContext>(taskId, {
        status: 'paused'
      })
    },

    /**
     * Cancel a task
     */
    async cancelTask(taskId: string): Promise<TaskCheckpoint<TContext> | null> {
      return checkpointManager.updateTaskCheckpoint<TContext>(taskId, {
        status: 'cancelled',
        completedAt: Date.now()
      })
    }
  }
}

// ============================================================================
// React Hooks (for UI integration)
// ============================================================================

/**
 * Hook state for checkpoint progress
 */
export interface UseCheckpointProgressState {
  progress: CheckpointProgress | null
  isLoading: boolean
  error: Error | null
}

/**
 * Hook result for checkpoint system
 */
export interface UseCheckpointSystemResult {
  checkpointManager: CheckpointManager
  retryManager: RetryManager
  resumeManager: ResumeManager
  taskExecutor: ReturnType<typeof createTaskExecutor>
  isInitialized: boolean
}

/**
 * Create a checkpoint system instance
 * Can be used as a factory for React hooks or other frameworks
 */
export async function createCheckpointSystem(options?: {
  retryPolicy?: Partial<RetryPolicy>
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  compressionThreshold?: number
  autoResume?: boolean
}): Promise<UseCheckpointSystemResult> {
  const checkpointManager = new CheckpointManager()
  await checkpointManager.initialize()

  if (options?.compressionThreshold) {
    checkpointManager.setCompressionThreshold(options.compressionThreshold)
  }

  const retryManager = new RetryManager(
    checkpointManager,
    options?.retryPolicy,
    options?.circuitBreakerConfig
  )

  const resumeManager = new ResumeManager(checkpointManager, retryManager)

  if (options?.autoResume !== false) {
    await resumeManager.enableAutoResume()
  }

  const taskExecutor = createTaskExecutor(checkpointManager, retryManager)

  return {
    checkpointManager,
    retryManager,
    resumeManager,
    taskExecutor,
    isInitialized: true
  }
}

// ============================================================================
// Singleton Instance and Export
// ============================================================================

let _instance: UseCheckpointSystemResult | null = null

/**
 * Get or create the singleton checkpoint system instance
 */
export async function getCheckpointSystem(options?: {
  retryPolicy?: Partial<RetryPolicy>
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  compressionThreshold?: number
  autoResume?: boolean
}): Promise<UseCheckpointSystemResult> {
  if (!_instance) {
    _instance = await createCheckpointSystem(options)
  }
  return _instance
}

/**
 * Export default retry policy for customization
 */
export { DEFAULT_RETRY_POLICY, DEFAULT_CIRCUIT_BREAKER_CONFIG }

/**
 * Export utility functions
 */
export {
  generateCheckpointId,
  generateTaskId,
  calculateChecksum,
  calculateRetryDelay,
  classifyError,
  deepDiff,
  sleep
}
