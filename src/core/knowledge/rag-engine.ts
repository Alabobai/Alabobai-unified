/**
 * Alabobai RAG (Retrieval-Augmented Generation) Engine
 *
 * A comprehensive RAG implementation that provides:
 * - Vector store integration for semantic retrieval (via Qdrant)
 * - Multiple retrieval strategies (similarity, MMR, hybrid)
 * - Intelligent context window management
 * - Query expansion for better retrieval
 * - Source citation tracking
 * - Conversation history integration
 * - Metadata filtering
 * - Relevance scoring and confidence metrics
 *
 * Integrates with:
 * - EmbeddingService for query and document embedding
 * - QdrantVectorStore for retrieval
 * - LLMClient for generation
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type {
  EmbeddingService as IEmbeddingService,
  EmbeddingModel,
  EmbeddedChunk,
} from './embedding-service.js';
import type {
  QdrantVectorStore,
  SearchResult as VectorSearchResult,
  VectorPayload,
  SearchFilter,
  SearchOptions,
  VectorPoint,
} from './vector-store.js';
import type { LLMClient, LLMMessage } from '../llm-client.js';

// ============================================================================
// TYPES - RAG Engine
// ============================================================================

/**
 * Retrieval strategies supported by the RAG engine
 */
export type RetrievalStrategy =
  | 'similarity'  // Pure cosine similarity search
  | 'mmr'         // Maximal Marginal Relevance (diversity + relevance)
  | 'hybrid'      // Combination of dense + sparse retrieval
  | 'rerank'      // Two-stage: initial retrieval + reranking
  | 'ensemble';   // Multiple strategies combined

/**
 * Configuration for the RAG engine
 */
export interface RAGEngineConfig {
  /** Default retrieval strategy */
  defaultStrategy: RetrievalStrategy;

  /** Maximum number of documents to retrieve */
  maxRetrievedDocs: number;

  /** Minimum relevance score threshold (0-1) */
  minRelevanceScore: number;

  /** Maximum tokens for context window */
  maxContextTokens: number;

  /** Enable query expansion */
  enableQueryExpansion: boolean;

  /** Number of expanded queries to generate */
  queryExpansionCount: number;

  /** Enable automatic reranking */
  enableReranking: boolean;

  /** MMR diversity parameter (0 = pure relevance, 1 = pure diversity) */
  mmrLambda: number;

  /** Enable conversation history in context */
  enableConversationHistory: boolean;

  /** Maximum conversation turns to include */
  maxConversationTurns: number;

  /** Enable source citation tracking */
  enableCitations: boolean;

  /** Default collection to search */
  defaultCollection: string;

  /** Embedding model to use */
  embeddingModel?: EmbeddingModel;
}

/**
 * Query input for RAG retrieval
 */
export interface RAGQuery {
  /** The user's query text */
  query: string;

  /** Optional retrieval strategy override */
  strategy?: RetrievalStrategy;

  /** Maximum documents to retrieve */
  topK?: number;

  /** Collection to search */
  collection?: string;

  /** Metadata filter for retrieval */
  filter?: SearchFilter;

  /** Conversation history for context */
  conversationHistory?: ConversationTurn[];

  /** User ID for personalization */
  userId?: string;

  /** Session ID for context tracking */
  sessionId?: string;

  /** Additional context to include */
  additionalContext?: string;

  /** Include vectors in results */
  includeVectors?: boolean;
}

/**
 * Conversation turn for history tracking
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Retrieved context chunk
 */
export interface ContextChunk {
  id: string;
  content: string;
  source: SourceCitation;
  relevanceScore: number;
  semanticSimilarity: number;
  tokenCount: number;
  metadata: VectorPayload;
}

/**
 * Source citation for tracking
 */
export interface SourceCitation {
  id: string;
  documentId: string;
  title: string;
  source: string;
  sourceType: string;
  url?: string;
  author?: string;
  date?: Date;
  snippet: string;
  chunkIndex?: number;
  confidence: number;
}

/**
 * Result from RAG retrieval
 */
export interface RAGRetrievalResult {
  /** Retrieved context chunks */
  chunks: ContextChunk[];

  /** Formatted context string for LLM */
  formattedContext: string;

  /** Total token count of context */
  totalTokens: number;

  /** Source citations */
  citations: SourceCitation[];

  /** Relevance metrics */
  metrics: RetrievalMetrics;

  /** Expanded queries used */
  expandedQueries?: string[];

  /** Query embedding */
  queryEmbedding: number[];

  /** Retrieval strategy used */
  strategyUsed: RetrievalStrategy;
}

/**
 * Metrics from retrieval process
 */
