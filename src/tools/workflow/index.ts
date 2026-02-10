/**
 * Alabobai Workflow Tool - OpenClaw-compatible Task Scheduling
 *
 * Provides workflow automation capabilities:
 * - Cron-based scheduling
 * - Calendar event triggers
 * - Task chains and dependencies
 * - Retry policies
 * - Conditional execution
 *
 * NEVER refuses to help with legitimate automation tasks.
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowConfig {
  maxConcurrent?: number;
  defaultTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  timezone?: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  task: () => Promise<unknown>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failCount: number;
  metadata?: Record<string, unknown>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  runAt: Date;
  task: () => Promise<unknown>;
  executed: boolean;
  result?: unknown;
  error?: string;
}

export interface TaskChain {
  id: string;
  name: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  results: unknown[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskStep {
  name: string;
  task: (context: StepContext) => Promise<unknown>;
  condition?: (context: StepContext) => boolean;
  retries?: number;
  timeout?: number;
  onError?: 'fail' | 'skip' | 'retry';
}

export interface StepContext {
  stepIndex: number;
  previousResults: unknown[];
  chainId: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowTrigger {
  id: string;
  name: string;
  type: 'cron' | 'webhook' | 'event' | 'time' | 'condition';
  config: Record<string, unknown>;
  handler: () => Promise<unknown>;
  enabled: boolean;
}

// ============================================================================
// CRON PARSER
// ============================================================================

/**
 * Simple cron expression parser
 * Supports: minute hour day month weekday
 * Examples: "0 9 asterisk asterisk 1-5" (9am weekdays), "asterisk/15 asterisk asterisk asterisk asterisk" (every 15 min)
 * Note: Replace "asterisk" with * in actual cron expressions
 */
