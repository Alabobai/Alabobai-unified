import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Rocket, ShoppingCart, Smartphone, Building2, PenTool, Wrench,
  ArrowRight, ArrowLeft, Check, Loader2, Sparkles, Globe,
  Code2, Palette, Megaphone, DollarSign, Scale, Shield,
  HeadphonesIcon, AlertCircle, Upload, Wand2, Clock, Image, FileText, X
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

const API_BASE_URL = '/api'
const WS_URL = 'ws://localhost:8888'

interface WebSocketMessage {
  type: 'company:created' | 'agent:started' | 'agent:completed' | 'company:completed' | 'error'
  companyId?: string
  agentId?: string
  agentName?: string
  department?: string
  message?: string
  error?: string
}

type CompanyType = 'saas' | 'ecommerce' | 'app' | 'agency' | 'content' | 'service'
type BrandChoice = 'generate' | 'upload' | 'skip' | null

interface BrandData {
  choice: BrandChoice
  logoFile?: File | null
  logoPreview?: string | null
  selectedGeneratedLogo?: number | null
  brandColors?: string[]
  brandGuideFile?: File | null
}

// Mock generated logos for demo
const GENERATED_LOGOS = [
  { id: 1, gradient: 'from-purple-500 to-pink-500', shape: 'rounded-full' },
  { id: 2, gradient: 'from-blue-500 to-cyan-500', shape: 'rounded-xl' },
  { id: 3, gradient: 'from-orange-500 to-red-500', shape: 'rounded-lg rotate-45' },
]

interface CompanyTypeOption {
  id: CompanyType
  name: string
  description: string
  icon: typeof Rocket
  examples: string[]
}

const COMPANY_TYPES: CompanyTypeOption[] = [
  {
    id: 'saas',
    name: 'SaaS Product',
    description: 'Software as a Service business',
    icon: Rocket,
    examples: ['Notion', 'Slack', 'Figma'],
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    description: 'Online store selling products',
    icon: ShoppingCart,
    examples: ['Shopify store', 'DTC brand', 'Marketplace'],
  },
  {
    id: 'app',
    name: 'Mobile App',
    description: 'iOS/Android application',
    icon: Smartphone,
    examples: ['Fitness app', 'Social network', 'Utility app'],
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'Service-based business',
    icon: Building2,
    examples: ['Marketing agency', 'Dev shop', 'Design studio'],
  },
  {
    id: 'content',
    name: 'Content Creator',
    description: 'Media and content business',
    icon: PenTool,
    examples: ['Newsletter', 'YouTube', 'Course creator'],
  },
  {
    id: 'service',
    name: 'Service Business',
    description: 'Professional services',
    icon: Wrench,
    examples: ['Consulting', 'Coaching', 'Freelance'],
  },
]

interface BuildStep {
  id: string
  name: string
  department: string
  icon: typeof Code2
  status: 'pending' | 'building' | 'complete'
  description: string
}

