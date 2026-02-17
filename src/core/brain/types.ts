/**
 * Alabobai Brain System Types
 * OpenClaw-style brain/memory system type definitions
 */

// ============================================================================
// MEMORY FILE TYPES
// ============================================================================

export type MemoryFileType = 'AGENTS' | 'MEMORY' | 'USER' | 'WORKSPACE';

export interface MemoryFile {
  type: MemoryFileType;
  path: string;
  content: string;
  lastModified: Date;
  tokens: number;
}

export interface MemoryDirectory {
  root: string;
  files: {
    agents: string;
    memory: string;
    user: string;
    workspace: string;
  };
  subdirs: {
    conversations: string;
    knowledge: string;
  };
}

// ============================================================================
// BRAIN MEMORY TYPES
// ============================================================================

export interface BrainMemoryConfig {
  /** Root directory for memory files (default: ~/.alabobai/brain) */
  rootDir: string;
  /** Maximum tokens for each memory file */
  maxTokensPerFile: number;
  /** Whether to auto-save on changes */
  autoSave: boolean;
  /** Auto-save interval in milliseconds */
  autoSaveInterval: number;
  /** Whether to create default files on init */
  createDefaults: boolean;
}

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface DailyConversation {
  date: string;
  entries: ConversationEntry[];
  summary?: string;
  topics?: string[];
}

export interface KnowledgeChunk {
  id: string;
  source: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: string;
    tags: string[];
    createdAt: Date;
    accessCount: number;
    relevanceScore?: number;
  };
}

// ============================================================================
// AGENTIC LOOP TYPES
// ============================================================================

export type LoopPhase = 'think' | 'plan' | 'act' | 'observe';

export interface ThinkResult {
  analysis: string;
  intent: string;
  confidence: number;
  requiresTools: boolean;
  clarificationNeeded: boolean;
  clarificationQuestion?: string;
}

export interface PlanStep {
  id: string;
  description: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  dependsOn?: string[];
  optional?: boolean;
  maxRetries?: number;
  /** Expected outcome of this step */
  expectedOutcome?: string;
  /** Current status of this step */
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  estimatedDuration?: number;
  fallbackPlan?: Plan;
}

export interface PlanResult {
  reasoning: string;
  steps: PlanStep[];
  estimatedSteps: number;
  risks: string[];
}

export interface ActionResult {
  stepId?: string;
  success?: boolean;
  output?: unknown;
  error?: string;
  duration?: number;
  retryCount?: number;
  /** Number of steps executed (agentic loop) */
  stepsExecuted?: number;
  /** Number of steps succeeded (agentic loop) */
  stepsSucceeded?: number;
  /** Number of steps failed (agentic loop) */
  stepsFailed?: number;
  /** Results from each step (agentic loop) */
  results?: StepResult[];
  /** Error messages (agentic loop) */
  errors?: string[];
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: string;
  error?: string;
  toolUsed?: string;
}

export interface Observation {
  stepId: string;
  analysis: string;
  goalProgress: number;
  needsReplan: boolean;
  nextAction?: string;
  insights?: string[];
}

export interface ObserveResult {
  taskComplete: boolean;
  summary: string;
  remainingWork: string[];
  nextSteps: string[];
  confidence: number;
  learnings: string[];
}

export interface LoopIteration {
  phase?: LoopPhase;
  timestamp?: Date;
  input?: unknown;
  output?: unknown;
  duration?: number;
  /** Iteration number (agentic loop) */
  number?: number;
  /** Phases executed in this iteration (agentic loop) */
  phases?: {
    think?: ThinkResult;
    plan?: PlanResult;
    act?: ActionResult;
    observe?: ObserveResult;
  };
  /** Start time in milliseconds (agentic loop) */
  startTime?: number;
  /** End time in milliseconds (agentic loop) */
  endTime?: number;
  /** Whether this iteration completed the task (agentic loop) */
  isComplete?: boolean;
  /** Whether this iteration was cancelled (agentic loop) */
  cancelled?: boolean;
  /** Error message if iteration failed (agentic loop) */
  error?: string;
}

