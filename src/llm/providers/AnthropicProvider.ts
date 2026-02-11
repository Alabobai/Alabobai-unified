/**
 * Alabobai LLM Router - Anthropic Provider
 * Claude models via Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
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
 * Default Anthropic model configurations
 */
const ANTHROPIC_MODELS: ModelConfig[] = [
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'expert',
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'complex',
    isDefault: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    complexity: 'moderate',
  },
];

/**
 * Anthropic Claude Provider Implementation
 */
export class AnthropicProvider extends BaseProvider {
  name: ProviderName = 'anthropic';
  private client!: Anthropic;

  constructor(logger: Logger = defaultLogger) {
    super(logger);
  }

  /**
   * Initialize the Anthropic client
   */
  async initialize(config: ProviderConfig): Promise<void> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new LLMError(
        'Anthropic API key not provided',
        'AUTHENTICATION_FAILED',
        this.name,
        false
      );
    }

    this.client = new Anthropic({
      apiKey,
      timeout: config.timeout || 120000,
    });

    // Use provided models or defaults
    config.models = config.models.length > 0 ? config.models : ANTHROPIC_MODELS;

    await super.initialize(config);
  }

  /**
   * Check if provider is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      this.ensureInitialized();
      // Simple health check - try to list models or make a minimal request
      // For now, we just verify the client exists
      return this.client !== undefined;
    } catch (error) {
      this.logger.error('Anthropic health check failed', error as Error);
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
      const modelId = request.model || this.getDefaultModel()?.id || 'claude-sonnet-4-20250514';
      const { systemMessage, conversationMessages } = this.formatMessages(request.messages);

      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
        system: systemMessage,
        messages: conversationMessages,
      });

      const latency = Date.now() - startTime;
      const content = this.extractResponseContent(response);

      return this.createResponse({
        content,
        model: modelId,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        latency,
        finishReason: this.mapStopReason(response.stop_reason),
      });
    } catch (error) {
      this.handleError(error, 'Anthropic completion failed');
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
      const modelId = request.model || this.getDefaultModel()?.id || 'claude-sonnet-4-20250514';
      const { systemMessage, conversationMessages } = this.formatMessages(request.messages);

      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let stopReason: string | null = null;

      const stream = this.client.messages.stream({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
        system: systemMessage,
        messages: conversationMessages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          fullContent += chunk;
          onChunk(chunk);
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage?.input_tokens || 0;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage?.output_tokens || 0;
          stopReason = event.delta.stop_reason || null;
        }
      }

      const latency = Date.now() - startTime;

      return this.createResponse({
        content: fullContent,
        model: modelId,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latency,
        finishReason: this.mapStopReason(stopReason),
      });
    } catch (error) {
      this.handleError(error, 'Anthropic streaming failed');
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
      const modelId = request.model || this.getDefaultModel()?.id || 'claude-sonnet-4-20250514';
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
      const imageBlocks: Anthropic.ImageBlockParam[] = images.map((img) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.base64,
        },
      }));

      const textBlock: Anthropic.TextBlockParam = {
        type: 'text',
        text: userMessage,
      };

      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        system: systemMessage,
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, textBlock],
          },
        ],
      });

      const latency = Date.now() - startTime;
      const content = this.extractResponseContent(response);

      return this.createResponse({
        content,
        model: modelId,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        latency,
        finishReason: this.mapStopReason(response.stop_reason),
      });
    } catch (error) {
      this.handleError(error, 'Anthropic vision completion failed');
    }
  }

  /**
   * Format messages for Anthropic API
   */
  private formatMessages(messages: LLMMessage[]): {
    systemMessage: string;
    conversationMessages: Anthropic.MessageParam[];
  } {
    const systemMessage = this.extractSystemMessage(messages);

    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.extractTextContent(m.content),
      }));

    return { systemMessage, conversationMessages };
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
   * Extract content from response
   */
  private extractResponseContent(response: Anthropic.Message): string {
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  /**
   * Map Anthropic stop reason to standard finish reason
   */
  private mapStopReason(reason: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'max_tokens';
      default:
        return 'stop';
    }
  }
}

/**
 * Create and initialize an Anthropic provider
 */
export async function createAnthropicProvider(
  config?: Partial<ProviderConfig>,
  logger?: Logger
): Promise<AnthropicProvider> {
  const provider = new AnthropicProvider(logger);

  await provider.initialize({
    name: 'anthropic',
    enabled: true,
    priority: 1,
    models: ANTHROPIC_MODELS,
    ...config,
  });

  return provider;
}
