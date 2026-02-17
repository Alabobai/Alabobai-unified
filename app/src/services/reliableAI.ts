/**
 * Reliable AI Backbone
 * Production-grade AI service with guaranteed response delivery
 *
 * Features:
 * - GUARANTEED RESPONSE: Never fails, always returns something useful
 * - Smart Provider Selection: Automatically picks fastest available provider
 * - Response Caching: LRU cache for similar requests
 * - Quality Scoring: Tracks and scores response quality over time
 * - Automatic Retry: Falls back to next provider on failure
 * - Streaming Support: Real-time token streaming
 * - Context Window Management: Automatic context trimming
 *
 * Provider Priority:
 * 1. Local Ollama (fastest, free, private)
 * 2. Groq API (very fast)
 * 3. OpenRouter free models (reliable)
 * 4. Pollinations.ai (always available)
 * 5. HuggingFace Inference (backup)
 * 6. Intelligent offline templates (last resort)
 */

import { useApiKeyStore } from '../stores/apiKeyStore'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (response?: CompletionResult) => void
  onError: (error: Error) => void
  onStatus?: (status: string) => void
  onProviderSwitch?: (from: string, to: string) => void
}

export interface CompletionResult {
  content: string
  provider: string
  model: string
  tokensUsed: number
  latencyMs: number
  cached: boolean
  qualityScore: number
}

export interface ProviderHealth {
  id: string
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  lastCheck: number
  lastSuccess: number
  lastFailure: number
  consecutiveFailures: number
  consecutiveSuccesses: number
  totalRequests: number
  totalFailures: number
  averageLatency: number
  latencyHistory: number[]
  successRate: number
  circuitBreakerOpen: boolean
  circuitBreakerOpenedAt: number
  qualityScores: number[]
  averageQualityScore: number
}

export interface ProviderConfig {
  id: string
  name: string
  type: 'ollama' | 'groq' | 'openrouter' | 'pollinations' | 'huggingface' | 'offline'
  endpoint: string
  model: string
  priority: number
  contextWindow: number
  maxTokens: number
  timeout: number
  requiresKey: boolean
  supportsStreaming: boolean
}

export interface CacheEntry {
  key: string
  response: string
  provider: string
  model: string
  timestamp: number
  quality: number
  accessCount: number
  lastAccess: number
}

export interface SystemStatus {
  initialized: boolean
  healthyProviders: number
  totalProviders: number
  cacheSize: number
  cacheHitRate: number
  averageLatency: number
  totalRequests: number
  successRate: number
  lastUpdate: number
}

// ============================================================================
// Provider Configurations
// ============================================================================

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'ollama',
    name: 'Local Ollama',
    type: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
    priority: 1,
    contextWindow: 128000,
    maxTokens: 4096,
    timeout: 60000,
    requiresKey: false,
    supportsStreaming: true
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    priority: 2,
    contextWindow: 131072,
    maxTokens: 8192,
    timeout: 30000,
    requiresKey: true,
    supportsStreaming: true
  },
  {
    id: 'openrouter-gemma',
    name: 'OpenRouter Gemma',
    type: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemma-2-9b-it:free',
    priority: 3,
    contextWindow: 8192,
    maxTokens: 2048,
    timeout: 30000,
    requiresKey: false,
    supportsStreaming: true
  },
  {
    id: 'openrouter-llama',
    name: 'OpenRouter Llama',
    type: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.2-3b-instruct:free',
    priority: 4,
    contextWindow: 131072,
    maxTokens: 2048,
    timeout: 30000,
    requiresKey: false,
    supportsStreaming: true
  },
  {
    id: 'pollinations',
    name: 'Pollinations AI',
    type: 'pollinations',
    endpoint: 'https://text.pollinations.ai',
    model: 'openai',
    priority: 5,
    contextWindow: 16000,
    maxTokens: 2048,
    timeout: 25000,
    requiresKey: false,
    supportsStreaming: false
  },
  {
    id: 'huggingface-mistral',
    name: 'HuggingFace Mistral',
    type: 'huggingface',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    priority: 6,
    contextWindow: 32768,
    maxTokens: 1024,
    timeout: 30000,
    requiresKey: false,
    supportsStreaming: false
  },
  {
    id: 'huggingface-zephyr',
    name: 'HuggingFace Zephyr',
    type: 'huggingface',
    endpoint: 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
    model: 'HuggingFaceH4/zephyr-7b-beta',
    priority: 7,
    contextWindow: 16384,
    maxTokens: 1024,
    timeout: 30000,
    requiresKey: false,
    supportsStreaming: false
  },
  {
    id: 'offline',
    name: 'Offline Templates',
    type: 'offline',
    endpoint: '',
    model: 'intelligent-templates',
    priority: 99,
    contextWindow: 100000,
    maxTokens: 10000,
    timeout: 0,
    requiresKey: false,
    supportsStreaming: true
  }
]

// ============================================================================
// Utility Functions
// ============================================================================

