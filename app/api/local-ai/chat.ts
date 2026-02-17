import {
  checkServiceHealth,
  getCircuitBreakerSnapshot,
  runWithCircuitBreaker,
} from '../_lib/reliability';

export const config = {
  runtime: 'edge',
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://localhost:6333';
const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_COLLECTION = 'knowledge';
const EMBEDDING_MODEL = 'nomic-embed-text';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  useKnowledge?: boolean;
  knowledgeCollection?: string;
  topK?: number;
  temperature?: number;
  systemPrompt?: string;
}

interface KnowledgeChunk {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

// Free cloud fallback providers that don't require API keys
const FREE_PROVIDERS = [
  {
    name: 'OpenRouter-Gemma',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemma-2-9b-it:free',
    timeout: 30000,
  },
  {
    name: 'OpenRouter-Llama',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.2-3b-instruct:free',
    timeout: 30000,
  },
  {
    name: 'HuggingFace-Mistral',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    timeout: 30000,
  },
  {
    name: 'HuggingFace-Zephyr',
    endpoint: 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
    timeout: 30000,
  },
];

async function callOpenRouterFree(messages: ChatMessage[], provider: typeof FREE_PROVIDERS[0]): Promise<string> {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://alabobai.com',
      'X-Title': 'Alabobai Local AI',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider.name} failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callHuggingFaceFree(messages: ChatMessage[], provider: typeof FREE_PROVIDERS[0]): Promise<string> {
  // Format messages for HuggingFace text generation
  const prompt = messages
    .map(m => {
      if (m.role === 'system') return `<|system|>\n${m.content}</s>`;
      if (m.role === 'user') return `<|user|>\n${m.content}</s>`;
      return `<|assistant|>\n${m.content}</s>`;
    })
    .join('\n') + '\n<|assistant|>\n';

  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 1024,
        temperature: 0.7,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider.name} failed: ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && data[0]?.generated_text) {
    return data[0].generated_text;
  }
  throw new Error('Unexpected HuggingFace response format');
}

async function tryCloudFallbacks(messages: ChatMessage[]): Promise<{ content: string; provider: string } | null> {
  for (const provider of FREE_PROVIDERS) {
    try {
      console.log(`Trying cloud fallback: ${provider.name}`);
      let content: string;

      if (provider.name.startsWith('OpenRouter')) {
        content = await callOpenRouterFree(messages, provider);
      } else {
        content = await callHuggingFaceFree(messages, provider);
      }

      if (content && content.length > 0) {
        console.log(`Cloud fallback ${provider.name} succeeded`);
        return { content, provider: provider.name };
      }
    } catch (err) {
      console.warn(`Cloud fallback ${provider.name} failed:`, err);
      // Continue to next provider
    }
  }
  return null;
}

function degradedResponse(messages: ChatMessage[]): string {
  const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || 'your request';
  return `Local model unavailable. Please start Ollama and pull a model.`;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await runWithCircuitBreaker('local-ai.ollama.embed', () =>
    fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text,
      }),
    })
  );

  if (!response.ok) {
    throw new Error(`Failed to generate embedding: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function searchKnowledge(
  query: string,
  collection: string,
  topK: number
): Promise<KnowledgeChunk[]> {
  const qdrantHealth = await checkServiceHealth('qdrant', {
    url: `${QDRANT_URL}/collections`,
    timeoutMs: 1800,
    cacheTtlMs: 3000,
  });

  if (!qdrantHealth.healthy) {
    return [];
  }

  const embedding = await generateEmbedding(query);

  const response = await runWithCircuitBreaker('local-ai.qdrant.search', () =>
    fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding,
        limit: topK,
        with_payload: true,
      }),
    })
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`Failed to search knowledge: ${response.status}`);
  }

  const data = await response.json();
  return (data.result || []).map((point: any) => ({
    id: point.id,
    content: point.payload?.content || point.payload?.text || '',
    score: point.score,
    metadata: {
      source: point.payload?.source,
      title: point.payload?.title,
      ...point.payload,
    },
  }));
}

function buildRAGPrompt(
  chunks: KnowledgeChunk[],
  systemPrompt?: string
): string {
  const contextParts = chunks.map(
    (c, i) => `[Source ${i + 1}${c.metadata?.title ? `: ${c.metadata.title}` : ''}]\n${c.content}`
  );
  const context = contextParts.join('\n\n');

  return `${systemPrompt || 'You are a helpful AI assistant.'}

You have access to a knowledge base. Use the following context to answer the user's question.
If the context doesn't contain relevant information, say so and answer based on your general knowledge.
Always cite your sources when using information from the context.

CONTEXT:
${context}

---
Answer the user's question based on the above context when relevant.`;
}

async function chatWithOllama(
  messages: ChatMessage[],
  model: string,
  stream: boolean,
  temperature: number
): Promise<Response> {
  const response = await runWithCircuitBreaker('local-ai.ollama.chat', () =>
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream,
        options: {
          temperature,
        },
      }),
    })
  );

  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.status}`);
  }

  return response;
}

function transformToSSE(
  ollamaStream: ReadableStream<Uint8Array>,
  sources?: KnowledgeChunk[]
): ReadableStream {
  const reader = ollamaStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                const token = data.message?.content || '';

                if (token) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                  );
                }

                if (data.done && sources && sources.length > 0) {
                  const sourcesData = sources.map((s) => ({
                    title: s.metadata?.title || s.metadata?.source || 'Unknown',
                    source: s.metadata?.source,
                    score: s.score,
                  }));
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ done: true, sources: sourcesData })}\n\n`
                    )
                  );
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream error' })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

