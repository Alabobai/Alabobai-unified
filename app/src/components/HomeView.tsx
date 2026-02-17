/**
 * HomeView Component
 * Comprehensive dashboard/home view showing platform capabilities and user activity
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Home, Code, Search, Mic, Shield, BarChart3, Palette,
  MessageSquare, Plus, Upload, Sparkles, Clock, ChevronRight,
  Zap, ArrowRight, Lightbulb, Keyboard, ExternalLink,
  CheckCircle, HardDrive, Cloud, Activity,
  Flame, Brain, Rocket,
  Play, Eye, FileText, Settings, Command,
  Image as ImageIcon, Target, Bot,
  type LucideIcon
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useOnboardingStore, useShouldShowOnboarding } from '@/stores/onboardingStore'
import { useActivityStore, useRecentActivities, useUserStats, formatRelativeTime } from '@/stores/activityStore'
import { useProjectStore } from '@/stores/projectStore'
import { aiService } from '@/services/ai'
import { BRAND_GRADIENT_ACCENT, BRAND_TOKENS } from '@/config/brandTokens'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types
// ============================================================================

interface FeatureCard {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  view: string
  gradient: string
  badge?: string
  stats?: { label: string; value: string | number }
  preview?: React.ReactNode
}

interface QuickAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  shortcut?: string
  gradient: string
}

interface Tip {
  id: string
  title: string
  content: string
  link?: string
}

// ============================================================================
// Animated Counter Component
// ============================================================================

function AnimatedCounter({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const startValue = displayValue

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out-cubic)
      const eased = 1 - Math.pow(1 - progress, 3)

      setDisplayValue(Math.floor(startValue + (value - startValue) * eased))

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration])

  return <span>{displayValue.toLocaleString()}</span>
}

// ============================================================================
// Status Indicator Component
// ============================================================================

function StatusIndicator({ status, label }: { status: 'online' | 'offline' | 'degraded'; label: string }) {
  const colors = {
    online: 'bg-rose-gold-300',
    offline: 'bg-rose-gold-700',
    degraded: 'bg-rose-gold-500'
  }

  const tones = {
    online: 'tone-success',
    offline: 'tone-error',
    degraded: 'tone-warning'
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status]} animate-pulse`} />
      <span className={`text-xs ${tones[status]}`}>{label}</span>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function HomeView() {
  const { setView, createChat } = useAppStore()
  const { openOnboarding, hasCompletedOnboarding } = useOnboardingStore()
  const shouldShowOnboarding = useShouldShowOnboarding()
  const recentActivities = useRecentActivities(10)
  const stats = useUserStats()
  const { logActivity, getContinueItems, trackFeatureUsage } = useActivityStore()
  const { projects } = useProjectStore()

  // State
  const [greeting, setGreeting] = useState('')
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [aiProviderStatus, setAiProviderStatus] = useState<'online' | 'offline' | 'degraded'>('online')
  const [storageUsed, setStorageUsed] = useState(0)
  const [showFirstTimeHints, setShowFirstTimeHints] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  // Get time-based greeting
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')

    // Trigger entrance animation
    setTimeout(() => setAnimateIn(true), 100)

    // Track view
    trackFeatureUsage('home')
    logActivity({
      type: 'view_opened',
      title: 'Opened Home Dashboard',
      description: 'Started browsing the platform'
    })
  }, [])

  // Rotate tips
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Check AI provider status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        await aiService.initialize()
        const providers = await aiService.getProviderStatus()

        // Check for premium providers (user's API keys)
        const premiumProviders = ['Gemini', 'OpenAI', 'Anthropic', 'Groq', 'Ollama']
        const hasPremiumProvider = providers.some((p) => premiumProviders.includes(p.name) && p.ready)

        // Check for fallback providers (always available)
        const fallbackProviders = ['Autonomous AI', 'Cloud AI', 'WebLLM', 'Offline']
        const hasFallbackProvider = providers.some((p) => fallbackProviders.includes(p.name) && p.ready)

        if (hasPremiumProvider) {
          setAiProviderStatus('online')
        } else if (hasFallbackProvider) {
          setAiProviderStatus('degraded') // Free APIs available
        } else {
          setAiProviderStatus('offline')
        }
      } catch (error) {
        console.error('[HomeView] AI status check failed:', error)
        // Even on error, fallback providers should work
        setAiProviderStatus('degraded')
      }
    }
    checkStatus()
  }, [])

  // Calculate storage usage
  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        if (usage && quota) {
          setStorageUsed(Math.round((usage / quota) * 100))
        }
      })
    }
  }, [])

  // Show first-time hints for new users
  useEffect(() => {
    if (shouldShowOnboarding || !hasCompletedOnboarding) {
      setShowFirstTimeHints(true)
    }
  }, [shouldShowOnboarding, hasCompletedOnboarding])

  // Feature cards data - Luxury rose-gold styling
  const featureCards: FeatureCard[] = useMemo(() => [
    {
      id: 'code-builder',
      name: 'Code Builder',
      description: 'Build full-stack applications with AI assistance',
      icon: Code,
      view: 'chat',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      badge: 'Popular',
      stats: { label: 'Projects', value: projects?.length || 0 }
    },
    {
      id: 'deep-research',
      name: 'Deep Research',
      description: 'AI-powered web research with real sources',
      icon: Search,
      view: 'deep-research',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      badge: 'NEW',
      stats: { label: 'Research', value: stats.researchCompleted }
    },
    {
      id: 'voice-interface',
      name: 'Voice Interface',
      description: 'Natural voice conversations with AI',
      icon: Mic,
      view: 'voice-interface',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      stats: { label: 'Sessions', value: stats.voiceSessions }
    },
    {
      id: 'financial-guardian',
      name: 'Financial Guardian',
      description: 'AI-powered budget tracking and analysis',
      icon: Shield,
      view: 'financial-guardian',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      badge: 'Finance',
      stats: { label: 'Transactions', value: stats.transactionsLogged }
    },
    {
      id: 'data-analyst',
      name: 'Data Analyst',
      description: 'Visualize and analyze your data with AI',
      icon: BarChart3,
      view: 'data-analyst',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      stats: { label: 'Analysis', value: stats.analysisRuns }
    },
    {
      id: 'creative-studio',
      name: 'Creative Studio',
      description: 'Generate images, content, and designs',
      icon: Palette,
      view: 'creative-studio',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500',
      badge: 'Creative',
      stats: { label: 'Created', value: stats.imagesGenerated }
    }
  ], [projects?.length, stats])

  // Quick actions - Luxury rose-gold styling
  const quickActions: QuickAction[] = useMemo(() => [
    {
      id: 'new-chat',
      label: 'New Chat',
      icon: MessageSquare,
      action: () => {
        createChat()
        setView('chat')
        logActivity({
          type: 'chat_created',
          title: 'Started new chat',
          description: 'Created a new AI conversation'
        })
      },
      shortcut: 'N',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500'
    },
    {
      id: 'new-project',
      label: 'New Project',
      icon: Plus,
      action: () => {
        setView('company-wizard')
        logActivity({
          type: 'project_created',
          title: 'Creating new project',
          description: 'Started project wizard'
        })
      },
      shortcut: 'P',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500'
    },
    {
      id: 'upload-data',
      label: 'Upload Data',
      icon: Upload,
      action: () => {
        setView('data-analyst')
        logActivity({
          type: 'view_opened',
          title: 'Opened Data Analyst',
          description: 'Ready to upload data'
        })
      },
      shortcut: 'U',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500'
    },
    {
      id: 'start-research',
      label: 'Start Research',
      icon: Search,
      action: () => {
        setView('deep-research')
        logActivity({
          type: 'research_started',
          title: 'Started research',
          description: 'Opened Deep Research'
        })
      },
      shortcut: 'R',
      gradient: 'from-rose-gold-300 via-rose-gold-400 to-rose-gold-500'
    }
  ], [createChat, setView, logActivity])

  // Tips data
  const tips: Tip[] = [
    {
      id: '1',
      title: 'Use Voice Commands',
      content: `Try saying "Hey ${BRAND.name}" to activate voice mode for hands-free AI interaction.`,
      link: 'voice-interface'
    },
    {
      id: '2',
      title: 'Keyboard Shortcuts',
      content: 'Press Cmd+K (Mac) or Ctrl+K (Windows) to open the command palette for quick navigation.',
    },
    {
      id: '3',
      title: 'Deep Research',
      content: 'The Deep Research feature searches real web sources and synthesizes information with citations.',
      link: 'deep-research'
    },
    {
      id: '4',
      title: 'Track Your Finances',
      content: 'Use Financial Guardian to import bank statements and get AI-powered spending insights.',
      link: 'financial-guardian'
    },
    {
      id: '5',
      title: 'Generate Images',
      content: 'Creative Studio can generate images, logos, and designs from text descriptions.',
      link: 'creative-studio'
    },
    {
      id: '6',
      title: 'Self-Improving Agents',
      content: 'Deploy autonomous agents that can learn from mistakes and improve over time.',
      link: 'self-annealing'
    }
  ]

  // Continue items
  const continueItems = getContinueItems()

  // Get activity icon component
  const getActivityIcon = (iconName: string) => {
    const icons: Record<string, React.ComponentType<{ className?: string }>> = {
      MessageSquare, MessageCircle: MessageSquare, FolderPlus: Plus,
      FolderOpen: Eye, FilePlus: Plus, Edit: FileText, Search,
      CheckCircle, Image: ImageIcon, Film: Play, Mic, BarChart3, DollarSign: Shield,
      Target, Bot: Brain, Plug: Zap, Settings, Eye, Activity
    }
    return icons[iconName] || Activity
  }

  return (
    <div className="h-full w-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Brand Icon */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Home className="w-6 h-6 text-dark-500" />
            </div>
            <div>
              <h1 className={`text-2xl lux-title transition-all duration-700 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                {greeting}
              </h1>
              <p className={`text-sm lux-subtitle transition-all duration-700 delay-100 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                Welcome to {BRAND.product}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className={`flex items-center gap-6 transition-all duration-700 delay-200 ${animateIn ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                <AnimatedCounter value={stats.projectsCreated} />
              </div>
              <div className="text-xs text-white/40">Projects</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                <AnimatedCounter value={stats.chatsStarted} />
              </div>
              <div className="text-xs text-white/40">Chats</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-right">
              <div className="text-2xl font-bold text-rose-gold-400">
                <AnimatedCounter value={stats.streakDays} />
              </div>
              <div className="text-xs text-white/40 flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-gold-400" />
                Day Streak
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6 space-y-6">
        {/* First-time User Onboarding Prompt */}
        {showFirstTimeHints && (
          <div className={`morphic-card framer-card lux-card depth-2 p-6 rounded-2xl border border-rose-gold-400/30 bg-gradient-to-r from-rose-gold-500/10 to-rose-gold-600/10 transition-all duration-700 delay-300 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center animate-bounce">
                  <Rocket className="w-6 h-6 text-dark-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Welcome to {BRAND.name}!</h3>
                  <p className="text-sm text-white/60">
                    Let us show you around the platform and help you get started.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowFirstTimeHints(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors framer-btn"
                >
                  Skip
                </button>
                <button
                  onClick={openOnboarding}
                  className="morphic-btn bg-gradient-to-r from-rose-gold-500 to-rose-gold-600 text-dark-500 border-0 px-6 py-2 text-sm font-semibold hover:opacity-90"
                >
                  Start Tour
                </button>
              </div>
            </div>

            {/* Progress indicators */}
            <div className="mt-4 flex items-center gap-3">
              <div className="text-xs text-white/40">Progress:</div>
              <div className="flex gap-1">
                {['Profile', 'AI Setup', 'First Project', 'First Chat'].map((step, i) => (
                  <div
                    key={step}
                    className={`px-3 py-1 rounded-full text-xs ${
                      i === 0
                        ? 'bg-rose-gold-500/20 text-rose-gold-400'
                        : 'bg-white/5 text-white/40'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Continue Where You Left Off */}
        {continueItems.length > 0 && (
          <div className={`transition-all duration-700 delay-400 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-rose-gold-400" />
                Continue Where You Left Off
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 morphic-scrollbar">
              {continueItems.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.view as any)}
                  className={`morphic-card framer-card lux-card depth-2 flex-shrink-0 p-4 rounded-xl hover:bg-white/5 transition-all group min-w-[200px]`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-rose-gold-500/20 flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-rose-gold-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-white">{item.title}</div>
                      <div className="text-xs text-white/40">{formatRelativeTime(new Date(item.timestamp))}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className={`transition-all duration-700 delay-500 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-rose-gold-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <button
                key={action.id}
                onClick={action.action}
                className="morphic-card framer-card lux-card depth-2 p-4 rounded-xl group relative overflow-hidden border border-rose-gold-400/20 hover:border-rose-gold-400/40 transition-all"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-10 transition-opacity`} />

                <div className="flex items-center gap-3 relative z-10">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-shadow"
                    style={{ background: BRAND_GRADIENT_ACCENT }}
                  >
                    <action.icon className="w-5 h-5 text-dark-500" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-white">{action.label}</div>
                    {action.shortcut && (
                      <div className="text-xs text-rose-gold-400/60 flex items-center gap-1">
                        <Command className="w-3 h-3" />
                        {action.shortcut}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-gold-400/40 group-hover:text-rose-gold-400 group-hover:translate-x-1 transition-all" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className={`transition-all duration-700 delay-600 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-gold-400" />
            Platform Features
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {featureCards.map((card, i) => (
              <button
                key={card.id}
                onClick={() => {
                  setView(card.view as any)
                  trackFeatureUsage(card.id)
                  logActivity({
                    type: 'view_opened',
                    title: `Opened ${card.name}`,
                    description: card.description,
                    metadata: { view: card.view }
                  })
                }}
                className="morphic-card framer-card lux-card depth-2 p-5 rounded-2xl group relative overflow-hidden text-left border border-rose-gold-400/10 hover:border-rose-gold-400/30 transition-all"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                {/* Badge */}
                {card.badge && (
                  <div
                    className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold text-dark-500"
                    style={{ background: BRAND_TOKENS.gradients.accentSoft }}
                  >
                    {card.badge}
                  </div>
                )}

                {/* Content */}
                <div className="relative z-10">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 shadow-glow-sm group-hover:shadow-glow group-hover:scale-110 transition-all duration-300"
                    style={{ background: BRAND_GRADIENT_ACCENT }}
                  >
                    <card.icon className="w-6 h-6 text-dark-500" />
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-1">{card.name}</h3>
                  <p className="text-sm text-white/50 mb-3 line-clamp-2 home-card-copy">{card.description}</p>

                  {/* Stats */}
                  {card.stats && (
                    <div className="flex items-center justify-between pt-3 border-t border-rose-gold-400/20">
                      <span className="text-xs text-white/40">{card.stats.label}</span>
                      <span className="text-sm font-semibold text-rose-gold-400">
                        <AnimatedCounter value={typeof card.stats.value === 'number' ? card.stats.value : 0} />
                      </span>
                    </div>
                  )}
                </div>

                {/* Hover arrow */}
                <div className="absolute bottom-5 right-5 w-8 h-8 rounded-full bg-rose-gold-400/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-4 h-4 text-rose-gold-400" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Recent Activity Timeline */}
          <div className={`morphic-card framer-card lux-card depth-2 p-5 rounded-2xl transition-all duration-700 delay-700 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-gold-400" />
                Recent Activity
              </h2>
              <button className="text-xs text-rose-gold-400 hover:text-rose-gold-300 framer-btn">
                View All
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto morphic-scrollbar pr-2">
              {recentActivities.length === 0 ? (
                <div className="text-center py-8 premium-empty-state">
                  <Activity className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/40">No recent activity</p>
                  <p className="text-xs text-white/30 mt-1">Start exploring to see your activity here</p>
                </div>
              ) : (
                recentActivities.map((activity) => {
                  const IconComponent = getActivityIcon(activity.icon || 'Activity')
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors framer-card cursor-pointer group"
                      onClick={() => {
                        if (activity.metadata?.view) {
                          setView(activity.metadata.view as any)
                        }
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${activity.color}20` }}
                      >
                        <span style={{ color: activity.color }}>
                          <IconComponent className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{activity.title}</div>
                        <div className="text-xs text-white/40 truncate">{activity.description}</div>
                      </div>
                      <div className="text-xs text-white/30 flex-shrink-0">
                        {formatRelativeTime(activity.timestamp)}
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0" />
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column - Tips & Status */}
          <div className="space-y-4">
            {/* Tips and Tutorials */}
            <div className={`morphic-card framer-card lux-card depth-2 p-5 rounded-2xl transition-all duration-700 delay-800 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-rose-gold-400" />
                  Tips & Tutorials
                </h2>
                <div className="flex gap-1">
                  {tips.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentTipIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === currentTipIndex ? 'bg-rose-gold-400' : 'bg-white/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-rose-gold-500/10 to-rose-gold-600/10 rounded-xl p-4 border border-rose-gold-400/20">
                <h3 className="text-base font-semibold text-white mb-2">
                  {tips[currentTipIndex].title}
                </h3>
                <p className="text-sm text-white/60 mb-3">
                  {tips[currentTipIndex].content}
                </p>
                {tips[currentTipIndex].link && (
                  <button
                    onClick={() => setView(tips[currentTipIndex].link as any)}
                    className="text-xs text-rose-gold-400 hover:text-rose-gold-300 framer-btn flex items-center gap-1"
                  >
                    Try it now <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Keyboard Shortcuts Hint */}
              <div className="mt-4 flex items-center gap-3 p-3 bg-white/5 rounded-lg framer-card">
                <Keyboard className="w-5 h-5 text-white/40" />
                <div className="flex-1">
                  <div className="text-xs text-white/60">Keyboard shortcuts available</div>
                  <div className="text-[10px] text-white/40">Press ? to view all shortcuts</div>
                </div>
              </div>
            </div>

            {/* Platform Status */}
            <div className={`morphic-card framer-card lux-card depth-2 p-5 rounded-2xl transition-all duration-700 delay-900 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-gold-400" />
                Platform Status
              </h2>

              <div className="space-y-3">
                {/* AI Provider Status */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg framer-card">
                  <div className="flex items-center gap-3">
                    <Cloud className="w-5 h-5 text-white/40" />
                    <span className="text-sm text-white/70">AI Provider</span>
                  </div>
                  <StatusIndicator
                    status={aiProviderStatus}
                    label={aiProviderStatus === 'online' ? 'Connected' : aiProviderStatus === 'degraded' ? 'Degraded' : 'Offline'}
                  />
                </div>

                {/* Local Storage */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg framer-card">
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-5 h-5 text-white/40" />
                    <span className="text-sm text-white/70">Local Storage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          storageUsed > 80 ? 'bg-rose-gold-500' : storageUsed > 50 ? 'bg-rose-gold-500' : 'bg-rose-gold-500'
                        }`}
                        style={{ width: `${storageUsed}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/40">{storageUsed}%</span>
                  </div>
                </div>

                {/* Features */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg framer-card">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-rose-gold-400" />
                    <span className="text-sm text-white/70">All Features</span>
                  </div>
                  <span className="text-xs text-rose-gold-400">Available</span>
                </div>
              </div>

              {/* Documentation Link */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <a
                  href="#"
                  className="flex items-center justify-between text-sm text-white/60 hover:text-white transition-colors framer-btn"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    View Documentation
                  </span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
