import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Cpu,
  Globe,
  Key,
  Palette,
  Shield,
  Settings,
  Info,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  RotateCcw,
  ExternalLink,
  Command,
  Moon,
  Sun,
  Monitor,
  Bug,
  FileText,
  Database
} from 'lucide-react'
import { aiService } from '@/services/ai'
import { useAppStore } from '@/stores/appStore'

// ============================================================================
// Types and Interfaces
// ============================================================================

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type AIProviderType = 'Groq' | 'Ollama' | 'WebLLM' | 'Mock'
type ThemeType = 'dark' | 'light' | 'system'
type FontSizeType = 'small' | 'medium' | 'large'

interface AppSettings {
  // AI Provider
  aiProvider: AIProviderType
  groqApiKey: string
  geminiApiKey: string
  ollamaUrl: string

  // Appearance
  theme: ThemeType
  fontSize: FontSizeType
  compactMode: boolean

  // Privacy
  dataRetention: boolean
  analyticsOptOut: boolean

  // Advanced
  debugMode: boolean
  showApiLogs: boolean
}

interface ProviderStatus {
  name: string
  model: string
  ready: boolean
  loading?: boolean
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const APP_VERSION = '2.0.0'
const SETTINGS_STORAGE_KEY = 'alabobai-settings'
const CHAT_HISTORY_KEY = 'alabobai-chats'
const API_LOGS_KEY = 'alabobai-api-logs'

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'Mock',
  groqApiKey: '',
  geminiApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  theme: 'dark',
  fontSize: 'medium',
  compactMode: false,
  dataRetention: true,
  analyticsOptOut: false,
  debugMode: false,
  showApiLogs: false,
}

const KEYBOARD_SHORTCUTS = [
  { key: 'Ctrl/Cmd + N', action: 'New chat' },
  { key: 'Ctrl/Cmd + K', action: 'Quick search' },
  { key: 'Ctrl/Cmd + ,', action: 'Open settings' },
  { key: 'Ctrl/Cmd + Enter', action: 'Send message' },
  { key: 'Ctrl/Cmd + Shift + C', action: 'Copy code block' },
  { key: 'Ctrl/Cmd + B', action: 'Toggle sidebar' },
  { key: 'Ctrl/Cmd + /', action: 'Toggle workspace' },
  { key: 'Escape', action: 'Close modal' },
]

// ============================================================================
// Utility Functions
// ============================================================================

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (error) {
    console.error('[Settings] Failed to load settings:', error)
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error)
  }
}

function applyTheme(theme: ThemeType): void {
  const root = document.documentElement
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  root.classList.remove('light', 'dark')
  root.classList.add(isDark ? 'dark' : 'light')

  // Store for CSS variable access
  root.style.setProperty('--theme-mode', isDark ? 'dark' : 'light')
}

function applyFontSize(size: FontSizeType): void {
  const root = document.documentElement
  const sizes = { small: '14px', medium: '16px', large: '18px' }
  root.style.setProperty('--base-font-size', sizes[size])
  root.style.fontSize = sizes[size]
}

function applyCompactMode(compact: boolean): void {
  const root = document.documentElement
  if (compact) {
    root.classList.add('compact-mode')
  } else {
    root.classList.remove('compact-mode')
  }
}

// ============================================================================
// Toggle Switch Component
// ============================================================================

interface ToggleSwitchProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

