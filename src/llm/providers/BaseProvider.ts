/**
 * Alabobai LLM Router - Base Provider
 * Abstract base class for all LLM providers
 */

import {
  LLMProvider,
  ProviderName,
  ProviderConfig,
  ModelConfig,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  TokenUsage,
  CostInfo,
  ImageInput,
  LLMError,
  Logger,
} from '../types.js';

/**
 * Default logger implementation
 */
export const defaultLogger: Logger = {
  debug: (message, data) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
    }
  },
  info: (message, data) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  warn: (message, data) => {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message, error, data) => {
    console.error(`[ERROR] ${message}`, error?.message || '', data ? JSON.stringify(data) : '');
  },
};

/**
 * Abstract base class for LLM providers
 * Implements common functionality and enforces interface
 */
export abstract class BaseProvider implements LLMProvider {
  abstract name: ProviderName;

  protected config!: ProviderConfig;
  protected models: ModelConfig[] = [];
  protected initialized: boolean = false;
  protected logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  /**
   * Initialize the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.models = config.models;
    this.initialized = true;
    this.logger.info(`${this.name} provider initialized`, {
      models: this.models.map((m) => m.id),
    });
  }

  /**
   * Check if provider is available and healthy
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Get list of available models
   */
  getModels(): ModelConfig[] {
    return this.models;
  }

  /**
   * Get a specific model configuration
   */
  getModel(modelId: string): ModelConfig | undefined {
    return this.models.find((m) => m.id === modelId);
  }

  /**
   * Send a completion request - implemented by subclasses
   */
  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Stream a completion request - implemented by subclasses
   */
  abstract stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse>;

  /**
   * Send a completion request with vision - implemented by subclasses
   */
  abstract completeWithVision(
    request: LLMRequest,
    images: ImageInput[]
  ): Promise<LLMResponse>;

  /**
   * Estimate token count for messages
   * Simple approximation - subclasses can override for more accurate counts
   */
  estimateTokens(messages: LLMMessage[]): number {
    let totalChars = 0;
    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            totalChars += part.text.length;
          }
        }
      }
    }
    // Rough approximation: ~4 chars per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Calculate cost for a given usage
   */
  calculateCost(modelId: string, usage: TokenUsage): CostInfo {
    const model = this.getModel(modelId);
    if (!model) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    const inputCost = (usage.inputTokens / 1000) * model.inputCostPer1k;
    const outputCost = (usage.outputTokens / 1000) * model.outputCostPer1k;

    return {
      inputCost: Math.round(inputCost * 1000000) / 1000000, // Round to 6 decimals
      outputCost: Math.round(outputCost * 1000000) / 1000000,
      totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
      currency: 'USD',
    };
  }

  /**
   * Get the default model for this provider
   */
  protected getDefaultModel(): ModelConfig | undefined {
    return this.models.find((m) => m.isDefault) || this.models[0];
  }

  /**
   * Validate that the provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new LLMError(
        `${this.name} provider not initialized`,
        'PROVIDER_UNAVAILABLE',
        this.name,
        false
      );
    }
  }

  /**
   * Extract text content from message
   */
  protected extractTextContent(content: LLMMessage['content']): string {
    if (typeof content === 'string') {
      return content;
    }
    return content
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('\n');
  }

  /**
   * Create a standard response object
   */
  protected createResponse(params: {
    content: string;
    model: string;
    usage: TokenUsage;
    latency: number;
    finishReason?: LLMResponse['finishReason'];
    metadata?: LLMResponse['metadata'];
  }): LLMResponse {
    const cost = this.calculateCost(params.model, params.usage);

    return {
      content: params.content,
      model: params.model,
      provider: this.name,
      usage: params.usage,
      cost,
      latency: params.latency,
      finishReason: params.finishReason || 'stop',
      metadata: params.metadata,
    };
  }

  /**
   * Handle and wrap errors
   */
  protected handleError(error: unknown, context: string): never {
    if (error instanceof LLMError) {
      throw error;
    }

    const err = error as Error;
    const message = err.message || 'Unknown error';

    // Detect specific error types
    if (message.includes('rate limit') || message.includes('429')) {
      throw new LLMError(
        `Rate limited: ${message}`,
        'RATE_LIMITED',
        this.name,
        true,
        err
      );
    }

    if (message.includes('authentication') || message.includes('401') || message.includes('api key')) {
      throw new LLMError(
        `Authentication failed: ${message}`,
        'AUTHENTICATION_FAILED',
        this.name,
        false,
        err
      );
    }

    if (message.includes('context length') || message.includes('too long')) {
      throw new LLMError(
        `Context length exceeded: ${message}`,
        'CONTEXT_LENGTH_EXCEEDED',
        this.name,
        false,
        err
      );
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      throw new LLMError(
        `Request timeout: ${message}`,
        'TIMEOUT',
        this.name,
        true,
        err
      );
    }

    if (message.includes('ECONNREFUSED') || message.includes('network')) {
      throw new LLMError(
        `Network error: ${message}`,
        'NETWORK_ERROR',
        this.name,
        true,
        err
      );
    }

    throw new LLMError(
      `${context}: ${message}`,
      'UNKNOWN_ERROR',
      this.name,
      false,
      err
    );
  }
}
