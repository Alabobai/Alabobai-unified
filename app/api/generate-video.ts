import {
  degradedEnvelope,
  getCircuitBreakerSnapshot,
  healthGate,
  runWithReliability,
} from './_lib/reliability'

export const config = {
  runtime: 'edge',
}

const VIDEO_INFERENCE_URL = process.env.VIDEO_INFERENCE_URL || 'http://localhost:8000'
const VIDEO_BACKEND = process.env.VIDEO_BACKEND || 'generic'

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    ...extra,
  }
}

function sanitizeText(value: string, maxLen: number): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen)
}

function createFallbackMotionAsset(prompt: string, width: number, height: number): string {
  const safePrompt = sanitizeText(prompt || 'Creative motion concept', 100)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${Math.floor(width * 0.18)}" cy="${Math.floor(height * 0.5)}" r="${Math.floor(
    Math.min(width, height) * 0.14
  )}" fill="#38bdf8" fill-opacity="0.7">
    <animate attributeName="cx" values="${Math.floor(width * 0.18)};${Math.floor(width * 0.82)};${Math.floor(
    width * 0.18
  )}" dur="4s" repeatCount="indefinite"/>
  </circle>
  <rect x="24" y="${Math.max(26, height - 114)}" width="${Math.max(220, width - 48)}" height="90" rx="10" fill="#0f172a" fill-opacity="0.82"/>
  <text x="38" y="${Math.max(52, height - 82)}" fill="#e2e8f0" font-size="16" font-family="Arial, Helvetica, sans-serif">Alabobai Local Fallback Motion</text>
  <text x="38" y="${Math.max(78, height - 56)}" fill="#cbd5e1" font-size="14" font-family="Arial, Helvetica, sans-serif">${safePrompt}</text>
  <text x="38" y="${Math.max(100, height - 34)}" fill="#94a3b8" font-size="12" font-family="Arial, Helvetica, sans-serif">Animated SVG preview (fallback)</text>
</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

async function generateWithGeneric(
  prompt: string,
  durationSeconds: number,
  fps: number,
  width: number,
  height: number
): Promise<string> {
  const { value: response } = await runWithReliability('media.video.generic', () =>
    fetch(`${VIDEO_INFERENCE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        durationSeconds,
        fps,
        width,
        height,
      }),
    })
  )

  if (!response.ok) {
    throw new Error(`Video backend failed: ${response.status}`)
  }

  const data = await response.json()
  const url = data.url || data.videoUrl
  if (!url) {
    throw new Error('No video URL returned by backend')
  }
  return url
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
    const { prompt, durationSeconds = 4, fps = 16, width = 512, height = 512 } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      })
    }

    if (VIDEO_BACKEND !== 'generic') {
      return new Response(
        JSON.stringify({
          error: `Unsupported VIDEO_BACKEND: ${VIDEO_BACKEND}`,
          details: 'Set VIDEO_BACKEND=generic and provide VIDEO_INFERENCE_URL for now.',
        }),
        {
          status: 400,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        }
      )
    }

    let url = ''
    let usedFallback = false
    let warning: string | undefined

    const videoGate = await healthGate('video-backend', {
      url: `${VIDEO_INFERENCE_URL}/health`,
      timeoutMs: 1800,
      cacheTtlMs: 3000,
    })

    try {
      if (!videoGate.allow) {
        throw new Error(videoGate.reason || 'health-unhealthy:video')
      }
      url = await generateWithGeneric(prompt, durationSeconds, fps, width, height)
    } catch (backendError) {
      usedFallback = true
      warning = backendError instanceof Error ? backendError.message : 'Video backend unavailable'
      url = createFallbackMotionAsset(prompt, width, height)
    }

    const payload = {
      url,
      prompt,
      durationSeconds,
      fps,
      width,
      height,
      backend: usedFallback ? 'local-fallback-motion' : VIDEO_BACKEND,
      fallback: usedFallback,
      warning,
      circuit: getCircuitBreakerSnapshot('media.video.generic'),
    }

    return new Response(
      JSON.stringify(
        usedFallback
          ? degradedEnvelope(payload, {
              route: 'video.local-fallback',
              warning: warning || 'Video backend unavailable',
              fallback: 'animated-svg-preview',
              health: videoGate.health,
              circuit: payload.circuit,
            })
          : payload
      ),
      {
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to generate video with local inference backend',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      }
    )
  }
}