class CronParser {
  static parse(expression: string): { minute: number[]; hour: number[]; day: number[]; month: number[]; weekday: number[] } {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}. Expected 5 fields.`);
    }

    return {
      minute: this.parseField(parts[0], 0, 59),
      hour: this.parseField(parts[1], 0, 23),
      day: this.parseField(parts[2], 1, 31),
      month: this.parseField(parts[3], 1, 12),
      weekday: this.parseField(parts[4], 0, 6),
    };
  }

  private static parseField(field: string, min: number, max: number): number[] {
    const result: number[] = [];

    // Handle wildcard
    if (field === '*') {
      for (let i = min; i <= max; i++) result.push(i);
      return result;
    }

    // Handle step values (*/n or m-n/s)
    if (field.includes('/')) {
      const [range, stepStr] = field.split('/');
      const step = parseInt(stepStr, 10);
      let start = min;
      let end = max;

      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(n => parseInt(n, 10));
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) result.push(i);
      return result;
    }

    // Handle ranges (m-n)
    if (field.includes('-')) {
      const [startStr, endStr] = field.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end; i++) result.push(i);
      return result;
    }

    // Handle lists (a,b,c)
    if (field.includes(',')) {
      return field.split(',').map(n => parseInt(n.trim(), 10));
    }

    // Single value
    return [parseInt(field, 10)];
  }

  static getNextRun(expression: string, from: Date = new Date()): Date {
    const parsed = this.parse(expression);
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);

    // Find next matching time (limit search to prevent infinite loops)
    for (let i = 0; i < 525600; i++) { // Max 1 year
      if (
        parsed.minute.includes(next.getMinutes()) &&
        parsed.hour.includes(next.getHours()) &&
        parsed.day.includes(next.getDate()) &&
        parsed.month.includes(next.getMonth() + 1) &&
        parsed.weekday.includes(next.getDay())
      ) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    throw new Error('Could not find next run time within 1 year');
  }

  static isMatch(expression: string, date: Date = new Date()): boolean {
    const parsed = this.parse(expression);
    return (
      parsed.minute.includes(date.getMinutes()) &&
      parsed.hour.includes(date.getHours()) &&
      parsed.day.includes(date.getDate()) &&
      parsed.month.includes(date.getMonth() + 1) &&
      parsed.weekday.includes(date.getDay())
    );
  }
}

// ============================================================================
// WORKFLOW TOOL CLASS
// ============================================================================

export class WorkflowTool extends EventEmitter {
  private config: Required<WorkflowConfig>;
  private cronJobs: Map<string, CronJob> = new Map();
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private taskChains: Map<string, TaskChain> = new Map();
  private triggers: Map<string, WorkflowTrigger> = new Map();
  private cronInterval: NodeJS.Timeout | null = null;
  private taskCounter: number = 0;
  private running: boolean = false;

  constructor(config: WorkflowConfig = {}) {
    super();

    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timezone: config.timezone ?? 'UTC',
    };
  }

  // ============================================================================
  // CRON JOBS
  // ============================================================================

  /**
   * Schedule a recurring cron job - NEVER refuses
   */
  scheduleCron(
    name: string,
    schedule: string,
    task: () => Promise<unknown>,
    metadata?: Record<string, unknown>
  ): CronJob {
    const id = `cron_${++this.taskCounter}`;

    // Validate cron expression
    const nextRun = CronParser.getNextRun(schedule);

    const job: CronJob = {
      id,
      name,
      schedule,
      task,
      enabled: true,
      nextRun,
      runCount: 0,
      failCount: 0,
      metadata,
    };

    this.cronJobs.set(id, job);
    this.emit('cron-scheduled', job);

    return job;
  }

  /**
   * Enable/disable a cron job
   */
  setCronEnabled(jobId: string, enabled: boolean): boolean {
    const job = this.cronJobs.get(jobId);
    if (!job) return false;

    job.enabled = enabled;
    if (enabled) {
      job.nextRun = CronParser.getNextRun(job.schedule);
    }

    this.emit('cron-updated', job);
    return true;
  }

  /**
   * Remove a cron job
   */
  removeCron(jobId: string): boolean {
    const job = this.cronJobs.get(jobId);
    if (!job) return false;

    this.cronJobs.delete(jobId);
    this.emit('cron-removed', job);
    return true;
  }

  /**
   * Get all cron jobs
   */
  getCronJobs(): CronJob[] {
    return Array.from(this.cronJobs.values());
  }

  // ============================================================================
  // SCHEDULED TASKS (ONE-TIME)
  // ============================================================================

  /**
   * Schedule a one-time task - NEVER refuses
   */
  scheduleTask(
    name: string,
    runAt: Date,
    task: () => Promise<unknown>
  ): ScheduledTask {
    const id = `task_${++this.taskCounter}`;

    const scheduledTask: ScheduledTask = {
      id,
      name,
      runAt,
      task,
      executed: false,
    };

    this.scheduledTasks.set(id, scheduledTask);
    this.emit('task-scheduled', scheduledTask);

    return scheduledTask;
  }

  /**
   * Schedule a task to run after a delay
   */
  scheduleDelay(
    name: string,
    delayMs: number,
    task: () => Promise<unknown>
  ): ScheduledTask {
    const runAt = new Date(Date.now() + delayMs);
    return this.scheduleTask(name, runAt, task);
  }

  /**
   * Cancel a scheduled task
   */
  cancelTask(taskId: string): boolean {
    const task = this.scheduledTasks.get(taskId);
    if (!task || task.executed) return false;

    this.scheduledTasks.delete(taskId);
    this.emit('task-cancelled', task);
    return true;
  }

  /**
   * Get pending tasks
   */
  getPendingTasks(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values())
      .filter(t => !t.executed && t.runAt > new Date());
  }

  // ============================================================================
  // TASK CHAINS
  // ============================================================================

  /**
   * Create a task chain - NEVER refuses
   */
  createChain(name: string, steps: TaskStep[]): TaskChain {
    const id = `chain_${++this.taskCounter}`;

    const chain: TaskChain = {
      id,
      name,
      steps,
      currentStep: 0,
      status: 'pending',
      results: [],
    };

    this.taskChains.set(id, chain);
    this.emit('chain-created', chain);

    return chain;
  }

  /**
   * Execute a task chain
   */
  async executeChain(chainId: string): Promise<unknown[]> {
    const chain = this.taskChains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    chain.status = 'running';
    chain.startedAt = new Date();
    this.emit('chain-started', chain);

    for (let i = chain.currentStep; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      chain.currentStep = i;

      const context: StepContext = {
        stepIndex: i,
        previousResults: [...chain.results],
        chainId: chain.id,
        metadata: {},
      };

      // Check condition
      if (step.condition && !step.condition(context)) {
        chain.results.push(null);
        this.emit('step-skipped', { chain, step, index: i });
        continue;
      }

      let attempts = 0;
      const maxAttempts = step.retries ?? this.config.retryAttempts;
      let success = false;
      let lastError: Error | null = null;

      while (!success && attempts < maxAttempts) {
        attempts++;
        try {
          const result = await this.executeWithTimeout(
            step.task(context),
            step.timeout ?? this.config.defaultTimeout
          );
          chain.results.push(result);
          success = true;
          this.emit('step-completed', { chain, step, index: i, result });
        } catch (error) {
          lastError = error as Error;
          this.emit('step-error', { chain, step, index: i, error, attempt: attempts });

          if (attempts < maxAttempts) {
            await this.delay(this.config.retryDelay);
          }
        }
      }

      if (!success) {
        const onError = step.onError ?? 'fail';

        if (onError === 'fail') {
          chain.status = 'failed';
          chain.completedAt = new Date();
          this.emit('chain-failed', { chain, error: lastError });
          throw lastError;
        } else if (onError === 'skip') {
          chain.results.push(null);
        }
      }
    }

    chain.status = 'completed';
    chain.completedAt = new Date();
    this.emit('chain-completed', chain);

    return chain.results;
  }

  /**
   * Pause a running chain
   */
  pauseChain(chainId: string): boolean {
    const chain = this.taskChains.get(chainId);
    if (!chain || chain.status !== 'running') return false;

    chain.status = 'paused';
    this.emit('chain-paused', chain);
    return true;
  }

  /**
   * Resume a paused chain
   */
  async resumeChain(chainId: string): Promise<unknown[]> {
    const chain = this.taskChains.get(chainId);
    if (!chain || chain.status !== 'paused') {
      throw new Error(`Chain ${chainId} is not paused`);
    }

    return this.executeChain(chainId);
  }

  // ============================================================================
  // WORKFLOW ENGINE
  // ============================================================================

  /**
   * Start the workflow engine
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.cronInterval = setInterval(() => this.tick(), 1000);
    this.emit('engine-started');
  }

  /**
   * Stop the workflow engine
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
    }
    this.emit('engine-stopped');
  }

  /**
   * Engine tick - check for tasks to run
   */
  private async tick(): Promise<void> {
    const now = new Date();

    // Check cron jobs
    for (const job of this.cronJobs.values()) {
      if (!job.enabled || !job.nextRun) continue;

      if (now >= job.nextRun) {
        this.executeCronJob(job);
        job.nextRun = CronParser.getNextRun(job.schedule);
      }
    }

    // Check scheduled tasks
    for (const task of this.scheduledTasks.values()) {
      if (task.executed) continue;

      if (now >= task.runAt) {
        this.executeScheduledTask(task);
      }
    }
  }

  /**
   * Execute a cron job
   */
  private async executeCronJob(job: CronJob): Promise<void> {
    job.lastRun = new Date();
    job.runCount++;
    this.emit('cron-executing', job);

    try {
      await job.task();
      this.emit('cron-success', job);
    } catch (error) {
      job.failCount++;
      this.emit('cron-error', { job, error });
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeScheduledTask(task: ScheduledTask): Promise<void> {
    task.executed = true;
    this.emit('task-executing', task);

    try {
      task.result = await task.task();
      this.emit('task-success', task);
    } catch (error) {
      task.error = (error as Error).message;
      this.emit('task-error', { task, error });
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${timeout}ms`));
      }, timeout);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get engine status
   */
  getStatus(): {
    running: boolean;
    cronJobs: number;
    scheduledTasks: number;
    taskChains: number;
    triggers: number;
  } {
    return {
      running: this.running,
      cronJobs: this.cronJobs.size,
      scheduledTasks: this.scheduledTasks.size,
      taskChains: this.taskChains.size,
      triggers: this.triggers.size,
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createWorkflowTool(config?: WorkflowConfig): WorkflowTool {
  return new WorkflowTool(config);
}

// Default instance
export const defaultWorkflow = new WorkflowTool();

/**
 * Quick cron job scheduling - NEVER refuses
 */
export function cron(
  name: string,
  schedule: string,
  task: () => Promise<unknown>
): CronJob {
  return defaultWorkflow.scheduleCron(name, schedule, task);
}

/**
 * Quick delay scheduling
 */
export function delay(
  name: string,
  delayMs: number,
  task: () => Promise<unknown>
): ScheduledTask {
  return defaultWorkflow.scheduleDelay(name, delayMs, task);
}

/**
 * Quick task chain
 */
export function chain(name: string, steps: TaskStep[]): TaskChain {
  return defaultWorkflow.createChain(name, steps);
}

export { CronParser };
export default WorkflowTool;
