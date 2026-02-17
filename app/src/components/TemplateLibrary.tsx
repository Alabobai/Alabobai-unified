/**
 * Template Library Component
 * Pre-designed templates for various content types:
 * - Social media (Instagram, Twitter/X, LinkedIn, Facebook)
 * - Presentation slides
 * - Thumbnails
 * - Banners
 */

import { useState } from 'react'
import {
  Layout, Instagram, Twitter, Linkedin, Facebook,
  Youtube, Monitor, Image, PanelTop, Check, X, ChevronRight,
  Presentation, Film, MessageSquare, Mail, ShoppingBag
} from 'lucide-react'

// Template category types
type TemplateCategory = 'social' | 'presentation' | 'thumbnail' | 'banner' | 'marketing'

// Template definition
interface Template {
  id: string
  name: string
  category: TemplateCategory
  platform?: string
  width: number
  height: number
  aspectRatio: string
  preview: string // SVG or data URL
  description: string
  tags: string[]
}

// Pre-defined templates
export const TEMPLATES: Template[] = [
  // Instagram Templates
  {
    id: 'ig-square',
    name: 'Instagram Post',
    category: 'social',
    platform: 'instagram',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    preview: generateTemplatePreview('Instagram Post', 1080, 1080, '#E1306C'),
    description: 'Standard square post for Instagram feed',
    tags: ['instagram', 'social', 'square', 'feed']
  },
  {
    id: 'ig-story',
    name: 'Instagram Story',
    category: 'social',
    platform: 'instagram',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    preview: generateTemplatePreview('Instagram Story', 1080, 1920, '#E1306C'),
    description: 'Vertical format for Instagram Stories',
    tags: ['instagram', 'social', 'vertical', 'story']
  },
  {
    id: 'ig-reel',
    name: 'Instagram Reel',
    category: 'social',
    platform: 'instagram',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    preview: generateTemplatePreview('Instagram Reel', 1080, 1920, '#E1306C'),
    description: 'Cover image for Instagram Reels',
    tags: ['instagram', 'social', 'vertical', 'reel', 'video']
  },
  {
    id: 'ig-carousel',
    name: 'Instagram Carousel',
    category: 'social',
    platform: 'instagram',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    preview: generateTemplatePreview('Instagram Carousel', 1080, 1350, '#E1306C'),
    description: 'Portrait format for carousel posts',
    tags: ['instagram', 'social', 'portrait', 'carousel']
  },

  // Twitter/X Templates
  {
    id: 'twitter-post',
    name: 'Twitter/X Post Image',
    category: 'social',
    platform: 'twitter',
    width: 1200,
    height: 675,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('Twitter Post', 1200, 675, '#1DA1F2'),
    description: 'Image attachment for Twitter/X posts',
    tags: ['twitter', 'x', 'social', 'landscape']
  },
  {
    id: 'twitter-header',
    name: 'Twitter/X Header',
    category: 'banner',
    platform: 'twitter',
    width: 1500,
    height: 500,
    aspectRatio: '3:1',
    preview: generateTemplatePreview('Twitter Header', 1500, 500, '#1DA1F2'),
    description: 'Profile header banner for Twitter/X',
    tags: ['twitter', 'x', 'banner', 'header', 'profile']
  },

  // LinkedIn Templates
  {
    id: 'linkedin-post',
    name: 'LinkedIn Post',
    category: 'social',
    platform: 'linkedin',
    width: 1200,
    height: 627,
    aspectRatio: '1.91:1',
    preview: generateTemplatePreview('LinkedIn Post', 1200, 627, '#0A66C2'),
    description: 'Image for LinkedIn feed posts',
    tags: ['linkedin', 'social', 'professional', 'business']
  },
  {
    id: 'linkedin-banner',
    name: 'LinkedIn Banner',
    category: 'banner',
    platform: 'linkedin',
    width: 1584,
    height: 396,
    aspectRatio: '4:1',
    preview: generateTemplatePreview('LinkedIn Banner', 1584, 396, '#0A66C2'),
    description: 'Profile background banner for LinkedIn',
    tags: ['linkedin', 'banner', 'header', 'profile', 'professional']
  },
  {
    id: 'linkedin-article',
    name: 'LinkedIn Article Cover',
    category: 'social',
    platform: 'linkedin',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('LinkedIn Article', 1920, 1080, '#0A66C2'),
    description: 'Cover image for LinkedIn articles',
    tags: ['linkedin', 'article', 'cover', 'blog']
  },

  // Facebook Templates
  {
    id: 'fb-post',
    name: 'Facebook Post',
    category: 'social',
    platform: 'facebook',
    width: 1200,
    height: 630,
    aspectRatio: '1.91:1',
    preview: generateTemplatePreview('Facebook Post', 1200, 630, '#1877F2'),
    description: 'Image for Facebook feed posts',
    tags: ['facebook', 'social', 'feed']
  },
  {
    id: 'fb-cover',
    name: 'Facebook Cover',
    category: 'banner',
    platform: 'facebook',
    width: 820,
    height: 312,
    aspectRatio: '2.63:1',
    preview: generateTemplatePreview('Facebook Cover', 820, 312, '#1877F2'),
    description: 'Profile or page cover photo',
    tags: ['facebook', 'banner', 'cover', 'header']
  },
  {
    id: 'fb-event',
    name: 'Facebook Event Cover',
    category: 'banner',
    platform: 'facebook',
    width: 1920,
    height: 1005,
    aspectRatio: '1.91:1',
    preview: generateTemplatePreview('Facebook Event', 1920, 1005, '#1877F2'),
    description: 'Cover image for Facebook events',
    tags: ['facebook', 'event', 'banner', 'cover']
  },

  // YouTube Templates
  {
    id: 'yt-thumbnail',
    name: 'YouTube Thumbnail',
    category: 'thumbnail',
    platform: 'youtube',
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('YouTube Thumbnail', 1280, 720, '#FF0000'),
    description: 'Video thumbnail for YouTube',
    tags: ['youtube', 'thumbnail', 'video', 'landscape']
  },
  {
    id: 'yt-banner',
    name: 'YouTube Channel Banner',
    category: 'banner',
    platform: 'youtube',
    width: 2560,
    height: 1440,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('YouTube Banner', 2560, 1440, '#FF0000'),
    description: 'Channel art banner for YouTube',
    tags: ['youtube', 'banner', 'channel', 'header']
  },
  {
    id: 'yt-end-screen',
    name: 'YouTube End Screen',
    category: 'thumbnail',
    platform: 'youtube',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('End Screen', 1920, 1080, '#FF0000'),
    description: 'End screen for YouTube videos',
    tags: ['youtube', 'end screen', 'video', 'outro']
  },

  // Presentation Templates
  {
    id: 'presentation-16-9',
    name: 'Presentation 16:9',
    category: 'presentation',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('Slide 16:9', 1920, 1080, '#6366F1'),
    description: 'Standard widescreen presentation slide',
    tags: ['presentation', 'slide', 'widescreen', 'business']
  },
  {
    id: 'presentation-4-3',
    name: 'Presentation 4:3',
    category: 'presentation',
    width: 1024,
    height: 768,
    aspectRatio: '4:3',
    preview: generateTemplatePreview('Slide 4:3', 1024, 768, '#6366F1'),
    description: 'Classic 4:3 presentation slide',
    tags: ['presentation', 'slide', 'classic', 'business']
  },
  {
    id: 'pitch-deck',
    name: 'Pitch Deck Slide',
    category: 'presentation',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    preview: generateTemplatePreview('Pitch Deck', 1920, 1080, '#8B5CF6'),
    description: 'Slide for investor pitch decks',
    tags: ['presentation', 'pitch', 'startup', 'investor']
  },

  // Marketing Templates
  {
    id: 'email-header',
    name: 'Email Header',
    category: 'marketing',
    width: 600,
    height: 200,
    aspectRatio: '3:1',
    preview: generateTemplatePreview('Email Header', 600, 200, '#10B981'),
    description: 'Header image for email campaigns',
    tags: ['email', 'marketing', 'header', 'newsletter']
  },
  {
    id: 'ad-banner-728',
    name: 'Leaderboard Ad',
    category: 'banner',
    width: 728,
    height: 90,
    aspectRatio: '8:1',
    preview: generateTemplatePreview('Leaderboard', 728, 90, '#F59E0B'),
    description: 'Standard leaderboard ad banner (728x90)',
    tags: ['ad', 'banner', 'leaderboard', 'advertising']
  },
  {
    id: 'ad-banner-300',
    name: 'Medium Rectangle Ad',
    category: 'banner',
    width: 300,
    height: 250,
    aspectRatio: '6:5',
    preview: generateTemplatePreview('Rectangle Ad', 300, 250, '#F59E0B'),
    description: 'Medium rectangle ad banner (300x250)',
    tags: ['ad', 'banner', 'rectangle', 'advertising']
  },
  {
    id: 'blog-featured',
    name: 'Blog Featured Image',
    category: 'thumbnail',
    width: 1200,
    height: 630,
    aspectRatio: '1.91:1',
    preview: generateTemplatePreview('Blog Featured', 1200, 630, '#EC4899'),
    description: 'Featured image for blog posts',
    tags: ['blog', 'featured', 'article', 'content']
  },
  {
    id: 'podcast-cover',
    name: 'Podcast Cover',
    category: 'thumbnail',
    width: 3000,
    height: 3000,
    aspectRatio: '1:1',
    preview: generateTemplatePreview('Podcast Cover', 3000, 3000, '#9333EA'),
    description: 'Cover art for podcasts',
    tags: ['podcast', 'cover', 'square', 'audio']
  },
  {
    id: 'product-social',
    name: 'Product Announcement',
    category: 'marketing',
    width: 1200,
    height: 1200,
    aspectRatio: '1:1',
    preview: generateTemplatePreview('Product', 1200, 1200, '#14B8A6'),
    description: 'Social media product announcement',
    tags: ['product', 'announcement', 'marketing', 'launch']
  }
]