function ToggleSwitch({ enabled, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 ${
        enabled ? 'bg-rose-gold-400' : 'bg-white/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ============================================================================
// Settings Item Component
// ============================================================================

interface SettingsItemProps {
  title: string
  description?: string
  children: React.ReactNode
}

function SettingsItem({ title, description, children }: SettingsItemProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-dark-400 border border-white/10">
      <div className="flex-1 mr-4">
        <div className="text-white font-medium">{title}</div>
        {description && <div className="text-white/50 text-xs mt-1">{description}</div>}
      </div>
      {children}
    </div>
  )
}

// ============================================================================
// Main Settings Modal Component
// ============================================================================

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState('ai')
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([])
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [connectionResult, setConnectionResult] = useState<{ provider: string; success: boolean; message: string } | null>(null)
  const [isLoadingWebLLM, setIsLoadingWebLLM] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [confirmClearAllData, setConfirmClearAllData] = useState(false)
  const [apiLogs, setApiLogs] = useState<string[]>([])

  const { chats } = useAppStore()

  // Load provider statuses
  const loadProviderStatuses = useCallback(async () => {
    try {
      const statuses = await aiService.getProviderStatus()
      setProviderStatuses(statuses.map(s => ({ ...s, loading: false })))
    } catch (error) {
      console.error('[Settings] Failed to load provider statuses:', error)
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    if (isOpen) {
      const savedSettings = loadSettings()
      setSettings(savedSettings)
      loadProviderStatuses()

      // Load API logs if enabled
      if (savedSettings.showApiLogs) {
        try {
          const logs = localStorage.getItem(API_LOGS_KEY)
          setApiLogs(logs ? JSON.parse(logs) : [])
        } catch {
          setApiLogs([])
        }
      }
    }
  }, [isOpen, loadProviderStatuses])

  // Apply settings when they change
  useEffect(() => {
    applyTheme(settings.theme)
    applyFontSize(settings.fontSize)
    applyCompactMode(settings.compactMode)
    saveSettings(settings)
  }, [settings])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // ============================================================================
  // Handler Functions
  // ============================================================================

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleProviderChange = async (provider: AIProviderType) => {
    setConnectionResult(null)

    if (provider === 'WebLLM') {
      setIsLoadingWebLLM(true)
      try {
        const success = await aiService.switchToWebLLM({
          onStatus: (status) => console.log('[Settings] WebLLM:', status),
          onToken: () => {},
          onComplete: () => {},
          onError: (err) => console.error('[Settings] WebLLM error:', err),
        })
        if (success) {
          updateSetting('aiProvider', 'WebLLM')
          setConnectionResult({ provider: 'WebLLM', success: true, message: 'WebLLM loaded successfully' })
        } else {
          setConnectionResult({ provider: 'WebLLM', success: false, message: 'Failed to load WebLLM model' })
        }
      } catch (error) {
        setConnectionResult({ provider: 'WebLLM', success: false, message: String(error) })
      } finally {
        setIsLoadingWebLLM(false)
        loadProviderStatuses()
      }
    } else if (provider === 'Ollama') {
      try {
        const success = await aiService.switchToOllama({
          onStatus: (status) => console.log('[Settings] Ollama:', status),
          onToken: () => {},
          onComplete: () => {},
          onError: (err) => console.error('[Settings] Ollama error:', err),
        })
        if (success) {
          updateSetting('aiProvider', 'Ollama')
          setConnectionResult({ provider: 'Ollama', success: true, message: 'Connected to Ollama' })
        } else {
          setConnectionResult({ provider: 'Ollama', success: false, message: 'Ollama not available. Make sure it is running.' })
        }
      } catch (error) {
        setConnectionResult({ provider: 'Ollama', success: false, message: String(error) })
      }
      loadProviderStatuses()
    } else {
      updateSetting('aiProvider', provider)
    }
  }

  const testConnection = async (provider: AIProviderType) => {
    setTestingConnection(provider)
    setConnectionResult(null)

    try {
      if (provider === 'Groq') {
        // Test Groq API
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
            stream: false
          }),
          signal: AbortSignal.timeout(10000)
        })

        if (response.ok) {
          setConnectionResult({ provider: 'Groq', success: true, message: 'Groq API is working!' })
        } else {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }))
          setConnectionResult({ provider: 'Groq', success: false, message: error.error || `HTTP ${response.status}` })
        }
      } else if (provider === 'Ollama') {
        const ollamaProvider = aiService.getOllamaProvider()
        if (ollamaProvider) {
          await ollamaProvider.initialize()
          if (ollamaProvider.isReady()) {
            const models = await ollamaProvider.listModels()
            setConnectionResult({
              provider: 'Ollama',
              success: true,
              message: `Connected! Models: ${models.map(m => m.name).join(', ')}`
            })
          } else {
            setConnectionResult({ provider: 'Ollama', success: false, message: 'Ollama not available' })
          }
        } else {
          setConnectionResult({ provider: 'Ollama', success: false, message: 'Ollama provider not initialized' })
        }
      } else if (provider === 'WebLLM') {
        const status = providerStatuses.find(p => p.name === 'WebLLM')
        if (status?.ready) {
          setConnectionResult({ provider: 'WebLLM', success: true, message: 'WebLLM is ready!' })
        } else {
          setConnectionResult({ provider: 'WebLLM', success: false, message: 'WebLLM not loaded' })
        }
      } else {
        setConnectionResult({ provider: 'Mock', success: true, message: 'Mock provider always works!' })
      }
    } catch (error) {
      setConnectionResult({
        provider,
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      })
    } finally {
      setTestingConnection(null)
    }
  }

  const clearChatHistory = () => {
    try {
      localStorage.removeItem(CHAT_HISTORY_KEY)
      // Also clear from zustand store if possible
      window.location.reload() // Simple way to clear state
    } catch (error) {
      console.error('[Settings] Failed to clear chat history:', error)
    }
    setConfirmClearHistory(false)
  }

  const clearAllData = () => {
    try {
      // Clear all localStorage items with our prefix
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('alabobai') || key.startsWith('kasa'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      window.location.reload()
    } catch (error) {
      console.error('[Settings] Failed to clear all data:', error)
    }
    setConfirmClearAllData(false)
  }

  const resetAllSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
    applyTheme(DEFAULT_SETTINGS.theme)
    applyFontSize(DEFAULT_SETTINGS.fontSize)
    applyCompactMode(DEFAULT_SETTINGS.compactMode)
    setConfirmReset(false)
    setConnectionResult({ provider: 'System', success: true, message: 'Settings reset to defaults' })
  }

  const clearApiLogs = () => {
    localStorage.removeItem(API_LOGS_KEY)
    setApiLogs([])
  }

  const getProviderStatus = (provider: string): ProviderStatus | undefined => {
    return providerStatuses.find(p => p.name === provider)
  }

  const getCurrentProviderName = (): string => {
    return aiService.getProviderName()
  }

  // ============================================================================
  // Section Definitions
  // ============================================================================

  const sections = [
    { id: 'ai', label: 'AI Provider', icon: Cpu },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'advanced', label: 'Advanced', icon: Settings },
    { id: 'about', label: 'About', icon: Info },
  ]

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-dark-300 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[550px]">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/10 p-2 flex-shrink-0">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeSection === section.id
                    ? 'bg-rose-gold-400/15 text-rose-gold-400'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <section.icon className="w-4 h-4" />
                {section.label}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* AI Provider Section */}
            {activeSection === 'ai' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">AI Provider</h3>

                  {/* Current Provider Status */}
                  <div className="p-4 rounded-xl bg-dark-400 border border-white/10 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/70 text-sm">Current Provider</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        getProviderStatus(getCurrentProviderName())?.ready
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {getProviderStatus(getCurrentProviderName())?.ready ? 'Active' : 'Initializing'}
                      </span>
                    </div>
                    <div className="text-lg font-medium text-white">{getCurrentProviderName()}</div>
                    <div className="text-white/50 text-xs mt-1">
                      Model: {getProviderStatus(getCurrentProviderName())?.model || 'Unknown'}
                    </div>
                  </div>

                  {/* Provider Options */}
                  <div className="space-y-2">
                    {/* Groq */}
                    <button
                      onClick={() => handleProviderChange('Groq')}
                      className={`w-full p-4 rounded-xl border transition-colors text-left ${
                        settings.aiProvider === 'Groq'
                          ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                          : 'bg-dark-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-rose-gold-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">Groq API</span>
                            {getProviderStatus('Groq')?.ready && (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div className="text-white/50 text-xs">Fast cloud inference (requires API key)</div>
                        </div>
                      </div>
                    </button>

                    {/* Ollama */}
                    <button
                      onClick={() => handleProviderChange('Ollama')}
                      className={`w-full p-4 rounded-xl border transition-colors text-left ${
                        settings.aiProvider === 'Ollama'
                          ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                          : 'bg-dark-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-purple-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">Ollama (Local)</span>
                            {getProviderStatus('Ollama')?.ready && (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div className="text-white/50 text-xs">Run models locally via Ollama</div>
                        </div>
                      </div>
                    </button>

                    {/* WebLLM */}
                    <button
                      onClick={() => handleProviderChange('WebLLM')}
                      disabled={isLoadingWebLLM}
                      className={`w-full p-4 rounded-xl border transition-colors text-left ${
                        settings.aiProvider === 'WebLLM'
                          ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                          : 'bg-dark-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">WebLLM (Browser)</span>
                            {getProviderStatus('WebLLM')?.ready && (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div className="text-white/50 text-xs">Runs locally in your browser - no API key needed</div>
                        </div>
                        {isLoadingWebLLM && (
                          <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin" />
                        )}
                      </div>
                    </button>

                    {/* Mock/Offline */}
                    <button
                      onClick={() => handleProviderChange('Mock')}
                      className={`w-full p-4 rounded-xl border transition-colors text-left ${
                        settings.aiProvider === 'Mock'
                          ? 'bg-rose-gold-400/10 border-rose-gold-400/30'
                          : 'bg-dark-400 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Key className="w-5 h-5 text-yellow-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">Offline Mode</span>
                            <Check className="w-4 h-4 text-green-400" />
                          </div>
                          <div className="text-white/50 text-xs">Limited functionality with pre-built responses</div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Connection Result */}
                  {connectionResult && (
                    <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                      connectionResult.success
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-red-500/10 border border-red-500/20'
                    }`}>
                      {connectionResult.success
                        ? <Check className="w-4 h-4 text-green-400" />
                        : <AlertCircle className="w-4 h-4 text-red-400" />
                      }
                      <span className={connectionResult.success ? 'text-green-400' : 'text-red-400'}>
                        {connectionResult.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* API Keys Section */}
                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-medium text-white mb-4">API Keys</h3>
                  <div className="space-y-4">
                    {/* Groq API Key */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Groq API Key</label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={settings.groqApiKey}
                          onChange={(e) => updateSetting('groqApiKey', e.target.value)}
                          placeholder="gsk_..."
                          className="flex-1 px-3 py-2 rounded-lg bg-dark-400 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
                        />
                        <button
                          onClick={() => testConnection('Groq')}
                          disabled={testingConnection === 'Groq'}
                          className="px-4 py-2 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-colors disabled:opacity-50"
                        >
                          {testingConnection === 'Groq' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-white/40">
                        Get a free key at{' '}
                        <a
                          href="https://console.groq.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-gold-400 hover:underline inline-flex items-center gap-1"
                        >
                          console.groq.com <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* Gemini API Key */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Gemini API Key (Optional)</label>
                      <input
                        type="password"
                        value={settings.geminiApiKey}
                        onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                        placeholder="AIza..."
                        className="w-full px-3 py-2 rounded-lg bg-dark-400 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-white/40">
                        Get a free key at{' '}
                        <a
                          href="https://makersuite.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-gold-400 hover:underline inline-flex items-center gap-1"
                        >
                          Google AI Studio <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* Ollama URL */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Ollama URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={settings.ollamaUrl}
                          onChange={(e) => updateSetting('ollamaUrl', e.target.value)}
                          placeholder="http://localhost:11434"
                          className="flex-1 px-3 py-2 rounded-lg bg-dark-400 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
                        />
                        <button
                          onClick={() => testConnection('Ollama')}
                          disabled={testingConnection === 'Ollama'}
                          className="px-4 py-2 rounded-lg bg-purple-400/20 text-purple-400 hover:bg-purple-400/30 transition-colors disabled:opacity-50"
                        >
                          {testingConnection === 'Ollama' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="space-y-6">
                {/* Theme */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Theme</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'system', label: 'System', icon: Monitor },
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => updateSetting('theme', theme.id as ThemeType)}
                        className={`p-4 rounded-xl border text-center transition-colors ${
                          settings.theme === theme.id
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30 text-rose-gold-400'
                            : 'bg-dark-400 border-white/10 text-white/70 hover:border-white/20'
                        }`}
                      >
                        <theme.icon className="w-5 h-5 mx-auto mb-2" />
                        <span className="text-sm">{theme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Font Size</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'small', label: 'Small', size: '14px' },
                      { id: 'medium', label: 'Medium', size: '16px' },
                      { id: 'large', label: 'Large', size: '18px' },
                    ].map(font => (
                      <button
                        key={font.id}
                        onClick={() => updateSetting('fontSize', font.id as FontSizeType)}
                        className={`p-4 rounded-xl border text-center transition-colors ${
                          settings.fontSize === font.id
                            ? 'bg-rose-gold-400/10 border-rose-gold-400/30 text-rose-gold-400'
                            : 'bg-dark-400 border-white/10 text-white/70 hover:border-white/20'
                        }`}
                      >
                        <span className="text-sm">{font.label}</span>
                        <span className="block text-xs mt-1 text-white/40">{font.size}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Mode */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Display</h3>
                  <SettingsItem
                    title="Compact Mode"
                    description="Reduce spacing and padding for a denser layout"
                  >
                    <ToggleSwitch
                      enabled={settings.compactMode}
                      onChange={(enabled) => updateSetting('compactMode', enabled)}
                    />
                  </SettingsItem>
                </div>
              </div>
            )}

            {/* Privacy Section */}
            {activeSection === 'privacy' && (
              <div className="space-y-6">
                {/* Privacy Toggles */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Privacy Settings</h3>
                  <div className="space-y-3">
                    <SettingsItem
                      title="Data Retention"
                      description="Keep chat history and project data locally"
                    >
                      <ToggleSwitch
                        enabled={settings.dataRetention}
                        onChange={(enabled) => updateSetting('dataRetention', enabled)}
                      />
                    </SettingsItem>

                    <SettingsItem
                      title="Analytics Opt-Out"
                      description="Disable anonymous usage analytics"
                    >
                      <ToggleSwitch
                        enabled={settings.analyticsOptOut}
                        onChange={(enabled) => updateSetting('analyticsOptOut', enabled)}
                      />
                    </SettingsItem>
                  </div>
                </div>

                {/* Privacy Info */}
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                  <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-400" />
                    Data Privacy
                  </h4>
                  <p className="text-white/50 text-sm">
                    When using WebLLM or Ollama, all AI processing happens locally.
                    No data is sent to external servers. When using Groq API, your messages
                    are sent to Groq's servers for processing.
                  </p>
                </div>

                {/* Danger Zone */}
                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-medium text-red-400 mb-4">Danger Zone</h3>
                  <div className="space-y-3">
                    {/* Clear Chat History */}
                    <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-red-400" />
                            Clear Chat History
                          </div>
                          <div className="text-white/50 text-xs mt-1">
                            Delete all {chats.length} chat{chats.length !== 1 ? 's' : ''} permanently
                          </div>
                        </div>
                        {confirmClearHistory ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmClearHistory(false)}
                              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={clearChatHistory}
                              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm"
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearHistory(true)}
                            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clear All Data */}
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-red-400 font-medium flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            Clear All Local Data
                          </div>
                          <div className="text-red-400/70 text-xs mt-1">
                            Delete all data including settings, chats, and cached models
                          </div>
                        </div>
                        {confirmClearAllData ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmClearAllData(false)}
                              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={clearAllData}
                              className="px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm"
                            >
                              Delete All
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearAllData(true)}
                            className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm"
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Section */}
            {activeSection === 'advanced' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Developer Options</h3>
                  <div className="space-y-3">
                    <SettingsItem
                      title="Debug Mode"
                      description="Show additional debugging information in console"
                    >
                      <ToggleSwitch
                        enabled={settings.debugMode}
                        onChange={(enabled) => updateSetting('debugMode', enabled)}
                      />
                    </SettingsItem>

                    <SettingsItem
                      title="Show API Logs"
                      description="Display API request/response logs"
                    >
                      <ToggleSwitch
                        enabled={settings.showApiLogs}
                        onChange={(enabled) => updateSetting('showApiLogs', enabled)}
                      />
                    </SettingsItem>
                  </div>
                </div>

                {/* API Logs Viewer */}
                {settings.showApiLogs && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-white flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        API Logs
                      </h3>
                      <button
                        onClick={clearApiLogs}
                        className="text-xs text-white/50 hover:text-white transition-colors"
                      >
                        Clear logs
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-dark-400 border border-white/10 max-h-40 overflow-y-auto font-mono text-xs">
                      {apiLogs.length > 0 ? (
                        apiLogs.map((log, i) => (
                          <div key={i} className="text-white/60 mb-1">{log}</div>
                        ))
                      ) : (
                        <div className="text-white/40">No logs yet</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reset Settings */}
                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-medium text-white mb-4">Reset</h3>
                  <div className="p-4 rounded-xl bg-dark-400 border border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium flex items-center gap-2">
                          <RotateCcw className="w-4 h-4" />
                          Reset All Settings
                        </div>
                        <div className="text-white/50 text-xs mt-1">
                          Restore all settings to their default values
                        </div>
                      </div>
                      {confirmReset ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmReset(false)}
                            className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={resetAllSettings}
                            className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors text-sm"
                          >
                            Reset
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmReset(true)}
                          className="px-4 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-sm"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* About Section */}
            {activeSection === 'about' && (
              <div className="space-y-6">
                {/* Version Info */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-rose-gold-400/10 to-purple-500/10 border border-rose-gold-400/20">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-rose-gold-400/20 flex items-center justify-center">
                      <span className="text-3xl">🤖</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Alabobai</h2>
                      <p className="text-white/60 text-sm">AI Agent Platform</p>
                      <p className="text-white/40 text-xs mt-1">Version {APP_VERSION}</p>
                    </div>
                  </div>
                </div>

                {/* Links */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4">Links</h3>
                  <div className="space-y-2">
                    <a
                      href="https://github.com/alaboebai/alabobai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl bg-dark-400 border border-white/10 hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                          <ExternalLink className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-white font-medium">GitHub Repository</div>
                          <div className="text-white/50 text-xs">View source code and contribute</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-white/40" />
                    </a>

                    <a
                      href="https://github.com/alaboebai/alabobai/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl bg-dark-400 border border-white/10 hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                          <Bug className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-white font-medium">Report an Issue</div>
                          <div className="text-white/50 text-xs">Found a bug? Let us know</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-white/40" />
                    </a>
                  </div>
                </div>

                {/* Keyboard Shortcuts */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                    <Command className="w-4 h-4" />
                    Keyboard Shortcuts
                  </h3>
                  <div className="rounded-xl bg-dark-400 border border-white/10 overflow-hidden">
                    <div className="divide-y divide-white/5">
                      {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <span className="text-white/70 text-sm">{shortcut.action}</span>
                          <kbd className="px-2 py-1 rounded bg-dark-300 text-white/60 text-xs font-mono">
                            {shortcut.key}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Credits */}
                <div className="text-center text-white/40 text-xs pt-4">
                  <p>Built with React, TypeScript, and Tailwind CSS</p>
                  <p className="mt-1">Powered by Groq, Ollama, and WebLLM</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