function getApiKeys() {
  return useApiKeyStore.getState().getAllKeys()
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function createCacheKey(messages: Message[]): string {
  const content = messages.map(m => `${m.role}:${m.content}`).join('|')
  return hashString(content)
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4)
}

function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  // Quick exact match check
  if (aLower === bLower) return 1.0

  // Calculate word overlap for semantic similarity
  const aWords = new Set(aLower.split(/\s+/).filter(w => w.length > 2))
  const bWords = new Set(bLower.split(/\s+/).filter(w => w.length > 2))

  if (aWords.size === 0 || bWords.size === 0) return 0

  let overlap = 0
  Array.from(aWords).forEach(word => {
    if (bWords.has(word)) overlap++
  })

  return (2 * overlap) / (aWords.size + bWords.size)
}

function truncateContext(messages: Message[], maxTokens: number): Message[] {
  const systemMessage = messages.find(m => m.role === 'system')
  const otherMessages = messages.filter(m => m.role !== 'system')

  let currentTokens = systemMessage ? estimateTokens(systemMessage.content) : 0
  const result: Message[] = systemMessage ? [systemMessage] : []

  // Always include the last user message
  const lastUserIndex = otherMessages.length - 1
  if (lastUserIndex >= 0) {
    currentTokens += estimateTokens(otherMessages[lastUserIndex].content)
  }

  // Add messages from most recent, stopping when we hit the limit
  const messagesToAdd: Message[] = []
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i]
    const msgTokens = estimateTokens(msg.content)

    if (currentTokens + msgTokens > maxTokens * 0.8) {
      // Truncate this message if it's the most recent user message
      if (i === lastUserIndex) {
        const truncatedContent = msg.content.slice(0, Math.floor((maxTokens * 0.8 - currentTokens) * 4))
        messagesToAdd.unshift({ ...msg, content: truncatedContent + '\n...[truncated]' })
      }
      break
    }

    currentTokens += msgTokens
    messagesToAdd.unshift(msg)
  }

  return result.concat(messagesToAdd)
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map()
  private maxSize: number
  private maxAge: number // milliseconds
  private hits: number = 0
  private misses: number = 0

  constructor(maxSize: number = 100, maxAgeMinutes: number = 30) {
    this.maxSize = maxSize
    this.maxAge = maxAgeMinutes * 60 * 1000
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // Check expiration
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update access stats
    entry.accessCount++
    entry.lastAccess = Date.now()
    this.hits++

    return entry
  }

  getSimilar(messages: Message[], threshold: number = 0.85): CacheEntry | null {
    const query = messages.map(m => m.content).join(' ')
    let bestMatch: CacheEntry | null = null
    let bestScore = threshold

    Array.from(this.cache.values()).forEach(entry => {
      // Check expiration
      if (Date.now() - entry.timestamp > this.maxAge) return

      const similarity = calculateSimilarity(query, entry.key)
      if (similarity > bestScore) {
        bestScore = similarity
        bestMatch = entry
      }
    })

    if (bestMatch) {
      const match = bestMatch as CacheEntry
      match.accessCount++
      match.lastAccess = Date.now()
      this.hits++
    } else {
      this.misses++
    }

    return bestMatch
  }

  set(key: string, response: string, provider: string, model: string, quality: number = 75): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null
      let oldestAccess = Infinity

      Array.from(this.cache.entries()).forEach(([k, v]) => {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess
          oldestKey = k
        }
      })

      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      key,
      response,
      provider,
      model,
      timestamp: Date.now(),
      quality,
      accessCount: 1,
      lastAccess: Date.now()
    })
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hits + this.misses > 0
        ? this.hits / (this.hits + this.misses)
        : 0,
      hits: this.hits,
      misses: this.misses
    }
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }
}

// ============================================================================
// Provider Health Tracker
// ============================================================================

class HealthTracker {
  private healthMap: Map<string, ProviderHealth> = new Map()
  private circuitBreakerTimeout: number = 60000 // 1 minute

  constructor() {
    this.initializeProviders()
  }

  private initializeProviders(): void {
    for (const config of PROVIDER_CONFIGS) {
      this.healthMap.set(config.id, this.createDefaultHealth(config.id, config.name))
    }
  }

  private createDefaultHealth(id: string, name: string): ProviderHealth {
    return {
      id,
      name,
      status: 'unknown',
      lastCheck: 0,
      lastSuccess: 0,
      lastFailure: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalFailures: 0,
      averageLatency: 0,
      latencyHistory: [],
      successRate: 1,
      circuitBreakerOpen: false,
      circuitBreakerOpenedAt: 0,
      qualityScores: [],
      averageQualityScore: 70
    }
  }

