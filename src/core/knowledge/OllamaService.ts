/**
 * Ollama Service for Local AI Brain
 * Handles communication with Ollama for LLM inference and embeddings
 */

import { EventEmitter } from 'events';
import type {
  OllamaConfig,
  OllamaModel,
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaChatResponse,
  OllamaStreamChunk,
  OllamaTool,
  OllamaToolCall,
  ServiceStatus,
} from '../llm/types.js';

// ============================================================================
// OLLAMA SERVICE
// ============================================================================

export class OllamaService extends EventEmitter {
  private baseUrl: string;
  private timeout: number;
  private healthCheckInterval: number;
  private availableModels: OllamaModel[] = [];
  private isRunning: boolean = false;
  private lastHealthCheck: number = 0;

  // Preferred models in order of priority
  private static readonly PREFERRED_CHAT_MODELS = [
    'llama3.2',
    'llama3.1',
    'llama3',
    'mistral',
    'mixtral',
    'qwen2.5',
    'deepseek-coder-v2',
    'phi3',
    'gemma2',
  ];

  private static readonly PREFERRED_EMBEDDING_MODELS = [
    'nomic-embed-text',
    'mxbai-embed-large',
    'all-minilm',
    'snowflake-arctic-embed',
  ];

  constructor(config: Partial<OllamaConfig> = {}) {
    super();
    const defaults = {
      baseUrl: 'http://localhost:11434',
      timeout: 120000,
      healthCheckInterval: 30000,
    };
    this.baseUrl = config.baseUrl ?? defaults.baseUrl;
    this.timeout = config.timeout ?? defaults.timeout;
    this.healthCheckInterval = config.healthCheckInterval ?? defaults.healthCheckInterval;
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  async checkHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isRunning) {
      return this.isRunning;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      this.isRunning = response.ok;
      this.lastHealthCheck = now;

      if (this.isRunning) {
        const data = await response.json();
        this.availableModels = (data.models || []).map((m: any) => ({
          name: m.name,
          modifiedAt: m.modified_at,
          size: m.size,
          digest: m.digest,
          details: m.details ? {
            format: m.details.format,
            family: m.details.family,
            families: m.details.families,
            parameterSize: m.details.parameter_size,
            quantizationLevel: m.details.quantization_level,
          } : undefined,
        }));
        this.emit('connected', { models: this.availableModels });
      }

      return this.isRunning;
    } catch (error) {
      this.isRunning = false;
      this.lastHealthCheck = now;
      this.emit('disconnected', { error });
      return false;
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    const startTime = Date.now();
    const available = await this.checkHealth();
    const latency = Date.now() - startTime;

    return {
      name: 'Ollama',
      available,
      latency,
      lastChecked: new Date(),
      details: {
        baseUrl: this.baseUrl,
        modelCount: this.availableModels.length,
        models: this.availableModels.map(m => m.name),
      },
    };
  }

  // ============================================================================
  // MODEL MANAGEMENT
  // ============================================================================

  async listModels(): Promise<OllamaModel[]> {
    await this.checkHealth();
    return this.availableModels;
  }

  async hasModel(modelName: string): Promise<boolean> {
    await this.checkHealth();
    return this.availableModels.some(m =>
      m.name.toLowerCase() === modelName.toLowerCase() ||
      m.name.toLowerCase().startsWith(modelName.toLowerCase() + ':')
    );
  }

  async getBestChatModel(): Promise<string> {
    await this.checkHealth();

    if (this.availableModels.length === 0) {
      return 'llama3.2';
    }

    for (const preferred of OllamaService.PREFERRED_CHAT_MODELS) {
      const found = this.availableModels.find(m =>
        m.name.toLowerCase().startsWith(preferred.toLowerCase())
      );
      if (found) {
        return found.name;
      }
    }

    return this.availableModels[0].name;
  }

  async getBestEmbeddingModel(): Promise<string> {
    await this.checkHealth();

    for (const preferred of OllamaService.PREFERRED_EMBEDDING_MODELS) {
      const found = this.availableModels.find(m =>
        m.name.toLowerCase().includes(preferred.toLowerCase())
      );
      if (found) {
        return found.name;
      }
    }

    return 'nomic-embed-text';
  }

