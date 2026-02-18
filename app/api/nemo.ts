/**
 * NVIDIA NeMo API Routes
 *
 * Backend API for GPU-accelerated speech processing using NVIDIA NeMo.
 * Supports ASR (Automatic Speech Recognition) and TTS (Text-to-Speech).
 *
 * Requirements:
 * - NVIDIA GPU with CUDA support
 * - NeMo toolkit installed (pip install nemo_toolkit[all])
 * - Or NVIDIA Riva server running
 *
 * Models:
 * - Parakeet TDT 0.6B v2 (ASR)
 * - Canary-1B (Multilingual ASR + Translation)
 * - VITS/FastPitch (TTS)
 */

import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// CONFIGURATION
// ============================================================================

interface NemoConfig {
  // ASR Models from HuggingFace
  asrModels: Record<string, string>
  // TTS Models from HuggingFace
  ttsModels: Record<string, string>
  // Riva server URL (if using Riva instead of direct NeMo)
  rivaUrl?: string
  // GPU device ID
  gpuDevice: number
}

const NEMO_CONFIG: NemoConfig = {
  asrModels: {
    'parakeet-tdt-0.6b': 'nvidia/parakeet-tdt-0.6b-v2',
    'canary-1b': 'nvidia/canary-1b',
    'nemotron-streaming': 'nvidia/nemotron-speech-streaming-en-0.6b'
  },
  ttsModels: {
    'vits': 'nvidia/tts_en_lj_vits',
    'fastpitch': 'nvidia/tts_en_fastpitch',
    'hifigan': 'nvidia/tts_hifigan'
  },
  rivaUrl: process.env.NVIDIA_RIVA_URL,
  gpuDevice: parseInt(process.env.NVIDIA_GPU_DEVICE || '0')
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'health'

  if (action === 'health') {
    return checkHealth()
  }

  if (action === 'models') {
    return NextResponse.json({
      asr: Object.keys(NEMO_CONFIG.asrModels),
      tts: Object.keys(NEMO_CONFIG.ttsModels)
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function checkHealth() {
  const status = {
    nemo: false,
    riva: false,
    gpu: false,
    models: {
      asr: [] as string[],
      tts: [] as string[]
    }
  }

  // Check if Riva is available
  if (NEMO_CONFIG.rivaUrl) {
    try {
      const response = await fetch(`${NEMO_CONFIG.rivaUrl}/health`, {
        signal: AbortSignal.timeout(3000)
      })
      status.riva = response.ok
    } catch {
      status.riva = false
    }
  }

  // In a real implementation, we'd check for:
  // - CUDA availability
  // - NeMo toolkit installation
  // - Loaded models
  // For now, we'll simulate based on environment variables

  status.nemo = process.env.NEMO_ENABLED === 'true'
  status.gpu = process.env.CUDA_AVAILABLE === 'true'

  if (status.nemo || status.riva) {
    status.models.asr = Object.keys(NEMO_CONFIG.asrModels)
    status.models.tts = Object.keys(NEMO_CONFIG.ttsModels)
  }

  return NextResponse.json({
    ok: status.nemo || status.riva,
    status
  })
}

// ============================================================================
// ASR (SPEECH-TO-TEXT)
// ============================================================================

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')

  try {
    if (endpoint === 'asr') {
      return handleASR(request)
    }

    if (endpoint === 'tts') {
      return handleTTS(request)
    }

    // Default: detect from content type
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      return handleASR(request)
    }

    if (contentType.includes('application/json')) {
      return handleTTS(request)
    }

    return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 })
  } catch (error) {
    console.error('[NeMo API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

async function handleASR(request: NextRequest) {
  const formData = await request.formData()
  const audioFile = formData.get('audio') as File
  const model = (formData.get('model') as string) || 'parakeet-tdt-0.6b'
  const language = (formData.get('language') as string) || 'en'
  const timestamps = formData.get('timestamps') === 'true'
  const punctuation = formData.get('punctuation') !== 'false'

  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  // Check if we should use Riva
  if (NEMO_CONFIG.rivaUrl) {
    return handleRivaASR(audioFile, model, language, timestamps, punctuation)
  }

  // Use NeMo directly (requires Python backend)
  return handleNemoASR(audioFile, model, language, timestamps, punctuation)
}

async function handleRivaASR(
  audioFile: File,
  model: string,
  language: string,
  timestamps: boolean,
  punctuation: boolean
) {
  const formData = new FormData()
  formData.append('audio', audioFile)
  formData.append('language_code', language)
  formData.append('enable_word_time_offsets', String(timestamps))
  formData.append('punctuation', String(punctuation))

  const response = await fetch(`${NEMO_CONFIG.rivaUrl}/asr/recognize`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(`Riva ASR error: ${response.status}`)
  }

  const result = await response.json()

  return NextResponse.json({
    text: result.alternatives?.[0]?.transcript || '',
    confidence: result.alternatives?.[0]?.confidence || 0.95,
    language,
    timestamps: timestamps ? result.alternatives?.[0]?.words : undefined,
    model,
    provider: 'riva'
  })
}

async function handleNemoASR(
  audioFile: File,
  model: string,
  language: string,
  timestamps: boolean,
  punctuation: boolean
) {
  // In production, this would call a Python NeMo service
  // For now, we'll return a simulated response indicating NeMo isn't configured

  // Check if we have a local NeMo Python service running
  const nemoServiceUrl = process.env.NEMO_SERVICE_URL || 'http://localhost:5001'

  try {
    const formData = new FormData()
    formData.append('audio', audioFile)
    formData.append('model', NEMO_CONFIG.asrModels[model] || model)
    formData.append('language', language)
    formData.append('timestamps', String(timestamps))
    formData.append('punctuation', String(punctuation))

    const response = await fetch(`${nemoServiceUrl}/asr`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000)
    })

    if (response.ok) {
      const result = await response.json()
      return NextResponse.json({
        ...result,
        provider: 'nemo'
      })
    }
  } catch {
    // NeMo service not available
  }

  // Return error indicating NeMo isn't configured
  return NextResponse.json(
    {
      error: 'NeMo ASR service not configured',
      message: 'Please set up NVIDIA NeMo or Riva for server-side ASR',
      suggestion: 'Use client-side Sherpa-ONNX for browser-based ASR'
    },
    { status: 503 }
  )
}

// ============================================================================
// TTS (TEXT-TO-SPEECH)
// ============================================================================

async function handleTTS(request: NextRequest) {
  const body = await request.json()
  const { text, model = 'vits', voice = 'default', speed = 1.0, pitch = 1.0 } = body

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  // Check if we should use Riva
  if (NEMO_CONFIG.rivaUrl) {
    return handleRivaTTS(text, model, voice, speed, pitch)
  }

  // Use NeMo directly
  return handleNemoTTS(text, model, voice, speed, pitch)
}

async function handleRivaTTS(
  text: string,
  model: string,
  voice: string,
  speed: number,
  pitch: number
) {
  const response = await fetch(`${NEMO_CONFIG.rivaUrl}/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_name: voice,
      sample_rate: 22050,
      language_code: 'en-US'
    })
  })

  if (!response.ok) {
    throw new Error(`Riva TTS error: ${response.status}`)
  }

  const audioData = await response.arrayBuffer()

  return new NextResponse(audioData, {
    headers: {
      'Content-Type': 'audio/wav',
      'X-Provider': 'riva',
      'X-Model': model
    }
  })
}

async function handleNemoTTS(
  text: string,
  model: string,
  voice: string,
  speed: number,
  pitch: number
) {
  const nemoServiceUrl = process.env.NEMO_SERVICE_URL || 'http://localhost:5001'

  try {
    const response = await fetch(`${nemoServiceUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model: NEMO_CONFIG.ttsModels[model] || model,
        voice,
        speed,
        pitch
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (response.ok) {
      const audioData = await response.arrayBuffer()
      return new NextResponse(audioData, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-Provider': 'nemo',
          'X-Model': model
        }
      })
    }
  } catch {
    // NeMo service not available
  }

  return NextResponse.json(
    {
      error: 'NeMo TTS service not configured',
      message: 'Please set up NVIDIA NeMo or Riva for server-side TTS',
      suggestion: 'Use client-side Sherpa-ONNX or Web Speech API for browser-based TTS'
    },
    { status: 503 }
  )
}

// ============================================================================
// WEBSOCKET STREAMING (for real-time ASR)
// ============================================================================

// Note: WebSocket handling requires a separate server setup
// This is a placeholder for the streaming endpoint configuration

export const config = {
  api: {
    bodyParser: false // Required for file uploads
  }
}
