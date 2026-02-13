/**
 * Alabobai Core - Export all core modules
 */

// Types
export * from './types.js';

// Agent System
export { AgentRegistry, agentRegistry } from './agent-registry.js';
export type { AgentDefinition, AgentHandler, AgentContext, AgentResult } from './agent-registry.js';

// Orchestrator
export { Orchestrator, getOrchestrator } from './orchestrator.js';

// LLM Client
export { createLLMClient, getDefaultLLMClient } from './llm-client.js';
export type { LLMClient, LLMMessage, LLMConfig } from './llm-client.js';

// Ollama Service (Local LLM)
export * from './llm/index.js';

// Memory
export { createMemoryStore, SQLiteMemoryStore, InMemoryStore } from './memory.js';
export type { MemoryStore, MemoryEntry } from './memory.js';

// Event Stream (Agent Working Memory)
export {
  EventStream,
  createEventStream,
  createEventStreamFromArray,
  estimateTokens,
  calculateEventTokens,
  createToolCallEvent,
  createToolResultEvent,
  createErrorEvent,
  createThoughtEvent,
  createPlanEvent,
  createActionEvent,
  createObservationEvent,
} from './EventStream.js';
export type {
  EventType,
  EventPriority,
  WorkingMemoryEvent,
  EventMetadata,
  EventInput,
  EventQuery,
  EventStreamStats,
} from './EventStream.js';

// File Memory (Persistent Task Memory)
export {
  FileMemory,
  FileMemoryManager,
  createFileMemory,
  createFileMemoryManager,
  parseJSONLFile,
  mergeMemoryFiles,
} from './FileMemory.js';
export type {
  FileMemoryConfig,
  MemoryFileInfo,
  LoadResult,
  FlushResult,
} from './FileMemory.js';

// Context Builder (Smart Context Window Management)
export {
  ContextBuilder,
  DebugContextBuilder,
  PlanningContextBuilder,
  ToolContextBuilder,
  createContextBuilder,
  createDebugContextBuilder,
  createPlanningContextBuilder,
  createToolContextBuilder,
  getContext,
  getRecentContext,
  getContextByTypes,
  mergeContexts,
  estimateEventCapacity,
} from './ContextBuilder.js';
export type {
  ContextBuilderConfig,
  ContextStrategy,
  ContextResult,
  ContextSection,
} from './ContextBuilder.js';

// Voice Interface
export * from './voice/index.js';

// Financial Guardian (Billing & Cost Management)
export * from './billing/index.js';

// Reliability Engine (Confidence, Checkpoints, Fact-Checking, Consistency, Timeouts)
// Note: Checkpoint, CheckpointManager, CheckpointMetadata, createCheckpointManager are excluded
// to avoid conflicts with ../persistence/index.js which exports the same names
export {
  ReliabilityEngine,
  createReliabilityEngine,
  type ReliabilityEngineConfig,
  type ReliableRequest,
  type ReliableResponse,
  type ReliabilityReport,
  ConfidenceScorer,
  createConfidenceScorer,
  SourceQuality,
  type SourceInfo,
  type ConfidenceScore,
  type ConfidenceFactors,
  type ScoringConfig,
  // CheckpointManager exports excluded - use from ../persistence/index.js
  type CheckpointState,
  type CheckpointConfig,
  type ConversationSnapshot,
  type TaskSnapshot,
  type AgentSnapshot,
  type MemorySnapshot,
  type RestoreOptions,
  FactChecker,
  createFactChecker,
  type Claim,
  type ClaimType,
  type VerificationResult,
  type VerificationStatus,
  type VerifiedSource,
  type Contradiction,
  type FactCheckReport,
  type FactCheckerConfig,
  ConsistencyManager,
  createConsistencyManager,
  type ModelVersion,
  type ModelCapabilities,
  type ConsistencyConfig,
  type ConsistencyProfile,
  type ExecutionRecord,
  type ConsistencyCheck,
  type DriftAnalysis,
  type DriftFactor,
  type ConsistencyManagerConfig,
  TimeoutProtector,
  createTimeoutProtector,
  CachedResponseFallback,
  GracefulDegradationFallback,
  type TimeoutConfig,
  type ExecutionContext,
  type ExecutionStatus,
  type FallbackProvider,
  type TimeoutEvent,
  type ExecutionResult,
} from './reliability/index.js';

// Deep Research Engine (Multi-source research, citation tracking, report generation)
export * from './research/index.js';

// Computer Control System (Screen capture, Mouse, Keyboard, Browser, Recording, Intervention)
// Note: ApprovalRequest, ScreenCapture, TaskResult are excluded to avoid conflicts with ./types.js
export {
  ComputerController,
  createComputerController,
  type ComputerControllerConfig,
  type TaskExecution,
  type ExecutionStep,
  type AIAnalysis,
  type TaskResult as ComputerTaskResult,
  type LiveUpdate,
  type ComputerControllerEvents,
  ScreenCapture as ScreenCaptureController,
  createScreenCapture,
  type ScreenCaptureResult,
  type CaptureRegion,
  type ScreenMetadata,
  type DisplayInfo,
  type ScreenCaptureConfig,
  type ContinuousCaptureConfig,
  type ScreenCaptureEvents,
  MouseController,
  createMouseController,
  type MousePosition,
  type MouseBounds,
  type MouseButton,
  type MouseAction,
  type MouseControllerConfig,
  type MouseEvents,
  KeyboardController,
  createKeyboardController,
  type ModifierKey,
  type SpecialKey,
  type KeyboardAction,
  type KeyboardControllerConfig,
  type KeyboardEvents,
  BrowserAutomation,
  createBrowserAutomation,
  type BrowserAction,
  type ElementInfo,
  type PageInfo,
  type BrowserAutomationConfig,
  type NavigationOptions,
  type BrowserEvents,
  ActionRecorder,
  createActionRecorder,
  type RecordedActionType,
  type RecordedAction,
  type SystemAction,
  type AIDecision,
  type ActionMetadata,
  type RecordingSession,
  type SessionMetadata,
  type ActionRecorderConfig,
  type PlaybackOptions,
  type ActionRecorderEvents,
  InterventionHandler,
  createInterventionHandler,
  type InterventionType,
  type InterventionReason,
  type Intervention,
  type ApprovalRequest as ComputerApprovalRequest,
  type ControlState,
  type InterventionHandlerConfig,
  type SafetyCheck,
  type InterventionEvents,
  type StatusUpdate,
} from './computer/index.js';

// Builder Engine (Better than Bolt.new - Code generation, live preview, surgical edits)
export * from './builder/index.js';

// Knowledge Module (Embeddings, Vector Operations, Knowledge Management)
// Exported as a namespace to avoid symbol collisions with llm/voice modules.
export * as knowledge from './knowledge/index.js';

// Local AI Brain (Main Orchestrator - Ollama, Qdrant, RAG, Memory)
export {
  LocalAIBrain,
  createLocalAIBrain,
  createLocalAIBrainSync,
  getDefaultLocalAIBrain,
} from './local-ai-brain.js';

// Brain System (OpenClaw-style Memory, Agentic Loop)
export * as brain from './brain/index.js';

// Code Builder Agent (Self-building capabilities)
export * as agents from './agents/index.js';

// State Persistence (Checkpointing, Task Recovery, Durable Storage)
export * from '../persistence/index.js';