export default function CompanyWizard() {
  const { setView } = useAppStore()
  const [step, setStep] = useState(1)
  const [companyType, setCompanyType] = useState<CompanyType | null>(null)
  const [companyIdea, setCompanyIdea] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const companyIdRef = useRef<string | null>(null)

  // Brand Identity State
  const [brandData, setBrandData] = useState<BrandData>({
    choice: null,
    logoFile: null,
    logoPreview: null,
    selectedGeneratedLogo: null,
    brandColors: ['#D4A574', '#1A1A1A', '#FFFFFF'],
    brandGuideFile: null,
  })
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false)
  const [showGeneratedLogos, setShowGeneratedLogos] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const brandGuideInputRef = useRef<HTMLInputElement>(null)

  // Handle logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setBrandData(prev => ({
          ...prev,
          logoFile: file,
          logoPreview: reader.result as string,
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  // Handle brand guide upload
  const handleBrandGuideUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setBrandData(prev => ({
        ...prev,
        brandGuideFile: file,
      }))
    }
  }

  // Handle color change
  const handleColorChange = (index: number, color: string) => {
    setBrandData(prev => ({
      ...prev,
      brandColors: prev.brandColors?.map((c, i) => i === index ? color : c) || [],
    }))
  }

  // Generate logo with AI (mock)
  const generateLogo = async () => {
    setIsGeneratingLogo(true)
    setShowGeneratedLogos(false)
    // Simulate AI generation time
    await new Promise(resolve => setTimeout(resolve, 2500))
    setIsGeneratingLogo(false)
    setShowGeneratedLogos(true)
  }

  // Select a generated logo
  const selectGeneratedLogo = (logoId: number) => {
    setBrandData(prev => ({
      ...prev,
      selectedGeneratedLogo: logoId,
    }))
  }

  // Check if brand step can proceed
  const canProceedFromBrand = () => {
    if (!brandData.choice) return false
    if (brandData.choice === 'skip') return true
    if (brandData.choice === 'upload') return !!brandData.logoFile
    if (brandData.choice === 'generate') return !!brandData.selectedGeneratedLogo
    return false
  }

  // Initialize build steps
  const initializeBuildSteps = useCallback((): BuildStep[] => {
    return [
      { id: 'legal', name: 'Registering company', department: 'Legal', icon: Scale, status: 'pending', description: 'Generating incorporation documents...' },
      { id: 'finance', name: 'Setting up finances', department: 'Finance', icon: DollarSign, status: 'pending', description: 'Creating accounting structure...' },
      { id: 'engineering', name: 'Building product', department: 'Engineering', icon: Code2, status: 'pending', description: 'Generating MVP codebase...' },
      { id: 'design', name: 'Creating brand', department: 'Design', icon: Palette, status: 'pending', description: 'Designing logo and brand assets...' },
      { id: 'marketing', name: 'Writing content', department: 'Marketing', icon: Megaphone, status: 'pending', description: 'Creating website copy and launch content...' },
      { id: 'support', name: 'Setting up support', department: 'Support', icon: HeadphonesIcon, status: 'pending', description: 'Building help center and chatbot...' },
      { id: 'security', name: 'Security audit', department: 'Security', icon: Shield, status: 'pending', description: 'Running security checks...' },
      { id: 'launch', name: 'Going live!', department: 'Launch', icon: Rocket, status: 'pending', description: 'Deploying your company...' },
    ]
  }, [])

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data)

      switch (data.type) {
        case 'company:created':
          // Company was created, store the ID and start listening for progress
          if (data.companyId) {
            companyIdRef.current = data.companyId
          }
          break

        case 'agent:started':
          // Update the step status to 'building' based on department
          if (data.department) {
            setBuildSteps(prev => prev.map(s => ({
              ...s,
              status: s.department.toLowerCase() === data.department?.toLowerCase() ? 'building' : s.status
            })))
          }
          break

        case 'agent:completed':
          // Update the step status to 'complete' based on department
          if (data.department) {
            setBuildSteps(prev => prev.map(s => ({
              ...s,
              status: s.department.toLowerCase() === data.department?.toLowerCase() ? 'complete' : s.status
            })))
          }
          break

        case 'company:completed':
          // All agents finished, show success and allow navigation
          setIsBuilding(false)
          setBuildSteps(prev => prev.map(s => ({ ...s, status: 'complete' })))
          break

        case 'error':
          setError(data.error || 'An error occurred during company creation')
          setIsBuilding(false)
          break
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }, [])

  // Connect to WebSocket
  const connectWebSocket = useCallback((companyId: string) => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(`${WS_URL}?companyId=${companyId}`)

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = handleWebSocketMessage

    ws.onerror = (event) => {
      console.error('WebSocket error:', event)
      setError('Connection error. Please try again.')
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }

    wsRef.current = ws
  }, [handleWebSocketMessage])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const startBuilding = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      // Call the real API to create the company
      const response = await fetch(`${API_BASE_URL}/companies/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: companyName,
          type: companyType,
          description: companyIdea,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Failed to create company: ${response.statusText}`)
      }

      const data = await response.json()
      const companyId = data.companyId || data.id

      if (!companyId) {
        throw new Error('No company ID received from API')
      }

      companyIdRef.current = companyId

      // Initialize build steps and transition to building view
      const steps = initializeBuildSteps()
      setBuildSteps(steps)
      setIsBuilding(true)
      setStep(5)

      // Connect to WebSocket for real-time updates
      connectWebSocket(companyId)

    } catch (err) {
      console.error('Error creating company:', err)
      setError(err instanceof Error ? err.message : 'Failed to create company. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    startBuilding()
  }

  return (
    <div className="min-h-screen bg-dark-500 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {[1, 2, 3, 4, 5].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                step >= s
                  ? 'bg-rose-gold-400 text-dark-500'
                  : 'bg-white/10 text-white/40'
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
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400 flex-1">{error}</p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Step 1: Choose Company Type */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                What type of company do you want to build?
              </h1>
              <p className="text-white/60">
                Choose your business model and we'll set up the right AI departments
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {COMPANY_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setCompanyType(type.id)}
                  className={`company-type-card p-6 rounded-2xl border-2 text-left transition-all ${
                    companyType === type.id
                      ? 'bg-rose-gold-400/15 border-rose-gold-400 shadow-glow-lg'
                      : 'bg-white/5 border-white/10 hover:border-rose-gold-400/50'
                  }`}
                >
                  <type.icon className={`w-8 h-8 mb-4 ${
                    companyType === type.id ? 'text-rose-gold-400' : 'text-white/60'
                  }`} />
                  <h3 className="text-lg font-semibold text-white mb-1">{type.name}</h3>
                  <p className="text-sm text-white/50 mb-3">{type.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {type.examples.map((ex, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs">
                        {ex}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!companyType}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Describe Your Idea */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                Describe your company idea
              </h1>
              <p className="text-white/60">
                Tell us what you want to build and our AI will make it happen
              </p>
            </div>

            <div className="max-w-2xl mx-auto mb-8">
              <textarea
                value={companyIdea}
                onChange={(e) => setCompanyIdea(e.target.value)}
                placeholder="Example: I want to build an AI-powered fitness app that creates personalized workout plans based on users' goals, available equipment, and schedule. It should have a subscription model with free and premium tiers..."
                className="w-full h-48 p-6 rounded-2xl bg-white/5 border border-white/20 text-white placeholder-white/30 resize-none focus:border-rose-gold-400 focus:outline-none transition-colors"
              />
              <p className="text-sm text-white/40 mt-2">
                Be as detailed as possible - the more you tell us, the better we can build your company
              </p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={companyIdea.length < 20}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Brand Identity */}
        {step === 3 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                Brand Identity
              </h1>
              <p className="text-white/60">
                Set up your company's visual identity
              </p>
            </div>

            {/* Brand Choice Options */}
            {!brandData.choice && (
              <div className="max-w-3xl mx-auto mb-8">
                <div className="grid grid-cols-3 gap-4">
                  {/* Generate Brand Option */}
                  <button
                    onClick={() => setBrandData(prev => ({ ...prev, choice: 'generate' }))}
                    className="p-6 rounded-2xl border-2 bg-white/5 border-white/10 hover:border-rose-gold-400/50 text-left transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Wand2 className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">Generate Brand for Me</h3>
                    <p className="text-sm text-white/50">
                      AI creates a unique logo and brand identity based on your company
                    </p>
                  </button>

                  {/* Upload Brand Option */}
                  <button
                    onClick={() => setBrandData(prev => ({ ...prev, choice: 'upload' }))}
                    className="p-6 rounded-2xl border-2 bg-white/5 border-white/10 hover:border-rose-gold-400/50 text-left transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">Upload Existing Brand</h3>
                    <p className="text-sm text-white/50">
                      Upload your logo and brand guidelines
                    </p>
                  </button>

                  {/* Skip Option */}
                  <button
                    onClick={() => setBrandData(prev => ({ ...prev, choice: 'skip' }))}
                    className="p-6 rounded-2xl border-2 bg-white/5 border-white/10 hover:border-rose-gold-400/50 text-left transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No Brand Yet</h3>
                    <p className="text-sm text-white/50">
                      Skip for now and add branding later
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Generate Brand Flow */}
            {brandData.choice === 'generate' && (
              <div className="max-w-2xl mx-auto mb-8">
                {!isGeneratingLogo && !showGeneratedLogos && (
                  <div className="text-center">
                    <button
                      onClick={generateLogo}
                      className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:scale-105 transition-transform flex items-center gap-3 mx-auto"
                    >
                      <Sparkles className="w-5 h-5" />
                      Generate Logo Options
                    </button>
                    <p className="text-sm text-white/40 mt-4">
                      AI will create 3 unique logo options based on your company idea
                    </p>
                  </div>
                )}

                {isGeneratingLogo && (
                  <div className="text-center py-12">
                    <div className="relative w-24 h-24 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-spin" style={{ animationDuration: '3s' }} />
                      <div className="absolute inset-2 rounded-full bg-dark-500 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-rose-gold-400 animate-pulse" />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Generating logo...</h3>
                    <p className="text-white/50">AI is crafting unique designs for your brand</p>
                  </div>
                )}

                {showGeneratedLogos && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 text-center">Select your logo</h3>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {GENERATED_LOGOS.map((logo) => (
                        <button
                          key={logo.id}
                          onClick={() => selectGeneratedLogo(logo.id)}
                          className={`p-6 rounded-2xl border-2 transition-all ${
                            brandData.selectedGeneratedLogo === logo.id
                              ? 'bg-rose-gold-400/15 border-rose-gold-400 shadow-glow-lg'
                              : 'bg-white/5 border-white/10 hover:border-rose-gold-400/50'
                          }`}
                        >
                          <div className={`w-20 h-20 mx-auto bg-gradient-to-br ${logo.gradient} ${logo.shape}`} />
                          <p className="text-sm text-white/60 mt-4 text-center">Option {logo.id}</p>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={generateLogo}
                      className="text-sm text-rose-gold-400 hover:text-rose-gold-300 mx-auto block"
                    >
                      Regenerate options
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    setBrandData(prev => ({ ...prev, choice: null, selectedGeneratedLogo: null }))
                    setShowGeneratedLogos(false)
                  }}
                  className="text-sm text-white/40 hover:text-white/60 mt-6 mx-auto block"
                >
                  Choose different option
                </button>
              </div>
            )}

            {/* Upload Brand Flow */}
            {brandData.choice === 'upload' && (
              <div className="max-w-2xl mx-auto mb-8 space-y-6">
                {/* Logo Upload */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-4 mb-4">
                    <Image className="w-6 h-6 text-rose-gold-400" />
                    <div>
                      <h3 className="font-semibold text-white">Logo</h3>
                      <p className="text-sm text-white/50">PNG, SVG, or JPEG (required)</p>
                    </div>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png,.svg,.jpg,.jpeg"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />

                  {brandData.logoPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={brandData.logoPreview}
                        alt="Logo preview"
                        className="w-32 h-32 object-contain rounded-xl bg-white/10 p-2"
                      />
                      <button
                        onClick={() => {
                          setBrandData(prev => ({ ...prev, logoFile: null, logoPreview: null }))
                          if (logoInputRef.current) logoInputRef.current.value = ''
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-400"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full py-8 border-2 border-dashed border-white/20 rounded-xl hover:border-rose-gold-400/50 transition-colors"
                    >
                      <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
                      <p className="text-white/60">Click to upload logo</p>
                    </button>
                  )}
                </div>

                {/* Brand Colors */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-4 mb-4">
                    <Palette className="w-6 h-6 text-rose-gold-400" />
                    <div>
                      <h3 className="font-semibold text-white">Brand Colors</h3>
                      <p className="text-sm text-white/50">Primary, secondary, and accent (optional)</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    {brandData.brandColors?.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleColorChange(i, e.target.value)}
                          className="w-12 h-12 rounded-lg cursor-pointer border-2 border-white/20"
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => handleColorChange(i, e.target.value)}
                          className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white text-sm font-mono focus:border-rose-gold-400 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brand Guide Upload */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-4 mb-4">
                    <FileText className="w-6 h-6 text-rose-gold-400" />
                    <div>
                      <h3 className="font-semibold text-white">Brand Guide</h3>
                      <p className="text-sm text-white/50">PDF document (optional)</p>
                    </div>
                  </div>

                  <input
                    ref={brandGuideInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleBrandGuideUpload}
                    className="hidden"
                  />

                  {brandData.brandGuideFile ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/10">
                      <FileText className="w-5 h-5 text-rose-gold-400" />
                      <span className="text-white flex-1 truncate">{brandData.brandGuideFile.name}</span>
                      <button
                        onClick={() => {
                          setBrandData(prev => ({ ...prev, brandGuideFile: null }))
                          if (brandGuideInputRef.current) brandGuideInputRef.current.value = ''
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => brandGuideInputRef.current?.click()}
                      className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl hover:border-rose-gold-400/50 transition-colors"
                    >
                      <Upload className="w-6 h-6 text-white/40 mx-auto mb-1" />
                      <p className="text-sm text-white/60">Click to upload brand guide</p>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setBrandData(prev => ({ ...prev, choice: null, logoFile: null, logoPreview: null, brandGuideFile: null }))}
                  className="text-sm text-white/40 hover:text-white/60 mx-auto block"
                >
                  Choose different option
                </button>
              </div>
            )}

            {/* Skip confirmation */}
            {brandData.choice === 'skip' && (
              <div className="max-w-md mx-auto mb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-white/60" />
                </div>
                <p className="text-white/60 mb-4">
                  No problem! You can add your brand identity later from the dashboard.
                </p>
                <button
                  onClick={() => setBrandData(prev => ({ ...prev, choice: null }))}
                  className="text-sm text-rose-gold-400 hover:text-rose-gold-300"
                >
                  Choose different option
                </button>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canProceedFromBrand()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Name Your Company */}
        {step === 4 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                Name your company
              </h1>
              <p className="text-white/60">
                Choose a name for your billion-dollar company
              </p>
            </div>

            <div className="max-w-md mx-auto mb-8">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name..."
                className="w-full p-6 rounded-2xl bg-white/5 border border-white/20 text-white text-2xl text-center placeholder-white/30 focus:border-rose-gold-400 focus:outline-none transition-colors"
              />

              {/* AI Suggestions */}
              <div className="mt-4">
                <p className="text-sm text-white/40 mb-2 text-center">AI Suggestions:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {['FitGenius AI', 'WorkoutWise', 'GymBuddy Pro', 'FlexForge'].map((name, i) => (
                    <button
                      key={i}
                      onClick={() => setCompanyName(name)}
                      className="px-4 py-2 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/20 hover:text-white transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={startBuilding}
                disabled={companyName.length < 2 || isSubmitting}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 text-dark-500 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform shadow-glow-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6" />
                    Build My Company
                    <Rocket className="w-6 h-6" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Building */}
        {step === 5 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center mx-auto mb-6 shadow-glow-xl">
                {isBuilding ? (
                  <Loader2 className="w-10 h-10 text-dark-500 animate-spin" />
                ) : (
                  <Check className="w-10 h-10 text-dark-500" />
                )}
              </div>
              <h1 className="text-4xl font-bold text-white mb-3">
                {isBuilding ? `Building ${companyName}...` : `${companyName} is ready!`}
              </h1>
              <p className="text-white/60">
                {isBuilding
                  ? 'Our AI departments are working together to build your company'
                  : 'Your AI-powered company is live and ready to make money'}
              </p>
            </div>

            {/* Build Steps */}
            <div className="max-w-2xl mx-auto mb-8 space-y-3">
              {buildSteps.map((buildStep) => (
                <div
                  key={buildStep.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    buildStep.status === 'building'
                      ? 'bg-rose-gold-400/15 border-rose-gold-400/50 shadow-glow-sm'
                      : buildStep.status === 'complete'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    buildStep.status === 'building'
                      ? 'bg-rose-gold-400/20 text-rose-gold-400'
                      : buildStep.status === 'complete'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {buildStep.status === 'building' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : buildStep.status === 'complete' ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <buildStep.icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{buildStep.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs">
                        {buildStep.department}
                      </span>
                    </div>
                    {buildStep.status === 'building' && (
                      <p className="text-xs text-rose-gold-400 mt-1">{buildStep.description}</p>
                    )}
                  </div>
                  {buildStep.status === 'complete' && (
                    <span className="text-green-400 text-sm">Done</span>
                  )}
                </div>
              ))}
            </div>

            {!isBuilding && (
              <div className="text-center">
                <button
                  onClick={() => setView('company-dashboard')}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 text-dark-500 font-bold text-lg mx-auto hover:scale-105 transition-transform shadow-glow-lg"
                >
                  <Globe className="w-6 h-6" />
                  Open Company Dashboard
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
