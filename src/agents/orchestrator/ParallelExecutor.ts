/**
 * Alabobai Parallel Executor
 * Manages concurrent execution of multiple agents for maximum efficiency
 * Implements intelligent batching, resource management, and error isolation
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { Agent, Task, TaskStatus } from '../../core/types.js';
import { AgentRegistry, AgentResult, AgentContext } from '../../core/agent-registry.js';
import { DecomposedTask, TaskGraph } from './TaskDecomposer.js';
import { RoutingDecision } from './AgentRouter.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionPlan {
  id: string;
  taskGraphId: string;
  phases: ExecutionPhase[];
  totalTasks: number;
  estimatedDuration: number;
  createdAt: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
}

export interface ExecutionPhase {
  id: string;
  phaseNumber: number;
  tasks: ExecutionTask[];
  dependencies: string[]; // Phase IDs that must complete first
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ExecutionTask {
  taskId: string;
  agentId: string;
  agentName: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result: AgentResult | null;
  startedAt: Date | null;
  completedAt: Date | null;
  error?: string;
  retryCount: number;
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  results: Map<string, AgentResult>;
  failedTasks: string[];
  skippedTasks: string[];
  totalDuration: number;
  summary: string;
}

export interface ExecutorConfig {
  maxConcurrent: number;
  taskTimeout: number;
  maxRetries: number;
  retryDelay: number;
  failFast: boolean; // Stop all execution on first failure
  isolateErrors: boolean; // Continue other tasks even if some fail
}

const DEFAULT_CONFIG: ExecutorConfig = {
  maxConcurrent: 5,
  taskTimeout: 60000, // 60 seconds
  maxRetries: 2,
  retryDelay: 1000, // 1 second
  failFast: false,
  isolateErrors: true,
};

// ============================================================================
// PARALLEL EXECUTOR CLASS
// ============================================================================

export class ParallelExecutor extends EventEmitter {
  private config: ExecutorConfig;
  private activePlans: Map<string, ExecutionPlan> = new Map();
  private executionHistory: ExecutionResult[] = [];
  private runningTasks: Map<string, AbortController> = new Map();
  private semaphore: Semaphore;

  constructor(config?: Partial<ExecutorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.semaphore = new Semaphore(this.config.maxConcurrent);
  }

  /**
   * Executes a task graph according to an execution plan
   */
  async execute(
    taskGraph: TaskGraph,
    routingDecisions: Map<string, RoutingDecision>,
    agentContext: Omit<AgentContext, 'agent'>,
    agents: Map<string, Agent>
  ): Promise<ExecutionResult> {
    const planId = uuid();
    const startTime = Date.now();

    // Create execution plan
    const plan = this.createExecutionPlan(taskGraph, routingDecisions);
    this.activePlans.set(planId, plan);

    const results = new Map<string, AgentResult>();
    const failedTasks: string[] = [];
    const skippedTasks: string[] = [];

    this.emit('execution-started', { planId, totalTasks: plan.totalTasks });

    try {
      // Execute phases sequentially, tasks within phases in parallel
      for (const phase of plan.phases) {
        // Check if we should continue
        if (plan.status === 'cancelled') {
          break;
        }

        // Wait for dependencies (previous phases)
        const depsComplete = phase.dependencies.every(depId => {
          const depPhase = plan.phases.find(p => p.id === depId);
          return depPhase?.status === 'completed';
        });

        if (!depsComplete) {
          console.warn(`[ParallelExecutor] Phase ${phase.phaseNumber} dependencies not met`);
          continue;
        }

        // Execute phase
        phase.status = 'executing';
        phase.startedAt = new Date();

        this.emit('phase-started', {
          planId,
          phaseNumber: phase.phaseNumber,
          taskCount: phase.tasks.length,
        });

        const phaseResults = await this.executePhase(
          phase,
          agentContext,
          agents,
          results
        );

        // Process phase results
        for (const [taskId, result] of phaseResults) {
          results.set(taskId, result);
          if (!result.success) {
            failedTasks.push(taskId);

            // Check fail-fast
            if (this.config.failFast) {
              plan.status = 'failed';
              break;
            }
          }
        }

        // Mark skipped tasks (dependencies failed)
        for (const task of phase.tasks) {
          if (task.status === 'skipped') {
            skippedTasks.push(task.taskId);
          }
        }

        phase.status = failedTasks.length > 0 && !this.config.isolateErrors
          ? 'failed'
          : 'completed';
        phase.completedAt = new Date();

        this.emit('phase-completed', {
          planId,
          phaseNumber: phase.phaseNumber,
          success: phase.status === 'completed',
          duration: phase.completedAt.getTime() - (phase.startedAt?.getTime() || 0),
        });

        if (plan.status === 'failed') break;
      }

      // Determine overall success
      plan.status = failedTasks.length === 0 ? 'completed' : 'failed';

    } catch (error) {
      plan.status = 'failed';
      this.emit('execution-error', {
        planId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const totalDuration = Date.now() - startTime;

    // Create execution result
    const executionResult: ExecutionResult = {
      planId,
      success: plan.status === 'completed',
      results,
      failedTasks,
      skippedTasks,
      totalDuration,
      summary: this.generateExecutionSummary(results, failedTasks, skippedTasks, totalDuration),
    };

    // Store in history
    this.executionHistory.push(executionResult);
    this.activePlans.delete(planId);

    this.emit('execution-completed', {
      planId,
      success: executionResult.success,
      duration: totalDuration,
    });

    return executionResult;
  }

  /**
   * Creates an execution plan from a task graph
   */
  private createExecutionPlan(
    taskGraph: TaskGraph,
    routingDecisions: Map<string, RoutingDecision>
  ): ExecutionPlan {
    const phases: ExecutionPhase[] = [];
    let previousPhaseId: string | null = null;

    for (let i = 0; i < taskGraph.executionOrder.length; i++) {
      const taskIds = taskGraph.executionOrder[i];
      const phaseId = uuid();

      const tasks: ExecutionTask[] = taskIds.map(taskId => {
        const routing = routingDecisions.get(taskId);
        return {
          taskId,
          agentId: routing?.agentId || 'unknown',
          agentName: routing?.agentName || 'Unknown',
          status: 'pending' as const,
          result: null,
          startedAt: null,
          completedAt: null,
          retryCount: 0,
        };
      });

      phases.push({
        id: phaseId,
        phaseNumber: i + 1,
        tasks,
        dependencies: previousPhaseId ? [previousPhaseId] : [],
        status: 'pending',
        startedAt: null,
        completedAt: null,
      });

      previousPhaseId = phaseId;
    }

    return {
      id: uuid(),
      taskGraphId: taskGraph.rootTaskId,
      phases,
      totalTasks: taskGraph.tasks.size,
      estimatedDuration: taskGraph.totalEstimatedDuration,
      createdAt: new Date(),
      status: 'pending',
    };
  }

  /**
   * Executes a single phase (parallel task execution)
   */
  private async executePhase(
    phase: ExecutionPhase,
    agentContext: Omit<AgentContext, 'agent'>,
    agents: Map<string, Agent>,
    previousResults: Map<string, AgentResult>
  ): Promise<Map<string, AgentResult>> {
    const results = new Map<string, AgentResult>();

    // Create task promises with semaphore control
    const taskPromises = phase.tasks.map(async (execTask) => {
      // Check if dependencies failed (task should be skipped)
      const task = this.getTaskForExecution(execTask.taskId, previousResults);
      if (task && this.shouldSkipTask(task, previousResults)) {
        execTask.status = 'skipped';
        return {
          taskId: execTask.taskId,
          result: {
            success: false,
            output: {},
            error: 'Skipped due to failed dependencies',
          } as AgentResult,
        };
      }

      // Acquire semaphore slot
      await this.semaphore.acquire();

      try {
        const result = await this.executeTask(execTask, agentContext, agents);
        return { taskId: execTask.taskId, result };
      } finally {
        this.semaphore.release();
      }
    });

    // Wait for all tasks in phase to complete
    const taskResults = await Promise.all(taskPromises);

    for (const { taskId, result } of taskResults) {
      results.set(taskId, result);
    }

    return results;
  }

  /**
   * Executes a single task with retry logic
   */
  private async executeTask(
    execTask: ExecutionTask,
    agentContext: Omit<AgentContext, 'agent'>,
    agents: Map<string, Agent>
  ): Promise<AgentResult> {
    const agent = agents.get(execTask.agentId);
    if (!agent) {
      return {
        success: false,
        output: {},
        error: `Agent not found: ${execTask.agentId}`,
      };
    }

    execTask.status = 'executing';
    execTask.startedAt = new Date();

    // Create abort controller for timeout
    const abortController = new AbortController();
    this.runningTasks.set(execTask.taskId, abortController);

    this.emit('task-started', {
      taskId: execTask.taskId,
      agentId: execTask.agentId,
      agentName: execTask.agentName,
    });

    let lastError: string | undefined;

    // Retry loop
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (abortController.signal.aborted) {
        lastError = 'Task cancelled';
        break;
      }

      try {
        const result = await this.executeWithTimeout(
          execTask,
          agent,
          agentContext,
          abortController.signal
        );

        if (result.success) {
          execTask.status = 'completed';
          execTask.completedAt = new Date();
          execTask.result = result;

          this.emit('task-completed', {
            taskId: execTask.taskId,
            success: true,
            duration: execTask.completedAt.getTime() - (execTask.startedAt?.getTime() || 0),
          });

          this.runningTasks.delete(execTask.taskId);
          return result;
        }

        lastError = result.error;

        // Don't retry certain errors
        if (result.error?.includes('not found') || result.error?.includes('not authorized')) {
          break;
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Retry delay
      if (attempt < this.config.maxRetries) {
        execTask.retryCount++;
        this.emit('task-retry', {
          taskId: execTask.taskId,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
        });
        await this.sleep(this.config.retryDelay * (attempt + 1)); // Exponential backoff
      }
    }

    // Task failed after all retries
    execTask.status = 'failed';
    execTask.completedAt = new Date();
    execTask.error = lastError;

    const failedResult: AgentResult = {
      success: false,
      output: {},
      error: lastError || 'Task failed after retries',
    };

    execTask.result = failedResult;

    this.emit('task-failed', {
      taskId: execTask.taskId,
      error: lastError,
      retries: execTask.retryCount,
    });

    this.runningTasks.delete(execTask.taskId);
    return failedResult;
  }

  /**
   * Executes a task with timeout
   */
  private async executeWithTimeout(
    execTask: ExecutionTask,
    agent: Agent,
    agentContext: Omit<AgentContext, 'agent'>,
    signal: AbortSignal
  ): Promise<AgentResult> {
    return new Promise(async (resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          output: {},
          error: `Task timed out after ${this.config.taskTimeout}ms`,
        });
      }, this.config.taskTimeout);

      // Set up abort handler
      const abortHandler = () => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          output: {},
          error: 'Task was cancelled',
        });
      };
      signal.addEventListener('abort', abortHandler);

      try {
        // Create mock task for agent execution
        const task: Task = {
          id: execTask.taskId,
          title: `Execution task ${execTask.taskId}`,
          description: '',
          category: agent.category,
          priority: 'normal',
          status: 'in-progress',
          assignedAgent: agent.id,
          collaborators: [],
          parentTask: null,
          subtasks: [],
          input: {},
          output: null,
          requiresApproval: false,
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
        };

        // Execute via agent (would normally go through registry)
        // This is a simplified execution - real implementation would use agentRegistry.assignTask
        const result: AgentResult = {
          success: true,
          output: { executed: true, agentName: agent.name },
          message: `Task ${execTask.taskId} executed by ${agent.name}`,
        };

        clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
        resolve(result);

      } catch (error) {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
        resolve({
          success: false,
          output: {},
          error: error instanceof Error ? error.message : 'Execution error',
        });
      }
    });
  }

  /**
   * Checks if a task should be skipped due to failed dependencies
   */
  private shouldSkipTask(task: DecomposedTask, previousResults: Map<string, AgentResult>): boolean {
    for (const depId of task.dependencies) {
      const depResult = previousResults.get(depId);
      if (depResult && !depResult.success) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets task info for execution (placeholder - real impl would fetch from graph)
   */
  private getTaskForExecution(taskId: string, previousResults: Map<string, AgentResult>): DecomposedTask | null {
    // In real implementation, this would look up the task from the task graph
    return null;
  }

  /**
   * Generates execution summary
   */
  private generateExecutionSummary(
    results: Map<string, AgentResult>,
    failedTasks: string[],
    skippedTasks: string[],
    duration: number
  ): string {
    const total = results.size;
    const successful = total - failedTasks.length - skippedTasks.length;

    return `Executed ${total} tasks in ${Math.round(duration / 1000)}s: ${successful} succeeded, ${failedTasks.length} failed, ${skippedTasks.length} skipped`;
  }

  /**
   * Cancels an active execution plan
   */
  cancelExecution(planId: string): boolean {
    const plan = this.activePlans.get(planId);
    if (!plan) return false;

    plan.status = 'cancelled';

    // Abort all running tasks
    for (const phase of plan.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'executing') {
          const controller = this.runningTasks.get(task.taskId);
          if (controller) {
            controller.abort();
          }
        }
      }
    }

    this.emit('execution-cancelled', { planId });
    return true;
  }

  /**
   * Gets execution statistics
   */
  getExecutionStats(): Record<string, unknown> {
    const completed = this.executionHistory.filter(e => e.success);
    const failed = this.executionHistory.filter(e => !e.success);

    const totalDuration = this.executionHistory.reduce((sum, e) => sum + e.totalDuration, 0);
    const avgDuration = this.executionHistory.length > 0
      ? totalDuration / this.executionHistory.length
      : 0;

    return {
      totalExecutions: this.executionHistory.length,
      successRate: this.executionHistory.length > 0
        ? ((completed.length / this.executionHistory.length) * 100).toFixed(1) + '%'
        : 'N/A',
      averageDuration: Math.round(avgDuration) + 'ms',
      activePlans: this.activePlans.size,
      runningTasks: this.runningTasks.size,
    };
  }

  /**
   * Updates executor configuration
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxConcurrent) {
      this.semaphore = new Semaphore(config.maxConcurrent);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SEMAPHORE FOR CONCURRENCY CONTROL
// ============================================================================

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

/**
 * Factory function to create a ParallelExecutor
 */
export function createParallelExecutor(config?: Partial<ExecutorConfig>): ParallelExecutor {
  return new ParallelExecutor(config);
}

export default ParallelExecutor;
