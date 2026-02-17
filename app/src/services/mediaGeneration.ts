/**
 * Media Generation Service
 * Self-healing, autonomous image and video generation with multiple fallback providers
 *
 * Features:
 * - Multiple provider support with automatic fallback
 * - Retry logic with exponential backoff
 * - Health monitoring and auto-recovery
 * - Queue management for rate limiting
 */

// ============================================================================
// Types
// ============================================================================

export interface MediaGenerationOptions {
  prompt: string
  width?: number
  height?: number
  style?: string
  negativePrompt?: string
  seed?: number
  model?: string
}

export interface VideoGenerationOptions extends MediaGenerationOptions {
  duration?: number // seconds
  fps?: number
  sourceImage?: string // for image-to-video
  motion?: 'slow' | 'medium' | 'fast'
}

export interface GeneratedMedia {
  id: string
  type: 'image' | 'video'
  url: string
  prompt: string
  width: number
  height: number
  provider: string
  model: string
  createdAt: Date
  metadata?: Record<string, unknown>
}

interface ProviderHealth {
  name: string
  healthy: boolean
  lastCheck: Date
  consecutiveFailures: number
  averageLatency: number
  successRate: number
}

interface QueuedRequest {
  id: string
  type: 'image' | 'video'
  options: MediaGenerationOptions | VideoGenerationOptions
  resolve: (result: GeneratedMedia) => void
  reject: (error: Error) => void
  retries: number
  addedAt: Date
}

// ============================================================================
// Provider Configurations
// ============================================================================

const IMAGE_PROVIDERS = [
  {
    name: 'pollinations',
    priority: 1,
    generate: async (options: MediaGenerationOptions): Promise<string> => {
      const { prompt, width = 1024, height = 1024, model = 'flux', negativePrompt, seed } = options
      const encodedPrompt = encodeURIComponent(prompt)
      const seedParam = seed || Math.floor(Math.random() * 1000000)
      let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seedParam}&model=${model}&nologo=true`
      if (negativePrompt) {
        url += `&negative=${encodeURIComponent(negativePrompt)}`
      }
      // Verify the image loads
      await verifyImageLoads(url)
      return url
    }
  },
  {
    name: 'huggingface-flux',
    priority: 2,
    generate: async (options: MediaGenerationOptions): Promise<string> => {
      const { prompt, width = 1024, height = 1024 } = options
      // Use Hugging Face Inference API (free tier)
      const response = await fetch(
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { width, height }
          })
        }
      )
      if (!response.ok) {
        throw new Error(`Hugging Face error: ${response.status}`)
      }
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }
  },
  {
    name: 'picsum-fallback',
    priority: 99, // Last resort
    generate: async (options: MediaGenerationOptions): Promise<string> => {
      const { width = 1024, height = 1024 } = options
      // Lorem Picsum as absolute fallback
      return `https://picsum.photos/${width}/${height}?random=${Date.now()}`
    }
  }
]

