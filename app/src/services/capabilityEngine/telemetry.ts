export type ExecutionFailureClass = 'success' | 'http_error' | 'runtime_error' | 'dry_run'

export interface CapabilityExecutionTelemetryEvent {
  ts: string
  capabilityId: string
  step: number
  latencyMs: number
  failureClass: ExecutionFailureClass
  fallbackUsed: boolean
  status?: number
}

interface TelemetryStore {
  events: CapabilityExecutionTelemetryEvent[]
  maxEvents: number
}

const TELEMETRY_STORE_KEY = '__capabilityExecutionTelemetryStore'
const DEFAULT_MAX_EVENTS = 500

function getStore(): TelemetryStore {
  const globalScope = globalThis as typeof globalThis & {
    [TELEMETRY_STORE_KEY]?: TelemetryStore
  }

  if (!globalScope[TELEMETRY_STORE_KEY]) {
    globalScope[TELEMETRY_STORE_KEY] = {
      events: [],
      maxEvents: DEFAULT_MAX_EVENTS,
    }
  }

  return globalScope[TELEMETRY_STORE_KEY]
}

function readLogPath(): string | null {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.CAPABILITY_TELEMETRY_LOG_FILE || null
}

function appendEventToFile(event: CapabilityExecutionTelemetryEvent): void {
  const logPath = readLogPath()
  if (!logPath) return

  void import('node:fs/promises')
    .then((fs) => fs.appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8'))
    .catch(() => {
      // Best-effort local-dev logging. Never fail request flow on telemetry sink errors.
    })
}

export function recordExecutionTelemetry(event: CapabilityExecutionTelemetryEvent): void {
  const store = getStore()
  store.events.push(event)

  if (store.events.length > store.maxEvents) {
    store.events.splice(0, store.events.length - store.maxEvents)
  }

  appendEventToFile(event)
}

export function getExecutionTelemetryEvents(limit = 50): CapabilityExecutionTelemetryEvent[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50
  const { events } = getStore()
  return events.slice(Math.max(0, events.length - safeLimit))
}

export function getExecutionTelemetrySummary() {
  const { events } = getStore()

  const total = events.length
  const successful = events.filter((e) => e.failureClass === 'success' || e.failureClass === 'dry_run').length
  const fallbackUsed = events.filter((e) => e.fallbackUsed).length

  const avgLatencyMs =
    total > 0 ? Math.round(events.reduce((sum, e) => sum + e.latencyMs, 0) / total) : 0

  const byCapability = events.reduce<Record<string, { count: number; errors: number; avgLatencyMs: number }>>(
    (acc, event) => {
      const prev = acc[event.capabilityId] || { count: 0, errors: 0, avgLatencyMs: 0 }
      const nextCount = prev.count + 1
      const nextErrors = prev.errors + (event.failureClass === 'success' || event.failureClass === 'dry_run' ? 0 : 1)
      const nextAvg = Math.round((prev.avgLatencyMs * prev.count + event.latencyMs) / nextCount)

      acc[event.capabilityId] = {
        count: nextCount,
        errors: nextErrors,
        avgLatencyMs: nextAvg,
      }

      return acc
    },
    {}
  )

  return {
    total,
    successful,
    successRate: total > 0 ? Number((successful / total).toFixed(3)) : 0,
    fallbackUsed,
    fallbackRate: total > 0 ? Number((fallbackUsed / total).toFixed(3)) : 0,
    avgLatencyMs,
    byCapability,
    latestTimestamp: total > 0 ? events[events.length - 1].ts : null,
  }
}
