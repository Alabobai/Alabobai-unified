import executeTaskHandler from '../api/execute-task.ts'
import { stopWatchdog } from '../api/_lib/task-runtime.ts'

type RunOutcome = {
  run: number
  task: string
  category: string
  success: boolean
  status: string
  durationMs: number
  confidence?: number
  error?: string
}

type BenchmarkReport = {
  config: {
    runCount: number
    concurrency: number
    waitTimeoutMs: number
    perRunTimeoutMs: number
    shuffleSeed: number
  }
  summary: {
    totalRuns: number
    succeeded: number
    failed: number
    successRate: number
    wallClockMs: number
    throughputRunsPerMin: number
    p50LatencyMs: number
    p95LatencyMs: number
  }
  byCategory: Record<string, { total: number; success: number; fail: number; p95Ms: number }>
  topFailures: Array<{ cause: string; count: number }>
  sampleFailures: RunOutcome[]
}

const RUN_COUNT = Number(process.env.BENCH_RUNS || 12)
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 4)
const WAIT_TIMEOUT_MS = Number(process.env.BENCH_WAIT_TIMEOUT_MS || 12000)
const PER_RUN_TIMEOUT_MS = Number(process.env.BENCH_PER_RUN_TIMEOUT_MS || Math.max(15000, WAIT_TIMEOUT_MS + 4000))
const SHUFFLE_SEED = Number(process.env.BENCH_SEED || 20260216)

const TASK_BANK: Array<{ category: string; task: string }> = [
  { category: 'company-plan', task: 'Create company plan for AI bookkeeping startup' },
  { category: 'research', task: 'Deep research top SMB automation trends for 2026' },
  { category: 'image', task: 'Generate an image concept for modern SaaS hero background' },
  { category: 'video', task: 'Generate a short product explainer video concept with scenes' },
  { category: 'command', task: 'Execute task: build a go-to-market launch checklist' },
  { category: 'analysis', task: 'Analyze risks and mitigations for launching an AI assistant MVP' },
]

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function seededOrder(count: number, seed: number): number[] {
  const out = Array.from({ length: count }, (_, i) => i)
  let state = seed >>> 0
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }

  return out
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)),
  ])
}

async function runOne(index: number): Promise<RunOutcome> {
  const scenario = TASK_BANK[index % TASK_BANK.length]
  const started = Date.now()

  try {
    const req = new Request('http://localhost:3000/api/execute-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: scenario.task,
        async: false,
        waitTimeoutMs: WAIT_TIMEOUT_MS,
      }),
    })

    const response = await withTimeout(executeTaskHandler(req), PER_RUN_TIMEOUT_MS, `run-${index}`)
    const payload = (await response.json()) as any
    const status = String(payload.status || payload.runState || 'unknown')
    const success = status === 'ok' || status === 'succeeded'

    return {
      run: index + 1,
      task: scenario.task,
      category: scenario.category,
      success,
      status,
      durationMs: Date.now() - started,
      confidence: payload?.verification?.confidence,
      error: payload?.diagnostics?.failures?.[0] || (success ? undefined : payload?.diagnostics?.notes?.[0]),
    }
  } catch (error) {
    return {
      run: index + 1,
      task: scenario.task,
      category: scenario.category,
      success: false,
      status: 'handler_error',
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}

async function runPool(items: number[], worker: (i: number) => Promise<RunOutcome>, concurrency: number): Promise<RunOutcome[]> {
  const out: RunOutcome[] = new Array(items.length)
  let cursor = 0

  async function lane() {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await worker(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => lane()))
  return out
}

function buildReport(results: RunOutcome[], wallClockMs: number): BenchmarkReport {
  const succeeded = results.filter(r => r.success).length
  const failed = results.length - succeeded
  const latencies = results.map(r => r.durationMs)

  const byCategory = Object.fromEntries(
    [...new Set(results.map(r => r.category))].map((cat) => {
      const group = results.filter(r => r.category === cat)
      return [cat, {
        total: group.length,
        success: group.filter(g => g.success).length,
        fail: group.filter(g => !g.success).length,
        p95Ms: percentile(group.map(g => g.durationMs), 95),
      }]
    })
  )

  const failureCauses = new Map<string, number>()
  for (const r of results.filter(r => !r.success)) {
    const key = r.error || r.status || 'unknown'
    failureCauses.set(key, (failureCauses.get(key) || 0) + 1)
  }

  const topFailures = [...failureCauses.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cause, count]) => ({ cause, count }))

  return {
    config: {
      runCount: RUN_COUNT,
      concurrency: CONCURRENCY,
      waitTimeoutMs: WAIT_TIMEOUT_MS,
      perRunTimeoutMs: PER_RUN_TIMEOUT_MS,
      shuffleSeed: SHUFFLE_SEED,
    },
    summary: {
      totalRuns: results.length,
      succeeded,
      failed,
      successRate: Number(((succeeded / Math.max(1, results.length)) * 100).toFixed(2)),
      wallClockMs,
      throughputRunsPerMin: Number(((results.length / Math.max(1, wallClockMs)) * 60000).toFixed(2)),
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
    },
    byCategory,
    topFailures,
    sampleFailures: results.filter(r => !r.success).slice(0, 12),
  }
}

async function main() {
  const ordered = seededOrder(RUN_COUNT, SHUFFLE_SEED)
  const started = Date.now()
  const results = await runPool(ordered, runOne, CONCURRENCY)
  const report = buildReport(results, Date.now() - started)
  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    stopWatchdog()
    // in-process task runtime uses background timers; force a clean benchmark exit.
    setTimeout(() => process.exit(process.exitCode || 0), 20)
  })