function toSseText(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: content })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const body: ChatRequest = await req.json();
    const {
      messages,
      model = DEFAULT_MODEL,
      stream = true,
      useKnowledge = false,
      knowledgeCollection = DEFAULT_COLLECTION,
      topK = 5,
      temperature = 0.7,
      systemPrompt,
    } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const ollamaHealth = await checkServiceHealth('ollama', {
      url: `${OLLAMA_URL}/api/tags`,
      timeoutMs: 1800,
      cacheTtlMs: 3000,
    });

    if (!ollamaHealth.healthy) {
      // Try cloud fallbacks before returning degraded response
      const cloudResult = await tryCloudFallbacks(messages);

      if (cloudResult) {
        if (stream) {
          return new Response(toSseText(cloudResult.content), {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        return new Response(
          JSON.stringify({
            content: cloudResult.content,
            response: cloudResult.content,
            provider: cloudResult.provider,
            fallback: true,
            route: 'cloud-fallback',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // All fallbacks failed - return degraded response
      const content = degradedResponse(messages);
      if (stream) {
        return new Response(toSseText(content), {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(
        JSON.stringify({
          content,
          degraded: true,
          route: 'degraded-local-fallback',
          circuit: getCircuitBreakerSnapshot('local-ai.ollama.chat'),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    let processedMessages = [...messages];
    let knowledgeChunks: KnowledgeChunk[] = [];

    if (useKnowledge && lastUserMessage) {
      try {
        knowledgeChunks = await searchKnowledge(
          lastUserMessage.content,
          knowledgeCollection,
          topK
        );

        if (knowledgeChunks.length > 0) {
          const ragPrompt = buildRAGPrompt(
            knowledgeChunks,
            systemPrompt
          );

          const systemIndex = processedMessages.findIndex((m) => m.role === 'system');
          if (systemIndex >= 0) {
            processedMessages[systemIndex] = {
              role: 'system',
              content: ragPrompt,
            };
          } else {
            processedMessages.unshift({
              role: 'system',
              content: ragPrompt,
            });
          }
        }
      } catch (ragError) {
        console.warn('RAG search failed, continuing without knowledge:', ragError);
      }
    }

    if (!useKnowledge && systemPrompt) {
      const hasSystem = processedMessages.some((m) => m.role === 'system');
      if (!hasSystem) {
        processedMessages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }
    }

    const ollamaResponse = await chatWithOllama(
      processedMessages,
      model,
      stream,
      temperature
    );

    if (stream) {
      if (!ollamaResponse.body) {
        throw new Error('No response body from Ollama');
      }

      const sseStream = transformToSSE(
        ollamaResponse.body,
        knowledgeChunks.length > 0 ? knowledgeChunks : undefined
      );

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await ollamaResponse.json();
    const content = data.message?.content || '';

    const response: any = { content };
    if (knowledgeChunks.length > 0) {
      response.sources = knowledgeChunks.map((s) => ({
        title: s.metadata?.title || s.metadata?.source || 'Unknown',
        source: s.metadata?.source,
        score: s.score,
      }));
    }

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Local AI Chat error:', error);

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('Connection refused') ||
        error.message.startsWith('circuit-open:'));

    return new Response(
      JSON.stringify({
        error: isConnectionError
          ? 'Local AI backend is temporarily unavailable (health gate/circuit breaker active).'
          : 'Chat request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        circuit: getCircuitBreakerSnapshot('local-ai.ollama.chat'),
      }),
      {
        status: isConnectionError ? 503 : 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
