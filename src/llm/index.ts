/**
 * Alabobai LLM Module
 * Multi-provider LLM routing with fallbacks, cost tracking, and intelligent selection
 *
 * @example
 * ```typescript
 * import { createLLMRouter, LLMRouter, LLMRequest } from './llm';
 *
 * // Create and initialize router
 * const router = await createLLMRouter();
 *
 * // Simple completion
 * const response = await router.complete({
 *   messages: [
 *     { role: 'system', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'Hello, how are you?' },
 *   ],
 * });
 *
 * // Streaming completion
 * const streamResponse = await router.stream(
 *   {
 *     messages: [{ role: 'user', content: 'Write a poem about coding.' }],
 *   },
 *   (chunk) => process.stdout.write(chunk)
 * );
 *
 * // Vision completion
 * const visionResponse = await router.completeWithVision(
 *   {
 *     messages: [{ role: 'user', content: 'What is in this image?' }],
 *   },
 *   [{ base64: imageData, mediaType: 'image/png' }]
 * );
 *
 * // Check metrics
 * console.log(router.getMetrics());
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Message Types
  LLMMessage,
  ContentPart,

  // Provider Types
  ProviderName,
  ProviderConfig,
  ModelConfig,
  RateLimitConfig,

  // Request/Response Types
  TaskComplexity,
  LLMRequest,
  RequestMetadata,
  LLMResponse,
  FinishReason,
  TokenUsage,
  CostInfo,
  ResponseMetadata,

  // Provider Interface
  LLMProvider,
  ImageInput,

  // Router Types
  RouterConfig,
  RoutingStrategy,
  RetryConfig,
  ProviderHealth,

  // Metrics & Logging
  LLMMetrics,
  LogLevel,
  Logger,

  // Error Types
  LLMErrorCode,
} from './types.js';

export { LLMError } from './types.js';

// ============================================================================
// Provider Exports
// ============================================================================

export { BaseProvider, defaultLogger } from './providers/BaseProvider.js';

export {
  AnthropicProvider,
  createAnthropicProvider,
} from './providers/AnthropicProvider.js';

export {
  OpenAIProvider,
  createOpenAIProvider,
} from './providers/OpenAIProvider.js';

export {
  OllamaProvider,
  createOllamaProvider,
} from './providers/OllamaProvider.js';

export {
  GroqProvider,
  createGroqProvider,
} from './providers/GroqProvider.js';

// ============================================================================
// Router Exports
// ============================================================================

export {
  LLMRouter,
  createLLMRouter,
  getDefaultRouter,
  resetDefaultRouter,
} from './LLMRouter.js';

// ============================================================================
// Convenience Functions
// ============================================================================

import { getDefaultRouter } from './LLMRouter.js';
import type { LLMRequest, LLMResponse, ImageInput } from './types.js';

/**
 * Quick completion using the default router
 * Automatically initializes the router if needed
 */
export async function complete(request: LLMRequest): Promise<LLMResponse> {
  const router = await getDefaultRouter();
  return router.complete(request);
}

/**
 * Quick streaming completion using the default router
 */
export async function stream(
  request: LLMRequest,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  const router = await getDefaultRouter();
  return router.stream(request, onChunk);
}

/**
 * Quick vision completion using the default router
 */
export async function completeWithVision(
  request: LLMRequest,
  images: ImageInput[]
): Promise<LLMResponse> {
  const router = await getDefaultRouter();
  return router.completeWithVision(request, images);
}

/**
 * Simple text completion helper
 * @param prompt - The user prompt
 * @param systemPrompt - Optional system prompt
 * @returns The completion text
 */
export async function ask(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const router = await getDefaultRouter();

  const messages: LLMRequest['messages'] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const response = await router.complete({ messages });
  return response.content;
}

/**
 * Simple streaming helper
 * @param prompt - The user prompt
 * @param onChunk - Callback for each chunk
 * @param systemPrompt - Optional system prompt
 * @returns The full completion text
 */
export async function askStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemPrompt?: string
): Promise<string> {
  const router = await getDefaultRouter();

  const messages: LLMRequest['messages'] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const response = await router.stream({ messages }, onChunk);
  return response.content;
}
