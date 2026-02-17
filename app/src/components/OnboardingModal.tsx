import { useEffect, useState, useCallback } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Key,
  Cpu,
  Globe,
  Mic,
  Search,
  Code,
  Palette,
  BarChart3,
  Shield,
  Rocket,
  Check,
  ExternalLink,
  ArrowRight,
  Zap,
  Brain,
  Play
} from 'lucide-react'
import {
  useOnboardingStore,
  type OnboardingStep,
  getStepIndex,
  getTotalSteps
} from '@/stores/onboardingStore'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types
// ============================================================================

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  color: string
  delay: number
}

// ============================================================================
// Sub-components
// ============================================================================

function FeatureCard({ icon, title, description, color, delay }: FeatureCardProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      className={`group p-4 rounded-xl bg-dark-400/50 border border-white/10 transition-all duration-500 hover:border-rose-gold-400/40 hover:bg-rose-gold-400/5 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${color}`}
        >
          {icon}
        </div>
        <div>
          <h4 className="text-white font-medium text-sm mb-1">{title}</h4>
          <p className="text-white/50 text-xs leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const steps: OnboardingStep[] = ['welcome', 'ai-setup', 'features-tour', 'get-started']
  const currentIndex = getStepIndex(currentStep)

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
              index < currentIndex
                ? 'bg-rose-gold-400 shadow-glow-sm'
                : index === currentIndex
                ? 'bg-rose-gold-400 animate-pulse shadow-glow-sm'
                : 'bg-white/20'
            }`}
          />
          {index < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 transition-all duration-500 ${
                index < currentIndex ? 'bg-rose-gold-400/50' : 'bg-white/10'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Step Components
// ============================================================================

function WelcomeStep() {
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="text-center py-8 px-4">
      {/* Logo */}
      <div
        className={`relative mx-auto w-24 h-24 mb-8 transition-all duration-700 ${
          showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}
      >
        <img
          src="/logo.png"
          alt={BRAND.name}
          className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(217,160,122,0.5)]"
        />
      </div>

      {/* Welcome Text */}
      <div
        className={`space-y-4 transition-all duration-700 delay-200 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <h2 className="text-3xl font-bold text-white">
          Welcome to{' '}
          <span className="bg-gradient-to-r from-rose-gold-300 to-rose-gold-500 bg-clip-text text-transparent">
            {BRAND.name}
          </span>
        </h2>
        <p className="text-white/60 text-lg max-w-md mx-auto leading-relaxed">
          Your premium AI agent platform for building, researching, and creating with the power of artificial intelligence.
        </p>
      </div>

      {/* Feature highlights */}
      <div
        className={`mt-10 grid grid-cols-3 gap-4 max-w-lg mx-auto transition-all duration-700 delay-400 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {[
          { icon: <Brain className="w-5 h-5" />, label: 'AI Agents' },
          { icon: <Code className="w-5 h-5" />, label: 'Code Builder' },
          { icon: <Search className="w-5 h-5" />, label: 'Deep Research' }
        ].map((item, i) => (
          <div
            key={item.label}
            className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-rose-gold-400/30 hover:bg-rose-gold-400/5 transition-all duration-300"
            style={{ animationDelay: `${600 + i * 100}ms` }}
          >
            <div className="text-rose-gold-400 mb-2 flex justify-center">{item.icon}</div>
            <div className="text-white/70 text-xs">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AISetupStep() {
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const providers = [
    {
      name: 'Groq API',
      icon: <Globe className="w-5 h-5" />,
      description: 'Fast cloud inference with state-of-the-art models',
      badge: 'Recommended',
      color: 'bg-rose-gold-400/20 text-rose-gold-400',
      link: 'https://console.groq.com'
    },
    {
      name: 'Ollama',
      icon: <Cpu className="w-5 h-5" />,
      description: 'Run powerful models locally on your machine',
      badge: 'Local',
      color: 'bg-rose-gold-400/20 text-rose-gold-400',
      link: 'https://ollama.ai'
    },
    {
      name: 'WebLLM',
      icon: <Zap className="w-5 h-5" />,
      description: 'Runs entirely in your browser - no setup needed',
      badge: 'Browser',
      color: 'bg-rose-gold-500/20 text-rose-gold-400',
      link: null
    }
  ]

  return (
    <div className="py-6 px-4">
      {/* Header */}
      <div
        className={`text-center mb-8 transition-all duration-500 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 mb-4">
          <Key className="w-7 h-7 text-rose-gold-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Configure AI Provider</h2>
        <p className="text-white/50 text-sm max-w-md mx-auto">
          Choose how you want to power your AI experience. You can always change this later in Settings.
        </p>
      </div>

      {/* Provider Options */}
      <div className="space-y-3 max-w-lg mx-auto">
        {providers.map((provider, index) => (
          <div
            key={provider.name}
            className={`p-4 rounded-xl bg-dark-400/50 border border-white/10 hover:border-rose-gold-400/30 hover:bg-rose-gold-400/5 transition-all duration-500 cursor-pointer group ${
              showContent ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            }`}
            style={{ transitionDelay: `${150 + index * 100}ms` }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${provider.color} transition-transform duration-300 group-hover:scale-110`}>
                {provider.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-medium">{provider.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${provider.color}`}>
                    {provider.badge}
                  </span>
                </div>
                <p className="text-white/50 text-xs">{provider.description}</p>
              </div>
              {provider.link && (
                <a
                  href={provider.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-lg text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-400/10 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div
        className={`mt-6 p-4 rounded-xl bg-rose-gold-400/5 border border-rose-gold-400/20 max-w-lg mx-auto transition-all duration-500 delay-500 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-rose-gold-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white/70 text-sm">
              <span className="text-rose-gold-400 font-medium">Pro tip:</span> Start with WebLLM for instant access, then upgrade to Groq for faster responses and advanced features.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturesTourStep() {
  const features = [
    {
      icon: <Code className="w-5 h-5 text-white" />,
      title: 'Code Builder',
      description: 'Generate full applications with AI assistance and live preview',
      color: 'bg-gradient-to-br from-rose-gold-300/30 to-rose-gold-500/30'
    },
    {
      icon: <Search className="w-5 h-5 text-white" />,
      title: 'Deep Research',
      description: 'AI-powered research with comprehensive source analysis',
      color: 'bg-gradient-to-br from-rose-gold-400/30 to-rose-gold-600/30'
    },
    {
      icon: <Mic className="w-5 h-5 text-white" />,
      title: 'Voice Interface',
      description: 'Natural conversations with voice input and responses',
      color: 'bg-gradient-to-br from-rose-gold-400/25 to-rose-gold-600/25'
    },
    {
      icon: <Brain className="w-5 h-5 text-white" />,
      title: 'Autonomous Agents',
      description: 'Deploy AI agents that work on complex tasks autonomously',
      color: 'bg-gradient-to-br from-rose-gold-400/35 to-rose-gold-600/35'
    },
    {
      icon: <Palette className="w-5 h-5 text-white" />,
      title: 'Creative Studio',
      description: 'Generate images, content, and creative assets',
      color: 'bg-gradient-to-br from-rose-gold-500/30 to-rose-gold-700/30'
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-white" />,
      title: 'Data Analyst',
      description: 'Analyze data, create visualizations, and extract insights',
      color: 'bg-gradient-to-br from-rose-gold-300/25 to-rose-gold-500/25'
    },
    {
      icon: <Shield className="w-5 h-5 text-white" />,
      title: 'Privacy Fortress',
      description: 'Secure, local-first AI with complete data privacy',
      color: 'bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20'
    },
    {
      icon: <Rocket className="w-5 h-5 text-white" />,
      title: 'Company Builder',
      description: 'Build and manage your AI-powered virtual company',
      color: 'bg-gradient-to-br from-rose-gold-500/25 to-rose-gold-700/25'
    }
  ]

  return (
    <div className="py-4 px-2">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Explore Powerful Features</h2>
        <p className="text-white/50 text-sm">
          Everything you need to supercharge your productivity with AI
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        {features.map((feature, index) => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            color={feature.color}
            delay={100 + index * 75}
          />
        ))}
      </div>
    </div>
  )
}

function GetStartedStep() {
  const [showContent, setShowContent] = useState(false)
  const { completeOnboarding } = useOnboardingStore()

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const quickActions = [
    {
      icon: <Code className="w-5 h-5" />,
      title: 'Build Something',
      description: 'Start a new project with AI assistance',
      action: 'Start coding'
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: 'Research a Topic',
      description: 'Deep dive into any subject',
      action: 'Start researching'
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: 'Chat with AI',
      description: 'Ask anything, get intelligent answers',
      action: 'Start chatting'
    }
  ]

  return (
    <div className="py-8 px-4 text-center">
      {/* Success Icon */}
      <div
        className={`relative mx-auto w-20 h-20 mb-6 transition-all duration-700 ${
          showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 rounded-full animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-br from-rose-gold-400/10 to-rose-gold-600/10 rounded-full flex items-center justify-center border border-rose-gold-400/30">
          <Check className="w-10 h-10 text-rose-gold-400" />
        </div>
      </div>

      {/* Completion Message */}
      <div
        className={`space-y-3 mb-8 transition-all duration-700 delay-200 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <h2 className="text-2xl font-bold text-white">You're All Set!</h2>
        <p className="text-white/60 max-w-md mx-auto">
          You're ready to explore everything {BRAND.name} has to offer. What would you like to do first?
        </p>
      </div>

      {/* Quick Actions */}
      <div
        className={`space-y-3 max-w-md mx-auto mb-8 transition-all duration-700 delay-400 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {quickActions.map((action, index) => (
          <button
            key={action.title}
            onClick={completeOnboarding}
            className="w-full p-4 rounded-xl bg-dark-400/50 border border-white/10 hover:border-rose-gold-400/40 hover:bg-rose-gold-400/5 transition-all duration-300 group text-left flex items-center gap-4"
            style={{ transitionDelay: `${500 + index * 100}ms` }}
          >
            <div className="w-12 h-12 rounded-xl bg-rose-gold-400/20 flex items-center justify-center text-rose-gold-400 group-hover:scale-110 transition-transform duration-300">
              {action.icon}
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium">{action.title}</h4>
              <p className="text-white/50 text-xs">{action.description}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-rose-gold-400 group-hover:translate-x-1 transition-all duration-300" />
          </button>
        ))}
      </div>

      {/* Main CTA */}
      <button
        onClick={completeOnboarding}
        className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold hover:shadow-glow-lg transition-all duration-500 delay-700 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <Play className="w-5 h-5" />
        Get Started
      </button>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function OnboardingModal() {
  const {
    isOnboardingOpen,
    currentStep,
    nextStep,
    previousStep,
    skipOnboarding,
    completeOnboarding
  } = useOnboardingStore()

  const currentIndex = getStepIndex(currentStep)
  const totalSteps = getTotalSteps()
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === totalSteps - 1

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOnboardingOpen) {
      skipOnboarding()
    }
  }, [isOnboardingOpen, skipOnboarding])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOnboardingOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
        onClick={skipOnboarding}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 animate-fade-in">
        {/* Glass morphism container */}
        <div className="relative glass-premium rounded-3xl border border-rose-gold-400/20 shadow-2xl overflow-hidden">
          {/* Decorative gradient */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-gold-400 to-transparent opacity-50" />

          {/* Background glow effects */}
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-rose-gold-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-rose-gold-400/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative flex items-center justify-between px-6 py-4 border-b border-white/10">
            <StepIndicator currentStep={currentStep} />
            <button
              onClick={skipOnboarding}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              title="Skip onboarding"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="relative overflow-y-auto max-h-[calc(90vh-160px)] morphic-scrollbar">
            {currentStep === 'welcome' && <WelcomeStep />}
            {currentStep === 'ai-setup' && <AISetupStep />}
            {currentStep === 'features-tour' && <FeaturesTourStep />}
            {currentStep === 'get-started' && <GetStartedStep />}
          </div>

          {/* Footer */}
          <div className="relative flex items-center justify-between px-6 py-4 border-t border-white/10 bg-dark-400/50">
            {/* Skip button */}
            <button
              onClick={skipOnboarding}
              className="text-white/50 hover:text-white text-sm transition-colors"
            >
              Skip for now
            </button>

            {/* Navigation buttons */}
            <div className="flex items-center gap-3">
              {!isFirstStep && (
                <button
                  onClick={previousStep}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all duration-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}

              {!isLastStep ? (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-medium hover:shadow-glow-sm transition-all duration-300"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={completeOnboarding}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-medium hover:shadow-glow-sm transition-all duration-300"
                >
                  Let's Go!
                  <Rocket className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Feature Tooltip Component (for post-onboarding hints)
// ============================================================================

interface FeatureTooltipProps {
  id: string
  children: React.ReactNode
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function FeatureTooltip({
  id,
  children,
  title,
  description,
  position = 'bottom'
}: FeatureTooltipProps) {
  const { showTooltips, dismissedTooltips, dismissTooltip, hasCompletedOnboarding } = useOnboardingStore()
  const [isVisible, setIsVisible] = useState(false)

  const shouldShow = hasCompletedOnboarding && showTooltips && !dismissedTooltips.includes(id)

  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [shouldShow])

  if (!shouldShow || !isVisible) {
    return <>{children}</>
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-rose-gold-400/30 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-rose-gold-400/30 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-rose-gold-400/30 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-rose-gold-400/30 border-t-transparent border-b-transparent border-l-transparent'
  }

  return (
    <div className="relative inline-block">
      {children}
      <div
        className={`absolute z-50 ${positionClasses[position]} animate-fade-in`}
      >
        <div className="relative p-3 rounded-xl bg-dark-300/95 backdrop-blur-xl border border-rose-gold-400/30 shadow-glow-sm min-w-[200px] max-w-[280px]">
          {/* Arrow */}
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />

          {/* Content */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-gold-400/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-rose-gold-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-medium text-sm mb-1">{title}</h4>
              <p className="text-white/50 text-xs leading-relaxed">{description}</p>
            </div>
            <button
              onClick={() => dismissTooltip(id)}
              className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
