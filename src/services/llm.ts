/**
 * Alabobai LLM Service
 * Production-ready LLM integration with support for Anthropic Claude and OpenAI
 * Includes streaming, error handling, retry logic, and rate limiting
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export type LLMProvider = 'anthropic' | 'openai' | 'groq';

export interface LLMServiceConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  configuredProvider?: LLMProvider;
  failoverUsed?: boolean;
  failoverReason?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface StreamOptions extends ChatOptions {
  onStart?: () => void;
  onChunk?: (chunk: string, accumulated: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  metadata?: Record<string, unknown>;
}

export interface LLMUsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalErrors: number;
  averageLatencyMs: number;
}

// ============================================================================
// LLM SERVICE CLASS
// ============================================================================

export class LLMService extends EventEmitter {
  private provider: LLMProvider;
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private groqApiKey: string | null = null;
  private groqBaseUrl = 'https://api.groq.com/openai/v1';
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private maxRetries: number;
  private retryDelay: number;
  private timeout: number;
  private configuredProvider: LLMProvider;
  private failoverUsed: boolean;
  private failoverReason?: string;

  // Usage tracking
  private stats: LLMUsageStats = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalErrors: 0,
    averageLatencyMs: 0
  };
  private latencies: number[] = [];

  constructor(config: LLMServiceConfig) {
    super();

    this.provider = config.provider;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.timeout = config.timeout || 120000;
    this.configuredProvider = config.configuredProvider || config.provider;
    this.failoverUsed = config.failoverUsed || false;
    this.failoverReason = config.failoverReason;

    // Initialize provider client
    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
      this.model = config.model || 'claude-sonnet-4-20250514';
    } else if (config.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: config.apiKey });
      this.model = config.model || 'gpt-4o';
    } else if (config.provider === 'groq') {
      this.groqApiKey = config.apiKey;
      this.model = config.model || 'llama-3.3-70b-versatile';
    } else {
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }

    console.log(`[LLMService] Initialized with provider: ${this.provider}, model: ${this.model}`);
  }

  // ============================================================================
  // MAIN CHAT METHOD
  // ============================================================================

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.stats.totalRequests++;
        this.emit('request-start', { messages, options, attempt });

        const response = await this.executeChat(messages, options);

        // Track latency
        const latency = Date.now() - startTime;
        this.trackLatency(latency);

        // Track usage
        this.stats.totalInputTokens += response.usage.inputTokens;
        this.stats.totalOutputTokens += response.usage.outputTokens;

        this.emit('request-complete', { response, latency });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.stats.totalErrors++;

        this.emit('request-error', { error: lastError, attempt });

        // Check if error is retryable
        if (this.isRetryableError(lastError) && attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`[LLMService] Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('Unknown error during LLM request');
  }

  // ============================================================================
  // STREAMING CHAT METHOD
  // ============================================================================

  async stream(messages: ChatMessage[], options: StreamOptions = {}): Promise<string> {
    const startTime = Date.now();
    let accumulated = '';

    try {
      this.stats.totalRequests++;
      this.emit('stream-start', { messages, options });
      options.onStart?.();

      if (this.provider === 'anthropic' && this.anthropic) {
        accumulated = await this.streamAnthropic(messages, options);
      } else if (this.provider === 'openai' && this.openai) {
        accumulated = await this.streamOpenAI(messages, options);
      } else if (this.provider === 'groq' && this.groqApiKey) {
        accumulated = await this.streamGroq(messages, options);
      } else {
        throw new Error('No LLM client initialized');
      }

      const latency = Date.now() - startTime;
      this.trackLatency(latency);

      this.emit('stream-complete', { fullResponse: accumulated, latency });
      options.onComplete?.(accumulated);

      return accumulated;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.stats.totalErrors++;

      this.emit('stream-error', { error: err });
      options.onError?.(err);

      throw err;
    }
  }

  // ============================================================================
  // PROVIDER-SPECIFIC IMPLEMENTATIONS
  // ============================================================================

  private async executeChat(messages: ChatMessage[], options: ChatOptions): Promise<LLMResponse> {
    if (this.provider === 'anthropic' && this.anthropic) {
      return this.chatAnthropic(messages, options);
    } else if (this.provider === 'openai' && this.openai) {
      return this.chatOpenAI(messages, options);
    } else if (this.provider === 'groq' && this.groqApiKey) {
      return this.chatGroq(messages, options);
    }

    throw new Error('No LLM client initialized');
  }

  private async chatAnthropic(messages: ChatMessage[], options: ChatOptions): Promise<LLMResponse> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      system: systemMessage,
      messages: conversationMessages,
      stop_sequences: options.stopSequences
    });

    const textContent = response.content.find(c => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason || 'unknown',
      metadata: options.metadata
    };
  }

  private async chatOpenAI(messages: ChatMessage[], options: ChatOptions): Promise<LLMResponse> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const response = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stop: options.stopSequences
    });

    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0
      },
      finishReason: response.choices[0]?.finish_reason || 'unknown',
      metadata: options.metadata
    };
  }

  private async chatGroq(messages: ChatMessage[], options: ChatOptions): Promise<LLMResponse> {
    if (!this.groqApiKey) throw new Error('Groq API key not initialized');

    const response = await fetch(`${this.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const usage = data.usage;

    return {
      content,
      model: data.model,
      usage: {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      finishReason: data.choices[0]?.finish_reason || 'unknown',
      metadata: options.metadata,
    };
  }

  private async streamAnthropic(messages: ChatMessage[], options: StreamOptions): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    let accumulated = '';

    const stream = this.anthropic.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      system: systemMessage,
      messages: conversationMessages,
      stop_sequences: options.stopSequences
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        accumulated += chunk;
        options.onChunk?.(chunk, accumulated);
        this.emit('stream-chunk', { chunk, accumulated });
      }
    }

    return accumulated;
  }

  private async streamOpenAI(messages: ChatMessage[], options: StreamOptions): Promise<string> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    let accumulated = '';

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stop: options.stopSequences,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        accumulated += content;
        options.onChunk?.(content, accumulated);
        this.emit('stream-chunk', { chunk: content, accumulated });
      }
    }

    return accumulated;
  }

  private async streamGroq(messages: ChatMessage[], options: StreamOptions): Promise<string> {
    if (!this.groqApiKey) throw new Error('Groq API key not initialized');

    let accumulated = '';

    const response = await fetch(`${this.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        stop: options.stopSequences,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data: ', '').trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          if (content) {
            accumulated += content;
            options.onChunk?.(content, accumulated);
            this.emit('stream-chunk', { chunk: content, accumulated });
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return accumulated;
  }

  // ============================================================================
  // SPECIALIZED METHODS
  // ============================================================================

  async analyze(input: unknown, systemPrompt?: string): Promise<Record<string, unknown>> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt || 'Analyze the following input and provide structured insights in JSON format.'
      },
      {
        role: 'user',
        content: typeof input === 'string' ? input : JSON.stringify(input, null, 2)
      }
    ];

    const response = await this.chat(messages);

    // Try to parse as JSON
    try {
      const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const rawJson = response.content.match(/\{[\s\S]*\}/);
      if (rawJson) {
        return JSON.parse(rawJson[0]);
      }
    } catch {
      // Fall through to return as analysis text
    }

    return { analysis: response.content };
  }

  async classify(
    input: string,
    categories: string[],
    systemPrompt?: string
  ): Promise<{ category: string; confidence: number; reasoning: string }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt || `Classify the input into one of the following categories: ${categories.join(', ')}.
Respond in JSON format: {"category": "chosen_category", "confidence": 0.0-1.0, "reasoning": "explanation"}`
      },
      {
        role: 'user',
        content: input
      }
    ];

    const response = await this.chat(messages);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Parse failed, return default
    }

    // Fallback
    return {
      category: categories[0] || 'unknown',
      confidence: 0.5,
      reasoning: response.content
    };
  }

  async summarize(input: string, maxLength?: number): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Summarize the following text${maxLength ? ` in no more than ${maxLength} words` : ''}.
Be concise and capture the key points.`
      },
      {
        role: 'user',
        content: input
      }
    ];

    const response = await this.chat(messages);
    return response.content;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('overloaded') ||
      message.includes('503') ||
      message.includes('529') ||
      message.includes('network')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private trackLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);

    // Keep only last 100 latencies
    if (this.latencies.length > 100) {
      this.latencies.shift();
    }

    // Update average
    this.stats.averageLatencyMs =
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  // ============================================================================
  // STATS AND MONITORING
  // ============================================================================

  getStats(): LLMUsageStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalErrors: 0,
      averageLatencyMs: 0
    };
    this.latencies = [];
  }

  getProviderInfo(): {
    provider: LLMProvider;
    configuredProvider: LLMProvider;
    model: string;
    failoverUsed: boolean;
    failoverReason?: string;
  } {
    return {
      provider: this.provider,
      configuredProvider: this.configuredProvider,
      model: this.model,
      failoverUsed: this.failoverUsed,
      failoverReason: this.failoverReason
    };
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      await this.chat([
        { role: 'user', content: 'Say "ok" and nothing else.' }
      ], { maxTokens: 10 });

      return {
        healthy: true,
        latencyMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

let defaultService: LLMService | null = null;

export function createLLMService(config: LLMServiceConfig): LLMService {
  return new LLMService(config);
}

export function getDefaultLLMService(): LLMService {
  if (!defaultService) {
    const configuredProvider = (process.env.LLM_PROVIDER || 'groq') as LLMProvider;

    const providerOrder: LLMProvider[] = [
      configuredProvider,
      ...(['groq', 'anthropic', 'openai'] as LLMProvider[]).filter(p => p !== configuredProvider),
    ];

    const apiKeyByProvider: Record<LLMProvider, string> = {
      groq: process.env.GROQ_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      openai: process.env.OPENAI_API_KEY || '',
    };

    const modelByProvider: Record<LLMProvider, string> = {
      groq: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
      anthropic: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
      openai: process.env.LLM_MODEL || 'gpt-4o',
    };

    const selectedProvider = providerOrder.find(p => !!apiKeyByProvider[p]);
    if (!selectedProvider) {
      throw new Error('Missing API keys for all configured LLM providers');
    }

    const failoverUsed = selectedProvider !== configuredProvider;
    const failoverReason = failoverUsed
      ? `configured provider ${configuredProvider} missing key; switched to ${selectedProvider}`
      : undefined;

    defaultService = new LLMService({
      provider: selectedProvider,
      apiKey: apiKeyByProvider[selectedProvider],
      model: modelByProvider[selectedProvider],
      configuredProvider,
      failoverUsed,
      failoverReason,
    });
  }

  return defaultService;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default LLMService;
