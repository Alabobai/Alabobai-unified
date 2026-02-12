/**
 * Alabobai LLM Types
 * Configuration and type definitions for Local AI and LLM interactions
 */

// ============================================================================
// OLLAMA TYPES
// ============================================================================

export interface OllamaConfig {
  baseUrl: string;
  timeout: number;
  healthCheckInterval: number;
}

export interface OllamaModel {
  name: string;
  modifiedAt: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameterSize: string;
    quantizationLevel: string;
  };
}

export interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Base64 encoded images for vision models
}

export interface OllamaChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  numPredict?: number;
  stop?: string[];
  seed?: number;
  numCtx?: number;
  repeatPenalty?: number;
}

export interface OllamaGenerateOptions extends OllamaChatOptions {
  format?: 'json';
  raw?: boolean;
  template?: string;
}

export interface OllamaToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface OllamaTool {
  type: 'function';
  function: OllamaToolFunction;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaChatResponse {
  model: string;
  createdAt: string;
  message: {
    role: string;
    content: string;
    toolCalls?: OllamaToolCall[];
  };
  done: boolean;
  totalDuration?: number;
  loadDuration?: number;
  promptEvalCount?: number;
  promptEvalDuration?: number;
  evalCount?: number;
  evalDuration?: number;
}

export interface OllamaStreamChunk {
  model: string;
  createdAt: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

// ============================================================================
// QDRANT VECTOR DATABASE TYPES
// ============================================================================

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  timeout: number;
}

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

export interface QdrantCollectionInfo {
  name: string;
  vectorSize: number;
  pointsCount: number;
  status: 'green' | 'yellow' | 'red';
}

export interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  mustNot?: QdrantCondition[];
}

export interface QdrantCondition {
  key: string;
  match?: { value: string | number | boolean };
  range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai' | 'local';
  model: string;
  dimensions: number;
  batchSize: number;
  maxRetries: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount?: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model: string;
  totalTokens?: number;
}

// ============================================================================
// RAG (RETRIEVAL AUGMENTED GENERATION) TYPES
// ============================================================================

export interface RAGConfig {
  topK: number;
  minScore: number;
  maxContextTokens: number;
  includeMetadata: boolean;
  reranking: boolean;
  hybridSearch: boolean;
}

export interface RAGDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  embedding?: number[];
  score?: number;
}

export interface DocumentMetadata {
  source: string;
  sourceType: 'file' | 'url' | 'api' | 'manual';
  filename?: string;
  fileType?: string;
  url?: string;
  title?: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  chunkIndex?: number;
  totalChunks?: number;
  tags?: string[];
  collection?: string;
  [key: string]: unknown;
}

export interface RAGQuery {
  query: string;
  filter?: QdrantFilter;
  topK?: number;
  minScore?: number;
  collections?: string[];
  includeMetadata?: boolean;
}

export interface RAGResult {
  query: string;
  documents: RAGDocument[];
  totalFound: number;
  searchTime: number;
  reranked: boolean;
}

export interface RAGContext {
  documents: RAGDocument[];
  contextText: string;
  totalTokens: number;
  sourceCitations: string[];
}

// ============================================================================
// DOCUMENT PROCESSING TYPES
// ============================================================================

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
}

export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  separator: string;
  minChunkSize: number;
  preserveParagraphs: boolean;
}

export interface DocumentLoader {
  load(source: string): Promise<DocumentChunk[]>;
  supportedTypes: string[];
}

export interface ProcessedDocument {
  id: string;
  source: string;
  chunks: DocumentChunk[];
  metadata: DocumentMetadata;
  processedAt: Date;
}

// ============================================================================
// MODEL SELECTION TYPES
// ============================================================================

export type TaskType =
  | 'chat'
  | 'completion'
  | 'code'
  | 'analysis'
  | 'summarization'
  | 'translation'
  | 'embedding'
  | 'vision';

export interface ModelCapabilities {
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;
  languages: string[];
  specializations: TaskType[];
}

export interface ModelInfo {
  name: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'groq';
  capabilities: ModelCapabilities;
  isAvailable: boolean;
  lastChecked: Date;
}

export interface ModelSelectionCriteria {
  taskType: TaskType;
  preferLocal: boolean;
  requireVision: boolean;
  requireTools: boolean;
  minContextWindow: number;
  preferredLanguage?: string;
}

// ============================================================================
// CONVERSATION MEMORY TYPES
// ============================================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokenCount?: number;
    ragContext?: RAGContext;
    toolCalls?: OllamaToolCall[];
    toolResults?: Record<string, unknown>;
  };
}

