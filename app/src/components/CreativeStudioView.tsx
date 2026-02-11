/**
 * Creative Studio View Component
 * AI-powered creative content generation with real image generation
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Palette, Image, FileText, Type, Wand2, Download, Copy,
  RefreshCw, Loader2, CheckCircle2, Sparkles, Grid,
  PenTool, Layout, Mail, ShoppingBag, MessageSquare,
  Zap, Trash2, ExternalLink, AlertCircle, X, ChevronDown
} from 'lucide-react'
import { aiService } from '@/services/ai'

// Types
interface GeneratedImage {
  id: string
  prompt: string
  style: string
  url: string
  width: number
  height: number
  createdAt: Date
  status: 'generating' | 'complete' | 'error'
  error?: string
}

interface GeneratedContent {
  id: string
  type: 'blog' | 'social' | 'email' | 'product'
  title: string
  content: string
  createdAt: Date
}

interface ColorPalette {
  id: string
  name: string
  colors: string[]
  createdAt: Date
}

interface FontPairing {
  heading: string
  body: string
  accent: string
}

// Image style presets
const IMAGE_STYLES = [
  { id: 'photo', name: 'Photorealistic', prompt: 'photorealistic, high quality, detailed, 8k uhd' },
  { id: 'art', name: 'Digital Art', prompt: 'digital art, vibrant colors, detailed illustration' },
  { id: 'sketch', name: 'Sketch', prompt: 'pencil sketch, hand drawn, artistic sketch style' },
  { id: 'watercolor', name: 'Watercolor', prompt: 'watercolor painting, soft colors, artistic' },
  { id: 'logo', name: 'Logo Design', prompt: 'minimalist logo design, vector style, clean lines' },
  { id: 'anime', name: 'Anime', prompt: 'anime style, japanese animation, vibrant' },
  { id: '3d', name: '3D Render', prompt: '3d render, octane render, volumetric lighting, highly detailed' },
  { id: 'pixel', name: 'Pixel Art', prompt: 'pixel art style, retro game graphics, 16-bit' },
  { id: 'cyberpunk', name: 'Cyberpunk', prompt: 'cyberpunk style, neon lights, futuristic, dark atmosphere' },
  { id: 'fantasy', name: 'Fantasy', prompt: 'fantasy art, magical, ethereal, detailed fantasy illustration' }
]

// Image size presets
const IMAGE_SIZES = [
  { id: 'square', name: 'Square', width: 512, height: 512 },
  { id: 'landscape', name: 'Landscape', width: 768, height: 512 },
  { id: 'portrait', name: 'Portrait', width: 512, height: 768 },
  { id: 'wide', name: 'Wide', width: 1024, height: 512 },
  { id: 'tall', name: 'Tall', width: 512, height: 1024 }
]

// Content type templates
const CONTENT_TYPES = [
  { id: 'blog', name: 'Blog Post', icon: FileText, description: 'Long-form article content' },
  { id: 'social', name: 'Social Media', icon: MessageSquare, description: 'Posts for social platforms' },
  { id: 'email', name: 'Email Template', icon: Mail, description: 'Professional email content' },
  { id: 'product', name: 'Product Description', icon: ShoppingBag, description: 'E-commerce product copy' }
]

// Color palette themes
const PALETTE_THEMES = [
  'Modern & Clean', 'Vibrant & Bold', 'Pastel & Soft', 'Dark & Moody',
  'Nature Inspired', 'Retro & Vintage', 'Minimalist', 'Luxury & Elegant'
]

// Font pairing suggestions
const FONT_PAIRINGS: FontPairing[] = [
  { heading: 'Montserrat', body: 'Open Sans', accent: 'Playfair Display' },
  { heading: 'Roboto', body: 'Lato', accent: 'Roboto Slab' },
  { heading: 'Poppins', body: 'Inter', accent: 'Merriweather' },
  { heading: 'Oswald', body: 'Source Sans Pro', accent: 'Lora' },
  { heading: 'Raleway', body: 'Nunito', accent: 'Crimson Text' },
  { heading: 'Ubuntu', body: 'Cabin', accent: 'Bitter' },
  { heading: 'Work Sans', body: 'IBM Plex Sans', accent: 'Libre Baskerville' },
  { heading: 'DM Sans', body: 'Plus Jakarta Sans', accent: 'Fraunces' }
]

type TabType = 'images' | 'content' | 'design' | 'gallery'

export default function CreativeStudioView() {
  const [activeTab, setActiveTab] = useState<TabType>('images')

  // Image generation state
  const [imagePrompt, setImagePrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState(IMAGE_STYLES[0])
  const [selectedSize, setSelectedSize] = useState(IMAGE_SIZES[0])
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

  // Content generation state
  const [contentType, setContentType] = useState<'blog' | 'social' | 'email' | 'product'>('blog')
  const [contentTopic, setContentTopic] = useState('')
  const [contentTone, setContentTone] = useState('professional')
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([])
  const [isGeneratingContent, setIsGeneratingContent] = useState(false)
  const [currentContent, setCurrentContent] = useState('')

  // Design tools state
  const [palettes, setPalettes] = useState<ColorPalette[]>([])
  const [paletteTheme, setPaletteTheme] = useState(PALETTE_THEMES[0])
  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false)
  const [selectedFontPairing, setSelectedFontPairing] = useState<FontPairing | null>(null)

  // Notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Generate image using Pollinations.ai
  const generateImage = useCallback(async () => {
    if (!imagePrompt.trim()) return

    setIsGeneratingImage(true)

    const fullPrompt = `${imagePrompt}, ${selectedStyle.prompt}`
    const encodedPrompt = encodeURIComponent(fullPrompt)
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${selectedSize.width}&height=${selectedSize.height}&nologo=true&seed=${Date.now()}`

    const newImage: GeneratedImage = {
      id: crypto.randomUUID(),
      prompt: imagePrompt,
      style: selectedStyle.name,
      url: imageUrl,
      width: selectedSize.width,
      height: selectedSize.height,
      createdAt: new Date(),
      status: 'generating'
    }

    setGeneratedImages(prev => [newImage, ...prev])

    // Preload the image to detect when it's ready
    const img = new window.Image()
    img.onload = () => {
      setGeneratedImages(prev =>
        prev.map(i => i.id === newImage.id ? { ...i, status: 'complete' } : i)
      )
      setIsGeneratingImage(false)
      setNotification({ type: 'success', message: 'Image generated successfully!' })
    }
    img.onerror = () => {
      setGeneratedImages(prev =>
        prev.map(i => i.id === newImage.id ? { ...i, status: 'error', error: 'Failed to generate image' } : i)
      )
      setIsGeneratingImage(false)
      setNotification({ type: 'error', message: 'Failed to generate image' })
    }
    img.src = imageUrl
  }, [imagePrompt, selectedStyle, selectedSize])

  // Generate content using AI service
  const generateContent = useCallback(async () => {
    if (!contentTopic.trim()) return

    setIsGeneratingContent(true)
    setCurrentContent('')

    const prompts: Record<string, string> = {
      blog: `Write a comprehensive blog post about "${contentTopic}".
        Tone: ${contentTone}
        Include:
        - An engaging title
        - Introduction that hooks the reader
        - 3-5 main sections with headers
        - Practical examples or tips
        - A conclusion with call to action
        Format in markdown.`,
      social: `Create 5 engaging social media posts about "${contentTopic}".
        Tone: ${contentTone}
        Include:
        - Posts for different platforms (Twitter, LinkedIn, Instagram)
        - Relevant hashtags
        - Call to actions
        - Emoji usage where appropriate
        Format each post clearly separated.`,
      email: `Write a professional email template about "${contentTopic}".
        Tone: ${contentTone}
        Include:
        - Subject line options
        - Greeting
        - Body with clear message
        - Call to action
        - Professional sign-off
        Format clearly with sections.`,
      product: `Write a compelling product description for "${contentTopic}".
        Tone: ${contentTone}
        Include:
        - Attention-grabbing headline
        - Key features and benefits
        - Technical specifications (if applicable)
        - Social proof elements
        - Call to action
        Format for e-commerce use.`
    }

    let fullContent = ''

    try {
      await aiService.chat(
        [{ role: 'user', content: prompts[contentType] }],
        {
          onToken: (token) => {
            fullContent += token
            setCurrentContent(fullContent)
          },
          onComplete: () => {
            const newContent: GeneratedContent = {
              id: crypto.randomUUID(),
              type: contentType,
              title: contentTopic,
              content: fullContent,
              createdAt: new Date()
            }
            setGeneratedContent(prev => [newContent, ...prev])
            setIsGeneratingContent(false)
            setNotification({ type: 'success', message: 'Content generated successfully!' })
          },
          onError: (error) => {
            console.error('Content generation error:', error)
            setIsGeneratingContent(false)
            setNotification({ type: 'error', message: 'Failed to generate content' })
          }
        }
      )
    } catch (error) {
      console.error('Content generation error:', error)
      setIsGeneratingContent(false)
      setNotification({ type: 'error', message: 'Failed to generate content' })
    }
  }, [contentTopic, contentType, contentTone])

  // Generate color palette
  const generateColorPalette = useCallback(async () => {
    setIsGeneratingPalette(true)

    try {
      const response = await aiService.chatSync([
        {
          role: 'user',
          content: `Generate a color palette for "${paletteTheme}" theme.
          Return ONLY a JSON object with this exact format:
          {"name": "Palette Name", "colors": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"]}
          Include exactly 5 colors as hex codes. No other text.`
        }
      ])

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const newPalette: ColorPalette = {
          id: crypto.randomUUID(),
          name: parsed.name || paletteTheme,
          colors: parsed.colors || generateRandomPalette(),
          createdAt: new Date()
        }
        setPalettes(prev => [newPalette, ...prev])
        setNotification({ type: 'success', message: 'Color palette generated!' })
      } else {
        // Fallback to random palette
        const newPalette: ColorPalette = {
          id: crypto.randomUUID(),
          name: paletteTheme,
          colors: generateRandomPalette(),
          createdAt: new Date()
        }
        setPalettes(prev => [newPalette, ...prev])
        setNotification({ type: 'success', message: 'Color palette generated!' })
      }
    } catch (error) {
      console.error('Palette generation error:', error)
      // Generate a random palette as fallback
      const newPalette: ColorPalette = {
        id: crypto.randomUUID(),
        name: paletteTheme,
        colors: generateRandomPalette(),
        createdAt: new Date()
      }
      setPalettes(prev => [newPalette, ...prev])
      setNotification({ type: 'success', message: 'Color palette generated!' })
    }

    setIsGeneratingPalette(false)
  }, [paletteTheme])

  // Generate random palette as fallback
  const generateRandomPalette = (): string[] => {
    const palettes: Record<string, string[]> = {
      'Modern & Clean': ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE'],
      'Vibrant & Bold': ['#DC2626', '#F97316', '#FACC15', '#22C55E', '#8B5CF6'],
      'Pastel & Soft': ['#FCA5A5', '#FDBA74', '#FDE047', '#86EFAC', '#A5B4FC'],
      'Dark & Moody': ['#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF'],
      'Nature Inspired': ['#166534', '#22C55E', '#4ADE80', '#86EFAC', '#DCFCE7'],
      'Retro & Vintage': ['#B45309', '#D97706', '#F59E0B', '#FBBF24', '#FDE68A'],
      'Minimalist': ['#18181B', '#3F3F46', '#71717A', '#A1A1AA', '#E4E4E7'],
      'Luxury & Elegant': ['#1C1917', '#44403C', '#78716C', '#D6D3D1', '#F5F5F4']
    }
    return palettes[paletteTheme] || ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotification({ type: 'success', message: 'Copied to clipboard!' })
    } catch {
      setNotification({ type: 'error', message: 'Failed to copy' })
    }
  }

  // Download image
  const downloadImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `creative-studio-${image.id.slice(0, 8)}.png`
      a.click()
      URL.revokeObjectURL(url)
      setNotification({ type: 'success', message: 'Image downloaded!' })
    } catch {
      setNotification({ type: 'error', message: 'Failed to download image' })
    }
  }

  // Delete image
  const deleteImage = (id: string) => {
    setGeneratedImages(prev => prev.filter(i => i.id !== id))
    setNotification({ type: 'success', message: 'Image deleted' })
  }

  // Delete content
  const deleteContent = (id: string) => {
    setGeneratedContent(prev => prev.filter(c => c.id !== id))
    setNotification({ type: 'success', message: 'Content deleted' })
  }

  // Delete palette
  const deletePalette = (id: string) => {
    setPalettes(prev => prev.filter(p => p.id !== id))
    setNotification({ type: 'success', message: 'Palette deleted' })
  }

  // Render tabs
  const renderTabs = () => (
    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
      {[
        { id: 'images', name: 'Image Gen', icon: Image },
        { id: 'content', name: 'Content', icon: FileText },
        { id: 'design', name: 'Design Tools', icon: Palette },
        { id: 'gallery', name: 'Gallery', icon: Grid }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as TabType)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <tab.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{tab.name}</span>
        </button>
      ))}
    </div>
  )

  // Render Image Generation Tab
  const renderImageTab = () => (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Controls */}
      <div className="lg:w-80 space-y-4">
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-pink-400" />
            Image Prompt
          </h3>
          <textarea
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            placeholder="Describe the image you want to create..."
            className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm"
          />
        </div>

        {/* Style Selection */}
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <PenTool className="w-4 h-4 text-purple-400" />
            Style
          </h3>
          <div className="relative">
            <select
              value={selectedStyle.id}
              onChange={(e) => setSelectedStyle(IMAGE_STYLES.find(s => s.id === e.target.value) || IMAGE_STYLES[0])}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm"
            >
              {IMAGE_STYLES.map(style => (
                <option key={style.id} value={style.id} className="bg-dark-500">
                  {style.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
        </div>

        {/* Size Selection */}
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Layout className="w-4 h-4 text-blue-400" />
            Size
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {IMAGE_SIZES.map(size => (
              <button
                key={size.id}
                onClick={() => setSelectedSize(size)}
                className={`p-2 rounded-lg text-xs transition-all ${
                  selectedSize.id === size.id
                    ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                {size.name}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-2">
            {selectedSize.width} x {selectedSize.height}px
          </p>
        </div>

        {/* Generate Button */}
        <button
          onClick={generateImage}
          disabled={!imagePrompt.trim() || isGeneratingImage}
          className="w-full glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <span className="flex items-center justify-center gap-2">
            {isGeneratingImage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 group-hover:animate-bounce" />
                Generate Image
              </>
            )}
          </span>
        </button>

        {/* Quick Prompts */}
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Quick Prompts
          </h3>
          <div className="space-y-2">
            {[
              'A futuristic city at sunset',
              'Cute robot reading a book',
              'Abstract geometric patterns',
              'Cozy coffee shop interior'
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => setImagePrompt(prompt)}
                className="w-full text-left text-xs text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generated Images */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar">
        {generatedImages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-400/20 to-purple-600/20 border border-pink-400/30 flex items-center justify-center mx-auto mb-4">
                <Image className="w-10 h-10 text-pink-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">AI Image Generation</h2>
              <p className="text-white/50 text-sm max-w-md">
                Describe any image and let AI create it for you. Try different styles for unique results.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {generatedImages.map(image => (
              <div
                key={image.id}
                className="glass-card rounded-xl overflow-hidden group"
              >
                <div className="relative aspect-square bg-white/5">
                  {image.status === 'generating' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
                    </div>
                  ) : image.status === 'error' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                        <p className="text-xs text-red-400">{image.error}</p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={image.url}
                      alt={image.prompt}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Overlay Actions */}
                  {image.status === 'complete' && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        onClick={() => downloadImage(image)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Download"
                      >
                        <Download className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => window.open(image.url, '_blank')}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => deleteImage(image.id)}
                        className="p-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm text-white truncate">{image.prompt}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-white/40">{image.style}</span>
                    <span className="text-xs text-white/40">
                      {image.width}x{image.height}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Render Content Generation Tab
  const renderContentTab = () => (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Controls */}
      <div className="lg:w-80 space-y-4">
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Type className="w-4 h-4 text-blue-400" />
            Content Type
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => setContentType(type.id as any)}
                className={`p-3 rounded-lg text-left transition-all ${
                  contentType === type.id
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                <type.icon className="w-4 h-4 mb-1" />
                <span className="text-xs font-medium block">{type.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Topic / Subject</h3>
          <textarea
            value={contentTopic}
            onChange={(e) => setContentTopic(e.target.value)}
            placeholder="What should the content be about?"
            className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
          />
        </div>

        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Tone</h3>
          <div className="relative">
            <select
              value={contentTone}
              onChange={(e) => setContentTone(e.target.value)}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            >
              <option value="professional" className="bg-dark-500">Professional</option>
              <option value="casual" className="bg-dark-500">Casual & Friendly</option>
              <option value="formal" className="bg-dark-500">Formal</option>
              <option value="humorous" className="bg-dark-500">Humorous</option>
              <option value="inspirational" className="bg-dark-500">Inspirational</option>
              <option value="technical" className="bg-dark-500">Technical</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={generateContent}
          disabled={!contentTopic.trim() || isGeneratingContent}
          className="w-full glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <span className="flex items-center justify-center gap-2">
            {isGeneratingContent ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 group-hover:animate-bounce" />
                Generate Content
              </>
            )}
          </span>
        </button>

        {/* Quick Topics */}
        <div className="glass-card p-4 rounded-xl">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Popular Topics
          </h3>
          <div className="space-y-2">
            {[
              'AI and the future of work',
              'Sustainable business practices',
              'Remote team productivity',
              'Digital marketing trends'
            ].map(topic => (
              <button
                key={topic}
                onClick={() => setContentTopic(topic)}
                className="w-full text-left text-xs text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Preview */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div ref={contentRef} className="flex-1 overflow-y-auto morphic-scrollbar">
          {!currentContent && !isGeneratingContent && generatedContent.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400/20 to-cyan-600/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">AI Content Generator</h2>
                <p className="text-white/50 text-sm max-w-md">
                  Generate blog posts, social media content, emails, and product descriptions with AI.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Current generation */}
              {(currentContent || isGeneratingContent) && (
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-400" />
                      {isGeneratingContent ? 'Generating...' : 'Generated Content'}
                    </h3>
                    {currentContent && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(currentContent)}
                          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                          title="Copy"
                        >
                          <Copy className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-white/80 text-sm font-sans">
                      {currentContent || 'Starting generation...'}
                    </pre>
                    {isGeneratingContent && (
                      <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
                    )}
                  </div>
                </div>
              )}

              {/* Previous generations */}
              {generatedContent.map(content => (
                <div key={content.id} className="glass-card p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{content.title}</h3>
                      <span className="text-xs text-white/40 capitalize">{content.type}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(content.content)}
                        className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => deleteContent(content.id)}
                        className="p-2 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap text-white/80 text-sm font-sans">
                    {content.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // Render Design Tools Tab
  const renderDesignTab = () => (
    <div className="grid lg:grid-cols-2 gap-6 h-full overflow-y-auto morphic-scrollbar p-4">
      {/* Color Palette Generator */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-pink-400" />
          Color Palette Generator
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/60 mb-2 block">Theme</label>
            <div className="relative">
              <select
                value={paletteTheme}
                onChange={(e) => setPaletteTheme(e.target.value)}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm"
              >
                {PALETTE_THEMES.map(theme => (
                  <option key={theme} value={theme} className="bg-dark-500">
                    {theme}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={generateColorPalette}
            disabled={isGeneratingPalette}
            className="w-full glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50"
          >
            {isGeneratingPalette ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Generate Palette
              </span>
            )}
          </button>

          {/* Generated Palettes */}
          <div className="space-y-3 mt-4">
            {palettes.map(palette => (
              <div key={palette.id} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white">{palette.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(palette.colors.join(', '))}
                      className="p-1 hover:bg-white/10 rounded"
                      title="Copy colors"
                    >
                      <Copy className="w-3 h-3 text-white/60" />
                    </button>
                    <button
                      onClick={() => deletePalette(palette.id)}
                      className="p-1 hover:bg-red-500/20 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 rounded-lg overflow-hidden">
                  {palette.colors.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => copyToClipboard(color)}
                      className="flex-1 h-12 transition-transform hover:scale-105 group relative"
                      style={{ backgroundColor: color }}
                      title={color}
                    >
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 text-white text-[10px] font-mono">
                        {color}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Font Pairing Suggestions */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Type className="w-5 h-5 text-blue-400" />
          Font Pairing Suggestions
        </h3>

        <div className="space-y-3">
          {FONT_PAIRINGS.map((pairing, index) => (
            <button
              key={index}
              onClick={() => setSelectedFontPairing(pairing)}
              className={`w-full p-4 rounded-lg text-left transition-all ${
                selectedFontPairing === pairing
                  ? 'bg-blue-500/20 border border-blue-500/30'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40">Pairing #{index + 1}</span>
                {selectedFontPairing === pairing && (
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold" style={{ fontFamily: pairing.heading }}>
                  {pairing.heading} <span className="text-xs text-white/40 font-normal">(Heading)</span>
                </p>
                <p className="text-white/80 text-sm" style={{ fontFamily: pairing.body }}>
                  {pairing.body} <span className="text-xs text-white/40">(Body)</span>
                </p>
                <p className="text-white/60 text-sm italic" style={{ fontFamily: pairing.accent }}>
                  {pairing.accent} <span className="text-xs text-white/40 not-italic">(Accent)</span>
                </p>
              </div>
            </button>
          ))}
        </div>

        {selectedFontPairing && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg">
            <h4 className="text-sm font-semibold text-white mb-3">CSS Import</h4>
            <pre className="text-xs text-white/60 bg-black/30 p-3 rounded overflow-x-auto">
{`@import url('https://fonts.googleapis.com/css2?family=${selectedFontPairing.heading.replace(' ', '+')}&family=${selectedFontPairing.body.replace(' ', '+')}&family=${selectedFontPairing.accent.replace(' ', '+')}&display=swap');`}
            </pre>
            <button
              onClick={() => copyToClipboard(`@import url('https://fonts.googleapis.com/css2?family=${selectedFontPairing.heading.replace(' ', '+')}&family=${selectedFontPairing.body.replace(' ', '+')}&family=${selectedFontPairing.accent.replace(' ', '+')}&display=swap');`)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy import
            </button>
          </div>
        )}
      </div>

      {/* Layout Recommendations */}
      <div className="glass-card p-6 rounded-xl lg:col-span-2">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Layout className="w-5 h-5 text-green-400" />
          Layout Recommendations
        </h3>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              name: 'Hero Section',
              description: 'Full-width with centered content',
              tips: ['Use large typography', 'Add clear CTA', 'High-contrast background']
            },
            {
              name: 'Feature Grid',
              description: '3-column responsive grid',
              tips: ['Equal spacing', 'Consistent icon size', 'Brief descriptions']
            },
            {
              name: 'Card Layout',
              description: 'Flexible card-based design',
              tips: ['Rounded corners', 'Subtle shadows', 'Consistent padding']
            }
          ].map((layout, index) => (
            <div key={index} className="bg-white/5 rounded-lg p-4">
              <h4 className="text-white font-medium mb-1">{layout.name}</h4>
              <p className="text-xs text-white/50 mb-3">{layout.description}</p>
              <ul className="space-y-1">
                {layout.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-white/60 flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // Render Gallery Tab
  const renderGalleryTab = () => (
    <div className="h-full overflow-y-auto morphic-scrollbar p-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Images Section */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-pink-400" />
            Generated Images ({generatedImages.filter(i => i.status === 'complete').length})
          </h3>

          {generatedImages.filter(i => i.status === 'complete').length === 0 ? (
            <div className="glass-card p-8 rounded-xl text-center">
              <Image className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No images generated yet</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {generatedImages
                .filter(i => i.status === 'complete')
                .map(image => (
                  <div key={image.id} className="glass-card rounded-xl overflow-hidden group">
                    <div className="relative aspect-square">
                      <img
                        src={image.url}
                        alt={image.prompt}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                          onClick={() => downloadImage(image)}
                          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        >
                          <Download className="w-5 h-5 text-white" />
                        </button>
                        <button
                          onClick={() => deleteImage(image.id)}
                          className="p-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                          <Trash2 className="w-5 h-5 text-red-400" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm text-white truncate">{image.prompt}</p>
                      <p className="text-xs text-white/40">{image.style}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Content & Palettes Section */}
        <div className="space-y-6">
          {/* Generated Content */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Generated Content ({generatedContent.length})
            </h3>

            {generatedContent.length === 0 ? (
              <div className="glass-card p-6 rounded-xl text-center">
                <FileText className="w-10 h-10 text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No content generated yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {generatedContent.slice(0, 5).map(content => (
                  <div key={content.id} className="glass-card p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white font-medium truncate flex-1">
                        {content.title}
                      </span>
                      <span className="text-xs text-white/40 capitalize ml-2">{content.type}</span>
                    </div>
                    <p className="text-xs text-white/50 line-clamp-2">
                      {content.content.slice(0, 150)}...
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => copyToClipboard(content.content)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => deleteContent(content.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Color Palettes */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Palette className="w-5 h-5 text-pink-400" />
              Color Palettes ({palettes.length})
            </h3>

            {palettes.length === 0 ? (
              <div className="glass-card p-6 rounded-xl text-center">
                <Palette className="w-10 h-10 text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No palettes generated yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {palettes.slice(0, 5).map(palette => (
                  <div key={palette.id} className="glass-card p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white">{palette.name}</span>
                      <button
                        onClick={() => deletePalette(palette.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex gap-1 rounded overflow-hidden">
                      {palette.colors.map((color, i) => (
                        <div
                          key={i}
                          className="flex-1 h-8 cursor-pointer"
                          style={{ backgroundColor: color }}
                          onClick={() => copyToClipboard(color)}
                          title={`Click to copy: ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center shadow-glow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Creative Studio</h2>
              <p className="text-xs text-white/50">AI-powered creative content generation</p>
            </div>
          </div>

          {renderTabs()}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === 'images' && renderImageTab()}
        {activeTab === 'content' && renderContentTab()}
        {activeTab === 'design' && renderDesignTab()}
        {activeTab === 'gallery' && renderGalleryTab()}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-xl shadow-xl flex items-center gap-3 animate-slide-in ${
          notification.type === 'success'
            ? 'bg-green-500/20 border border-green-500/30'
            : 'bg-red-500/20 border border-red-500/30'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400" />
          )}
          <span className="text-white text-sm">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      )}
    </div>
  )
}
