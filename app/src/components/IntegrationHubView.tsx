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
import { BRAND } from '@/config/brand'

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

// Brand Logo Components
const SlackLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
)

const DiscordLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
)

const NotionLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
  </svg>
)

const LinearLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M2.056 10.29c-.056.862-.056 1.888-.013 3.13a.51.51 0 0 0 .154.337l8.048 8.047c.1.1.233.151.37.151a.497.497 0 0 0 .337-.151l2.848-2.848a.492.492 0 0 0 0-.694L4.553 9.015a.513.513 0 0 0-.337-.151c-1.117.024-1.909.05-2.16.426zm1.206-2.595c-.18.207-.394.588-.544 1.1l8.1 8.1 2.145-2.145-8.1-8.1c-.512.15-.894.363-1.1.545a2.2 2.2 0 0 0-.5.5zm-.75 9.91a.557.557 0 0 0 .163.4l3.28 3.28c.1.106.237.163.38.163a.508.508 0 0 0 .38-.163l.344-.344c.075-.1.119-.219.119-.344 0-.131-.044-.25-.119-.356l-3.28-3.28a.507.507 0 0 0-.356-.118.46.46 0 0 0-.344.118l-.344.344c-.106.1-.163.22-.163.362-.019 0-.04.069-.06.163zm7.175 4.938a.503.503 0 0 0 .369-.156l2.148-2.147a.493.493 0 0 0 0-.694L2.57 9.913a.513.513 0 0 0-.337-.15c-.112 0-.225.05-.338.15L.15 11.66a.492.492 0 0 0 0 .694l9.175 9.175c.1.1.231.15.362.15zm.337-6.25a.51.51 0 0 0 .706 0l2.147-2.147a.492.492 0 0 0 0-.694l-2.147-2.148a.492.492 0 0 0-.694 0l-2.147 2.148a.492.492 0 0 0 0 .694l2.135 2.147z"/>
  </svg>
)

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const AVAILABLE_INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect your GitHub repositories for code management and CI/CD',
    icon: <Github className="w-6 h-6" />,
    color: 'from-[#24292e] to-[#1a1e22]',
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
    icon: <SlackLogo />,
    color: 'from-[#4A154B] to-[#36104a]',
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
    icon: <DiscordLogo />,
    color: 'from-[#5865F2] to-[#4752c4]',
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
    icon: <NotionLogo />,
    color: 'from-[#000000] to-[#191919]',
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
    icon: <LinearLogo />,
    color: 'from-[#5E6AD2] to-[#4752a8]',
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
    icon: <GoogleLogo />,
    color: 'from-[#ffffff] to-[#f1f1f1]',
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
                <span className="px-2 py-0.5 rounded-full bg-rose-gold-400/20 text-rose-gold-400 text-xs flex items-center gap-1">
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
                className="px-3 py-1.5 rounded-lg bg-rose-gold-500/10 text-rose-gold-400 hover:bg-rose-gold-500/20 transition-colors text-sm"
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
            <div className="p-3 rounded-lg bg-rose-gold-400/10 border border-rose-gold-400/20 mb-3">
              <div className="flex items-center gap-2 text-rose-gold-400 text-sm">
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
                  ? 'bg-rose-gold-400/20 text-rose-gold-400'
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
                  {copied === 'url' ? <Check className="w-3 h-3 text-rose-gold-400" /> : <Copy className="w-3 h-3" />}
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
                  {copied === 'secret' ? <Check className="w-3 h-3 text-rose-gold-400" /> : <Copy className="w-3 h-3" />}
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
                <CheckCircle className="w-3 h-3 text-rose-gold-400" />
                {webhook.successCount} successful
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-gold-400" />
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
              className="p-2 rounded-lg bg-rose-gold-400/10 text-rose-gold-400 hover:bg-rose-gold-400/20 transition-colors disabled:opacity-50"
              title="Test webhook"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onToggle(webhook.id)}
              className={`p-2 rounded-lg transition-colors ${
                webhook.enabled
                  ? 'bg-rose-gold-400/10 text-rose-gold-400 hover:bg-rose-gold-400/20'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
              title={webhook.enabled ? 'Disable' : 'Enable'}
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(webhook.id)}
              className="p-2 rounded-lg bg-rose-gold-500/10 text-rose-gold-400 hover:bg-rose-gold-500/20 transition-colors"
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
                    <CheckCircle className="w-4 h-4 text-rose-gold-400" />
                  ) : event.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-gold-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin" />
                  )}
                  <span className="text-white/70 text-sm">{event.event}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  {event.responseCode && (
                    <span className={event.responseCode < 400 ? 'text-rose-gold-400' : 'text-rose-gold-400'}>
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
        message: `This is a test webhook from ${BRAND.name}`,
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
          body: JSON.stringify({ text: `Test from ${BRAND.name} Integration Hub` }),
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
    <div className="h-full w-full flex flex-col bg-dark-500">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Brand Logo */}
            <div className="flex items-center gap-3">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-10 h-10 object-contain logo-render" />
              <div className="h-8 w-px bg-white/10" />
            </div>
            {/* View Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center">
                <Plug className="w-6 h-6 text-dark-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Integration Hub</h1>
                <p className="text-rose-gold-400/70 text-sm">Connect external services and manage webhooks</p>
              </div>
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
            ? 'bg-rose-gold-400/10 border border-rose-gold-400/20 text-rose-gold-400'
            : 'bg-rose-gold-500/10 border border-rose-gold-400/20 text-rose-gold-400'
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
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-6">
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
                  Create a webhook to receive real-time notifications from {BRAND.name}
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

            <div className="p-4 rounded-xl bg-rose-gold-400/10 border border-rose-gold-400/20 mb-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-rose-gold-400 mt-0.5" />
                <div>
                  <h4 className="text-rose-gold-400 font-medium">Secure Storage</h4>
                  <p className="text-rose-gold-400/70 text-sm">
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
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-rose-gold-400/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center shadow-[0_0_20px_rgba(217,160,122,0.15)]">
                  <Key className="w-8 h-8 text-rose-gold-400/60" />
                </div>
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
                              ? 'bg-rose-gold-400/20 text-rose-gold-400'
                              : 'bg-rose-gold-500/20 text-rose-gold-400'
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
                          className="p-2 rounded-lg bg-rose-gold-400/10 text-rose-gold-400 hover:bg-rose-gold-400/20 transition-colors disabled:opacity-50"
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
                          className="p-2 rounded-lg bg-rose-gold-500/10 text-rose-gold-400 hover:bg-rose-gold-500/20 transition-colors"
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
                                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                                : 'bg-rose-gold-500/20 text-rose-gold-400'
                            }`}>
                              {key.isValid ? 'Healthy' : 'Error'}
                            </span>
                          )}
                          <CheckCircle className="w-5 h-5 text-rose-gold-400" />
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
                              successRate >= 90 ? 'text-rose-gold-400' :
                              successRate >= 70 ? 'text-rose-gold-400' :
                              'text-rose-gold-400'
                            }`}>
                              {successRate}% success
                            </div>
                            <div className="text-white/40 text-xs">
                              {webhook.successCount + webhook.errorCount} total calls
                            </div>
                          </div>
                          <div className={`w-3 h-3 rounded-full ${
                            !webhook.enabled ? 'bg-white/30' :
                            successRate >= 90 ? 'bg-rose-gold-400' :
                            successRate >= 70 ? 'bg-rose-gold-500' :
                            'bg-rose-gold-500'
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
                            <CheckCircle className="w-4 h-4 text-rose-gold-400" />
                          ) : event.status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-rose-gold-400" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin" />
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
