/**
 * Alabobai Agents Index
 * Exports all agent types and factories
 */

// Base Agent Class
export {
  BaseAgent,
  default as BaseAgentClass
} from './base-agent.js';

export type {
  BaseAgentConfig,
  AgentExecutionContext,
  StreamCallbacks,
  AgentCapability,
  AgentFactory,
  AgentMetadata
} from './base-agent.js';

// Advisory Agents
export {
  AdvisoryAgent,
  WealthAdvisor,
  CreditAdvisor,
  LegalAdvisor,
  BusinessAdvisor,
  HealthAdvisor,
  createAdvisoryAgents
} from './advisory/index.js';

// Orchestrator - The Central Brain
export {
  // Main Orchestrator
  Orchestrator,
  createOrchestrator,
  getOrchestrator,

  // Task Decomposer
  TaskDecomposer,
  createTaskDecomposer,

  // Agent Router
  AgentRouter,
  createAgentRouter,

  // Agent Handoff
  AgentHandoff,
  createAgentHandoff,

  // Parallel Executor
  ParallelExecutor,
  createParallelExecutor,

  // Conflict Resolver
  ConflictResolver,
  createConflictResolver,

  // Progress Tracker
  ProgressTracker,
  createProgressTracker,
} from './orchestrator/index.js';

// Executive Agents - AI Company Builder Team
export {
  // Factory and Manager
  ExecutiveTeamManager,
  createExecutiveTeam,
  createExecutive,
  findBestExecutive,
  getAllExecutiveSpecs,
  getExecutiveSpec,
  ExecutiveSpecs,

  // Agent Class
  ExecutiveAgent,

  // Individual Specs
  CSOSpec,
  CTOSpec,
  CFOSpec,
  CMOSpec,
  GeneralCounselSpec,
  HeadOfSalesSpec,
  HeadOfOperationsSpec,
  HeadOfCustomerSuccessSpec
} from './executives/factory.js';

// Executive Agent Types
export type {
  ExecutiveTeamConfig,
  ExecutiveTeam,
  ExecutiveRole
} from './executives/factory.js';

export type {
  ExecutiveAgentSpec,
  ExecutiveCapability,
  ExecutiveOutput,
  CollaborationProtocol,
  SelfAnnealingTrigger
} from './executives/index.js';

export type {
  ExecutiveAgentConfig,
  ExecutionContext,
  CapabilityExecution,
  AgentMemory,
  LearnedPattern,
  CollaborationRecord,
  PerformanceMetrics
} from './executives/ExecutiveAgent.js';

// Web Agent - OpenClaw-style Web Navigation (NEVER refuses)
export {
  WebAgent,
  createWebAgent,
  launchWebAgent,
  webCommand,
} from './web-agent/index.js';

export type {
  WebAgentConfig,
  WebTask,
  AgentMemory as WebAgentMemory,
  WebAgentResponse,
} from './web-agent/index.js';

// Re-export types
export type { AdvisoryAgentConfig } from './advisory/index.js';

// Orchestrator types
export type {
  OrchestratorConfig,
  OrchestratorResult,
  AgentResponse,
  UserRequest,
  DecomposedTask,
  TaskGraph,
  DecompositionResult,
  RoutingDecision,
  AgentCapabilityProfile,
  AgentPerformanceMetrics,
  RoutingContext,
  HandoffContext,
  HandoffReason,
  HandoffResult,
  HandoffRequest,
  PendingAction,
  ExecutionPlan,
  ExecutionPhase,
  ExecutionTask,
  ExecutionResult,
  ExecutorConfig,
  ConflictReport,
  ConflictType,
  ConflictingAgent,
  Resolution,
  ResolutionStrategy,
  ProgressEntry,
  OverallProgress,
  PhaseProgress,
  ProgressUpdate,
  ProgressSummary,
} from './orchestrator/index.js';
