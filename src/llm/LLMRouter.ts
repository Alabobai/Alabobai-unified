/**
 * Alabobai LLM Router
 * Intelligent multi-provider LLM routing with fallbacks, cost tracking, and adaptive selection
 */

import {
  LLMProvider,
  ProviderName,
  ProviderConfig,
  ModelConfig,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  RouterConfig,
  RetryConfig,
  RoutingStrategy,
  ProviderHealth,
  LLMMetrics,
  TaskComplexity,
  ImageInput,
  LLMError,
  Logger,
} from './types.js';
import { defaultLogger } from './providers/BaseProvider.js';
import { AnthropicProvider, createAnthropicProvider } from './providers/AnthropicProvider.js';
import { OpenAIProvider, createOpenAIProvider } from './providers/OpenAIProvider.js';
import { OllamaProvider, createOllamaProvider } from './providers/OllamaProvider.js';
import { GroqProvider, createGroqProvider } from './providers/GroqProvider.js';

/**
 * Default router configuration
 */
const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  providers: [],
  defaultProvider: 'anthropic',
  fallbackChain: ['anthropic', 'openai', 'groq', 'ollama'],
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'RATE_LIMITED',
      'TIMEOUT',
      'NETWORK_ERROR',
      'PROVIDER_UNAVAILABLE',
    ],
  },
  routingStrategy: 'complexity',
  costTracking: true,
  logging: true,
};

/**
 * Complexity-based routing configuration
 * Maps task complexity to recommended providers
 */
const COMPLEXITY_ROUTING: Record<TaskComplexity, ProviderName[]> = {
  simple: ['groq', 'ollama'],
  moderate: ['groq', 'openai', 'anthropic'],
  complex: ['anthropic', 'openai'],
  expert: ['anthropic', 'openai'],
};

/**
 * LLM Router - Intelligent multi-provider routing
 */
export class LLMRouter {
  private config: RouterConfig;
  private providers: Map<ProviderName, LLMProvider> = new Map();
  private providerHealth: Map<ProviderName, ProviderHealth> = new Map();
  private metrics: LLMMetrics;
  private logger: Logger;
  private initialized: boolean = false;
  private roundRobinIndex: number = 0;

  constructor(config?: Partial<RouterConfig>, logger?: Logger) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.logger = logger || defaultLogger;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the router with providers
   */
  async initialize(providerConfigs?: ProviderConfig[]): Promise<void> {
    this.logger.info('Initializing LLM Router...');

    const configs = providerConfigs || this.getDefaultProviderConfigs();

    for (const config of configs) {
      if (!config.enabled) {
        this.logger.info(`Skipping disabled provider: ${config.name}`);
        continue;
      }

      try {
        const provider = await this.createProvider(config);
        this.providers.set(config.name, provider);
        this.initializeProviderHealth(config.name);
        this.logger.info(`Initialized provider: ${config.name}`);
      } catch (error) {
        this.logger.warn(`Failed to initialize provider: ${config.name}`, {
          error: (error as Error).message,
        });
      }
    }

    if (this.providers.size === 0) {
      throw new LLMError(
        'No providers initialized',
        'PROVIDER_UNAVAILABLE',
        undefined,
        false
      );
    }

    this.initialized = true;
    this.logger.info(`LLM Router initialized with ${this.providers.size} providers`);
  }

  /**
   * Complete a request with intelligent routing
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.ensureInitialized();

    const providers = this.selectProviders(request);
    let lastError: Error | undefined;

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const response = await this.executeWithRetry(
          () => provider.complete(request),
          providerName
        );

        this.recordSuccess(providerName, response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(providerName, error as Error);
        this.logger.warn(`Provider ${providerName} failed, trying next...`, {
          error: (error as Error).message,
        });
      }
    }

    throw new LLMError(
      `All providers failed: ${lastError?.message}`,
      'PROVIDER_UNAVAILABLE',
      undefined,
      false,
      lastError
    );
  }

  /**
   * Stream a request with intelligent routing
   */
  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    this.ensureInitialized();

    const providers = this.selectProviders(request);
    let lastError: Error | undefined;

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const response = await this.executeWithRetry(
          () => provider.stream(request, onChunk),
          providerName
        );