export interface RetrievalMetrics {
  /** Number of documents retrieved */
  retrievedCount: number;

  /** Number of documents after filtering */
  filteredCount: number;

  /** Average relevance score */
  averageRelevance: number;

  /** Highest relevance score */
  maxRelevance: number;

  /** Lowest relevance score in results */
  minRelevance: number;

  /** Diversity score (for MMR) */
  diversityScore?: number;

  /** Coverage score (how well context covers query) */
  coverageScore: number;

  /** Confidence in retrieval quality */
  confidence: number;

  /** Retrieval latency in ms */
  latencyMs: number;
}

/**
 * Generation request with RAG context
 */
export interface RAGGenerationRequest {
  /** The user's query */
  query: string;

  /** Retrieved context from RAG */
  context: RAGRetrievalResult;

  /** System prompt to use */
  systemPrompt?: string;

  /** Temperature for generation */
  temperature?: number;

  /** Max tokens to generate */
  maxTokens?: number;

  /** Whether to include citations in response */
  includeCitations?: boolean;

  /** Format for citations */
  citationFormat?: 'inline' | 'footnote' | 'endnote';
}

/**
 * Result from RAG generation
 */
export interface RAGGenerationResult {
  /** Generated response text */
  response: string;

  /** Sources used in generation */
  sourcesUsed: SourceCitation[];

  /** Confidence in response */
  confidence: number;

  /** Token counts */
  tokenCounts: {
    prompt: number;
    context: number;
    response: number;
    total: number;
  };

  /** Generation latency in ms */
  latencyMs: number;

  /** Retrieval result used */
  retrievalResult: RAGRetrievalResult;
}

/**
 * Events emitted by the RAG engine
 */
export interface RAGEngineEvents {
  'query-start': { query: string; strategy: RetrievalStrategy };
  'embedding-complete': { query: string; durationMs: number };
  'retrieval-complete': { documentCount: number; durationMs: number };
  'reranking-complete': { originalCount: number; finalCount: number; durationMs: number };
  'context-formatted': { tokenCount: number; chunkCount: number };
  'generation-start': { query: string; contextTokens: number };
  'generation-complete': { responseTokens: number; durationMs: number };
  'error': { error: Error; stage: string };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_RAG_CONFIG: RAGEngineConfig = {
  defaultStrategy: 'mmr',
  maxRetrievedDocs: 10,
  minRelevanceScore: 0.5,
  maxContextTokens: 4000,
  enableQueryExpansion: true,
  queryExpansionCount: 3,
  enableReranking: true,
  mmrLambda: 0.5,
  enableConversationHistory: true,
  maxConversationTurns: 5,
  enableCitations: true,
  defaultCollection: 'knowledge-base',
  embeddingModel: 'nomic-embed-text',
};

// ============================================================================
// RAG ENGINE
// ============================================================================

/**
 * Main RAG Engine class
 * Orchestrates retrieval, reranking, context formatting, and generation
 */
export class RAGEngine extends EventEmitter {
  private config: RAGEngineConfig;
  private embeddingService: IEmbeddingService;
  private vectorStore: QdrantVectorStore;
  private llmClient?: LLMClient;
  private citationHistory: Map<string, SourceCitation[]> = new Map();

  constructor(
    embeddingService: IEmbeddingService,
    vectorStore: QdrantVectorStore,
    config: Partial<RAGEngineConfig> = {},
    llmClient?: LLMClient
  ) {
    super();
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.llmClient = llmClient;
  }

  // ============================================================================
  // DOCUMENT INGESTION
  // ============================================================================

  /**
   * Ingest a document into the vector store
   */
  async ingestDocument(
    content: string,
    payload: Omit<VectorPayload, 'content' | 'timestamp'>
  ): Promise<string> {
    const embedding = await this.embeddingService.embed(content, {
      model: this.config.embeddingModel,
    });

    const id = uuid();
    await this.vectorStore.upsert(this.config.defaultCollection, {
      id,
      vector: embedding,
      payload: {
        ...payload,
        content,
        timestamp: new Date().toISOString(),
      },
    });

    return id;
  }

  /**
   * Ingest multiple documents in batch using the embedding service
   */
  async ingestDocuments(
    documents: Array<{ content: string; payload: Omit<VectorPayload, 'content' | 'timestamp'> }>,
    options?: { collection?: string; onProgress?: (progress: number) => void }
  ): Promise<string[]> {
    const collection = options?.collection || this.config.defaultCollection;
    const ids: string[] = [];

    // Generate embeddings in batch
    const texts = documents.map(d => d.content);
    const embeddings = await this.embeddingService.embedBatch(texts, {
      model: this.config.embeddingModel,
      onProgress: options?.onProgress ? (info) => {
        options.onProgress!(info.percentComplete);
      } : undefined,
    });

    // Create vector points
    const points: VectorPoint[] = documents.map((doc, i) => {
      const id = uuid();
      ids.push(id);
      return {
        id,
        vector: embeddings[i],
        payload: {
          ...doc.payload,
          content: doc.content,
          timestamp: new Date().toISOString(),
        },
      };
    });

    // Batch upsert
    await this.vectorStore.batchUpsert(collection, points);

    return ids;
  }