  async pullModel(
    modelName: string,
    onProgress?: (status: string, completed?: number, total?: number) => void
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
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
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              onProgress?.(data.status || 'Downloading...', data.completed, data.total);
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      reader.releaseLock();
      await this.checkHealth();
      return true;
    } catch (error) {
      console.error('[OllamaService] Failed to pull model:', error);
      return false;
    }
  }

  // ============================================================================
  // CHAT COMPLETION
  // ============================================================================

  async chat(
    messages: OllamaChatMessage[],
    options: {
      model?: string;
      options?: OllamaChatOptions;
      tools?: OllamaTool[];
      format?: 'json';
    } = {}
  ): Promise<OllamaChatResponse> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Ollama is not available');
    }

    const model = options.model || await this.getBestChatModel();

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 4096,
        ...options.options,
      },
    };

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    if (options.format) {
      requestBody.format = options.format;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      model: data.model,
      createdAt: data.created_at,
      message: {
        role: data.message?.role || 'assistant',
        content: data.message?.content || '',
        toolCalls: data.message?.tool_calls?.map((tc: any) => ({
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
          },
        })),
      },
      done: data.done,
      totalDuration: data.total_duration,
      loadDuration: data.load_duration,
      promptEvalCount: data.prompt_eval_count,
      promptEvalDuration: data.prompt_eval_duration,
      evalCount: data.eval_count,
      evalDuration: data.eval_duration,
    };
  }

  async streamChat(
    messages: OllamaChatMessage[],
    callbacks: {
      onToken: (token: string) => void;
      onComplete: () => void;
      onError: (error: Error) => void;
      onToolCall?: (toolCall: OllamaToolCall) => void;
    },
    options: {
      model?: string;
      options?: OllamaChatOptions;
      tools?: OllamaTool[];
    } = {}
  ): Promise<string> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      callbacks.onError(new Error('Ollama is not available'));
      return '';
    }

    const model = options.model || await this.getBestChatModel();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const requestBody: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 4096,
          ...options.options,
        },
      };

      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk: OllamaStreamChunk = JSON.parse(line);

                if (chunk.message?.content) {
                  fullResponse += chunk.message.content;
                  callbacks.onToken(chunk.message.content);
                }

                // Handle tool calls in streaming (if supported by model)
                const rawChunk = JSON.parse(line);
                if (rawChunk.message?.tool_calls && callbacks.onToolCall) {
                  for (const tc of rawChunk.message.tool_calls) {
                    callbacks.onToolCall({
                      function: {
                        name: tc.function.name,
                        arguments: typeof tc.function.arguments === 'string'
                          ? JSON.parse(tc.function.arguments)
                          : tc.function.arguments,
                      },
                    });
                  }
                }

                if (chunk.done) {
                  callbacks.onComplete();
                  return fullResponse;
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const chunk: OllamaStreamChunk = JSON.parse(buffer);
            if (chunk.message?.content) {
              fullResponse += chunk.message.content;
              callbacks.onToken(chunk.message.content);
            }
          } catch {
            // Ignore incomplete chunk
          }
        }

        callbacks.onComplete();
        return fullResponse;
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          callbacks.onError(new Error('Request timeout'));
        } else {
          callbacks.onError(error);
        }
      } else {
        callbacks.onError(new Error('Unknown error'));
      }
      return '';
    }
  }

  // ============================================================================
  // COMPLETION (NON-CHAT)
  // ============================================================================

  async generate(
    prompt: string,
    options: {
      model?: string;
      options?: OllamaChatOptions;
      format?: 'json';
      system?: string;
    } = {}
  ): Promise<string> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Ollama is not available');
    }

    const model = options.model || await this.getBestChatModel();

    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 4096,
        ...options.options,
      },
    };

    if (options.format) {
      requestBody.format = options.format;
    }

    if (options.system) {
      requestBody.system = options.system;
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.response || '';
  }

  // ============================================================================
  // EMBEDDINGS
  // ============================================================================

  async embed(text: string, model?: string): Promise<number[]> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Ollama is not available');
    }

    const embeddingModel = model || await this.getBestEmbeddingModel();

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding generation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding || [];
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    const embeddings: number[][] = [];
    const embeddingModel = model || await this.getBestEmbeddingModel();

    // Ollama doesn't support batch embeddings natively, so we process sequentially
    // but we can add concurrency for better performance
    const batchSize = 5;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embed(text, embeddingModel))
      );
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getBaseUrl(): string {
    return this.baseUrl;
  }

  isAvailable(): boolean {
    return this.isRunning;
  }

  getCachedModels(): OllamaModel[] {
    return this.availableModels;
  }
}

// ============================================================================
// FACTORY AND SINGLETON
// ============================================================================

let defaultOllamaService: OllamaService | null = null;

export function createOllamaService(config?: Partial<OllamaConfig>): OllamaService {
  return new OllamaService(config);
}

export function getDefaultOllamaService(): OllamaService {
  if (!defaultOllamaService) {
    defaultOllamaService = new OllamaService();
  }
  return defaultOllamaService;
}

export default OllamaService;