export interface ConversationHistory {
  id: string;
  userId: string;
  messages: ConversationMessage[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ConversationMemoryConfig {
  maxMessages: number;
  maxTokens: number;
  summarizeAfter: number;
  includeSystemPrompt: boolean;
  persistToDisk: boolean;
}

// ============================================================================
// BRAIN CONFIGURATION TYPES
// ============================================================================

export interface LocalAIBrainConfig {
  // Ollama settings
  ollama: {
    baseUrl: string;
    defaultModel: string;
    embeddingModel: string;
    timeout: number;
  };

  // Qdrant settings
  qdrant: {
    url: string;
    apiKey?: string;
    defaultCollection: string;
    vectorSize: number;
  };

  // RAG settings
  rag: RAGConfig;

  // Chunking settings
  chunking: ChunkingConfig;

  // Memory settings
  memory: ConversationMemoryConfig;

  // Model selection
  modelSelection: {
    preferLocal: boolean;
    fallbackToCloud: boolean;
    autoSelect: boolean;
  };

  // System settings
  system: {
    systemPrompt: string;
    maxConcurrentRequests: number;
    requestTimeout: number;
    enableLogging: boolean;
  };
}

// ============================================================================
// SERVICE STATUS TYPES
// ============================================================================

export interface ServiceStatus {
  name: string;
  available: boolean;
  latency?: number;
  lastChecked: Date;
  error?: string;
  details?: Record<string, unknown>;
}

export interface BrainHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    ollama: ServiceStatus;
    qdrant: ServiceStatus;
    embedding: ServiceStatus;
  };
  models: ModelInfo[];
  collections: QdrantCollectionInfo[];
  timestamp: Date;
}

// ============================================================================
// STREAM CALLBACK TYPES
// ============================================================================

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  onStatus?: (status: string) => void;
  onToolCall?: (toolCall: OllamaToolCall) => void;
  onRAGContext?: (context: RAGContext) => void;
}

// ============================================================================
// CHAT OPTIONS
// ============================================================================

export interface ChatOptions {
  // RAG options
  useKnowledge: boolean;
  collections?: string[];
  ragFilter?: QdrantFilter;

  // Generation options
  stream: boolean;
  temperature?: number;
  maxTokens?: number;

  // Model options
  model?: string;
  forceLocal?: boolean;

  // Tool options
  tools?: OllamaTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };

  // Context options
  includeHistory?: boolean;
  maxHistoryMessages?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  ragContext?: RAGContext;
  toolCalls?: OllamaToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// INGESTION TYPES
// ============================================================================

export interface IngestionOptions {
  collection?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  chunkingOverride?: Partial<ChunkingConfig>;
  skipDuplicates?: boolean;
}

export interface IngestionResult {
  documentId: string;
  source: string;
  chunksCreated: number;
  totalTokens: number;
  processingTime: number;
  collection: string;
  success: boolean;
  error?: string;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  timeout: 120000,
  healthCheckInterval: 30000,
};

export const DEFAULT_QDRANT_CONFIG: QdrantConfig = {
  url: 'http://localhost:6333',
  timeout: 30000,
};

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'ollama',
  model: 'nomic-embed-text',
  dimensions: 768,
  batchSize: 32,
  maxRetries: 3,
};

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  topK: 5,
  minScore: 0.7,
  maxContextTokens: 4000,
  includeMetadata: true,
  reranking: false,
  hybridSearch: false,
};

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separator: '\n\n',
  minChunkSize: 100,
  preserveParagraphs: true,
};

export const DEFAULT_MEMORY_CONFIG: ConversationMemoryConfig = {
  maxMessages: 50,
  maxTokens: 8000,
  summarizeAfter: 20,
  includeSystemPrompt: true,
  persistToDisk: true,
};

export const DEFAULT_BRAIN_CONFIG: LocalAIBrainConfig = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    embeddingModel: 'nomic-embed-text',
    timeout: 120000,
  },
  qdrant: {
    url: 'http://localhost:6333',
    defaultCollection: 'alabobai_knowledge',
    vectorSize: 768,
  },
  rag: DEFAULT_RAG_CONFIG,
  chunking: DEFAULT_CHUNKING_CONFIG,
  memory: DEFAULT_MEMORY_CONFIG,
  modelSelection: {
    preferLocal: true,
    fallbackToCloud: true,
    autoSelect: true,
  },
  system: {
    systemPrompt: `You are Alabobai, an intelligent AI assistant with access to a local knowledge base.
When answering questions, use the provided context from the knowledge base when relevant.
Always cite your sources when using information from the knowledge base.
If you don't have relevant information in the knowledge base, say so and provide your best general knowledge.
Be helpful, accurate, and concise.`,
    maxConcurrentRequests: 5,
    requestTimeout: 120000,
    enableLogging: true,
  },
};