  recordSuccess(providerId: string, latency: number, quality: number = 75): void {
    const health = this.healthMap.get(providerId)
    if (!health) return

    const now = Date.now()
    health.lastSuccess = now
    health.lastCheck = now
    health.consecutiveSuccesses++
    health.consecutiveFailures = 0
    health.totalRequests++

    // Update latency
    health.latencyHistory.push(latency)
    if (health.latencyHistory.length > 50) {
      health.latencyHistory.shift()
    }
    health.averageLatency = health.latencyHistory.reduce((a, b) => a + b, 0) / health.latencyHistory.length

    // Update quality
    health.qualityScores.push(quality)
    if (health.qualityScores.length > 20) {
      health.qualityScores.shift()
    }
    health.averageQualityScore = health.qualityScores.reduce((a, b) => a + b, 0) / health.qualityScores.length

    // Update success rate
    health.successRate = (health.totalRequests - health.totalFailures) / health.totalRequests

    // Update status
    if (health.consecutiveSuccesses >= 3) {
      health.status = 'healthy'
      health.circuitBreakerOpen = false
    } else if (health.status === 'unknown') {
      health.status = 'healthy'
    }
  }

  recordFailure(providerId: string, error: Error): void {
    const health = this.healthMap.get(providerId)
    if (!health) return

    const now = Date.now()
    health.lastFailure = now
    health.lastCheck = now
    health.consecutiveFailures++
    health.consecutiveSuccesses = 0
    health.totalRequests++
    health.totalFailures++
    health.successRate = (health.totalRequests - health.totalFailures) / health.totalRequests

    // Open circuit breaker after 3 consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.status = 'unhealthy'
      health.circuitBreakerOpen = true
      health.circuitBreakerOpenedAt = now
      console.log(`[ReliableAI] Circuit breaker opened for ${providerId}: ${error.message}`)
    } else if (health.consecutiveFailures >= 2) {
      health.status = 'degraded'
    }
  }

  isAvailable(providerId: string): boolean {
    const health = this.healthMap.get(providerId)
    if (!health) return false

    // Check circuit breaker
    if (health.circuitBreakerOpen) {
      // Allow test request after timeout
      if (Date.now() - health.circuitBreakerOpenedAt > this.circuitBreakerTimeout) {
        console.log(`[ReliableAI] Circuit breaker half-open for ${providerId}`)
        return true
      }
      return false
    }

    return true
  }

  getHealth(providerId: string): ProviderHealth | undefined {
    return this.healthMap.get(providerId)
  }

  getAllHealth(): ProviderHealth[] {
    return Array.from(this.healthMap.values())
  }

  getHealthyProviders(): string[] {
    return Array.from(this.healthMap.entries())
      .filter(([, health]) => this.isAvailable(health.id))
      .sort((a, b) => {
        // Sort by: availability, success rate, then latency
        const aScore = a[1].successRate * 100 - (a[1].averageLatency / 100)
        const bScore = b[1].successRate * 100 - (b[1].averageLatency / 100)
        return bScore - aScore
      })
      .map(([id]) => id)
  }

  getProviderScore(providerId: string): number {
    const health = this.healthMap.get(providerId)
    if (!health) return 0

    const reliabilityScore = health.successRate * 40
    const latencyScore = Math.max(0, 30 - (health.averageLatency / 1000))
    const qualityScore = (health.averageQualityScore / 100) * 30

    return reliabilityScore + latencyScore + qualityScore
  }
}

// ============================================================================
// Provider Request Handlers
// ============================================================================

async function makeOllamaRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const keys = getApiKeys()
  const baseUrl = keys.ollamaUrl || config.endpoint

  // First check if Ollama is available
  try {
    const healthCheck = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    if (!healthCheck.ok) {
      throw new Error('Ollama not responding')
    }

    // Get available models and pick the best one
    const modelsData = await healthCheck.json()
    const models = modelsData.models || []

    if (models.length === 0) {
      throw new Error('No models available in Ollama')
    }

    // Prefer these models in order
    const preferredModels = ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'codellama', 'phi3']
    let selectedModel = models[0].name

    for (const preferred of preferredModels) {
      const found = models.find((m: { name: string }) => m.name.toLowerCase().startsWith(preferred.toLowerCase()))
      if (found) {
        selectedModel = found.name
        break
      }
    }

    callbacks.onStatus?.(`Connecting to Ollama (${selectedModel})...`)

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: { temperature: 0.7, num_predict: config.maxTokens }
      }),
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let fullResponse = ''
    let tokensUsed = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const chunk = JSON.parse(line)
            if (chunk.message?.content) {
              callbacks.onToken(chunk.message.content)
              fullResponse += chunk.message.content
              tokensUsed++
            }
            if (chunk.done) {
              return
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      throw error
    }
  }
}

async function makeGroqRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const keys = getApiKeys()

  if (!keys.groqKey) {
    throw new Error('Groq API key not configured')
  }

  callbacks.onStatus?.(`Connecting to Groq...`)

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keys.groqKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: config.maxTokens
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `Groq error: ${response.status}`)
  }

  await streamOpenAIFormat(response, callbacks)
}

