/**
 * Alabobai Replanner
 * Handles adaptive replanning when subtasks fail or circumstances change
 * Provides recovery strategies and plan adjustments while maintaining goal coherence
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { LLMClient } from '../core/llm-client.js';
import { AgentCategory, TaskPriority } from '../core/types.js';
import {
  TaskGraph,
  createTaskGraph,
  Subtask,
  SubtaskStatus,
  SubtaskResult,
  ComplexityLevel,
} from './TaskGraph.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the Replanner
 */
export interface ReplannerConfig {
  maxReplanAttempts: number;
  enableAutoReplan: boolean;
  replanStrategies: ReplanStrategy[];
  minSuccessRateForContinue: number; // Continue without replan if success rate is above this
  cooldownBetweenReplansMs: number;
}

/**
 * Strategy for replanning
 */
export type ReplanStrategy =
  | 'retry'           // Simply retry the failed subtask
  | 'alternative'     // Find an alternative approach
  | 'decompose'       // Break failed subtask into smaller pieces
  | 'skip'            // Skip the failed subtask and adjust dependents
  | 'escalate'        // Escalate to human/different agent
  | 'rollback';       // Rollback to previous checkpoint

/**
 * Reason for replanning
 */
export type ReplanReason =
  | 'subtask-failed'
  | 'timeout-exceeded'
  | 'constraint-violated'
  | 'resource-unavailable'
  | 'context-changed'
  | 'user-intervention'
  | 'goal-modified';

/**
 * Request for replanning
 */
export interface ReplanRequest {
  planId: string;
  graph: TaskGraph;
  reason: ReplanReason;
  failedSubtaskId?: string;
  errorDetails?: string;
  newContext?: Record<string, unknown>;
  userFeedback?: string;
}

/**
 * Result of replanning
 */
export interface ReplanResult {
  success: boolean;
  replanId: string;
  strategy: ReplanStrategy;
  originalGraph: TaskGraph;
  newGraph: TaskGraph;
  changes: ReplanChange[];
  reasoning: string;
  warnings: string[];
  error?: string;
}

/**
 * A single change made during replanning
 */
export interface ReplanChange {
  type: 'add' | 'remove' | 'modify' | 'reorder';
  subtaskId: string;
  description: string;
  before?: Partial<Subtask>;
  after?: Partial<Subtask>;
}

/**
 * Recovery option for a failed subtask
 */
export interface RecoveryOption {
  strategy: ReplanStrategy;
  confidence: number;
  description: string;
  estimatedDurationMs: number;
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites?: string[];
}

/**
 * Analysis of a failure
 */
export interface FailureAnalysis {
  subtaskId: string;
  failureType: FailureType;
  rootCause: string;
  affectedSubtasks: string[];
  recoveryOptions: RecoveryOption[];
  recommendation: RecoveryOption;
}

export type FailureType =
  | 'transient'       // Temporary failure, retry may work
  | 'dependency'      // Dependency issue
  | 'capability'      // Agent lacks capability
  | 'resource'        // Resource not available
  | 'logic'           // Logical error in approach
  | 'external'        // External service failure
  | 'unknown';

/**
 * Checkpoint for rollback
 */
export interface PlanCheckpoint {
  id: string;
  planId: string;
  timestamp: Date;
  graphSnapshot: string; // JSON serialized graph
  completedSubtasks: string[];
  reason: string;
}

const DEFAULT_CONFIG: ReplannerConfig = {
  maxReplanAttempts: 3,
  enableAutoReplan: true,
  replanStrategies: ['retry', 'alternative', 'decompose', 'skip'],
  minSuccessRateForContinue: 0.7,
  cooldownBetweenReplansMs: 5000,
};

// ============================================================================
// REPLANNER CLASS
// ============================================================================

export class Replanner extends EventEmitter {
  private llm: LLMClient;
  private config: ReplannerConfig;
  private replanHistory: Map<string, ReplanResult[]> = new Map();
  private checkpoints: Map<string, PlanCheckpoint[]> = new Map();
  private replanCooldowns: Map<string, number> = new Map();
  private logger: (message: string, level?: string) => void;

