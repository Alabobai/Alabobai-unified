export const config = {
  runtime: 'edge',
};

// Local AI Brain Status API
// Checks connection status of Ollama and Qdrant services

const OLLAMA_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';

interface ServiceStatus {
  connected: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

interface StatusResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    ollama: ServiceStatus;
    qdrant: ServiceStatus;
  };
  models?: string[];
}

async function checkOllama(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        connected: false,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      connected: true,
      latencyMs,
      version: 'running',
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function checkQdrant(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const response = await fetch(`${QDRANT_URL}/collections`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        connected: false,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Try to get version info
    const versionResponse = await fetch(`${QDRANT_URL}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);

    let version: string | undefined;
    if (versionResponse?.ok) {
      const versionData = await versionResponse.json().catch(() => ({}));
      version = versionData.version;
    }

    return {
      connected: true,
      latencyMs,
      version,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export default async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // Check both services in parallel
    const [ollamaStatus, qdrantStatus] = await Promise.all([
      checkOllama(),
      checkQdrant(),
    ]);

    // Determine overall health status
    let status: StatusResponse['status'];
    if (ollamaStatus.connected && qdrantStatus.connected) {
      status = 'healthy';
    } else if (ollamaStatus.connected || qdrantStatus.connected) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    // Get available models if Ollama is connected
    let models: string[] | undefined;
    if (ollamaStatus.connected) {
      try {
        const modelsResponse = await fetch(`${OLLAMA_URL}/api/tags`);
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          models = modelsData.models?.map((m: any) => m.name) || [];
        }
      } catch {
        // Ignore errors fetching models
      }
    }

    const response: StatusResponse = {
      status,
      timestamp: new Date().toISOString(),
      services: {
        ollama: ollamaStatus,
        qdrant: qdrantStatus,
      },
      models,
    };

    return new Response(JSON.stringify(response), {
      status: status === 'unhealthy' ? 503 : 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Status check failed',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
