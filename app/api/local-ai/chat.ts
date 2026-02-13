export const config = {
  runtime: 'edge',
};

// Local AI Brain Chat API
// Chat with local Ollama models with optional RAG from Qdrant knowledge base

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

// Generate embeddings using Ollama
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate embedding: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

// Search Qdrant for relevant knowledge
async function searchKnowledge(
  query: string,
  collection: string,
  topK: number
): Promise<KnowledgeChunk[]> {
  const embedding = await generateEmbedding(query);

  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: embedding,
      limit: topK,
      with_payload: true,
    }),
  });

  if (!response.ok) {
    // Collection might not exist, return empty
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

// Build RAG-enhanced prompt with knowledge context
function buildRAGPrompt(
  chunks: KnowledgeChunk[],
  systemPrompt?: string
): string {
  const contextParts = chunks.map(
    (c, i) => `[Source ${i + 1}${c.metadata?.title ? `: ${c.metadata.title}` : ''}]\n${c.content}`
  );
  const context = contextParts.join('\n\n');

  const ragSystemPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}

You have access to a knowledge base. Use the following context to answer the user's question.
If the context doesn't contain relevant information, say so and answer based on your general knowledge.
Always cite your sources when using information from the context.

CONTEXT:
${context}

---
Answer the user's question based on the above context when relevant.`;

  return ragSystemPrompt;
}

// Chat with Ollama (streaming)
async function chatWithOllama(
  messages: ChatMessage[],
  model: string,
  stream: boolean,
  temperature: number
): Promise<Response> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
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
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.status}`);
  }

  return response;
}

// Transform Ollama stream to SSE
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
      let fullContent = '';

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
                fullContent += token;

                if (token) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                  );
                }

                if (data.done) {
                  // Include sources in final message if RAG was used
                  if (sources && sources.length > 0) {
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
                }
              } catch (e) {
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

export default async function handler(req: Request) {
  // Handle CORS
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

    // Get the last user message for RAG query
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    let processedMessages = [...messages];
    let knowledgeChunks: KnowledgeChunk[] = [];

    // RAG: Search knowledge base if enabled
    if (useKnowledge && lastUserMessage) {
      try {
        knowledgeChunks = await searchKnowledge(
          lastUserMessage.content,
          knowledgeCollection,
          topK
        );

        if (knowledgeChunks.length > 0) {
          // Build RAG-enhanced system prompt
          const ragPrompt = buildRAGPrompt(
            knowledgeChunks,
            systemPrompt
          );

          // Inject RAG context as system message
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
        // Continue without RAG if it fails
      }
    }

    // Add system prompt if no RAG and no existing system message
    if (!useKnowledge && systemPrompt) {
      const hasSystem = processedMessages.some((m) => m.role === 'system');
      if (!hasSystem) {
        processedMessages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }
    }

    // Chat with Ollama
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
    } else {
      // Non-streaming response
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
    }
  } catch (error) {
    console.error('Local AI Chat error:', error);

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('Connection refused'));

    return new Response(
      JSON.stringify({
        error: isConnectionError
          ? 'Cannot connect to Ollama. Make sure Ollama is running on localhost:11434'
          : 'Chat request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
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