  constructor(
    llm: LLMClient,
    config?: Partial<ReplannerConfig>,
    logger?: (message: string, level?: string) => void
  ) {
    super();
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || ((msg, level) => console.log(`[Replanner] [${level || 'INFO'}] ${msg}`));
  }

  // ============================================================================
  // MAIN REPLANNING METHODS
  // ============================================================================

  /**
   * Determines if replanning is needed and performs it
   */
  async shouldReplan(
    graph: TaskGraph,
    failedSubtaskId?: string
  ): Promise<{ shouldReplan: boolean; reason: string }> {
    // Check cooldown
    const lastReplan = this.replanCooldowns.get(graph.id);
    if (lastReplan && Date.now() - lastReplan < this.config.cooldownBetweenReplansMs) {
      return { shouldReplan: false, reason: 'Cooldown period active' };
    }

    // Check replan attempt count
    const history = this.replanHistory.get(graph.id) || [];
    if (history.length >= this.config.maxReplanAttempts) {
      return { shouldReplan: false, reason: 'Maximum replan attempts reached' };
    }

    // Check success rate
    const summary = graph.getSummary();
    const successRate = summary.totalSubtasks > 0
      ? (summary.completedSubtasks / (summary.completedSubtasks + summary.failedSubtasks))
      : 1;

    if (successRate >= this.config.minSuccessRateForContinue && !failedSubtaskId) {
      return { shouldReplan: false, reason: 'Success rate acceptable' };
    }

    // If we have failed subtasks blocking progress, we should replan
    const blockedSubtasks = graph.getSubtasksByStatus('blocked');
    if (blockedSubtasks.length > 0) {
      return {
        shouldReplan: true,
        reason: `${blockedSubtasks.length} subtasks are blocked due to failures`,
      };
    }

    // If there's a specific failed subtask with dependents, we should replan
    if (failedSubtaskId) {
      const dependents = graph.getDependents(failedSubtaskId);
      if (dependents.length > 0) {
        return {
          shouldReplan: true,
          reason: `Failed subtask ${failedSubtaskId} is blocking ${dependents.length} dependents`,
        };
      }
    }

    return { shouldReplan: false, reason: 'No replanning needed' };
  }

