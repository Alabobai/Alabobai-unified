/**
 * Reliability Orchestrator
 *
 * The central coordinator that ties together all reliability systems:
 * - Checkpoint & Retry System
 * - Human-in-the-Loop System
 * - Verification Engine
 * - Cost Tracker
 * - Persistent Memory
 * - Agent Templates
 *
 * This orchestrator ensures tasks complete reliably by:
 * 1. Breaking tasks into verifiable steps
 * 2. Checkpointing after each successful step
 * 3. Verifying each action's outcome
 * 4. Asking humans when uncertain
 * 5. Retrying with different strategies on failure
 * 6. Learning from successes and failures
 */

import { EventEmitter } from './eventEmitter'

// ============================================================================
// Types
// ============================================================================

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'awaiting_human'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'retrying'
  | 'awaiting_human'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface TaskDefinition {
  id: string
  name: string
  description: string
  steps: StepDefinition[]
  config: TaskConfig
  metadata?: Record<string, unknown>
}

export interface StepDefinition {
  id: string
  name: string
  description: string
  execute: (context: StepContext) => Promise<StepResult>
  verify?: (result: StepResult, context: StepContext) => Promise<VerificationResult>
  rollback?: (context: StepContext) => Promise<void>
  config?: StepConfig
}

export interface TaskConfig {
  maxRetries: number
  retryStrategy: 'exponential' | 'linear' | 'immediate'
  timeout: number
  budgetLimit?: number
  requireHumanApproval?: boolean
  checkpointFrequency: 'every_step' | 'on_success' | 'manual'
  confidenceThreshold: number
}

export interface StepConfig {
  maxRetries?: number
  timeout?: number
  critical?: boolean // If true, task fails if step fails
  skipOnError?: boolean
  requiresHumanApproval?: boolean
}

export interface StepContext {
  taskId: string
  stepId: string
  stepIndex: number
  previousResults: Map<string, StepResult>
  memory: MemoryContext
  budget: BudgetContext
  abortSignal: AbortSignal
}

export interface MemoryContext {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
  recall: (query: string) => Promise<unknown[]>
}

export interface BudgetContext {
  remaining: number
  used: number
  limit: number
  trackUsage: (tokens: number, model: string) => void
}

export interface StepResult {
  success: boolean
  data?: unknown
  error?: Error
  tokensUsed?: number
  duration: number
  confidence: number
  metadata?: Record<string, unknown>
}

export interface VerificationResult {
  verified: boolean
  confidence: number
  evidence?: string
  suggestions?: string[]
}

export interface HumanPrompt {
  id: string
  taskId: string
  stepId: string
  type: 'confirmation' | 'choice' | 'input' | 'error_resolution'
  title: string
  message: string
  options?: { label: string; value: string; description?: string }[]
  context?: Record<string, unknown>
  timeout?: number
  priority: 'low' | 'normal' | 'high' | 'critical'
}

export interface HumanResponse {
  promptId: string
  choice?: string
  input?: string
  timestamp: Date
}

export interface TaskProgress {
  taskId: string
  status: TaskStatus
  currentStep: number
  totalSteps: number
  completedSteps: number
  failedSteps: number
  retriedSteps: number
  elapsedTime: number
  estimatedTimeRemaining?: number
  costUsed: number
  costLimit?: number
  currentStepName?: string
  lastCheckpoint?: string
  humanPromptPending?: HumanPrompt
}

export interface TaskResult {
  taskId: string
  success: boolean
  status: TaskStatus
  results: Map<string, StepResult>
  totalDuration: number
  totalCost: number
  totalRetries: number
  humanInterventions: number
  checkpoints: string[]
  error?: Error
}

// ============================================================================
// Event Types
// ============================================================================

export interface ReliabilityEvents {
  'task:start': { taskId: string; task: TaskDefinition }
  'task:progress': TaskProgress
  'task:complete': TaskResult
  'task:failed': { taskId: string; error: Error }
  'task:cancelled': { taskId: string }

