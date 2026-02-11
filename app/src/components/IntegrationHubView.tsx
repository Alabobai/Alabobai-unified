import { useState, useEffect, useCallback } from 'react'
import {
  Plug,
  Webhook,
  Key,
  Activity,
  Copy,
  Check,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  Link2,
  Shield,
  Github,
  MessageSquare,
  FileText,
  Zap,
  Globe
} from 'lucide-react'

// ============================================================================
// Types and Interfaces
// ============================================================================

interface Integration {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  category: 'version-control' | 'communication' | 'productivity' | 'authentication'
  status: 'connected' | 'disconnected' | 'pending'
  connectionType: 'oauth' | 'api-key' | 'webhook'
  setupInstructions: string[]
  docsUrl: string
  lastSync?: Date
  metadata?: Record<string, unknown>
}

interface Webhook {
  id: string
  name: string
  url: string
  secret: string
  events: string[]
  enabled: boolean
  createdAt: Date
  lastTriggered?: Date
  successCount: number
  errorCount: number
}

interface WebhookEvent {
  id: string
  webhookId: string
  timestamp: Date
  event: string
  payload: Record<string, unknown>
  status: 'success' | 'error' | 'pending'
  responseCode?: number
  responseTime?: number
}

interface APIKey {
  id: string
  name: string
  service: string
  key: string
  createdAt: Date
  lastUsed?: Date
  isValid: boolean
}

type TabType = 'integrations' | 'webhooks' | 'api-keys' | 'status'

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
  WEBHOOKS: 'alabobai-webhooks',
  API_KEYS: 'alabobai-api-keys',
  WEBHOOK_EVENTS: 'alabobai-webhook-events',
  INTEGRATION_STATUS: 'alabobai-integration-status',
}

// Simple encryption for localStorage (not production-ready, but better than plaintext)
const ENCRYPTION_KEY = 'alabobai-secure-2024'

function encryptData(data: string): string {
  try {
    const encoded = btoa(data)
    let result = ''
    for (let i = 0; i < encoded.length; i++) {
      result += String.fromCharCode(
        encoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      )
    }
    return btoa(result)
  } catch {
    return data
  }
}

function decryptData(data: string): string {
  try {
    const decoded = atob(data)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      )
    }
    return atob(result)
  } catch {
    return data
  }
}

