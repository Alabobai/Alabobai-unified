/**
 * Alabobai Local AI Brain
 *
 * The main orchestrator for local AI capabilities, combining:
 * - Ollama for local LLM inference
 * - Qdrant for vector storage and search
 * - RAG for knowledge-augmented responses
 * - Conversation memory with context
 * - Tool/function calling support
 * - Auto model selection
 * - Graceful degradation
 *
 * @example
 * ```typescript
 * import { LocalAIBrain, createLocalAIBrain } from './local-ai-brain.js';
 *
 * const brain = await createLocalAIBrain({
 *   ollama: { baseUrl: 'http://localhost:11434' },
 *   qdrant: { url: 'http://localhost:6333' },
 * });
 *
 * // Chat with RAG
 * const response = await brain.chat("What are our company policies?", {
 *   useKnowledge: true,
 *   stream: true,
 * });
 *
 * // Ingest knowledge
 * await brain.ingestDocument("/path/to/policy.pdf");
 *
 * // Direct LLM (no RAG)
 * const answer = await brain.complete("Explain quantum computing");
 * ```
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type {
  LocalAIBrainConfig,
  BrainHealthStatus,
  ServiceStatus,
  ChatOptions,
  ChatResponse,
  StreamCallbacks,
  IngestionOptions,
  IngestionResult,
  RAGContext,
  RAGQuery,
  OllamaChatMessage,
  OllamaTool,
  OllamaToolCall,
  ConversationMessage,
  ConversationHistory,
  TaskType,
  ModelInfo,
} from './llm/types.js';
import {
  DEFAULT_BRAIN_CONFIG,
  DEFAULT_RAG_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_MEMORY_CONFIG,
} from './llm/types.js';
import { OllamaService, createOllamaService } from './knowledge/OllamaService.js';
import { QdrantService, createQdrantService } from './knowledge/QdrantService.js';
import {
  EmbeddingService as ModularEmbeddingService,
  createEmbeddingService as createModularEmbeddingService,
} from './knowledge/EmbeddingService.js';
import { RAGService, createRAGService } from './knowledge/RAGService.js';

// ============================================================================
// LOCAL AI BRAIN CLASS
// ============================================================================

export class LocalAIBrain extends EventEmitter {
  private config: LocalAIBrainConfig;
  private ollamaService: OllamaService;
  private qdrantService: QdrantService;
  private embeddingService: ModularEmbeddingService;
  private ragService: RAGService;
  private initialized: boolean = false;
  private conversations: Map<string, ConversationHistory> = new Map();
  private availableModels: ModelInfo[] = [];

  constructor(config: Partial<LocalAIBrainConfig> = {}) {
    super();
    this.config = this.mergeConfig(config);

    // Initialize services
    this.ollamaService = createOllamaService({
      baseUrl: this.config.ollama.baseUrl,
      timeout: this.config.ollama.timeout,
    });

    this.qdrantService = createQdrantService({
      url: this.config.qdrant.url,
      apiKey: this.config.qdrant.apiKey,
    });

    this.embeddingService = createModularEmbeddingService(
      {
        provider: 'ollama',
        model: this.config.ollama.embeddingModel,
        dimensions: this.config.qdrant.vectorSize,
        batchSize: 32,
        maxRetries: 3,
      },
      this.ollamaService
    );

    this.ragService = createRAGService(
      this.qdrantService,
      this.embeddingService,
      this.config.rag,
      this.config.chunking
    );
  }

  private mergeConfig(config: Partial<LocalAIBrainConfig>): LocalAIBrainConfig {
    return {
      ollama: { ...DEFAULT_BRAIN_CONFIG.ollama, ...config.ollama },
      qdrant: { ...DEFAULT_BRAIN_CONFIG.qdrant, ...config.qdrant },
      rag: { ...DEFAULT_RAG_CONFIG, ...config.rag },
      chunking: { ...DEFAULT_CHUNKING_CONFIG, ...config.chunking },
      memory: { ...DEFAULT_MEMORY_CONFIG, ...config.memory },
      modelSelection: { ...DEFAULT_BRAIN_CONFIG.modelSelection, ...config.modelSelection },
      system: { ...DEFAULT_BRAIN_CONFIG.system, ...config.system },
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.emit('initializing');

    // Check Ollama
    const ollamaAvailable = await this.ollamaService.checkHealth();
    if (ollamaAvailable) {
      this.emit('service:connected', { service: 'ollama' });
      await this.refreshAvailableModels();
    } else {
      this.emit('service:unavailable', { service: 'ollama' });
      if (this.config.system.enableLogging) {
        console.warn('[LocalAIBrain] Ollama is not available');
      }
    }

    // Check Qdrant
    const qdrantAvailable = await this.qdrantService.checkHealth();
    if (qdrantAvailable) {
      this.emit('service:connected', { service: 'qdrant' });
      await this.ragService.initialize();
    } else {
      this.emit('service:unavailable', { service: 'qdrant' });
      if (this.config.system.enableLogging) {
        console.warn('[LocalAIBrain] Qdrant is not available');
      }
    }

    this.initialized = true;
    this.emit('initialized', {
      ollamaAvailable,
      qdrantAvailable,
      models: this.availableModels.map(m => m.name),
    });

    if (this.config.system.enableLogging) {
      console.log('[LocalAIBrain] Initialized', {
        ollama: ollamaAvailable,
        qdrant: qdrantAvailable,
      });
    }
  }

  private async refreshAvailableModels(): Promise<void> {
    const ollamaModels = await this.ollamaService.listModels();
    this.availableModels = ollamaModels.map(m => ({
      name: m.name,
      provider: 'ollama' as const,
      capabilities: {
        contextWindow: this.getModelContextWindow(m.name),
        supportsVision: this.modelSupportsVision(m.name),
        supportsTools: this.modelSupportsTools(m.name),
        supportsStreaming: true,
        supportsJson: true,
        languages: ['en'],
        specializations: this.getModelSpecializations(m.name),
      },
      isAvailable: true,
      lastChecked: new Date(),
    }));
  }

  // ============================================================================
  // CHAT - Main Entry Point
  // ============================================================================

  async chat(
    message: string,
    options: Partial<ChatOptions> = {}
  ): Promise<ChatResponse> {
    await this.ensureInitialized();

    const useKnowledge = options.useKnowledge ?? true;
    const stream = options.stream ?? false;
    const conversationId = (options as any).conversationId || 'default';

    // Get or create conversation
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = this.createConversation(conversationId);
    }

    // Build messages
    const messages: OllamaChatMessage[] = [];

    // Add system prompt
    const systemPrompt = options.systemPrompt || this.config.system.systemPrompt;
    messages.push({ role: 'system', content: systemPrompt });

    // Add conversation history
    if (options.includeHistory !== false) {
      const historyMessages = this.getConversationMessages(
        conversation,
        options.maxHistoryMessages || this.config.memory.maxMessages
      );
      messages.push(...historyMessages);
    }

    // Get RAG context if enabled
    let ragContext: RAGContext | undefined;
    if (useKnowledge && this.qdrantService.isAvailable()) {
      try {
        ragContext = await this.ragService.buildContext(message, {
          collections: options.collections,
          filter: options.ragFilter,
          topK: this.config.rag.topK,
          minScore: this.config.rag.minScore,
        });

        if (ragContext.documents.length > 0) {
          messages.push({
            role: 'system',
            content: `Here is relevant context from the knowledge base:\n\n${ragContext.contextText}\n\nUse this context to help answer the user's question. Cite sources when appropriate.`,
          });
        }
      } catch (error) {
        this.emit('error', { type: 'rag', error });
        if (this.config.system.enableLogging) {
          console.warn('[LocalAIBrain] RAG failed, proceeding without context:', error);
        }
      }
    }

    // Add user message
    messages.push({ role: 'user', content: message });

    // Select model
    const model = options.model || await this.selectModel('chat', options);

    // Generate response
    let response: ChatResponse;

    if (stream) {
      response = await this.streamChat(messages, model, options, ragContext);
    } else {
      response = await this.nonStreamChat(messages, model, options, ragContext);
    }

    // Update conversation
    this.addToConversation(conversation, message, 'user');
    this.addToConversation(conversation, response.content, 'assistant', {
      model,
      ragContext,
      toolCalls: response.toolCalls,
    });

    return response;
  }

  private async nonStreamChat(
    messages: OllamaChatMessage[],
    model: string,
    options: Partial<ChatOptions>,
    ragContext?: RAGContext
  ): Promise<ChatResponse> {
    if (!this.ollamaService.isAvailable()) {
      throw new Error('Ollama is not available');
    }

    const result = await this.ollamaService.chat(messages, {
      model,
      options: {
        temperature: options.temperature ?? 0.7,
        numPredict: options.maxTokens ?? 4096,
      },
      tools: options.tools,
      format: (options as any).format,
    });

    return {
      content: result.message.content,
      model: result.model,
      ragContext,
      toolCalls: result.message.toolCalls,
      usage: {
        promptTokens: result.promptEvalCount || 0,
        completionTokens: result.evalCount || 0,
        totalTokens: (result.promptEvalCount || 0) + (result.evalCount || 0),
      },
    };
  }

  private async streamChat(
    messages: OllamaChatMessage[],
    model: string,
    options: Partial<ChatOptions>,
    ragContext?: RAGContext
  ): Promise<ChatResponse> {
    if (!this.ollamaService.isAvailable()) {
      throw new Error('Ollama is not available');
    }

    const callbacks = (options as any).callbacks as StreamCallbacks | undefined;
    let fullContent = '';

    const content = await this.ollamaService.streamChat(
      messages,
      {
        onToken: (token) => {
          fullContent += token;
          callbacks?.onToken(token);
          this.emit('token', { token });
        },
        onComplete: () => {
          callbacks?.onComplete();
          this.emit('complete');
        },
        onError: (error) => {
          callbacks?.onError(error);
          this.emit('error', { type: 'stream', error });
        },
        onToolCall: (toolCall) => {
          callbacks?.onToolCall?.(toolCall);
          this.emit('toolCall', { toolCall });
        },
      },
      {
        model,
        options: {
          temperature: options.temperature ?? 0.7,
          numPredict: options.maxTokens ?? 4096,
        },
        tools: options.tools,
      }
    );

    // Notify RAG context
    if (ragContext && callbacks?.onRAGContext) {
      callbacks.onRAGContext(ragContext);
    }

    return {
      content: content || fullContent,
      model,
      ragContext,
    };
  }

  // ============================================================================
  // COMPLETE - Direct LLM without RAG
  // ============================================================================

  async complete(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      system?: string;
      stream?: boolean;
      onToken?: (token: string) => void;
    } = {}
  ): Promise<string> {
    await this.ensureInitialized();

    if (!this.ollamaService.isAvailable()) {
      throw new Error('Ollama is not available');
    }

    const model = options.model || await this.selectModel('completion');

    if (options.stream && options.onToken) {
      const messages: OllamaChatMessage[] = [
        { role: 'user', content: prompt },
      ];
      if (options.system) {
        messages.unshift({ role: 'system', content: options.system });
      }

      return this.ollamaService.streamChat(
        messages,
        {
          onToken: options.onToken,
          onComplete: () => {},
          onError: (error) => { throw error; },
        },
        {
          model,
          options: {
            temperature: options.temperature ?? 0.7,
            numPredict: options.maxTokens ?? 4096,
          },
        }
      );
    }

    return this.ollamaService.generate(prompt, {
      model,
      system: options.system,
      options: {
        temperature: options.temperature ?? 0.7,
        numPredict: options.maxTokens ?? 4096,
      },
    });
  }

  // ============================================================================
  // DOCUMENT INGESTION
  // ============================================================================

  async ingestDocument(
    source: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    await this.ensureInitialized();

    if (!this.qdrantService.isAvailable()) {
      return {
        documentId: '',
        source,
        chunksCreated: 0,
        totalTokens: 0,
        processingTime: 0,
        collection: options.collection || this.config.qdrant.defaultCollection,
        success: false,
        error: 'Qdrant is not available',
      };
    }

    this.emit('ingestion:start', { source });

    // Determine source type and ingest
    let result: IngestionResult;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      result = await this.ragService.ingestUrl(source, options);
    } else if (source.includes('.')) {
      // Assume it's a file path
      result = await this.ragService.ingestFile(source, options);
    } else {
      // Treat as raw text
      result = await this.ragService.ingestText(source, 'text', options);
    }

    this.emit('ingestion:complete', result);
    return result;
  }

  async ingestText(
    text: string,
    sourceName: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    await this.ensureInitialized();

    if (!this.qdrantService.isAvailable()) {
      return {
        documentId: '',
        source: sourceName,
        chunksCreated: 0,
        totalTokens: 0,
        processingTime: 0,
        collection: options.collection || this.config.qdrant.defaultCollection,
        success: false,
        error: 'Qdrant is not available',
      };
    }

    return this.ragService.ingestText(text, sourceName, options);
  }

  // ============================================================================
  // KNOWLEDGE BASE QUERIES
  // ============================================================================

  async searchKnowledge(
    query: string,
    options: {
      topK?: number;
      minScore?: number;
      collections?: string[];
      filter?: any;
    } = {}
  ): Promise<RAGContext> {
    await this.ensureInitialized();

    if (!this.qdrantService.isAvailable()) {
      return {
        documents: [],
        contextText: '',
        totalTokens: 0,
        sourceCitations: [],
      };
    }

    return this.ragService.buildContext(query, {
      topK: options.topK || this.config.rag.topK,
      minScore: options.minScore || this.config.rag.minScore,
      collections: options.collections,
      filter: options.filter,
    });
  }

  async listDocuments(collection?: string): Promise<{
    documentId: string;
    source: string;
    chunkCount: number;
  }[]> {
    await this.ensureInitialized();

    if (!this.qdrantService.isAvailable()) {
      return [];
    }

    return this.ragService.listDocuments(collection);
  }

  async deleteDocument(documentId: string, collection?: string): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.qdrantService.isAvailable()) {
      return false;
    }

    return this.ragService.deleteDocument(documentId, collection);
  }

  // ============================================================================
  // TOOL/FUNCTION CALLING
  // ============================================================================

  async chatWithTools(
    message: string,
    tools: OllamaTool[],
    options: Partial<ChatOptions> = {}
  ): Promise<{
    content: string;
    toolCalls?: OllamaToolCall[];
    requiresToolExecution: boolean;
  }> {
    const response = await this.chat(message, {
      ...options,
      tools,
      useKnowledge: options.useKnowledge ?? false, // Default to no RAG for tool calls
    });

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      requiresToolExecution: (response.toolCalls?.length || 0) > 0,
    };
  }

  async executeToolAndRespond(
    originalMessage: string,
    toolCall: OllamaToolCall,
    toolResult: unknown,
    options: Partial<ChatOptions> = {}
  ): Promise<ChatResponse> {
    const messages: OllamaChatMessage[] = [
      { role: 'system', content: options.systemPrompt || this.config.system.systemPrompt },
      { role: 'user', content: originalMessage },
      {
        role: 'assistant',
        content: JSON.stringify({
          tool_calls: [{
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          }],
        }),
      },
      {
        role: 'user',
        content: `Tool "${toolCall.function.name}" returned: ${JSON.stringify(toolResult)}`,
      },
    ];

    const model = options.model || await this.selectModel('chat', options);

    return this.nonStreamChat(messages, model, options);
  }

  // ============================================================================
  // MODEL SELECTION
  // ============================================================================

  async selectModel(
    taskType: TaskType,
    options: Partial<ChatOptions> = {}
  ): Promise<string> {
    // If model explicitly specified, use it
    if (options.model) {
      return options.model;
    }

    // If auto-select disabled, use default
    if (!this.config.modelSelection.autoSelect) {
      return this.config.ollama.defaultModel;
    }

    // Auto-select based on task
    const preferredModels = this.getPreferredModelsForTask(taskType);

    for (const modelName of preferredModels) {
      const available = this.availableModels.find(m =>
        m.name.toLowerCase().startsWith(modelName.toLowerCase())
      );
      if (available?.isAvailable) {
        return available.name;
      }
    }

    // Fallback to best available chat model
    return this.ollamaService.getBestChatModel();
  }

  private getPreferredModelsForTask(taskType: TaskType): string[] {
    switch (taskType) {
      case 'code':
        return ['deepseek-coder', 'codellama', 'qwen2.5-coder', 'llama3.2'];
      case 'analysis':
        return ['llama3.2', 'qwen2.5', 'mixtral', 'mistral'];
      case 'summarization':
        return ['llama3.2', 'mistral', 'phi3'];
      case 'embedding':
        return ['nomic-embed-text', 'mxbai-embed-large'];
      case 'vision':
        return ['llava', 'bakllava', 'llama3.2-vision'];
      case 'chat':
      case 'completion':
      default:
        return ['llama3.2', 'qwen2.5', 'mistral', 'phi3'];
    }
  }

  private getModelContextWindow(modelName: string): number {
    const lower = modelName.toLowerCase();
    if (lower.includes('llama3.2')) return 128000;
    if (lower.includes('llama3')) return 8192;
    if (lower.includes('mistral')) return 32768;
    if (lower.includes('mixtral')) return 32768;
    if (lower.includes('qwen')) return 32768;
    if (lower.includes('phi3')) return 128000;
    if (lower.includes('deepseek')) return 16384;
    return 4096; // Default
  }

  private modelSupportsVision(modelName: string): boolean {
    const lower = modelName.toLowerCase();
    return lower.includes('llava') ||
           lower.includes('bakllava') ||
           lower.includes('vision') ||
           lower.includes('moondream');
  }

  private modelSupportsTools(modelName: string): boolean {
    const lower = modelName.toLowerCase();
    return lower.includes('llama3') ||
           lower.includes('mistral') ||
           lower.includes('qwen') ||
           lower.includes('mixtral') ||
           lower.includes('hermes');
  }

  private getModelSpecializations(modelName: string): TaskType[] {
    const lower = modelName.toLowerCase();
    const specializations: TaskType[] = ['chat'];

    if (lower.includes('code') || lower.includes('coder')) {
      specializations.push('code');
    }
    if (lower.includes('vision') || lower.includes('llava')) {
      specializations.push('vision');
    }
    if (lower.includes('embed')) {
      specializations.push('embedding');
    }

    return specializations;
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT
  // ============================================================================

  private createConversation(id: string, userId?: string): ConversationHistory {
    const conversation: ConversationHistory = {
      id,
      userId: userId || 'default',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  private getConversationMessages(
    conversation: ConversationHistory,
    maxMessages: number
  ): OllamaChatMessage[] {
    const recent = conversation.messages.slice(-maxMessages);
    return recent.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }

  private addToConversation(
    conversation: ConversationHistory,
    content: string,
    role: 'user' | 'assistant' | 'system',
    metadata?: any
  ): void {
    conversation.messages.push({
      id: uuid(),
      role,
      content,
      timestamp: new Date(),
      metadata,
    });
    conversation.updatedAt = new Date();

    // Trim if too many messages
    if (conversation.messages.length > this.config.memory.maxMessages * 1.5) {
      conversation.messages = conversation.messages.slice(-this.config.memory.maxMessages);
    }
  }

  getConversation(id: string): ConversationHistory | undefined {
    return this.conversations.get(id);
  }

  clearConversation(id: string): void {
    this.conversations.delete(id);
  }

  clearAllConversations(): void {
    this.conversations.clear();
  }

  // ============================================================================
  // HEALTH AND STATUS
  // ============================================================================

  async getHealth(): Promise<BrainHealthStatus> {
    const [ollamaStatus, qdrantStatus, embeddingStatus] = await Promise.all([
      this.ollamaService.getStatus(),
      this.qdrantService.getStatus(),
      this.embeddingService.getStatus(),
    ]);

    // Get collection info
    let collections: any[] = [];
    if (qdrantStatus.available) {
      try {
        const collectionList = await this.qdrantService.listCollections();
        collections = await Promise.all(
          collectionList.map(c => this.qdrantService.getCollectionInfo(c.name))
        );
      } catch {
        // Ignore collection fetch errors
      }
    }

    // Determine overall health
    const allHealthy = ollamaStatus.available && qdrantStatus.available;
    const anyHealthy = ollamaStatus.available || qdrantStatus.available;

    return {
      overall: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy',
      services: {
        ollama: ollamaStatus,
        qdrant: qdrantStatus,
        embedding: embeddingStatus,
      },
      models: this.availableModels,
      collections,
      timestamp: new Date(),
    };
  }

  isReady(): boolean {
    return this.initialized && this.ollamaService.isAvailable();
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  updateConfig(config: Partial<LocalAIBrainConfig>): void {
    this.config = this.mergeConfig({ ...this.config, ...config } as any);

    // Update RAG config if changed
    if (config.rag) {
      this.ragService.updateConfig(config.rag);
    }
    if (config.chunking) {
      this.ragService.updateChunkingConfig(config.chunking);
    }
  }

  getConfig(): LocalAIBrainConfig {
    return { ...this.config };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================================================
  // SERVICE ACCESS (for advanced usage)
  // ============================================================================

  getOllamaService(): OllamaService {
    return this.ollamaService;
  }

  getQdrantService(): QdrantService {
    return this.qdrantService;
  }

  getEmbeddingService(): ModularEmbeddingService {
    return this.embeddingService;
  }

  getRAGService(): RAGService {
    return this.ragService;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create and initialize a Local AI Brain instance
 */
export async function createLocalAIBrain(
  config?: Partial<LocalAIBrainConfig>
): Promise<LocalAIBrain> {
  const brain = new LocalAIBrain(config);
  await brain.initialize();
  return brain;
}

/**
 * Create a Local AI Brain without auto-initialization
 */
export function createLocalAIBrainSync(
  config?: Partial<LocalAIBrainConfig>
): LocalAIBrain {
  return new LocalAIBrain(config);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

let defaultBrain: LocalAIBrain | null = null;

/**
 * Get the default Local AI Brain instance (singleton)
 */
export async function getDefaultLocalAIBrain(): Promise<LocalAIBrain> {
  if (!defaultBrain) {
    defaultBrain = await createLocalAIBrain();
  }
  return defaultBrain;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default LocalAIBrain;
