/**
 * Image Generation Service
 * AI-powered image generation using free APIs:
 * - Pollinations.ai for text-to-image
 * - Lorem Picsum for placeholders
 * - Algorithmic abstract art generation
 */

// Types
export interface ImageGenerationOptions {
  prompt: string
  style?: ImageStyle
  size?: ImageSize
  negativePrompt?: string
  seed?: number
  enhance?: boolean
  model?: ImageModel
}

export interface ImageStyle {
  id: string
  name: string
  promptSuffix: string
  negativePrompt?: string
}

export interface ImageSize {
  id: string
  name: string
  width: number
  height: number
  aspectRatio: string
}

export interface ImageModel {
  id: string
  name: string
  description: string
}

export interface GeneratedImage {
  id: string
  url: string
  prompt: string
  style: string
  width: number
  height: number
  model: string
  createdAt: Date
  seed?: number
}

export interface PromptSuggestion {
  category: string
  suggestions: string[]
}

// Available image models from Pollinations
export const IMAGE_MODELS: ImageModel[] = [
  { id: 'flux', name: 'Flux', description: 'High quality, fast generation' },
  { id: 'flux-realism', name: 'Flux Realism', description: 'Photorealistic images' },
  { id: 'flux-anime', name: 'Flux Anime', description: 'Anime/manga style' },
  { id: 'flux-3d', name: 'Flux 3D', description: '3D rendered look' },
  { id: 'turbo', name: 'Turbo', description: 'Ultra-fast generation' }
]

// Image style presets with enhanced prompts
export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: 'photorealistic',
    name: 'Photorealistic',
    promptSuffix: 'photorealistic, highly detailed, 8k uhd, professional photography, sharp focus, natural lighting',
    negativePrompt: 'cartoon, illustration, painting, drawing, blurry, low quality'
  },
  {
    id: 'digital-art',
    name: 'Digital Art',
    promptSuffix: 'digital art, vibrant colors, detailed illustration, trending on artstation, concept art',
    negativePrompt: 'photo, photograph, blurry, low quality'
  },
  {
    id: 'oil-painting',
    name: 'Oil Painting',
    promptSuffix: 'oil painting, classical art style, rich textures, masterpiece, museum quality',
    negativePrompt: 'photo, digital, modern, low quality'
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    promptSuffix: 'watercolor painting, soft edges, flowing colors, artistic, delicate brushwork',
    negativePrompt: 'photo, sharp edges, digital, 3d'
  },
  {
    id: 'anime',
    name: 'Anime',
    promptSuffix: 'anime style, japanese animation, vibrant, high quality anime art, studio ghibli inspired',
    negativePrompt: 'photo, realistic, western, 3d render'
  },
  {
    id: '3d-render',
    name: '3D Render',
    promptSuffix: '3d render, octane render, volumetric lighting, highly detailed, cinema 4d, blender',
    negativePrompt: '2d, flat, painting, drawing, sketch'
  },
  {
    id: 'pixel-art',
    name: 'Pixel Art',
    promptSuffix: 'pixel art style, 16-bit, retro game graphics, nostalgic, crisp pixels',
    negativePrompt: 'photo, realistic, smooth, high resolution'
  },
  {
    id: 'sketch',
    name: 'Sketch',
    promptSuffix: 'pencil sketch, hand drawn, artistic sketch style, detailed linework, crosshatching',
    negativePrompt: 'color, painted, photo, digital'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    promptSuffix: 'cyberpunk style, neon lights, futuristic, dark atmosphere, blade runner inspired, rain',
    negativePrompt: 'natural, bright, daylight, pastoral'
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    promptSuffix: 'fantasy art, magical, ethereal, detailed fantasy illustration, epic, mystical',
    negativePrompt: 'modern, realistic, mundane, ordinary'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    promptSuffix: 'minimalist design, clean lines, simple, elegant, modern aesthetic, negative space',
    negativePrompt: 'cluttered, busy, detailed, ornate'
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    promptSuffix: 'pop art style, andy warhol inspired, bold colors, halftone dots, retro',
    negativePrompt: 'photo, realistic, muted colors'
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    promptSuffix: 'cinematic shot, dramatic lighting, movie still, anamorphic lens, 35mm film',
    negativePrompt: 'amateur, flat lighting, snapshot'
  },
  {
    id: 'comic',
    name: 'Comic Book',
    promptSuffix: 'comic book style, bold outlines, dynamic action, marvel dc style, graphic novel',
    negativePrompt: 'photo, realistic, muted, dull'
  },
  {
    id: 'logo',
    name: 'Logo Design',
    promptSuffix: 'minimalist logo design, vector style, clean lines, professional, scalable, iconic',
    negativePrompt: 'photo, complex, detailed, realistic'
  }
]

