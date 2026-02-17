/**
 * Autonomous AI Service
 * Self-annealing, self-healing AI provider with multiple free APIs
 *
 * Features:
 * - Multiple free AI providers (no API key required)
 * - Self-annealing capabilities for optimal performance
 * - Automatic recovery and healing
 * - Circuit breaker pattern
 * - Adaptive routing based on performance
 * - Predictive failure detection
 */

import { BRAND } from '@/config/brand'

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (tokensUsed?: number) => void
  onError: (error: Error) => void
  onStatus?: (status: string) => void
}

export interface ProviderHealth {
  isHealthy: boolean
  lastCheck: number
  lastSuccess: number
  lastFailure: number
  consecutiveFailures: number
  consecutiveSuccesses: number
  totalRequests: number
  totalFailures: number
  averageLatency: number
  latencyHistory: number[]
  errorRate: number
  circuitBreakerOpen: boolean
  circuitBreakerOpenedAt: number
}

export interface ProviderPerformance {
  qualityScore: number        // 0-100: response quality assessment
  speedScore: number          // 0-100: based on latency
  reliabilityScore: number    // 0-100: based on success rate
  overallScore: number        // Weighted combination
  requestCount: number
  lastUpdated: number
}

export interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  model: string
  priority: number
  weight: number
  maxRetries: number
  timeout: number
  rateLimit: {
    requestsPerMinute: number
    requestsPerDay: number
  }
  features: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
  }
}

export interface AnnealingState {
  temperature: number
  energy: number
  bestEnergy: number
  iterations: number
  improvements: number
  stagnation: number
  convergence: number
  providerWeights: Map<string, number>
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  recoveryTimeout: number
  halfOpenRequests: number
}

// ============================================================================
// Free AI Provider Configurations
// ============================================================================

const FREE_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter-gemma',
    name: 'OpenRouter Gemma',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemma-2-9b-it:free',
    priority: 1,
    weight: 1.0,
    maxRetries: 2,
    timeout: 30000,
    rateLimit: { requestsPerMinute: 20, requestsPerDay: 200 },
    features: { streaming: true, functionCalling: false, vision: false }
  },
  {
    id: 'openrouter-llama',
    name: 'OpenRouter Llama',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.2-3b-instruct:free',
    priority: 2,
    weight: 0.9,
    maxRetries: 2,
    timeout: 30000,
    rateLimit: { requestsPerMinute: 20, requestsPerDay: 200 },
    features: { streaming: true, functionCalling: false, vision: false }
  },
  {
    id: 'pollinations',
    name: 'Pollinations AI',
    endpoint: 'https://text.pollinations.ai',
    model: 'openai',
    priority: 3,
    weight: 0.8,
    maxRetries: 3,
    timeout: 20000,
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 500 },
    features: { streaming: false, functionCalling: false, vision: false }
  },
  {
    id: 'huggingface-mistral',
    name: 'HuggingFace Mistral',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    priority: 4,
    weight: 0.85,
    maxRetries: 2,
    timeout: 25000,
    rateLimit: { requestsPerMinute: 15, requestsPerDay: 150 },
    features: { streaming: false, functionCalling: false, vision: false }
  },
  {
    id: 'huggingface-zephyr',
    name: 'HuggingFace Zephyr',
    endpoint: 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
    model: 'HuggingFaceH4/zephyr-7b-beta',
    priority: 5,
    weight: 0.8,
    maxRetries: 2,
    timeout: 25000,
    rateLimit: { requestsPerMinute: 15, requestsPerDay: 150 },
    features: { streaming: false, functionCalling: false, vision: false }
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama3.1-8b',
    priority: 6,
    weight: 0.9,
    maxRetries: 2,
    timeout: 15000,
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 1000 },
    features: { streaming: true, functionCalling: false, vision: false }
  },
  {
    id: 'together-free',
    name: 'Together AI Free',
    endpoint: 'https://api.together.xyz/inference',
    model: 'togethercomputer/llama-2-7b-chat',
    priority: 7,
    weight: 0.75,
    maxRetries: 2,
    timeout: 30000,
    rateLimit: { requestsPerMinute: 10, requestsPerDay: 100 },
    features: { streaming: true, functionCalling: false, vision: false }
  },
  {
    id: 'groq-demo',
    name: 'Groq Demo',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.2-3b-preview',
    priority: 8,
    weight: 0.95,
    maxRetries: 2,
    timeout: 10000,
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 14400 },
    features: { streaming: true, functionCalling: false, vision: false }
  }
]

