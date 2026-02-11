/**
 * Alabobai LLM Router - Ollama Provider
 * Local models via Ollama
 */

import {
  ProviderName,
  ProviderConfig,
  ModelConfig,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  ImageInput,
  LLMError,
  Logger,
} from '../types.js';
import { BaseProvider, defaultLogger } from './BaseProvider.js';

/**
 * Default Ollama model configurations
 * Users should update based on their installed models
 */
const OLLAMA_MODELS: ModelConfig[] = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0, // Free - local model
    outputCostPer1k: 0,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'moderate',
    isDefault: true,
  },
  {
    id: 'llama3.2-vision',
    name: 'Llama 3.2 Vision',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'moderate',
  },
  {
    id: 'qwen2.5-coder',
    name: 'Qwen 2.5 Coder',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'moderate',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'simple',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'complex',
  },
];

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
  images?: string[];
}

interface OllamaGenerateResponse {
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

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string; images?: string[] }[];
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama Local Provider Implementation
 */
export class OllamaProvider extends BaseProvider {
  name: ProviderName = 'ollama';
  private baseUrl: string = 'http://localhost:11434';

  constructor(logger: Logger = defaultLogger) {
    super(logger);
  }

  /**
   * Initialize the Ollama client
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    // Use provided models or defaults
    config.models = config.models.length > 0 ? config.models : OLLAMA_MODELS;

    await super.initialize(config);

    // Optionally fetch available models from Ollama
    try {
      await this.fetchAvailableModels();
    } catch (error) {
      this.logger.warn('Could not fetch Ollama models, using defaults', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Fetch available models from Ollama server
   */
  private async fetchAvailableModels(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tags`);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    const installedModels = data.models || [];

    this.logger.info('Ollama models available', {
      models: installedModels.map((m: { name: string }) => m.name),
    });
  }

  /**
   * Check if provider is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      this.ensureInitialized();

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Ollama health check failed', error as Error);
      return false;
    }
  }

  /**
   * Send a completion request using chat API
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      const modelId = request.model || this.getDefaultModel()?.id || 'llama3.2';
      const messages = this.formatMessages(request.messages);

      const chatRequest: OllamaChatRequest = {
        model: modelId,
        messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          top_p: request.topP,
          num_predict: request.maxTokens || 4096,
          stop: request.stopSequences,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 120000),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const data: OllamaChatResponse = await response.json();
      const latency = Date.now() - startTime;

      return this.createResponse({
        content: data.message.content,
        model: modelId,
        usage: {
          inputTokens: data.prompt_eval_count || this.estimateTokens(request.messages),
          outputTokens: data.eval_count || Math.ceil(data.message.content.length / 4),
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        latency,
        finishReason: 'stop',
      });
    } catch (error) {
      this.handleError(error, 'Ollama completion failed');
    }
  }

  /**
   * Stream a completion request
   */
  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      const modelId = request.model || this.getDefaultModel()?.id || 'llama3.2';
      const messages = this.formatMessages(request.messages);

      const chatRequest: OllamaChatRequest = {
        model: modelId,
        messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          top_p: request.topP,
          num_predict: request.maxTokens || 4096,
          stop: request.stopSequences,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 120000),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data: OllamaChatResponse = JSON.parse(line);

            if (data.message?.content) {
              fullContent += data.message.content;
              onChunk(data.message.content);
            }

            if (data.done) {
              promptTokens = data.prompt_eval_count || 0;
              completionTokens = data.eval_count || 0;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      const latency = Date.now() - startTime;

      return this.createResponse({
        content: fullContent,
        model: modelId,
        usage: {
          inputTokens: promptTokens || this.estimateTokens(request.messages),
          outputTokens: completionTokens || Math.ceil(fullContent.length / 4),
          totalTokens: promptTokens + completionTokens,
        },
        latency,
        finishReason: 'stop',
      });
    } catch (error) {
      this.handleError(error, 'Ollama streaming failed');
    }
  }

  /**
   * Complete with vision/images
   */
  async completeWithVision(
    request: LLMRequest,
    images: ImageInput[]
  ): Promise<LLMResponse> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Use a vision-capable model
      const modelId = request.model || 'llama3.2-vision';
      const model = this.getModel(modelId);

      if (!model?.supportsVision) {
        throw new LLMError(
          `Model ${modelId} does not support vision`,
          'INVALID_REQUEST',
          this.name,
          false
        );
      }

      const systemMessage = this.extractSystemMessage(request.messages);
      const userMessage = this.extractUserMessage(request.messages);

      // Ollama expects images as base64 strings
      const imageData = images.map((img) => img.base64);

      const chatRequest: OllamaChatRequest = {
        model: modelId,
        messages: [
          ...(systemMessage ? [{ role: 'system', content: systemMessage }] : []),
          {
            role: 'user',
            content: userMessage,
            images: imageData,
          },
        ],
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens || 4096,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 120000),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const data: OllamaChatResponse = await response.json();
      const latency = Date.now() - startTime;

      return this.createResponse({
        content: data.message.content,
        model: modelId,
        usage: {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        latency,
        finishReason: 'stop',
      });
    } catch (error) {
      this.handleError(error, 'Ollama vision completion failed');
    }
  }

  /**
   * Format messages for Ollama API
   */
  private formatMessages(
    messages: LLMMessage[]
  ): { role: string; content: string }[] {
    return messages.map((m) => ({
      role: m.role,
      content: this.extractTextContent(m.content),
    }));
  }

  /**
   * Extract system message from messages
   */
  private extractSystemMessage(messages: LLMMessage[]): string {
    const systemMsg = messages.find((m) => m.role === 'system');
    if (!systemMsg) return '';
    return this.extractTextContent(systemMsg.content);
  }

  /**
   * Extract user message from messages
   */
  private extractUserMessage(messages: LLMMessage[]): string {
    const userMsg = messages.find((m) => m.role === 'user');
    if (!userMsg) return '';
    return this.extractTextContent(userMsg.content);
  }
}

/**
 * Create and initialize an Ollama provider
 */
export async function createOllamaProvider(
  config?: Partial<ProviderConfig>,
  logger?: Logger
): Promise<OllamaProvider> {
  const provider = new OllamaProvider(logger);

  await provider.initialize({
    name: 'ollama',
    enabled: true,
    priority: 10, // Lower priority - use as fallback or for simple tasks
    models: OLLAMA_MODELS,
    ...config,
  });

  return provider;
}