  'step:start': { taskId: string; stepId: string; stepName: string }
  'step:complete': { taskId: string; stepId: string; result: StepResult }
  'step:failed': { taskId: string; stepId: string; error: Error }
  'step:retry': { taskId: string; stepId: string; attempt: number; maxAttempts: number }
  'step:verification': { taskId: string; stepId: string; result: VerificationResult }

  'human:prompt': HumanPrompt
  'human:response': HumanResponse
  'human:timeout': { promptId: string }

  'checkpoint:created': { taskId: string; checkpointId: string }
  'checkpoint:restored': { taskId: string; checkpointId: string }

  'budget:warning': { taskId: string; used: number; limit: number }
  'budget:exceeded': { taskId: string; used: number; limit: number }

  // Index signature for EventMap compatibility
  [key: string]: unknown
}

// ============================================================================
// Reliability Orchestrator
// ============================================================================

export class ReliabilityOrchestrator extends EventEmitter<ReliabilityEvents> {
  private runningTasks: Map<string, TaskExecution> = new Map()
  private humanResponseHandlers: Map<string, (response: HumanResponse) => void> = new Map()

  private defaultConfig: TaskConfig = {
    maxRetries: 3,
    retryStrategy: 'exponential',
    timeout: 300000, // 5 minutes
    checkpointFrequency: 'every_step',
    confidenceThreshold: 70
  }

  // ============================================================================
  // Task Execution
  // ============================================================================

  /**
   * Execute a task with full reliability guarantees
   */
  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    const config = { ...this.defaultConfig, ...task.config }
    const execution = new TaskExecution(task, config, this)

    this.runningTasks.set(task.id, execution)
    this.emit('task:start', { taskId: task.id, task })