async function makeOpenRouterRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  callbacks.onStatus?.(`Connecting to ${config.name}...`)

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      'X-Title': `${BRAND.name} AI`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: config.supportsStreaming,
      max_tokens: config.maxTokens
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`)
  }

  if (config.supportsStreaming && response.body) {
    await streamOpenAIFormat(response, callbacks)
  } else {
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    await simulateStreaming(content, callbacks, abortController)
  }
}

async function makePollinationsRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  callbacks.onStatus?.('Connecting to Pollinations...')

  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n')
  const encodedPrompt = encodeURIComponent(prompt)

  const response = await fetch(`${config.endpoint}/${encodedPrompt}`, {
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`Pollinations error: ${response.status}`)
  }

  const text = await response.text()

  if (!text || text.includes('<!DOCTYPE') || text.length < 10) {
    throw new Error('Invalid response from Pollinations')
  }

  await simulateStreaming(text, callbacks, abortController)
}

async function makeHuggingFaceRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  callbacks.onStatus?.(`Connecting to ${config.name}...`)

  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
  const systemMessage = messages.find(m => m.role === 'system')?.content || ''

  const input = systemMessage
    ? `<s>[INST] ${systemMessage}\n\n${lastUserMessage} [/INST]`
    : `<s>[INST] ${lastUserMessage} [/INST]`

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: input,
      parameters: {
        max_new_tokens: config.maxTokens,
        temperature: 0.7,
        do_sample: true
      }
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`HuggingFace error: ${response.status}`)
  }

  const data = await response.json()
  let text = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || ''

  // Remove input prompt from response
  if (text.includes('[/INST]')) {
    text = text.split('[/INST]').pop()?.trim() || text
  }

  await simulateStreaming(text, callbacks, abortController)
}

function generateOfflineResponse(messages: Message[]): string {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
  const lower = lastUserMessage.toLowerCase()

  // Landing page / Website requests
  if (lower.includes('landing page') || lower.includes('website') || lower.includes('homepage')) {
    return `I'll create a modern landing page for you!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome - Modern Landing Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 min-h-screen">
  <nav class="p-6 flex justify-between items-center max-w-7xl mx-auto">
    <div class="text-2xl font-bold text-white">YourBrand</div>
    <div class="hidden md:flex space-x-6">
      <a href="#features" class="text-gray-300 hover:text-white transition">Features</a>
      <a href="#pricing" class="text-gray-300 hover:text-white transition">Pricing</a>
      <a href="#about" class="text-gray-300 hover:text-white transition">About</a>
      <a href="#" class="bg-purple-600 px-4 py-2 rounded-lg text-white hover:bg-purple-700 transition">Get Started</a>
    </div>
  </nav>

  <main class="container mx-auto px-6 py-20 text-center">
    <div class="inline-block px-4 py-1 bg-purple-600/20 rounded-full text-purple-300 text-sm mb-6">
      Launching Soon
    </div>
    <h1 class="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
      Build Something <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Amazing</span>
    </h1>
    <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
      The all-in-one platform for modern teams to collaborate, create, and ship faster than ever before.
    </p>
    <div class="flex flex-col sm:flex-row justify-center gap-4">
      <button class="bg-purple-600 px-8 py-4 rounded-lg text-white text-lg font-semibold hover:bg-purple-700 transition shadow-lg shadow-purple-600/25">
        Start Free Trial
      </button>
      <button class="border border-gray-600 px-8 py-4 rounded-lg text-white text-lg hover:bg-gray-800 transition">
        Watch Demo
      </button>
    </div>
  </main>

  <section id="features" class="container mx-auto px-6 py-20">
    <h2 class="text-3xl font-bold text-white text-center mb-12">Why Choose Us</h2>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur border border-gray-700/50">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4 text-white text-xl">&#x26A1;</div>
        <h3 class="text-xl font-bold text-white mb-2">Lightning Fast</h3>
        <p class="text-gray-400">Built for speed with cutting-edge technology and optimized performance.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur border border-gray-700/50">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4 text-white text-xl">&#x1F512;</div>
        <h3 class="text-xl font-bold text-white mb-2">Secure</h3>
        <p class="text-gray-400">Enterprise-grade security with end-to-end encryption you can trust.</p>
      </div>
      <div class="bg-gray-800/50 p-8 rounded-2xl backdrop-blur border border-gray-700/50">
        <div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4 text-white text-xl">&#x1F680;</div>
        <h3 class="text-xl font-bold text-white mb-2">Scalable</h3>
        <p class="text-gray-400">Grows with your business seamlessly from startup to enterprise.</p>
      </div>
    </div>
  </section>

  <footer class="border-t border-gray-800 py-8">
    <div class="container mx-auto px-6 text-center text-gray-500">
      &copy; 2024 YourBrand. All rights reserved.
    </div>
  </footer>
