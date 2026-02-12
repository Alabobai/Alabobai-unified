/**
 * Alabobai LLM Client
 * Unified interface for multiple LLM providers (Anthropic, OpenAI)
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'groq';
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMClient {
  chat(messages: LLMMessage[]): Promise<string>;
  chatWithVision(messages: LLMMessage[], imageBase64: string): Promise<string>;
  analyze(input: unknown): Promise<unknown>;
  stream(messages: LLMMessage[], onChunk: (chunk: string) => void): Promise<string>;
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    // Separate system message
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemMessage,
      messages: conversationMessages,
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  async chatWithVision(messages: LLMMessage[], imageBase64: string): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemMessage,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: userMessage,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  async analyze(input: unknown): Promise<unknown> {
    const response = await this.chat([
      { role: 'system', content: 'Analyze the following input and provide structured insights.' },
      { role: 'user', content: JSON.stringify(input) },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { analysis: response };
    }
  }

  async stream(messages: LLMMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    let fullResponse = '';

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemMessage,
      messages: conversationMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullResponse += chunk;
        onChunk(chunk);
      }
    }

    return fullResponse;
  }
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.choices[0]?.message?.content || '';
  }

  async chatWithVision(messages: LLMMessage[], imageBase64: string): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o', // Vision capable model
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content || '';
  }

  async analyze(input: unknown): Promise<unknown> {
    const response = await this.chat([
      { role: 'system', content: 'Analyze the following input and provide structured insights.' },
      { role: 'user', content: JSON.stringify(input) },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { analysis: response };
    }
  }

  async stream(messages: LLMMessage[], onChunk: (chunk: string) => void): Promise<string> {
    let fullResponse = '';

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
    }

    return fullResponse;
  }
}

// ============================================================================
// GROQ CLIENT (Free, Fast Inference)
// ============================================================================

class GroqClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private baseUrl = 'https://api.groq.com/openai/v1';

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'llama-3.3-70b-versatile';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async chatWithVision(messages: LLMMessage[], imageBase64: string): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        messages: [
          { role: 'system', content: systemMessage },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async analyze(input: unknown): Promise<unknown> {
    const response = await this.chat([
      { role: 'system', content: 'Analyze the following input and provide structured insights.' },
      { role: 'user', content: JSON.stringify(input) },
    ]);

    try {
      return JSON.parse(response);
    } catch {
      return { analysis: response };
    }
  }

  async stream(messages: LLMMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    let fullResponse = '';
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
            fullResponse += content;
            onChunk(content);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return fullResponse;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'openai':
      return new OpenAIClient(config);
    case 'groq':
      return new GroqClient(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// Default client factory using environment variables
export function getDefaultLLMClient(): LLMClient {
  const provider = (process.env.LLM_PROVIDER || 'groq') as 'anthropic' | 'openai' | 'groq';

  let apiKey: string;
  let model: string;

  switch (provider) {
    case 'groq':
      apiKey = process.env.GROQ_API_KEY || '';
      model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      break;
    case 'anthropic':
      apiKey = process.env.ANTHROPIC_API_KEY || '';
      model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
      break;
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY || '';
      model = process.env.OPENAI_MODEL || 'gpt-4o';
      break;
    default:
      apiKey = process.env.GROQ_API_KEY || '';
      model = 'llama-3.3-70b-versatile';
  }

  return createLLMClient({ provider, apiKey, model });
}
