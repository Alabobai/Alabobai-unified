/**
 * Alabobai LLM Module
 * Unified exports for all LLM-related services
 */

// Ollama Service - Local LLM integration
export {
  // Main Service
  OllamaService,
  createOllamaService,
  getDefaultOllamaService,

  // Helper Functions
  createTool,
  systemMessage,
  userMessage,
  assistantMessage,

  // Constants
  OLLAMA_MODELS,

  // Error Handling
  OllamaError,
  OllamaErrorCode,

  // Types from ollama-service
  type OllamaModelId,
  type OllamaServiceConfig,
  type OllamaMessage,
  type OllamaTool,
  type OllamaToolParameter,
  type OllamaToolCall,
  type OllamaChatOptions,
  type OllamaChatResponse,
  type OllamaStreamChunk,
  type OllamaEmbeddingResponse,
  type OllamaEmbeddingsResponse,
  type OllamaModelInfo,
  type OllamaModelStatus,
  type OllamaPullProgress,
  type OllamaGenerateOptions,
  type OllamaGenerateResponse,
  type ContextWindow,
} from './ollama-service.js';

// Re-export existing LLM types for RAG, embedding, and configuration
export {
  // Ollama types (legacy naming)
  type OllamaConfig,
  type OllamaModel,
  type OllamaChatMessage,
  type OllamaToolFunction,

  // Qdrant Vector Database types
  type QdrantConfig,
  type QdrantPoint,
  type QdrantSearchResult,
  type QdrantCollectionInfo,
  type QdrantFilter,
  type QdrantCondition,

  // Embedding types
  type EmbeddingConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,

  // RAG types
  type RAGConfig,
  type RAGDocument,
  type DocumentMetadata,
  type RAGQuery,
  type RAGResult,
  type RAGContext,

  // Document processing types
  type DocumentChunk,
  type ChunkingConfig,
  type DocumentLoader,
  type ProcessedDocument,

  // Model selection types
  type TaskType,
  type ModelCapabilities,
  type ModelInfo,
  type ModelSelectionCriteria,

  // Conversation memory types
  type ConversationMessage,
  type ConversationHistory,
  type ConversationMemoryConfig,

  // Brain configuration types
  type LocalAIBrainConfig,

  // Service status types
  type ServiceStatus,
  type BrainHealthStatus,

  // Stream callback types
  type StreamCallbacks,

  // Chat types
  type ChatOptions,
  type ChatResponse,

  // Ingestion types
  type IngestionOptions,
  type IngestionResult,

  // Default configurations
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_QDRANT_CONFIG,
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RAG_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_BRAIN_CONFIG,
} from './types.js';