// ============================================================================
// Utility Functions
// ============================================================================

function generateJitter(baseDelay: number, jitterFactor: number = 0.3): number {
  const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1)
  return Math.max(0, baseDelay + jitter)
}

function calculateExponentialBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  return generateJitter(delay)
}

function movingAverage(values: number[], windowSize: number = 10): number {
  if (values.length === 0) return 0
  const window = values.slice(-windowSize)
  return window.reduce((a, b) => a + b, 0) / window.length
}

function calculateTrend(values: number[], windowSize: number = 5): 'improving' | 'stable' | 'degrading' {
  if (values.length < windowSize * 2) return 'stable'
  const recent = movingAverage(values.slice(-windowSize))
  const previous = movingAverage(values.slice(-windowSize * 2, -windowSize))
  const change = (recent - previous) / (previous || 1)
  if (change > 0.1) return 'degrading' // Higher latency = worse
  if (change < -0.1) return 'improving'
  return 'stable'
}

// ============================================================================
// Provider Health Tracker
// ============================================================================

class HealthTracker {
  private healthMap: Map<string, ProviderHealth> = new Map()
  private performanceMap: Map<string, ProviderPerformance> = new Map()

  constructor() {
    this.initializeProviders()
  }

  private initializeProviders(): void {
    for (const provider of FREE_PROVIDERS) {
      this.healthMap.set(provider.id, this.createDefaultHealth())
      this.performanceMap.set(provider.id, this.createDefaultPerformance())
    }
  }

  private createDefaultHealth(): ProviderHealth {
    return {
      isHealthy: true,
      lastCheck: Date.now(),
      lastSuccess: 0,
      lastFailure: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalFailures: 0,
      averageLatency: 0,
      latencyHistory: [],
      errorRate: 0,
      circuitBreakerOpen: false,
      circuitBreakerOpenedAt: 0
    }
  }

  private createDefaultPerformance(): ProviderPerformance {
    return {
      qualityScore: 70,
      speedScore: 70,
      reliabilityScore: 100,
      overallScore: 80,
      requestCount: 0,
      lastUpdated: Date.now()
    }
  }

  recordSuccess(providerId: string, latency: number, qualityEstimate: number = 70): void {
    const health = this.healthMap.get(providerId)
    const performance = this.performanceMap.get(providerId)

    if (!health || !performance) return

    const now = Date.now()

    // Update health
    health.lastSuccess = now
    health.lastCheck = now
    health.consecutiveSuccesses++
    health.consecutiveFailures = 0
    health.totalRequests++
    health.latencyHistory.push(latency)
    if (health.latencyHistory.length > 100) {
      health.latencyHistory.shift()
    }
    health.averageLatency = movingAverage(health.latencyHistory)
    health.errorRate = health.totalFailures / health.totalRequests
    health.isHealthy = true

    // Recover from circuit breaker if needed
    if (health.circuitBreakerOpen && health.consecutiveSuccesses >= 3) {
      health.circuitBreakerOpen = false
      console.log(`[AutonomousAI] Circuit breaker closed for ${providerId}`)
    }

    // Update performance
    performance.requestCount++
    performance.lastUpdated = now

    // Calculate speed score (normalized against expected latency)
    const expectedLatency = 5000 // 5 seconds is "average"
    performance.speedScore = Math.min(100, Math.max(0, 100 - (latency / expectedLatency) * 50))

    // Quality score from response assessment
    performance.qualityScore = (performance.qualityScore * 0.9) + (qualityEstimate * 0.1)

    // Reliability score
    performance.reliabilityScore = Math.min(100, (1 - health.errorRate) * 100)

    // Overall weighted score
    performance.overallScore =
      performance.qualityScore * 0.4 +
      performance.speedScore * 0.3 +
      performance.reliabilityScore * 0.3
  }