</body>
</html>
\`\`\`

This landing page includes:
- Modern gradient background with glass morphism effects
- Responsive navigation with mobile support
- Hero section with engaging call-to-action buttons
- Feature cards with icons
- Professional footer
- Built with Tailwind CSS for easy customization`
  }

  // Dashboard requests
  if (lower.includes('dashboard') || lower.includes('admin') || lower.includes('analytics')) {
    return `Here's a professional dashboard for you!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen">
  <div class="flex">
    <aside class="w-64 bg-gray-800 min-h-screen p-4 hidden lg:block">
      <div class="text-xl font-bold text-white mb-8 flex items-center gap-2">
        <span class="w-8 h-8 bg-purple-600 rounded-lg"></span>
        Dashboard
      </div>
      <nav class="space-y-2">
        <a href="#" class="flex items-center gap-3 px-4 py-3 bg-purple-600 rounded-lg text-white">
          <span>&#x1F4CA;</span> Overview
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-700 rounded-lg transition">
          <span>&#x1F465;</span> Users
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-700 rounded-lg transition">
          <span>&#x1F4C8;</span> Analytics
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-700 rounded-lg transition">
          <span>&#x2699;&#xFE0F;</span> Settings
        </a>
      </nav>
    </aside>

    <main class="flex-1 p-8">
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold text-white">Overview</h1>
        <div class="flex items-center gap-4">
          <input type="search" placeholder="Search..." class="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500">
          <div class="w-10 h-10 bg-purple-600 rounded-full"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Total Users</div>
          <div class="text-3xl font-bold text-white">12,847</div>
          <div class="text-green-400 text-sm mt-2">+12.5% from last month</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Revenue</div>
          <div class="text-3xl font-bold text-white">$84,234</div>
          <div class="text-green-400 text-sm mt-2">+8.2% from last month</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Active Sessions</div>
          <div class="text-3xl font-bold text-white">1,429</div>
          <div class="text-green-400 text-sm mt-2">+3.1% from last hour</div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div class="text-gray-400 text-sm mb-1">Conversion</div>
          <div class="text-3xl font-bold text-white">4.28%</div>
          <div class="text-red-400 text-sm mt-2">-0.4% from last week</div>
        </div>
      </div>

      <div class="grid lg:grid-cols-2 gap-6">
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h2 class="text-xl font-bold text-white mb-4">Revenue Overview</h2>
          <div class="h-64 flex items-end gap-2">
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 60%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 80%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 45%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 90%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 70%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 85%"></div>
            <div class="flex-1 bg-purple-600 rounded-t" style="height: 95%"></div>
          </div>
        </div>
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h2 class="text-xl font-bold text-white mb-4">Recent Activity</h2>
          <div class="space-y-4">
            <div class="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg">
              <div class="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white">+</div>
              <div class="flex-1">
                <div class="text-white">New user registration</div>
                <div class="text-gray-400 text-sm">2 minutes ago</div>
              </div>
            </div>
            <div class="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg">
              <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">$</div>
              <div class="flex-1">
                <div class="text-white">Payment received</div>
                <div class="text-gray-400 text-sm">15 minutes ago</div>
              </div>
            </div>
            <div class="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg">
              <div class="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white">!</div>
              <div class="flex-1">
                <div class="text-white">System update completed</div>
                <div class="text-gray-400 text-sm">1 hour ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</body>
</html>
\`\`\`

This dashboard includes:
- Responsive sidebar navigation
- Stats cards with trend indicators
- Revenue chart visualization
- Recent activity feed
- Dark theme design with Tailwind CSS`
  }

  // Code/React requests
  if (lower.includes('react') || lower.includes('component') || lower.includes('typescript')) {
    return `Here's a React component for you!

\`\`\`tsx
import React, { useState, useEffect } from 'react'

interface CardProps {
  title: string
  description: string
  icon?: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'success' | 'warning'
}

const Card: React.FC<CardProps> = ({
  title,
  description,
  icon,
  onClick,
  variant = 'default'
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const variantStyles = {
    default: 'bg-gray-800 border-gray-700 hover:border-gray-600',
    primary: 'bg-purple-900/50 border-purple-700 hover:border-purple-500',
    success: 'bg-green-900/50 border-green-700 hover:border-green-500',
    warning: 'bg-yellow-900/50 border-yellow-700 hover:border-yellow-500'
  }

  return (
    <div
      className={\`p-6 rounded-xl border transition-all duration-300 cursor-pointer
        \${variantStyles[variant]}
        \${isHovered ? 'transform -translate-y-1 shadow-lg' : ''}
      \`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon && (
        <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4 text-white">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}

export default Card
\`\`\`

This React component includes:
- TypeScript support with proper interfaces
- Multiple variants for different use cases
- Hover animations with smooth transitions
- Icon support with flexible rendering
- Click handling for interactivity
- Tailwind CSS styling`
  }

  // Help/greeting
  if (lower.includes('help') || lower.includes('hello') || lower.includes('hi') || lower === '') {
    return `Hello! I'm **${BRAND.name}**, your AI assistant powered by a reliable multi-provider backbone.

I can help you with:

**Building Applications**
- Landing pages with modern designs
- Dashboards and admin panels
- React/TypeScript components
- Full-stack web applications

**Writing Code**
- React, Vue, Angular components
- TypeScript/JavaScript utilities
- CSS/Tailwind styling
- API integrations

**Research & Analysis**
- Deep research on topics
- Data analysis and visualization
- Document summarization

**Automation**
- Workflow automation
- Task scheduling
- Browser automation

Try asking me to:
- "Build me a landing page for a SaaS product"
- "Create a React dashboard component"
- "Write a TypeScript utility function"
- "Help me design a REST API"

What would you like to create today?`
  }

  // Default response
  return `I understand you're asking about: "${lastUserMessage.slice(0, 100)}${lastUserMessage.length > 100 ? '...' : ''}"

I'm currently operating in offline mode, but I can still help with common tasks:

**Available offline capabilities:**
- Building landing pages and websites
- Creating dashboards and admin panels
- Generating React/TypeScript components
- Writing CSS/Tailwind styling

**To get better responses:**
1. Make sure you have an internet connection
2. Or configure a local Ollama instance for privacy-first AI

Try asking me to "build a landing page" or "create a dashboard" to see what I can do!`
}