// Generate a simple preview SVG for templates
function generateTemplatePreview(
  text: string,
  width: number,
  height: number,
  accentColor: string
): string {
  const aspectRatio = width / height
  const displayWidth = 200
  const displayHeight = displayWidth / aspectRatio

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg width="${displayWidth}" height="${displayHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${accentColor};stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0.4" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" rx="4"/>
      <rect x="10%" y="10%" width="80%" height="80%" fill="none" stroke="${accentColor}" stroke-width="1" stroke-dasharray="4,4" rx="2"/>
      <text x="50%" y="45%" text-anchor="middle" fill="${accentColor}" font-size="12" font-family="system-ui">${text}</text>
      <text x="50%" y="60%" text-anchor="middle" fill="${accentColor}" font-size="9" font-family="system-ui" opacity="0.7">${width}x${height}</text>
    </svg>
  `)}`
}

// Props
interface TemplateLibraryProps {
  onSelectTemplate: (template: Template) => void
  onClose?: () => void
  selectedCategory?: TemplateCategory
}

// Category info
const CATEGORIES = [
  { id: 'social', name: 'Social Media', icon: MessageSquare, color: 'text-rose-gold-400' },
  { id: 'presentation', name: 'Presentation', icon: Presentation, color: 'text-rose-gold-400' },
  { id: 'thumbnail', name: 'Thumbnails', icon: Image, color: 'text-rose-gold-400' },
  { id: 'banner', name: 'Banners', icon: PanelTop, color: 'text-rose-gold-400' },
  { id: 'marketing', name: 'Marketing', icon: ShoppingBag, color: 'text-rose-gold-400' }
]

