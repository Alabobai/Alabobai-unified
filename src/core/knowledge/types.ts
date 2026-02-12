/**
 * Alabobai Knowledge System - Type Definitions
 * Types for the document ingestion pipeline and knowledge base
 */

import { z } from 'zod';

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

export type DocumentFormat = 'pdf' | 'txt' | 'md' | 'docx' | 'json' | 'jsonl' | 'csv' | 'html' | 'url';

export type DocumentSourceType = 'file' | 'url' | 'text' | 'stream';

export interface DocumentSource {
  type: DocumentSourceType;
  /** File path, URL, or raw text content */
  content: string;
  /** Original filename or URL */
  name: string;
  /** MIME type if known */
  mimeType?: string;
  /** Additional source metadata */
  metadata?: Record<string, unknown>;
}

export interface DocumentMetadata {
  /** Unique document ID */
  id: string;
  /** Original source information */
  source: DocumentSource;
  /** Detected or specified format */
  format: DocumentFormat;
  /** Document title if available */
  title?: string;
  /** Author information */
  author?: string;
  /** Creation date */
  createdAt?: Date;
  /** Last modified date */
  modifiedAt?: Date;
  /** File size in bytes */
  size?: number;
  /** Page count for PDFs */
  pageCount?: number;
  /** Word count */
  wordCount?: number;
  /** Character count */
  charCount?: number;
  /** Language detection result */
  language?: string;
  /** Content hash for deduplication */
  contentHash: string;
  /** Version number for updates */
  version: number;
  /** Custom tags */
  tags?: string[];
  /** Parent collection ID */
  collectionId?: string;
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

export interface ExtractedDocument {
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Raw extracted text content */
  content: string;
  /** Structured sections if available */
  sections?: DocumentSection[];
  /** Extracted tables if any */
  tables?: ExtractedTable[];
  /** Extracted images/figures if any */
  images?: ExtractedImage[];
  /** Links found in document */
  links?: ExtractedLink[];
  /** Extraction timestamp */
  extractedAt: Date;
}

export interface DocumentSection {
  /** Section heading/title */
  title?: string;
  /** Heading level (1-6) */
  level?: number;
  /** Section content */
  content: string;
  /** Start position in original content */
  startIndex: number;
  /** End position in original content */
  endIndex: number;
}

export interface ExtractedTable {
  /** Table caption/title */
  caption?: string;
  /** Column headers */
  headers: string[];
  /** Row data */
  rows: string[][];
  /** Position in document */
  position: number;
}

export interface ExtractedImage {
  /** Image caption/alt text */
  caption?: string;
  /** Image URL or path */
  url?: string;
  /** Base64 encoded image data */
  data?: string;
  /** MIME type */
  mimeType?: string;
  /** Position in document */
  position: number;
}

export interface ExtractedLink {
  /** Link text */
  text: string;
  /** Link URL */
  url: string;
  /** Link type */
  type: 'internal' | 'external' | 'anchor';
  /** Position in document */
  position: number;
}

// ============================================================================
// CHUNK TYPES
// ============================================================================

export type ChunkingStrategy =
  | 'fixed'           // Fixed size chunks
  | 'sentence'        // Sentence-based
  | 'paragraph'       // Paragraph-based
  | 'semantic'        // Semantic similarity based
  | 'section'         // Document section based
  | 'recursive'       // Recursive character splitting
  | 'code'            // Code-aware chunking
  | 'markdown'        // Markdown structure aware
  | 'adaptive';       // Content-type adaptive

export interface ChunkingConfig {
  /** Chunking strategy to use */
  strategy: ChunkingStrategy;
  /** Target chunk size in characters */
  chunkSize: number;
  /** Overlap between chunks in characters */
  chunkOverlap: number;
  /** Minimum chunk size */
  minChunkSize?: number;
  /** Maximum chunk size */
  maxChunkSize?: number;
  /** Separators for recursive splitting */
  separators?: string[];
  /** Whether to preserve code blocks */
  preserveCodeBlocks?: boolean;
  /** Whether to preserve tables */
  preserveTables?: boolean;
  /** Whether to include metadata in chunks */
  includeMetadata?: boolean;
}

export interface DocumentChunk {
  /** Unique chunk ID */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Chunk sequence number within document */
  index: number;
  /** Chunk text content */
  content: string;
  /** Start position in original document */
  startIndex: number;
  /** End position in original document */
  endIndex: number;
  /** Token count estimate */
  tokenCount?: number;
  /** Character count */
  charCount: number;
  /** Chunk-specific metadata */
  metadata: ChunkMetadata;
  /** Vector embedding */
  embedding?: number[];
  /** Embedding model used */
  embeddingModel?: string;
}

export interface ChunkMetadata {
  /** Document title */
  documentTitle?: string;
  /** Section this chunk belongs to */
  section?: string;
  /** Page number if from PDF */
  pageNumber?: number;
  /** Heading hierarchy */
  headings?: string[];
  /** Previous chunk summary for context */
  previousChunkSummary?: string;
  /** Next chunk summary for context */
  nextChunkSummary?: string;
  /** Content hash */
  contentHash: string;
  /** Chunk creation timestamp */
  createdAt: Date;
  /** Custom metadata */
  custom?: Record<string, unknown>;
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export type EmbeddingProvider = 'openai' | 'anthropic' | 'local' | 'cohere' | 'huggingface';

export interface EmbeddingConfig {
  /** Embedding provider */
  provider: EmbeddingProvider;
  /** Model name */
  model: string;
  /** API key if required */
  apiKey?: string;
  /** Embedding dimension */
  dimension: number;
  /** Batch size for embedding generation */
  batchSize: number;
  /** Maximum tokens per request */
  maxTokens?: number;
  /** Rate limiting config */
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface EmbeddingResult {
  /** Chunk ID */
  chunkId: string;
  /** Embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Token count */
  tokenCount: number;
  /** Processing time in ms */
  processingTime: number;
}

// ============================================================================
// VECTOR STORE TYPES
// ============================================================================

export type VectorStoreType = 'memory' | 'sqlite' | 'pinecone' | 'weaviate' | 'qdrant' | 'chroma' | 'milvus';

export interface VectorStoreConfig {
  /** Store type */
  type: VectorStoreType;
  /** Connection string or path */
  connectionString?: string;
  /** Collection/index name */
  collectionName: string;
  /** Embedding dimension */
  dimension: number;
  /** Distance metric */
  metric: 'cosine' | 'euclidean' | 'dot';
  /** Additional provider-specific config */
  options?: Record<string, unknown>;
}

export interface VectorSearchResult {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Similarity score */
  score: number;
  /** Chunk metadata */
  metadata: ChunkMetadata;
  /** Document metadata */
  documentMetadata?: DocumentMetadata;
}

export interface VectorSearchOptions {
  /** Number of results to return */
  topK: number;
  /** Minimum similarity score threshold */
  minScore?: number;
  /** Filter by document IDs */
  documentIds?: string[];
  /** Filter by collection */
  collectionId?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by date range */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  /** Metadata filters */
  metadataFilters?: Record<string, unknown>;
  /** Include document metadata */
  includeDocumentMetadata?: boolean;
  /** Include embeddings in results */
  includeEmbeddings?: boolean;
}

// ============================================================================
// INGESTION PIPELINE TYPES
// ============================================================================

export type IngestionStatus =
  | 'pending'
  | 'loading'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'completed'
  | 'failed';

export interface IngestionJob {
  /** Job ID */
  id: string;
  /** Source documents */
  sources: DocumentSource[];
  /** Current status */
  status: IngestionStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Processed document count */
  processedCount: number;
  /** Total document count */
  totalCount: number;
  /** Error message if failed */
  error?: string;
  /** Detailed errors per document */
  errors?: { sourceIndex: number; error: string }[];
  /** Job configuration */
  config: IngestionConfig;
  /** Created timestamp */
  createdAt: Date;
  /** Started timestamp */
  startedAt?: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Processing statistics */
  stats?: IngestionStats;
}

export interface IngestionConfig {
  /** Chunking configuration */
  chunking: ChunkingConfig;
  /** Embedding configuration */
  embedding: EmbeddingConfig;
  /** Vector store configuration */
  vectorStore: VectorStoreConfig;
  /** Enable deduplication */
  deduplication: boolean;
  /** Continue on individual document errors */
  continueOnError: boolean;
  /** Batch size for processing */
  batchSize: number;
  /** Maximum concurrent operations */
  maxConcurrency: number;
  /** Collection to add documents to */
  collectionId?: string;
  /** Tags to apply to all documents */
  tags?: string[];
  /** Custom metadata for all documents */
  metadata?: Record<string, unknown>;
}

export interface IngestionStats {
  /** Total documents processed */
  documentsProcessed: number;
  /** Total chunks created */
  chunksCreated: number;
  /** Total embeddings generated */
  embeddingsGenerated: number;
  /** Total tokens used for embeddings */
  tokensUsed: number;
  /** Duplicates skipped */
  duplicatesSkipped: number;
  /** Errors encountered */
  errorsCount: number;
  /** Total processing time in ms */
  totalTime: number;
  /** Average time per document in ms */
  avgTimePerDocument: number;
}

export interface IngestionResult {
  /** Job information */
  job: IngestionJob;
  /** Created document IDs */
  documentIds: string[];
  /** Created chunk IDs */
  chunkIds: string[];
  /** Processing statistics */
  stats: IngestionStats;
}

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

export type DocumentOperation = 'add' | 'update' | 'delete';

export interface DocumentUpdate {
  /** Document ID to update */
  documentId: string;
  /** Operation type */
  operation: DocumentOperation;
  /** New source for update operations */
  source?: DocumentSource;
  /** Fields to update */
  updates?: Partial<DocumentMetadata>;
}

export interface DocumentVersion {
  /** Version number */
  version: number;
  /** Content hash */
  contentHash: string;
  /** Version timestamp */
  timestamp: Date;
  /** Change description */
  changeDescription?: string;
  /** Size in bytes */
  size: number;
  /** Previous version ID */
  previousVersion?: number;
}

// ============================================================================
// LOADER INTERFACE
// ============================================================================

export interface DocumentLoader {
  /** Supported file extensions */
  supportedExtensions: string[];
  /** Supported MIME types */
  supportedMimeTypes: string[];
  /** Check if loader can handle source */
  canLoad(source: DocumentSource): boolean;
  /** Load and extract document content */
  load(source: DocumentSource): Promise<ExtractedDocument>;
  /** Get loader name */
  getName(): string;
}

export interface LoaderOptions {
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Additional loader-specific options */
  options?: Record<string, unknown>;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const DocumentSourceSchema = z.object({
  type: z.enum(['file', 'url', 'text', 'stream']),
  content: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ChunkingConfigSchema = z.object({
  strategy: z.enum(['fixed', 'sentence', 'paragraph', 'semantic', 'section', 'recursive', 'code', 'markdown', 'adaptive']),
  chunkSize: z.number().min(100).max(10000).default(1000),
  chunkOverlap: z.number().min(0).max(500).default(200),
  minChunkSize: z.number().min(50).optional(),
  maxChunkSize: z.number().max(20000).optional(),
  separators: z.array(z.string()).optional(),
  preserveCodeBlocks: z.boolean().optional(),
  preserveTables: z.boolean().optional(),
  includeMetadata: z.boolean().optional(),
});

export const EmbeddingConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'local', 'cohere', 'huggingface']),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  dimension: z.number().min(64).max(4096),
  batchSize: z.number().min(1).max(100).default(10),
  maxTokens: z.number().optional(),
  rateLimit: z.object({
    requestsPerMinute: z.number(),
    tokensPerMinute: z.number(),
  }).optional(),
});

export const VectorStoreConfigSchema = z.object({
  type: z.enum(['memory', 'sqlite', 'pinecone', 'weaviate', 'qdrant', 'chroma', 'milvus']),
  connectionString: z.string().optional(),
  collectionName: z.string().min(1),
  dimension: z.number().min(64).max(4096),
  metric: z.enum(['cosine', 'euclidean', 'dot']).default('cosine'),
  options: z.record(z.unknown()).optional(),
});

export const IngestionConfigSchema = z.object({
  chunking: ChunkingConfigSchema,
  embedding: EmbeddingConfigSchema,
  vectorStore: VectorStoreConfigSchema,
  deduplication: z.boolean().default(true),
  continueOnError: z.boolean().default(true),
  batchSize: z.number().min(1).max(100).default(10),
  maxConcurrency: z.number().min(1).max(20).default(5),
  collectionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const VectorSearchOptionsSchema = z.object({
  topK: z.number().min(1).max(100).default(10),
  minScore: z.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
  collectionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dateRange: z.object({
    start: z.date().optional(),
    end: z.date().optional(),
  }).optional(),
  metadataFilters: z.record(z.unknown()).optional(),
  includeDocumentMetadata: z.boolean().default(false),
  includeEmbeddings: z.boolean().default(false),
});
