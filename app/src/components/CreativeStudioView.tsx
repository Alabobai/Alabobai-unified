/**
 * Creative Studio View Component
 * AI-powered creative content generation with real image generation
 * Features:
 * - Image generation using Pollinations.ai (free)
 * - Canvas-based image editor
 * - Template library
 * - Gallery with local storage
 * - AI prompt suggestions
 * - Export options
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import {
  Palette, Image, FileText, Type, Wand2, Download, Copy,
  RefreshCw, Loader2, CheckCircle2, Sparkles, Grid,
  PenTool, Layout, Mail, ShoppingBag, MessageSquare,
  Zap, Trash2, ExternalLink, AlertCircle, X, ChevronDown, Film,
  Plus, Edit3, Share2, Lightbulb, Bookmark, Clock, Filter,
  SlidersHorizontal, Heart, MoreHorizontal, Shuffle, Save,
  Expand, FolderOpen, Star, Layers, Maximize2
} from 'lucide-react'
import { aiService } from '@/services/ai'
import {
  imageGenerationService,
  IMAGE_STYLES,
  IMAGE_SIZES,
  IMAGE_MODELS,
  STYLE_MODIFIERS,
  PROMPT_SUGGESTIONS,
  NEGATIVE_PROMPT_PRESETS,
  type GeneratedImage as ImageGenResult,
  type ImageStyle,
  type ImageSize,
  type ImageModel
} from '@/services/imageGeneration'
import { generateVideo as generateVideoService } from '@/services/mediaGeneration'
import { BRAND } from '@/config/brand'

// Lazy load heavy components
const ImageEditor = lazy(() => import('./ImageEditor'))
const TemplateLibrary = lazy(() => import('./TemplateLibrary'))

// Types
interface GeneratedImage {
  id: string
  prompt: string
  style: string
  url: string
  width: number
  height: number
  model: string
  createdAt: Date
  status: 'generating' | 'complete' | 'error'
  error?: string
  seed?: number
  isFavorite?: boolean
}

interface GeneratedVideo {
  id: string
  prompt: string
  url: string
  durationSeconds: number
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

type TabType = 'images' | 'video' | 'content' | 'design' | 'gallery' | 'templates'

export default function CreativeStudioView() {
  const [activeTab, setActiveTab] = useState<TabType>('images')

  // Image generation state
  const [imagePrompt, setImagePrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<ImageStyle>(IMAGE_STYLES[0])
  const [selectedSize, setSelectedSize] = useState<ImageSize>(IMAGE_SIZES[0])
  const [selectedModel, setSelectedModel] = useState<ImageModel>(IMAGE_MODELS[0])
  const [negativePrompt, setNegativePrompt] = useState('')
  const [selectedNegativePresets, setSelectedNegativePresets] = useState<string[]>(['quality'])
  const [enhancePrompt, setEnhancePrompt] = useState(true)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [showPromptSuggestions, setShowPromptSuggestions] = useState(false)
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([])

  // Video generation state
  const [videoPrompt, setVideoPrompt] = useState('')
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([])
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)

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

  // Gallery state
  const [galleryImages, setGalleryImages] = useState<GeneratedImage[]>([])
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'favorites'>('all')
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<GeneratedImage | null>(null)

  // Editor state
  const [showEditor, setShowEditor] = useState(false)
  const [editingImage, setEditingImage] = useState<string | null>(null)

  // Template state
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)

  // Notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)

  // Load gallery from local storage
  useEffect(() => {
    const saved = imageGenerationService.getGallery()
    if (saved.length > 0) {
      setGalleryImages(saved.map(img => ({
        ...img,
        status: 'complete' as const
      })))
    }
  }, [])

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

    // Build prompt with modifiers
    let fullPrompt = imagePrompt
    if (selectedModifiers.length > 0) {
      const modifierValues = selectedModifiers
        .map(id => STYLE_MODIFIERS.find(m => m.id === id)?.value)
        .filter(Boolean)
      fullPrompt += ', ' + modifierValues.join(', ')
    }

    // Build negative prompt
    let fullNegativePrompt = negativePrompt
    if (selectedNegativePresets.length > 0) {
      const presetValues = imageGenerationService.buildNegativePrompt(selectedNegativePresets)
      fullNegativePrompt = fullNegativePrompt
        ? `${fullNegativePrompt}, ${presetValues}`
        : presetValues
    }

    const newImage: GeneratedImage = {
      id: crypto.randomUUID(),
      prompt: fullPrompt,
      style: selectedStyle.name,
      url: '',
      width: selectedSize.width,
      height: selectedSize.height,
      model: selectedModel.name,
      createdAt: new Date(),
      status: 'generating'
    }

    setGeneratedImages(prev => [newImage, ...prev])

    try {
      const result = await imageGenerationService.generateImage({
        prompt: fullPrompt,
        style: selectedStyle,
        size: selectedSize,
        negativePrompt: fullNegativePrompt,
        enhance: enhancePrompt,
        model: selectedModel
      })

      const updatedImage: GeneratedImage = {
        ...newImage,
        url: result.url,
        seed: result.seed,
        status: 'complete'
      }

      setGeneratedImages(prev =>
        prev.map(i => i.id === newImage.id ? updatedImage : i)
      )

      // Save to gallery
      imageGenerationService.saveToGallery({
        ...result,
        id: newImage.id
      })
      setGalleryImages(prev => [updatedImage, ...prev])

      setNotification({ type: 'success', message: 'Image generated successfully!' })
    } catch (error) {
      setGeneratedImages(prev =>
        prev.map(i => i.id === newImage.id
          ? { ...i, status: 'error', error: error instanceof Error ? error.message : 'Failed to generate image' }
          : i)
      )
      setNotification({ type: 'error', message: 'Failed to generate image' })
    } finally {
      setIsGeneratingImage(false)
    }
  }, [imagePrompt, selectedStyle, selectedSize, selectedModel, negativePrompt, selectedNegativePresets, enhancePrompt, selectedModifiers])

  // Generate video using media generation service with fallbacks
  const generateVideo = useCallback(async () => {
    if (!videoPrompt.trim()) return
    setIsGeneratingVideo(true)

    const newVideo: GeneratedVideo = {
      id: crypto.randomUUID(),
      prompt: videoPrompt,
      url: '',
      durationSeconds: 4,
      createdAt: new Date(),
      status: 'generating',
    }

    setGeneratedVideos(prev => [newVideo, ...prev])

    try {
      // Use the self-healing media generation service
      const result = await generateVideoService({
        prompt: videoPrompt,
        width: 512,
        height: 512,
        duration: 4,
        fps: 16
      })

      setGeneratedVideos(prev =>
        prev.map(v =>
          v.id === newVideo.id
            ? { ...v, status: 'complete', url: result.url, durationSeconds: 4 }
            : v
        )
      )
      setNotification({ type: 'success', message: `Video generated via ${result.provider}!` })
    } catch (error) {
      setGeneratedVideos(prev =>
        prev.map(v => v.id === newVideo.id
          ? { ...v, status: 'error', error: error instanceof Error ? error.message : 'Failed to generate video' }
          : v)
      )
      setNotification({ type: 'error', message: 'Failed to generate video. Trying fallback providers...' })
    } finally {
      setIsGeneratingVideo(false)
    }
  }, [videoPrompt])

  // Generate abstract art
  const generateAbstractArt = useCallback((artStyle: 'geometric' | 'flow' | 'particles' | 'waves' | 'gradient') => {
    const dataUrl = imageGenerationService.generateAbstractArt(
      selectedSize.width,
      selectedSize.height,
      artStyle
    )

    const newImage: GeneratedImage = {
      id: crypto.randomUUID(),
      prompt: `Abstract ${artStyle} art`,
      style: 'Abstract',
      url: dataUrl,
      width: selectedSize.width,
      height: selectedSize.height,
      model: 'Algorithm',
      createdAt: new Date(),
      status: 'complete'
    }

    setGeneratedImages(prev => [newImage, ...prev])
    setGalleryImages(prev => [newImage, ...prev])
    setNotification({ type: 'success', message: 'Abstract art generated!' })
  }, [selectedSize])

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
    const paletteMap: Record<string, string[]> = {
      'Modern & Clean': ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE'],
      'Vibrant & Bold': ['#DC2626', '#F97316', '#FACC15', '#22C55E', '#8B5CF6'],
      'Pastel & Soft': ['#FCA5A5', '#FDBA74', '#FDE047', '#86EFAC', '#A5B4FC'],
      'Dark & Moody': ['#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF'],
      'Nature Inspired': ['#166534', '#22C55E', '#4ADE80', '#86EFAC', '#DCFCE7'],
      'Retro & Vintage': ['#B45309', '#D97706', '#F59E0B', '#FBBF24', '#FDE68A'],
      'Minimalist': ['#18181B', '#3F3F46', '#71717A', '#A1A1AA', '#E4E4E7'],
      'Luxury & Elegant': ['#1C1917', '#44403C', '#78716C', '#D6D3D1', '#F5F5F4']
    }
    return paletteMap[paletteTheme] || ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
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
  const downloadImage = async (image: GeneratedImage, format: 'png' | 'jpg' | 'webp' = 'png') => {
    try {
      await imageGenerationService.downloadImage(
        image.url,
        `creative-studio-${image.id.slice(0, 8)}`,
        format
      )
      setNotification({ type: 'success', message: 'Image downloaded!' })
    } catch {
      setNotification({ type: 'error', message: 'Failed to download image' })
    }
  }

  // Copy image to clipboard
  const copyImageToClipboard = async (url: string) => {
    try {
      await imageGenerationService.copyToClipboard(url)
      setNotification({ type: 'success', message: 'Image copied to clipboard!' })
    } catch {
      setNotification({ type: 'error', message: 'Failed to copy image' })
    }
  }

  // Share image (generate data URL)
  const shareImage = async (image: GeneratedImage) => {
    try {
      const dataUrl = await imageGenerationService.generateShareUrl(image.url)
      await navigator.clipboard.writeText(dataUrl)
      setNotification({ type: 'success', message: 'Share URL copied!' })
    } catch {
      setNotification({ type: 'error', message: 'Failed to generate share URL' })
    }
  }

  // Toggle favorite
  const toggleFavorite = (imageId: string) => {
    setGalleryImages(prev =>
      prev.map(img =>
        img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img
      )
    )
    setGeneratedImages(prev =>
      prev.map(img =>
        img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img
      )
    )
  }

  // Delete image
  const deleteImage = (id: string) => {
    setGeneratedImages(prev => prev.filter(i => i.id !== id))
    setGalleryImages(prev => prev.filter(i => i.id !== id))
    imageGenerationService.removeFromGallery(id)
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

  // Open image in editor
  const openInEditor = (imageUrl: string) => {
    setEditingImage(imageUrl)
    setShowEditor(true)
  }

  // Handle template selection
  const handleTemplateSelect = (template: { width: number; height: number; name: string }) => {
    // Find matching size or create custom
    const matchingSize = IMAGE_SIZES.find(
      s => s.width === template.width && s.height === template.height
    )
    if (matchingSize) {
      setSelectedSize(matchingSize)
    }
    setShowTemplateLibrary(false)
    setActiveTab('images')
    setNotification({ type: 'success', message: `Template "${template.name}" applied!` })
  }

  // Get random prompt
  const getRandomPrompt = () => {
    setImagePrompt(imageGenerationService.getRandomPrompt())
  }

  // Render tabs
  const renderTabs = () => (
    <div className="flex gap-1 p-1 bg-white/5 rounded-xl overflow-x-auto">
      {[
        { id: 'images', name: 'Image Gen', icon: Image },
        { id: 'video', name: 'Video Gen', icon: Film },
        { id: 'content', name: 'Content', icon: FileText },
        { id: 'design', name: 'Design Tools', icon: Palette },
        { id: 'templates', name: 'Templates', icon: Layout },
        { id: 'gallery', name: 'Gallery', icon: Grid }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as TabType)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <tab.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{tab.name}</span>
        </button>
      ))}
    </div>
  )

  // Render Video Tab
  const renderVideoTab = () => (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      <div className="lg:w-80 space-y-4">
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Film className="w-4 h-4 text-rose-gold-400" />
            Video Prompt
          </h3>
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder="Describe the video scene you want to generate..."
            className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
          />
        </div>
        <button
          onClick={generateVideo}
          disabled={!videoPrompt.trim() || isGeneratingVideo}
          className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <span className="flex items-center justify-center gap-2">
            {isGeneratingVideo ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                Generate Video
              </>
            )}
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto morphic-scrollbar">
        {generatedVideos.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4">
                <Film className="w-10 h-10 text-rose-gold-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Local Video Generation</h2>
              <p className="text-white/50 text-sm max-w-md">
                Uses your configured local/open-source video inference backend.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {generatedVideos.map(video => (
              <div key={video.id} className="morphic-card rounded-xl overflow-hidden">
                <div className="relative aspect-square bg-white/5">
                  {video.status === 'generating' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
                    </div>
                  )}
                  {video.status === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center px-3">
                        <AlertCircle className="w-8 h-8 text-rose-gold-400 mx-auto mb-2" />
                        <p className="text-xs text-rose-gold-400">{video.error}</p>
                      </div>
                    </div>
                  )}
                  {video.status === 'complete' && video.url && (
                    video.url.startsWith('data:image/')
                      ? <img src={video.url} alt={video.prompt} className="w-full h-full object-cover" />
                      : <video src={video.url} className="w-full h-full object-cover" controls playsInline />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm text-white truncate">{video.prompt}</p>
                  <p className="text-xs text-white/40">{video.durationSeconds}s</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Render Image Generation Tab
  const renderImageTab = () => (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Controls */}
      <div className="lg:w-80 space-y-4 overflow-y-auto morphic-scrollbar max-h-full">
        {/* Prompt input */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-rose-gold-400" />
            Image Prompt
          </h3>
          <div className="relative">
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
            />
            <div className="absolute bottom-2 right-2 flex gap-1">
              <button
                onClick={getRandomPrompt}
                className="p-1.5 bg-white/10 rounded hover:bg-white/20 transition-colors"
                title="Random prompt"
              >
                <Shuffle className="w-3 h-3 text-white/60" />
              </button>
              <button
                onClick={() => setShowPromptSuggestions(!showPromptSuggestions)}
                className="p-1.5 bg-white/10 rounded hover:bg-white/20 transition-colors"
                title="Prompt suggestions"
              >
                <Lightbulb className="w-3 h-3 text-white/60" />
              </button>
            </div>
          </div>

          {/* Enhance prompt toggle */}
          <div className="flex items-center justify-between mt-3">
            <label className="text-xs text-white/60 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Auto-enhance prompt
            </label>
            <button
              onClick={() => setEnhancePrompt(!enhancePrompt)}
              className={`w-10 h-5 rounded-full transition-colors ${
                enhancePrompt ? 'bg-rose-gold-400' : 'bg-white/20'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                enhancePrompt ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Prompt suggestions dropdown */}
        {showPromptSuggestions && (
          <div className="morphic-card p-4 rounded-xl">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Prompt Ideas
            </h3>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {PROMPT_SUGGESTIONS.slice(0, 4).map(category => (
                <div key={category.category}>
                  <span className="text-[10px] text-rose-gold-400/70">{category.category}</span>
                  <div className="space-y-1 mt-1">
                    {category.suggestions.slice(0, 2).map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setImagePrompt(suggestion)
                          setShowPromptSuggestions(false)
                        }}
                        className="w-full text-left text-xs text-white/60 hover:text-white p-1.5 rounded hover:bg-white/5 transition-colors line-clamp-1"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Style modifiers */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-rose-gold-400" />
            Style Modifiers
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_MODIFIERS.slice(0, 8).map(modifier => (
              <button
                key={modifier.id}
                onClick={() => {
                  setSelectedModifiers(prev =>
                    prev.includes(modifier.id)
                      ? prev.filter(id => id !== modifier.id)
                      : [...prev, modifier.id]
                  )
                }}
                className={`px-2 py-1 rounded text-[10px] transition-all ${
                  selectedModifiers.includes(modifier.id)
                    ? 'bg-rose-gold-400/30 text-rose-gold-400 border border-rose-gold-400/50'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                {modifier.name}
              </button>
            ))}
          </div>
        </div>

        {/* Style Selection */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <PenTool className="w-4 h-4 text-rose-gold-400" />
            Style
          </h3>
          <div className="relative">
            <select
              value={selectedStyle.id}
              onChange={(e) => setSelectedStyle(IMAGE_STYLES.find(s => s.id === e.target.value) || IMAGE_STYLES[0])}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
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

        {/* Model Selection */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-gold-400" />
            AI Model
          </h3>
          <div className="relative">
            <select
              value={selectedModel.id}
              onChange={(e) => setSelectedModel(IMAGE_MODELS.find(m => m.id === e.target.value) || IMAGE_MODELS[0])}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
            >
              {IMAGE_MODELS.map(model => (
                <option key={model.id} value={model.id} className="bg-dark-500">
                  {model.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
          <p className="text-[10px] text-white/40 mt-2">{selectedModel.description}</p>
        </div>

        {/* Size Selection */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Layout className="w-4 h-4 text-rose-gold-400" />
            Size
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {IMAGE_SIZES.slice(0, 6).map(size => (
              <button
                key={size.id}
                onClick={() => setSelectedSize(size)}
                className={`p-2 rounded-lg text-xs transition-all ${
                  selectedSize.id === size.id
                    ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                {size.name}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-2">
            {selectedSize.width} x {selectedSize.height}px ({selectedSize.aspectRatio})
          </p>
        </div>

        {/* Negative Prompts */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <X className="w-4 h-4 text-rose-gold-400" />
            Negative Prompts
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {NEGATIVE_PROMPT_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => {
                  setSelectedNegativePresets(prev =>
                    prev.includes(preset.id)
                      ? prev.filter(id => id !== preset.id)
                      : [...prev, preset.id]
                  )
                }}
                className={`px-2 py-1 rounded text-[10px] transition-all ${
                  selectedNegativePresets.includes(preset.id)
                    ? 'bg-rose-gold-500/20 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Custom negative prompts..."
            className="w-full p-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-xs focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50"
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={generateImage}
          disabled={!imagePrompt.trim() || isGeneratingImage}
          className="w-full morphic-btn bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg"
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

        {/* Abstract Art Generator */}
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Quick Abstract Art
          </h3>
          <div className="grid grid-cols-5 gap-1">
            {(['geometric', 'flow', 'particles', 'waves', 'gradient'] as const).map(style => (
              <button
                key={style}
                onClick={() => generateAbstractArt(style)}
                className="p-2 bg-white/5 rounded-lg text-[9px] text-white/60 hover:bg-white/10 hover:text-white transition-colors capitalize"
                title={`Generate ${style} art`}
              >
                {style.slice(0, 4)}
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
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4">
                <Image className="w-10 h-10 text-rose-gold-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">AI Image Generation</h2>
              <p className="text-white/50 text-sm max-w-md">
                Powered by Pollinations.ai - Create stunning images from text descriptions for free.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {generatedImages.map(image => (
              <div
                key={image.id}
                className="morphic-card rounded-xl overflow-hidden group"
              >
                <div className="relative aspect-square bg-white/5">
                  {image.status === 'generating' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin mx-auto mb-2" />
                        <p className="text-xs text-white/40">Generating with {image.model}...</p>
                      </div>
                    </div>
                  ) : image.status === 'error' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <AlertCircle className="w-8 h-8 text-rose-gold-400 mx-auto mb-2" />
                        <p className="text-xs text-rose-gold-400">{image.error}</p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={image.url}
                      alt={image.prompt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {/* Overlay Actions */}
                  {image.status === 'complete' && (
                    <div className="absolute inset-0 bg-dark-400/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 flex-wrap p-4">
                      <button
                        onClick={() => downloadImage(image)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Download PNG"
                      >
                        <Download className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => copyImageToClipboard(image.url)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => openInEditor(image.url)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Edit image"
                      >
                        <Edit3 className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => shareImage(image)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Get share link"
                      >
                        <Share2 className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={() => toggleFavorite(image.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          image.isFavorite ? 'bg-rose-gold-400/30' : 'bg-white/20 hover:bg-white/30'
                        }`}
                        title="Favorite"
                      >
                        <Heart className={`w-5 h-5 ${image.isFavorite ? 'text-rose-gold-400 fill-current' : 'text-white'}`} />
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
                        className="p-2 bg-rose-gold-500/20 rounded-lg hover:bg-rose-gold-500/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5 text-rose-gold-400" />
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
                  {image.seed && (
                    <button
                      onClick={() => copyToClipboard(image.seed!.toString())}
                      className="text-[10px] text-white/30 hover:text-white/50 mt-1"
                    >
                      Seed: {image.seed}
                    </button>
                  )}
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
        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Type className="w-4 h-4 text-rose-gold-400" />
            Content Type
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => setContentType(type.id as any)}
                className={`p-3 rounded-lg text-left transition-all ${
                  contentType === type.id
                    ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                <type.icon className="w-4 h-4 mb-1" />
                <span className="text-xs font-medium block">{type.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Topic / Subject</h3>
          <textarea
            value={contentTopic}
            onChange={(e) => setContentTopic(e.target.value)}
            placeholder="What should the content be about?"
            className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
          />
        </div>

        <div className="morphic-card p-4 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Tone</h3>
          <div className="relative">
            <select
              value={contentTone}
              onChange={(e) => setContentTone(e.target.value)}
              className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
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
          className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
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
        <div className="morphic-card p-4 rounded-xl">
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
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-rose-gold-400" />
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
                <div className="morphic-card p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-rose-gold-400" />
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
                      <span className="inline-block w-2 h-4 bg-rose-gold-400 animate-pulse ml-1" />
                    )}
                  </div>
                </div>
              )}

              {/* Previous generations */}
              {generatedContent.map(content => (
                <div key={content.id} className="morphic-card p-6 rounded-xl">
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
                        className="p-2 bg-rose-gold-500/10 rounded-lg hover:bg-rose-gold-500/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-rose-gold-400" />
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
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-rose-gold-400" />
          Color Palette Generator
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/60 mb-2 block">Theme</label>
            <div className="relative">
              <select
                value={paletteTheme}
                onChange={(e) => setPaletteTheme(e.target.value)}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
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
            className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50"
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
                      className="p-1 hover:bg-rose-gold-500/20 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-rose-gold-400" />
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
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-dark-400/60 text-white text-[10px] font-mono">
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
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Type className="w-5 h-5 text-rose-gold-400" />
          Font Pairing Suggestions
        </h3>

        <div className="space-y-3">
          {FONT_PAIRINGS.map((pairing, index) => (
            <button
              key={index}
              onClick={() => setSelectedFontPairing(pairing)}
              className={`w-full p-4 rounded-lg text-left transition-all ${
                selectedFontPairing === pairing
                  ? 'bg-rose-gold-400/20 border border-rose-gold-400/30'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40">Pairing #{index + 1}</span>
                {selectedFontPairing === pairing && (
                  <CheckCircle2 className="w-4 h-4 text-rose-gold-400" />
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
            <pre className="text-xs text-white/60 bg-dark-400/50 p-3 rounded overflow-x-auto">
{`@import url('https://fonts.googleapis.com/css2?family=${selectedFontPairing.heading.replace(' ', '+')}&family=${selectedFontPairing.body.replace(' ', '+')}&family=${selectedFontPairing.accent.replace(' ', '+')}&display=swap');`}
            </pre>
            <button
              onClick={() => copyToClipboard(`@import url('https://fonts.googleapis.com/css2?family=${selectedFontPairing.heading.replace(' ', '+')}&family=${selectedFontPairing.body.replace(' ', '+')}&family=${selectedFontPairing.accent.replace(' ', '+')}&display=swap');`)}
              className="mt-2 text-xs text-rose-gold-400 hover:text-rose-gold-300 flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy import
            </button>
          </div>
        )}
      </div>

      {/* Layout Recommendations */}
      <div className="morphic-card p-6 rounded-xl lg:col-span-2">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Layout className="w-5 h-5 text-rose-gold-400" />
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
                    <CheckCircle2 className="w-3 h-3 text-rose-gold-400 flex-shrink-0" />
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

  // Render Templates Tab
  const renderTemplatesTab = () => (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
      </div>
    }>
      <TemplateLibrary
        onSelectTemplate={handleTemplateSelect}
      />
    </Suspense>
  )

  // Render Gallery Tab
  const renderGalleryTab = () => {
    const filteredImages = galleryFilter === 'favorites'
      ? galleryImages.filter(img => img.isFavorite)
      : galleryImages

    return (
      <div className="h-full w-full flex flex-col">
        {/* Gallery Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Grid className="w-5 h-5 text-rose-gold-400" />
              Gallery ({filteredImages.length})
            </h3>
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setGalleryFilter('all')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  galleryFilter === 'all'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGalleryFilter('favorites')}
                className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  galleryFilter === 'favorites'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Heart className="w-3 h-3" />
                Favorites
              </button>
            </div>
          </div>

          {galleryImages.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all images from gallery?')) {
                  imageGenerationService.clearGallery()
                  setGalleryImages([])
                  setNotification({ type: 'success', message: 'Gallery cleared' })
                }
              }}
              className="text-xs text-rose-gold-400 hover:text-rose-gold-400 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          )}
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
          {filteredImages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <FolderOpen className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">
                  {galleryFilter === 'favorites' ? 'No favorite images yet' : 'No images in gallery'}
                </p>
                {galleryFilter === 'all' && (
                  <p className="text-white/30 text-sm mt-1">
                    Generate some images to see them here
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredImages.map(image => (
                <div
                  key={image.id}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-white/5 cursor-pointer"
                  onClick={() => setSelectedGalleryImage(image)}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Favorite indicator */}
                  {image.isFavorite && (
                    <div className="absolute top-2 right-2">
                      <Heart className="w-4 h-4 text-rose-gold-400 fill-current" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-dark-500/90 via-dark-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-xs text-white truncate">{image.prompt}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-white/50">{image.style}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openInEditor(image.url)
                          }}
                          className="p-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
                        >
                          <Edit3 className="w-3 h-3 text-white" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadImage(image)
                          }}
                          className="p-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
                        >
                          <Download className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Image Preview Modal */}
        {selectedGalleryImage && (
          <div
            className="fixed inset-0 bg-dark-500/95 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedGalleryImage(null)}
          >
            <div
              className="max-w-4xl max-h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white truncate max-w-md">
                    {selectedGalleryImage.prompt}
                  </h3>
                  <p className="text-sm text-white/50">
                    {selectedGalleryImage.style} - {selectedGalleryImage.width}x{selectedGalleryImage.height}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFavorite(selectedGalleryImage.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      selectedGalleryImage.isFavorite ? 'bg-rose-gold-400/20' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${selectedGalleryImage.isFavorite ? 'text-rose-gold-400 fill-current' : 'text-white'}`} />
                  </button>
                  <button
                    onClick={() => openInEditor(selectedGalleryImage.url)}
                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <Edit3 className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={() => downloadImage(selectedGalleryImage)}
                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <Download className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={() => copyImageToClipboard(selectedGalleryImage.url)}
                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <Copy className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={() => setSelectedGalleryImage(null)}
                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
              <img
                src={selectedGalleryImage.url}
                alt={selectedGalleryImage.prompt}
                className="max-h-[70vh] rounded-xl object-contain"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* Brand Logo */}
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            {/* View Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center shadow-glow-lg">
                <Palette className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Creative Studio</h2>
                <p className="text-xs text-rose-gold-400/70">AI-powered creative content generation</p>
              </div>
            </div>
          </div>

          {renderTabs()}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === 'images' && renderImageTab()}
        {activeTab === 'video' && renderVideoTab()}
        {activeTab === 'content' && renderContentTab()}
        {activeTab === 'design' && renderDesignTab()}
        {activeTab === 'templates' && renderTemplatesTab()}
        {activeTab === 'gallery' && renderGalleryTab()}
      </div>

      {/* Image Editor Modal */}
      {showEditor && editingImage && (
        <div className="fixed inset-0 bg-dark-500/95 z-50 p-4">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
            </div>
          }>
            <ImageEditor
              imageUrl={editingImage}
              onSave={(dataUrl) => {
                // Save edited image to gallery
                const editedImage: GeneratedImage = {
                  id: crypto.randomUUID(),
                  prompt: 'Edited image',
                  style: 'Custom',
                  url: dataUrl,
                  width: 0,
                  height: 0,
                  model: 'Editor',
                  createdAt: new Date(),
                  status: 'complete'
                }
                setGeneratedImages(prev => [editedImage, ...prev])
                setGalleryImages(prev => [editedImage, ...prev])
                setShowEditor(false)
                setEditingImage(null)
                setNotification({ type: 'success', message: 'Image saved!' })
              }}
              onClose={() => {
                setShowEditor(false)
                setEditingImage(null)
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-xl shadow-xl flex items-center gap-3 animate-slide-in z-50 ${
          notification.type === 'success'
            ? 'bg-rose-gold-400/20 border border-rose-gold-400/30'
            : 'bg-rose-gold-500/20 border border-rose-gold-400/30'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-rose-gold-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-gold-400" />
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