  recordFailure(providerId: string, error: Error): void {
    const health = this.healthMap.get(providerId)
    const performance = this.performanceMap.get(providerId)

    if (!health || !performance) return

    const now = Date.now()

    // Update health
    health.lastFailure = now
    health.lastCheck = now
    health.consecutiveFailures++
    health.consecutiveSuccesses = 0
    health.totalRequests++
    health.totalFailures++
    health.errorRate = health.totalFailures / health.totalRequests

    // Check circuit breaker threshold
    if (health.consecutiveFailures >= 3) {
      health.isHealthy = false
      health.circuitBreakerOpen = true
      health.circuitBreakerOpenedAt = now
      console.log(`[AutonomousAI] Circuit breaker opened for ${providerId}: ${error.message}`)
    }

    // Update performance
    performance.reliabilityScore = Math.max(0, performance.reliabilityScore - 10)
    performance.overallScore =
      performance.qualityScore * 0.4 +
      performance.speedScore * 0.3 +
      performance.reliabilityScore * 0.3
    performance.lastUpdated = now
  }

  getHealth(providerId: string): ProviderHealth | undefined {
    return this.healthMap.get(providerId)
  }

  getPerformance(providerId: string): ProviderPerformance | undefined {
    return this.performanceMap.get(providerId)
  }

  isCircuitBreakerOpen(providerId: string, recoveryTimeout: number = 60000): boolean {
    const health = this.healthMap.get(providerId)
    if (!health) return true

    if (!health.circuitBreakerOpen) return false

    // Check if enough time has passed for half-open state
    if (Date.now() - health.circuitBreakerOpenedAt > recoveryTimeout) {
      console.log(`[AutonomousAI] Circuit breaker entering half-open state for ${providerId}`)
      return false // Allow a test request
    }

    return true
  }

  getHealthyProviders(): string[] {
    const healthy: string[] = []
    for (const [id, health] of this.healthMap) {
      if (health.isHealthy && !this.isCircuitBreakerOpen(id)) {
        healthy.push(id)
      }
    }
    return healthy
  }

  getAllHealth(): Map<string, ProviderHealth> {
    return new Map(this.healthMap)
  }

  getAllPerformance(): Map<string, ProviderPerformance> {
    return new Map(this.performanceMap)
  }

  predictFailure(providerId: string): { likely: boolean; confidence: number; reason?: string } {
    const health = this.healthMap.get(providerId)
    if (!health) return { likely: true, confidence: 1, reason: 'Unknown provider' }

    // Check latency trend
    const latencyTrend = calculateTrend(health.latencyHistory)

    // Predict based on multiple factors
    let failureProbability = 0
    const reasons: string[] = []

    // High error rate
    if (health.errorRate > 0.3) {
      failureProbability += 0.4
      reasons.push('High error rate')
    }

    // Degrading latency
    if (latencyTrend === 'degrading') {
      failureProbability += 0.2
      reasons.push('Increasing latency')
    }

    // Recent failures
    if (health.consecutiveFailures > 0) {
      failureProbability += 0.2 * health.consecutiveFailures
      reasons.push('Recent consecutive failures')
    }

    // Long time since last success
    const timeSinceSuccess = Date.now() - health.lastSuccess
    if (timeSinceSuccess > 300000 && health.totalRequests > 0) { // 5 minutes
      failureProbability += 0.2
      reasons.push('No recent successful requests')
    }

    return {
      likely: failureProbability > 0.5,
      confidence: Math.min(1, failureProbability),
      reason: reasons.join(', ')
    }
  }
}

// ============================================================================
// Self-Annealing Router
// ============================================================================

class SelfAnnealingRouter {
  private state: AnnealingState
  private healthTracker: HealthTracker
  private routingHistory: Array<{ providerId: string; success: boolean; timestamp: number }> = []

