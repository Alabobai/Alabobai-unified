export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerSnapshot {
  name: string
  state: CircuitState
  failures: number
  consecutiveSuccesses: number
  openedAt?: string
  lastFailure?: string
  lastSuccess?: string
  nextAttemptAt?: string
}

interface CircuitBreakerInternal {
  name: string
  state: CircuitState
  failures: number
  consecutiveSuccesses: number
  openedAtMs?: number
  lastFailure?: string
  lastSuccess?: string
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenSuccessThreshold: number
}

export interface ServiceHealthSnapshot {
  name: string
  healthy: boolean
  checkedAt: string
  latencyMs: number
  error?: string
}

interface ReliabilityRegistry {
  breakers: Map<string, CircuitBreakerInternal>
  serviceHealth: Map<string, ServiceHealthSnapshot>
}

const globalRef = globalThis as typeof globalThis & {
  __alabobaiReliability?: ReliabilityRegistry
}

if (!globalRef.__alabobaiReliability) {
  globalRef.__alabobaiReliability = {
    breakers: new Map(),
    serviceHealth: new Map(),
  }
}

const registry = globalRef.__alabobaiReliability

function getBreaker(
  name: string,
  config: {
    failureThreshold?: number
    resetTimeoutMs?: number
    halfOpenSuccessThreshold?: number
  } = {}
): CircuitBreakerInternal {
  const existing = registry.breakers.get(name)
  if (existing) {
    return existing
  }

  const breaker: CircuitBreakerInternal = {
    name,
    state: 'closed',
    failures: 0,
    consecutiveSuccesses: 0,
    failureThreshold: config.failureThreshold ?? 3,
    resetTimeoutMs: config.resetTimeoutMs ?? 20000,
    halfOpenSuccessThreshold: config.halfOpenSuccessThreshold ?? 2,
  }

  registry.breakers.set(name, breaker)
  return breaker
}

function transitionToOpen(breaker: CircuitBreakerInternal) {
  breaker.state = 'open'
  breaker.openedAtMs = Date.now()
  breaker.failures = 0
  breaker.consecutiveSuccesses = 0
}

function transitionToClosed(breaker: CircuitBreakerInternal) {
  breaker.state = 'closed'
  breaker.openedAtMs = undefined
  breaker.failures = 0
  breaker.consecutiveSuccesses = 0
}

function transitionToHalfOpen(breaker: CircuitBreakerInternal) {
  breaker.state = 'half-open'
  breaker.failures = 0
  breaker.consecutiveSuccesses = 0
}

export function getCircuitBreakerSnapshot(name: string): CircuitBreakerSnapshot {
  const breaker = getBreaker(name)
  const nextAttemptAt =
    breaker.state === 'open' && breaker.openedAtMs
      ? new Date(breaker.openedAtMs + breaker.resetTimeoutMs).toISOString()
      : undefined

  return {
    name: breaker.name,
    state: breaker.state,
    failures: breaker.failures,
    consecutiveSuccesses: breaker.consecutiveSuccesses,
    openedAt: breaker.openedAtMs ? new Date(breaker.openedAtMs).toISOString() : undefined,
    lastFailure: breaker.lastFailure,
    lastSuccess: breaker.lastSuccess,
    nextAttemptAt,
  }
}

export function getAllCircuitBreakerSnapshots(): CircuitBreakerSnapshot[] {
  return [...registry.breakers.keys()].sort().map((name) => getCircuitBreakerSnapshot(name))
}

export function recordCircuitSuccess(name: string) {
  const breaker = getBreaker(name)
  breaker.lastSuccess = new Date().toISOString()

  if (breaker.state === 'half-open') {
    breaker.consecutiveSuccesses += 1
    if (breaker.consecutiveSuccesses >= breaker.halfOpenSuccessThreshold) {
      transitionToClosed(breaker)
    }
    return
  }

  transitionToClosed(breaker)
}

export function recordCircuitFailure(name: string, error?: unknown) {
  const breaker = getBreaker(name)
  breaker.lastFailure = error instanceof Error ? error.message : 'unknown failure'

  if (breaker.state === 'half-open') {
    transitionToOpen(breaker)
    return
  }

  breaker.failures += 1
  if (breaker.failures >= breaker.failureThreshold) {
    transitionToOpen(breaker)
  }
}