// Image size presets
export const IMAGE_SIZES: ImageSize[] = [
  { id: 'square', name: 'Square', width: 1024, height: 1024, aspectRatio: '1:1' },
  { id: 'square-small', name: 'Square Small', width: 512, height: 512, aspectRatio: '1:1' },
  { id: 'landscape', name: 'Landscape', width: 1280, height: 720, aspectRatio: '16:9' },
  { id: 'landscape-wide', name: 'Ultra Wide', width: 1920, height: 800, aspectRatio: '21:9' },
  { id: 'portrait', name: 'Portrait', width: 720, height: 1280, aspectRatio: '9:16' },
  { id: 'instagram-square', name: 'Instagram Square', width: 1080, height: 1080, aspectRatio: '1:1' },
  { id: 'instagram-story', name: 'Instagram Story', width: 1080, height: 1920, aspectRatio: '9:16' },
  { id: 'twitter-header', name: 'Twitter Header', width: 1500, height: 500, aspectRatio: '3:1' },
  { id: 'linkedin-banner', name: 'LinkedIn Banner', width: 1584, height: 396, aspectRatio: '4:1' },
  { id: 'youtube-thumbnail', name: 'YouTube Thumbnail', width: 1280, height: 720, aspectRatio: '16:9' },
  { id: 'facebook-cover', name: 'Facebook Cover', width: 820, height: 312, aspectRatio: '2.63:1' },
  { id: 'presentation', name: 'Presentation', width: 1920, height: 1080, aspectRatio: '16:9' },
  { id: 'poster', name: 'Poster', width: 800, height: 1200, aspectRatio: '2:3' }
]

// Style modifiers that can be added to any prompt
export const STYLE_MODIFIERS = [
  { id: 'cinematic', name: 'Cinematic', value: 'cinematic, dramatic lighting' },
  { id: 'vibrant', name: 'Vibrant', value: 'vibrant colors, saturated' },
  { id: 'moody', name: 'Moody', value: 'moody atmosphere, dark tones' },
  { id: 'ethereal', name: 'Ethereal', value: 'ethereal, dreamy, soft glow' },
  { id: 'vintage', name: 'Vintage', value: 'vintage aesthetic, retro, film grain' },
  { id: 'neon', name: 'Neon', value: 'neon lights, glowing, cyberpunk' },
  { id: 'golden-hour', name: 'Golden Hour', value: 'golden hour lighting, warm sunset' },
  { id: 'noir', name: 'Noir', value: 'film noir, black and white, dramatic shadows' },
  { id: 'pastel', name: 'Pastel', value: 'pastel colors, soft, gentle' },
  { id: 'dramatic', name: 'Dramatic', value: 'dramatic, intense, powerful' },
  { id: 'peaceful', name: 'Peaceful', value: 'peaceful, serene, calm' },
  { id: 'epic', name: 'Epic', value: 'epic scale, grand, majestic' }
]