    try {
      const result = await execution.run()
      this.emit('task:complete', result)
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit('task:failed', { taskId: task.id, error: err })
      throw err
    } finally {
      this.runningTasks.delete(task.id)
    }
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const execution = this.runningTasks.get(taskId)
    if (execution) {
      execution.cancel()
      this.emit('task:cancelled', { taskId })
      return true
    }
    return false
  }

  /**
   * Pause a running task
   */
  pauseTask(taskId: string): boolean {
    const execution = this.runningTasks.get(taskId)
    if (execution) {
      execution.pause()
      return true
    }
    return false
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId: string): boolean {
    const execution = this.runningTasks.get(taskId)
    if (execution) {
      execution.resume()
      return true
    }
    return false
  }

  /**
   * Get progress of a running task
   */
  getTaskProgress(taskId: string): TaskProgress | null {
    const execution = this.runningTasks.get(taskId)
    return execution?.getProgress() ?? null
  }

  /**
   * Resume a task from a checkpoint
   */
  async resumeFromCheckpoint(taskId: string, checkpointId: string): Promise<TaskResult> {
    // Load checkpoint data
    const checkpoint = await this.loadCheckpoint(checkpointId)
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`)
    }

    this.emit('checkpoint:restored', { taskId, checkpointId })

    // Create execution with restored state
    const execution = new TaskExecution(
      checkpoint.task,
      checkpoint.config,
      this,
      checkpoint.state
    )

    this.runningTasks.set(taskId, execution)

    try {
      const result = await execution.run()
      this.emit('task:complete', result)
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit('task:failed', { taskId, error: err })
      throw err
    } finally {
      this.runningTasks.delete(taskId)
    }
  }

  // ============================================================================
  // Human Interaction
  // ============================================================================

  /**
   * Request human input
   */
  async requestHumanInput(prompt: HumanPrompt): Promise<HumanResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = prompt.timeout
        ? setTimeout(() => {
            this.humanResponseHandlers.delete(prompt.id)
            this.emit('human:timeout', { promptId: prompt.id })
            reject(new Error('Human response timeout'))
          }, prompt.timeout)
        : null

      this.humanResponseHandlers.set(prompt.id, (response) => {
        if (timeoutId) clearTimeout(timeoutId)
        this.humanResponseHandlers.delete(prompt.id)
        this.emit('human:response', response)
        resolve(response)
      })

      this.emit('human:prompt', prompt)
    })
  }

  /**
   * Provide human response to a prompt
   */
  provideHumanResponse(response: HumanResponse): void {
    const handler = this.humanResponseHandlers.get(response.promptId)
    if (handler) {
      handler(response)
    }
  }

  // ============================================================================
  // Checkpoint Management
  // ============================================================================

  private async loadCheckpoint(checkpointId: string): Promise<CheckpointData | null> {
    // In a real implementation, this would load from IndexedDB
    // For now, return null to indicate not found
    console.log(`Loading checkpoint: ${checkpointId}`)
    return null
  }

  async saveCheckpoint(taskId: string, state: TaskExecutionState): Promise<string> {
    const checkpointId = `cp-${taskId}-${Date.now()}`

    // In a real implementation, save to IndexedDB
    console.log(`Saving checkpoint: ${checkpointId}`)

    this.emit('checkpoint:created', { taskId, checkpointId })
    return checkpointId
  }

  async listCheckpoints(taskId: string): Promise<CheckpointInfo[]> {
    // In a real implementation, list from IndexedDB
    return []
  }
}

// ============================================================================
// Task Execution Engine
// ============================================================================

interface TaskExecutionState {
  currentStepIndex: number
  completedSteps: Set<string>
  results: Map<string, StepResult>
  retryCount: Map<string, number>
  checkpoints: string[]
  startTime: number
  costUsed: number
}

interface CheckpointData {
  task: TaskDefinition
  config: TaskConfig
  state: TaskExecutionState
}

interface CheckpointInfo {
  id: string
  taskId: string
  stepIndex: number
  timestamp: Date
}

class TaskExecution {
  private task: TaskDefinition
  private config: TaskConfig
  private orchestrator: ReliabilityOrchestrator
  private state: TaskExecutionState
  private abortController: AbortController
  private paused: boolean = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null

  constructor(
    task: TaskDefinition,
    config: TaskConfig,
    orchestrator: ReliabilityOrchestrator,
    initialState?: TaskExecutionState
  ) {
    this.task = task
    this.config = config
    this.orchestrator = orchestrator
    this.abortController = new AbortController()

    this.state = initialState ?? {
      currentStepIndex: 0,
      completedSteps: new Set(),
      results: new Map(),
      retryCount: new Map(),
      checkpoints: [],
      startTime: Date.now(),
      costUsed: 0
    }
  }

  async run(): Promise<TaskResult> {
    const { task, config, state } = this

    try {
      // Execute each step
      for (let i = state.currentStepIndex; i < task.steps.length; i++) {
        // Check for cancellation
        if (this.abortController.signal.aborted) {
          throw new Error('Task cancelled')
        }

        // Check for pause
        await this.checkPause()

        const step = task.steps[i]
        state.currentStepIndex = i

        // Emit progress
        this.emitProgress()

        // Execute step with retry logic
        const result = await this.executeStepWithRetry(step, i)

        // Store result
        state.results.set(step.id, result)
        state.completedSteps.add(step.id)

        // Update cost
        if (result.tokensUsed) {
          state.costUsed += this.calculateCost(result.tokensUsed)
          this.checkBudget()
        }

        // Checkpoint if configured
        if (config.checkpointFrequency === 'every_step' ||
            (config.checkpointFrequency === 'on_success' && result.success)) {
          const checkpointId = await this.orchestrator.saveCheckpoint(task.id, state)
          state.checkpoints.push(checkpointId)
        }

        // If step failed and is critical, abort
        if (!result.success && step.config?.critical !== false) {
          throw new Error(`Critical step "${step.name}" failed: ${result.error?.message}`)
        }
      }

      return this.buildResult(true)

    } catch (error) {
      return this.buildResult(false, error instanceof Error ? error : new Error(String(error)))
    }
  }

  private async executeStepWithRetry(step: StepDefinition, stepIndex: number): Promise<StepResult> {
    const maxRetries = step.config?.maxRetries ?? this.config.maxRetries
    let lastError: Error | undefined
    let attempt = 0

    while (attempt <= maxRetries) {
      try {
        // Emit step start
        this.orchestrator.emit('step:start', {
          taskId: this.task.id,
          stepId: step.id,
          stepName: step.name
        })

        // Build context
        const context = this.buildStepContext(step.id, stepIndex)

        // Execute step
        const startTime = Date.now()
        const result = await this.executeWithTimeout(
          () => step.execute(context),
          step.config?.timeout ?? this.config.timeout
        )
        result.duration = Date.now() - startTime

        // Verify if verifier exists
        if (step.verify) {
          const verification = await step.verify(result, context)
          this.orchestrator.emit('step:verification', {
            taskId: this.task.id,
            stepId: step.id,
            result: verification
          })

          if (!verification.verified) {
            throw new Error(`Verification failed: ${verification.suggestions?.join(', ')}`)
          }
        }

        // Check confidence threshold
        if (result.confidence < this.config.confidenceThreshold) {
          // Request human approval
          const humanResponse = await this.requestHumanApproval(step, result)
          if (humanResponse.choice === 'reject') {
            throw new Error('Human rejected low-confidence result')
          }
        }

        this.orchestrator.emit('step:complete', {
          taskId: this.task.id,
          stepId: step.id,
          result
        })

        return result

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt++

        if (attempt <= maxRetries) {
          this.orchestrator.emit('step:retry', {
            taskId: this.task.id,
            stepId: step.id,
            attempt,
            maxAttempts: maxRetries
          })

          // Wait before retry based on strategy
          await this.waitForRetry(attempt)
        }
      }
    }

    // All retries exhausted
    this.orchestrator.emit('step:failed', {
      taskId: this.task.id,
      stepId: step.id,
      error: lastError!
    })

    // Try rollback if available
    if (step.rollback) {
      try {
        await step.rollback(this.buildStepContext(step.id, stepIndex))
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError)
      }
    }

    return {
      success: false,
      error: lastError,
      duration: 0,
      confidence: 0
    }
  }

  private async requestHumanApproval(step: StepDefinition, result: StepResult): Promise<HumanResponse> {
    const prompt: HumanPrompt = {
      id: `prompt-${this.task.id}-${step.id}-${Date.now()}`,
      taskId: this.task.id,
      stepId: step.id,
      type: 'confirmation',
      title: 'Low Confidence Result',
      message: `The step "${step.name}" completed with ${result.confidence}% confidence. Do you want to accept this result or retry?`,
      options: [
        { label: 'Accept', value: 'accept', description: 'Proceed with this result' },
        { label: 'Retry', value: 'retry', description: 'Try the step again' },
        { label: 'Reject', value: 'reject', description: 'Abort the task' }
      ],
      context: { result: result.data },
      priority: 'high',
      timeout: 300000 // 5 minutes
    }

    return this.orchestrator.requestHumanInput(prompt)
  }

  private buildStepContext(stepId: string, stepIndex: number): StepContext {
    return {
      taskId: this.task.id,
      stepId,
      stepIndex,
      previousResults: new Map(this.state.results),
      memory: {
        get: (key: string) => null, // Will be connected to PersistentMemory
        set: (key: string, value: unknown) => {},
        recall: async (query: string) => []
      },
      budget: {
        remaining: (this.config.budgetLimit ?? Infinity) - this.state.costUsed,
        used: this.state.costUsed,
        limit: this.config.budgetLimit ?? Infinity,
        trackUsage: (tokens: number, model: string) => {
          this.state.costUsed += this.calculateCost(tokens, model)
        }
      },
      abortSignal: this.abortController.signal
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Step timeout')), timeout)
      )
    ])
  }

  private async waitForRetry(attempt: number): Promise<void> {
    let delay: number

    switch (this.config.retryStrategy) {
      case 'exponential':
        delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
        break
      case 'linear':
        delay = 1000 * attempt
        break
      case 'immediate':
        delay = 100
        break
      default:
        delay = 1000
    }

    await new Promise(resolve => setTimeout(resolve, delay))
  }

  private calculateCost(tokens: number, model: string = 'default'): number {
    // Simplified cost calculation - will be connected to CostTracker
    const rates: Record<string, number> = {
      'gpt-4': 0.03 / 1000,
      'gpt-3.5-turbo': 0.002 / 1000,
      'claude-3-opus': 0.015 / 1000,
      'claude-3-sonnet': 0.003 / 1000,
      'default': 0.001 / 1000
    }
    return tokens * (rates[model] ?? rates.default)
  }

  private checkBudget(): void {
    if (!this.config.budgetLimit) return

    const percentUsed = (this.state.costUsed / this.config.budgetLimit) * 100

    if (percentUsed >= 100) {
      this.orchestrator.emit('budget:exceeded', {
        taskId: this.task.id,
        used: this.state.costUsed,
        limit: this.config.budgetLimit
      })
      throw new Error('Budget exceeded')
    } else if (percentUsed >= 80) {
      this.orchestrator.emit('budget:warning', {
        taskId: this.task.id,
        used: this.state.costUsed,
        limit: this.config.budgetLimit
      })
    }
  }

  private async checkPause(): Promise<void> {
    if (this.paused && !this.pausePromise) {
      this.pausePromise = new Promise(resolve => {
        this.pauseResolve = resolve
      })
    }
    if (this.pausePromise) {
      await this.pausePromise
    }
  }

  cancel(): void {
    this.abortController.abort()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    if (this.pauseResolve) {
      this.pauseResolve()
      this.pausePromise = null
      this.pauseResolve = null
    }
  }

  getProgress(): TaskProgress {
    const elapsed = Date.now() - this.state.startTime
    const completedCount = this.state.completedSteps.size
    const avgTimePerStep = completedCount > 0 ? elapsed / completedCount : 0
    const remainingSteps = this.task.steps.length - this.state.currentStepIndex

    return {
      taskId: this.task.id,
      status: this.getStatus(),
      currentStep: this.state.currentStepIndex,
      totalSteps: this.task.steps.length,
      completedSteps: completedCount,
      failedSteps: Array.from(this.state.results.values()).filter(r => !r.success).length,
      retriedSteps: Array.from(this.state.retryCount.values()).reduce((a, b) => a + b, 0),
      elapsedTime: elapsed,
      estimatedTimeRemaining: avgTimePerStep * remainingSteps,
      costUsed: this.state.costUsed,
      costLimit: this.config.budgetLimit,
      currentStepName: this.task.steps[this.state.currentStepIndex]?.name,
      lastCheckpoint: this.state.checkpoints[this.state.checkpoints.length - 1]
    }
  }

  private getStatus(): TaskStatus {
    if (this.abortController.signal.aborted) return 'cancelled'
    if (this.paused) return 'paused'
    return 'running'
  }

  private emitProgress(): void {
    this.orchestrator.emit('task:progress', this.getProgress())
  }

  private buildResult(success: boolean, error?: Error): TaskResult {
    return {
      taskId: this.task.id,
      success,
      status: success ? 'completed' : 'failed',
      results: this.state.results,
      totalDuration: Date.now() - this.state.startTime,
      totalCost: this.state.costUsed,
      totalRetries: Array.from(this.state.retryCount.values()).reduce((a, b) => a + b, 0),
      humanInterventions: 0, // Track this properly in production
      checkpoints: this.state.checkpoints,
      error
    }
  }
}

// ============================================================================
// Simple Event Emitter (if not already in project)
// ============================================================================

// Export singleton instance
export const reliabilityOrchestrator = new ReliabilityOrchestrator()

// Export types for consumers
export type {
  CheckpointData,
  CheckpointInfo,
  TaskExecutionState
}
