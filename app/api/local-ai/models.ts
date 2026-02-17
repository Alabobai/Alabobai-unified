export const config = {
  runtime: 'edge',
};

// Local AI Brain Models API
// List available models and pull new models from Ollama

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface ModelsResponse {
  status: 'ok' | 'degraded';
  models: Array<{
    name: string;
    size: string;
    modified: string;
    details?: OllamaModel['details'];
  }>;
  count: number;
  message?: string;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${Math.round(value * 100) / 100} ${units[unitIndex]}`;
}

async function listModels(): Promise<ModelsResponse> {
  const response = await fetch(`${OLLAMA_URL}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const models = (data.models || []).map((m: OllamaModel) => ({
    name: m.name,
    size: formatBytes(m.size),
    modified: m.modified_at,
    details: m.details,
  }));

  return {
    status: 'ok',
    models,
    count: models.length,
  };
}

async function pullModel(modelName: string): Promise<ReadableStream> {
  const response = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: modelName,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body from Ollama');
  }

  // Transform Ollama's NDJSON stream to SSE
  const reader = response.body.getReader();
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
                // Transform Ollama progress to SSE format
                const progress = {
                  status: data.status,
                  digest: data.digest,
                  total: data.total,
                  completed: data.completed,
                  percent: data.total ? Math.round((data.completed / data.total) * 100) : 0,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: data.status })}\n\n`));
          } catch (e) {
            // Skip invalid JSON
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Pull failed' })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

async function deleteModel(modelName: string): Promise<void> {
  const response = await fetch(`${OLLAMA_URL}/api/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: modelName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete model: ${response.status} ${response.statusText}`);
  }
}

export default async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // GET - List models
    if (req.method === 'GET') {
      const models = await listModels();
      return new Response(JSON.stringify(models), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // POST - Pull a new model
    if (req.method === 'POST') {
      const body = await req.json();
      const { model, action } = body;

      if (!model) {
        return new Response(
          JSON.stringify({ error: 'Model name is required' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      if (action === 'delete') {
        await deleteModel(model);
        return new Response(
          JSON.stringify({ success: true, message: `Model ${model} deleted` }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // Default action: pull model with streaming progress
      const stream = await pullModel(model);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    // DELETE - Delete a model
    if (req.method === 'DELETE') {
      const body = await req.json();
      const { model } = body;

      if (!model) {
        return new Response(
          JSON.stringify({ error: 'Model name is required' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      await deleteModel(model);
      return new Response(
        JSON.stringify({ success: true, message: `Model ${model} deleted` }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Models API error:', error);

    // Check if it's a connection error
    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('Connection refused'));

    return new Response(
      JSON.stringify({
        status: 'degraded',
        models: [],
        count: 0,
        message: isConnectionError
          ? 'Ollama unavailable; returning degraded model list.'
          : 'Models endpoint degraded due to internal error.',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}