// Platform icons
const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  twitter: Twitter,
  linkedin: Linkedin,
  facebook: Facebook,
  youtube: Youtube
}

export default function TemplateLibrary({
  onSelectTemplate,
  onClose,
  selectedCategory: initialCategory
}: TemplateLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>(
    initialCategory || 'all'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  // Filter templates
  const filteredTemplates = TEMPLATES.filter(template => {
    const matchesCategory = activeCategory === 'all' || template.category === activeCategory
    const matchesSearch = searchQuery === '' ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Group by platform for social category
  const groupedByPlatform = activeCategory === 'social'
    ? filteredTemplates.reduce((acc, template) => {
        const platform = template.platform || 'other'
        if (!acc[platform]) acc[platform] = []
        acc[platform].push(template)
        return acc
      }, {} as Record<string, Template[]>)
    : null

  const handleSelect = (template: Template) => {
    setSelectedTemplate(template)
  }

  const handleConfirm = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate)
      onClose?.()
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-500 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center">
            <Layout className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Template Library</h2>
            <p className="text-xs text-white/50">Choose a template to get started</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Categories */}
        <div className="w-56 p-4 border-r border-white/10 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
              activeCategory === 'all'
                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layout className="w-4 h-4" />
            All Templates
            <span className="ml-auto text-xs opacity-60">{TEMPLATES.length}</span>
          </button>

          <div className="pt-2 pb-1">
            <span className="text-[10px] text-white/30 uppercase tracking-wider px-3">
              Categories
            </span>
          </div>

          {CATEGORIES.map(category => {
            const count = TEMPLATES.filter(t => t.category === category.id).length
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id as TemplateCategory)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeCategory === category.id
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <category.icon className={`w-4 h-4 ${activeCategory === category.id ? '' : category.color}`} />
                {category.name}
                <span className="ml-auto text-xs opacity-60">{count}</span>
              </button>
            )
          })}

          {/* Search */}
          <div className="pt-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50"
            />
          </div>
        </div>

        {/* Main content - Templates grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          {filteredTemplates.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Image className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No templates found</p>
              </div>
            </div>
          ) : groupedByPlatform ? (
            // Grouped view for social media
            <div className="space-y-6">
              {Object.entries(groupedByPlatform).map(([platform, templates]) => {
                const PlatformIcon = PLATFORM_ICONS[platform] || Layout
                return (
                  <div key={platform}>
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2 capitalize">
                      <PlatformIcon className="w-4 h-4" />
                      {platform}
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {templates.map(template => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isSelected={selectedTemplate?.id === template.id}
                          onSelect={() => handleSelect(template)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Grid view for other categories
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTemplates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onSelect={() => handleSelect(template)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar - Template details */}
        {selectedTemplate && (
          <div className="w-72 p-4 border-l border-white/10 space-y-4 overflow-y-auto bg-dark-400/30">
            <div className="aspect-video rounded-lg overflow-hidden bg-white/5">
              <img
                src={selectedTemplate.preview}
                alt={selectedTemplate.name}
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white">{selectedTemplate.name}</h3>
              <p className="text-sm text-white/50 mt-1">{selectedTemplate.description}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Dimensions</span>
                <span className="text-white">{selectedTemplate.width} x {selectedTemplate.height}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Aspect Ratio</span>
                <span className="text-white">{selectedTemplate.aspectRatio}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Category</span>
                <span className="text-white capitalize">{selectedTemplate.category}</span>
              </div>
              {selectedTemplate.platform && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Platform</span>
                  <span className="text-white capitalize">{selectedTemplate.platform}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {selectedTemplate.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60"
                >
                  {tag}
                </span>
              ))}
            </div>

            <button
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 py-3 bg-rose-gold-400 text-dark-500 rounded-lg font-semibold hover:bg-rose-gold-300 transition-colors"
            >
              <Check className="w-4 h-4" />
              Use This Template
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Template card component
function TemplateCard({
  template,
  isSelected,
  onSelect
}: {
  template: Template
  isSelected: boolean
  onSelect: () => void
}) {
  const PlatformIcon = template.platform ? PLATFORM_ICONS[template.platform] : null

  return (
    <button
      onClick={onSelect}
      className={`group p-3 rounded-xl border transition-all text-left ${
        isSelected
          ? 'bg-rose-gold-400/20 border-rose-gold-400/50'
          : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="aspect-video rounded-lg overflow-hidden bg-dark-400/50 mb-2">
        <img
          src={template.preview}
          alt={template.name}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{template.name}</h4>
          <p className="text-[10px] text-white/40 mt-0.5">
            {template.width} x {template.height}
          </p>
        </div>
        {PlatformIcon && (
          <PlatformIcon className="w-4 h-4 text-white/40 flex-shrink-0" />
        )}
      </div>

      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-rose-gold-400 flex items-center justify-center">
          <Check className="w-3 h-3 text-dark-500" />
        </div>
      )}
    </button>
  )
}

// Export template data
export { TEMPLATES as templates }
export type { Template, TemplateCategory }