  constructor(healthTracker: HealthTracker) {
    this.healthTracker = healthTracker
    this.state = {
      temperature: 100,
      energy: 1.0,
      bestEnergy: 1.0,
      iterations: 0,
      improvements: 0,
      stagnation: 0,
      convergence: 0,
      providerWeights: new Map()
    }

    // Initialize weights from provider configs
    for (const provider of FREE_PROVIDERS) {
      this.state.providerWeights.set(provider.id, provider.weight)
    }
  }

  selectProvider(): ProviderConfig | null {
    const healthyProviderIds = this.healthTracker.getHealthyProviders()
    if (healthyProviderIds.length === 0) {
      // All providers unhealthy, try to find one in half-open state
      for (const provider of FREE_PROVIDERS) {
        if (!this.healthTracker.isCircuitBreakerOpen(provider.id, 30000)) {
          return provider
        }
      }
      return null
    }

    // Calculate selection probabilities based on performance and annealing weights
    const candidates: Array<{ provider: ProviderConfig; score: number }> = []

    for (const providerId of healthyProviderIds) {
      const provider = FREE_PROVIDERS.find(p => p.id === providerId)
      if (!provider) continue

      const performance = this.healthTracker.getPerformance(providerId)
      const weight = this.state.providerWeights.get(providerId) || provider.weight

      // Check predictive failure
      const prediction = this.healthTracker.predictFailure(providerId)
      const predictionPenalty = prediction.likely ? (1 - prediction.confidence * 0.5) : 1

      const score = (performance?.overallScore || 50) * weight * predictionPenalty
      candidates.push({ provider, score })
    }

    if (candidates.length === 0) return null

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score)

    // Temperature-based exploration
    if (this.state.temperature > 10 && Math.random() < this.state.temperature / 200) {
      // Explore: pick random provider weighted by score
      const totalScore = candidates.reduce((sum, c) => sum + c.score, 0)
      let random = Math.random() * totalScore
      for (const candidate of candidates) {
        random -= candidate.score
        if (random <= 0) return candidate.provider
      }
    }

    // Exploit: return best provider
    return candidates[0].provider
  }

  recordOutcome(providerId: string, success: boolean, latency: number): void {
    this.routingHistory.push({
      providerId,
      success,
      timestamp: Date.now()
    })

    // Keep only last 1000 entries
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-1000)
    }

    // Update annealing state
    this.state.iterations++

    // Calculate current energy (lower is better)
    const recentHistory = this.routingHistory.slice(-100)
    const successRate = recentHistory.filter(h => h.success).length / recentHistory.length
    const currentEnergy = 1 - successRate

    // Check for improvement
    if (currentEnergy < this.state.bestEnergy) {
      this.state.bestEnergy = currentEnergy
      this.state.improvements++
      this.state.stagnation = 0

      // Update provider weights
      const currentWeight = this.state.providerWeights.get(providerId) || 0.5
      this.state.providerWeights.set(providerId, Math.min(2, currentWeight * 1.1))
    } else {
      this.state.stagnation++
    }

    this.state.energy = currentEnergy
    this.state.convergence = 1 - this.state.bestEnergy

    // Adaptive cooling with reheating on stagnation
    if (this.state.stagnation > 20) {
      // Reheat to explore more
      this.state.temperature = Math.min(this.state.temperature * 1.5, 100)
      this.state.stagnation = 0
      console.log('[AutonomousAI] Reheating to explore more providers')
    } else {
      // Cool down
      this.state.temperature *= 0.99
    }

    // Penalize failed providers
    if (!success) {
      const currentWeight = this.state.providerWeights.get(providerId) || 0.5
      this.state.providerWeights.set(providerId, Math.max(0.1, currentWeight * 0.9))
    }
  }

  getState(): AnnealingState {
    return {
      ...this.state,
      providerWeights: new Map(this.state.providerWeights)
    }
  }

  getOptimalConfiguration(): { providers: string[]; weights: Map<string, number> } {
    const sortedProviders = Array.from(this.state.providerWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)

    return {
      providers: sortedProviders,
      weights: new Map(this.state.providerWeights)
    }
  }
}