// Prompt suggestions by category
export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  {
    category: 'Landscapes',
    suggestions: [
      'Majestic mountain range at sunset with golden clouds',
      'Serene Japanese garden with cherry blossoms and koi pond',
      'Northern lights over a frozen lake in Iceland',
      'Tropical beach with crystal clear turquoise water',
      'Misty forest with ancient redwood trees'
    ]
  },
  {
    category: 'Portraits',
    suggestions: [
      'Professional portrait with dramatic studio lighting',
      'Fantasy character with elaborate costume and makeup',
      'Cyberpunk hacker with neon reflections',
      'Renaissance-style noble portrait',
      'Steampunk inventor with brass goggles'
    ]
  },
  {
    category: 'Architecture',
    suggestions: [
      'Futuristic city skyline with flying vehicles',
      'Ancient Greek temple on a clifftop',
      'Modern minimalist house with floor-to-ceiling windows',
      'Gothic cathedral interior with stained glass',
      'Japanese zen temple in autumn'
    ]
  },
  {
    category: 'Abstract',
    suggestions: [
      'Flowing liquid metal in vibrant colors',
      'Geometric patterns in neon gradients',
      'Cosmic nebula with swirling galaxies',
      'Fractal patterns in jewel tones',
      'Abstract expressionism with bold brushstrokes'
    ]
  },
  {
    category: 'Nature',
    suggestions: [
      'Macro photography of a dewdrop on a flower',
      'Majestic lion in the African savanna',
      'Colorful coral reef with tropical fish',
      'Butterfly garden in full bloom',
      'Aurora borealis over snowy mountains'
    ]
  },
  {
    category: 'Sci-Fi',
    suggestions: [
      'Space station orbiting a distant planet',
      'Robot companion in a post-apocalyptic world',
      'Alien marketplace on an exotic planet',
      'Time traveler stepping through a portal',
      'Cybernetic enhancement lab'
    ]
  },
  {
    category: 'Fantasy',
    suggestions: [
      'Dragon perched on a mountain castle',
      'Enchanted forest with magical creatures',
      'Wizard casting a powerful spell',
      'Underwater kingdom with mermaids',
      'Floating islands in the sky'
    ]
  },
  {
    category: 'Food',
    suggestions: [
      'Gourmet dish with artistic plating',
      'Steaming cup of coffee with latte art',
      'Colorful fruit arrangement',
      'Rustic bakery with fresh bread',
      'Japanese sushi platter'
    ]
  }
]

// Common negative prompts
export const NEGATIVE_PROMPT_PRESETS = [
  { id: 'quality', name: 'Low Quality', value: 'blurry, low quality, low resolution, pixelated, jpeg artifacts, compression artifacts' },
  { id: 'anatomy', name: 'Bad Anatomy', value: 'bad anatomy, bad proportions, deformed, distorted, disfigured, extra limbs, missing limbs' },
  { id: 'text', name: 'No Text', value: 'text, watermark, signature, logo, words, letters' },
  { id: 'nsfw', name: 'Safe Content', value: 'nsfw, nude, explicit, inappropriate, violence, gore' },
  { id: 'artifacts', name: 'AI Artifacts', value: 'artificial, unnatural, plastic, oversaturated, overexposed' }
]

/**
 * Image Generation Service class
 */
class ImageGenerationService {
  private readonly pollinationsBaseUrl = 'https://image.pollinations.ai/prompt'
  private readonly loremPicsumUrl = 'https://picsum.photos'

  // Alternative free AI image APIs
  private readonly alternativeApis = [
    'https://image.pollinations.ai/prompt',
    // Lexica API (free, stable diffusion)
    'https://lexica.art/api/v1/search'
  ]