export function canUseCircuit(name: string): boolean {
  const breaker = getBreaker(name)
  if (breaker.state === 'closed') return true
  if (breaker.state === 'half-open') return true

  if (!breaker.openedAtMs) {
    transitionToHalfOpen(breaker)
    return true
  }

  if (Date.now() - breaker.openedAtMs >= breaker.resetTimeoutMs) {
    transitionToHalfOpen(breaker)
    return true
  }

  return false
}

export async function checkServiceHealth(
  name: string,
  request: {
    url: string
    method?: 'GET' | 'POST' | 'HEAD'
    timeoutMs?: number
    cacheTtlMs?: number
  }
): Promise<ServiceHealthSnapshot> {
  const now = Date.now()
  const cacheTtlMs = request.cacheTtlMs ?? 4000
  const cached = registry.serviceHealth.get(name)

  if (cached && now - new Date(cached.checkedAt).getTime() <= cacheTtlMs) {
    return cached
  }

  const start = Date.now()
  try {
    const response = await fetch(request.url, {
      method: request.method || 'GET',
      signal: AbortSignal.timeout(request.timeoutMs ?? 2500),
    })

    const snap: ServiceHealthSnapshot = {
      name,
      healthy: response.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }

    registry.serviceHealth.set(name, snap)
    return snap
  } catch (error) {
    const snap: ServiceHealthSnapshot = {
      name,
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'health check failed',
    }

    registry.serviceHealth.set(name, snap)
    return snap
  }
}

export function getServiceHealthSnapshot(name: string): ServiceHealthSnapshot | undefined {
  return registry.serviceHealth.get(name)
}

export function getAllServiceHealthSnapshots(): ServiceHealthSnapshot[] {
  return [...registry.serviceHealth.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function runWithCircuitBreaker<T>(
  breakerName: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!canUseCircuit(breakerName)) {
    throw new Error(`circuit-open:${breakerName}`)
  }

  try {
    const result = await fn()
    recordCircuitSuccess(breakerName)
    return result
  } catch (error) {
    recordCircuitFailure(breakerName, error)
    throw error
  }
}

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

export interface ReliableRunResult<T> {
  value: T
  attemptsUsed: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('circuit-open:')) return false
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('temporar') ||
    message.includes('429') ||
    message.includes('5')
  )
}

export async function runWithReliability<T>(
  breakerName: string,
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<ReliableRunResult<T>> {
  const attempts = Math.max(1, options.attempts ?? 2)
  const baseDelayMs = Math.max(40, options.baseDelayMs ?? 220)
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 2200)
  const shouldRetry = options.shouldRetry ?? ((error: unknown) => isRetryableError(error))

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await runWithCircuitBreaker(breakerName, fn)
      return { value, attemptsUsed: attempt }
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error
      }

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      await sleep(delay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('runWithReliability failed')
}

export interface HealthGateDecision {
  allow: boolean
  health: ServiceHealthSnapshot
  reason?: string
}

export async function healthGate(
  service: string,
  request: {
    url: string
    method?: 'GET' | 'POST' | 'HEAD'
    timeoutMs?: number
    cacheTtlMs?: number
  }
): Promise<HealthGateDecision> {
  const health = await checkServiceHealth(service, request)
  return {
    allow: health.healthy,
    health,
    reason: health.healthy ? undefined : `health-unhealthy:${service}:${health.error || 'unavailable'}`,
  }
}

export function degradedEnvelope<T extends Record<string, unknown>>(
  payload: T,
  meta: {
    route: string
    warning: string
    fallback: string
    circuit?: CircuitBreakerSnapshot | Record<string, CircuitBreakerSnapshot>
    health?: ServiceHealthSnapshot
    attemptsUsed?: number
  }
) {
  return {
    ...payload,
    ok: true,
    degraded: true,
    reliability: {
      route: meta.route,
      warning: meta.warning,
      fallback: meta.fallback,
      attemptsUsed: meta.attemptsUsed,
      health: meta.health,
      circuit: meta.circuit,
    },
  }
}