// ============================================================================
// Provider Request Handlers
// ============================================================================

async function makeOpenRouterRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
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
      stream: config.features.streaming,
      max_tokens: 2048
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`)
  }

  if (config.features.streaming && response.body) {
    await streamSSEResponse(response, callbacks)
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
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n')
  const encodedPrompt = encodeURIComponent(prompt)

  const response = await fetch(`${config.endpoint}/${encodedPrompt}`, {
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`Pollinations error: ${response.status}`)
  }

  const text = await response.text()
  if (!text || text.includes('<!DOCTYPE')) {
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
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''
  const systemMessage = messages.find(m => m.role === 'system')?.content || ''

  // Format for instruction-tuned models
  const input = systemMessage
    ? `<s>[INST] ${systemMessage}\n\n${lastUserMessage} [/INST]`
    : `<s>[INST] ${lastUserMessage} [/INST]`

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: input,
      parameters: {
        max_new_tokens: 1024,
        temperature: 0.7,
        do_sample: true
      }
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HuggingFace error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  let text = ''

  if (Array.isArray(data)) {
    text = data[0]?.generated_text || ''
  } else {
    text = data.generated_text || ''
  }

  // Remove the input prompt from the response
  if (text.includes('[/INST]')) {
    text = text.split('[/INST]').pop()?.trim() || text
  }

  await simulateStreaming(text, callbacks, abortController)
}

async function makeCerebrasRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: config.features.streaming,
      max_tokens: 2048
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`Cerebras error: ${response.status}`)
  }

  if (config.features.streaming && response.body) {
    await streamSSEResponse(response, callbacks)
  } else {
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    await simulateStreaming(content, callbacks, abortController)
  }
}

async function makeTogetherRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || ''

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      prompt: `[INST] ${lastUserMessage} [/INST]`,
      max_tokens: 1024,
      temperature: 0.7
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`Together AI error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.output?.choices?.[0]?.text || data.choices?.[0]?.text || ''

  await simulateStreaming(text, callbacks, abortController)
}

async function makeGroqDemoRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  // Groq's free tier requires a demo/temp key mechanism
  // This implementation uses their public preview endpoint
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: config.features.streaming,
      max_tokens: 2048
    }),
    signal: abortController.signal
  })

  if (!response.ok) {
    throw new Error(`Groq error: ${response.status}`)
  }

  if (config.features.streaming && response.body) {
    await streamSSEResponse(response, callbacks)
  } else {
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    await simulateStreaming(content, callbacks, abortController)
  }
}

// SSE streaming helper
async function streamSSEResponse(response: Response, callbacks: StreamCallbacks): Promise<void> {
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
          callbacks.onComplete(tokensUsed)
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

  callbacks.onComplete(tokensUsed)
}

// Simulate streaming for non-streaming providers
async function simulateStreaming(
  text: string,
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  const chars = text.split('')
  let tokensUsed = 0

  for (let i = 0; i < chars.length; i++) {
    if (abortController.signal.aborted) {
      callbacks.onComplete(tokensUsed)
      return
    }

    // Small delay for natural feel
    if (i % 3 === 0) {
      await new Promise(r => setTimeout(r, 8))
    }

    callbacks.onToken(chars[i])
    tokensUsed++
  }

  callbacks.onComplete(tokensUsed)
}

// Provider request dispatcher
async function executeProviderRequest(
  config: ProviderConfig,
  messages: Message[],
  callbacks: StreamCallbacks,
  abortController: AbortController
): Promise<void> {
  switch (config.id) {
    case 'openrouter-gemma':
    case 'openrouter-llama':
      return makeOpenRouterRequest(config, messages, callbacks, abortController)
    case 'pollinations':
      return makePollinationsRequest(config, messages, callbacks, abortController)
    case 'huggingface-mistral':
    case 'huggingface-zephyr':
      return makeHuggingFaceRequest(config, messages, callbacks, abortController)
    case 'cerebras':
      return makeCerebrasRequest(config, messages, callbacks, abortController)
    case 'together-free':
      return makeTogetherRequest(config, messages, callbacks, abortController)
    case 'groq-demo':
      return makeGroqDemoRequest(config, messages, callbacks, abortController)
    default:
      throw new Error(`Unknown provider: ${config.id}`)
  }
}