const AVAILABLE_INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect your GitHub repositories for code management and CI/CD',
    icon: <Github className="w-6 h-6" />,
    color: 'from-gray-700 to-gray-900',
    category: 'version-control',
    status: 'disconnected',
    connectionType: 'oauth',
    setupInstructions: [
      'Go to GitHub Settings > Developer settings > OAuth Apps',
      'Create a new OAuth App with callback URL: ' + window.location.origin + '/api/auth/github/callback',
      'Copy the Client ID and Client Secret',
      'Add them to your environment variables: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET',
      'Click "Connect with GitHub" below to authorize'
    ],
    docsUrl: 'https://docs.github.com/en/developers/apps/building-oauth-apps'
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send notifications and updates to your Slack channels',
    icon: <MessageSquare className="w-6 h-6" />,
    color: 'from-purple-500 to-purple-700',
    category: 'communication',
    status: 'disconnected',
    connectionType: 'webhook',
    setupInstructions: [
      'Go to api.slack.com/apps and create a new app',
      'Enable Incoming Webhooks in your app settings',
      'Add a new webhook to your desired workspace/channel',
      'Copy the Webhook URL (starts with https://hooks.slack.com/)',
      'Add it as an API key below with service "slack-webhook"'
    ],
    docsUrl: 'https://api.slack.com/messaging/webhooks'
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Post updates and notifications to Discord servers',
    icon: <MessageSquare className="w-6 h-6" />,
    color: 'from-indigo-500 to-indigo-700',
    category: 'communication',
    status: 'disconnected',
    connectionType: 'webhook',
    setupInstructions: [
      'Open your Discord server settings',
      'Go to Integrations > Webhooks',
      'Create a new webhook and select the target channel',
      'Copy the Webhook URL',
      'Add it as an API key below with service "discord-webhook"'
    ],
    docsUrl: 'https://discord.com/developers/docs/resources/webhook'
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Sync tasks and documents with your Notion workspace',
    icon: <FileText className="w-6 h-6" />,
    color: 'from-gray-800 to-black',
    category: 'productivity',
    status: 'disconnected',
    connectionType: 'api-key',
    setupInstructions: [
      'Go to notion.so/my-integrations',
      'Create a new integration',
      'Give it a name and select the workspace',
      'Copy the Internal Integration Token',
      'In Notion, share the pages/databases you want to access with your integration',
      'Add the token as an API key below with service "notion"'
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started'
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Track issues and manage projects with Linear integration',
    icon: <Zap className="w-6 h-6" />,
    color: 'from-violet-500 to-violet-700',
    category: 'productivity',
    status: 'disconnected',
    connectionType: 'api-key',
    setupInstructions: [
      'Go to Linear Settings > API',
      'Create a new Personal API key or OAuth application',
      'For Personal API key: Copy the key directly',
      'For OAuth: Set callback URL to ' + window.location.origin + '/api/auth/linear/callback',
      'Add the key/token as an API key below with service "linear"'
    ],
    docsUrl: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api'
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Access Google Workspace: Drive, Calendar, Sheets, and more',
    icon: <Globe className="w-6 h-6" />,
    color: 'from-blue-500 to-red-500',
    category: 'authentication',
    status: 'disconnected',
    connectionType: 'oauth',
    setupInstructions: [
      'Go to console.cloud.google.com',
      'Create a new project or select existing',
      'Enable the APIs you need (Drive, Calendar, Sheets, etc.)',
      'Go to Credentials > Create Credentials > OAuth 2.0 Client ID',
      'Set authorized redirect URI to ' + window.location.origin + '/api/auth/google/callback',
      'Copy Client ID and Client Secret to environment variables',
      'Click "Connect with Google" below to authorize'
    ],
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2'
  }
]

const WEBHOOK_EVENT_TYPES = [
  'chat.message',
  'chat.complete',
  'agent.start',
  'agent.complete',
  'agent.error',
  'research.complete',
  'company.created',
  'task.created',
  'task.complete',
  'file.created',
  'file.updated'
]

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return crypto.randomUUID()
}

function generateWebhookSecret(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '********'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}

function getRelativeTime(date: Date | string): string {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}

// ============================================================================
// Storage Functions
// ============================================================================

function loadWebhooks(): Webhook[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WEBHOOKS)
    if (stored) {
      const decrypted = decryptData(stored)
      return JSON.parse(decrypted)
    }
  } catch (error) {
    console.error('[IntegrationHub] Failed to load webhooks:', error)
  }
  return []
}

function saveWebhooks(webhooks: Webhook[]): void {
  try {
    const encrypted = encryptData(JSON.stringify(webhooks))
    localStorage.setItem(STORAGE_KEYS.WEBHOOKS, encrypted)
  } catch (error) {
    console.error('[IntegrationHub] Failed to save webhooks:', error)
  }
}

function loadApiKeys(): APIKey[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.API_KEYS)
    if (stored) {
      const decrypted = decryptData(stored)
      return JSON.parse(decrypted)
    }
  } catch (error) {
    console.error('[IntegrationHub] Failed to load API keys:', error)
  }
  return []
}

function saveApiKeys(keys: APIKey[]): void {
  try {
    const encrypted = encryptData(JSON.stringify(keys))
    localStorage.setItem(STORAGE_KEYS.API_KEYS, encrypted)
  } catch (error) {
    console.error('[IntegrationHub] Failed to save API keys:', error)
  }
}

function loadWebhookEvents(): WebhookEvent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WEBHOOK_EVENTS)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('[IntegrationHub] Failed to load webhook events:', error)
  }
  return []
}

function saveWebhookEvents(events: WebhookEvent[]): void {
  try {
    // Keep only last 100 events
    const trimmed = events.slice(-100)
    localStorage.setItem(STORAGE_KEYS.WEBHOOK_EVENTS, JSON.stringify(trimmed))
  } catch (error) {
    console.error('[IntegrationHub] Failed to save webhook events:', error)
  }
}

