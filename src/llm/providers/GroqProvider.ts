/**
 * Alabobai LLM Router - Groq Provider
 * Fast inference via Groq API
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
 * Default Groq model configurations
 */
const GROQ_MODELS: ModelConfig[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    inputCostPer1k: 0.00059,
    outputCostPer1k: 0.00079,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'complex',
    isDefault: true,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.00005,
    outputCostPer1k: 0.00008,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'simple',
  },
  {
    id: 'llama-3.2-90b-vision-preview',
    name: 'Llama 3.2 90B Vision',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.0009,
    outputCostPer1k: 0.0009,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: false,
    complexity: 'complex',
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    contextWindow: 32768,
    maxOutputTokens: 32768,
    inputCostPer1k: 0.00024,
    outputCostPer1k: 0.00024,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'moderate',
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    contextWindow: 8192,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0002,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'simple',
  },
];

interface GroqChatRequest {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
}

interface GroqContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

interface GroqChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}

/**
 * Groq Fast Inference Provider Implementation
 */
export class GroqProvider extends BaseProvider {
  name: ProviderName = 'groq';
  private apiKey: string = '';
  private baseUrl: string = 'https://api.groq.com/openai/v1';

  constructor(logger: Logger = defaultLogger) {
    super(logger);
  }

  /**
   * Initialize the Groq client
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.groq.com/openai/v1';

    if (!this.apiKey) {
      throw new LLMError(
        'Groq API key not provided',
        'AUTHENTICATION_FAILED',
        this.name,
        false
      );
    }

    // Use provided models or defaults
    config.models = config.models.length > 0 ? config.models : GROQ_MODELS;

    await super.initialize(config);
  }

  /**
   * Check if provider is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      this.ensureInitialized();

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Groq health check failed', error as Error);
      return false;
    }
  }

  /**
   * Send a completion request
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      const modelId = request.model || this.getDefaultModel()?.id || 'llama-3.3-70b-versatile';
      const messages = this.formatMessages(request.messages);

      const chatRequest: GroqChatRequest = {
        model: modelId,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        top_p: request.topP,
        stop: request.stopSequences,
        stream: false,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq request failed: ${response.status} - ${errorText}`);
      }

      const data: GroqChatResponse = await response.json();
      const latency = Date.now() - startTime;

      return this.createResponse({
        content: data.choices[0]?.message?.content || '',
        model: modelId,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        latency,
        finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
      });
    } catch (error) {
      this.handleError(error, 'Groq completion failed');
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
      const modelId = request.model || this.getDefaultModel()?.id || 'llama-3.3-70b-versatile';
      const messages = this.formatMessages(request.messages);

      const chatRequest: GroqChatRequest = {
        model: modelId,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        top_p: request.topP,
        stop: request.stopSequences,
        stream: true,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq request failed: ${response.status} - ${errorText}`);
      }

      let fullContent = '';
      let finishReason: string | null = null;

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data: ', '').trim();
          if (data === '[DONE]') continue;

          try {
            const parsed: GroqStreamChunk = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';

            if (content) {
              fullContent += content;
              onChunk(content);
            }

            if (parsed.choices[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      const latency = Date.now() - startTime;

      // Estimate tokens for streaming (Groq doesn't provide in stream)
      const estimatedInput = this.estimateTokens(request.messages);
      const estimatedOutput = Math.ceil(fullContent.length / 4);

      return this.createResponse({
        content: fullContent,
        model: modelId,
        usage: {
          inputTokens: estimatedInput,
          outputTokens: estimatedOutput,
          totalTokens: estimatedInput + estimatedOutput,
        },
        latency,
        finishReason: this.mapFinishReason(finishReason),
      });
    } catch (error) {
      this.handleError(error, 'Groq streaming failed');
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
      // Use vision-capable model
      const modelId = request.model || 'llama-3.2-90b-vision-preview';
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

      // Build content with images
      const content: GroqContentPart[] = [
        { type: 'text', text: userMessage },
        ...images.map((img) => ({
          type: 'image_url' as const,
          image_url: {
            url: `data:${img.mediaType};base64,${img.base64}`,
          },
        })),
      ];

      const messages: GroqMessage[] = [];

      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }

      messages.push({ role: 'user', content });

      const chatRequest: GroqChatRequest = {
        model: modelId,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: false,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(chatRequest),
        signal: AbortSignal.timeout(this.config.timeout || 60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq request failed: ${response.status} - ${errorText}`);
      }

      const data: GroqChatResponse = await response.json();
      const latency = Date.now() - startTime;

      return this.createResponse({
        content: data.choices[0]?.message?.content || '',
        model: modelId,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        latency,
        finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
      });
    } catch (error) {
      this.handleError(error, 'Groq vision completion failed');
    }
  }

  /**
   * Format messages for Groq API
   */
  private formatMessages(messages: LLMMessage[]): GroqMessage[] {
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

  /**
   * Map Groq finish reason to standard finish reason
   */
  private mapFinishReason(reason: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'max_tokens';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and initialize a Groq provider
 */
export async function createGroqProvider(
  config?: Partial<ProviderConfig>,
  logger?: Logger
): Promise<GroqProvider> {
  const provider = new GroqProvider(logger);

  await provider.initialize({
    name: 'groq',
    enabled: true,
    priority: 5, // Medium priority - fast and cheap
    models: GROQ_MODELS,
    ...config,
  });

  return provider;
}
