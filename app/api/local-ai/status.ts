import {
  checkServiceHealth,
  getAllCircuitBreakerSnapshots,
  getAllServiceHealthSnapshots,
} from '../_lib/reliability';

export const config = {
  runtime: 'edge',
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://localhost:6333';
const IMAGE_INFERENCE_URL = process.env.IMAGE_INFERENCE_URL || 'http://localhost:7860';
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';
const VIDEO_INFERENCE_URL = process.env.VIDEO_INFERENCE_URL || 'http://localhost:8000';
const IMAGE_BACKEND = process.env.IMAGE_BACKEND || 'automatic1111';
const VIDEO_BACKEND = process.env.VIDEO_BACKEND || 'generic';

interface ServiceStatus {
  connected: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

interface StatusResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  machineReadable: true;
  services: {
    ollama: ServiceStatus;
    qdrant: ServiceStatus;
    imageBackend: ServiceStatus;
    videoBackend: ServiceStatus;
  };
  models?: string[];
  circuitBreakers: ReturnType<typeof getAllCircuitBreakerSnapshots>;
  healthCache: ReturnType<typeof getAllServiceHealthSnapshots>;
}

export default async function handler(req: Request) {
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
    const [ollamaSnap, qdrantSnap, imageSnap, videoSnap] = await Promise.all([
      checkServiceHealth('ollama', { url: `${OLLAMA_URL}/api/tags`, timeoutMs: 2000 }),
      checkServiceHealth('qdrant', { url: `${QDRANT_URL}/collections`, timeoutMs: 2000 }),
      checkServiceHealth('image-backend', {
        url: IMAGE_BACKEND === 'comfyui' ? `${COMFYUI_URL}/system_stats` : `${IMAGE_INFERENCE_URL}/sdapi/v1/options`,
        timeoutMs: 2000,
      }),
      checkServiceHealth('video-backend', { url: `${VIDEO_INFERENCE_URL}/health`, timeoutMs: 2000 }),
    ]);

    const ollamaStatus: ServiceStatus = {
      connected: ollamaSnap.healthy,
      latencyMs: ollamaSnap.latencyMs,
      version: ollamaSnap.healthy ? 'running' : undefined,
      error: ollamaSnap.error,
    };

    const qdrantStatus: ServiceStatus = {
      connected: qdrantSnap.healthy,
      latencyMs: qdrantSnap.latencyMs,
      error: qdrantSnap.error,
    };

    const imageBackendStatus: ServiceStatus = {
      connected: imageSnap.healthy,
      latencyMs: imageSnap.latencyMs,
      version: IMAGE_BACKEND,
      error: imageSnap.error,
    };

    const videoBackendStatus: ServiceStatus = {
      connected: VIDEO_BACKEND === 'generic' ? videoSnap.healthy : false,
      latencyMs: videoSnap.latencyMs,
      version: VIDEO_BACKEND,
      error: videoSnap.error,
    };

    const healthyCount = [ollamaStatus, qdrantStatus, imageBackendStatus, videoBackendStatus].filter(
      (s) => s.connected
    ).length;

    let status: StatusResponse['status'];
    if (healthyCount === 4) {
      status = 'healthy';
    } else if (healthyCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    let models: string[] | undefined;
    if (ollamaStatus.connected) {
      try {
        const modelsResponse = await fetch(`${OLLAMA_URL}/api/tags`);
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          models = modelsData.models?.map((m: any) => m.name) || [];
        }
      } catch {
        // best effort
      }
    }

    const response: StatusResponse = {
      status,
      timestamp: new Date().toISOString(),
      machineReadable: true,
      services: {
        ollama: ollamaStatus,
        qdrant: qdrantStatus,
        imageBackend: imageBackendStatus,
        videoBackend: videoBackendStatus,
      },
      models,
      circuitBreakers: getAllCircuitBreakerSnapshots(),
      healthCache: getAllServiceHealthSnapshots(),
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
        machineReadable: true,
        error: error instanceof Error ? error.message : 'Status check failed',
        circuitBreakers: getAllCircuitBreakerSnapshots(),
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
