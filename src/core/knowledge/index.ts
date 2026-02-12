/**
 * Alabobai Knowledge Module
 *
 * Embedding generation, vector operations, and knowledge management.
 * Provides vector database integration for semantic search and retrieval.
 *
 * Components:
 * - EmbeddingService: Generate embeddings using various providers
 * - QdrantService: Basic Qdrant client for vector operations
 * - QdrantVectorStore: Advanced vector store with hybrid search, chunking, and HNSW config
 * - RAGEngine: Retrieval-Augmented Generation pipeline
 * - OllamaService: Local LLM integration for chat and embeddings
 * - RAGService: Simplified RAG service for document ingestion and retrieval
 *
 * @example
 * ```typescript
 * import {
 *   createVectorStore,
 *   createEmbeddingService,
 *   createOllamaService,
 *   type VectorPoint,
 * } from './knowledge/index.js';
 *
 * // Create services
 * const ollama = createOllamaService({ baseUrl: 'http://localhost:11434' });
 * const embedder = await createEmbeddingService({ provider: 'ollama' });
 * const vectorStore = createVectorStore({ url: 'http://localhost:6333' });
 *
 * // Initialize collections
 * await vectorStore.initializeStandardCollections();
 *
 * // Store document with embeddings
 * const embedding = await embedder.embed('Document content...');
 * await vectorStore.upsert('documents', {
 *   id: 'doc-1',
 *   vector: embedding,
 *   payload: {
 *     source: 'upload',
 *     timestamp: new Date().toISOString(),
 *     type: 'document',
 *     tags: ['policy'],
 *     content: 'Document content...',
 *   },
 * });
 * ```
 */

// ============================================================================
// OLLAMA SERVICE (Local LLM)
// ============================================================================
export {
  OllamaService,
  createOllamaService,
  getDefaultOllamaService,
} from './OllamaService.js';

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================
export * from './embedding-service.js';

// New modular Embedding Service
export {
  EmbeddingService as ModularEmbeddingService,
  createEmbeddingService as createModularEmbeddingService,
} from './EmbeddingService.js';

// ============================================================================
// QDRANT SERVICES
// ============================================================================

// Legacy Qdrant Service (basic client)
export {
  QdrantService,
  createQdrantService,
  getDefaultQdrantService,
  default as LegacyQdrantService,
} from './QdrantService.js';

// Advanced Vector Store (full-featured)
export {
  QdrantVectorStore,
  createVectorStore,
  createVectorStoreAsync,
  default as VectorStore,
} from './vector-store.js';

// ============================================================================
// RAG SERVICES
// ============================================================================

// RAG Engine (full-featured)
export {
  RAGEngine,
  createRAGEngine,
  createQARAGEngine,
  createResearchRAGEngine,
  createChatRAGEngine,
} from './rag-engine.js';

// Simplified RAG Service
export {
  RAGService,
  createRAGService,
} from './RAGService.js';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Vector Store Types - Configuration
export type {
  VectorStoreConfig as AdvancedVectorStoreConfig,
  CollectionConfig,
  HnswConfig,
  QuantizationConfig,
  SparseVectorConfig,
} from './vector-store.js';

// Vector Store Types - Knowledge & Metadata
export type {
  DistanceMetric,
  KnowledgeType,
  ChunkingStrategy as VectorChunkingStrategy,
  VectorPayload,
  VectorPoint,
  SparseVector,
} from './vector-store.js';

// Vector Store Types - Filtering & Search
export type {
  FilterCondition,
  SearchFilter,
  SearchOptions,
  HybridSearchOptions,
  SearchResult,
} from './vector-store.js';

// Vector Store Types - Operations & Results
export type {
  BatchUpsertResult,
  CollectionStats,
  HealthCheckResult as VectorStoreHealthCheck,
} from './vector-store.js';

// Vector Store Types - Document Chunking
export type {
  ChunkingOptions,
  DocumentChunk as VectorDocumentChunk,
} from './vector-store.js';

