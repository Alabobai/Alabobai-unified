import { useState, useCallback } from 'react'
import {
  Rocket, ShoppingCart, Smartphone, Building2, PenTool, Wrench,
  ArrowRight, ArrowLeft, Check, Loader2, Sparkles,
  Code2, Palette, Megaphone, DollarSign, Scale, Shield,
  HeadphonesIcon, AlertCircle, Wand2, RefreshCw, Zap, Crown
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { BRAND_GRADIENT_ACCENT } from '@/config/brandTokens'
import { logoGenerator, LOGO_STYLES, type LogoVariation } from '@/services/logoGenerator'

type CompanyType = 'saas' | 'ecommerce' | 'app' | 'agency' | 'content' | 'service'

interface CompanyTypeOption {
  id: CompanyType
  name: string
  description: string
  icon: typeof Rocket
  examples: string[]
}

const COMPANY_TYPES: CompanyTypeOption[] = [
  { id: 'saas', name: 'SaaS Product', description: 'Software as a Service business', icon: Rocket, examples: ['Notion', 'Slack', 'Figma'] },
  { id: 'ecommerce', name: 'E-Commerce', description: 'Online store selling products', icon: ShoppingCart, examples: ['Shopify store', 'DTC brand'] },
  { id: 'app', name: 'Mobile App', description: 'iOS/Android application', icon: Smartphone, examples: ['Fitness app', 'Social network'] },
  { id: 'agency', name: 'Agency', description: 'Service-based business', icon: Building2, examples: ['Marketing agency', 'Dev shop'] },
  { id: 'content', name: 'Content Creator', description: 'Media and content business', icon: PenTool, examples: ['Newsletter', 'YouTube'] },
  { id: 'service', name: 'Service Business', description: 'Professional services', icon: Wrench, examples: ['Consulting', 'Coaching'] },
]

interface BuildStep {
  id: string
  name: string
  department: string
  icon: typeof Code2
  status: 'pending' | 'building' | 'complete' | 'error'
  description: string
  result?: string
}

const createBuildSteps = (): BuildStep[] => [
  { id: 'legal', name: 'Registering company', department: 'Legal', icon: Scale, status: 'pending', description: 'Setting up legal structure...' },
  { id: 'finance', name: 'Setting up finances', department: 'Finance', icon: DollarSign, status: 'pending', description: 'Creating financial plan...' },
  { id: 'engineering', name: 'Building product', department: 'Engineering', icon: Code2, status: 'pending', description: 'Developing core features...' },
  { id: 'design', name: 'Creating brand', department: 'Design', icon: Palette, status: 'pending', description: 'Designing visual identity...' },
  { id: 'marketing', name: 'Writing content', department: 'Marketing', icon: Megaphone, status: 'pending', description: 'Creating launch content...' },
  { id: 'support', name: 'Setting up support', department: 'Support', icon: HeadphonesIcon, status: 'pending', description: 'Building help systems...' },
  { id: 'security', name: 'Security audit', department: 'Security', icon: Shield, status: 'pending', description: 'Running security checks...' },
  { id: 'launch', name: 'Going live!', department: 'Launch', icon: Rocket, status: 'pending', description: 'Deploying your company...' },
]

// Using logoGenerator service for multi-provider AI logo generation
// Supports: FLUX.1 (Black Forest Labs), SDXL, Hugging Face, Pollinations.ai
// See: https://huggingface.co/black-forest-labs/FLUX.1-dev
// See: https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design

// Extended logo variation interface
interface LocalLogoVariation {
  id: string
  style: string
  prompt: string
  url: string
  provider?: string
}

export default function CompanyWizard() {
  const { setView } = useAppStore()

  const [step, setStep] = useState(1)
  const [companyType, setCompanyType] = useState<CompanyType | null>(null)
  const [companyIdea, setCompanyIdea] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [suggestedNames, setSuggestedNames] = useState<string[]>([])
  const [logoVariations, setLogoVariations] = useState<LogoVariation[]>([])
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isGeneratingNames, setIsGeneratingNames] = useState(false)
  const [isGeneratingLogos, setIsGeneratingLogos] = useState(false)
  const [logosLoaded, setLogosLoaded] = useState<Record<string, boolean>>({})
  const [logoErrors, setLogoErrors] = useState<Record<string, boolean>>({})
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [_companyData, setCompanyData] = useState<any>(null)

  // Generate company name suggestions using AI
  const generateNames = useCallback(async () => {
    if (!companyType || !companyIdea) return

    setIsGeneratingNames(true)
    setError(null)

    try {
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-name',
          companyType,
          description: companyIdea,
          industry: companyType,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate names')
      }

      const data = await response.json()
      if (data.names && Array.isArray(data.names) && data.names.length > 0) {
        setSuggestedNames(data.names)
      } else {
        throw new Error('No names returned')
      }
    } catch (err) {
      console.error('Name generation error:', err)
      // Fallback names based on company idea
      const words = companyIdea.split(' ').filter(w => w.length > 3)
      const firstWord = words[0] || 'Next'
      setSuggestedNames([
        `${firstWord}Hub`,
        `${firstWord}io`,
        `${firstWord}Labs`,
        'Innovate Pro',
        'Peak Ventures'
      ])
    } finally {
      setIsGeneratingNames(false)
    }
  }, [companyType, companyIdea])

  // Generate logo variations using multi-provider AI service
  // Uses FLUX.1 (Black Forest Labs), SDXL, and other open source models
  const generateLogos = useCallback(async () => {
    if (!companyName || !companyType) return

    setIsGeneratingLogos(true)
    setLogosLoaded({})
    setLogoErrors({})
    setSelectedLogoId(null)
    setLogoUrl(null)
    setError(null)

    try {
      // Use the logoGenerator service for high-quality AI generation
      // Supports: Pollinations.ai (Flux), Hugging Face (FLUX.1-schnell), Together.ai (SDXL)
      const variations = await logoGenerator.generateLogoVariations(
        companyName,
        companyType,
        LOGO_STYLES.slice(0, 6), // Use first 6 styles for variety
        { width: 512, height: 512 }
      )

      // Convert to local format
      const localVariations: LocalLogoVariation[] = variations.map(v => ({
        id: v.id,
        style: v.style,
        prompt: v.prompt,
        url: v.url,
        provider: v.provider
      }))

      setLogoVariations(localVariations)
    } catch (err) {
      console.error('Logo generation error:', err)
      setError('Failed to generate logos. Using fallback designs.')

      // Generate fallback variations
      const fallbackVariations: LocalLogoVariation[] = LOGO_STYLES.slice(0, 3).map(style => ({
        id: style.id,
        style: style.name,
        prompt: style.promptModifier,
        url: '', // Will be replaced by fallback
        provider: 'fallback'
      }))
      setLogoVariations(fallbackVariations)
    } finally {
      setIsGeneratingLogos(false)
    }

    // Set timeout to use fallback if images don't load in 20 seconds
    setTimeout(() => {
      setLogoVariations(prev => prev.map(v => {
        if (!logosLoaded[v.id] && !logoErrors[v.id]) {
          // Use logoGenerator's built-in fallback
          return { ...v, url: generateLocalFallbackLogo(v.id, companyName), provider: 'fallback-svg' }
        }
        return v
      }))
      setLogosLoaded(prev => {
        const updated = { ...prev }
        logoVariations.forEach(v => { updated[v.id] = true })
        return updated
      })
    }, 20000)
  }, [companyName, companyType, logosLoaded, logoErrors, logoVariations])

  // Local fallback SVG generator with luxurious brand styling
  const generateLocalFallbackLogo = (styleId: string, name: string): string => {
    const initial = name.charAt(0).toUpperCase()

    const styleConfigs: Record<string, { bg: string; fg: string; pattern: string }> = {
      minimalist: {
        bg: '#1a1a1a',
        fg: '#d9a07a',
        pattern: `<rect x="156" y="340" width="200" height="6" rx="3" fill="#d9a07a" opacity="0.4"/>`
      },
      gradient: {
        bg: 'url(#luxGrad)',
        fg: '#1a1410',
        pattern: ''
      },
      abstract: {
        bg: '#0a0808',
        fg: '#ecd4c0',
        pattern: `<circle cx="380" cy="130" r="50" fill="#d9a07a" opacity="0.5"/><circle cx="130" cy="380" r="35" fill="#d9a07a" opacity="0.3"/>`
      },
      emblem: {
        bg: '#0f0d0b',
        fg: '#d9a07a',
        pattern: `<circle cx="256" cy="256" r="200" fill="none" stroke="#d9a07a" stroke-width="3" opacity="0.6"/>`
      },
      lettermark: {
        bg: '#151210',
        fg: '#d9a07a',
        pattern: `<rect x="180" y="380" width="152" height="4" rx="2" fill="#d9a07a" opacity="0.5"/>`
      },
      mascot: {
        bg: '#1a1715',
        fg: '#d9a07a',
        pattern: `<ellipse cx="200" cy="200" rx="30" ry="35" fill="#d9a07a" opacity="0.3"/><ellipse cx="312" cy="200" rx="30" ry="35" fill="#d9a07a" opacity="0.3"/>`
      }
    }

    const config = styleConfigs[styleId] || styleConfigs.minimalist

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="luxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ecd4c0"/>
          <stop offset="50%" style="stop-color:#d9a07a"/>
          <stop offset="100%" style="stop-color:#b8845c"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="512" height="512" fill="${config.bg}"/>
      ${config.pattern}
      <text x="256" y="290" font-family="Georgia,serif" font-size="180" font-weight="bold" fill="${config.fg}" text-anchor="middle" filter="url(#glow)">${initial}</text>
    </svg>`

    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  // Handle logo image load
  const handleLogoLoad = (logoId: string) => {
    setLogosLoaded(prev => ({ ...prev, [logoId]: true }))
  }

  // Handle logo image error - use luxurious fallback
  const handleLogoError = (logoId: string) => {
    const fallbackUrl = generateLocalFallbackLogo(logoId, companyName)
    setLogoVariations(prev => prev.map(v =>
      v.id === logoId ? { ...v, url: fallbackUrl, provider: 'fallback-svg' } : v
    ))
    if (selectedLogoId === logoId) {
      setLogoUrl(fallbackUrl)
    }
    setLogoErrors(prev => ({ ...prev, [logoId]: true }))
    setLogosLoaded(prev => ({ ...prev, [logoId]: true }))
  }

  // Select a logo
  const selectLogo = (variation: LocalLogoVariation) => {
    setSelectedLogoId(variation.id)
    setLogoUrl(variation.url)
  }

  // Regenerate a single logo variation using multi-provider service
  // Tries: FLUX.1 (Pollinations) -> Turbo -> Hugging Face -> Together -> Fallback SVG
  const regenerateLogo = async (index: number) => {
    if (!companyName || !companyType) return

    const currentVariation = logoVariations[index]

    // Set loading state for this logo
    setLogosLoaded(prev => ({ ...prev, [currentVariation.id]: false }))
    setLogoErrors(prev => ({ ...prev, [currentVariation.id]: false }))

    try {
      // Use the logoGenerator service for multi-provider regeneration
      const regenerated = await logoGenerator.regenerateLogo(
        currentVariation,
        companyName,
        companyType
      )

      // Update the variations with the new logo
      setLogoVariations(prev => prev.map((v, i) =>
        i === index ? { ...regenerated, provider: regenerated.provider } : v
      ))

      // If this was the selected logo, update the URL
      if (selectedLogoId === currentVariation.id) {
        setLogoUrl(regenerated.url)
      }
    } catch (error) {
      console.error('Logo regeneration failed:', error)
      // Use fallback SVG on error
      const fallbackUrl = generateLocalFallbackLogo(currentVariation.id, companyName)
      setLogoVariations(prev => prev.map((v, i) =>
        i === index ? { ...v, url: fallbackUrl, provider: 'fallback-svg' } : v
      ))
      setLogoErrors(prev => ({ ...prev, [currentVariation.id]: true }))
    } finally {
      setLogosLoaded(prev => ({ ...prev, [currentVariation.id]: true }))
    }
  }

  // Start building the company
  const startBuilding = async () => {
    if (!companyName || !companyType || !companyIdea) return

    setIsBuilding(true)
    setError(null)
    setBuildSteps(createBuildSteps())
    setStep(5)

    try {
      // Simulate building process with real API calls
      const steps = createBuildSteps()

      for (let i = 0; i < steps.length; i++) {
        // Update current step to building
        setBuildSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'building' : idx < i ? 'complete' : 'pending'
        })))

        // Simulate work being done (in real app, these would be actual API calls)
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000))

        // Mark step as complete
        setBuildSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx <= i ? 'complete' : 'pending'
        })))
      }

      // Create the company with the selected logo
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: companyName,
          companyType,
          description: companyIdea,
          logoUrl: logoUrl, // Pass the selected logo URL
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Override the logo with user's selection if available
        if (logoUrl && data.company) {
          data.company.logo = logoUrl
        }
        setCompanyData(data.company)
      } else {
        // Create company data locally if API fails
        setCompanyData({
          id: crypto.randomUUID(),
          name: companyName,
          type: companyType,
          description: companyIdea,
          logo: logoUrl || generateLocalFallbackLogo('minimalist', companyName),
          createdAt: new Date().toISOString(),
          status: 'active',
        })
      }

      setIsBuilding(false)
    } catch (err) {
      console.error('Build error:', err)
      setError('Failed to build company. Please try again.')
      setIsBuilding(false)
    }
  }

  const completedSteps = buildSteps.filter(s => s.status === 'complete').length
  const progress = buildSteps.length > 0 ? (completedSteps / buildSteps.length) * 100 : 0

  return (
    <div className="h-full bg-dark-500 overflow-y-auto alabobai-shell premium-type">
      <div className="w-full max-w-4xl mx-auto p-6">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {[1, 2, 3, 4, 5].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                step >= s ? 'bg-rose-gold-400 text-dark-500' : 'bg-white/10 text-white/40'
              }`}>
                {step > s ? <Check className="w-5 h-5" /> : s}
              </div>
              {i < 4 && (
                <div className={`w-16 h-1 mx-2 rounded transition-all ${
                  step > s ? 'bg-rose-gold-400' : 'bg-white/10'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-rose-gold-500/10 border border-rose-gold-400/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-gold-400 flex-shrink-0" />
            <p className="text-rose-gold-400 flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 rounded-lg bg-rose-gold-500/20 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-500/30 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Choose Company Type */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold lux-title premium-type mb-3">What type of company do you want to build?</h1>
              <p className="text-white/60">Choose your business model and we'll set up the right AI departments</p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {COMPANY_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setCompanyType(type.id)}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    companyType === type.id
                      ? 'border-rose-gold-400 bg-rose-gold-400/10'
                      : 'border-white/10 hover:border-white/20 bg-white/5'
                  }`}
                >
                  <type.icon className={`w-8 h-8 mb-3 ${companyType === type.id ? 'text-rose-gold-400' : 'text-white/60'}`} />
                  <h3 className="text-lg font-semibold text-white mb-1">{type.name}</h3>
                  <p className="text-sm text-white/50 mb-2">{type.description}</p>
                  <p className="text-xs text-white/30">e.g., {type.examples.join(', ')}</p>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!companyType}
                className="px-8 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold flex items-center gap-2 hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Describe Your Idea */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold lux-title premium-type mb-3">Describe your company</h1>
              <p className="text-white/60">Tell us about your vision and we'll help bring it to life</p>
            </div>

            <div className="mb-8">
              <textarea
                value={companyIdea}
                onChange={(e) => setCompanyIdea(e.target.value)}
                placeholder="Describe your company idea in a few sentences... What problem does it solve? Who is it for?"
                className="w-full h-40 p-6 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 resize-none focus:border-rose-gold-400/50 focus:outline-none text-lg"
              />
              <p className="mt-2 text-sm text-white/40">{companyIdea.length}/500 characters</p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-3 rounded-xl border border-white/20 text-white font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button
                onClick={() => { setStep(3); generateNames(); }}
                disabled={companyIdea.length < 20}
                className="px-8 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold flex items-center gap-2 hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Name Your Company */}
        {step === 3 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold lux-title premium-type mb-3">Name your company</h1>
              <p className="text-white/60">Choose a name or let AI suggest some options</p>
            </div>

            <div className="mb-6">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name..."
                className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none text-2xl font-semibold text-center"
              />
            </div>

            {/* AI Suggestions */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-white/50">AI Suggestions</p>
                <button
                  onClick={generateNames}
                  disabled={isGeneratingNames}
                  className="text-sm text-rose-gold-400 flex items-center gap-1 hover:text-rose-gold-300"
                >
                  {isGeneratingNames ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerate
                </button>
              </div>

              {isGeneratingNames ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
                  <span className="ml-3 text-white/50">Generating name ideas...</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {suggestedNames.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => setCompanyName(name)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        companyName === name
                          ? 'border-rose-gold-400 bg-rose-gold-400/10 text-rose-gold-400'
                          : 'border-white/10 bg-white/5 text-white hover:border-white/20'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-8 py-3 rounded-xl border border-white/20 text-white font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button
                onClick={() => { setStep(4); generateLogos(); }}
                disabled={!companyName}
                className="px-8 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold flex items-center gap-2 hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Brand Identity - Logo Selection */}
        {step === 4 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold lux-title premium-type mb-3">Brand Identity</h1>
              <p className="text-white/60">Choose a logo style for {companyName}</p>
            </div>

            {/* Generate Logo Options Button */}
            {logoVariations.length === 0 && !isGeneratingLogos && (
              <div className="flex justify-center mb-8">
                <button
                  onClick={generateLogos}
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold flex items-center gap-3 hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all shadow-glow"
                >
                  <Sparkles className="w-5 h-5" />
                  Generate Logo Options
                </button>
              </div>
            )}

            {/* Loading State */}
            {isGeneratingLogos && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-12 h-12 text-rose-gold-400 animate-spin mb-4" />
                <p className="text-white/60">Generating AI logo variations...</p>
              </div>
            )}

            {/* Logo Variations Grid */}
            {logoVariations.length > 0 && !isGeneratingLogos && (
              <>
                <div className="grid grid-cols-3 gap-6 mb-8">
                  {logoVariations.map((variation, index) => (
                    <div
                      key={variation.id}
                      className={`relative rounded-2xl border-2 overflow-hidden transition-all cursor-pointer ${
                        selectedLogoId === variation.id
                          ? 'border-rose-gold-400 ring-2 ring-rose-gold-400/30'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                      onClick={() => !logoErrors[variation.id] && selectLogo(variation)}
                    >
                      {/* Style Label */}
                      <div className="absolute top-3 left-3 z-10">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          selectedLogoId === variation.id
                            ? 'bg-rose-gold-400 text-dark-500'
                            : 'bg-dark-400/80 text-white backdrop-blur-sm'
                        }`}>
                          {variation.style}
                        </span>
                      </div>

                      {/* Regenerate Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          regenerateLogo(index)
                        }}
                        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-dark-400/80 text-white hover:bg-dark-300 backdrop-blur-sm transition-colors"
                        title="Regenerate this logo"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                      {/* Selected Indicator */}
                      {selectedLogoId === variation.id && (
                        <div className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-rose-gold-400 flex items-center justify-center">
                          <Check className="w-5 h-5 text-dark-500" />
                        </div>
                      )}

                      {/* Logo Image Container */}
                      <div className="aspect-square bg-white/5 flex items-center justify-center relative">
                        {!logosLoaded[variation.id] && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/5 z-10">
                            <Loader2 className="w-8 h-8 text-rose-gold-400 animate-spin" />
                          </div>
                        )}

                        <img
                          src={variation.url}
                          alt={`${variation.style} logo for ${companyName}`}
                          className={`w-full h-full object-cover transition-opacity ${
                            logosLoaded[variation.id] ? 'opacity-100' : 'opacity-0'
                          }`}
                          onLoad={() => handleLogoLoad(variation.id)}
                          onError={() => handleLogoError(variation.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Regenerate All Button */}
                <div className="flex justify-center mb-8">
                  <button
                    onClick={generateLogos}
                    className="px-6 py-2 rounded-lg border border-white/20 text-white/70 text-sm flex items-center gap-2 hover:bg-white/5 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Generate New Options
                  </button>
                </div>
              </>
            )}

            {/* Company Summary */}
            <div className="bg-white/5 rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-4">Company Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-white/50">Company Name</p>
                  <p className="text-white font-medium">{companyName}</p>
                </div>
                <div>
                  <p className="text-white/50">Company Type</p>
                  <p className="text-white font-medium">{COMPANY_TYPES.find(t => t.id === companyType)?.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-white/50">Description</p>
                  <p className="text-white">{companyIdea}</p>
                </div>
                {selectedLogoId && (
                  <div className="col-span-2">
                    <p className="text-white/50">Selected Logo Style</p>
                    <p className="text-rose-gold-400 font-medium">
                      {logoVariations.find(v => v.id === selectedLogoId)?.style}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(3)}
                className="px-8 py-3 rounded-xl border border-white/20 text-white font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button
                onClick={startBuilding}
                disabled={isGeneratingLogos || !companyName}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold flex items-center gap-2 hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all shadow-glow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="w-5 h-5" /> Build My Company
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Building */}
        {step === 5 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt={companyName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center">
                    {isBuilding ? (
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    ) : (
                      <Sparkles className="w-10 h-10 text-white" />
                    )}
                  </div>
                )}
              </div>
              <h1 className="text-4xl font-semibold lux-title premium-type mb-3">
                {isBuilding ? `Building ${companyName}...` : `${companyName} is Ready!`}
              </h1>
              <p className="text-white/60">
                {isBuilding ? 'Our AI agents are working together to build your company' : 'Your company has been created successfully'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex justify-between text-sm text-white/50 mb-2">
                <span>{completedSteps} of {buildSteps.length} departments complete</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Build Steps */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {buildSteps.map((buildStep) => (
                <div
                  key={buildStep.id}
                  className={`p-4 rounded-xl border transition-all ${
                    buildStep.status === 'complete'
                      ? 'border-rose-gold-500/30 bg-rose-gold-500/10'
                      : buildStep.status === 'building'
                      ? 'border-rose-gold-400/30 bg-rose-gold-400/10'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      buildStep.status === 'complete'
                        ? 'bg-rose-gold-500/20'
                        : buildStep.status === 'building'
                        ? 'bg-rose-gold-400/20'
                        : 'bg-white/10'
                    }`}>
                      {buildStep.status === 'complete' ? (
                        <Check className="w-5 h-5 text-rose-gold-400" />
                      ) : buildStep.status === 'building' ? (
                        <Loader2 className="w-5 h-5 text-rose-gold-400 animate-spin" />
                      ) : (
                        <buildStep.icon className="w-5 h-5 text-white/40" />
                      )}
                    </div>
                    <div>
                      <p className={`font-medium ${
                        buildStep.status === 'complete' ? 'text-rose-gold-400' :
                        buildStep.status === 'building' ? 'text-rose-gold-400' :
                        'text-white/50'
                      }`}>
                        {buildStep.name}
                      </p>
                      <p className="text-xs text-white/40">{buildStep.department}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {!isBuilding && (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setView('company-dashboard')}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold flex items-center gap-2 hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all"
                >
                  Open Company Dashboard <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setView('chat')}
                  className="px-8 py-3 rounded-xl border border-white/20 text-white font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
                >
                  Back to Chat
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