// ============================================================================
// Autonomous AI Service
// ============================================================================

export class AutonomousAIService {
  private healthTracker: HealthTracker
  private router: SelfAnnealingRouter
  private isInitialized: boolean = false
  private initPromise: Promise<void> | null = null
  private currentAbortController: AbortController | null = null
  private performanceMemory: Map<string, number[]> = new Map() // Store response quality assessments

  constructor() {
    this.healthTracker = new HealthTracker()
    this.router = new SelfAnnealingRouter(this.healthTracker)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    console.log('[AutonomousAI] Initializing with self-annealing configuration...')

    // Probe all providers in parallel to assess initial health
    const probePromises = FREE_PROVIDERS.map(async (provider) => {
      try {
        const startTime = Date.now()
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(provider.endpoint, {
          method: 'HEAD',
          signal: controller.signal
        }).catch(() => null)

        clearTimeout(timeoutId)

        if (response?.ok || response?.status === 405) { // 405 = method not allowed but endpoint exists
          const latency = Date.now() - startTime
          this.healthTracker.recordSuccess(provider.id, latency, 70)
          console.log(`[AutonomousAI] ${provider.name}: Available (${latency}ms)`)
        } else {
          this.healthTracker.recordFailure(provider.id, new Error('Unreachable'))
          console.log(`[AutonomousAI] ${provider.name}: Unavailable`)
        }
      } catch (error) {
        this.healthTracker.recordFailure(provider.id, error instanceof Error ? error : new Error('Unknown'))
        console.log(`[AutonomousAI] ${provider.name}: Probe failed`)
      }
    })

    await Promise.allSettled(probePromises)

    this.isInitialized = true
    console.log('[AutonomousAI] Initialization complete')
    console.log(`[AutonomousAI] Healthy providers: ${this.healthTracker.getHealthyProviders().join(', ')}`)
  }

  cancelRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  async chat(messages: Message[], callbacks: StreamCallbacks): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    this.cancelRequest()
    this.currentAbortController = new AbortController()

    let lastError: Error | null = null
    const triedProviders: Set<string> = new Set()
    const maxAttempts = Math.min(FREE_PROVIDERS.length, 5)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const provider = this.router.selectProvider()

      if (!provider || triedProviders.has(provider.id)) {
        // Find an untried provider
        const untried = FREE_PROVIDERS.find(p => !triedProviders.has(p.id))
        if (!untried) break
        triedProviders.add(untried.id)
        continue
      }

      triedProviders.add(provider.id)