// RAG Engine Types
export type {
  RAGEngineConfig,
  RAGQuery as RAGEngineQuery,
  RAGRetrievalResult,
  RAGGenerationRequest,
  RAGGenerationResult,
  ConversationTurn,
  ContextChunk,
  SourceCitation,
  RetrievalStrategy,
  RetrievalMetrics,
  RAGEngineEvents,
} from './rag-engine.js';

// LLM Types (re-export from llm/types)
export type {
  OllamaConfig,
  OllamaModel,
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaTool,
  OllamaToolCall,
  OllamaChatResponse,
  OllamaStreamChunk,
  QdrantConfig,
  QdrantPoint,
  QdrantSearchResult,
  QdrantCollectionInfo,
  QdrantFilter,
  QdrantCondition,
  EmbeddingConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  RAGConfig,
  RAGDocument,
  RAGQuery,
  RAGResult,
  RAGContext,
  DocumentMetadata,
  DocumentChunk,
  ChunkingConfig,
  IngestionOptions,
  IngestionResult,
  LocalAIBrainConfig,
  ServiceStatus,
  BrainHealthStatus,
  StreamCallbacks,
  ChatOptions,
  ChatResponse,
  ConversationMessage,
  ConversationHistory,
  ConversationMemoryConfig,
  TaskType,
  ModelCapabilities,
  ModelInfo,
} from '../llm/types.js';

// Default configurations
export {
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_QDRANT_CONFIG,
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RAG_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_BRAIN_CONFIG,
} from '../llm/types.js';

// ============================================================================
// DOCUMENT INGESTION PIPELINE
// ============================================================================

// Types
export type {
  // Document Types
  DocumentFormat,
  DocumentSourceType,
  DocumentSource,
  DocumentMetadata as IngestionDocumentMetadata,
  ExtractedDocument,
  DocumentSection,
  ExtractedTable,
  ExtractedImage,
  ExtractedLink,
  // Chunk Types
  ChunkingStrategy,
  ChunkingConfig as IngestionChunkingConfig,
  DocumentChunk as IngestionDocumentChunk,
  ChunkMetadata,
  // Embedding Types
  EmbeddingProvider,
  EmbeddingConfig as IngestionEmbeddingConfig,
  EmbeddingResult as IngestionEmbeddingResult,
  // Vector Store Types
  VectorStoreType,
  VectorStoreConfig as IngestionVectorStoreConfig,
  VectorSearchResult as IngestionSearchResult,
  VectorSearchOptions as IngestionSearchOptions,
  // Ingestion Types
  IngestionStatus,
  IngestionJob,
  IngestionConfig,
  IngestionStats,
  IngestionResult as IngestionPipelineResult,
  // Document Operations
  DocumentOperation,
  DocumentUpdate,
  DocumentVersion,
  // Loader Types
  DocumentLoader,
  LoaderOptions,
} from './types.js';

// Validation Schemas
export {
  DocumentSourceSchema,
  ChunkingConfigSchema,
  EmbeddingConfigSchema,
  VectorStoreConfigSchema,
  IngestionConfigSchema,
  VectorSearchOptionsSchema,
} from './types.js';

// Ingestion Pipeline
export {
  IngestionPipeline,
  ChunkingEngine,
  EmbeddingEngine as IngestionEmbeddingEngine,
  InMemoryVectorStore,
  createIngestionPipeline,
  createChunkingEngine,
  createEmbeddingEngine as createIngestionEmbeddingEngine,
  createInMemoryVectorStore,
} from './ingestion-pipeline.js';

export type {
  VectorStore as IngestionVectorStore,
  IngestionPipelineEvents,
} from './ingestion-pipeline.js';

// Document Loaders
export {
  TextLoader,
  createTextLoader,
  PDFLoader,
  createPDFLoader,
  JSONLoader,
  createJSONLoader,
  CSVLoader,
  createCSVLoader,
  WebLoader,
  createWebLoader,
} from './loaders/index.js';

export type {
  PDFLoaderOptions,
  JSONLoaderOptions,
  CSVLoaderOptions,
  WebLoaderOptions,
} from './loaders/index.js';
