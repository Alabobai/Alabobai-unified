/**
 * Alabobai Ollama Service
 * Production-ready service for local Ollama LLM integration
 * Supports streaming, function calling, embeddings, and model management
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Supported Ollama models with their context window sizes */
export const OLLAMA_MODELS = {
  'llama3': { contextWindow: 8192, supportsTools: true },
  'llama3:8b': { contextWindow: 8192, supportsTools: true },
  'llama3:70b': { contextWindow: 8192, supportsTools: true },
  'llama3.1': { contextWindow: 131072, supportsTools: true },
  'llama3.1:8b': { contextWindow: 131072, supportsTools: true },
  'llama3.1:70b': { contextWindow: 131072, supportsTools: true },
  'llama3.2': { contextWindow: 131072, supportsTools: true },
  'llama3.2:1b': { contextWindow: 131072, supportsTools: true },
  'llama3.2:3b': { contextWindow: 131072, supportsTools: true },
  'mixtral': { contextWindow: 32768, supportsTools: true },
  'mixtral:8x7b': { contextWindow: 32768, supportsTools: true },
  'mixtral:8x22b': { contextWindow: 65536, supportsTools: true },
  'mistral': { contextWindow: 32768, supportsTools: true },
  'mistral:7b': { contextWindow: 32768, supportsTools: true },
  'mistral-nemo': { contextWindow: 128000, supportsTools: true },
  'phi3': { contextWindow: 4096, supportsTools: false },
  'phi3:mini': { contextWindow: 4096, supportsTools: false },
  'phi3:medium': { contextWindow: 4096, supportsTools: false },
  'codellama': { contextWindow: 16384, supportsTools: false },
  'codellama:7b': { contextWindow: 16384, supportsTools: false },
  'codellama:13b': { contextWindow: 16384, supportsTools: false },
  'codellama:34b': { contextWindow: 16384, supportsTools: false },
  'codellama:70b': { contextWindow: 16384, supportsTools: false },
  'nomic-embed-text': { contextWindow: 8192, supportsTools: false },
  'mxbai-embed-large': { contextWindow: 512, supportsTools: false },
} as const;

export type OllamaModelId = keyof typeof OLLAMA_MODELS;

export interface OllamaServiceConfig {
  /** Base URL of Ollama server (default: http://localhost:11434) */
  baseUrl?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Default embedding model */
  embeddingModel?: string;
  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Maximum context window percentage to use (default: 0.9 = 90%) */
  maxContextUsage?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool call results */
  tool_call_id?: string;
  /** Images for multimodal models (base64 encoded) */
  images?: string[];
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, OllamaToolParameter>;
      required?: string[];
    };
  };
}

export interface OllamaToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: OllamaToolParameter;
}

export interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OllamaChatOptions {
  /** Model to use for this request */
  model?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Top-p sampling */
  top_p?: number;
  /** Top-k sampling */
  top_k?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** System prompt override */
  system?: string;
  /** Tools for function calling */
  tools?: OllamaTool[];
  /** Format (json for JSON mode) */
  format?: 'json' | '';
  /** Context window size override */
  num_ctx?: number;
  /** Repeat penalty */
  repeat_penalty?: number;
  /** Seed for reproducibility */
  seed?: number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

export interface OllamaEmbeddingResponse {
  model: string;
  embedding: number[];
}

export interface OllamaEmbeddingsResponse {
  model: string;
  embeddings: number[][];
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelStatus {
  name: string;
  available: boolean;
  loaded: boolean;
  size?: number;
  digest?: string;
  modifiedAt?: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}

export interface OllamaGenerateOptions {
  /** Model to use */
  model?: string;
  /** Prompt text */
  prompt: string;
  /** System prompt */
  system?: string;
  /** Template override */
  template?: string;
  /** Context from previous response */
  context?: number[];
  /** Stream the response */
  stream?: boolean;
  /** Raw mode (no formatting) */
  raw?: boolean;
  /** Format (json for JSON mode) */
  format?: 'json' | '';
  /** Generation options */
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    num_predict?: number;
    stop?: string[];
    repeat_penalty?: number;
    seed?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  availableTokens: number;
  messages: OllamaMessage[];
}

/** Error codes for Ollama operations */
export enum OllamaErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_NOT_LOADED = 'MODEL_NOT_LOADED',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  CONTEXT_OVERFLOW = 'CONTEXT_OVERFLOW',
  PULL_FAILED = 'PULL_FAILED',
  UNKNOWN = 'UNKNOWN',
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public code: OllamaErrorCode,
    public statusCode?: number,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

// ============================================================================
// OLLAMA SERVICE IMPLEMENTATION
// ============================================================================

export class OllamaService {
  private baseUrl: string;
  private defaultModel: string;
  private embeddingModel: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  private maxContextUsage: number;
  private debug: boolean;
  private currentModel: string;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: OllamaServiceConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.defaultModel = config.defaultModel || 'llama3';
    this.embeddingModel = config.embeddingModel || 'nomic-embed-text';
    this.timeout = config.timeout || 120000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.maxContextUsage = config.maxContextUsage || 0.9;
    this.debug = config.debug || false;
    this.currentModel = this.defaultModel;
  }

  // ==========================================================================
  // CONNECTION & HEALTH
  // ==========================================================================

  /**
   * Check if Ollama server is reachable
   */
  async isConnected(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/version`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get Ollama server version
   */
  async getVersion(): Promise<string> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/version`);
    const data = await response.json();
    return data.version;
  }

  /**
   * Wait for Ollama to become available
   */
  async waitForConnection(
    maxAttempts: number = 30,
    intervalMs: number = 1000,
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isConnected()) {
        return true;
      }
      await this.sleep(intervalMs);
    }
    return false;
  }

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    return data.models || [];
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
    );
  }

  /**
   * Get status of a model
   */
  async getModelStatus(modelName: string): Promise<OllamaModelStatus> {
    const models = await this.listModels();
    const model = models.find(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
    );

    if (!model) {
      return { name: modelName, available: false, loaded: false };
    }

    return {
      name: model.name,
      available: true,
      loaded: true, // Ollama loads models on demand
      size: model.size,
      digest: model.digest,
      modifiedAt: model.modified_at,
    };
  }

  /**
   * Pull/download a model with progress tracking
   */
  async pullModel(
    modelName: string,
    onProgress?: (progress: OllamaPullProgress) => void,
  ): Promise<void> {
    const requestId = `pull-${modelName}-${Date.now()}`;
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);

    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new OllamaError(
          `Failed to pull model ${modelName}`,
          OllamaErrorCode.PULL_FAILED,
          response.status,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new OllamaError(
          'No response body',
          OllamaErrorCode.PULL_FAILED,
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const progress = JSON.parse(line) as OllamaPullProgress;
            if (progress.total && progress.completed) {
              progress.percent = Math.round(
                (progress.completed / progress.total) * 100,
              );
            }
            onProgress?.(progress);
          } catch {
            // Skip malformed JSON
          }
        }
      }

      this.log(`Model ${modelName} pulled successfully`);
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new OllamaError(
        `Failed to delete model ${modelName}`,
        OllamaErrorCode.INVALID_REQUEST,
        response.status,
      );
    }
  }

  /**
   * Copy a model to a new name
   */
  async copyModel(source: string, destination: string): Promise<void> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    });

    if (!response.ok) {
      throw new OllamaError(
        `Failed to copy model from ${source} to ${destination}`,
        OllamaErrorCode.INVALID_REQUEST,
        response.status,
      );
    }
  }

  /**
   * Get model information/details
   */
  async showModel(modelName: string): Promise<Record<string, unknown>> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new OllamaError(
        `Model ${modelName} not found`,
        OllamaErrorCode.MODEL_NOT_FOUND,
        response.status,
      );
    }

    return response.json();
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelName: string): Promise<void> {
    const isAvailable = await this.isModelAvailable(modelName);
    if (!isAvailable) {
      throw new OllamaError(
        `Model ${modelName} is not available. Run pullModel() first.`,
        OllamaErrorCode.MODEL_NOT_FOUND,
      );
    }
    this.currentModel = modelName;
    this.log(`Switched to model: ${modelName}`);
  }

  /**
   * Get currently selected model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Ensure a model is available, pulling if necessary
   */
  async ensureModel(
    modelName: string,
    onProgress?: (progress: OllamaPullProgress) => void,
  ): Promise<void> {
    const isAvailable = await this.isModelAvailable(modelName);
    if (!isAvailable) {
      this.log(`Model ${modelName} not found, pulling...`);
      await this.pullModel(modelName, onProgress);
    }
  }

  // ==========================================================================
  // CHAT COMPLETIONS
  // ==========================================================================

  /**
   * Send a chat completion request (non-streaming)
   */
  async chat(
    messages: OllamaMessage[],
    options: OllamaChatOptions = {},
  ): Promise<OllamaChatResponse> {
    const model = options.model || this.currentModel;
    const contextWindow = this.getContextWindowSize(model);
    const managedMessages = this.manageContext(messages, contextWindow);

    const payload = {
      model,
      messages: managedMessages,
      stream: false,
      options: {
        temperature: options.temperature,
        top_p: options.top_p,
        top_k: options.top_k,
        num_ctx: options.num_ctx || contextWindow,
        num_predict: options.max_tokens,
        stop: options.stop,
        repeat_penalty: options.repeat_penalty,
        seed: options.seed,
      },
      tools: options.tools,
      format: options.format,
    };

    // Remove undefined values
    this.cleanPayload(payload);

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OllamaError(
        `Chat request failed: ${error}`,
        this.classifyError(response.status, error),
        response.status,
      );
    }

    return response.json();
  }

  /**
   * Stream chat completions
   */
  async *streamChat(
    messages: OllamaMessage[],
    options: OllamaChatOptions = {},
  ): AsyncGenerator<OllamaStreamChunk, OllamaChatResponse, unknown> {
    const model = options.model || this.currentModel;
    const contextWindow = this.getContextWindowSize(model);
    const managedMessages = this.manageContext(messages, contextWindow);
    const requestId = `chat-${Date.now()}`;
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);

    const payload = {
      model,
      messages: managedMessages,
      stream: true,
      options: {
        temperature: options.temperature,
        top_p: options.top_p,
        top_k: options.top_k,
        num_ctx: options.num_ctx || contextWindow,
        num_predict: options.max_tokens,
        stop: options.stop,
        repeat_penalty: options.repeat_penalty,
        seed: options.seed,
      },
      tools: options.tools,
      format: options.format,
    };

    this.cleanPayload(payload);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new OllamaError(
          `Chat stream failed: ${error}`,
          this.classifyError(response.status, error),
          response.status,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new OllamaError(
          'No response body',
          OllamaErrorCode.UNKNOWN,
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResponse: OllamaChatResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;
            if (chunk.done) {
              finalResponse = chunk as unknown as OllamaChatResponse;
            } else {
              yield chunk;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      if (finalResponse) {
        return finalResponse;
      }

      throw new OllamaError(
        'Stream ended without final response',
        OllamaErrorCode.UNKNOWN,
      );
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * Stream chat completions with callback
   */
  async streamChatWithCallback(
    messages: OllamaMessage[],
    onChunk: (chunk: string, toolCalls?: OllamaToolCall[]) => void,
    options: OllamaChatOptions = {},
  ): Promise<OllamaChatResponse> {
    let fullContent = '';
    let toolCalls: OllamaToolCall[] | undefined;
    let finalResponse: OllamaChatResponse | null = null;

    for await (const chunk of this.streamChat(messages, options)) {
      const content = chunk.message?.content || '';
      if (content) {
        fullContent += content;
        onChunk(content);
      }
      if (chunk.message?.tool_calls) {
        toolCalls = chunk.message.tool_calls;
        onChunk('', toolCalls);
      }
    }

    // Return synthesized response if stream didn't provide final
    finalResponse = {
      model: options.model || this.currentModel,
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: fullContent,
        tool_calls: toolCalls,
      },
      done: true,
    };

    return finalResponse;
  }

  // ==========================================================================
  // FUNCTION/TOOL CALLING
  // ==========================================================================

  /**
   * Chat with tool/function calling support
   */
  async chatWithTools(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    options: Omit<OllamaChatOptions, 'tools'> = {},
  ): Promise<OllamaChatResponse> {
    const model = options.model || this.currentModel;
    const modelInfo = OLLAMA_MODELS[model as OllamaModelId];

    if (modelInfo && !modelInfo.supportsTools) {
      throw new OllamaError(
        `Model ${model} does not support tool calling`,
        OllamaErrorCode.INVALID_REQUEST,
      );
    }

    return this.chat(messages, { ...options, tools });
  }

  /**
   * Execute a tool call and return the result message
   */
  createToolResultMessage(
    toolCallId: string,
    result: unknown,
  ): OllamaMessage {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  }

  /**
   * Parse tool call arguments
   */
  parseToolCallArguments<T = Record<string, unknown>>(
    toolCall: OllamaToolCall,
  ): T {
    try {
      return JSON.parse(toolCall.function.arguments) as T;
    } catch {
      throw new OllamaError(
        `Failed to parse tool call arguments: ${toolCall.function.arguments}`,
        OllamaErrorCode.INVALID_REQUEST,
      );
    }
  }

  /**
   * Complete agentic loop with tool execution
   */
  async runAgentLoop(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    toolExecutor: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
    options: OllamaChatOptions & { maxIterations?: number } = {},
  ): Promise<{
    messages: OllamaMessage[];
    finalResponse: OllamaChatResponse;
  }> {
    const maxIterations = options.maxIterations || 10;
    const conversationMessages = [...messages];
    let response: OllamaChatResponse;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      response = await this.chatWithTools(conversationMessages, tools, options);

      // Add assistant message to conversation
      conversationMessages.push({
        role: 'assistant',
        content: response.message.content,
      });

      // Check if there are tool calls
      const toolCalls = response.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls, agent is done
        return { messages: conversationMessages, finalResponse: response };
      }

      // Execute each tool call
      for (const toolCall of toolCalls) {
        try {
          const args = this.parseToolCallArguments(toolCall);
          const result = await toolExecutor(toolCall.function.name, args);
          conversationMessages.push(
            this.createToolResultMessage(toolCall.id, result),
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          conversationMessages.push(
            this.createToolResultMessage(toolCall.id, {
              error: errorMessage,
            }),
          );
        }
      }
    }

    throw new OllamaError(
      `Agent loop exceeded maximum iterations (${maxIterations})`,
      OllamaErrorCode.TIMEOUT,
    );
  }

  // ==========================================================================
  // GENERATE (RAW COMPLETION)
  // ==========================================================================

  /**
   * Generate completion (raw, non-chat format)
   */
  async generate(options: OllamaGenerateOptions): Promise<OllamaGenerateResponse> {
    const model = options.model || this.currentModel;

    const payload = {
      model,
      prompt: options.prompt,
      system: options.system,
      template: options.template,
      context: options.context,
      stream: false,
      raw: options.raw,
      format: options.format,
      options: options.options,
    };

    this.cleanPayload(payload);

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OllamaError(
        `Generate request failed: ${error}`,
        this.classifyError(response.status, error),
        response.status,
      );
    }

    return response.json();
  }

  /**
   * Stream generate completion
   */
  async *streamGenerate(
    options: OllamaGenerateOptions,
  ): AsyncGenerator<OllamaGenerateResponse, OllamaGenerateResponse, unknown> {
    const model = options.model || this.currentModel;
    const requestId = `generate-${Date.now()}`;
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);

    const payload = {
      model,
      prompt: options.prompt,
      system: options.system,
      template: options.template,
      context: options.context,
      stream: true,
      raw: options.raw,
      format: options.format,
      options: options.options,
    };

    this.cleanPayload(payload);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new OllamaError(
          `Generate stream failed: ${error}`,
          this.classifyError(response.status, error),
          response.status,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new OllamaError('No response body', OllamaErrorCode.UNKNOWN);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResponse: OllamaGenerateResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaGenerateResponse;
            if (chunk.done) {
              finalResponse = chunk;
            } else {
              yield chunk;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      if (finalResponse) {
        return finalResponse;
      }

      throw new OllamaError(
        'Stream ended without final response',
        OllamaErrorCode.UNKNOWN,
      );
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  /**
   * Generate embedding for a single text
   */
  async embed(
    text: string,
    model?: string,
  ): Promise<number[]> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || this.embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OllamaError(
        `Embedding request failed: ${error}`,
        this.classifyError(response.status, error),
        response.status,
      );
    }

    const data: OllamaEmbeddingResponse = await response.json();
    return data.embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(
    texts: string[],
    model?: string,
  ): Promise<number[][]> {
    // Ollama doesn't have native batch embedding, so we parallelize
    const embeddings = await Promise.all(
      texts.map((text) => this.embed(text, model)),
    );
    return embeddings;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar texts from a corpus
   */
  async findSimilar(
    query: string,
    corpus: string[],
    topK: number = 5,
    model?: string,
  ): Promise<Array<{ text: string; score: number; index: number }>> {
    const queryEmbedding = await this.embed(query, model);
    const corpusEmbeddings = await this.embedBatch(corpus, model);

    const similarities = corpusEmbeddings.map((embedding, index) => ({
      text: corpus[index],
      score: this.cosineSimilarity(queryEmbedding, embedding),
      index,
    }));

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // ==========================================================================
  // CONTEXT WINDOW MANAGEMENT
  // ==========================================================================

  /**
   * Get context window size for a model
   */
  getContextWindowSize(model?: string): number {
    const modelName = model || this.currentModel;
    const modelInfo = OLLAMA_MODELS[modelName as OllamaModelId];
    return modelInfo?.contextWindow || 4096;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate token count for messages
   */
  estimateMessagesTokens(messages: OllamaMessage[]): number {
    let tokens = 0;
    for (const message of messages) {
      // Add overhead for role and formatting
      tokens += 4;
      tokens += this.estimateTokens(message.content);
      if (message.images) {
        // Images are roughly 85 tokens per 512x512 patch
        tokens += message.images.length * 85;
      }
    }
    return tokens;
  }

  /**
   * Manage context window - truncate old messages if needed
   */
  manageContext(
    messages: OllamaMessage[],
    maxTokens?: number,
  ): OllamaMessage[] {
    const contextSize = maxTokens || this.getContextWindowSize();
    const maxUsableTokens = Math.floor(contextSize * this.maxContextUsage);

    // Always keep system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    let currentTokens = systemMessage
      ? this.estimateTokens(systemMessage.content) + 4
      : 0;

    // Keep messages from the end (most recent)
    const keptMessages: OllamaMessage[] = [];
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const message = nonSystemMessages[i];
      const messageTokens = this.estimateTokens(message.content) + 4;

      if (currentTokens + messageTokens > maxUsableTokens) {
        break;
      }

      keptMessages.unshift(message);
      currentTokens += messageTokens;
    }

    const result = systemMessage ? [systemMessage, ...keptMessages] : keptMessages;

    if (keptMessages.length < nonSystemMessages.length) {
      this.log(
        `Context truncated: kept ${keptMessages.length}/${nonSystemMessages.length} messages`,
      );
    }

    return result;
  }

  /**
   * Get current context window usage info
   */
  getContextInfo(messages: OllamaMessage[], model?: string): ContextWindow {
    const maxTokens = this.getContextWindowSize(model);
    const usedTokens = this.estimateMessagesTokens(messages);
    return {
      maxTokens,
      usedTokens,
      availableTokens: maxTokens - usedTokens,
      messages,
    };
  }

  // ==========================================================================
  // REQUEST CANCELLATION
  // ==========================================================================

  /**
   * Cancel a specific request
   */
  cancelRequest(requestId: string): boolean {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach((controller, id) => {
      controller.abort();
      this.abortControllers.delete(id);
    });
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OllamaError(
          'Request timed out',
          OllamaErrorCode.TIMEOUT,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);

        // Don't retry on client errors (4xx) except rate limiting
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Retry on server errors (5xx) and rate limiting
        if (response.status >= 500 || response.status === 429) {
          throw new OllamaError(
            `Server error: ${response.status}`,
            response.status === 429
              ? OllamaErrorCode.RATE_LIMITED
              : OllamaErrorCode.UNKNOWN,
            response.status,
          );
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a connection error
        if (
          lastError.message.includes('ECONNREFUSED') ||
          lastError.message.includes('fetch failed')
        ) {
          throw new OllamaError(
            `Failed to connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
            OllamaErrorCode.CONNECTION_FAILED,
            undefined,
            lastError,
          );
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          this.log(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw new OllamaError(
      `Request failed after ${this.maxRetries} attempts: ${lastError?.message}`,
      OllamaErrorCode.UNKNOWN,
      undefined,
      lastError,
    );
  }

  /**
   * Classify error code from response
   */
  private classifyError(status: number, message: string): OllamaErrorCode {
    if (status === 404 || message.includes('not found')) {
      return OllamaErrorCode.MODEL_NOT_FOUND;
    }
    if (status === 429) {
      return OllamaErrorCode.RATE_LIMITED;
    }
    if (status === 400) {
      return OllamaErrorCode.INVALID_REQUEST;
    }
    if (message.includes('context') || message.includes('too long')) {
      return OllamaErrorCode.CONTEXT_OVERFLOW;
    }
    return OllamaErrorCode.UNKNOWN;
  }

  /**
   * Remove undefined values from payload
   */
  private cleanPayload(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) {
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.cleanPayload(obj[key] as Record<string, unknown>);
        // Remove empty objects
        if (Object.keys(obj[key] as object).length === 0) {
          delete obj[key];
        }
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[OllamaService] ${message}`);
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new Ollama service instance
 */
export function createOllamaService(
  config: OllamaServiceConfig = {},
): OllamaService {
  return new OllamaService(config);
}

/**
 * Create an Ollama service with default configuration from environment
 */
export function getDefaultOllamaService(): OllamaService {
  return new OllamaService({
    baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'llama3',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    debug: process.env.OLLAMA_DEBUG === 'true',
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a tool definition for function calling
 */
export function createTool(
  name: string,
  description: string,
  parameters: Record<string, OllamaToolParameter>,
  required?: string[],
): OllamaTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: parameters,
        required,
      },
    },
  };
}

/**
 * Create a system message
 */
export function systemMessage(content: string): OllamaMessage {
  return { role: 'system', content };
}

/**
 * Create a user message
 */
export function userMessage(content: string, images?: string[]): OllamaMessage {
  return { role: 'user', content, images };
}

/**
 * Create an assistant message
 */
export function assistantMessage(content: string): OllamaMessage {
  return { role: 'assistant', content };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default OllamaService;