      try {
        callbacks.onStatus?.(`Connecting to ${provider.name}...`)

        const startTime = Date.now()

        await Promise.race([
          executeProviderRequest(
            provider,
            messages,
            callbacks,
            this.currentAbortController!
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), provider.timeout)
          )
        ])

        const latency = Date.now() - startTime

        // Estimate quality based on response length and completion
        const qualityEstimate = 75 // Base estimate, could be enhanced with actual assessment

        this.healthTracker.recordSuccess(provider.id, latency, qualityEstimate)
        this.router.recordOutcome(provider.id, true, latency)

        console.log(`[AutonomousAI] Request successful via ${provider.name} (${latency}ms)`)
        return

      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            callbacks.onComplete()
            return
          }
          lastError = error
          this.healthTracker.recordFailure(provider.id, error)
          this.router.recordOutcome(provider.id, false, 0)
          console.log(`[AutonomousAI] ${provider.name} failed: ${error.message}`)
        }

        // Exponential backoff before next attempt
        if (attempt < maxAttempts - 1) {
          const backoff = calculateExponentialBackoff(attempt, 500, 5000)
          callbacks.onStatus?.(`Retrying in ${Math.round(backoff / 1000)}s...`)
          await new Promise(r => setTimeout(r, backoff))
        }
      }
    }

    // All providers failed
    callbacks.onError(lastError || new Error('All AI providers are currently unavailable'))
  }

  async chatSync(messages: Message[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let response = ''

      this.chat(messages, {
        onToken: (token) => { response += token },
        onComplete: () => resolve(response),
        onError: (error) => reject(error)
      })
    })
  }

  getProviderStatus(): Array<{
    id: string
    name: string
    health: ProviderHealth
    performance: ProviderPerformance
    prediction: { likely: boolean; confidence: number; reason?: string }
  }> {
    return FREE_PROVIDERS.map(provider => ({
      id: provider.id,
      name: provider.name,
      health: this.healthTracker.getHealth(provider.id) || this.createEmptyHealth(),
      performance: this.healthTracker.getPerformance(provider.id) || this.createEmptyPerformance(),
      prediction: this.healthTracker.predictFailure(provider.id)
    }))
  }

  private createEmptyHealth(): ProviderHealth {
    return {
      isHealthy: false,
      lastCheck: 0,
      lastSuccess: 0,
      lastFailure: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalFailures: 0,
      averageLatency: 0,
      latencyHistory: [],
      errorRate: 0,
      circuitBreakerOpen: true,
      circuitBreakerOpenedAt: 0
    }
  }

  private createEmptyPerformance(): ProviderPerformance {
    return {
      qualityScore: 0,
      speedScore: 0,
      reliabilityScore: 0,
      overallScore: 0,
      requestCount: 0,
      lastUpdated: 0
    }
  }

  getAnnealingState(): AnnealingState {
    return this.router.getState()
  }

  getOptimalConfiguration(): { providers: string[]; weights: Map<string, number> } {
    return this.router.getOptimalConfiguration()
  }

  async healthCheck(): Promise<{
    healthy: boolean
    availableProviders: number
    totalProviders: number
    annealingConvergence: number
  }> {
    const healthyProviders = this.healthTracker.getHealthyProviders()
    const annealingState = this.router.getState()

    return {
      healthy: healthyProviders.length > 0,
      availableProviders: healthyProviders.length,
      totalProviders: FREE_PROVIDERS.length,
      annealingConvergence: annealingState.convergence
    }
  }

  async selfHeal(): Promise<void> {
    console.log('[AutonomousAI] Starting self-healing process...')

    // Reset all circuit breakers and re-probe
    const probePromises = FREE_PROVIDERS.map(async (provider) => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(provider.endpoint, {
          method: 'HEAD',
          signal: controller.signal
        }).catch(() => null)

        clearTimeout(timeoutId)

        if (response?.ok || response?.status === 405) {
          // Reset health state
          const health = this.healthTracker.getHealth(provider.id)
          if (health) {
            health.circuitBreakerOpen = false
            health.consecutiveFailures = 0
            health.isHealthy = true
          }
          console.log(`[AutonomousAI] Self-heal: ${provider.name} recovered`)
        }
      } catch {
        console.log(`[AutonomousAI] Self-heal: ${provider.name} still unavailable`)
      }
    })

    await Promise.allSettled(probePromises)
    console.log('[AutonomousAI] Self-healing complete')
  }

  // Memory management for autonomous learning
  recordResponseQuality(providerId: string, quality: number): void {
    let history = this.performanceMemory.get(providerId) || []
    history.push(quality)
    if (history.length > 100) {
      history = history.slice(-100)
    }
    this.performanceMemory.set(providerId, history)
  }

  getPerformanceHistory(providerId: string): number[] {
    return this.performanceMemory.get(providerId) || []
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const autonomousAI = new AutonomousAIService()

// Auto-initialize on import (non-blocking)
autonomousAI.initialize().catch(err => {
  console.warn('[AutonomousAI] Background initialization failed:', err)
})

// Periodic self-healing (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    autonomousAI.selfHeal().catch(console.warn)
  }, 5 * 60 * 1000)
}

export default autonomousAI
