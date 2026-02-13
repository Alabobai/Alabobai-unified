export const config = {
  runtime: 'edge',
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const DEFAULT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.2'
const ALLOW_CLOUD_FALLBACK = process.env.ALLOW_CLOUD_FALLBACK === 'true'

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    ...extra,
  }
}

function buildMessages(messages: ChatMessage[]): ChatMessage[] {
  const systemPrompt =
    'You are Alabobai, a local-first AI agent platform. Provide complete, production-ready answers.'
  const hasSystem = messages.some((m) => m.role === 'system')
  return hasSystem ? messages : [{ role: 'system', content: systemPrompt }, ...messages]
}

async function callOllama(
  messages: ChatMessage[],
  model: string,
  temperature: number
): Promise<Response> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: buildMessages(messages),
      // Edge + tunneled Ollama has been flaky with native streaming responses.
      // Use non-stream mode and emit SSE from this function response path.
      stream: false,
      options: {
        temperature,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.status}`)
  }

  return response
}

function textToSse(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const words = content.split(' ')
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? '' : ' ') + words[i]
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
        await new Promise((r) => setTimeout(r, 8))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

async function cloudFallback(messages: ChatMessage[]): Promise<string> {
  if (!ALLOW_CLOUD_FALLBACK) {
    throw new Error('Cloud fallback disabled')
  }
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`)
  if (!response.ok) {
    throw new Error(`Cloud fallback failed: ${response.status}`)
  }
  return response.text()
}

function localDegradedFallback(messages: ChatMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || 'your request'
  const compact = lastUserMessage.replace(/[^\x20-\x7E]/g, '').slice(0, 240)
  return `Local inference is temporarily unavailable, so I am running in degraded local mode. I can still help you plan and execute next steps for: "${compact}". If you want full model responses, keep Ollama reachable at OLLAMA_BASE_URL and retry.`
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }),
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { messages, stream = true, model = DEFAULT_MODEL, temperature = 0.7 } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages is required' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      })
    }

    try {
      const ollamaResponse = await callOllama(messages, model, temperature)
      const data = await ollamaResponse.json()
      const content = data.message?.content || ''
      if (stream) {
        return new Response(textToSse(content), {
          headers: corsHeaders({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          }),
        })
      }

      return new Response(JSON.stringify({ content }), {
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      })
    } catch (localError) {
      if (!ALLOW_CLOUD_FALLBACK) {
        const fallbackContent = localDegradedFallback(messages)
        if (stream) {
          return new Response(textToSse(fallbackContent), {
            headers: corsHeaders({
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            }),
          })
        }

        return new Response(
          JSON.stringify({
            content: fallbackContent,
            degraded: true,
            warning: localError instanceof Error ? localError.message : 'local inference unavailable',
          }),
          {
            headers: corsHeaders({ 'Content-Type': 'application/json' }),
          }
        )
      }

      const fallbackContent = await cloudFallback(messages)
      if (stream) {
        const encoder = new TextEncoder()
        const readable = new ReadableStream({
          async start(controller) {
            const words = fallbackContent.split(' ')
            for (let i = 0; i < words.length; i++) {
              const chunk = (i === 0 ? '' : ' ') + words[i]
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`))
              await new Promise((r) => setTimeout(r, 12))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          },
        })
        return new Response(readable, {
          headers: corsHeaders({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          }),
        })
      }

      return new Response(
        JSON.stringify({
          content: fallbackContent,
          warning: `Using cloud fallback: ${
            localError instanceof Error ? localError.message : 'local inference failed'
          }`,
        }),
        {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        }
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      }
    )
  }
}