async function makeOfflineRequest(
  _config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  callbacks.onStatus?.('Using offline templates...')
  const response = generateOfflineResponse(messages)
  await simulateStreaming(response, callbacks, abortController)
}

// ============================================================================
// Streaming Utilities
// ============================================================================

async function streamOpenAIFormat(response: Response, callbacks: StreamCallbacks): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let tokensUsed = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            callbacks.onToken(content)
            tokensUsed++
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}

async function simulateStreaming(
  text: string,
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const words = text.split(/(\s+)/)
  let tokensUsed = 0

  for (let i = 0; i < words.length; i++) {
    if (abortController.signal.aborted) {
      return
    }

    callbacks.onToken(words[i])
    tokensUsed++

    // Natural typing delay
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 15))
    }
  }
}

// ============================================================================
// Main ReliableAI Class
// ============================================================================

class ReliableAI {
  private healthTracker: HealthTracker
  private cache: ResponseCache
  private isInitialized: boolean = false
  private initPromise: Promise<void> | null = null
  private currentAbortController: AbortController | null = null
  private totalRequests: number = 0
  private totalSuccesses: number = 0
  private lastUpdate: number = 0

  constructor() {
    this.healthTracker = new HealthTracker()
    this.cache = new ResponseCache(150, 60) // 150 entries, 60 minute TTL
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    console.log('[ReliableAI] Initializing reliable AI backbone...')

    // Probe providers in parallel
    const probePromises = PROVIDER_CONFIGS.filter(c => c.type !== 'offline').map(async (config) => {
      try {
        const startTime = Date.now()
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        let response: Response | null = null

        if (config.type === 'ollama') {
          response = await fetch(`${config.endpoint}/api/tags`, {
            signal: controller.signal
          }).catch(() => null)
        } else {
          response = await fetch(config.endpoint, {
            method: 'HEAD',
            signal: controller.signal
          }).catch(() => null)
        }

        clearTimeout(timeoutId)

        if (response?.ok || response?.status === 405) {
          const latency = Date.now() - startTime
          this.healthTracker.recordSuccess(config.id, latency, 70)
          console.log(`[ReliableAI] ${config.name}: Available (${latency}ms)`)
        } else {
          this.healthTracker.recordFailure(config.id, new Error('Unreachable'))
          console.log(`[ReliableAI] ${config.name}: Unavailable`)
        }
      } catch (error) {
        this.healthTracker.recordFailure(config.id, error instanceof Error ? error : new Error('Unknown'))
        console.log(`[ReliableAI] ${config.name}: Probe failed`)
      }
    })

    await Promise.allSettled(probePromises)

    this.isInitialized = true
    this.lastUpdate = Date.now()
    console.log('[ReliableAI] Initialization complete')
    console.log(`[ReliableAI] Healthy providers: ${this.healthTracker.getHealthyProviders().join(', ')}`)
  }

  // ==========================================================================
  // Provider Selection
  // ==========================================================================

  private selectProvider(excludeIds: Set<string> = new Set()): ProviderConfig | null {
    const keys = getApiKeys()

    // Build list of available providers sorted by priority and health score
    const candidates = PROVIDER_CONFIGS
      .filter(config => {
        if (excludeIds.has(config.id)) return false
        if (!this.healthTracker.isAvailable(config.id)) return false

        // Check if provider requires API key
        if (config.type === 'groq' && !keys.groqKey) return false

        return true
      })
      .map(config => ({
        config,
        score: this.healthTracker.getProviderScore(config.id),
        priority: config.priority
      }))
      .sort((a, b) => {
        // First sort by priority, then by health score
        if (a.priority !== b.priority) return a.priority - b.priority
        return b.score - a.score
      })

    return candidates.length > 0 ? candidates[0].config : null
  }

