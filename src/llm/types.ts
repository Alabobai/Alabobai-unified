/**
 * Alabobai LLM Router - Type Definitions
 * Comprehensive types for multi-provider LLM routing
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: {
    base64: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  };
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type ProviderName = 'anthropic' | 'openai' | 'ollama' | 'groq';

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  priority: number; // Lower = higher priority
  models: ModelConfig[];
  rateLimits?: RateLimitConfig;
  timeout?: number; // Request timeout in ms
}

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1k: number; // Cost in USD per 1000 input tokens
  outputCostPer1k: number; // Cost in USD per 1000 output tokens
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsFunctions: boolean;
  complexity: TaskComplexity; // What complexity level this model is suited for
  isDefault?: boolean;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'expert';

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  provider?: ProviderName;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  metadata?: RequestMetadata;
}

export interface RequestMetadata {
  taskId?: string;
  userId?: string;
  taskComplexity?: TaskComplexity;
  requiresVision?: boolean;
  preferredProvider?: ProviderName;
  budgetLimit?: number; // Max cost in USD
  latencyTarget?: number; // Target latency in ms
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: ProviderName;
  usage: TokenUsage;
  cost: CostInfo;
  latency: number; // Response time in ms
  finishReason: FinishReason;
  metadata?: ResponseMetadata;
}

export type FinishReason = 'stop' | 'max_tokens' | 'error' | 'cancelled';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
}

export interface ResponseMetadata {
  requestId?: string;
  cached?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  retryCount?: number;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface LLMProvider {
  name: ProviderName;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if provider is available and healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get list of available models
   */
  getModels(): ModelConfig[];

  /**
   * Get a specific model configuration
   */
  getModel(modelId: string): ModelConfig | undefined;

  /**
   * Send a completion request
   */
  complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Stream a completion request
   */
  stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse>;

  /**
   * Send a completion request with vision/image support
   */
  completeWithVision(
    request: LLMRequest,
    images: ImageInput[]
  ): Promise<LLMResponse>;

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: LLMMessage[]): number;

  /**
   * Calculate cost for a given usage
   */
  calculateCost(modelId: string, usage: TokenUsage): CostInfo;
}

export interface ImageInput {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

// ============================================================================
// ROUTER TYPES
// ============================================================================

export interface RouterConfig {
  providers: ProviderConfig[];
  defaultProvider: ProviderName;
  fallbackChain: ProviderName[];
  retryConfig: RetryConfig;
  routingStrategy: RoutingStrategy;
  costTracking: boolean;
  logging: boolean;
}

export type RoutingStrategy =
  | 'priority'      // Use providers in priority order
  | 'cost'          // Minimize cost
  | 'latency'       // Minimize latency
  | 'complexity'    // Route based on task complexity
  | 'round-robin'   // Distribute evenly
  | 'adaptive';     // Learn from performance

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface ProviderHealth {
  provider: ProviderName;
  healthy: boolean;
  lastCheck: Date;
  latency?: number;
  errorRate: number;
  consecutiveFailures: number;
}

// ============================================================================
// LOGGING & METRICS TYPES
// ============================================================================

export interface LLMMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  requestsByProvider: Record<ProviderName, number>;
  tokensByProvider: Record<ProviderName, number>;
  costByProvider: Record<ProviderName, number>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class LLMError extends Error {
  constructor(
    message: string,
    public code: LLMErrorCode,
    public provider?: ProviderName,
    public retryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export type LLMErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_FAILED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'CONTENT_FILTERED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR';
