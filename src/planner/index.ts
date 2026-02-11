/**
 * Alabobai Planner Module
 * Provides intelligent task decomposition, dependency management, and adaptive replanning
 *
 * Components:
 * - PlannerAgent: Decomposes complex tasks into subtasks with dependencies
 * - TaskGraph: DAG structure for representing subtask relationships
 * - Replanner: Handles failures and adapts plans dynamically
 *
 * Usage:
 * ```typescript
 * import { createPlannerAgent, createReplanner } from './planner';
 *
 * const planner = createPlannerAgent(llmClient);
 * const result = await planner.plan({
 *   taskDescription: 'Build a complete business plan with financial projections',
 *   constraints: { maxDurationMs: 300000 }
 * });
 *
 * // Execute the plan
 * const execution = await planner.executePlan(result.planId, async (subtask) => {
 *   // Execute each subtask
 *   return { success: true, output: {}, message: 'Done', verificationResults: [], duration: 1000 };
 * });
 *
 * // If execution fails, use the replanner
 * const replanner = createReplanner(llmClient);
 * if (!execution.success) {
 *   const replanResult = await replanner.replan({
 *     planId: result.planId,
 *     graph: result.graph,
 *     reason: 'subtask-failed',
 *     failedSubtaskId: '...',
 *     errorDetails: '...'
 *   });
 * }
 * ```
 */

// ============================================================================
// PLANNER AGENT
// ============================================================================

export {
  PlannerAgent,
  createPlannerAgent,
  type PlannerConfig,
  type PlanRequest,
  type PlanConstraints,
  type PlanResult,
  type ExecutionResult as PlanExecutionResult,
  type VerificationRequest,
} from './PlannerAgent.js';

// ============================================================================
// TASK GRAPH
// ============================================================================

export {
  TaskGraph,
  createTaskGraph,
  // Types
  type ComplexityLevel,
  type SubtaskStatus,
  type Subtask,
  type SuccessCriterion,
  type ComplexityEstimate,
  type SubtaskResult,
  type VerificationResult,
  type TaskGraphData,
  type TaskGraphOptions,
  type TaskGraphVisualization,
  type VisualizationLayer,
  type VisualizationNode,
  type VisualizationEdge,
  type GraphSummary,
} from './TaskGraph.js';

// ============================================================================
// REPLANNER
// ============================================================================

export {
  Replanner,
  createReplanner,
  // Types
  type ReplannerConfig,
  type ReplanStrategy,
  type ReplanReason,
  type ReplanRequest,
  type ReplanResult,
  type ReplanChange,
  type RecoveryOption,
  type FailureAnalysis,
  type FailureType,
  type PlanCheckpoint,
} from './Replanner.js';

// ============================================================================
// COMBINED PLANNER SYSTEM
// ============================================================================

import { LLMClient } from '../core/llm-client.js';
import { PlannerAgent, PlannerConfig, createPlannerAgent } from './PlannerAgent.js';
import { Replanner, ReplannerConfig, createReplanner } from './Replanner.js';

/**
 * Configuration for the complete planner system
 */
export interface PlannerSystemConfig {
  planner?: Partial<PlannerConfig>;
  replanner?: Partial<ReplannerConfig>;
}

/**
 * Complete planner system with planner and replanner
 */
export interface PlannerSystem {
  planner: PlannerAgent;
  replanner: Replanner;
}

/**
 * Creates a complete planner system with both planner and replanner
 */
export function createPlannerSystem(
  llm: LLMClient,
  config?: PlannerSystemConfig,
  logger?: (message: string, level?: string) => void
): PlannerSystem {
  const planner = createPlannerAgent(llm, config?.planner, logger);
  const replanner = createReplanner(llm, config?.replanner, logger);

  // Set up event forwarding for integrated operation
  planner.on('subtask-failed', (event) => {
    replanner.emit('subtask-failed', event);
  });

  return { planner, replanner };
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

import { TaskGraph as TaskGraphClass, Subtask as SubtaskType, SubtaskResult as SubtaskResultType, createTaskGraph as createTaskGraphFn } from './TaskGraph.js';
import { DecomposedTask, TaskGraph as OrchestratorTaskGraph } from '../agents/orchestrator/TaskDecomposer.js';

/**
 * Converts a PlannerAgent TaskGraph to the Orchestrator's TaskGraph format
 * for integration with the existing orchestration system
 */
export function convertToOrchestratorGraph(plannerGraph: TaskGraphClass): OrchestratorTaskGraph {
  const tasks = new Map<string, DecomposedTask>();

  for (const subtask of plannerGraph.getAllSubtasks()) {
    const decomposedTask: DecomposedTask = {
      id: subtask.id,
      title: subtask.description.substring(0, 60),
      description: subtask.description,
      category: subtask.category,
      priority: subtask.priority,
      dependencies: subtask.dependencies,
      estimatedDuration: subtask.complexityEstimate.estimatedDurationMs,
      requiredCapabilities: [],
      canRunParallel: subtask.dependencies.length === 0,
      metadata: subtask.metadata,
    };
    tasks.set(subtask.id, decomposedTask);
  }

  // Get first subtask as root
  const allSubtasks = plannerGraph.getAllSubtasks();
  const rootSubtask = allSubtasks.find(s => s.dependencies.length === 0) || allSubtasks[0];

  return {
    rootTaskId: rootSubtask?.id || '',
    tasks,
    executionOrder: plannerGraph.visualize().layers.map(layer =>
      layer.subtasks.map(s => s.id)
    ),
    totalEstimatedDuration: plannerGraph.estimatedDuration,
    complexity: mapComplexity(plannerGraph.totalComplexity),
  };
}

/**
 * Maps planner complexity levels to orchestrator complexity levels
 */
function mapComplexity(level: string): 'simple' | 'moderate' | 'complex' {
  switch (level) {
    case 'trivial':
    case 'simple':
      return 'simple';
    case 'moderate':
      return 'moderate';
    case 'complex':
    case 'very-complex':
      return 'complex';
    default:
      return 'moderate';
  }
}

/**
 * Type guard for SubtaskResult
 */
export function isSubtaskResult(result: unknown): result is SubtaskResultType {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    'output' in result &&
    'message' in result &&
    'verificationResults' in result &&
    'duration' in result
  );
}

// ============================================================================
// DEFAULT EXPORTS
// ============================================================================

export default {
  createPlannerAgent,
  createReplanner,
  createTaskGraph: createTaskGraphFn,
  createPlannerSystem,
  convertToOrchestratorGraph,
};