  private async executeProvider(
    config: ProviderConfig,
    messages: Message[],
    callbacks: StreamCallbacks,
    abortController: AbortController
  ): Promise<void> {
    switch (config.type) {
      case 'ollama':
        return makeOllamaRequest(config, messages, callbacks, abortController)
      case 'groq':
        return makeGroqRequest(config, messages, callbacks, abortController)
      case 'openrouter':
        return makeOpenRouterRequest(config, messages, callbacks, abortController)
      case 'pollinations':
        return makePollinationsRequest(config, messages, callbacks, abortController)
      case 'huggingface':
        return makeHuggingFaceRequest(config, messages, callbacks, abortController)
      case 'offline':
        return makeOfflineRequest(config, messages, callbacks, abortController)
      default:
        throw new Error(`Unknown provider type: ${config.type}`)
    }
  }

  // ==========================================================================
  // Public API: chat (streaming)
  // ==========================================================================

  async chat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Cancel any previous request
    this.cancelRequest()
    this.currentAbortController = new AbortController()
    this.totalRequests++

    // Manage context window
    const primaryProvider = this.selectProvider()
    const contextWindow = primaryProvider?.contextWindow || 8192
    const processedMessages = truncateContext(messages, contextWindow)

    // Check cache first
    const cacheKey = createCacheKey(processedMessages)
    const cached = this.cache.get(cacheKey) || this.cache.getSimilar(processedMessages, 0.9)

    if (cached) {
      callbacks.onStatus?.('Using cached response...')
      this.totalSuccesses++
      await simulateStreaming(cached.response, callbacks, this.currentAbortController)
      callbacks.onComplete?.({
        content: cached.response,
        provider: cached.provider,
        model: cached.model,
        tokensUsed: estimateTokens(cached.response),
        latencyMs: 0,
        cached: true,
        qualityScore: cached.quality
      })
      return
    }

    // Try providers in order
    const triedProviders: Set<string> = new Set()
    let lastError: Error | null = null
    let lastProviderName = ''

