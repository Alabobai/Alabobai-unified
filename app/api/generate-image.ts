export const config = {
  runtime: 'edge',
}

type ImageBackend = 'automatic1111' | 'comfyui'

const IMAGE_BACKEND = (process.env.IMAGE_BACKEND || 'automatic1111') as ImageBackend
const IMAGE_INFERENCE_URL = process.env.IMAGE_INFERENCE_URL || 'http://localhost:7860'
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188'
const COMFYUI_CHECKPOINT = process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors'

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    ...extra,
  }
}

function enhancePrompt(prompt: string, style: string): string {
  switch (style) {
    case 'logo':
      return `professional minimalist logo, vector style, clean lines, branding, ${prompt}`
    case 'hero':
      return `cinematic hero image, high detail, modern commercial style, ${prompt}`
    case 'icon':
      return `flat icon design, simple composition, transparent background, ${prompt}`
    default:
      return prompt
  }
}

function sanitizeText(value: string, maxLen: number): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen)
}

function createFallbackImage(prompt: string, width: number, height: number): string {
  const safePrompt = sanitizeText(prompt || 'Creative concept', 120)
  const size = `${Math.max(256, Math.min(width, 1536))}x${Math.max(256, Math.min(height, 1536))}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${Math.floor(width * 0.22)}" cy="${Math.floor(height * 0.28)}" r="${Math.floor(
    Math.min(width, height) * 0.14
  )}" fill="#f97316" fill-opacity="0.25"/>
  <circle cx="${Math.floor(width * 0.77)}" cy="${Math.floor(height * 0.68)}" r="${Math.floor(
    Math.min(width, height) * 0.2
  )}" fill="#22d3ee" fill-opacity="0.22"/>
  <rect x="28" y="${Math.max(36, height - 146)}" rx="12" ry="12" width="${Math.max(
    240,
    width - 56
  )}" height="118" fill="#020617" fill-opacity="0.7"/>
  <text x="42" y="${Math.max(70, height - 106)}" fill="#e2e8f0" font-size="18" font-family="Arial, Helvetica, sans-serif">Alabobai Local Fallback Image</text>
  <text x="42" y="${Math.max(95, height - 80)}" fill="#cbd5e1" font-size="15" font-family="Arial, Helvetica, sans-serif">${safePrompt}</text>
  <text x="42" y="${Math.max(120, height - 54)}" fill="#94a3b8" font-size="13" font-family="Arial, Helvetica, sans-serif">${size}</text>
</svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}

async function generateWithAutomatic1111(
  prompt: string,
  width: number,
  height: number
): Promise<string> {
  const response = await fetch(`${IMAGE_INFERENCE_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      width,
      height,
      steps: 28,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
    }),
  })

  if (!response.ok) {
    throw new Error(`A1111 failed: ${response.status}`)
  }

  const data = await response.json()
  const b64 = data.images?.[0]
  if (!b64) throw new Error('A1111 returned no image')
  return `data:image/png;base64,${b64}`
}

async function generateWithComfyUI(prompt: string, width: number, height: number): Promise<string> {
  const workflow = {
    '3': {
      inputs: {
        seed: Math.floor(Math.random() * 2147483647),
        steps: 24,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      class_type: 'KSampler',
    },
    '4': {
      inputs: { ckpt_name: COMFYUI_CHECKPOINT },
      class_type: 'CheckpointLoaderSimple',
    },
    '5': {
      inputs: { width, height, batch_size: 1 },
      class_type: 'EmptyLatentImage',
    },
    '6': {
      inputs: { text: prompt, clip: ['4', 1] },
      class_type: 'CLIPTextEncode',
    },
    '7': {
      inputs: { text: 'blurry, low quality, distorted', clip: ['4', 1] },
      class_type: 'CLIPTextEncode',
    },
    '8': {
      inputs: { samples: ['3', 0], vae: ['4', 2] },
      class_type: 'VAEDecode',
    },
    '9': {
      inputs: { filename_prefix: 'alabobai', images: ['8', 0] },
      class_type: 'SaveImage',
    },
  }

  const promptRes = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  if (!promptRes.ok) throw new Error(`ComfyUI prompt failed: ${promptRes.status}`)
  const promptData = await promptRes.json()
  const promptId = promptData.prompt_id as string
  if (!promptId) throw new Error('ComfyUI prompt id missing')

  const started = Date.now()
  while (Date.now() - started < 120000) {
    await new Promise((r) => setTimeout(r, 1500))
    const historyRes = await fetch(`${COMFYUI_URL}/history/${promptId}`)
    if (!historyRes.ok) continue
    const history = await historyRes.json()
    const outputs = history[promptId]?.outputs || {}
    const nodeValues = Object.values(outputs) as Array<{ images?: Array<{ filename: string; subfolder: string; type: string }> }>
    for (const nodeOut of nodeValues) {
      if (nodeOut.images?.length) {
        const img = nodeOut.images[0]
        return `${COMFYUI_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(
          img.subfolder || ''
        )}&type=${encodeURIComponent(img.type || 'output')}`
      }
    }
  }

  throw new Error('ComfyUI timed out waiting for image')
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
    const { prompt, width = 512, height = 512, style = 'logo' } = await req.json()

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      })
    }

    const enhancedPrompt = enhancePrompt(prompt, style)
    let url = ''
    let usedFallback = false
    let warning: string | undefined

    try {
      url =
        IMAGE_BACKEND === 'comfyui'
          ? await generateWithComfyUI(enhancedPrompt, width, height)
          : await generateWithAutomatic1111(enhancedPrompt, width, height)
    } catch (backendError) {
      usedFallback = true
      warning = backendError instanceof Error ? backendError.message : 'Image backend unavailable'
      url = createFallbackImage(enhancedPrompt, width, height)
    }

    return new Response(
      JSON.stringify({
        url,
        prompt: enhancedPrompt,
        width,
        height,
        backend: usedFallback ? 'local-fallback-svg' : IMAGE_BACKEND,
        fallback: usedFallback,
        warning,
      }),
      {
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to generate image with local inference backend',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      }
    )
  }
}