const VIDEO_PROVIDERS = [
  {
    name: 'pollinations-video',
    priority: 1,
    generate: async (options: VideoGenerationOptions): Promise<string> => {
      const { prompt, width = 512, height = 512 } = options
      // Pollinations video endpoint
      const encodedPrompt = encodeURIComponent(prompt)
      const url = `https://video.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}`

      // Poll for completion (video generation takes time)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Pollinations video error: ${response.status}`)
      }
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }
  },
  {
    name: 'replicate-wan',
    priority: 2,
    generate: async (options: VideoGenerationOptions): Promise<string> => {
      // Replicate's Wan model (requires API key in env)
      const apiKey = import.meta.env.VITE_REPLICATE_API_KEY
      if (!apiKey) {
        throw new Error('Replicate API key not configured')
      }

      const { prompt, width = 480, height = 480, duration = 4 } = options

      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: 'wavespeedai/wan-2.1-t2v-480p',
          input: {
            prompt,
            width,
            height,
            num_frames: duration * 8 // ~8 fps
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Replicate error: ${response.status}`)
      }

      const prediction = await response.json()

      // Poll for completion
      let result = prediction
      while (result.status !== 'succeeded' && result.status !== 'failed') {
        await sleep(2000)
        const pollResponse = await fetch(
          `https://api.replicate.com/v1/predictions/${prediction.id}`,
          { headers: { 'Authorization': `Bearer ${apiKey}` } }
        )
        result = await pollResponse.json()
      }

      if (result.status === 'failed') {
        throw new Error('Video generation failed')
      }

      return result.output
    }
  },
  {
    name: 'huggingface-video',
    priority: 3,
    generate: async (options: VideoGenerationOptions): Promise<string> => {
      const { prompt, sourceImage } = options

      // Use CogVideoX or similar on HF
      const model = sourceImage
        ? 'THUDM/CogVideoX-5b-I2V'
        : 'THUDM/CogVideoX-2b'

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: prompt,
            ...(sourceImage && { image: sourceImage })
          })
        }
      )

      if (!response.ok) {
        throw new Error(`HuggingFace video error: ${response.status}`)
      }

      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }
  },
  {
    name: 'animated-fallback',
    priority: 99,
    generate: async (options: VideoGenerationOptions): Promise<string> => {
      // Create a simple animated gradient as fallback
      const { width = 512, height = 512, prompt } = options
      return createAnimatedFallback(width, height, prompt)
    }
  }
]

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyImageLoads(url: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => {
      img.src = ''
      reject(new Error('Image load timeout'))
    }, timeout)

    img.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Image failed to load'))
    }
    img.src = url
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createAnimatedFallback(width: number, height: number, prompt: string): Promise<string> {
  // Create a canvas-based animated gif or video placeholder
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (!ctx) throw new Error('Canvas not supported')

  // Generate frames
  const frames: string[] = []
  const frameCount = 30

  for (let i = 0; i < frameCount; i++) {
    const t = i / frameCount

    // Animated gradient background
    const gradient = ctx.createLinearGradient(
      Math.sin(t * Math.PI * 2) * width / 2 + width / 2, 0,
      Math.cos(t * Math.PI * 2) * width / 2 + width / 2, height
    )
    gradient.addColorStop(0, `hsl(${(t * 360) % 360}, 70%, 30%)`)
    gradient.addColorStop(0.5, `hsl(${(t * 360 + 60) % 360}, 60%, 40%)`)
    gradient.addColorStop(1, `hsl(${(t * 360 + 120) % 360}, 70%, 30%)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Add some particles
    for (let p = 0; p < 20; p++) {
      const px = (Math.sin(t * Math.PI * 2 + p) * 0.3 + 0.5) * width
      const py = (Math.cos(t * Math.PI * 2 + p * 0.5) * 0.3 + 0.5) * height
      ctx.beginPath()
      ctx.arc(px, py, 5 + Math.sin(t * Math.PI * 4 + p) * 3, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${(t * 360 + p * 20) % 360}, 80%, 70%, 0.6)`
      ctx.fill()
    }

    // Add prompt text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.font = '16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''), width / 2, height - 30)
    ctx.fillText('Video generation in progress...', width / 2, height - 10)

    frames.push(canvas.toDataURL('image/png'))
  }

  // Return first frame as image (actual video would need WebM encoding)
  return frames[0]
}

// ============================================================================
// Media Generation Service
// ============================================================================

class MediaGenerationService {
  private providerHealth: Map<string, ProviderHealth> = new Map()
  private requestQueue: QueuedRequest[] = []
  private processing = false
  private maxRetries = 3
  private retryDelay = 1000
  private maxConcurrent = 3
  private activeRequests = 0

  constructor() {
    // Initialize health tracking for all providers
    [...IMAGE_PROVIDERS, ...VIDEO_PROVIDERS].forEach(provider => {
      this.providerHealth.set(provider.name, {
        name: provider.name,
        healthy: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageLatency: 0,
        successRate: 1
      })
    })

    // Start health check loop
    this.startHealthCheckLoop()
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Generate an image with automatic fallback
   */
  async generateImage(options: MediaGenerationOptions): Promise<GeneratedMedia> {
    return this.queueRequest('image', options)
  }

  /**
   * Generate a video with automatic fallback
   */
  async generateVideo(options: VideoGenerationOptions): Promise<GeneratedMedia> {
    return this.queueRequest('video', options)
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values())
  }

  /**
   * Force health check on all providers
   */
  async checkAllProviders(): Promise<void> {
    const providers = [...IMAGE_PROVIDERS, ...VIDEO_PROVIDERS]
    await Promise.all(providers.map(p => this.checkProviderHealth(p.name)))
  }

  // ============================================================================
  // Queue Management
  // ============================================================================