export interface AgenticLoopConfig {
  /** Maximum iterations before stopping */
  maxIterations: number;
  /** Timeout per iteration in milliseconds */
  iterationTimeout?: number;
  /** Maximum retries per action */
  maxRetries?: number;
  /** Enable streaming of intermediate results */
  enableStreaming?: boolean;
  /** Thinking level (1-5, higher = more detailed) */
  thinkingLevel?: number;
  /** Enable self-reflection after actions */
  enableReflection?: boolean;
  /** Maximum tokens per step */
  maxTokensPerStep?: number;
  /** Timeout for thinking phase in milliseconds */
  thinkingTimeout?: number;
  /** Timeout for action phase in milliseconds */
  actionTimeout?: number;
  /** Whether to execute actions in parallel */
  parallelActions?: boolean;
  /** Whether to require confirmation before executing */
  requireConfirmation?: boolean;
  /** Whether to stop on first error */
  stopOnError?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface LoopState {
  id?: string;
  goal?: string;
  phase?: LoopPhase;
  iterations: LoopIteration[];
  currentPlan?: Plan;
  executedSteps?: string[];
  failedSteps?: string[];
  isComplete: boolean;
  finalResult?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  /** Task description (agentic loop) */
  task?: string;
  /** Context for the task (agentic loop) */
  context?: string;
  /** Current iteration number (agentic loop) */
  currentIteration?: number;
  /** Current phase (agentic loop) */
  currentPhase?: LoopPhase;
  /** Whether the loop is running (agentic loop) */
  isRunning?: boolean;
  /** Start time in milliseconds (agentic loop) */
  startTime?: number;
  /** End time in milliseconds (agentic loop) */
  endTime?: number;
  /** Final answer from the loop (agentic loop) */
  finalAnswer?: string;
}

// ============================================================================
// HYBRID SEARCH TYPES
// ============================================================================

export interface VectorSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface KeywordSearchResult {
  id: string;
  score: number;
  content: string;
  matchedTerms: string[];
  metadata: Record<string, unknown>;
}

export interface HybridSearchResult {
  id: string;
  combinedScore: number;
  vectorScore?: number;
  keywordScore?: number;
  content: string;
  metadata: Record<string, unknown>;
  source: 'vector' | 'keyword' | 'both';
}

export interface HybridSearchConfig {
  /** Weight for vector search (0-1) */
  vectorWeight: number;
  /** Weight for keyword search (0-1) */
  keywordWeight: number;
  /** Minimum score threshold for results */
  minScore: number;
  /** Maximum results to return */
  maxResults: number;
  /** Enable Reciprocal Rank Fusion */
  useRRF: boolean;
  /** RRF constant (typically 60) */
  rrfK: number;
}

export interface SearchFilter {
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  types?: string[];
  sources?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export type ThinkingLevel = 'fast' | 'balanced' | 'thorough' | 'deep';

export interface SessionConfig {
  /** Session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Model to use for this session */
  model: string;
  /** Thinking level */
  thinkingLevel: ThinkingLevel;
  /** System prompt override */
  systemPrompt?: string;
  /** Maximum context tokens */
  maxContextTokens: number;
  /** Enable tool use */
  enableTools: boolean;
  /** Allowed tools (empty = all) */
  allowedTools: string[];
  /** Session timeout in milliseconds */
  timeout: number;
}

export interface SessionState {
  id: string;
  config: SessionConfig;
  messages: ConversationEntry[];
  activeLoop?: LoopState;
  context: Map<string, unknown>;
  createdAt: Date;
  lastActivityAt: Date;
  tokenCount: number;
  isActive: boolean;
}

export interface SessionTranscript {
  sessionId: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  messages: ConversationEntry[];
  loops: LoopState[];
  summary?: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// CONTEXT BUILDER TYPES
// ============================================================================

export interface ContextSource {
  type: 'memory' | 'workspace' | 'user' | 'agents' | 'conversation' | 'knowledge' | 'tools';
  content: string;
  priority: number;
  tokens: number;
  metadata?: Record<string, unknown>;
}

export interface ContextBuildOptions {
  /** Maximum total tokens */
  maxTokens: number;
  /** Include memory files */
  includeMemory: boolean;
  /** Include workspace context */
  includeWorkspace: boolean;
  /** Include user preferences */
  includeUser: boolean;
  /** Include agent guidelines */
  includeAgents: boolean;
  /** Include recent conversation history */
  includeConversation: boolean;
  /** Number of recent messages to include */
  recentMessageCount: number;
  /** Include relevant knowledge chunks */
  includeKnowledge: boolean;
  /** Knowledge search query */
  knowledgeQuery?: string;
  /** Include tool descriptions */
  includeTools: boolean;
  /** Custom priority overrides */
  priorityOverrides?: Partial<Record<ContextSource['type'], number>>;
}

export interface BuiltContext {
  systemPrompt: string;
  contextSections: ContextSource[];
  totalTokens: number;
  truncated: boolean;
  truncationDetails?: {
    originalTokens: number;
    removedSections: string[];
  };
}

// ============================================================================
// TOOL TYPES
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  requiresApproval?: boolean;
  category?: string;
  examples?: Array<{
    args: Record<string, unknown>;
    description: string;
  }>;
}

export interface ToolExecutionResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error?: string;
  duration: number;
  approvalRequired?: boolean;
  approvalId?: string;
}

// ============================================================================
// CALLBACK TYPES
// ============================================================================

export interface AgenticLoopCallbacks {
  onPhaseChange?: (phase: LoopPhase, data: unknown) => void;
  onThink?: (result: ThinkResult) => void;
  onPlan?: (plan: Plan) => void;
  onAction?: (step: PlanStep, result: ActionResult) => void;
  onObserve?: (observation: Observation) => void;
  onIteration?: (iteration: LoopIteration) => void;
  onComplete?: (state: LoopState) => void;
  onError?: (error: Error, state: LoopState) => void;
  onStream?: (token: string) => void;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type BrainEvent =
  | { type: 'memory:loaded'; file: MemoryFileType }
  | { type: 'memory:saved'; file: MemoryFileType }
  | { type: 'memory:updated'; file: MemoryFileType; section?: string }
  | { type: 'conversation:added'; entry: ConversationEntry }
  | { type: 'knowledge:indexed'; chunk: KnowledgeChunk }
  | { type: 'loop:started'; state: LoopState }
  | { type: 'loop:phase-changed'; phase: LoopPhase; state: LoopState }
  | { type: 'loop:completed'; state: LoopState }
  | { type: 'loop:error'; error: Error; state: LoopState }
  | { type: 'session:created'; session: SessionState }
  | { type: 'session:updated'; session: SessionState }
  | { type: 'session:ended'; session: SessionState }
  | { type: 'search:completed'; query: string; results: HybridSearchResult[] }
  | { type: 'context:built'; context: BuiltContext };