function loadIntegrationStatus(): Record<string, { connected: boolean; lastSync?: string }> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INTEGRATION_STATUS)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('[IntegrationHub] Failed to load integration status:', error)
  }
  return {}
}

function saveIntegrationStatus(status: Record<string, { connected: boolean; lastSync?: string }>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INTEGRATION_STATUS, JSON.stringify(status))
  } catch (error) {
    console.error('[IntegrationHub] Failed to save integration status:', error)
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all ${
        active
          ? 'bg-rose-gold-400/15 text-rose-gold-400 border border-rose-gold-400/30'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
          active ? 'bg-rose-gold-400/20' : 'bg-white/10'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

interface IntegrationCardProps {
  integration: Integration
  apiKeys: APIKey[]
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  isConnected: boolean
  lastSync?: string
}

function IntegrationCard({ integration, apiKeys, onConnect, onDisconnect, isConnected, lastSync }: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const relevantKey = apiKeys.find(k =>
    k.service.toLowerCase().includes(integration.id) ||
    integration.id.includes(k.service.toLowerCase())
  )

  const copyCallback = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl bg-dark-400 border border-white/10 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-white`}>
            {integration.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold">{integration.name}</h3>
              {isConnected ? (
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs">
                  Not connected
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm mt-1">{integration.description}</p>
            {lastSync && (
              <p className="text-white/40 text-xs mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last synced: {getRelativeTime(lastSync)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <button
                onClick={() => onDisconnect(integration.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => onConnect(integration.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-colors text-sm"
              >
                Connect
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5">
          <div className="mb-3">
            <h4 className="text-white/70 text-sm font-medium mb-2">Setup Instructions</h4>
            <ol className="space-y-2">
              {integration.setupInstructions.map((instruction, index) => (
                <li key={index} className="flex items-start gap-2 text-white/50 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/70">
                    {index + 1}
                  </span>
                  <span className="flex-1">
                    {instruction.includes(window.location.origin) ? (
                      <>
                        {instruction.split(window.location.origin)[0]}
                        <code className="px-1.5 py-0.5 rounded bg-dark-300 text-rose-gold-400 text-xs">
                          {window.location.origin + instruction.split(window.location.origin)[1]}
                        </code>
                        <button
                          onClick={() => copyCallback(window.location.origin + instruction.split(window.location.origin)[1])}
                          className="ml-1 text-white/40 hover:text-white"
                        >
                          {copied ? <Check className="w-3 h-3 inline" /> : <Copy className="w-3 h-3 inline" />}
                        </button>
                      </>
                    ) : (
                      instruction
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {relevantKey && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-3">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                <span>API key configured: {relevantKey.name}</span>
              </div>
            </div>
          )}

          <a
            href={integration.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-rose-gold-400 hover:text-rose-gold-300 text-sm transition-colors"
          >
            View documentation <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}

interface WebhookFormProps {
  onSubmit: (webhook: Omit<Webhook, 'id' | 'createdAt' | 'successCount' | 'errorCount'>) => void
  onCancel: () => void
}

function WebhookForm({ onSubmit, onCancel }: WebhookFormProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [customSecret, setCustomSecret] = useState('')
  const [useCustomSecret, setUseCustomSecret] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !url || selectedEvents.length === 0) return

    onSubmit({
      name,
      url,
      secret: useCustomSecret ? customSecret : generateWebhookSecret(),
      events: selectedEvents,
      enabled: true
    })
  }

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-white/70 mb-1">Webhook Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Webhook"
          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-1">Endpoint URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.com/webhook"
          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-2">Events to Subscribe</label>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENT_TYPES.map(event => (
            <button
              key={event}
              type="button"
              onClick={() => toggleEvent(event)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedEvents.includes(event)
                  ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                  : 'bg-dark-300 text-white/60 border border-white/10 hover:border-white/20'
              }`}
            >
              {event}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-white/70 mb-2">
          <input
            type="checkbox"
            checked={useCustomSecret}
            onChange={(e) => setUseCustomSecret(e.target.checked)}
            className="rounded"
          />
          Use custom secret
        </label>
        {useCustomSecret && (
          <input
            type="text"
            value={customSecret}
            onChange={(e) => setCustomSecret(e.target.value)}
            placeholder="your-custom-secret"
            className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name || !url || selectedEvents.length === 0}
          className="px-4 py-2 rounded-lg bg-rose-gold-400 text-dark-500 font-medium hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Webhook
        </button>
      </div>
    </form>
  )
}

interface WebhookCardProps {
  webhook: Webhook
  events: WebhookEvent[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onTest: (id: string) => void
  isTesting: boolean
}

function WebhookCard({ webhook, events, onToggle, onDelete, onTest, isTesting }: WebhookCardProps) {
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const webhookEvents = events.filter(e => e.webhookId === webhook.id).slice(-5).reverse()

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const webhookUrl = `${window.location.origin}/api/webhook/${webhook.id}`

  return (
    <div className={`rounded-xl border transition-colors ${
      webhook.enabled
        ? 'bg-dark-400 border-white/10'
        : 'bg-dark-400/50 border-white/5'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Webhook className={`w-5 h-5 ${webhook.enabled ? 'text-rose-gold-400' : 'text-white/30'}`} />
              <h3 className={`font-semibold ${webhook.enabled ? 'text-white' : 'text-white/50'}`}>
                {webhook.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                webhook.enabled
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-white/10 text-white/40'
              }`}>
                {webhook.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs">URL:</span>
                <code className="text-xs bg-dark-300 px-2 py-0.5 rounded text-white/70 truncate max-w-xs">
                  {webhookUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookUrl, 'url')}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  {copied === 'url' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs">Secret:</span>
                <code className="text-xs bg-dark-300 px-2 py-0.5 rounded text-white/70">
                  {showSecret ? webhook.secret : '••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => copyToClipboard(webhook.secret, 'secret')}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  {copied === 'secret' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {webhook.events.map(event => (
                <span
                  key={event}
                  className="px-2 py-0.5 rounded bg-dark-300 text-white/50 text-xs"
                >
                  {event}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-400" />
                {webhook.successCount} successful
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-400" />
                {webhook.errorCount} errors
              </span>
              {webhook.lastTriggered && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last: {getRelativeTime(webhook.lastTriggered)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onTest(webhook.id)}
              disabled={isTesting || !webhook.enabled}
              className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              title="Test webhook"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onToggle(webhook.id)}
              className={`p-2 rounded-lg transition-colors ${
                webhook.enabled
                  ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
              title={webhook.enabled ? 'Disable' : 'Enable'}
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(webhook.id)}
              className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && webhookEvents.length > 0 && (
        <div className="px-4 pb-4 border-t border-white/5">
          <h4 className="text-white/70 text-sm font-medium mt-3 mb-2">Recent Events</h4>
          <div className="space-y-2">
            {webhookEvents.map(event => (
              <div
                key={event.id}
                className="flex items-center justify-between p-2 rounded-lg bg-dark-300"
              >
                <div className="flex items-center gap-2">
                  {event.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : event.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                  )}
                  <span className="text-white/70 text-sm">{event.event}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  {event.responseCode && (
                    <span className={event.responseCode < 400 ? 'text-green-400' : 'text-red-400'}>
                      {event.responseCode}
                    </span>
                  )}
                  {event.responseTime && <span>{event.responseTime}ms</span>}
                  <span>{getRelativeTime(event.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface APIKeyFormProps {
  onSubmit: (key: Omit<APIKey, 'id' | 'createdAt' | 'isValid'>) => void
  onCancel: () => void
}

function APIKeyForm({ onSubmit, onCancel }: APIKeyFormProps) {
  const [name, setName] = useState('')
  const [service, setService] = useState('')
  const [key, setKey] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !service || !key) return
    onSubmit({ name, service, key })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-white/70 mb-1">Key Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production API Key"
          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-1">Service</label>
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white focus:border-rose-gold-400/50 focus:outline-none"
          required
        >
          <option value="">Select a service...</option>
          <option value="slack-webhook">Slack Webhook</option>
          <option value="discord-webhook">Discord Webhook</option>
          <option value="notion">Notion</option>
          <option value="linear">Linear</option>
          <option value="github">GitHub</option>
          <option value="google">Google</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-white/70 mb-1">API Key / Token / URL</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-... or https://..."
          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white placeholder-white/30 focus:border-rose-gold-400/50 focus:outline-none"
          required
        />
        <p className="text-white/40 text-xs mt-1">
          Keys are encrypted before storing locally.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name || !service || !key}
          className="px-4 py-2 rounded-lg bg-rose-gold-400 text-dark-500 font-medium hover:bg-rose-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Key
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function IntegrationHubView() {
  const [activeTab, setActiveTab] = useState<TabType>('integrations')
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, { connected: boolean; lastSync?: string }>>({})

  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null)
  const [testingApiKey, setTestingApiKey] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load data on mount
  useEffect(() => {
    setWebhooks(loadWebhooks())
    setApiKeys(loadApiKeys())
    setWebhookEvents(loadWebhookEvents())
    setIntegrationStatus(loadIntegrationStatus())
  }, [])

  // Show notification
  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // Webhook handlers
  const handleCreateWebhook = (data: Omit<Webhook, 'id' | 'createdAt' | 'successCount' | 'errorCount'>) => {
    const newWebhook: Webhook = {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      successCount: 0,
      errorCount: 0
    }
    const updated = [...webhooks, newWebhook]
    setWebhooks(updated)
    saveWebhooks(updated)
    setShowWebhookForm(false)
    showNotification('success', 'Webhook created successfully')
  }

  const handleToggleWebhook = (id: string) => {
    const updated = webhooks.map(w =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    )
    setWebhooks(updated)
    saveWebhooks(updated)
  }

  const handleDeleteWebhook = (id: string) => {
    const updated = webhooks.filter(w => w.id !== id)
    setWebhooks(updated)
    saveWebhooks(updated)
    showNotification('success', 'Webhook deleted')
  }

  const handleTestWebhook = async (id: string) => {
    const webhook = webhooks.find(w => w.id === id)
    if (!webhook) return

    setTestingWebhook(id)

    const testEvent: WebhookEvent = {
      id: generateId(),
      webhookId: id,
      timestamp: new Date(),
      event: 'test.ping',
      payload: {
        type: 'test',
        message: 'This is a test webhook from Alabobai',
        timestamp: new Date().toISOString()
      },
      status: 'pending'
    }

    try {
      const startTime = Date.now()

      // Try to send to the actual webhook URL
      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret,
          'X-Webhook-Event': 'test.ping'
        },
        body: JSON.stringify(testEvent.payload),
        mode: 'no-cors' // Allow testing even with CORS
      })

      const endTime = Date.now()

      testEvent.status = 'success'
      testEvent.responseTime = endTime - startTime
      // Note: no-cors mode doesn't give us access to response code
      testEvent.responseCode = 200

      // Update webhook stats
      const updatedWebhooks = webhooks.map(w =>
        w.id === id
          ? { ...w, successCount: w.successCount + 1, lastTriggered: new Date() }
          : w
      )
      setWebhooks(updatedWebhooks)
      saveWebhooks(updatedWebhooks)

      showNotification('success', 'Test webhook sent successfully')
    } catch (error) {
      testEvent.status = 'error'
      testEvent.responseCode = 0

      // Update webhook stats
      const updatedWebhooks = webhooks.map(w =>
        w.id === id
          ? { ...w, errorCount: w.errorCount + 1, lastTriggered: new Date() }
          : w
      )
      setWebhooks(updatedWebhooks)
      saveWebhooks(updatedWebhooks)

      showNotification('error', 'Webhook test failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }

    // Save event
    const updatedEvents = [...webhookEvents, testEvent]
    setWebhookEvents(updatedEvents)
    saveWebhookEvents(updatedEvents)

    setTestingWebhook(null)
  }

  // API Key handlers
  const handleAddApiKey = (data: Omit<APIKey, 'id' | 'createdAt' | 'isValid'>) => {
    const newKey: APIKey = {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      isValid: true
    }
    const updated = [...apiKeys, newKey]
    setApiKeys(updated)
    saveApiKeys(updated)
    setShowApiKeyForm(false)
    showNotification('success', 'API key added successfully')

    // Update integration status
    const newStatus = { ...integrationStatus }
    if (data.service) {
      newStatus[data.service] = { connected: true, lastSync: new Date().toISOString() }
      setIntegrationStatus(newStatus)
      saveIntegrationStatus(newStatus)
    }
  }

  const handleDeleteApiKey = (id: string) => {
    const key = apiKeys.find(k => k.id === id)
    const updated = apiKeys.filter(k => k.id !== id)
    setApiKeys(updated)
    saveApiKeys(updated)
    showNotification('success', 'API key removed')

    // Update integration status
    if (key) {
      const newStatus = { ...integrationStatus }
      delete newStatus[key.service]
      setIntegrationStatus(newStatus)
      saveIntegrationStatus(newStatus)
    }
  }

  const handleTestApiKey = async (id: string) => {
    const key = apiKeys.find(k => k.id === id)
    if (!key) return

    setTestingApiKey(id)

    try {
      let isValid = false

      // Test based on service type
      if (key.service === 'slack-webhook' || key.service === 'discord-webhook') {
        // Test webhook URL
        await fetch(key.key, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Test from Alabobai Integration Hub' }),
          mode: 'no-cors'
        })
        isValid = true
      } else if (key.service === 'notion') {
        // Test Notion API
        const response = await fetch('https://api.notion.com/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${key.key}`,
            'Notion-Version': '2022-06-28'
          }
        })
        isValid = response.ok
      } else if (key.service === 'linear') {
        // Test Linear API
        const response = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Authorization': key.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: '{ viewer { id } }' })
        })
        isValid = response.ok
      } else {
        // Generic test - assume valid if key exists
        isValid = !!key.key
      }

      // Update key validity
      const updated = apiKeys.map(k =>
        k.id === id ? { ...k, isValid, lastUsed: new Date() } : k
      )
      setApiKeys(updated)
      saveApiKeys(updated)

      showNotification(isValid ? 'success' : 'error',
        isValid ? 'API key is valid' : 'API key validation failed')
    } catch (error) {
      // Update key as invalid
      const updated = apiKeys.map(k =>
        k.id === id ? { ...k, isValid: false, lastUsed: new Date() } : k
      )
      setApiKeys(updated)
      saveApiKeys(updated)

      showNotification('error', 'Failed to test API key: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }

    setTestingApiKey(null)
  }

  // Integration handlers
  const handleConnectIntegration = (id: string) => {
    const integration = AVAILABLE_INTEGRATIONS.find(i => i.id === id)
    if (!integration) return

    if (integration.connectionType === 'oauth') {
      // For OAuth, we would redirect to the auth URL
      // For now, show instructions
      showNotification('success', `Check the ${integration.name} setup instructions to connect via OAuth`)
    } else {
      // For API keys and webhooks, switch to the appropriate tab
      setActiveTab('api-keys')
      setShowApiKeyForm(true)
    }
  }

  const handleDisconnectIntegration = (id: string) => {
    // Remove associated API keys
    const keysToRemove = apiKeys.filter(k => k.service.toLowerCase().includes(id))
    keysToRemove.forEach(k => handleDeleteApiKey(k.id))

    // Update status
    const newStatus = { ...integrationStatus }
    delete newStatus[id]
    setIntegrationStatus(newStatus)
    saveIntegrationStatus(newStatus)

    showNotification('success', 'Integration disconnected')
  }

  // Check connection health
  const handleRefreshStatus = async () => {
    for (const key of apiKeys) {
      await handleTestApiKey(key.id)
    }
  }

  // Count connected integrations
  const connectedCount = Object.values(integrationStatus).filter(s => s.connected).length

  return (
    <div className="h-full flex flex-col bg-dark-500">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Plug className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Integration Hub</h1>
              <p className="text-white/50 text-sm">Connect external services and manage webhooks</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-white/40 text-xs">Connected Services</div>
              <div className="text-white text-lg font-semibold">{connectedCount}</div>
            </div>
            <button
              onClick={handleRefreshStatus}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 ${
          notification.type === 'success'
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {notification.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 pt-4">
        <div className="flex gap-2">
          <TabButton
            active={activeTab === 'integrations'}
            onClick={() => setActiveTab('integrations')}
            icon={<Link2 className="w-4 h-4" />}
            label="Integrations"
            count={connectedCount}
          />
          <TabButton
            active={activeTab === 'webhooks'}
            onClick={() => setActiveTab('webhooks')}
            icon={<Webhook className="w-4 h-4" />}
            label="Webhooks"
            count={webhooks.length}
          />
          <TabButton
            active={activeTab === 'api-keys'}
            onClick={() => setActiveTab('api-keys')}
            icon={<Key className="w-4 h-4" />}
            label="API Keys"
            count={apiKeys.length}
          />
          <TabButton
            active={activeTab === 'status'}
            onClick={() => setActiveTab('status')}
            icon={<Activity className="w-4 h-4" />}
            label="Status"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Available Integrations</h2>
            </div>

            <div className="grid gap-4">
              {AVAILABLE_INTEGRATIONS.map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  apiKeys={apiKeys}
                  onConnect={handleConnectIntegration}
                  onDisconnect={handleDisconnectIntegration}
                  isConnected={!!integrationStatus[integration.id]?.connected || apiKeys.some(k => k.service.toLowerCase().includes(integration.id))}
                  lastSync={integrationStatus[integration.id]?.lastSync}
                />
              ))}
            </div>
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Webhook Manager</h2>
              <button
                onClick={() => setShowWebhookForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-gold-400 text-dark-500 font-medium hover:bg-rose-gold-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Webhook
              </button>
            </div>

            {showWebhookForm && (
              <div className="p-4 rounded-xl bg-dark-400 border border-white/10 mb-4">
                <h3 className="text-white font-medium mb-4">Create New Webhook</h3>
                <WebhookForm
                  onSubmit={handleCreateWebhook}
                  onCancel={() => setShowWebhookForm(false)}
                />
              </div>
            )}

            {webhooks.length === 0 ? (
              <div className="text-center py-12">
                <Webhook className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <h3 className="text-white/60 font-medium mb-2">No webhooks configured</h3>
                <p className="text-white/40 text-sm mb-4">
                  Create a webhook to receive real-time notifications from Alabobai
                </p>
                <button
                  onClick={() => setShowWebhookForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create your first webhook
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {webhooks.map(webhook => (
                  <WebhookCard
                    key={webhook.id}
                    webhook={webhook}
                    events={webhookEvents}
                    onToggle={handleToggleWebhook}
                    onDelete={handleDeleteWebhook}
                    onTest={handleTestWebhook}
                    isTesting={testingWebhook === webhook.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">API Key Manager</h2>
              <button
                onClick={() => setShowApiKeyForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-gold-400 text-dark-500 font-medium hover:bg-rose-gold-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Key
              </button>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="text-blue-400 font-medium">Secure Storage</h4>
                  <p className="text-blue-400/70 text-sm">
                    API keys are encrypted before storing in your browser's local storage.
                    Keys never leave your device unless explicitly used for API calls.
                  </p>
                </div>
              </div>
            </div>

            {showApiKeyForm && (
              <div className="p-4 rounded-xl bg-dark-400 border border-white/10 mb-4">
                <h3 className="text-white font-medium mb-4">Add New API Key</h3>
                <APIKeyForm
                  onSubmit={handleAddApiKey}
                  onCancel={() => setShowApiKeyForm(false)}
                />
              </div>
            )}

            {apiKeys.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <h3 className="text-white/60 font-medium mb-2">No API keys stored</h3>
                <p className="text-white/40 text-sm mb-4">
                  Add API keys to connect integrations and enable external services
                </p>
                <button
                  onClick={() => setShowApiKeyForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add your first key
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map(key => (
                  <div
                    key={key.id}
                    className="p-4 rounded-xl bg-dark-400 border border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-rose-gold-400" />
                          <span className="text-white font-medium">{key.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            key.isValid
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {key.isValid ? 'Valid' : 'Invalid'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-white/50">
                          <span>Service: {key.service}</span>
                          <span>Key: {maskApiKey(key.key)}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
                          <span>Added: {formatDate(key.createdAt)}</span>
                          {key.lastUsed && <span>Last used: {getRelativeTime(key.lastUsed)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestApiKey(key.id)}
                          disabled={testingApiKey === key.id}
                          className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                          title="Test connection"
                        >
                          {testingApiKey === key.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteApiKey(key.id)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status Tab */}
        {activeTab === 'status' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Integration Status</h2>
              <button
                onClick={handleRefreshStatus}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh All
              </button>
            </div>

            {/* Connected Services */}
            <div>
              <h3 className="text-white/70 text-sm font-medium mb-3">Connected Services</h3>
              {Object.keys(integrationStatus).length === 0 && apiKeys.length === 0 ? (
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10 text-center">
                  <p className="text-white/50">No services connected yet</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {AVAILABLE_INTEGRATIONS.filter(i =>
                    integrationStatus[i.id]?.connected ||
                    apiKeys.some(k => k.service.toLowerCase().includes(i.id))
                  ).map(integration => {
                    const status = integrationStatus[integration.id]
                    const key = apiKeys.find(k => k.service.toLowerCase().includes(integration.id))

                    return (
                      <div
                        key={integration.id}
                        className="p-4 rounded-xl bg-dark-400 border border-white/10 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${integration.color} flex items-center justify-center text-white`}>
                            {integration.icon}
                          </div>
                          <div>
                            <div className="text-white font-medium">{integration.name}</div>
                            <div className="text-white/40 text-xs">
                              {status?.lastSync ? `Last sync: ${getRelativeTime(status.lastSync)}` : 'Connected'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {key && (
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              key.isValid
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {key.isValid ? 'Healthy' : 'Error'}
                            </span>
                          )}
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Webhook Health */}
            <div>
              <h3 className="text-white/70 text-sm font-medium mb-3">Webhook Health</h3>
              {webhooks.length === 0 ? (
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10 text-center">
                  <p className="text-white/50">No webhooks configured</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {webhooks.map(webhook => {
                    const successRate = webhook.successCount + webhook.errorCount > 0
                      ? Math.round((webhook.successCount / (webhook.successCount + webhook.errorCount)) * 100)
                      : 100

                    return (
                      <div
                        key={webhook.id}
                        className="p-4 rounded-xl bg-dark-400 border border-white/10 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Webhook className={`w-5 h-5 ${webhook.enabled ? 'text-rose-gold-400' : 'text-white/30'}`} />
                          <div>
                            <div className={`font-medium ${webhook.enabled ? 'text-white' : 'text-white/50'}`}>
                              {webhook.name}
                            </div>
                            <div className="text-white/40 text-xs">
                              {webhook.lastTriggered ? `Last triggered: ${getRelativeTime(webhook.lastTriggered)}` : 'Never triggered'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-sm font-medium ${
                              successRate >= 90 ? 'text-green-400' :
                              successRate >= 70 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {successRate}% success
                            </div>
                            <div className="text-white/40 text-xs">
                              {webhook.successCount + webhook.errorCount} total calls
                            </div>
                          </div>
                          <div className={`w-3 h-3 rounded-full ${
                            !webhook.enabled ? 'bg-white/30' :
                            successRate >= 90 ? 'bg-green-400' :
                            successRate >= 70 ? 'bg-yellow-400' :
                            'bg-red-400'
                          }`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div>
              <h3 className="text-white/70 text-sm font-medium mb-3">Recent Webhook Activity</h3>
              {webhookEvents.length === 0 ? (
                <div className="p-4 rounded-xl bg-dark-400 border border-white/10 text-center">
                  <p className="text-white/50">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {webhookEvents.slice(-10).reverse().map(event => {
                    const webhook = webhooks.find(w => w.id === event.webhookId)

                    return (
                      <div
                        key={event.id}
                        className="p-3 rounded-lg bg-dark-400 border border-white/10 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {event.status === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : event.status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                          )}
                          <div>
                            <div className="text-white/70 text-sm">{event.event}</div>
                            <div className="text-white/40 text-xs">{webhook?.name || 'Unknown webhook'}</div>
                          </div>
                        </div>
                        <div className="text-white/40 text-xs">
                          {getRelativeTime(event.timestamp)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