  /**
   * Test if an image URL is accessible
   */
  private async testImageUrl(url: string, timeout = 10000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const contentType = response.headers.get('content-type')
      return response.ok && (contentType?.startsWith('image/') ?? false)
    } catch {
      return false
    }
  }

  /**
   * Generate image using multiple providers with fallback
   */
  async generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
    const {
      prompt,
      style = IMAGE_STYLES[0],
      size = IMAGE_SIZES[0],
      negativePrompt,
      seed = Math.floor(Math.random() * 1000000),
      enhance = true,
      model = IMAGE_MODELS[0]
    } = options

    // Build the enhanced prompt
    let fullPrompt = prompt
    if (enhance && style.promptSuffix) {
      fullPrompt = `${prompt}, ${style.promptSuffix}`
    }

    // Add negative prompt if provided
    const negPrompt = negativePrompt || style.negativePrompt || ''

    // Build Pollinations URL
    const encodedPrompt = encodeURIComponent(fullPrompt)
    const pollinationsUrl = `${this.pollinationsBaseUrl}/${encodedPrompt}?width=${size.width}&height=${size.height}&seed=${seed}&model=${model.id}${negPrompt ? `&negative=${encodeURIComponent(negPrompt)}` : ''}&nologo=true`

    // Try Pollinations first
    const pollinationsWorks = await this.testImageUrl(pollinationsUrl)

    if (pollinationsWorks) {
      return {
        id: crypto.randomUUID(),
        url: pollinationsUrl,
        prompt: fullPrompt,
        style: style.name,
        width: size.width,
        height: size.height,
        model: model.name,
        createdAt: new Date(),
        seed
      }
    }

    // Fallback: Generate local abstract art based on prompt
    console.log('Pollinations unavailable, using local generation')

    // Determine abstract style from prompt keywords
    let abstractStyle: 'geometric' | 'flow' | 'particles' | 'waves' | 'gradient' = 'gradient'
    const promptLower = prompt.toLowerCase()

    if (promptLower.includes('geometric') || promptLower.includes('shape')) {
      abstractStyle = 'geometric'
    } else if (promptLower.includes('flow') || promptLower.includes('fluid')) {
      abstractStyle = 'flow'
    } else if (promptLower.includes('particle') || promptLower.includes('star') || promptLower.includes('space')) {
      abstractStyle = 'particles'
    } else if (promptLower.includes('wave') || promptLower.includes('ocean') || promptLower.includes('water')) {
      abstractStyle = 'waves'
    }

    const localUrl = this.generateAbstractArt(size.width, size.height, abstractStyle, seed)

    return {
      id: crypto.randomUUID(),
      url: localUrl,
      prompt: `[Local] ${fullPrompt}`,
      style: `${style.name} (Abstract)`,
      width: size.width,
      height: size.height,
      model: 'Local Generator',
      createdAt: new Date(),
      seed
    }
  }

  /**
   * Generate a placeholder image from Lorem Picsum
   */
  async generatePlaceholder(width: number, height: number, grayscale = false, blur = 0): Promise<string> {
    let url = `${this.loremPicsumUrl}/${width}/${height}`
    const params: string[] = []

    if (grayscale) params.push('grayscale')
    if (blur > 0) params.push(`blur=${Math.min(blur, 10)}`)

    if (params.length > 0) {
      url += '?' + params.join('&')
    }

    return url
  }

  /**
   * Generate abstract art using canvas algorithms
   */
  generateAbstractArt(
    width: number = 512,
    height: number = 512,
    style: 'geometric' | 'flow' | 'particles' | 'waves' | 'gradient' = 'geometric',
    seed?: number
  ): string {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (!ctx) throw new Error('Could not get canvas context')

    // Seeded random function
    const random = this.seededRandom(seed || Date.now())

    switch (style) {
      case 'geometric':
        this.drawGeometric(ctx, width, height, random)
        break
      case 'flow':
        this.drawFlowField(ctx, width, height, random)
        break
      case 'particles':
        this.drawParticles(ctx, width, height, random)
        break
      case 'waves':
        this.drawWaves(ctx, width, height, random)
        break
      case 'gradient':
        this.drawGradientArt(ctx, width, height, random)
        break
    }

    return canvas.toDataURL('image/png')
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let s = seed
    return () => {
      s = Math.sin(s) * 10000
      return s - Math.floor(s)
    }
  }

  /**
   * Draw geometric abstract art
   */
  private drawGeometric(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    random: () => number
  ): void {
    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height)
    bgGradient.addColorStop(0, `hsl(${random() * 360}, 70%, 10%)`)
    bgGradient.addColorStop(1, `hsl(${random() * 360}, 70%, 20%)`)
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // Draw shapes
    const shapeCount = 20 + Math.floor(random() * 30)
    for (let i = 0; i < shapeCount; i++) {
      const x = random() * width
      const y = random() * height
      const size = 20 + random() * 100
      const hue = random() * 360
      const alpha = 0.3 + random() * 0.5

      ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`
      ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${alpha})`
      ctx.lineWidth = 2

      const shapeType = Math.floor(random() * 4)
      ctx.beginPath()

      switch (shapeType) {
        case 0: // Circle
          ctx.arc(x, y, size / 2, 0, Math.PI * 2)
          break
        case 1: // Rectangle
          ctx.rect(x - size / 2, y - size / 2, size, size * (0.5 + random()))
          break
        case 2: // Triangle
          ctx.moveTo(x, y - size / 2)
          ctx.lineTo(x + size / 2, y + size / 2)
          ctx.lineTo(x - size / 2, y + size / 2)
          ctx.closePath()
          break
        case 3: // Polygon
          const sides = 5 + Math.floor(random() * 4)
          for (let j = 0; j < sides; j++) {
            const angle = (j / sides) * Math.PI * 2 - Math.PI / 2
            const px = x + Math.cos(angle) * size / 2
            const py = y + Math.sin(angle) * size / 2
            if (j === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.closePath()
          break
      }

      if (random() > 0.5) {
        ctx.fill()
      } else {
        ctx.stroke()
      }
    }
  }

  /**
   * Draw flow field abstract art
   */
  private drawFlowField(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    random: () => number
  ): void {
    // Dark background
    ctx.fillStyle = `hsl(${random() * 60 + 200}, 40%, 8%)`
    ctx.fillRect(0, 0, width, height)

    const resolution = 20
    const cols = Math.ceil(width / resolution)
    const rows = Math.ceil(height / resolution)

    // Generate flow field
    const field: number[][] = []
    const noiseScale = 0.01 + random() * 0.02

    for (let i = 0; i < cols; i++) {
      field[i] = []
      for (let j = 0; j < rows; j++) {
        const angle = (Math.sin(i * noiseScale * 100) + Math.cos(j * noiseScale * 100)) * Math.PI * 2
        field[i][j] = angle
      }
    }

    // Draw particles following flow
    const particleCount = 1000
    const baseHue = random() * 360

    for (let p = 0; p < particleCount; p++) {
      let x = random() * width
      let y = random() * height
      const hue = (baseHue + random() * 60 - 30) % 360

      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.3)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)

      for (let step = 0; step < 50; step++) {
        const col = Math.floor(x / resolution)
        const row = Math.floor(y / resolution)

        if (col >= 0 && col < cols && row >= 0 && row < rows) {
          const angle = field[col][row]
          x += Math.cos(angle) * 2
          y += Math.sin(angle) * 2
          ctx.lineTo(x, y)
        } else {
          break
        }
      }

      ctx.stroke()
    }
  }

  /**
   * Draw particle abstract art
   */
  private drawParticles(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    random: () => number
  ): void {
    // Gradient background
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, width
    )
    gradient.addColorStop(0, `hsl(${random() * 360}, 50%, 15%)`)
    gradient.addColorStop(1, `hsl(${random() * 360 + 30}, 40%, 5%)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Draw connected particles
    const particleCount = 100 + Math.floor(random() * 100)
    const particles: { x: number; y: number; size: number }[] = []
    const baseHue = random() * 360

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: random() * width,
        y: random() * height,
        size: 2 + random() * 6
      })
    }

    // Draw connections
    const maxDistance = 100 + random() * 50
    ctx.strokeStyle = `hsla(${baseHue}, 60%, 60%, 0.1)`
    ctx.lineWidth = 1

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < maxDistance) {
          const alpha = 1 - distance / maxDistance
          ctx.strokeStyle = `hsla(${baseHue}, 60%, 60%, ${alpha * 0.3})`
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.stroke()
        }
      }
    }

    // Draw particles
    for (const particle of particles) {
      const hue = (baseHue + random() * 40 - 20) % 360
      const gradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, particle.size
      )
      gradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.8)`)
      gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * Draw wave abstract art
   */
  private drawWaves(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    random: () => number
  ): void {
    // Gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    const baseHue = random() * 360
    bgGradient.addColorStop(0, `hsl(${baseHue}, 60%, 10%)`)
    bgGradient.addColorStop(1, `hsl(${(baseHue + 40) % 360}, 50%, 20%)`)
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // Draw waves
    const waveCount = 8 + Math.floor(random() * 8)

    for (let w = 0; w < waveCount; w++) {
      const amplitude = 30 + random() * 50
      const frequency = 0.005 + random() * 0.015
      const phase = random() * Math.PI * 2
      const yOffset = (height / waveCount) * w + height / waveCount / 2
      const hue = (baseHue + w * 20) % 360

      ctx.beginPath()
      ctx.moveTo(0, yOffset)

      for (let x = 0; x <= width; x += 2) {
        const y = yOffset + Math.sin(x * frequency + phase) * amplitude
        ctx.lineTo(x, y)
      }

      ctx.lineTo(width, height)
      ctx.lineTo(0, height)
      ctx.closePath()

      const gradient = ctx.createLinearGradient(0, yOffset - amplitude, 0, height)
      gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.4)`)
      gradient.addColorStop(1, `hsla(${hue}, 60%, 30%, 0.1)`)
      ctx.fillStyle = gradient
      ctx.fill()
    }
  }

  /**
   * Draw gradient abstract art
   */
  private drawGradientArt(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    random: () => number
  ): void {
    // Multi-layer gradient composition
    const layers = 5 + Math.floor(random() * 5)

    for (let i = 0; i < layers; i++) {
      const x1 = random() * width
      const y1 = random() * height
      const x2 = random() * width
      const y2 = random() * height
      const radius = 100 + random() * 300

      const gradient = ctx.createRadialGradient(x1, y1, 0, x2, y2, radius)
      const hue1 = random() * 360
      const hue2 = (hue1 + 30 + random() * 60) % 360

      gradient.addColorStop(0, `hsla(${hue1}, 80%, 60%, ${0.3 + random() * 0.4})`)
      gradient.addColorStop(0.5, `hsla(${hue2}, 70%, 50%, ${0.2 + random() * 0.3})`)
      gradient.addColorStop(1, `hsla(${hue1}, 60%, 40%, 0)`)

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    }

    // Add some noise/grain
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const noiseAmount = 10 + random() * 20

    for (let i = 0; i < data.length; i += 4) {
      const noise = (random() - 0.5) * noiseAmount
      data[i] = Math.max(0, Math.min(255, data[i] + noise))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
    }

    ctx.putImageData(imageData, 0, 0)
  }

  /**
   * Enhance a prompt with AI suggestions
   */
  enhancePrompt(prompt: string, style?: ImageStyle): string {
    let enhanced = prompt.trim()

    // Add quality enhancers if not present
    const qualityTerms = ['detailed', 'high quality', '4k', '8k', 'uhd', 'hd']
    const hasQuality = qualityTerms.some(term => enhanced.toLowerCase().includes(term))

    if (!hasQuality) {
      enhanced += ', highly detailed, high quality'
    }

    // Add style suffix if provided
    if (style?.promptSuffix) {
      enhanced += `, ${style.promptSuffix}`
    }

    return enhanced
  }

  /**
   * Get random prompt suggestion
   */
  getRandomPrompt(): string {
    const category = PROMPT_SUGGESTIONS[Math.floor(Math.random() * PROMPT_SUGGESTIONS.length)]
    return category.suggestions[Math.floor(Math.random() * category.suggestions.length)]
  }

  /**
   * Get prompts by category
   */
  getPromptsByCategory(category: string): string[] {
    const found = PROMPT_SUGGESTIONS.find(c => c.category.toLowerCase() === category.toLowerCase())
    return found?.suggestions || []
  }

  /**
   * Build negative prompt from presets
   */
  buildNegativePrompt(presetIds: string[]): string {
    return presetIds
      .map(id => NEGATIVE_PROMPT_PRESETS.find(p => p.id === id)?.value)
      .filter(Boolean)
      .join(', ')
  }

  /**
   * Save image to local storage gallery
   */
  saveToGallery(image: GeneratedImage): void {
    const gallery = this.getGallery()
    gallery.unshift(image)
    // Keep only last 100 images
    if (gallery.length > 100) {
      gallery.pop()
    }
    localStorage.setItem('creative-studio-gallery', JSON.stringify(gallery))
  }

  /**
   * Get gallery from local storage
   */
  getGallery(): GeneratedImage[] {
    try {
      const data = localStorage.getItem('creative-studio-gallery')
      if (data) {
        return JSON.parse(data).map((img: GeneratedImage) => ({
          ...img,
          createdAt: new Date(img.createdAt)
        }))
      }
    } catch (e) {
      console.error('Failed to load gallery:', e)
    }
    return []
  }

  /**
   * Remove image from gallery
   */
  removeFromGallery(imageId: string): void {
    const gallery = this.getGallery().filter(img => img.id !== imageId)
    localStorage.setItem('creative-studio-gallery', JSON.stringify(gallery))
  }

  /**
   * Clear gallery
   */
  clearGallery(): void {
    localStorage.removeItem('creative-studio-gallery')
  }

  /**
   * Download image
   */
  async downloadImage(
    imageUrl: string,
    filename: string,
    format: 'png' | 'jpg' | 'webp' = 'png',
    quality: number = 0.92
  ): Promise<void> {
    try {
      // For data URLs, convert directly
      if (imageUrl.startsWith('data:')) {
        const link = document.createElement('a')
        link.href = imageUrl
        link.download = `${filename}.${format}`
        link.click()
        return
      }

      // For external URLs, fetch and convert
      const response = await fetch(imageUrl)
      const blob = await response.blob()

      // Create image to convert format if needed
      if (format !== 'png' && format !== 'webp') {
        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = URL.createObjectURL(blob)
        })

        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0)

        const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
        const dataUrl = canvas.toDataURL(mimeType, quality)

        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `${filename}.${format}`
        link.click()
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${filename}.${format}`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download failed:', error)
      throw error
    }
  }

  /**
   * Copy image to clipboard
   */
  async copyToClipboard(imageUrl: string): Promise<void> {
    try {
      let blob: Blob

      if (imageUrl.startsWith('data:')) {
        // Convert data URL to blob
        const response = await fetch(imageUrl)
        blob = await response.blob()
      } else {
        // Fetch external URL
        const response = await fetch(imageUrl)
        blob = await response.blob()
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ])
    } catch (error) {
      console.error('Copy to clipboard failed:', error)
      throw error
    }
  }

  /**
   * Generate a shareable data URL (for small images)
   */
  async generateShareUrl(imageUrl: string): Promise<string> {
    try {
      if (imageUrl.startsWith('data:')) {
        return imageUrl
      }

      const response = await fetch(imageUrl)
      const blob = await response.blob()

      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch (error) {
      console.error('Failed to generate share URL:', error)
      throw error
    }
  }

  /**
   * Resize image to different resolution
   */
  async resizeImage(
    imageUrl: string,
    targetWidth: number,
    targetHeight: number,
    maintainAspectRatio = true
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        let width = targetWidth
        let height = targetHeight

        if (maintainAspectRatio) {
          const aspectRatio = img.naturalWidth / img.naturalHeight
          if (targetWidth / targetHeight > aspectRatio) {
            width = targetHeight * aspectRatio
          } else {
            height = targetWidth / aspectRatio
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        // Use high quality scaling
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        resolve(canvas.toDataURL('image/png'))
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUrl
    })
  }
}

// Export singleton instance
export const imageGenerationService = new ImageGenerationService()
export default imageGenerationService
