/**
 * Alabobai Orchestrator Module
 * The Central Nervous System - Exports all orchestration components
 *
 * Components:
 * - TaskDecomposer: Breaks complex requests into atomic sub-tasks
 * - AgentRouter: Routes tasks to the best available agent
 * - AgentHandoff: Manages context transfer between agents
 * - ParallelExecutor: Runs multiple agents concurrently
 * - ConflictResolver: Handles agent disagreements
 * - ProgressTracker: Real-time progress tracking with percentages
 * - Orchestrator: Main brain that coordinates everything
 */

// Main Orchestrator
export {
  Orchestrator,
  createOrchestrator,
  getOrchestrator,
  type OrchestratorConfig,
  type OrchestratorResult,
  type AgentResponse,
  type UserRequest,
} from './Orchestrator.js';

// Task Decomposer
export {
  TaskDecomposer,
  createTaskDecomposer,
  type DecomposedTask,
  type TaskGraph,
  type DecompositionResult,
} from './TaskDecomposer.js';

// Agent Router
export {
  AgentRouter,
  createAgentRouter,
  type RoutingDecision,
  type AgentCapabilityProfile,
  type AgentPerformanceMetrics,
  type RoutingContext,
} from './AgentRouter.js';

// Agent Handoff
export {
  AgentHandoff,
  createAgentHandoff,
  type HandoffContext,
  type HandoffReason,
  type HandoffResult,
  type HandoffRequest,
  type PendingAction,
} from './AgentHandoff.js';

// Parallel Executor
export {
  ParallelExecutor,
  createParallelExecutor,
  type ExecutionPlan,
  type ExecutionPhase,
  type ExecutionTask,
  type ExecutionResult,
  type ExecutorConfig,
} from './ParallelExecutor.js';

// Conflict Resolver
export {
  ConflictResolver,
  createConflictResolver,
  type ConflictReport,
  type ConflictType,
  type ConflictingAgent,
  type Resolution,
  type ResolutionStrategy,
} from './ConflictResolver.js';

// Progress Tracker
export {
  ProgressTracker,
  createProgressTracker,
  type ProgressEntry,
  type OverallProgress,
  type PhaseProgress,
  type ProgressUpdate,
  type ProgressSummary,
} from './ProgressTracker.js';

// Default export
import { Orchestrator } from './Orchestrator.js';
export default Orchestrator;
