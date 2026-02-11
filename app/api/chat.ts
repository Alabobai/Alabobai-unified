export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `You are Alabobai, an advanced AI agent platform. You can:
- Build complete web applications and landing pages
- Write production-ready code in any language
- Navigate the web and extract information
- Execute complex multi-step workflows
- Analyze data and create visualizations
- Generate business plans and strategies
- Help create and manage companies

When asked to build something, provide complete, working code. Use modern best practices and beautiful UI/UX.
For web pages, use Tailwind CSS and include all necessary HTML/CSS/JS in a single file.
Always wrap code in appropriate markdown code blocks with language tags.
Be helpful, detailed, and proactive in suggesting improvements.`;

// Try Gemini first (free tier: 60 req/min), then Groq, then fallback
async function callGemini(messages: any[], apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        }
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGroq(messages: any[], apiKey: string, stream: boolean) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      max_tokens: 8192,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  return response;
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
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { messages, stream = true } = await req.json();

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // Try Gemini first (non-streaming for simplicity, then simulate streaming)
    if (geminiKey) {
      try {
        const content = await callGemini(messages, geminiKey);

        if (stream) {
          // Simulate streaming for consistent UX
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              const words = content.split(' ');
              for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`));
                await new Promise(r => setTimeout(r, 20));
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });

          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } else {
          return new Response(JSON.stringify({ content }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (e) {
        console.log('Gemini failed, trying Groq:', e);
      }
    }

    // Fallback to Groq
    if (groqKey) {
      if (stream) {
        const response = await callGroq(messages, groqKey, true);

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = response.body?.getReader();

        const readable = new ReadableStream({
          async start(controller) {
            if (!reader) {
              controller.close();
              return;
            }

            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const token = data.choices?.[0]?.delta?.content;
                    if (token) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                    }
                  } catch {}
                }
              }
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        const response = await callGroq(messages, groqKey, false);
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        return new Response(JSON.stringify({ content }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // No API keys configured
    return new Response(JSON.stringify({
      error: 'No API keys configured',
      message: 'Please add GEMINI_API_KEY or GROQ_API_KEY to environment variables'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process chat request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