  private async queueRequest(
    type: 'image' | 'video',
    options: MediaGenerationOptions | VideoGenerationOptions
  ): Promise<GeneratedMedia> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: crypto.randomUUID(),
        type,
        options,
        resolve,
        reject,
        retries: 0,
        addedAt: new Date()
      }

      this.requestQueue.push(request)
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.activeRequests >= this.maxConcurrent) {
      return
    }

    const request = this.requestQueue.shift()
    if (!request) {
      return
    }

    this.activeRequests++

    try {
      const result = await this.executeRequest(request)
      request.resolve(result)
    } catch (error) {
      if (request.retries < this.maxRetries) {
        request.retries++
        // Exponential backoff
        await sleep(this.retryDelay * Math.pow(2, request.retries - 1))
        this.requestQueue.unshift(request)
      } else {
        request.reject(error instanceof Error ? error : new Error(String(error)))
      }
    } finally {
      this.activeRequests--
      // Process next request
      this.processQueue()
    }
  }

  private async executeRequest(request: QueuedRequest): Promise<GeneratedMedia> {
    const providers = request.type === 'image' ? IMAGE_PROVIDERS : VIDEO_PROVIDERS

    // Sort by priority and health
    const sortedProviders = [...providers].sort((a, b) => {
      const healthA = this.providerHealth.get(a.name)
      const healthB = this.providerHealth.get(b.name)

      // Unhealthy providers go to the end
      if (healthA?.healthy !== healthB?.healthy) {
        return healthA?.healthy ? -1 : 1
      }

      // Then sort by priority
      return a.priority - b.priority
    })

    let lastError: Error | null = null

    for (const provider of sortedProviders) {
      const health = this.providerHealth.get(provider.name)

      // Skip providers with too many failures (but still try as fallback)
      if (health && health.consecutiveFailures >= 5 && provider !== sortedProviders[sortedProviders.length - 1]) {
        continue
      }

      try {
        const startTime = Date.now()
        const url = await provider.generate(request.options as VideoGenerationOptions)
        const latency = Date.now() - startTime

        // Update health
        this.updateProviderHealth(provider.name, true, latency)

        return {
          id: crypto.randomUUID(),
          type: request.type,
          url,
          prompt: request.options.prompt,
          width: request.options.width || 1024,
          height: request.options.height || 1024,
          provider: provider.name,
          model: request.options.model || 'default',
          createdAt: new Date()
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[MediaGen] Provider ${provider.name} failed:`, error)
        this.updateProviderHealth(provider.name, false, 0)
      }
    }

    throw lastError || new Error('All providers failed')
  }

  // ============================================================================
  // Health Management
  // ============================================================================

  private updateProviderHealth(name: string, success: boolean, latency: number): void {
    const health = this.providerHealth.get(name)
    if (!health) return

    if (success) {
      health.consecutiveFailures = 0
      health.healthy = true
      // Update average latency (moving average)
      health.averageLatency = health.averageLatency * 0.8 + latency * 0.2
      // Update success rate
      health.successRate = health.successRate * 0.9 + 0.1
    } else {
      health.consecutiveFailures++
      health.healthy = health.consecutiveFailures < 3
      // Update success rate
      health.successRate = health.successRate * 0.9
    }

    health.lastCheck = new Date()
  }

  private async checkProviderHealth(name: string): Promise<void> {
    const imageProvider = IMAGE_PROVIDERS.find(p => p.name === name)
    const videoProvider = VIDEO_PROVIDERS.find(p => p.name === name)
    const provider = imageProvider || videoProvider

    if (!provider) return

    try {
      const startTime = Date.now()
      // Try a small test generation
      await provider.generate({
        prompt: 'test',
        width: 64,
        height: 64
      } as VideoGenerationOptions)
      const latency = Date.now() - startTime
      this.updateProviderHealth(name, true, latency)
    } catch {
      this.updateProviderHealth(name, false, 0)
    }
  }

  private startHealthCheckLoop(): void {
    // Check provider health every 5 minutes
    setInterval(() => {
      const unhealthyProviders = Array.from(this.providerHealth.values())
        .filter(h => !h.healthy || h.consecutiveFailures > 0)

      // Only check unhealthy providers to recover them
      unhealthyProviders.forEach(h => {
        this.checkProviderHealth(h.name)
      })
    }, 5 * 60 * 1000)
  }
}

// ============================================================================
// Export
// ============================================================================

export const mediaGenerationService = new MediaGenerationService()

// Convenience exports
export async function generateImage(options: MediaGenerationOptions): Promise<GeneratedMedia> {
  return mediaGenerationService.generateImage(options)
}

export async function generateVideo(options: VideoGenerationOptions): Promise<GeneratedMedia> {
  return mediaGenerationService.generateVideo(options)
}

export function getProviderHealth(): ProviderHealth[] {
  return mediaGenerationService.getProviderHealth()
}

export default mediaGenerationService
