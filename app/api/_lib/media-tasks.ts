type ImageBackend = 'automatic1111' | 'comfyui'

const IMAGE_BACKEND = (process.env.IMAGE_BACKEND || 'automatic1111') as ImageBackend
const IMAGE_INFERENCE_URL = process.env.IMAGE_INFERENCE_URL || 'http://localhost:7860'
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188'
const COMFYUI_CHECKPOINT = process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors'

const VIDEO_INFERENCE_URL = process.env.VIDEO_INFERENCE_URL || 'http://localhost:8000'
const VIDEO_BACKEND = process.env.VIDEO_BACKEND || 'generic'

export interface ImageTaskInput {
  prompt: string
  width?: number
  height?: number
  style?: string
}

export interface VideoTaskInput {
  prompt: string
  durationSeconds?: number
  fps?: number
  width?: number
  height?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeText(value: string, maxLen: number): string {
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen)
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

async function generateWithAutomatic1111(prompt: string, width: number, height: number): Promise<string> {
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

  if (!response.ok) throw new Error(`A1111 failed: ${response.status}`)

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
    '4': { inputs: { ckpt_name: COMFYUI_CHECKPOINT }, class_type: 'CheckpointLoaderSimple' },
    '5': { inputs: { width, height, batch_size: 1 }, class_type: 'EmptyLatentImage' },
    '6': { inputs: { text: prompt, clip: ['4', 1] }, class_type: 'CLIPTextEncode' },
    '7': { inputs: { text: 'blurry, low quality, distorted', clip: ['4', 1] }, class_type: 'CLIPTextEncode' },
    '8': { inputs: { samples: ['3', 0], vae: ['4', 2] }, class_type: 'VAEDecode' },
    '9': { inputs: { filename_prefix: 'alabobai', images: ['8', 0] }, class_type: 'SaveImage' },
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
    await sleep(1500)
    const historyRes = await fetch(`${COMFYUI_URL}/history/${promptId}`)
    if (!historyRes.ok) continue
    const history = await historyRes.json()
    const outputs = history[promptId]?.outputs || {}
    const nodeValues = Object.values(outputs) as Array<{
      images?: Array<{ filename: string; subfolder: string; type: string }>
    }>
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

async function generateWithGenericVideo(
  prompt: string,
  durationSeconds: number,
  fps: number,
  width: number,
  height: number
): Promise<string> {
  const response = await fetch(`${VIDEO_INFERENCE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, durationSeconds, fps, width, height }),
  })

  if (!response.ok) throw new Error(`Video backend failed: ${response.status}`)
  const data = await response.json()
  const url = data.url || data.videoUrl
  if (!url) throw new Error('No video URL returned by backend')
  return url
}

export async function runImageTask(input: ImageTaskInput) {
  const width = input.width ?? 512
  const height = input.height ?? 512
  const style = input.style ?? 'logo'
  const enhancedPrompt = enhancePrompt(input.prompt, style)

  try {
    const url =
      IMAGE_BACKEND === 'comfyui'
        ? await generateWithComfyUI(enhancedPrompt, width, height)
        : await generateWithAutomatic1111(enhancedPrompt, width, height)

    return {
      ok: true,
      url,
      prompt: enhancedPrompt,
      width,
      height,
      backend: IMAGE_BACKEND,
      fallback: false,
    }
  } catch (backendError) {
    return {
      ok: true,
      url: createFallbackImage(enhancedPrompt, width, height),
      prompt: enhancedPrompt,
      width,
      height,
      backend: 'local-fallback-svg',
      fallback: true,
      warning: backendError instanceof Error ? backendError.message : 'Image backend unavailable',
    }
  }
}

export async function runVideoTask(input: VideoTaskInput) {
  const durationSeconds = input.durationSeconds ?? 4
  const fps = input.fps ?? 16
  const width = input.width ?? 512
  const height = input.height ?? 512

  if (VIDEO_BACKEND !== 'generic') {
    return {
      ok: false,
      error: `Unsupported VIDEO_BACKEND: ${VIDEO_BACKEND}`,
      details: 'Set VIDEO_BACKEND=generic and provide VIDEO_INFERENCE_URL for now.',
      retryable: false,
    }
  }

  try {
    const url = await generateWithGenericVideo(input.prompt, durationSeconds, fps, width, height)
    return {
      ok: true,
      url,
      prompt: input.prompt,
      durationSeconds,
      fps,
      width,
      height,
      backend: VIDEO_BACKEND,
      fallback: false,
    }
  } catch (backendError) {
    return {
      ok: true,
      url: createFallbackMotionAsset(input.prompt, width, height),
      prompt: input.prompt,
      durationSeconds,
      fps,
      width,
      height,
      backend: 'local-fallback-motion',
      fallback: true,
      warning: backendError instanceof Error ? backendError.message : 'Video backend unavailable',
    }
  }
}