        this.recordSuccess(providerName, response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(providerName, error as Error);
        this.logger.warn(`Provider ${providerName} failed, trying next...`, {
          error: (error as Error).message,
        });
      }
    }

    throw new LLMError(
      `All providers failed: ${lastError?.message}`,
      'PROVIDER_UNAVAILABLE',
      undefined,
      false,
      lastError
    );
  }

  /**
   * Complete a vision request with intelligent routing
   */
  async completeWithVision(
    request: LLMRequest,
    images: ImageInput[]
  ): Promise<LLMResponse> {
    this.ensureInitialized();

    // Filter to vision-capable providers
    const providers = this.selectProvidersForVision(request);
    let lastError: Error | undefined;

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const response = await this.executeWithRetry(
          () => provider.completeWithVision(request, images),
          providerName
        );

        this.recordSuccess(providerName, response);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(providerName, error as Error);
        this.logger.warn(`Provider ${providerName} vision failed, trying next...`, {
          error: (error as Error).message,
        });
      }
    }

    throw new LLMError(
      `All vision-capable providers failed: ${lastError?.message}`,
      'PROVIDER_UNAVAILABLE',
      undefined,
      false,
      lastError
    );
  }

  /**
   * Complete with a specific provider
   */
  async completeWithProvider(
    providerName: ProviderName,
    request: LLMRequest
  ): Promise<LLMResponse> {
    this.ensureInitialized();

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new LLMError(
        `Provider ${providerName} not available`,
        'PROVIDER_UNAVAILABLE',
        providerName,
        false
      );
    }

    const response = await this.executeWithRetry(
      () => provider.complete(request),
      providerName
    );

    this.recordSuccess(providerName, response);
    return response;
  }

  /**
   * Select providers based on routing strategy
   */
  private selectProviders(request: LLMRequest): ProviderName[] {
    // If specific provider requested, use it first then fallbacks
    if (request.metadata?.preferredProvider) {
      const preferred = request.metadata.preferredProvider;
      return [
        preferred,
        ...this.config.fallbackChain.filter((p) => p !== preferred),
      ];
    }

    switch (this.config.routingStrategy) {
      case 'priority':
        return this.selectByPriority();
      case 'cost':
        return this.selectByCost(request);
      case 'latency':
        return this.selectByLatency();
      case 'complexity':
        return this.selectByComplexity(request);
      case 'round-robin':
        return this.selectRoundRobin();
      case 'adaptive':
        return this.selectAdaptive(request);
      default:
        return this.config.fallbackChain;
    }
  }

  /**
   * Select providers by priority order
   */
  private selectByPriority(): ProviderName[] {
    const available = Array.from(this.providers.entries())
      .filter(([name]) => this.isProviderHealthy(name))
      .sort((a, b) => {
        const configA = this.getProviderConfig(a[0]);
        const configB = this.getProviderConfig(b[0]);
        return (configA?.priority || 100) - (configB?.priority || 100);
      })
      .map(([name]) => name);

    // Add fallbacks
    const fallbacks = this.config.fallbackChain.filter(
      (p) => !available.includes(p) && this.providers.has(p)
    );

    return [...available, ...fallbacks];
  }

  /**
   * Select providers by cost (cheapest first)
   */
  private selectByCost(request: LLMRequest): ProviderName[] {
    const estimatedTokens = this.estimateRequestTokens(request);

    const providers = Array.from(this.providers.entries())
      .filter(([name]) => this.isProviderHealthy(name))
      .map(([name, provider]) => {
        const model = provider.getModels().find((m) => m.isDefault) || provider.getModels()[0];
        const estimatedCost = model
          ? (estimatedTokens / 1000) * (model.inputCostPer1k + model.outputCostPer1k)
          : Infinity;
        return { name, cost: estimatedCost };
      })
      .sort((a, b) => a.cost - b.cost)
      .map((p) => p.name);

    return [...providers, ...this.config.fallbackChain.filter((p) => !providers.includes(p))];
  }

  /**
   * Select providers by latency (fastest first)
   */
  private selectByLatency(): ProviderName[] {
    const providers = Array.from(this.providerHealth.entries())
      .filter(([name]) => this.isProviderHealthy(name))
      .sort((a, b) => (a[1].latency || Infinity) - (b[1].latency || Infinity))
      .map(([name]) => name);

    return [...providers, ...this.config.fallbackChain.filter((p) => !providers.includes(p))];
  }

  /**
   * Select providers by task complexity
   */
  private selectByComplexity(request: LLMRequest): ProviderName[] {
    const complexity = request.metadata?.taskComplexity || this.inferComplexity(request);
    const recommended = COMPLEXITY_ROUTING[complexity];

    // Filter to available and healthy providers
    const available = recommended.filter(
      (p) => this.providers.has(p) && this.isProviderHealthy(p)
    );

    // Add other providers as fallbacks
    const others = this.config.fallbackChain.filter(
      (p) => !available.includes(p) && this.providers.has(p)
    );

    return [...available, ...others];
  }

  /**
   * Round-robin selection across providers
   */
  private selectRoundRobin(): ProviderName[] {
    const available = Array.from(this.providers.keys()).filter((p) =>
      this.isProviderHealthy(p)
    );

    if (available.length === 0) {
      return this.config.fallbackChain;
    }

    // Rotate through providers
    const index = this.roundRobinIndex % available.length;
    this.roundRobinIndex++;

    const selected = available[index];
    const others = available.filter((p) => p !== selected);

    return [selected, ...others, ...this.config.fallbackChain.filter((p) => !available.includes(p))];
  }

  /**
   * Adaptive selection based on recent performance
   */
  private selectAdaptive(request: LLMRequest): ProviderName[] {
    // Score providers based on success rate, latency, and cost
    const scores = Array.from(this.providers.entries())
      .filter(([name]) => this.isProviderHealthy(name))
      .map(([name, provider]) => {
        const health = this.providerHealth.get(name);
        const model = provider.getModels().find((m) => m.isDefault) || provider.getModels()[0];

        // Calculate score (higher is better)
        const successScore = (1 - (health?.errorRate || 0)) * 50;
        const latencyScore = health?.latency
          ? Math.max(0, 50 - health.latency / 100)
          : 25;
        const costScore = model
          ? Math.max(0, 50 - (model.inputCostPer1k + model.outputCostPer1k) * 100)
          : 25;

        return { name, score: successScore + latencyScore + costScore };
      })
      .sort((a, b) => b.score - a.score)
      .map((p) => p.name);

    return [...scores, ...this.config.fallbackChain.filter((p) => !scores.includes(p))];
  }

  /**
   * Select providers for vision requests
   */
  private selectProvidersForVision(request: LLMRequest): ProviderName[] {
    const visionCapable = Array.from(this.providers.entries())
      .filter(([, provider]) => {
        const models = provider.getModels();
        return models.some((m) => m.supportsVision);
      })
      .map(([name]) => name);

    // Sort by the regular strategy, but only include vision-capable
    const ordered = this.selectProviders(request);
    return ordered.filter((p) => visionCapable.includes(p));
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    providerName: ProviderName
  ): Promise<T> {
    const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier, retryableErrors } =
      this.config.retryConfig;

    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        const llmError = error as LLMError;
        const isRetryable =
          llmError.retryable || retryableErrors.includes(llmError.code);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        this.logger.warn(
          `Retry ${attempt + 1}/${maxRetries} for ${providerName} after ${delay}ms`,
          { error: llmError.message }
        );

        await this.sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }

    throw lastError;
  }

  /**
   * Infer task complexity from request
   */
  private inferComplexity(request: LLMRequest): TaskComplexity {
    const messages = request.messages;
    let totalLength = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalLength += msg.content.length;
      } else {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            totalLength += part.text.length;
          }
        }
      }
    }

    // Simple heuristics based on message length and content
    const hasCodeIndicators = messages.some((m) => {
      const content = typeof m.content === 'string' ? m.content : '';
      return (
        content.includes('```') ||
        content.includes('function') ||
        content.includes('class ') ||
        content.includes('import ')
      );
    });

    const hasAnalysisIndicators = messages.some((m) => {
      const content = typeof m.content === 'string' ? m.content.toLowerCase() : '';
      return (
        content.includes('analyze') ||
        content.includes('compare') ||
        content.includes('explain in detail') ||
        content.includes('comprehensive')
      );
    });

    if (totalLength > 10000 || hasCodeIndicators || hasAnalysisIndicators) {
      return 'complex';
    }

    if (totalLength > 2000) {
      return 'moderate';
    }

    return 'simple';
  }

  /**
   * Estimate tokens for a request
   */
  private estimateRequestTokens(request: LLMRequest): number {
    let chars = 0;
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length;
      } else {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            chars += part.text.length;
          }
        }
      }
    }
    return Math.ceil(chars / 4);
  }

  /**
   * Check if a provider is healthy
   */
  private isProviderHealthy(name: ProviderName): boolean {
    const health = this.providerHealth.get(name);
    if (!health) return true;

    // Consider unhealthy if too many consecutive failures
    return health.consecutiveFailures < 5;
  }

  /**
   * Record successful request
   */
  private recordSuccess(providerName: ProviderName, response: LLMResponse): void {
    // Update metrics
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.totalTokens += response.usage.totalTokens;
    this.metrics.totalCost += response.cost.totalCost;
    this.metrics.requestsByProvider[providerName] =
      (this.metrics.requestsByProvider[providerName] || 0) + 1;
    this.metrics.tokensByProvider[providerName] =
      (this.metrics.tokensByProvider[providerName] || 0) + response.usage.totalTokens;
    this.metrics.costByProvider[providerName] =
      (this.metrics.costByProvider[providerName] || 0) + response.cost.totalCost;

    // Update running average latency
    const prevAvg = this.metrics.averageLatency;
    const n = this.metrics.successfulRequests;
    this.metrics.averageLatency = prevAvg + (response.latency - prevAvg) / n;

    // Update provider health
    const health = this.providerHealth.get(providerName);
    if (health) {
      health.healthy = true;
      health.lastCheck = new Date();
      health.latency = response.latency;
      health.consecutiveFailures = 0;
      // Update error rate with exponential decay
      health.errorRate = health.errorRate * 0.9;
    }

    if (this.config.logging) {
      this.logger.debug(`Request succeeded: ${providerName}`, {
        model: response.model,
        tokens: response.usage.totalTokens,
        cost: response.cost.totalCost,
        latency: response.latency,
      });
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(providerName: ProviderName, error: Error): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    const health = this.providerHealth.get(providerName);
    if (health) {
      health.lastCheck = new Date();
      health.consecutiveFailures++;
      // Update error rate with exponential moving average
      health.errorRate = health.errorRate * 0.9 + 0.1;

      if (health.consecutiveFailures >= 5) {
        health.healthy = false;
      }
    }

    if (this.config.logging) {
      this.logger.warn(`Request failed: ${providerName}`, {
        error: error.message,
      });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): LLMMetrics {
    return { ...this.metrics };
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): Map<ProviderName, ProviderHealth> {
    return new Map(this.providerHealth);
  }

  /**
   * Get available providers
   */
  getProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get models for a specific provider
   */
  getModels(providerName: ProviderName): ModelConfig[] {
    const provider = this.providers.get(providerName);
    return provider?.getModels() || [];
  }

  /**
   * Get all available models across providers
   */
  getAllModels(): { provider: ProviderName; model: ModelConfig }[] {
    const models: { provider: ProviderName; model: ModelConfig }[] = [];

    for (const [name, provider] of this.providers) {
      for (const model of provider.getModels()) {
        models.push({ provider: name, model });
      }
    }

    return models;
  }

  /**
   * Check health of all providers
   */
  async healthCheck(): Promise<Map<ProviderName, boolean>> {
    const results = new Map<ProviderName, boolean>();

    for (const [name, provider] of this.providers) {
      try {
        const healthy = await provider.isHealthy();
        results.set(name, healthy);

        const health = this.providerHealth.get(name);
        if (health) {
          health.healthy = healthy;
          health.lastCheck = new Date();
        }
      } catch {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new LLMError(
        'LLM Router not initialized',
        'PROVIDER_UNAVAILABLE',
        undefined,
        false
      );
    }
  }

  private async createProvider(config: ProviderConfig): Promise<LLMProvider> {
    switch (config.name) {
      case 'anthropic':
        return await createAnthropicProvider(config, this.logger);
      case 'openai':
        return await createOpenAIProvider(config, this.logger);
      case 'ollama':
        return await createOllamaProvider(config, this.logger);
      case 'groq':
        return await createGroqProvider(config, this.logger);
      default:
        throw new Error(`Unknown provider: ${config.name}`);
    }
  }

  private getDefaultProviderConfigs(): ProviderConfig[] {
    return [
      {
        name: 'anthropic',
        enabled: !!process.env.ANTHROPIC_API_KEY,
        priority: 1,
        models: [],
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      {
        name: 'openai',
        enabled: !!process.env.OPENAI_API_KEY,
        priority: 2,
        models: [],
        apiKey: process.env.OPENAI_API_KEY,
      },
      {
        name: 'groq',
        enabled: !!process.env.GROQ_API_KEY,
        priority: 5,
        models: [],
        apiKey: process.env.GROQ_API_KEY,
      },
      {
        name: 'ollama',
        enabled: true, // Ollama is local, try to connect
        priority: 10,
        models: [],
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      },
    ];
  }

  private getProviderConfig(name: ProviderName): ProviderConfig | undefined {
    return this.config.providers.find((p) => p.name === name);
  }

  private initializeProviderHealth(name: ProviderName): void {
    this.providerHealth.set(name, {
      provider: name,
      healthy: true,
      lastCheck: new Date(),
      errorRate: 0,
      consecutiveFailures: 0,
    });
  }

  private initializeMetrics(): LLMMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      requestsByProvider: {} as Record<ProviderName, number>,
      tokensByProvider: {} as Record<ProviderName, number>,
      costByProvider: {} as Record<ProviderName, number>,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create and initialize an LLM router with default settings
 */
export async function createLLMRouter(
  config?: Partial<RouterConfig>,
  logger?: Logger
): Promise<LLMRouter> {
  const router = new LLMRouter(config, logger);
  await router.initialize();
  return router;
}

/**
 * Singleton router instance for convenience
 */
let defaultRouter: LLMRouter | null = null;

/**
 * Get the default router instance (creates one if needed)
 */
export async function getDefaultRouter(): Promise<LLMRouter> {
  if (!defaultRouter) {
    defaultRouter = await createLLMRouter();
  }
  return defaultRouter;
}

/**
 * Reset the default router (for testing)
 */
export function resetDefaultRouter(): void {
  defaultRouter = null;
}
