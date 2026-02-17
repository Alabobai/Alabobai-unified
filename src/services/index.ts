/**
 * Alabobai Services Index
 * Exports all service modules for the platform
 */

// LLM Service - Production-ready LLM integration
export {
  LLMService,
  createLLMService,
  getDefaultLLMService,
  default as LLMServiceClass
} from './llm.js';

export type {
  LLMProvider,
  LLMServiceConfig,
  ChatMessage,
  ChatOptions,
  StreamOptions,
  LLMResponse,
  LLMUsageStats
} from './llm.js';

// Orchestrator Service - Routes commands to department agents
export {
  OrchestratorService,
  createOrchestratorService,
  getOrchestratorService,
  DEPARTMENTS,
  default as OrchestratorServiceClass
} from './orchestrator.js';

export type {
  Department,
  CommandIntent,
  CommandResult,
  StreamingCommandResult,
  OrchestratorConfig,
  ConversationSession
} from './orchestrator.js';

// AI Service - Department-based AI assistance (existing)
export {
  DEPARTMENTS as AI_DEPARTMENTS,
  chat,
  streamChat,
  detectDepartment,
  getDepartmentInfo,
  listDepartments
} from './ai.js';

export type {
  DepartmentKey,
  Message as AIMessage,
  ChatOptions as AIChatOptions
} from './ai.js';

// Payments Service (existing)
export * from './payments.js';

// Computer Control Service - Browser automation for Live Workspace
export {
  ComputerControlService,
  createComputerControl,
} from './computer-control.js';

export type {
  BrowserSession,
  BrowserAction,
  ActionType,
  ActionData,
  ComputerControlConfig,
  CursorUpdate,
} from './computer-control.js';

// Screen Capture Service - Real-time screen streaming
export {
  ScreenCaptureService,
  createScreenCapture,
} from './screen-capture.js';

export type {
  CaptureFrame,
  CursorState,
  ScreenState,
  CaptureConfig,
  StreamSubscriber,
} from './screen-capture.js';

// VM Sandbox Service - Secure environment management
export {
  VMSandboxService,
  createVMSandbox,
} from './vm-sandbox.js';

export type {
  SandboxConfig,
  SandboxEnvironment,
  SandboxStatus,
  ResourceUsage,
  SecurityViolation,
  ViolationType,
  SandboxPolicy,
  PolicyRule,
} from './vm-sandbox.js';

// Health Monitoring Service
export {
  HealthMonitor,
  createHealthMonitor,
  getHealthMonitor,
  initializeHealthMonitor,
  default as HealthMonitorClass
} from './health.js';

export type {
  HealthStatus,
  ServiceHealth,
  SystemMetrics,
  PerformanceMetrics,
  HealthCheckConfig
} from './health.js';

// Code Sandbox Service - Docker-based secure code execution
export {
  CodeSandboxService,
  createCodeSandbox,
  getCodeSandbox,
  default as CodeSandboxClass
} from './codeSandbox.js';

export type {
  SupportedLanguage,
  ExecutionRequest,
  ExecutionOutput,
  ExecutionResult,
  ExecutionStatus,
  SandboxSession,
  SandboxConfig as CodeSandboxConfig
} from './codeSandbox.js';

// Memory Service - Persistent Memory System
export {
  MemoryService,
  getMemoryService,
  createMemoryService,
} from './memoryService.js';

export type {
  Memory,
  MemoryType,
  MemoryCreateInput,
  MemorySearchOptions,
  MemorySearchResult,
  ConsolidationResult,
  MemoryStats,
  PrivacySetting,
} from './memoryService.js';

// Vector Store - Embedding and Similarity Search
export {
  VectorStore,
  getVectorStore,
  createVectorStore,
  generateEmbedding,
  cosineSimilarity,
  euclideanDistance,
} from './vectorStore.js';

export type {
  VectorEntry,
  SearchResult,
  SearchOptions,
} from './vectorStore.js';

// Memory Extractor - Extract Memories from Conversations
export {
  MemoryExtractor,
  getMemoryExtractor,
  createMemoryExtractor,
} from './memoryExtractor.js';

export type {
  ConversationMessage,
  ExtractedFact,
  PreferenceDetection,
  ExtractionResult,
} from './memoryExtractor.js';
