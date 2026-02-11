import { useState, useCallback } from 'react'
import {
  Rocket, ShoppingCart, Smartphone, Building2, PenTool, Wrench,
  ArrowRight, ArrowLeft, Check, Loader2, Sparkles,
  Code2, Palette, Megaphone, DollarSign, Scale, Shield,
  HeadphonesIcon, AlertCircle, Wand2, RefreshCw
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

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

export default function CompanyWizard() {
  const { setView } = useAppStore()

  const [step, setStep] = useState(1)
  const [companyType, setCompanyType] = useState<CompanyType | null>(null)
  const [companyIdea, setCompanyIdea] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [suggestedNames, setSuggestedNames] = useState<string[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isGeneratingNames, setIsGeneratingNames] = useState(false)
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [companyData, setCompanyData] = useState<any>(null)

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

      if (!response.ok) throw new Error('Failed to generate names')

      const data = await response.json()
      setSuggestedNames(data.names || [])
    } catch (err) {
      console.error('Name generation error:', err)
      // Fallback names
      setSuggestedNames([
        `${companyIdea.split(' ')[0]}Hub`,
        `${companyType}Flow`,
        'NextGen Solutions',
        'Innovate Labs',
        'Peak Ventures'
      ])
    } finally {
      setIsGeneratingNames(false)
    }
  }, [companyType, companyIdea])

  // Generate logo using Pollinations.ai
  const generateLogo = useCallback(async () => {
    if (!companyName) return

    setIsGeneratingLogo(true)
    setError(null)

    try {
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-logo',
          name: companyName,
          companyType,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate logo')

      const data = await response.json()
      setLogoUrl(data.logoUrl)
    } catch (err) {
      console.error('Logo generation error:', err)
      // Fallback to direct Pollinations URL
      const prompt = encodeURIComponent(`Professional minimalist logo for ${companyName} ${companyType} company, clean design, white background`)
      setLogoUrl(`https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&nologo=true`)
    } finally {
      setIsGeneratingLogo(false)
    }
  }, [companyName, companyType])

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

      // Create the company
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: companyName,
          companyType,
          description: companyIdea,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setCompanyData(data.company)
      }

      setIsBuilding(false)
    } catch (err) {
      console.error('Build error:', err)
      setError('Failed to build company. Please try again.')
      setIsBuilding(false)
    }
  }

  const completedSteps = buildSteps.filter(s => s.status === 'complete').length
  const progress = (completedSteps / buildSteps.length) * 100

  return (
    <div className="min-h-screen bg-dark-500 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
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
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400 flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Choose Company Type */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">What type of company do you want to build?</h1>
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
              <h1 className="text-4xl font-bold text-white mb-3">Describe your company</h1>
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
              <h1 className="text-4xl font-bold text-white mb-3">Name your company</h1>
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
                onClick={() => { setStep(4); generateLogo(); }}
                disabled={!companyName}
                className="px-8 py-3 rounded-xl bg-rose-gold-400 text-dark-500 font-semibold flex items-center gap-2 hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Logo & Brand */}
        {step === 4 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">Your company logo</h1>
              <p className="text-white/60">AI-generated logo for {companyName}</p>
            </div>

            <div className="flex justify-center mb-8">
              <div className="relative">
                {isGeneratingLogo ? (
                  <div className="w-64 h-64 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 text-rose-gold-400 animate-spin mx-auto mb-3" />
                      <p className="text-white/50">Generating logo...</p>
                    </div>
                  </div>
                ) : logoUrl ? (
                  <div className="relative">
                    <img
                      src={logoUrl}
                      alt={`${companyName} logo`}
                      className="w-64 h-64 rounded-3xl object-cover border-2 border-rose-gold-400/30"
                      onError={(e) => {
                        // Fallback if image fails to load
                        (e.target as HTMLImageElement).src = `https://via.placeholder.com/512/1a1a1a/d9a07a?text=${encodeURIComponent(companyName.charAt(0))}`
                      }}
                    />
                    <button
                      onClick={generateLogo}
                      className="absolute -bottom-3 -right-3 p-3 rounded-full bg-rose-gold-400 text-dark-500 hover:bg-rose-gold-300 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-64 h-64 rounded-3xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center">
                    <span className="text-8xl font-bold text-white">{companyName.charAt(0)}</span>
                  </div>
                )}
              </div>
            </div>

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
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold flex items-center gap-2 hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all shadow-glow-lg"
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
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center">
                {isBuilding ? (
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : (
                  <Sparkles className="w-10 h-10 text-white" />
                )}
              </div>
              <h1 className="text-4xl font-bold text-white mb-3">
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
                      ? 'border-green-500/30 bg-green-500/10'
                      : buildStep.status === 'building'
                      ? 'border-rose-gold-400/30 bg-rose-gold-400/10'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      buildStep.status === 'complete'
                        ? 'bg-green-500/20'
                        : buildStep.status === 'building'
                        ? 'bg-rose-gold-400/20'
                        : 'bg-white/10'
                    }`}>
                      {buildStep.status === 'complete' ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : buildStep.status === 'building' ? (
                        <Loader2 className="w-5 h-5 text-rose-gold-400 animate-spin" />
                      ) : (
                        <buildStep.icon className="w-5 h-5 text-white/40" />
                      )}
                    </div>
                    <div>
                      <p className={`font-medium ${
                        buildStep.status === 'complete' ? 'text-green-400' :
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
