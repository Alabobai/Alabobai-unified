/**
 * Alabobai Progress Tracker
 * Real-time tracking of all tasks with percentage completion
 * Provides detailed status updates, ETA calculations, and progress notifications
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { Task, TaskStatus, AgentCategory } from '../../core/types.js';
import { TaskGraph, DecomposedTask } from './TaskDecomposer.js';
import { ExecutionPlan, ExecutionPhase } from './ParallelExecutor.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  category: AgentCategory;
  status: TaskStatus | 'queued' | 'running';
  progress: number; // 0-100
  startedAt: Date | null;
  completedAt: Date | null;
  estimatedCompletion: Date | null;
  currentPhase: string | null;
  message: string;
  subtasks: ProgressEntry[];
  parentId: string | null;
  metadata: Record<string, unknown>;
}

export interface OverallProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  queuedTasks: number;
  overallPercent: number;
  estimatedTimeRemaining: number | null; // milliseconds
  startedAt: Date | null;
  estimatedCompletion: Date | null;
  currentAgents: string[];
  phases: PhaseProgress[];
}

export interface PhaseProgress {
  phaseNumber: number;
  status: 'pending' | 'running' | 'executing' | 'completed' | 'failed';
  taskCount: number;
  completedCount: number;
  progress: number;
}

export interface ProgressUpdate {
  entryId: string;
  taskId: string;
  previousProgress: number;
  newProgress: number;
  status: TaskStatus | 'queued' | 'running';
  message: string;
  timestamp: Date;
}

export interface ProgressSummary {
  overall: OverallProgress;
  tasks: ProgressEntry[];
  recentUpdates: ProgressUpdate[];
  activeAgents: Array<{ id: string; name: string; taskId: string; progress: number }>;
}

// ============================================================================
// PROGRESS TRACKER CLASS
// ============================================================================

export class ProgressTracker extends EventEmitter {
  private entries: Map<string, ProgressEntry> = new Map();
  private updates: ProgressUpdate[] = [];
  private maxUpdateHistory: number = 100;
  private activeExecutionPlan: ExecutionPlan | null = null;
  private taskWeights: Map<string, number> = new Map();
  private startTime: Date | null = null;

  constructor() {
    super();
  }

  /**
   * Initializes tracking for a task graph
   */
  initializeFromTaskGraph(graph: TaskGraph): void {
    this.entries.clear();
    this.updates = [];
    this.startTime = new Date();

    // Calculate weights based on estimated duration
    const totalDuration = graph.totalEstimatedDuration || 1;

    for (const [taskId, task] of graph.tasks) {
      const weight = (task.estimatedDuration || 5000) / totalDuration;
      this.taskWeights.set(taskId, weight);

      const entry = this.createEntry(taskId, task);
      this.entries.set(taskId, entry);
    }

    this.emit('tracking-initialized', {
      totalTasks: graph.tasks.size,
      estimatedDuration: graph.totalEstimatedDuration,
    });
  }

  /**
   * Initializes tracking from an execution plan
   */
  initializeFromExecutionPlan(plan: ExecutionPlan, taskGraph: TaskGraph): void {
    this.activeExecutionPlan = plan;
    this.initializeFromTaskGraph(taskGraph);
  }

  /**
   * Creates a progress entry for a task
   */
  private createEntry(taskId: string, task: DecomposedTask | Task): ProgressEntry {
    const isDecomposed = 'estimatedDuration' in task;

    return {
      id: uuid(),
      taskId,
      taskTitle: task.title,
      category: task.category,
      status: 'queued',
      progress: 0,
      startedAt: null,
      completedAt: null,
      estimatedCompletion: null,
      currentPhase: null,
      message: 'Waiting to start',
      subtasks: [],
      parentId: ('parentTask' in task ? task.parentTask : null) || null,
      metadata: isDecomposed ? { dependencies: (task as DecomposedTask).dependencies } : {},
    };
  }

  /**
   * Updates progress for a specific task
   */
  updateProgress(
    taskId: string,
    progress: number,
    options?: {
      status?: TaskStatus | 'queued' | 'running';
      message?: string;
      phase?: string;
      agentName?: string;
    }
  ): void {
    const entry = this.entries.get(taskId);
    if (!entry) {
      console.warn(`[ProgressTracker] Unknown task: ${taskId}`);
      return;
    }

    const previousProgress = entry.progress;
    const clampedProgress = Math.min(100, Math.max(0, progress));

    // Update entry
    entry.progress = clampedProgress;

    if (options?.status) {
      entry.status = options.status;

      if (options.status === 'running' && !entry.startedAt) {
        entry.startedAt = new Date();
        entry.estimatedCompletion = this.estimateCompletion(entry);
      }

      if (options.status === 'completed') {
        entry.progress = 100;
        entry.completedAt = new Date();
        entry.estimatedCompletion = null;
      }

      if (options.status === 'failed') {
        entry.completedAt = new Date();
        entry.estimatedCompletion = null;
      }
    }

    if (options?.message) {
      entry.message = options.message;
    }

    if (options?.phase) {
      entry.currentPhase = options.phase;
    }

    if (options?.agentName) {
      entry.metadata.agentName = options.agentName;
    }

    // Record update
    const update: ProgressUpdate = {
      entryId: entry.id,
      taskId,
      previousProgress,
      newProgress: clampedProgress,
      status: entry.status,
      message: entry.message,
      timestamp: new Date(),
    };

    this.updates.push(update);
    if (this.updates.length > this.maxUpdateHistory) {
      this.updates.shift();
    }

    // Emit progress event
    this.emit('progress-update', {
      taskId,
      progress: clampedProgress,
      status: entry.status,
      overall: this.getOverallProgress(),
    });

    // Check for completion milestones
    this.checkMilestones();
  }

  /**
   * Marks a task as started
   */
  taskStarted(taskId: string, agentName: string): void {
    this.updateProgress(taskId, 5, {
      status: 'running',
      message: `Started by ${agentName}`,
      agentName,
    });
  }

  /**
   * Marks a task as completed
   */
  taskCompleted(taskId: string, message?: string): void {
    this.updateProgress(taskId, 100, {
      status: 'completed',
      message: message || 'Completed successfully',
    });
  }

  /**
   * Marks a task as failed
   */
  taskFailed(taskId: string, error: string): void {
    const entry = this.entries.get(taskId);
    if (entry) {
      this.updateProgress(taskId, entry.progress, {
        status: 'failed',
        message: `Failed: ${error}`,
      });
    }
  }

  /**
   * Updates progress incrementally (adds to current progress)
   */
  incrementProgress(taskId: string, delta: number, message?: string): void {
    const entry = this.entries.get(taskId);
    if (entry) {
      const newProgress = Math.min(100, entry.progress + delta);
      this.updateProgress(taskId, newProgress, { message });
    }
  }

  /**
   * Gets the overall progress summary
   */
  getOverallProgress(): OverallProgress {
    const entries = Array.from(this.entries.values());

    const totalTasks = entries.length;
    const completedTasks = entries.filter(e => e.status === 'completed').length;
    const failedTasks = entries.filter(e => e.status === 'failed').length;
    const runningTasks = entries.filter(e => e.status === 'running' || e.status === 'in-progress').length;
    const queuedTasks = entries.filter(e => e.status === 'queued' || e.status === 'pending').length;

    // Calculate weighted progress
    let weightedProgress = 0;
    let totalWeight = 0;

    for (const entry of entries) {
      const weight = this.taskWeights.get(entry.taskId) || 1 / totalTasks;
      weightedProgress += (entry.progress / 100) * weight;
      totalWeight += weight;
    }

    const overallPercent = totalWeight > 0
      ? Math.round((weightedProgress / totalWeight) * 100)
      : 0;

    // Calculate ETA
    const estimatedTimeRemaining = this.calculateTimeRemaining(overallPercent);

    // Get current agents
    const currentAgents = entries
      .filter(e => e.status === 'running' || e.status === 'in-progress')
      .map(e => e.metadata.agentName as string)
      .filter(Boolean);

    // Calculate phase progress
    const phases = this.calculatePhaseProgress();

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      runningTasks,
      queuedTasks,
      overallPercent,
      estimatedTimeRemaining,
      startedAt: this.startTime,
      estimatedCompletion: estimatedTimeRemaining
        ? new Date(Date.now() + estimatedTimeRemaining)
        : null,
      currentAgents: [...new Set(currentAgents)],
      phases,
    };
  }

  /**
   * Gets the full progress summary
   */
  getProgressSummary(): ProgressSummary {
    const overall = this.getOverallProgress();
    const tasks = Array.from(this.entries.values())
      .filter(e => !e.parentId) // Only top-level tasks
      .map(e => ({
        ...e,
        subtasks: this.getSubtasks(e.taskId),
      }));

    const activeAgents = tasks
      .filter(t => t.status === 'running' || t.status === 'in-progress')
      .map(t => ({
        id: t.metadata.agentName as string || 'unknown',
        name: t.metadata.agentName as string || 'Unknown Agent',
        taskId: t.taskId,
        progress: t.progress,
      }));

    return {
      overall,
      tasks,
      recentUpdates: this.updates.slice(-10),
      activeAgents,
    };
  }

  /**
   * Gets a formatted progress bar string
   */
  getProgressBar(taskId?: string, width: number = 30): string {
    const progress = taskId
      ? this.entries.get(taskId)?.progress || 0
      : this.getOverallProgress().overallPercent;

    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${progress}%`;
  }

  /**
   * Gets a formatted status message
   */
  getStatusMessage(): string {
    const overall = this.getOverallProgress();
    const parts: string[] = [];

    parts.push(`Progress: ${overall.overallPercent}%`);
    parts.push(`(${overall.completedTasks}/${overall.totalTasks} tasks)`);

    if (overall.runningTasks > 0) {
      parts.push(`Running: ${overall.runningTasks}`);
    }

    if (overall.failedTasks > 0) {
      parts.push(`Failed: ${overall.failedTasks}`);
    }

    if (overall.estimatedTimeRemaining) {
      const seconds = Math.ceil(overall.estimatedTimeRemaining / 1000);
      parts.push(`ETA: ${this.formatDuration(seconds * 1000)}`);
    }

    return parts.join(' | ');
  }

  /**
   * Gets subtasks for a parent task
   */
  private getSubtasks(parentId: string): ProgressEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.parentId === parentId);
  }

  /**
   * Estimates completion time for a task
   */
  private estimateCompletion(entry: ProgressEntry): Date | null {
    const weight = this.taskWeights.get(entry.taskId);
    if (!weight || !this.startTime) return null;

    // Estimate based on weight and total estimated duration
    const avgTaskTime = 10000; // 10 seconds average
    const estimatedMs = avgTaskTime / weight;

    return new Date(Date.now() + estimatedMs * (1 - entry.progress / 100));
  }

  /**
   * Calculates remaining time based on progress rate
   */
  private calculateTimeRemaining(currentPercent: number): number | null {
    if (!this.startTime || currentPercent === 0) return null;

    const elapsed = Date.now() - this.startTime.getTime();
    const rate = currentPercent / elapsed; // percent per ms

    if (rate <= 0) return null;

    const remaining = (100 - currentPercent) / rate;
    return Math.round(remaining);
  }

  /**
   * Calculates progress for each execution phase
   */
  private calculatePhaseProgress(): PhaseProgress[] {
    if (!this.activeExecutionPlan) return [];

    return this.activeExecutionPlan.phases.map(phase => {
      const taskIds = phase.tasks.map(t => t.taskId);
      const entries = taskIds.map(id => this.entries.get(id)).filter(Boolean) as ProgressEntry[];

      const completedCount = entries.filter(e =>
        e.status === 'completed'
      ).length;

      const avgProgress = entries.length > 0
        ? entries.reduce((sum, e) => sum + e.progress, 0) / entries.length
        : 0;

      return {
        phaseNumber: phase.phaseNumber,
        status: phase.status,
        taskCount: entries.length,
        completedCount,
        progress: Math.round(avgProgress),
      };
    });
  }

  /**
   * Checks for progress milestones and emits events
   */
  private checkMilestones(): void {
    const overall = this.getOverallProgress();
    const milestones = [25, 50, 75, 100];

    for (const milestone of milestones) {
      if (overall.overallPercent >= milestone) {
        // Only emit once per milestone
        const milestoneKey = `milestone-${milestone}`;
        if (!this.entries.has(milestoneKey)) {
          // Use a dummy entry to track milestone emission
          this.emit('milestone-reached', {
            milestone,
            overall,
            timestamp: new Date(),
          });
        }
      }
    }
  }

  /**
   * Formats a duration in milliseconds to a human-readable string
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Gets progress for a specific task
   */
  getTaskProgress(taskId: string): ProgressEntry | undefined {
    return this.entries.get(taskId);
  }

  /**
   * Gets all tasks with a specific status
   */
  getTasksByStatus(status: TaskStatus | 'queued' | 'running'): ProgressEntry[] {
    return Array.from(this.entries.values()).filter(e => e.status === status);
  }

  /**
   * Resets the tracker
   */
  reset(): void {
    this.entries.clear();
    this.updates = [];
    this.taskWeights.clear();
    this.activeExecutionPlan = null;
    this.startTime = null;
    this.emit('tracking-reset');
  }

  /**
   * Exports progress data for persistence
   */
  exportProgress(): Record<string, unknown> {
    return {
      entries: Array.from(this.entries.values()),
      updates: this.updates,
      startTime: this.startTime,
      overall: this.getOverallProgress(),
    };
  }

  /**
   * Imports previously exported progress data
   */
  importProgress(data: Record<string, unknown>): void {
    if (data.entries && Array.isArray(data.entries)) {
      this.entries.clear();
      for (const entry of data.entries) {
        this.entries.set(entry.taskId, entry as ProgressEntry);
      }
    }

    if (data.updates && Array.isArray(data.updates)) {
      this.updates = data.updates as ProgressUpdate[];
    }

    if (data.startTime) {
      this.startTime = new Date(data.startTime as string);
    }
  }

  /**
   * Subscribes to progress updates for a specific task
   */
  subscribeToTask(taskId: string, callback: (entry: ProgressEntry) => void): () => void {
    const handler = (update: { taskId: string }) => {
      if (update.taskId === taskId) {
        const entry = this.entries.get(taskId);
        if (entry) callback(entry);
      }
    };

    this.on('progress-update', handler);
    return () => this.off('progress-update', handler);
  }

  /**
   * Subscribes to overall progress updates
   */
  subscribeToOverall(callback: (overall: OverallProgress) => void): () => void {
    const handler = (update: { overall: OverallProgress }) => {
      callback(update.overall);
    };

    this.on('progress-update', handler);
    return () => this.off('progress-update', handler);
  }
}

/**
 * Factory function to create a ProgressTracker
 */
export function createProgressTracker(): ProgressTracker {
  return new ProgressTracker();
}

export default ProgressTracker;
