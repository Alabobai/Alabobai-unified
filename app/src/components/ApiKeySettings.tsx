import { useState, useCallback } from 'react'
import {
  Eye,
  EyeOff,
  Key,
  Cpu,
  Bot,
  Zap,
  Server,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Trash2,
  Shield,
  RefreshCw,
  Save,
} from 'lucide-react'
import {
  useApiKeyStore,
  testOpenAIConnection,
  testAnthropicConnection,
  testGroqConnection,
  testGeminiConnection,
  testOllamaConnection,
  type ConnectionTestResult,
} from '@/stores/apiKeyStore'

// ============================================================================
// Types
// ============================================================================

interface ApiKeyInputProps {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  placeholder: string
  value: string
  onChange: (value: string) => void
  onTest: () => Promise<void>
  testResult?: ConnectionTestResult
  isTesting: boolean
  helpUrl?: string
  helpText?: string
  isPassword?: boolean
}

// ============================================================================
// API Key Input Component
// ============================================================================

function ApiKeyInput({
  id,
  label,
  description,
  icon,
  placeholder,
  value,
  onChange,
  onTest,
  testResult,
  isTesting,
  helpUrl,
  helpText,
  isPassword = true,
}: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="morphic-card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1">
          <h4 className="text-white font-medium">{label}</h4>
          <p className="text-white/50 text-xs">{description}</p>
        </div>
      </div>

      {/* Input Field */}
      <div className="relative">
        <input
          id={id}
          type={isPassword && !showKey ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="morphic-input pr-24"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Show/Hide Toggle */}
          {isPassword && value && (
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          {/* Test Button */}
          <button
            onClick={onTest}
            disabled={isTesting || (!value && id !== 'ollama-url')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Testing
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Test
              </>
            )}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
            testResult.success
              ? 'bg-rose-gold-400/10 border border-rose-gold-400/20 text-rose-gold-400'
              : 'bg-rose-gold-500/10 border border-rose-gold-400/20 text-rose-gold-400'
          }`}
        >
          {testResult.success ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="flex-1">{testResult.message}</span>
        </div>
      )}

      {/* Help Link */}
      {helpUrl && helpText && (
        <p className="text-xs text-white/40">
          {helpText}{' '}
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-gold-400 hover:text-rose-gold-300 hover:underline inline-flex items-center gap-1"
          >
            Get API Key <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Main API Key Settings Component
// ============================================================================

export default function ApiKeySettings() {
  const {
    getKey,
    setKey,
    clearAllKeys,
    testResults,
    testingProvider,
    setTestResult,
    setTestingProvider,
    hasKey,
  } = useApiKeyStore()

  // Local state for input values (decrypted)
  const [openaiKey, setOpenaiKey] = useState(() => getKey('openaiKey'))
  const [anthropicKey, setAnthropicKey] = useState(() => getKey('anthropicKey'))
  const [groqKey, setGroqKey] = useState(() => getKey('groqKey'))
  const [geminiKey, setGeminiKey] = useState(() => getKey('geminiKey'))
  const [ollamaUrl, setOllamaUrl] = useState(() => getKey('ollamaUrl'))

  // Track if any key has been modified
  const [hasChanges, setHasChanges] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  // Handle key changes - save immediately
  const handleKeyChange = useCallback(
    (provider: 'openaiKey' | 'anthropicKey' | 'groqKey' | 'geminiKey' | 'ollamaUrl', value: string) => {
      switch (provider) {
        case 'openaiKey':
          setOpenaiKey(value)
          break
        case 'anthropicKey':
          setAnthropicKey(value)
          break
        case 'groqKey':
          setGroqKey(value)
          break
        case 'geminiKey':
          setGeminiKey(value)
          break
        case 'ollamaUrl':
          setOllamaUrl(value)
          break
      }
      setKey(provider, value)
      setHasChanges(true)
    },
    [setKey]
  )

  // Test connection handlers
  const handleTestOpenAI = useCallback(async () => {
    if (!openaiKey) return
    setTestingProvider('OpenAI')
    const result = await testOpenAIConnection(openaiKey)
    setTestResult('OpenAI', result)
    setTestingProvider(null)
  }, [openaiKey, setTestResult, setTestingProvider])

  const handleTestAnthropic = useCallback(async () => {
    if (!anthropicKey) return
    setTestingProvider('Anthropic')
    const result = await testAnthropicConnection(anthropicKey)
    setTestResult('Anthropic', result)
    setTestingProvider(null)
  }, [anthropicKey, setTestResult, setTestingProvider])

  const handleTestGroq = useCallback(async () => {
    if (!groqKey) return
    setTestingProvider('Groq')
    const result = await testGroqConnection(groqKey)
    setTestResult('Groq', result)
    setTestingProvider(null)
  }, [groqKey, setTestResult, setTestingProvider])

  const handleTestGemini = useCallback(async () => {
    if (!geminiKey) return
    setTestingProvider('Gemini')
    const result = await testGeminiConnection(geminiKey)
    setTestResult('Gemini', result)
    setTestingProvider(null)
  }, [geminiKey, setTestResult, setTestingProvider])

  const handleTestOllama = useCallback(async () => {
    setTestingProvider('Ollama')
    const result = await testOllamaConnection(ollamaUrl || 'http://localhost:11434')
    setTestResult('Ollama', result)
    setTestingProvider(null)
  }, [ollamaUrl, setTestResult, setTestingProvider])

  // Clear all keys
  const handleClearAll = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all API keys? This cannot be undone.')) {
      clearAllKeys()
      setOpenaiKey('')
      setAnthropicKey('')
      setGroqKey('')
      setGeminiKey('')
      setOllamaUrl('http://localhost:11434')
      setHasChanges(false)
    }
  }, [clearAllKeys])

  // Save keys with visual feedback
  const handleSave = useCallback(() => {
    // Keys are already saved via handleKeyChange, but show feedback
    setShowSaved(true)
    setHasChanges(false)
    setTimeout(() => setShowSaved(false), 2000)
  }, [])

  // Count configured keys
  const configuredCount = [
    hasKey('openaiKey'),
    hasKey('anthropicKey'),
    hasKey('groqKey'),
    hasKey('geminiKey'),
  ].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="morphic-panel p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center shadow-glow-sm">
            <Key className="w-7 h-7 text-dark-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-1">API Key Management</h3>
            <p className="text-white/60 text-sm">
              Configure your AI provider API keys for enhanced functionality.
              Keys are stored securely in your browser with obfuscation.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    configuredCount > 0 ? 'bg-rose-gold-400' : 'bg-white/30'
                  }`}
                />
                <span className="text-white/70">
                  {configuredCount} of 4 providers configured
                </span>
              </div>
              {hasChanges && (
                <div className="flex items-center gap-1.5 text-xs text-rose-gold-400">
                  <Check className="w-3 h-3" />
                  Auto-saved
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-gold-500/10 border border-rose-gold-400/20">
        <Shield className="w-5 h-5 text-rose-gold-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-rose-gold-400 font-medium text-sm">Security Notice</h4>
          <p className="text-rose-gold-400/70 text-xs mt-1">
            API keys are stored locally in your browser with basic obfuscation. For production
            environments with sensitive data, consider using environment variables or a secure
            backend service.
          </p>
        </div>
      </div>

      {/* API Key Inputs */}
      <div className="space-y-4">
        {/* OpenAI */}
        <ApiKeyInput
          id="openai-key"
          label="OpenAI"
          description="Access GPT-4, GPT-4 Turbo, and other OpenAI models"
          icon={<Bot className="w-5 h-5 text-rose-gold-400" />}
          placeholder="sk-..."
          value={openaiKey}
          onChange={(value) => handleKeyChange('openaiKey', value)}
          onTest={handleTestOpenAI}
          testResult={testResults['OpenAI']}
          isTesting={testingProvider === 'OpenAI'}
          helpUrl="https://platform.openai.com/api-keys"
          helpText="Get your API key from OpenAI:"
        />

        {/* Anthropic */}
        <ApiKeyInput
          id="anthropic-key"
          label="Anthropic"
          description="Access Claude 3 Opus, Sonnet, and Haiku models"
          icon={<Cpu className="w-5 h-5 text-rose-gold-400" />}
          placeholder="sk-ant-..."
          value={anthropicKey}
          onChange={(value) => handleKeyChange('anthropicKey', value)}
          onTest={handleTestAnthropic}
          testResult={testResults['Anthropic']}
          isTesting={testingProvider === 'Anthropic'}
          helpUrl="https://console.anthropic.com/settings/keys"
          helpText="Get your API key from Anthropic:"
        />

        {/* Groq */}
        <ApiKeyInput
          id="groq-key"
          label="Groq"
          description="Ultra-fast inference for Llama, Mixtral, and Gemma models"
          icon={<Zap className="w-5 h-5 text-rose-gold-400" />}
          placeholder="gsk_..."
          value={groqKey}
          onChange={(value) => handleKeyChange('groqKey', value)}
          onTest={handleTestGroq}
          testResult={testResults['Groq']}
          isTesting={testingProvider === 'Groq'}
          helpUrl="https://console.groq.com/keys"
          helpText="Get your free API key from Groq:"
        />

        {/* Gemini */}
        <ApiKeyInput
          id="gemini-key"
          label="Google Gemini"
          description="Access Gemini 2.0 Flash with 1M+ token context window"
          icon={<Zap className="w-5 h-5 text-rose-gold-400" />}
          placeholder="AIza..."
          value={geminiKey}
          onChange={(value) => handleKeyChange('geminiKey', value)}
          onTest={handleTestGemini}
          testResult={testResults['Gemini']}
          isTesting={testingProvider === 'Gemini'}
          helpUrl="https://aistudio.google.com/app/apikey"
          helpText="Get your free API key from Google AI Studio:"
        />

        {/* Ollama Local */}
        <ApiKeyInput
          id="ollama-url"
          label="Local Ollama"
          description="Connect to your local Ollama instance for private AI"
          icon={<Server className="w-5 h-5 text-rose-gold-400" />}
          placeholder="http://localhost:11434"
          value={ollamaUrl}
          onChange={(value) => handleKeyChange('ollamaUrl', value)}
          onTest={handleTestOllama}
          testResult={testResults['Ollama']}
          isTesting={testingProvider === 'Ollama'}
          helpUrl="https://ollama.ai"
          helpText="Run AI models locally with Ollama:"
          isPassword={false}
        />
      </div>

      {/* Action Buttons */}
      <div className="pt-4 border-t border-white/10 flex items-center gap-3">
        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={showSaved}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
            showSaved
              ? 'bg-green-500/20 text-green-400 border border-green-400/30'
              : 'bg-rose-gold-400 text-dark-500 hover:bg-rose-gold-300 shadow-glow-sm'
          }`}
        >
          {showSaved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>

        {/* Clear All Button */}
        <button
          onClick={handleClearAll}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-rose-gold-400 bg-rose-gold-500/10 border border-rose-gold-400/20 hover:bg-rose-gold-500/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Named Export for flexibility
// ============================================================================

export { ApiKeySettings }