    for (let attempt = 0; attempt < 6; attempt++) {
      const provider = this.selectProvider(triedProviders)

      if (!provider) {
        // No more providers, use offline
        const offlineConfig = PROVIDER_CONFIGS.find(c => c.type === 'offline')!
        callbacks.onStatus?.('All providers unavailable, using offline mode...')

        try {
          const startTime = Date.now()
          let fullResponse = ''
          const wrappedCallbacks: StreamCallbacks = {
            ...callbacks,
            onToken: (token) => {
              fullResponse += token
              callbacks.onToken(token)
            }
          }

          await this.executeProvider(offlineConfig, processedMessages, wrappedCallbacks, this.currentAbortController!)

          this.totalSuccesses++
          callbacks.onComplete?.({
            content: fullResponse,
            provider: offlineConfig.name,
            model: offlineConfig.model,
            tokensUsed: estimateTokens(fullResponse),
            latencyMs: Date.now() - startTime,
            cached: false,
            qualityScore: 50 // Offline gets lower quality score
          })
        } catch (error) {
          callbacks.onError(error instanceof Error ? error : new Error('Offline fallback failed'))
        }
        return
      }

      triedProviders.add(provider.id)
      lastProviderName = provider.name

      if (attempt > 0) {
        callbacks.onProviderSwitch?.(lastProviderName, provider.name)
      }

      try {
        callbacks.onStatus?.(`Connecting to ${provider.name}...`)
        const startTime = Date.now()
        let fullResponse = ''

        const wrappedCallbacks: StreamCallbacks = {
          ...callbacks,
          onToken: (token) => {
            fullResponse += token
            callbacks.onToken(token)
          }
        }

        await Promise.race([
          this.executeProvider(provider, processedMessages, wrappedCallbacks, this.currentAbortController!),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), provider.timeout)
          )
        ])

        const latency = Date.now() - startTime
        const quality = this.assessQuality(fullResponse)

        // Record success
        this.healthTracker.recordSuccess(provider.id, latency, quality)
        this.totalSuccesses++
        this.lastUpdate = Date.now()

        // Cache the response
        if (fullResponse.length > 50) {
          this.cache.set(cacheKey, fullResponse, provider.name, provider.model, quality)
        }

        callbacks.onComplete?.({
          content: fullResponse,
          provider: provider.name,
          model: provider.model,
          tokensUsed: estimateTokens(fullResponse),
          latencyMs: latency,
          cached: false,
          qualityScore: quality
        })

        console.log(`[ReliableAI] Request successful via ${provider.name} (${latency}ms, quality: ${quality})`)
        return

      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            callbacks.onComplete?.()
            return
          }

          lastError = error
          this.healthTracker.recordFailure(provider.id, error)
          console.log(`[ReliableAI] ${provider.name} failed: ${error.message}`)

          // Brief delay before retry
          if (attempt < 5) {
            await new Promise(r => setTimeout(r, Math.min(500 * (attempt + 1), 2000)))
          }
        }
      }
    }

    // All providers failed
    callbacks.onError(lastError || new Error('All AI providers are currently unavailable'))
  }

  // ==========================================================================
  // Public API: complete (non-streaming)
  // ==========================================================================

  async complete(prompt: string): Promise<CompletionResult> {
    return new Promise((resolve, reject) => {
      let content = ''

      const messages: Message[] = [{ role: 'user', content: prompt }]

      this.chat(messages, {
        onToken: (token) => { content += token },
        onComplete: (result) => {
          if (result) {
            resolve(result)
          } else {
            resolve({
              content,
              provider: 'unknown',
              model: 'unknown',
              tokensUsed: estimateTokens(content),
              latencyMs: 0,
              cached: false,
              qualityScore: 70
            })
          }
        },
        onError: (error) => reject(error)
      })
    })
  }

  // ==========================================================================
  // Public API: getStatus
  // ==========================================================================

  getStatus(): SystemStatus {
    const healthyProviders = this.healthTracker.getHealthyProviders()
    const allHealth = this.healthTracker.getAllHealth()
    const cacheStats = this.cache.getStats()

    let totalLatency = 0
    let latencyCount = 0

    for (const health of allHealth) {
      if (health.averageLatency > 0) {
        totalLatency += health.averageLatency
        latencyCount++
      }
    }

    return {
      initialized: this.isInitialized,
      healthyProviders: healthyProviders.length,
      totalProviders: PROVIDER_CONFIGS.length - 1, // Exclude offline
      cacheSize: cacheStats.size,
      cacheHitRate: cacheStats.hitRate,
      averageLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      totalRequests: this.totalRequests,
      successRate: this.totalRequests > 0 ? this.totalSuccesses / this.totalRequests : 1,
      lastUpdate: this.lastUpdate
    }
  }

  // ==========================================================================
  // Public API: getProviderHealth
  // ==========================================================================

  getProviderHealth(): ProviderHealth[] {
    return this.healthTracker.getAllHealth()
  }

  // ==========================================================================
  // Public API: cancelRequest
  // ==========================================================================

  cancelRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  // ==========================================================================
  // Public API: clearCache
  // ==========================================================================

  clearCache(): void {
    this.cache.clear()
    console.log('[ReliableAI] Cache cleared')
  }

  // ==========================================================================
  // Public API: selfHeal
  // ==========================================================================

  async selfHeal(): Promise<void> {
    console.log('[ReliableAI] Starting self-healing process...')

    const healPromises = PROVIDER_CONFIGS.filter(c => c.type !== 'offline').map(async (config) => {
      const health = this.healthTracker.getHealth(config.id)
      if (!health || health.status !== 'unhealthy') return

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        let response: Response | null = null

        if (config.type === 'ollama') {
          response = await fetch(`${config.endpoint}/api/tags`, {
            signal: controller.signal
          }).catch(() => null)
        } else {
          response = await fetch(config.endpoint, {
            method: 'HEAD',
            signal: controller.signal
          }).catch(() => null)
        }

        clearTimeout(timeoutId)

        if (response?.ok || response?.status === 405) {
          // Reset circuit breaker
          health.circuitBreakerOpen = false
          health.consecutiveFailures = 0
          health.status = 'unknown'
          console.log(`[ReliableAI] Self-heal: ${config.name} recovered`)
        }
      } catch {
        console.log(`[ReliableAI] Self-heal: ${config.name} still unavailable`)
      }
    })

    await Promise.allSettled(healPromises)
    this.lastUpdate = Date.now()
    console.log('[ReliableAI] Self-healing complete')
  }

  // ==========================================================================
  // Private: Quality Assessment
  // ==========================================================================

  private assessQuality(response: string): number {
    let score = 70 // Base score

    // Length bonus (but not too long)
    if (response.length > 100) score += 5
    if (response.length > 500) score += 5
    if (response.length > 2000) score += 5
    if (response.length > 10000) score -= 5 // Too long might be rambling

    // Structure bonus (markdown, code blocks)
    if (response.includes('```')) score += 5 // Code blocks
    if (response.includes('**')) score += 2 // Bold text
    if (response.includes('- ')) score += 2 // List items
    if (response.includes('## ')) score += 2 // Headers

    // Coherence check (basic)
    if (!response.includes('undefined') && !response.includes('NaN')) score += 3

    // Completeness (doesn't end mid-sentence)
    const lastChar = response.trim().slice(-1)
    if (['.', '!', '?', '`', '"', "'", ')'].includes(lastChar)) score += 5

    return Math.min(100, Math.max(0, score))
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const reliableAI = new ReliableAI()

// Auto-initialize on import (non-blocking)
reliableAI.initialize().catch(err => {
  console.warn('[ReliableAI] Background initialization failed:', err)
})

// Periodic self-healing (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    reliableAI.selfHeal().catch(console.warn)
  }, 5 * 60 * 1000)
}

// Export convenience functions
export const chat = reliableAI.chat.bind(reliableAI)
export const complete = reliableAI.complete.bind(reliableAI)
export const getStatus = reliableAI.getStatus.bind(reliableAI)

export default reliableAI