  /**
   * Performs replanning for a failed or problematic plan
   */
  async replan(request: ReplanRequest): Promise<ReplanResult> {
    const replanId = uuid();
    const startTime = Date.now();

    this.logger(`Starting replan ${replanId} for plan ${request.planId}, reason: ${request.reason}`);
    this.emit('replan-started', { replanId, planId: request.planId, reason: request.reason });

    // Create checkpoint before replanning
    this.createCheckpoint(request.planId, request.graph, `Before replan: ${request.reason}`);

    try {
      // Step 1: Analyze the failure
      let failureAnalysis: FailureAnalysis | null = null;
      if (request.failedSubtaskId) {
        failureAnalysis = await this.analyzeFailure(
          request.graph,
          request.failedSubtaskId,
          request.errorDetails
        );
        this.emit('failure-analyzed', { replanId, analysis: failureAnalysis });
      }

      // Step 2: Determine best strategy
      const strategy = failureAnalysis
        ? failureAnalysis.recommendation.strategy
        : await this.determineStrategy(request);

      this.logger(`Selected strategy: ${strategy}`);

      // Step 3: Apply the strategy
      let newGraph: TaskGraph;
      let changes: ReplanChange[];

      switch (strategy) {
        case 'retry':
          ({ graph: newGraph, changes } = await this.applyRetryStrategy(request));
          break;

        case 'alternative':
          ({ graph: newGraph, changes } = await this.applyAlternativeStrategy(request, failureAnalysis));
          break;

        case 'decompose':
          ({ graph: newGraph, changes } = await this.applyDecomposeStrategy(request, failureAnalysis));
          break;

        case 'skip':
          ({ graph: newGraph, changes } = await this.applySkipStrategy(request, failureAnalysis));
          break;

        case 'escalate':
          ({ graph: newGraph, changes } = await this.applyEscalateStrategy(request, failureAnalysis));
          break;

        case 'rollback':
          ({ graph: newGraph, changes } = await this.applyRollbackStrategy(request));
          break;

        default:
          throw new Error(`Unknown replan strategy: ${strategy}`);
      }

      // Step 4: Validate the new graph
      const validation = newGraph.validateNoCycles();
      if (!validation.valid) {
        throw new Error(`Replanning created a cycle: ${validation.cycle?.join(' -> ')}`);
      }

      // Update cooldown
      this.replanCooldowns.set(request.graph.id, Date.now());

      const result: ReplanResult = {
        success: true,
        replanId,
        strategy,
        originalGraph: request.graph,
        newGraph,
        changes,
        reasoning: this.generateReasoning(strategy, changes, failureAnalysis),
        warnings: this.generateWarnings(newGraph, changes),
      };

      // Store in history
      const history = this.replanHistory.get(request.planId) || [];
      history.push(result);
      this.replanHistory.set(request.planId, history);

      this.emit('replan-completed', { replanId, success: true, changesCount: changes.length });
      this.logger(`Replan ${replanId} completed with ${changes.length} changes`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown replanning error';
      this.logger(`Replan ${replanId} failed: ${errorMessage}`, 'ERROR');
      this.emit('replan-failed', { replanId, error: errorMessage });

      return {
        success: false,
        replanId,
        strategy: 'retry',
        originalGraph: request.graph,
        newGraph: request.graph,
        changes: [],
        reasoning: '',
        warnings: [],
        error: errorMessage,
      };
    }
  }

  // ============================================================================
  // FAILURE ANALYSIS
  // ============================================================================

  /**
   * Analyzes a failure to determine root cause and recovery options
   */
  private async analyzeFailure(
    graph: TaskGraph,
    failedSubtaskId: string,
    errorDetails?: string
  ): Promise<FailureAnalysis> {
    const failedSubtask = graph.getSubtask(failedSubtaskId);
    if (!failedSubtask) {
      throw new Error(`Failed subtask not found: ${failedSubtaskId}`);
    }

    // Get affected subtasks (dependents)
    const affectedSubtasks = this.getAffectedSubtasks(graph, failedSubtaskId);

    // Use LLM to analyze the failure
    const prompt = `Analyze this task failure and suggest recovery options:

FAILED TASK:
Description: ${failedSubtask.description}
Category: ${failedSubtask.category}

ERROR DETAILS:
${errorDetails || 'No error details provided'}

AFFECTED TASKS (blocked by this failure):
${affectedSubtasks.map(s => `- ${s.description}`).join('\n') || 'None'}

SUCCESS CRITERIA THAT WERE NOT MET:
${failedSubtask.successCriteria.map(c => `- ${c.description}: ${c.isMet ? 'Met' : 'Not met'}`).join('\n')}

Analyze the failure and respond in JSON:
{
  "failureType": "transient|dependency|capability|resource|logic|external|unknown",
  "rootCause": "Brief explanation of the root cause",
  "recoveryOptions": [
    {
      "strategy": "retry|alternative|decompose|skip|escalate|rollback",
      "confidence": 0.8,
      "description": "How this strategy would work",
      "estimatedMinutes": 5,
      "riskLevel": "low|medium|high",
      "prerequisites": ["Any required conditions"]
    }
  ],
  "recommendedStrategy": "retry|alternative|decompose|skip|escalate|rollback"
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are an expert at analyzing task failures and suggesting recovery strategies. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const recoveryOptions: RecoveryOption[] = (parsed.recoveryOptions || []).map((opt: any) => ({
          strategy: this.normalizeStrategy(opt.strategy),
          confidence: opt.confidence || 0.5,
          description: opt.description || '',
          estimatedDurationMs: (opt.estimatedMinutes || 5) * 60 * 1000,
          riskLevel: opt.riskLevel || 'medium',
          prerequisites: opt.prerequisites || [],
        }));

        // If no options, provide defaults
        if (recoveryOptions.length === 0) {
          recoveryOptions.push({
            strategy: 'retry',
            confidence: 0.5,
            description: 'Retry the failed subtask',
            estimatedDurationMs: failedSubtask.complexityEstimate.estimatedDurationMs,
            riskLevel: 'low',
          });
        }

        const recommendedStrategy = this.normalizeStrategy(parsed.recommendedStrategy) || recoveryOptions[0].strategy;
        const recommendation = recoveryOptions.find(o => o.strategy === recommendedStrategy) || recoveryOptions[0];

        return {
          subtaskId: failedSubtaskId,
          failureType: this.normalizeFailureType(parsed.failureType),
          rootCause: parsed.rootCause || 'Unknown root cause',
          affectedSubtasks: affectedSubtasks.map(s => s.id),
          recoveryOptions,
          recommendation,
        };
      }
    } catch (error) {
      this.logger(`Failure analysis LLM call failed: ${error}`, 'WARN');
    }

    // Default analysis
    return {
      subtaskId: failedSubtaskId,
      failureType: 'unknown',
      rootCause: 'Unable to determine root cause',
      affectedSubtasks: affectedSubtasks.map(s => s.id),
      recoveryOptions: [{
        strategy: 'retry',
        confidence: 0.5,
        description: 'Retry the failed subtask',
        estimatedDurationMs: failedSubtask.complexityEstimate.estimatedDurationMs,
        riskLevel: 'low',
      }],
      recommendation: {
        strategy: 'retry',
        confidence: 0.5,
        description: 'Retry the failed subtask',
        estimatedDurationMs: failedSubtask.complexityEstimate.estimatedDurationMs,
        riskLevel: 'low',
      },
    };
  }

  /**
   * Gets all subtasks affected by a failure (recursive dependents)
   */
  private getAffectedSubtasks(graph: TaskGraph, subtaskId: string): Subtask[] {
    const affected: Subtask[] = [];
    const visited = new Set<string>();
    const queue = [subtaskId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const dependents = graph.getDependents(currentId);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          affected.push(dep);
          queue.push(dep.id);
        }
      }
    }

    return affected;
  }

  /**
   * Determines the best strategy when no specific failure analysis is available
   */
  private async determineStrategy(request: ReplanRequest): Promise<ReplanStrategy> {
    switch (request.reason) {
      case 'subtask-failed':
        return 'retry';
      case 'timeout-exceeded':
        return 'decompose';
      case 'constraint-violated':
        return 'alternative';
      case 'resource-unavailable':
        return 'skip';
      case 'context-changed':
        return 'alternative';
      case 'user-intervention':
        return 'alternative';
      case 'goal-modified':
        return 'rollback';
      default:
        return 'retry';
    }
  }

  // ============================================================================
  // STRATEGY IMPLEMENTATIONS
  // ============================================================================

  /**
   * Retry strategy: Reset the failed subtask to pending
   */
  private async applyRetryStrategy(
    request: ReplanRequest
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    if (!request.failedSubtaskId) {
      return { graph: request.graph, changes };
    }

    const subtask = request.graph.getSubtask(request.failedSubtaskId);
    if (!subtask) {
      return { graph: request.graph, changes };
    }

    // Reset the failed subtask
    const beforeState = { status: subtask.status };
    request.graph.updateSubtask(request.failedSubtaskId, {
      status: 'pending',
      result: null,
      startedAt: null,
      completedAt: null,
    });

    changes.push({
      type: 'modify',
      subtaskId: request.failedSubtaskId,
      description: `Reset subtask for retry`,
      before: beforeState,
      after: { status: 'pending' },
    });

    // Unblock any blocked dependents
    const blocked = request.graph.getSubtasksByStatus('blocked');
    for (const dep of blocked) {
      if (dep.dependencies.includes(request.failedSubtaskId)) {
        request.graph.updateSubtask(dep.id, { status: 'pending' });
        changes.push({
          type: 'modify',
          subtaskId: dep.id,
          description: `Unblocked dependent subtask`,
          before: { status: 'blocked' },
          after: { status: 'pending' },
        });
      }
    }

    return { graph: request.graph, changes };
  }

  /**
   * Alternative strategy: Find an alternative approach for the failed subtask
   */
  private async applyAlternativeStrategy(
    request: ReplanRequest,
    analysis: FailureAnalysis | null
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    if (!request.failedSubtaskId) {
      return { graph: request.graph, changes };
    }

    const failedSubtask = request.graph.getSubtask(request.failedSubtaskId);
    if (!failedSubtask) {
      return { graph: request.graph, changes };
    }

    // Use LLM to find an alternative approach
    const prompt = `Find an alternative approach for this failed task:

ORIGINAL TASK:
${failedSubtask.description}

FAILURE REASON:
${analysis?.rootCause || request.errorDetails || 'Unknown'}

ORIGINAL STEPS:
${failedSubtask.detailedSteps.join('\n') || 'Not specified'}

Suggest an alternative approach that avoids the issue. Respond in JSON:
{
  "alternativeDescription": "New approach description",
  "alternativeSteps": ["Step 1", "Step 2"],
  "category": "advisory|computer-control|builder|research",
  "reasoning": "Why this alternative should work"
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are an expert at finding alternative approaches to failed tasks. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Update the subtask with alternative approach
        const beforeState = {
          description: failedSubtask.description,
          detailedSteps: failedSubtask.detailedSteps,
        };

        request.graph.updateSubtask(request.failedSubtaskId, {
          description: parsed.alternativeDescription || failedSubtask.description,
          detailedSteps: parsed.alternativeSteps || failedSubtask.detailedSteps,
          category: this.normalizeCategory(parsed.category) || failedSubtask.category,
          status: 'pending',
          result: null,
          startedAt: null,
          completedAt: null,
          metadata: {
            ...failedSubtask.metadata,
            alternativeApproach: true,
            originalDescription: failedSubtask.description,
          },
        });

        changes.push({
          type: 'modify',
          subtaskId: request.failedSubtaskId,
          description: `Applied alternative approach: ${parsed.reasoning}`,
          before: beforeState,
          after: {
            description: parsed.alternativeDescription,
            detailedSteps: parsed.alternativeSteps,
          },
        });
      }
    } catch (error) {
      this.logger(`Alternative strategy LLM call failed: ${error}`, 'WARN');
      // Fall back to retry
      return this.applyRetryStrategy(request);
    }

    // Unblock dependents
    const blocked = request.graph.getSubtasksByStatus('blocked');
    for (const dep of blocked) {
      if (dep.dependencies.includes(request.failedSubtaskId)) {
        request.graph.updateSubtask(dep.id, { status: 'pending' });
        changes.push({
          type: 'modify',
          subtaskId: dep.id,
          description: `Unblocked dependent subtask`,
          before: { status: 'blocked' },
          after: { status: 'pending' },
        });
      }
    }

    return { graph: request.graph, changes };
  }