  /**
   * Ingest a document with automatic chunking using the embedding service
   */
  async ingestDocumentWithChunking(
    content: string,
    metadata: Omit<VectorPayload, 'content' | 'timestamp' | 'chunkIndex' | 'totalChunks' | 'parentId'>,
    options?: { collection?: string; chunkSize?: number; overlap?: number }
  ): Promise<string[]> {
    const collection = options?.collection || this.config.defaultCollection;
    const parentId = uuid();

    // Use embedding service's document embedding with chunking
    const embeddedDoc = await this.embeddingService.embedDocument(
      { id: parentId, content },
      { model: this.config.embeddingModel }
    );

    // Create vector points from chunks
    const points: VectorPoint[] = embeddedDoc.chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: chunk.embedding,
      payload: {
        ...metadata,
        content: chunk.text,
        timestamp: new Date().toISOString(),
        parentId,
        chunkIndex: i,
        totalChunks: embeddedDoc.chunks.length,
      },
    }));

    // Batch upsert
    await this.vectorStore.batchUpsert(collection, points);

    return points.map(p => p.id);
  }

  // ============================================================================
  // RETRIEVAL
  // ============================================================================

  /**
   * Main retrieval method - query the knowledge base
   */
  async retrieve(query: RAGQuery): Promise<RAGRetrievalResult> {
    const startTime = Date.now();
    const strategy = query.strategy || this.config.defaultStrategy;
    const collection = query.collection || this.config.defaultCollection;

    this.emit('query-start', { query: query.query, strategy });

    try {
      // Step 1: Generate query embedding
      const embeddingStart = Date.now();
      const queryEmbedding = await this.embeddingService.embed(query.query, {
        model: this.config.embeddingModel,
      });
      this.emit('embedding-complete', {
        query: query.query,
        durationMs: Date.now() - embeddingStart,
      });

      // Step 2: Expand query if enabled
      let expandedQueries: string[] | undefined;
      if (this.config.enableQueryExpansion) {
        expandedQueries = await this.expandQuery(query.query);
      }

      // Step 3: Retrieve documents based on strategy
      const retrievalStart = Date.now();
      let results: VectorSearchResult[];

      switch (strategy) {
        case 'similarity':
          results = await this.similaritySearch(collection, queryEmbedding, query);
          break;
        case 'mmr':
          results = await this.mmrSearch(collection, queryEmbedding, query);
          break;
        case 'hybrid':
          results = await this.hybridSearch(collection, query.query, queryEmbedding, query);
          break;
        case 'rerank':
          results = await this.rerankSearch(collection, queryEmbedding, query);
          break;
        case 'ensemble':
          results = await this.ensembleSearch(collection, query.query, queryEmbedding, query);
          break;
        default:
          results = await this.similaritySearch(collection, queryEmbedding, query);
      }

      this.emit('retrieval-complete', {
        documentCount: results.length,
        durationMs: Date.now() - retrievalStart,
      });

      // Step 4: Apply reranking if enabled and not already done
      if (this.config.enableReranking && strategy !== 'rerank') {
        const rerankStart = Date.now();
        const originalCount = results.length;
        results = await this.rerank(query.query, results);
        this.emit('reranking-complete', {
          originalCount,
          finalCount: results.length,
          durationMs: Date.now() - rerankStart,
        });
      }

      // Step 5: Convert to context chunks
      const chunks = this.resultsToChunks(results);

      // Step 6: Format context for LLM
      const { formattedContext, totalTokens } = this.formatContext(
        chunks,
        query.conversationHistory
      );

      this.emit('context-formatted', {
        tokenCount: totalTokens,
        chunkCount: chunks.length,
      });

      // Step 7: Generate citations
      const citations = this.config.enableCitations
        ? this.generateCitations(chunks)
        : [];

      // Store citations for this session
      if (query.sessionId) {
        this.citationHistory.set(query.sessionId, citations);
      }

      // Step 8: Calculate metrics
      const metrics = this.calculateMetrics(results, startTime);

      return {
        chunks,
        formattedContext,
        totalTokens,
        citations,
        metrics,
        expandedQueries,
        queryEmbedding,
        strategyUsed: strategy,
      };
    } catch (error) {
      this.emit('error', { error: error as Error, stage: 'retrieval' });
      throw error;
    }
  }

  // ============================================================================
  // RETRIEVAL STRATEGIES
  // ============================================================================

  /**
   * Pure cosine similarity search
   */
  private async similaritySearch(
    collection: string,
    embedding: number[],
    query: RAGQuery
  ): Promise<VectorSearchResult[]> {
    return this.vectorStore.search(collection, embedding, {
      limit: query.topK || this.config.maxRetrievedDocs,
      scoreThreshold: this.config.minRelevanceScore,
      filter: query.filter,
      withVector: query.includeVectors,
      withPayload: true,
    });
  }

  /**
   * Maximal Marginal Relevance search for diverse results
   */
  private async mmrSearch(
    collection: string,
    embedding: number[],
    query: RAGQuery
  ): Promise<VectorSearchResult[]> {
    // Get more candidates than needed for MMR selection
    const candidates = await this.vectorStore.search(collection, embedding, {
      limit: (query.topK || this.config.maxRetrievedDocs) * 3,
      scoreThreshold: this.config.minRelevanceScore * 0.7,
      filter: query.filter,
      withVector: true, // Need vectors for diversity calculation
      withPayload: true,
    });

    if (candidates.length === 0) return [];

    const selected: VectorSearchResult[] = [];
    const remaining = [...candidates];
    const targetCount = query.topK || this.config.maxRetrievedDocs;
    const lambda = this.config.mmrLambda;

    // Select first document (highest similarity)
    selected.push(remaining.shift()!);

    // Iteratively select documents that maximize MMR
    while (selected.length < targetCount && remaining.length > 0) {
      let bestIdx = 0;
      let bestMMR = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Calculate max similarity to already selected documents
        let maxSimToSelected = 0;
        for (const sel of selected) {
          if (candidate.vector && sel.vector) {
            const sim = this.cosineSimilarity(candidate.vector, sel.vector);
            maxSimToSelected = Math.max(maxSimToSelected, sim);
          }
        }

        // MMR score: lambda * relevance - (1 - lambda) * max_similarity_to_selected
        const mmrScore =
          lambda * candidate.score - (1 - lambda) * maxSimToSelected;

        if (mmrScore > bestMMR) {
          bestMMR = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
  }

  /**
   * Hybrid search combining dense and sparse retrieval
   */
  private async hybridSearch(
    collection: string,
    queryText: string,
    embedding: number[],
    query: RAGQuery
  ): Promise<VectorSearchResult[]> {
    // Try to use Qdrant's built-in hybrid search if sparse vectors are configured
    try {
      // Generate sparse vector (simple BM25-like representation)
      const sparseVector = this.generateSparseVector(queryText);

      const results = await this.vectorStore.hybridSearch(
        collection,
        embedding,
        sparseVector,
        {
          limit: query.topK || this.config.maxRetrievedDocs,
          filter: query.filter,
          withPayload: true,
          denseWeight: 0.7,
          sparseWeight: 0.3,
          fusion: 'rrf',
        }
      );

      return results;
    } catch {
      // Fall back to dense search with text matching boost
      const denseResults = await this.vectorStore.search(collection, embedding, {
        limit: (query.topK || this.config.maxRetrievedDocs) * 2,
        scoreThreshold: this.config.minRelevanceScore * 0.7,
        filter: query.filter,
        withPayload: true,
      });

      // Boost scores for results with text matches
      const queryTerms = this.tokenize(queryText.toLowerCase());
      const boostedResults = denseResults.map(result => {
        const content = result.payload?.content?.toLowerCase() || '';
        const matchCount = queryTerms.filter(term => content.includes(term)).length;
        const textBoost = matchCount > 0 ? 0.1 * (matchCount / queryTerms.length) : 0;

        return {
          ...result,
          score: result.score + textBoost,
        };
      });

      boostedResults.sort((a, b) => b.score - a.score);
      return boostedResults.slice(0, query.topK || this.config.maxRetrievedDocs);
    }
  }

  /**
   * Two-stage retrieval with reranking
   */
  private async rerankSearch(
    collection: string,
    embedding: number[],
    query: RAGQuery
  ): Promise<VectorSearchResult[]> {
    // First stage: retrieve more candidates
    const candidates = await this.vectorStore.search(collection, embedding, {
      limit: (query.topK || this.config.maxRetrievedDocs) * 5,
      scoreThreshold: this.config.minRelevanceScore * 0.5,
      filter: query.filter,
      withPayload: true,
    });

    // Second stage: rerank
    return this.rerank(query.query || '', candidates);
  }

  /**
   * Ensemble of multiple strategies
   */
  private async ensembleSearch(
    collection: string,
    queryText: string,
    embedding: number[],
    query: RAGQuery
  ): Promise<VectorSearchResult[]> {
    // Run multiple strategies in parallel
    const [similarityResults, mmrResults, hybridResults] = await Promise.all([
      this.similaritySearch(collection, embedding, query),
      this.mmrSearch(collection, embedding, query),
      this.hybridSearch(collection, queryText, embedding, query),
    ]);

    // Combine results using reciprocal rank fusion
    const scores = new Map<string, number>();

    const addRankScores = (results: VectorSearchResult[], weight: number) => {
      results.forEach((result, rank) => {
        const id = result.id;
        const rrfScore = weight / (60 + rank + 1); // k=60 is common for RRF
        scores.set(id, (scores.get(id) || 0) + rrfScore);
      });
    };

    addRankScores(similarityResults, 1.0);
    addRankScores(mmrResults, 0.8);
    addRankScores(hybridResults, 0.6);

    // Create deduplicated result list
    const resultMap = new Map<string, VectorSearchResult>();
    for (const result of [...similarityResults, ...mmrResults, ...hybridResults]) {
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, result);
      }
    }

    // Sort by RRF score
    const ensembleResults = Array.from(resultMap.values()).map(result => ({
      ...result,
      score: scores.get(result.id) || 0,
    }));

    ensembleResults.sort((a, b) => b.score - a.score);
    return ensembleResults.slice(0, query.topK || this.config.maxRetrievedDocs);
  }

  // ============================================================================
  // RERANKING
  // ============================================================================

  /**
   * Rerank results using semantic similarity to query
   */
  private async rerank(
    queryText: string,
    results: VectorSearchResult[]
  ): Promise<VectorSearchResult[]> {
    if (results.length === 0) return results;

    // Score each result based on semantic overlap with query
    const queryTerms = new Set(this.tokenize(queryText.toLowerCase()));

    const rerankedResults = results.map(result => {
      const content = result.payload?.content || '';
      const docTerms = new Set(this.tokenize(content.toLowerCase()));

      // Calculate Jaccard similarity
      const intersection = new Set([...queryTerms].filter(t => docTerms.has(t)));
      const union = new Set([...queryTerms, ...docTerms]);
      const jaccardSim = union.size > 0 ? intersection.size / union.size : 0;

      // Check for exact phrase matches
      const contentLower = content.toLowerCase();
      const queryLower = queryText.toLowerCase();
      const phraseBonus = contentLower.includes(queryLower) ? 0.2 : 0;

      // Position bonus: terms appearing earlier are more relevant
      let positionScore = 0;
      for (const term of queryTerms) {
        const pos = contentLower.indexOf(term);
        if (pos !== -1) {
          positionScore += 1 / (1 + pos / 100);
        }
      }
      positionScore = queryTerms.size > 0 ? positionScore / queryTerms.size : 0;

      // Combine original score with reranking factors
      const rerankScore =
        0.5 * result.score +
        0.2 * jaccardSim +
        0.2 * positionScore +
        phraseBonus;

      return {
        ...result,
        score: rerankScore,
      };
    });

    // Sort by reranked score
    rerankedResults.sort((a, b) => b.score - a.score);

    // Filter by minimum score
    return rerankedResults.filter(r => r.score >= this.config.minRelevanceScore);
  }

  // ============================================================================
  // QUERY EXPANSION
  // ============================================================================

  /**
   * Expand query with related terms and variations
   */
  private async expandQuery(query: string): Promise<string[]> {
    const expansions: string[] = [query];

    // Simple rule-based expansion
    const words = query.split(/\s+/);

    // Add singular/plural variations
    const pluralVariations = words.map(word => {
      if (word.endsWith('s')) return word.slice(0, -1);
      if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
      return word + 's';
    });
    expansions.push(pluralVariations.join(' '));

    // Add question forms
    if (!query.toLowerCase().startsWith('what') &&
        !query.toLowerCase().startsWith('how') &&
        !query.toLowerCase().startsWith('why')) {
      expansions.push(`what is ${query}`);
      expansions.push(`how to ${query}`);
    }

    // If LLM client is available, use it for smarter expansion
    if (this.llmClient) {
      try {
        const llmExpansion = await this.llmClient.chat([
          {
            role: 'system',
            content: 'Generate 2 alternative phrasings for the following search query. Return only the alternatives, one per line.',
          },
          { role: 'user', content: query },
        ]);

        const alternatives = llmExpansion.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && line !== query);

        expansions.push(...alternatives.slice(0, 2));
      } catch {
        // Ignore LLM errors for query expansion
      }
    }

    // Limit to configured count
    return expansions.slice(0, this.config.queryExpansionCount);
  }

  // ============================================================================
  // CONTEXT FORMATTING
  // ============================================================================

  /**
   * Convert search results to context chunks
   */
  private resultsToChunks(results: VectorSearchResult[]): ContextChunk[] {
    return results.map((result, index) => {
      const payload = result.payload || {} as VectorPayload;

      return {
        id: `chunk-${index}`,
        content: payload.content || '',
        source: {
          id: `source-${result.id}`,
          documentId: result.id,
          title: payload.title || 'Unknown',
          source: payload.source || 'Unknown',
          sourceType: payload.type || 'unknown',
          url: payload.url,
          author: undefined,
          date: payload.timestamp ? new Date(payload.timestamp) : undefined,
          snippet: (payload.content || '').slice(0, 200),
          chunkIndex: payload.chunkIndex,
          confidence: result.score,
        },
        relevanceScore: result.score,
        semanticSimilarity: result.score,
        tokenCount: this.estimateTokens(payload.content || ''),
        metadata: payload,
      };
    });
  }

  /**
   * Format context chunks for LLM consumption
   */
  private formatContext(
    chunks: ContextChunk[],
    conversationHistory?: ConversationTurn[]
  ): { formattedContext: string; totalTokens: number } {
    const sections: string[] = [];
    let totalTokens = 0;
    let remainingTokens = this.config.maxContextTokens;

    // Add conversation history if enabled
    if (
      this.config.enableConversationHistory &&
      conversationHistory &&
      conversationHistory.length > 0
    ) {
      const historySection = this.formatConversationHistory(conversationHistory);
      const historyTokens = this.estimateTokens(historySection);

      if (historyTokens < remainingTokens * 0.3) {
        // Limit history to 30% of context
        sections.push(historySection);
        totalTokens += historyTokens;
        remainingTokens -= historyTokens;
      }
    }

    // Add retrieved context
    sections.push('\n--- Retrieved Context ---\n');

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTokens = chunk.tokenCount + 20; // Overhead for formatting

      if (chunkTokens > remainingTokens) {
        // Truncate chunk to fit
        const availableChars = remainingTokens * 4; // Approximate chars per token
        const truncatedContent = chunk.content.slice(0, availableChars) + '...';
        sections.push(this.formatChunk(i + 1, truncatedContent, chunk.source));
        totalTokens += remainingTokens;
        break;
      }

      sections.push(this.formatChunk(i + 1, chunk.content, chunk.source));
      totalTokens += chunkTokens;
      remainingTokens -= chunkTokens;
    }

    sections.push('\n--- End of Context ---\n');

    return {
      formattedContext: sections.join('\n'),
      totalTokens,
    };
  }

  /**
   * Format a single context chunk
   */
  private formatChunk(
    index: number,
    content: string,
    source: SourceCitation
  ): string {
    const sourceInfo = source.url
      ? `[${index}] Source: ${source.title} (${source.url})`
      : `[${index}] Source: ${source.title} (${source.source})`;

    return `${sourceInfo}\n${content}\n`;
  }

  /**
   * Format conversation history for context
   */
  private formatConversationHistory(history: ConversationTurn[]): string {
    const recentHistory = history.slice(-this.config.maxConversationTurns);

    const formatted = recentHistory.map(turn => {
      const role = turn.role.charAt(0).toUpperCase() + turn.role.slice(1);
      return `${role}: ${turn.content}`;
    });

    return '--- Conversation History ---\n' + formatted.join('\n') + '\n';
  }

  // ============================================================================
  // CITATION MANAGEMENT
  // ============================================================================

  /**
   * Generate citations from context chunks
   */
  private generateCitations(chunks: ContextChunk[]): SourceCitation[] {
    return chunks.map(chunk => chunk.source);
  }

  /**
   * Get citations for a session
   */
  getCitationsForSession(sessionId: string): SourceCitation[] {
    return this.citationHistory.get(sessionId) || [];
  }

  /**
   * Format citations for display
   */
  formatCitations(
    citations: SourceCitation[],
    format: 'inline' | 'footnote' | 'endnote' = 'endnote'
  ): string {
    switch (format) {
      case 'inline':
        return citations
          .map((c, i) => `[${i + 1}] ${c.title}`)
          .join(', ');

      case 'footnote':
        return citations
          .map((c, i) => `[${i + 1}] ${c.title}. ${c.url || c.source}`)
          .join('\n');

      case 'endnote':
      default:
        return (
          '\n\nSources:\n' +
          citations
            .map((c, i) => {
              const url = c.url ? ` Available at: ${c.url}` : '';
              const date = c.date ? ` (${c.date.toISOString().split('T')[0]})` : '';
              return `${i + 1}. ${c.title}${date}. ${c.source}.${url}`;
            })
            .join('\n')
        );
    }
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  /**
   * Calculate retrieval metrics
   */
  private calculateMetrics(
    results: VectorSearchResult[],
    startTime: number
  ): RetrievalMetrics {
    if (results.length === 0) {
      return {
        retrievedCount: 0,
        filteredCount: 0,
        averageRelevance: 0,
        maxRelevance: 0,
        minRelevance: 0,
        coverageScore: 0,
        confidence: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    const scores = results.map(r => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate diversity score for MMR
    let diversityScore: number | undefined;
    if (results.length > 1) {
      const resultsWithVectors = results.filter(r => r.vector && r.vector.length > 0);
      if (resultsWithVectors.length > 1) {
        let totalDiversity = 0;
        let comparisons = 0;

        for (let i = 0; i < resultsWithVectors.length; i++) {
          for (let j = i + 1; j < resultsWithVectors.length; j++) {
            const sim = this.cosineSimilarity(
              resultsWithVectors[i].vector!,
              resultsWithVectors[j].vector!
            );
            totalDiversity += 1 - sim;
            comparisons++;
          }
        }

        diversityScore = comparisons > 0 ? totalDiversity / comparisons : 0;
      }
    }

    // Coverage score: how well the results cover different aspects
    const uniqueSourceTypes = new Set(
      results.map(r => r.payload?.type || 'unknown')
    );
    const coverageScore = Math.min(1, uniqueSourceTypes.size / 3);

    // Confidence based on average relevance and result count
    const confidence = Math.min(
      1,
      avgScore * 0.6 + Math.min(results.length / this.config.maxRetrievedDocs, 1) * 0.4
    );

    return {
      retrievedCount: results.length,
      filteredCount: results.length,
      averageRelevance: avgScore,
      maxRelevance: Math.max(...scores),
      minRelevance: Math.min(...scores),
      diversityScore,
      coverageScore,
      confidence,
      latencyMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // GENERATION INTEGRATION
  // ============================================================================

  /**
   * Generate a response using retrieved context
   */
  async generate(request: RAGGenerationRequest): Promise<RAGGenerationResult> {
    if (!this.llmClient) {
      throw new Error('LLM client not configured. Pass an LLMClient to the RAGEngine constructor.');
    }

    const startTime = Date.now();

    this.emit('generation-start', {
      query: request.query,
      contextTokens: request.context.totalTokens,
    });

    try {
      // Build prompt with context
      const systemPrompt =
        request.systemPrompt ||
        `You are a helpful AI assistant. Use the provided context to answer the user's question accurately.
If the context doesn't contain relevant information, say so.
Always cite your sources using [1], [2], etc. when referencing specific information from the context.`;

      const userPrompt = `Context:\n${request.context.formattedContext}\n\nQuestion: ${request.query}`;

      // Generate response
      const response = await this.llmClient.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // Extract which sources were used (look for [n] references)
      const usedSourceIndices = new Set<number>();
      const citationMatches = response.matchAll(/\[(\d+)\]/g);
      for (const match of citationMatches) {
        usedSourceIndices.add(parseInt(match[1]) - 1);
      }

      const sourcesUsed = request.context.citations.filter((_, i) =>
        usedSourceIndices.has(i)
      );

      // Append citations if requested
      let finalResponse = response;
      if (request.includeCitations && sourcesUsed.length > 0) {
        finalResponse +=
          '\n' + this.formatCitations(sourcesUsed, request.citationFormat);
      }

      const latencyMs = Date.now() - startTime;

      this.emit('generation-complete', {
        responseTokens: this.estimateTokens(response),
        durationMs: latencyMs,
      });

      return {
        response: finalResponse,
        sourcesUsed,
        confidence: this.calculateResponseConfidence(request.context, sourcesUsed),
        tokenCounts: {
          prompt: this.estimateTokens(systemPrompt + userPrompt),
          context: request.context.totalTokens,
          response: this.estimateTokens(response),
          total:
            this.estimateTokens(systemPrompt + userPrompt) +
            this.estimateTokens(response),
        },
        latencyMs,
        retrievalResult: request.context,
      };
    } catch (error) {
      this.emit('error', { error: error as Error, stage: 'generation' });
      throw error;
    }
  }

  /**
   * Convenience method: retrieve and generate in one call
   */
  async query(
    queryText: string,
    options?: Omit<RAGQuery, 'query'> & {
      systemPrompt?: string;
      includeCitations?: boolean;
      citationFormat?: 'inline' | 'footnote' | 'endnote';
    }
  ): Promise<RAGGenerationResult> {
    const retrievalResult = await this.retrieve({
      query: queryText,
      ...options,
    });

    return this.generate({
      query: queryText,
      context: retrievalResult,
      systemPrompt: options?.systemPrompt,
      includeCitations: options?.includeCitations ?? this.config.enableCitations,
      citationFormat: options?.citationFormat,
    });
  }

  /**
   * Calculate confidence in the generated response
   */
  private calculateResponseConfidence(
    context: RAGRetrievalResult,
    sourcesUsed: SourceCitation[]
  ): number {
    // Base confidence from retrieval
    let confidence = context.metrics.confidence * 0.5;

    // Boost for using sources
    if (sourcesUsed.length > 0) {
      const avgSourceConfidence =
        sourcesUsed.reduce((sum, s) => sum + s.confidence, 0) / sourcesUsed.length;
      confidence += avgSourceConfidence * 0.3;
    }

    // Boost for multiple sources
    if (sourcesUsed.length > 1) {
      confidence += Math.min(sourcesUsed.length / 5, 0.2);
    }

    return Math.min(1, confidence);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Generate a sparse vector for hybrid search (simple BM25-like)
   */
  private generateSparseVector(text: string): { indices: number[]; values: number[] } {
    const terms = this.tokenize(text.toLowerCase());
    const termFreqs = new Map<string, number>();

    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
    }

    // Hash terms to indices (simple hash function)
    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, freq] of termFreqs) {
      let hash = 0;
      for (let i = 0; i < term.length; i++) {
        hash = ((hash << 5) - hash) + term.charCodeAt(i);
        hash = hash & hash;
      }
      const index = Math.abs(hash) % 30000; // Vocabulary size
      const value = Math.log(1 + freq);

      indices.push(index);
      values.push(value);
    }

    return { indices, values };
  }

  /**
   * Simple tokenization for text analysis
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  configure(updates: Partial<RAGEngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): RAGEngineConfig {
    return { ...this.config };
  }

  /**
   * Set the LLM client
   */
  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
  }

  /**
   * Get the underlying vector store
   */
  getVectorStore(): QdrantVectorStore {
    return this.vectorStore;
  }

  /**
   * Get the embedding service
   */
  getEmbeddingService(): IEmbeddingService {
    return this.embeddingService;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new RAG engine
 */
export function createRAGEngine(
  embeddingService: IEmbeddingService,
  vectorStore: QdrantVectorStore,
  config?: Partial<RAGEngineConfig>,
  llmClient?: LLMClient
): RAGEngine {
  return new RAGEngine(embeddingService, vectorStore, config, llmClient);
}

/**
 * Create a RAG engine optimized for Q&A
 */
export function createQARAGEngine(
  embeddingService: IEmbeddingService,
  vectorStore: QdrantVectorStore,
  llmClient?: LLMClient
): RAGEngine {
  return new RAGEngine(
    embeddingService,
    vectorStore,
    {
      defaultStrategy: 'rerank',
      maxRetrievedDocs: 5,
      minRelevanceScore: 0.6,
      enableQueryExpansion: true,
      enableReranking: true,
      enableCitations: true,
    },
    llmClient
  );
}

/**
 * Create a RAG engine optimized for research
 */
export function createResearchRAGEngine(
  embeddingService: IEmbeddingService,
  vectorStore: QdrantVectorStore,
  llmClient?: LLMClient
): RAGEngine {
  return new RAGEngine(
    embeddingService,
    vectorStore,
    {
      defaultStrategy: 'ensemble',
      maxRetrievedDocs: 15,
      minRelevanceScore: 0.4,
      maxContextTokens: 8000,
      enableQueryExpansion: true,
      enableReranking: true,
      enableCitations: true,
      mmrLambda: 0.7, // Higher diversity for research
    },
    llmClient
  );
}

/**
 * Create a RAG engine optimized for chat/conversation
 */
export function createChatRAGEngine(
  embeddingService: IEmbeddingService,
  vectorStore: QdrantVectorStore,
  llmClient?: LLMClient
): RAGEngine {
  return new RAGEngine(
    embeddingService,
    vectorStore,
    {
      defaultStrategy: 'mmr',
      maxRetrievedDocs: 3,
      minRelevanceScore: 0.5,
      maxContextTokens: 2000,
      enableQueryExpansion: false,
      enableReranking: false,
      enableConversationHistory: true,
      maxConversationTurns: 10,
      enableCitations: false,
    },
    llmClient
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RAGEngine;
