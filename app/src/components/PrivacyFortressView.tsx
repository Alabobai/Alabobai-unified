/**
 * Privacy Fortress View Component
 * A comprehensive privacy management dashboard with real working tools
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Lock, Eye, EyeOff, Trash2, Download, RefreshCw,
  CheckCircle2, AlertTriangle, AlertCircle, Copy, ExternalLink,
  Key, User, Mail, Globe, Database, Cookie, HardDrive,
  FileText, Settings, Zap, ChevronRight, ChevronDown,
  Search, ClipboardCheck, Info, Check
} from 'lucide-react'

// ============== Types ==============

interface StorageItem {
  key: string
  value: string
  size: number
  type: 'localStorage' | 'sessionStorage' | 'cookie'
}

interface PasswordStrength {
  score: number
  label: string
  color: string
  feedback: string[]
}

interface URLAnalysis {
  url: string
  isHttps: boolean
  domain: string
  risks: string[]
  recommendations: string[]
  score: number
}

interface PrivacyCheckItem {
  id: string
  title: string
  description: string
  checked: boolean
  category: 'browser' | 'account' | 'device' | 'online'
}

// ============== Utility Functions ==============

// Password Generator
function generatePassword(length: number = 16, options: {
  uppercase?: boolean
  lowercase?: boolean
  numbers?: boolean
  symbols?: boolean
} = {}): string {
  const { uppercase = true, lowercase = true, numbers = true, symbols = true } = options

  let chars = ''
  if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (numbers) chars += '0123456789'
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz'

  let password = ''
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)

  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }

  return password
}

// Password Strength Checker
function checkPasswordStrength(password: string): PasswordStrength {
  let score = 0
  const feedback: string[] = []

  if (password.length === 0) {
    return { score: 0, label: 'None', color: 'gray', feedback: ['Enter a password to check'] }
  }

  // Length checks
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  if (password.length < 8) feedback.push('Use at least 8 characters')

  // Character type checks
  if (/[a-z]/.test(password)) score += 1
  else feedback.push('Add lowercase letters')

  if (/[A-Z]/.test(password)) score += 1
  else feedback.push('Add uppercase letters')

  if (/[0-9]/.test(password)) score += 1
  else feedback.push('Add numbers')

  if (/[^a-zA-Z0-9]/.test(password)) score += 1
  else feedback.push('Add special characters')

  // Pattern checks
  if (/(.)\1{2,}/.test(password)) {
    score -= 1
    feedback.push('Avoid repeating characters')
  }

  if (/^[a-zA-Z]+$/.test(password) || /^[0-9]+$/.test(password)) {
    score -= 1
    feedback.push('Mix different character types')
  }

  // Common patterns
  const commonPatterns = ['123456', 'password', 'qwerty', 'abc123', 'letmein', 'welcome']
  if (commonPatterns.some(p => password.toLowerCase().includes(p))) {
    score -= 2
    feedback.push('Avoid common password patterns')
  }

  score = Math.max(0, Math.min(7, score))

  const labels = ['Very Weak', 'Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong', 'Excellent']
  const colors = ['red', 'red', 'orange', 'yellow', 'lime', 'green', 'emerald', 'cyan']

  if (feedback.length === 0) feedback.push('Great password!')

  return {
    score,
    label: labels[score],
    color: colors[score],
    feedback
  }
}

// Username Generator
function generateUsername(): string {
  const adjectives = ['Swift', 'Clever', 'Silent', 'Cosmic', 'Digital', 'Crypto', 'Shadow', 'Quantum', 'Cyber', 'Nova']
  const nouns = ['Fox', 'Wolf', 'Hawk', 'Phoenix', 'Dragon', 'Sage', 'Knight', 'Ninja', 'Pilot', 'Ghost']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `${adj}${noun}${num}`
}

// Email Alias Generator
function generateEmailAlias(baseEmail: string): string[] {
  const [localPart, domain] = baseEmail.split('@')
  if (!domain) return []

  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)

  return [
    `${localPart}+privacy${timestamp}@${domain}`,
    `${localPart}+temp${random}@${domain}`,
    `${localPart}+alias${Math.floor(Math.random() * 999)}@${domain}`,
  ]
}

// URL Safety Analyzer
function analyzeURL(url: string): URLAnalysis {
  const risks: string[] = []
  const recommendations: string[] = []
  let score = 100

  try {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'

    if (!isHttps) {
      risks.push('Site does not use HTTPS encryption')
      recommendations.push('Avoid entering sensitive data on non-HTTPS sites')
      score -= 30
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /login|signin|account/i, risk: 'Contains login-related keywords', rec: 'Verify this is the official site' },
      { pattern: /free|winner|prize|lottery/i, risk: 'Contains promotional keywords', rec: 'Be cautious of scam sites' },
      { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, risk: 'Uses IP address instead of domain', rec: 'IP-based URLs can be suspicious' },
      { pattern: /@/, risk: 'Contains @ symbol (potential phishing)', rec: 'Check the actual destination carefully' },
    ]

    for (const { pattern, risk, rec } of suspiciousPatterns) {
      if (pattern.test(url)) {
        risks.push(risk)
        recommendations.push(rec)
        score -= 15
      }
    }

    // Check domain
    const domain = parsed.hostname
    if (domain.split('.').length > 3) {
      risks.push('Multiple subdomains detected')
      recommendations.push('Verify the main domain is legitimate')
      score -= 10
    }

    // Check for common typosquatting
    const popularDomains = ['google', 'facebook', 'amazon', 'apple', 'microsoft', 'paypal', 'netflix']
    for (const popular of popularDomains) {
      if (domain.includes(popular) && !domain.endsWith(`.${popular}.com`) && domain !== `${popular}.com` && domain !== `www.${popular}.com`) {
        risks.push(`May be impersonating ${popular}`)
        recommendations.push('Double-check you are on the official site')
        score -= 25
      }
    }

    if (risks.length === 0) {
      recommendations.push('URL appears safe, but always verify before entering sensitive data')
    }

    return {
      url,
      isHttps,
      domain,
      risks,
      recommendations,
      score: Math.max(0, score)
    }
  } catch {
    return {
      url,
      isHttps: false,
      domain: 'Invalid URL',
      risks: ['Invalid URL format'],
      recommendations: ['Enter a valid URL starting with http:// or https://'],
      score: 0
    }
  }
}

// Format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ============== Sub-Components ==============

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: typeof Shield
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function StatCard({ icon: Icon, label, value, color = 'rose' }: {
  icon: typeof Shield
  label: string
  value: string | number
  color?: string
}) {
  const colorClasses: Record<string, string> = {
    rose: 'from-rose-gold-400/20 to-rose-gold-600/20 border-rose-gold-400/30 text-rose-gold-400',
    yellow: 'from-yellow-400/20 to-yellow-600/20 border-yellow-500/30 text-yellow-400',
    red: 'from-red-400/20 to-red-600/20 border-red-500/30 text-red-400',
    blue: 'from-blue-400/20 to-blue-600/20 border-blue-500/30 text-blue-400',
  }

  return (
    <div className={`morphic-card p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border`}>
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5" />
        <div>
          <p className="text-xs text-white/60">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

// ============== Privacy Dashboard Tab ==============

function PrivacyDashboard() {
  const [storageItems, setStorageItems] = useState<StorageItem[]>([])
  const [scanning, setScanning] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['localStorage', 'sessionStorage', 'cookie']))

  const scanStorage = useCallback(() => {
    setScanning(true)
    const items: StorageItem[] = []

    // Scan localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          const value = localStorage.getItem(key) || ''
          items.push({
            key,
            value,
            size: new Blob([value]).size,
            type: 'localStorage'
          })
        }
      }
    } catch (e) {
      console.error('Error scanning localStorage:', e)
    }

    // Scan sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key) {
          const value = sessionStorage.getItem(key) || ''
          items.push({
            key,
            value,
            size: new Blob([value]).size,
            type: 'sessionStorage'
          })
        }
      }
    } catch (e) {
      console.error('Error scanning sessionStorage:', e)
    }

    // Scan cookies
    try {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=')
        if (key) {
          items.push({
            key,
            value: value || '',
            size: new Blob([value || '']).size,
            type: 'cookie'
          })
        }
      }
    } catch (e) {
      console.error('Error scanning cookies:', e)
    }

    setTimeout(() => {
      setStorageItems(items)
      setScanning(false)
    }, 500)
  }, [])

  useEffect(() => {
    scanStorage()
  }, [scanStorage])

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const toggleSelectItem = (key: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedItems(newSelected)
  }

  const deleteSelected = () => {
    for (const key of selectedItems) {
      const item = storageItems.find(i => i.key === key)
      if (item) {
        if (item.type === 'localStorage') {
          localStorage.removeItem(key)
        } else if (item.type === 'sessionStorage') {
          sessionStorage.removeItem(key)
        } else if (item.type === 'cookie') {
          document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
        }
      }
    }
    setSelectedItems(new Set())
    scanStorage()
  }

  const clearAllStorage = (type: 'localStorage' | 'sessionStorage' | 'cookie' | 'all') => {
    if (type === 'localStorage' || type === 'all') {
      localStorage.clear()
    }
    if (type === 'sessionStorage' || type === 'all') {
      sessionStorage.clear()
    }
    if (type === 'cookie' || type === 'all') {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [key] = cookie.trim().split('=')
        if (key) {
          document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
        }
      }
    }
    scanStorage()
  }

  const localStorageItems = storageItems.filter(i => i.type === 'localStorage')
  const sessionStorageItems = storageItems.filter(i => i.type === 'sessionStorage')
  const cookieItems = storageItems.filter(i => i.type === 'cookie')

  const totalSize = storageItems.reduce((acc, item) => acc + item.size, 0)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Database} label="Total Items" value={storageItems.length} color="rose" />
        <StatCard icon={HardDrive} label="Total Size" value={formatBytes(totalSize)} color="rose" />
        <StatCard icon={Cookie} label="Cookies" value={cookieItems.length} color="yellow" />
        <StatCard icon={FileText} label="Storage Items" value={localStorageItems.length + sessionStorageItems.length} color="rose" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={scanStorage}
          disabled={scanning}
          className="morphic-btn px-4 py-2 text-sm flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Rescan'}
        </button>

        {selectedItems.size > 0 && (
          <button
            onClick={deleteSelected}
            className="morphic-btn bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 px-4 py-2 text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected ({selectedItems.size})
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => clearAllStorage('all')}
            className="morphic-btn bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 px-4 py-2 text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Data
          </button>
        </div>
      </div>

      {/* Storage Sections */}
      <div className="space-y-4">
        {/* LocalStorage */}
        <div className="morphic-card rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('localStorage')}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-rose-gold-400" />
              <span className="font-medium text-white">LocalStorage</span>
              <span className="text-xs text-white/40">({localStorageItems.length} items)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); clearAllStorage('localStorage') }}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10"
              >
                Clear
              </button>
              {expandedSections.has('localStorage') ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
            </div>
          </button>

          {expandedSections.has('localStorage') && localStorageItems.length > 0 && (
            <div className="border-t border-white/10 max-h-60 overflow-y-auto morphic-scrollbar">
              {localStorageItems.map(item => (
                <div
                  key={`ls-${item.key}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.key)}
                    onChange={() => toggleSelectItem(item.key)}
                    className="rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.key}</p>
                    <p className="text-xs text-white/40 truncate">{item.value.substring(0, 100)}</p>
                  </div>
                  <span className="text-xs text-white/30">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          )}

          {expandedSections.has('localStorage') && localStorageItems.length === 0 && (
            <div className="p-4 text-center text-white/40 text-sm border-t border-white/10">
              No localStorage data found
            </div>
          )}
        </div>

        {/* SessionStorage */}
        <div className="morphic-card rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('sessionStorage')}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-rose-gold-400" />
              <span className="font-medium text-white">SessionStorage</span>
              <span className="text-xs text-white/40">({sessionStorageItems.length} items)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); clearAllStorage('sessionStorage') }}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10"
              >
                Clear
              </button>
              {expandedSections.has('sessionStorage') ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
            </div>
          </button>

          {expandedSections.has('sessionStorage') && sessionStorageItems.length > 0 && (
            <div className="border-t border-white/10 max-h-60 overflow-y-auto morphic-scrollbar">
              {sessionStorageItems.map(item => (
                <div
                  key={`ss-${item.key}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.key)}
                    onChange={() => toggleSelectItem(item.key)}
                    className="rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.key}</p>
                    <p className="text-xs text-white/40 truncate">{item.value.substring(0, 100)}</p>
                  </div>
                  <span className="text-xs text-white/30">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          )}

          {expandedSections.has('sessionStorage') && sessionStorageItems.length === 0 && (
            <div className="p-4 text-center text-white/40 text-sm border-t border-white/10">
              No sessionStorage data found
            </div>
          )}
        </div>

        {/* Cookies */}
        <div className="morphic-card rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('cookie')}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Cookie className="w-5 h-5 text-rose-gold-400" />
              <span className="font-medium text-white">Cookies</span>
              <span className="text-xs text-white/40">({cookieItems.length} items)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); clearAllStorage('cookie') }}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10"
              >
                Clear
              </button>
              {expandedSections.has('cookie') ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
            </div>
          </button>

          {expandedSections.has('cookie') && cookieItems.length > 0 && (
            <div className="border-t border-white/10 max-h-60 overflow-y-auto morphic-scrollbar">
              {cookieItems.map(item => (
                <div
                  key={`ck-${item.key}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.key)}
                    onChange={() => toggleSelectItem(item.key)}
                    className="rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.key}</p>
                    <p className="text-xs text-white/40 truncate">{item.value.substring(0, 100)}</p>
                  </div>
                  <span className="text-xs text-white/30">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          )}

          {expandedSections.has('cookie') && cookieItems.length === 0 && (
            <div className="p-4 text-center text-white/40 text-sm border-t border-white/10">
              No cookies found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============== Privacy Tools Tab ==============

function PrivacyTools() {
  const [password, setPassword] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [passwordLength, setPasswordLength] = useState(16)
  const [passwordOptions, setPasswordOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true
  })
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const [generatedUsernames, setGeneratedUsernames] = useState<string[]>([])
  const [baseEmail, setBaseEmail] = useState('')
  const [emailAliases, setEmailAliases] = useState<string[]>([])

  useEffect(() => {
    setPasswordStrength(checkPasswordStrength(password))
  }, [password])

  const handleGeneratePassword = () => {
    const newPassword = generatePassword(passwordLength, passwordOptions)
    setGeneratedPassword(newPassword)
    setPassword(newPassword)
  }

  const handleGenerateUsernames = () => {
    const usernames = Array.from({ length: 5 }, () => generateUsername())
    setGeneratedUsernames(usernames)
  }

  const handleGenerateAliases = () => {
    if (baseEmail.includes('@')) {
      setEmailAliases(generateEmailAlias(baseEmail))
    }
  }

  const copyToClipboard = async (text: string, itemId: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedItem(itemId)
    setTimeout(() => setCopiedItem(null), 2000)
  }

  const getStrengthColor = (score: number) => {
    const colors = ['bg-red-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-cyan-500']
    return colors[score] || 'bg-gray-500'
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Password Generator */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-rose-gold-400" />
          Password Generator
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-2 block">Password Length: {passwordLength}</label>
            <input
              type="range"
              min="8"
              max="32"
              value={passwordLength}
              onChange={(e) => setPasswordLength(Number(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(passwordOptions).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setPasswordOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                />
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
            ))}
          </div>

          <button
            onClick={handleGeneratePassword}
            className="w-full morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Generate Password
          </button>

          {generatedPassword && (
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={generatedPassword}
                readOnly
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-white/40 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(generatedPassword, 'password')}
                  className="p-1.5 text-white/40 hover:text-white"
                >
                  {copiedItem === 'password' ? <Check className="w-4 h-4 text-rose-gold-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Password Strength Checker */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-rose-gold-400" />
          Password Strength Checker
        </h3>

        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a password to check"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm pr-10 placeholder-white/30"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {passwordStrength && password && (
            <>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-white/60">Strength</span>
                  <span className={`text-sm font-medium ${
                    passwordStrength.score >= 5 ? 'text-rose-gold-400' :
                    passwordStrength.score >= 3 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getStrengthColor(passwordStrength.score)} transition-all duration-300`}
                    style={{ width: `${(passwordStrength.score / 7) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {passwordStrength.feedback.map((tip, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                    {passwordStrength.score >= 5 && tip === 'Great password!' ? (
                      <CheckCircle2 className="w-3 h-3 text-rose-gold-400" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-yellow-400" />
                    )}
                    {tip}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Username Generator */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-rose-gold-400" />
          Username Generator
        </h3>

        <div className="space-y-4">
          <button
            onClick={handleGenerateUsernames}
            className="w-full morphic-btn py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Generate Usernames
          </button>

          {generatedUsernames.length > 0 && (
            <div className="space-y-2">
              {generatedUsernames.map((username, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2"
                >
                  <span className="text-sm text-white font-mono">{username}</span>
                  <button
                    onClick={() => copyToClipboard(username, `username-${i}`)}
                    className="p-1.5 text-white/40 hover:text-white"
                  >
                    {copiedItem === `username-${i}` ? <Check className="w-4 h-4 text-rose-gold-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Email Alias Generator */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-rose-gold-400" />
          Email Alias Generator
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-2 block">Your Email</label>
            <input
              type="email"
              value={baseEmail}
              onChange={(e) => setBaseEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/30"
            />
          </div>

          <button
            onClick={handleGenerateAliases}
            disabled={!baseEmail.includes('@')}
            className="w-full morphic-btn py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Mail className="w-4 h-4" />
            Generate Aliases
          </button>

          {emailAliases.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/40">Use these for signups to track who sells your data:</p>
              {emailAliases.map((alias, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2"
                >
                  <span className="text-xs text-white font-mono truncate">{alias}</span>
                  <button
                    onClick={() => copyToClipboard(alias, `alias-${i}`)}
                    className="p-1.5 text-white/40 hover:text-white flex-shrink-0"
                  >
                    {copiedItem === `alias-${i}` ? <Check className="w-4 h-4 text-rose-gold-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============== Security Analysis Tab ==============

function SecurityAnalysis() {
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<URLAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const handleAnalyze = () => {
    if (!url.trim()) return

    setAnalyzing(true)

    // Add protocol if missing
    let fullUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = 'https://' + url
    }

    setTimeout(() => {
      setAnalysis(analyzeURL(fullUrl))
      setAnalyzing(false)
    }, 500)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30'
    if (score >= 60) return 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30'
    if (score >= 40) return 'from-orange-500/20 to-orange-600/20 border-orange-500/30'
    return 'from-red-500/20 to-red-600/20 border-red-500/30'
  }

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-rose-gold-400" />
          URL Security Analyzer
        </h3>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="Enter a URL to analyze (e.g., https://example.com)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/30"
          />
          <button
            onClick={handleAnalyze}
            disabled={!url.trim() || analyzing}
            className="morphic-btn bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-6 py-3 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Analyze
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis Results */}
      {analysis && (
        <div className="grid grid-cols-2 gap-6">
          {/* Score Card */}
          <div className={`morphic-card p-6 rounded-xl bg-gradient-to-br ${getScoreBg(analysis.score)} border`}>
            <div className="text-center">
              <div className={`text-5xl font-bold ${getScoreColor(analysis.score)} mb-2`}>
                {analysis.score}
              </div>
              <div className="text-white/60 text-sm">Security Score</div>
              <div className="mt-4 flex items-center justify-center gap-2">
                {analysis.isHttps ? (
                  <span className="flex items-center gap-1 text-rose-gold-400 text-sm">
                    <Lock className="w-4 h-4" />
                    HTTPS Secure
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Not HTTPS
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Domain Info */}
          <div className="morphic-card p-6 rounded-xl">
            <h4 className="text-sm font-medium text-white/60 mb-3">Domain Information</h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-white/40">URL</p>
                <p className="text-sm text-white break-all">{analysis.url}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">Domain</p>
                <p className="text-sm text-white">{analysis.domain}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">Protocol</p>
                <p className="text-sm text-white">{analysis.isHttps ? 'HTTPS (Encrypted)' : 'HTTP (Not Encrypted)'}</p>
              </div>
            </div>
          </div>

          {/* Risks */}
          <div className="morphic-card p-6 rounded-xl">
            <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              Potential Risks
            </h4>
            {analysis.risks.length > 0 ? (
              <div className="space-y-2">
                {analysis.risks.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-white/80">{risk}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-rose-gold-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                No obvious risks detected
              </p>
            )}
          </div>

          {/* Recommendations */}
          <div className="morphic-card p-6 rounded-xl">
            <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-rose-gold-400" />
              Recommendations
            </h4>
            <div className="space-y-2">
              {analysis.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
                  <span className="text-white/80">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!analysis && (
        <div className="morphic-card p-12 rounded-xl text-center">
          <Globe className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">URL Security Analysis</h3>
          <p className="text-white/50 max-w-md mx-auto">
            Enter any URL to analyze its security. We will check for HTTPS, suspicious patterns,
            potential phishing attempts, and provide safety recommendations.
          </p>
        </div>
      )}
    </div>
  )
}

// ============== Data Management Tab ==============

function DataManagement() {
  const [exporting, setExporting] = useState(false)
  const [exportComplete, setExportComplete] = useState(false)

  const exportAllData = () => {
    setExporting(true)

    const data: Record<string, unknown> = {
      exportDate: new Date().toISOString(),
      localStorage: {} as Record<string, string>,
      sessionStorage: {} as Record<string, string>,
      cookies: document.cookie,
    }

    // Export localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        (data.localStorage as Record<string, string>)[key] = localStorage.getItem(key) || ''
      }
    }

    // Export sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key) {
        (data.sessionStorage as Record<string, string>)[key] = sessionStorage.getItem(key) || ''
      }
    }

    setTimeout(() => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `privacy-fortress-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      setExporting(false)
      setExportComplete(true)
      setTimeout(() => setExportComplete(false), 3000)
    }, 1000)
  }

  const clearAllPlatformData = () => {
    if (confirm('Are you sure you want to clear ALL platform data? This action cannot be undone.')) {
      localStorage.clear()
      sessionStorage.clear()

      // Clear cookies
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [key] = cookie.trim().split('=')
        if (key) {
          document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
        }
      }

      // Reload the page
      window.location.reload()
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Export Data */}
        <div className="morphic-card p-6 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-gold-400/20 border border-rose-gold-400/30 flex items-center justify-center">
              <Download className="w-6 h-6 text-rose-gold-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">Export All Data</h3>
              <p className="text-sm text-white/50 mb-4">
                Download all locally stored data including localStorage, sessionStorage, and cookies as a JSON file.
              </p>
              <button
                onClick={exportAllData}
                disabled={exporting}
                className="morphic-btn px-4 py-2 text-sm flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : exportComplete ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-rose-gold-400" />
                    Exported!
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Clear All Data */}
        <div className="morphic-card p-6 rounded-xl border border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">Clear All Platform Data</h3>
              <p className="text-sm text-white/50 mb-4">
                Permanently delete all locally stored data. This will reset the application to its initial state.
              </p>
              <button
                onClick={clearAllPlatformData}
                className="morphic-btn bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 px-4 py-2 text-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Settings Info */}
      <div className="morphic-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-rose-gold-400" />
          Browser Privacy Settings
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); alert('Navigate to your browser settings to configure privacy options') }}
            className="flex items-center gap-3 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <Globe className="w-5 h-5 text-white/40 group-hover:text-white/60" />
            <div>
              <p className="text-sm text-white">Browser Privacy Settings</p>
              <p className="text-xs text-white/40">Configure tracking protection, cookies, and more</p>
            </div>
            <ExternalLink className="w-4 h-4 text-white/20 ml-auto" />
          </a>

          <a
            href="#"
            onClick={(e) => { e.preventDefault(); alert('Navigate to your browser settings to manage extensions') }}
            className="flex items-center gap-3 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <Shield className="w-5 h-5 text-white/40 group-hover:text-white/60" />
            <div>
              <p className="text-sm text-white">Security Extensions</p>
              <p className="text-xs text-white/40">Manage ad blockers and privacy extensions</p>
            </div>
            <ExternalLink className="w-4 h-4 text-white/20 ml-auto" />
          </a>
        </div>
      </div>

      {/* Privacy Checklist */}
      <PrivacyChecklist />
    </div>
  )
}

// ============== Privacy Checklist Component ==============

function PrivacyChecklist() {
  const [checklist, setChecklist] = useState<PrivacyCheckItem[]>([
    { id: '1', title: 'Use a password manager', description: 'Store unique passwords for each account', checked: false, category: 'account' },
    { id: '2', title: 'Enable two-factor authentication', description: 'Add extra security to important accounts', checked: false, category: 'account' },
    { id: '3', title: 'Review app permissions', description: 'Check what data apps can access', checked: false, category: 'device' },
    { id: '4', title: 'Clear browser history regularly', description: 'Remove browsing data periodically', checked: false, category: 'browser' },
    { id: '5', title: 'Use HTTPS everywhere', description: 'Ensure encrypted connections', checked: false, category: 'online' },
    { id: '6', title: 'Check privacy settings on social media', description: 'Limit who can see your information', checked: false, category: 'online' },
    { id: '7', title: 'Use private browsing for sensitive tasks', description: 'Prevent local tracking', checked: false, category: 'browser' },
    { id: '8', title: 'Keep software updated', description: 'Install security patches promptly', checked: false, category: 'device' },
    { id: '9', title: 'Use unique email aliases', description: 'Track who shares your data', checked: false, category: 'account' },
    { id: '10', title: 'Review connected apps and services', description: 'Remove unused OAuth connections', checked: false, category: 'account' },
  ])

  const toggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ))
  }

  const completedCount = checklist.filter(i => i.checked).length
  const progress = (completedCount / checklist.length) * 100

  const categories = ['browser', 'account', 'device', 'online'] as const
  const categoryLabels: Record<string, string> = {
    browser: 'Browser',
    account: 'Account',
    device: 'Device',
    online: 'Online'
  }
  const categoryIcons: Record<string, typeof Globe> = {
    browser: Globe,
    account: User,
    device: HardDrive,
    online: Shield
  }

  return (
    <div className="morphic-card p-6 rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-rose-gold-400" />
          Privacy Checklist
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/60">{completedCount}/{checklist.length} completed</span>
          <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {categories.map(category => {
          const Icon = categoryIcons[category]
          const items = checklist.filter(i => i.category === category)

          return (
            <div key={category}>
              <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {categoryLabels[category]}
              </h4>
              <div className="space-y-2">
                {items.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      item.checked ? 'bg-rose-gold-400/10' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 rounded border-white/20 bg-white/5 text-rose-gold-400 focus:ring-rose-gold-400/50"
                    />
                    <div>
                      <p className={`text-sm ${item.checked ? 'text-rose-gold-400 line-through' : 'text-white'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-white/40">{item.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============== Main Component ==============

type TabType = 'dashboard' | 'tools' | 'security' | 'data'

export default function PrivacyFortressView() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-rose-gold-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
              <Lock className="w-5 h-5 text-dark-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Privacy Fortress</h2>
              <p className="text-xs text-rose-gold-400/70">Alabobai - Data security and privacy management</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <TabButton
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            icon={Eye}
            label="Dashboard"
          />
          <TabButton
            active={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            icon={Key}
            label="Privacy Tools"
          />
          <TabButton
            active={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
            icon={Shield}
            label="Security Analysis"
          />
          <TabButton
            active={activeTab === 'data'}
            onClick={() => setActiveTab('data')}
            icon={Database}
            label="Data Management"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
        {activeTab === 'dashboard' && <PrivacyDashboard />}
        {activeTab === 'tools' && <PrivacyTools />}
        {activeTab === 'security' && <SecurityAnalysis />}
        {activeTab === 'data' && <DataManagement />}
      </div>
    </div>
  )
}