  /**
   * Decompose strategy: Break the failed subtask into smaller pieces
   */
  private async applyDecomposeStrategy(
    request: ReplanRequest,
    analysis: FailureAnalysis | null
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    if (!request.failedSubtaskId) {
      return { graph: request.graph, changes };
    }

    const failedSubtask = request.graph.getSubtask(request.failedSubtaskId);
    if (!failedSubtask) {
      return { graph: request.graph, changes };
    }

    // Use LLM to decompose into smaller subtasks
    const prompt = `Break down this failed task into smaller, more manageable subtasks:

FAILED TASK:
${failedSubtask.description}

FAILURE REASON:
${analysis?.rootCause || request.errorDetails || 'Task was too complex'}

Break this into 2-4 smaller subtasks that together accomplish the original goal. Respond in JSON:
{
  "subtasks": [
    {
      "description": "Smaller subtask description",
      "steps": ["Step 1", "Step 2"],
      "category": "advisory|computer-control|builder|research",
      "dependsOnPrevious": false
    }
  ],
  "reasoning": "Why this decomposition should work"
}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are an expert at breaking complex tasks into simpler parts. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.subtasks && parsed.subtasks.length > 0) {
          // Remove the failed subtask
          const dependents = request.graph.getDependents(request.failedSubtaskId);
          const originalDependencies = [...failedSubtask.dependencies];

          // We can't actually remove, so mark as skipped
          request.graph.updateSubtask(request.failedSubtaskId, {
            status: 'skipped',
            metadata: { ...failedSubtask.metadata, decomposed: true },
          });

          changes.push({
            type: 'modify',
            subtaskId: request.failedSubtaskId,
            description: `Marked original subtask as skipped (decomposed)`,
            before: { status: failedSubtask.status },
            after: { status: 'skipped' },
          });

          // Add new decomposed subtasks
          let previousSubtaskId: string | null = null;
          const newSubtaskIds: string[] = [];

          for (let i = 0; i < parsed.subtasks.length; i++) {
            const sub = parsed.subtasks[i];
            const dependencies = sub.dependsOnPrevious && previousSubtaskId
              ? [previousSubtaskId]
              : (i === 0 ? originalDependencies : []);

            const newSubtask = request.graph.addSubtask(sub.description, {
              parentId: request.failedSubtaskId,
              dependencies,
              category: this.normalizeCategory(sub.category) || failedSubtask.category,
              priority: failedSubtask.priority,
              detailedSteps: sub.steps || [],
              successCriteria: [{
                description: `Successfully complete: ${sub.description}`,
                verificationType: 'llm-check',
              }],
              metadata: { decomposedFrom: request.failedSubtaskId },
            });

            newSubtaskIds.push(newSubtask.id);
            previousSubtaskId = newSubtask.id;

            changes.push({
              type: 'add',
              subtaskId: newSubtask.id,
              description: `Added decomposed subtask: ${sub.description.substring(0, 50)}`,
              after: { description: sub.description },
            });
          }

          // Update dependents to depend on the last new subtask
          if (newSubtaskIds.length > 0) {
            const lastNewSubtaskId = newSubtaskIds[newSubtaskIds.length - 1];
            for (const dep of dependents) {
              // Update dependencies
              const newDeps = dep.dependencies
                .filter(d => d !== request.failedSubtaskId)
                .concat([lastNewSubtaskId]);

              request.graph.updateSubtask(dep.id, {
                dependencies: newDeps,
                status: 'pending',
              });

              changes.push({
                type: 'modify',
                subtaskId: dep.id,
                description: `Updated dependencies to use decomposed subtasks`,
                before: { dependencies: dep.dependencies },
                after: { dependencies: newDeps },
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger(`Decompose strategy LLM call failed: ${error}`, 'WARN');
      // Fall back to retry
      return this.applyRetryStrategy(request);
    }

    return { graph: request.graph, changes };
  }

  /**
   * Skip strategy: Skip the failed subtask and adjust dependents
   */
  private async applySkipStrategy(
    request: ReplanRequest,
    analysis: FailureAnalysis | null
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    if (!request.failedSubtaskId) {
      return { graph: request.graph, changes };
    }

    const failedSubtask = request.graph.getSubtask(request.failedSubtaskId);
    if (!failedSubtask) {
      return { graph: request.graph, changes };
    }

    // Mark as skipped
    request.graph.updateSubtask(request.failedSubtaskId, {
      status: 'skipped',
      metadata: { ...failedSubtask.metadata, skippedReason: analysis?.rootCause || 'Unable to complete' },
    });

    changes.push({
      type: 'modify',
      subtaskId: request.failedSubtaskId,
      description: `Skipped subtask: ${analysis?.rootCause || 'Unable to complete'}`,
      before: { status: failedSubtask.status },
      after: { status: 'skipped' },
    });

    // Update dependents to remove this dependency
    const dependents = request.graph.getDependents(request.failedSubtaskId);
    for (const dep of dependents) {
      const newDeps = dep.dependencies.filter(d => d !== request.failedSubtaskId);
      request.graph.updateSubtask(dep.id, {
        dependencies: newDeps,
        status: newDeps.every(d => {
          const depSubtask = request.graph.getSubtask(d);
          return depSubtask?.status === 'completed';
        }) ? 'ready' : 'pending',
      });

      changes.push({
        type: 'modify',
        subtaskId: dep.id,
        description: `Removed dependency on skipped subtask`,
        before: { dependencies: dep.dependencies },
        after: { dependencies: newDeps },
      });
    }

    return { graph: request.graph, changes };
  }

  /**
   * Escalate strategy: Mark for human/different agent handling
   */
  private async applyEscalateStrategy(
    request: ReplanRequest,
    analysis: FailureAnalysis | null
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    if (!request.failedSubtaskId) {
      return { graph: request.graph, changes };
    }

    const failedSubtask = request.graph.getSubtask(request.failedSubtaskId);
    if (!failedSubtask) {
      return { graph: request.graph, changes };
    }

    // Update subtask to require escalation
    request.graph.updateSubtask(request.failedSubtaskId, {
      status: 'pending',
      result: null,
      metadata: {
        ...failedSubtask.metadata,
        requiresEscalation: true,
        escalationReason: analysis?.rootCause || request.errorDetails,
        previousCategory: failedSubtask.category,
      },
      // Change category to orchestrator for routing to human/different agent
      category: 'orchestrator' as AgentCategory,
    });

    changes.push({
      type: 'modify',
      subtaskId: request.failedSubtaskId,
      description: `Escalated subtask for manual handling`,
      before: { category: failedSubtask.category },
      after: { category: 'orchestrator', metadata: { requiresEscalation: true } },
    });

    return { graph: request.graph, changes };
  }

  /**
   * Rollback strategy: Restore to a previous checkpoint
   */
  private async applyRollbackStrategy(
    request: ReplanRequest
  ): Promise<{ graph: TaskGraph; changes: ReplanChange[] }> {
    const changes: ReplanChange[] = [];

    const checkpoints = this.checkpoints.get(request.planId);
    if (!checkpoints || checkpoints.length === 0) {
      this.logger('No checkpoints available for rollback', 'WARN');
      return { graph: request.graph, changes };
    }

    // Get the most recent checkpoint
    const checkpoint = checkpoints[checkpoints.length - 1];

    try {
      // Parse the checkpoint
      const snapshotData = JSON.parse(checkpoint.graphSnapshot);

      // Create a new graph from the snapshot
      const newGraph = createTaskGraph(snapshotData.rootTaskDescription, {}, this.logger.bind(this));

      // Restore subtasks
      for (const subtask of snapshotData.subtasks) {
        newGraph.addSubtask(subtask.description, {
          parentId: subtask.parentId,
          dependencies: [], // Add in second pass
          successCriteria: subtask.successCriteria,
          complexity: subtask.complexityEstimate,
          category: subtask.category,
          priority: subtask.priority,
          detailedSteps: subtask.detailedSteps,
          metadata: subtask.metadata,
        });
      }

      changes.push({
        type: 'modify',
        subtaskId: 'entire-graph',
        description: `Rolled back to checkpoint: ${checkpoint.reason}`,
        before: { description: `Graph status: ${request.graph.status}` },
        after: { description: 'Graph status: pending' },
      });

      return { graph: newGraph, changes };

    } catch (error) {
      this.logger(`Rollback failed: ${error}`, 'ERROR');
      return { graph: request.graph, changes };
    }
  }

  // ============================================================================
  // CHECKPOINT MANAGEMENT
  // ============================================================================

  /**
   * Creates a checkpoint of the current graph state
   */
  createCheckpoint(planId: string, graph: TaskGraph, reason: string): PlanCheckpoint {
    const checkpoint: PlanCheckpoint = {
      id: uuid(),
      planId,
      timestamp: new Date(),
      graphSnapshot: JSON.stringify(graph.toJSON()),
      completedSubtasks: graph.getSubtasksByStatus('completed').map(s => s.id),
      reason,
    };

    const checkpoints = this.checkpoints.get(planId) || [];
    checkpoints.push(checkpoint);

    // Keep only last 5 checkpoints
    if (checkpoints.length > 5) {
      checkpoints.shift();
    }

    this.checkpoints.set(planId, checkpoints);
    this.logger(`Created checkpoint ${checkpoint.id} for plan ${planId}`);

    return checkpoint;
  }

  /**
   * Gets all checkpoints for a plan
   */
  getCheckpoints(planId: string): PlanCheckpoint[] {
    return this.checkpoints.get(planId) || [];
  }

  /**
   * Clears checkpoints for a plan
   */
  clearCheckpoints(planId: string): void {
    this.checkpoints.delete(planId);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private normalizeStrategy(strategy: string): ReplanStrategy {
    const normalized = strategy?.toLowerCase() || 'retry';
    const valid: ReplanStrategy[] = ['retry', 'alternative', 'decompose', 'skip', 'escalate', 'rollback'];
    return valid.includes(normalized as ReplanStrategy) ? (normalized as ReplanStrategy) : 'retry';
  }

  private normalizeFailureType(type: string): FailureType {
    const normalized = type?.toLowerCase() || 'unknown';
    const valid: FailureType[] = ['transient', 'dependency', 'capability', 'resource', 'logic', 'external', 'unknown'];
    return valid.includes(normalized as FailureType) ? (normalized as FailureType) : 'unknown';
  }

  private normalizeCategory(category: string): AgentCategory | undefined {
    const mapping: Record<string, AgentCategory> = {
      'advisory': 'advisory',
      'computer-control': 'computer-control',
      'builder': 'builder',
      'research': 'research',
    };
    return mapping[category?.toLowerCase()];
  }

  private generateReasoning(
    strategy: ReplanStrategy,
    changes: ReplanChange[],
    analysis: FailureAnalysis | null
  ): string {
    const parts = [
      `Applied ${strategy} strategy with ${changes.length} changes.`,
    ];

    if (analysis) {
      parts.push(`Root cause: ${analysis.rootCause}.`);
    }

    const addedCount = changes.filter(c => c.type === 'add').length;
    const modifiedCount = changes.filter(c => c.type === 'modify').length;

    if (addedCount > 0) {
      parts.push(`Added ${addedCount} new subtask(s).`);
    }
    if (modifiedCount > 0) {
      parts.push(`Modified ${modifiedCount} existing subtask(s).`);
    }

    return parts.join(' ');
  }

  private generateWarnings(graph: TaskGraph, changes: ReplanChange[]): string[] {
    const warnings: string[] = [];

    // Check if too many changes
    if (changes.length > 5) {
      warnings.push('Large number of changes made; please review the updated plan');
    }

    // Check if graph is getting too complex
    if (graph.subtaskCount > 15) {
      warnings.push('Plan has grown complex; consider simplifying');
    }

    // Check for skipped subtasks
    const skipped = graph.getSubtasksByStatus('skipped');
    if (skipped.length > 0) {
      warnings.push(`${skipped.length} subtask(s) were skipped; results may be incomplete`);
    }

    return warnings;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Gets replanner statistics
   */
  getStats(): Record<string, unknown> {
    let totalReplans = 0;
    let successfulReplans = 0;
    const strategyCount: Record<string, number> = {};

    for (const history of this.replanHistory.values()) {
      for (const result of history) {
        totalReplans++;
        if (result.success) successfulReplans++;
        strategyCount[result.strategy] = (strategyCount[result.strategy] || 0) + 1;
      }
    }

    return {
      totalReplans,
      successfulReplans,
      successRate: totalReplans > 0 ? `${((successfulReplans / totalReplans) * 100).toFixed(1)}%` : 'N/A',
      strategyUsage: strategyCount,
      activeCheckpoints: Array.from(this.checkpoints.values()).reduce((sum, c) => sum + c.length, 0),
    };
  }

  /**
   * Updates replanner configuration
   */
  updateConfig(config: Partial<ReplannerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger('Configuration updated');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createReplanner(
  llm: LLMClient,
  config?: Partial<ReplannerConfig>,
  logger?: (message: string, level?: string) => void
): Replanner {
  return new Replanner(llm, config, logger);
}

export default Replanner;
