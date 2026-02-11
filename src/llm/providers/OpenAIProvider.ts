/**
 * Alabobai LLM Router - OpenAI Provider
 * GPT models via OpenAI API
 */

import OpenAI from 'openai';
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
 * Default OpenAI model configurations
 */
const OPENAI_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'complex',
    isDefault: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'moderate',
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'complex',
  },
  {
    id: 'o1',
    name: 'o1',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
    supportsVision: true,
    supportsStreaming: false,
    supportsFunctions: true,
    complexity: 'expert',
  },
  {
    id: 'o1-mini',
    name: 'o1-mini',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
    supportsVision: false,
    supportsStreaming: false,
    supportsFunctions: false,
    complexity: 'complex',
  },
];

/**
 * OpenAI GPT Provider Implementation
 */
export class OpenAIProvider extends BaseProvider {
  name: ProviderName = 'openai';
  private client!: OpenAI;

  constructor(logger: Logger = defaultLogger) {
    super(logger);
  }

  /**
   * Initialize the OpenAI client
   */
  async initialize(config: ProviderConfig): Promise<void> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new LLMError(
        'OpenAI API key not provided',
        'AUTHENTICATION_FAILED',
        this.name,
        false
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 120000,
    });

    // Use provided models or defaults
    config.models = config.models.length > 0 ? config.models : OPENAI_MODELS;

    await super.initialize(config);
  }

  /**
   * Check if provider is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      this.ensureInitialized();
      // Verify client exists
      return this.client !== undefined;
    } catch (error) {
      this.logger.error('OpenAI health check failed', error as Error);
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
      const modelId = request.model || this.getDefaultModel()?.id || 'gpt-4o';
      const messages = this.formatMessages(request.messages);

      const response = await this.client.chat.completions.create({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.topP,
        stop: request.stopSequences,
        messages,
      });

      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';

      return this.createResponse({
        content,
        model: modelId,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        latency,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
      });
    } catch (error) {
      this.handleError(error, 'OpenAI completion failed');
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
      const modelId = request.model || this.getDefaultModel()?.id || 'gpt-4o';
      const model = this.getModel(modelId);

      // Check if model supports streaming
      if (!model?.supportsStreaming) {
        // Fall back to non-streaming for models like o1
        const response = await this.complete(request);
        onChunk(response.content);
        return response;
      }

      const messages = this.formatMessages(request.messages);

      let fullContent = '';
      let finishReason: string | null = null;

      const stream = await this.client.chat.completions.create({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.topP,
        stop: request.stopSequences,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(content);
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      const latency = Date.now() - startTime;

      // Estimate tokens since streaming doesn't provide usage
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
      this.handleError(error, 'OpenAI streaming failed');
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
      const modelId = request.model || 'gpt-4o'; // Default to vision-capable model
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
      const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = images.map((img) => ({
        type: 'image_url',
        image_url: {
          url: `data:${img.mediaType};base64,${img.base64}`,
        },
      }));

      const textContent: OpenAI.Chat.ChatCompletionContentPart = {
        type: 'text',
        text: userMessage,
      };

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }

      messages.push({
        role: 'user',
        content: [textContent, ...imageContent],
      });

      const response = await this.client.chat.completions.create({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        messages,
      });

      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';

      return this.createResponse({
        content,
        model: modelId,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        latency,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
      });
    } catch (error) {
      this.handleError(error, 'OpenAI vision completion failed');
    }
  }

  /**
   * Format messages for OpenAI API
   */
  private formatMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
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
   * Map OpenAI finish reason to standard finish reason
   */
  private mapFinishReason(reason: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'error';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and initialize an OpenAI provider
 */
export async function createOpenAIProvider(
  config?: Partial<ProviderConfig>,
  logger?: Logger
): Promise<OpenAIProvider> {
  const provider = new OpenAIProvider(logger);

  await provider.initialize({
    name: 'openai',
    enabled: true,
    priority: 2,
    models: OPENAI_MODELS,
    ...config,
  });

  return provider;
}
