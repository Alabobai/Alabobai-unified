import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { inferIntent, retrieveCapabilities } from '../../src/services/capabilityEngine/retriever'
import { planExecution } from '../../src/services/capabilityEngine/planner'
import {
  statusFromExecutionAndVerification,
  verifyExecutionQuality,
} from '../../src/services/capabilityEngine/verification'
import type {
  CapabilityMatch,
  Diagnostics,
  ExecuteTaskInput,
  ExecuteTaskOutput,
  ExecutionStepResult,
  PlanStep,
  TaskIntent,
  VerificationSummary,
} from '../../src/services/capabilityEngine/types'

export type RunState = 'planned' | 'running' | 'blocked' | 'retrying' | 'succeeded' | 'failed'

interface Checkpoint {
  nextStep: number
  updatedAt: string
}

export interface TaskRunRecord {
  id: string
  task: string
  context?: Record<string, unknown>
  dryRun: boolean
  state: RunState
  attempt: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  heartbeatAt?: string
  nextAttemptAt?: number
  pauseRequested: boolean
  lastError?: string
  intent: TaskIntent
  matchedCapabilities: CapabilityMatch[]
  plan: PlanStep[]
  execution: {
    dryRun: boolean
    steps: ExecutionStepResult[]
  }
  diagnostics: Diagnostics
  verification: VerificationSummary
  checkpoint: Checkpoint
}

interface StoreShape {
  runs: TaskRunRecord[]
}

const STORE_PATH = process.env.TASK_RUNTIME_STORE_PATH || '/tmp/alabobai-task-runs.json'
const EVENTS_PATH = process.env.TASK_RUNTIME_EVENTS_PATH || '/tmp/alabobai-task-runs.jsonl'
const WATCHDOG_INTERVAL_MS = Number(process.env.TASK_WATCHDOG_INTERVAL_MS || 5000)
const RUN_STALE_MS = Number(process.env.TASK_RUN_STALE_MS || 30000)
const MAX_ATTEMPTS_DEFAULT = Number(process.env.TASK_MAX_ATTEMPTS || 3)
const RETRY_BASE_MS = Number(process.env.TASK_RETRY_BASE_MS || 1500)
const RETRY_MAX_MS = Number(process.env.TASK_RETRY_MAX_MS || 30000)
const STEP_TIMEOUT_MS = Number(process.env.TASK_STEP_TIMEOUT_MS || 60000)
const MAX_PERSISTED_RUNS = Number(process.env.TASK_MAX_PERSISTED_RUNS || 400)
const PERSIST_DEBOUNCE_MS = Number(process.env.TASK_PERSIST_DEBOUNCE_MS || 80)

let hydrated = false
let runs = new Map<string, TaskRunRecord>()
let persistChain = Promise.resolve()
let persistTimer: ReturnType<typeof setTimeout> | undefined
let watchdogTimer: ReturnType<typeof setInterval> | undefined
let processing = false
let originForRunner = ''

function nowIso() {
  return new Date().toISOString()
}

function normalizeTaskForMatching(task: string): string {
  return task.replace(/^\s*execute\s+task\s*[:\-]?\s*/i, '').trim()
}

function isTransientError(message: string): boolean {
  const v = message.toLowerCase()
  return (
    v.includes('timeout') ||
    v.includes('timed out') ||
    v.includes('429') ||
    v.includes('502') ||
    v.includes('503') ||
    v.includes('504') ||
    v.includes('network') ||
    v.includes('fetch') ||
    v.includes('econnreset') ||
    v.includes('temporary')
  )
}

function computeBackoffMs(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

async function ensureParent(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as StoreShape
    runs = new Map((parsed.runs || []).map((r) => [r.id, r]))
    pruneRunsIfNeeded()
  } catch {
    runs = new Map()
  }
}

function pruneRunsIfNeeded() {
  if (runs.size <= MAX_PERSISTED_RUNS) return

  const ordered = Array.from(runs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const keep = ordered.slice(0, MAX_PERSISTED_RUNS)
  runs = new Map(keep.map((run) => [run.id, run]))
}

function persistSoon() {
  if (persistTimer) return

  persistTimer = setTimeout(() => {
    persistTimer = undefined
    pruneRunsIfNeeded()
    const snapshot = JSON.stringify({ runs: Array.from(runs.values()) }, null, 2)
    persistChain = persistChain
      .then(async () => {
        await ensureParent(STORE_PATH)
        await writeFile(STORE_PATH, snapshot, 'utf8')
      })
      .catch(() => {
        // best effort durability
      })
  }, Math.max(10, PERSIST_DEBOUNCE_MS))
}

function logEvent(type: string, run: TaskRunRecord, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: nowIso(),
    type,
    runId: run.id,
    state: run.state,
    attempt: run.attempt,
    checkpoint: run.checkpoint,
    ...extra,
  })

  persistChain = persistChain
    .then(async () => {
      await ensureParent(EVENTS_PATH)
      await appendFile(EVENTS_PATH, `${line}\n`, 'utf8')
    })
    .catch(() => {
      // best effort event log
    })
}

function defaultVerification(summary: string, confidence: number): VerificationSummary {
  return {
    verified: false,
    blocked: false,
    confidence,
    summary,
    checks: [],
    passedChecks: 0,
    failedChecks: 0,
  }
}

function refreshVerification(run: TaskRunRecord): void {
  run.verification = verifyExecutionQuality({
    intent: run.intent,
    execution: run.execution,
    diagnostics: run.diagnostics,
  })

  if (run.verification.blocked) {
    run.state = 'blocked'
    run.diagnostics.degraded = true
    run.diagnostics.failures.push('verification-blocked: output failed quality gate(s)')
    for (const check of run.verification.checks) {
      if (!check.ok && check.remediation) {
        run.diagnostics.notes.push(`[${check.capabilityId}] ${check.remediation}`)
      }
    }
  }
}

function summarizeStatus(run: TaskRunRecord): ExecuteTaskOutput['status'] {
  if (run.plan.length === 0 && run.execution.steps.length === 0) return 'no-match'
  return statusFromExecutionAndVerification({
    execution: run.execution,
    diagnostics: run.diagnostics,
    verification: run.verification,
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`step timeout after ${timeoutMs}ms`)), timeoutMs)),
  ])
}

async function dispatchInProcess(step: PlanStep, origin: string): Promise<Response | null> {
  try {
    const request = new Request(`${origin}${step.route}`, {
      method: step.method,
      headers: step.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: step.method === 'POST' ? JSON.stringify(step.payload || {}) : undefined,
    })

    switch (step.route) {
      case '/api/chat':
        return (await import('../chat')).default(request)
      case '/api/company':
        return (await import('../company')).default(request)
      case '/api/search':
        return (await import('../search')).default(request)
      case '/api/proxy':
        return (await import('../proxy')).default(request)
      case '/api/generate-image':
        return (await import('../generate-image')).default(request)
      case '/api/generate-video':
        return (await import('../generate-video')).default(request)
      case '/api/fetch-page':
        return (await import('../fetch-page')).default(request)
      case '/api/local-ai/chat':
        return (await import('../local-ai/chat')).default(request)
      case '/api/local-ai/models':
        return (await import('../local-ai/models')).default(request)
      case '/api/local-ai/knowledge/stats':
        return (await import('../local-ai/knowledge/stats')).default(request)
      case '/api/local-ai/knowledge/ingest':
        return (await import('../local-ai/knowledge/ingest')).default(request)
      case '/api/local-ai/knowledge/search':
        return (await import('../local-ai/knowledge/search')).default(request)
      default:
        return null
    }
  } catch {
    return null
  }
}

async function executeStep(step: PlanStep, origin: string): Promise<ExecutionStepResult> {
  let response: Response | null = null
  let executedCapabilityId = step.capabilityId
  let executedRoute = step.route

  try {
    response = await withTimeout(
      fetch(`${origin}${step.route}`, {
        method: step.method,
        headers: step.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: step.method === 'POST' ? JSON.stringify(step.payload || {}) : undefined,
      }),
      STEP_TIMEOUT_MS
    )
  } catch {
    response = await dispatchInProcess(step, origin)
  }

  if (!response || response.status === 404) {
    const inProcess = await dispatchInProcess(step, origin)
    if (inProcess) response = inProcess
  }

  if (!response && step.capabilityId === 'research.search') {
    const fallback = await dispatchInProcess(
      {
        ...step,
        capabilityId: 'proxy.search',
        route: '/api/proxy',
        method: 'POST',
        payload: {
          action: 'search',
          query: String((step.payload as Record<string, unknown> | undefined)?.query || ''),
        },
      },
      origin
    )
    if (fallback) {
      response = fallback
      executedCapabilityId = 'proxy.search'
      executedRoute = '/api/proxy'
    }
  }

  if (!response) {
    throw new Error('step dispatch failed (network + in-process)')
  }

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = await response.text().catch(() => null)
  }

  return {
    step: step.step,
    capabilityId: executedCapabilityId,
    ok: response.ok,
    status: response.status,
    route: executedRoute,
    method: step.method,
    data,
    error: response.ok ? undefined : `Request failed with status ${response.status}`,
  }
}

function toOutput(run: TaskRunRecord): ExecuteTaskOutput & { runId: string; runState: RunState } {
  return {
    runId: run.id,
    runState: run.state,
    intent: run.intent,
    matchedCapabilities: run.matchedCapabilities,
    plan: run.plan,
    execution: run.execution,
    status: summarizeStatus(run),
    diagnostics: run.diagnostics,
    verification: run.verification,
  }
}

export async function createTaskRun(input: ExecuteTaskInput, origin: string): Promise<TaskRunRecord> {
  await hydrate()
  originForRunner = origin

  const task = input.task?.trim() || ''
  const taskForMatching = normalizeTaskForMatching(task)
  const intent = inferIntent(taskForMatching)
  const matchedCapabilities = retrieveCapabilities({ task: taskForMatching, context: input.context, limit: 5 })
  const plan = taskForMatching && matchedCapabilities.length > 0 ? planExecution(intent, taskForMatching, matchedCapabilities) : []

  const now = nowIso()
  const run: TaskRunRecord = {
    id: randomUUID(),
    task,
    context: input.context,
    dryRun: !!input.dryRun,
    state: 'planned',
    attempt: 1,
    maxAttempts: Math.max(1, Math.min(5, MAX_ATTEMPTS_DEFAULT)),
    createdAt: now,
    updatedAt: now,
    pauseRequested: false,
    intent,
    matchedCapabilities,
    plan,
    execution: { dryRun: !!input.dryRun, steps: [] },
    diagnostics: { degraded: false, notes: [], failures: [] },
    verification: defaultVerification('Run created; verification pending execution.', 0.2),
    checkpoint: { nextStep: 1, updatedAt: now },
  }

  if (!task || matchedCapabilities.length === 0 || plan.length === 0) {
    run.state = 'failed'
    run.completedAt = now
    run.diagnostics.degraded = true
    run.diagnostics.notes.push('No suitable capability matched the task.')
    run.verification = defaultVerification('No plan generated, so verification was not applied.', 0.2)
  }

  runs.set(run.id, run)
  persistSoon()
  logEvent('run.created', run, { task })
  startWatchdog(origin)
  void processRuns(origin)
  return run
}

export async function getTaskRun(id: string): Promise<TaskRunRecord | undefined> {
  await hydrate()
  return runs.get(id)
}

export async function listTaskRuns(limit = 25): Promise<TaskRunRecord[]> {
  await hydrate()
  return Array.from(runs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(200, limit)))
}

export async function pauseTaskRun(id: string): Promise<TaskRunRecord | undefined> {
  await hydrate()
  const run = runs.get(id)
  if (!run) return undefined

  run.pauseRequested = true
  if (run.state === 'planned' || run.state === 'retrying') {
    run.state = 'blocked'
  }
  run.updatedAt = nowIso()
  persistSoon()
  logEvent('run.pause.requested', run)
  return run
}

export async function resumeTaskRun(id: string, origin?: string): Promise<TaskRunRecord | undefined> {
  await hydrate()
  const run = runs.get(id)
  if (!run) return undefined

  run.pauseRequested = false
  if (run.state === 'blocked') {
    run.state = 'retrying'
    run.nextAttemptAt = Date.now()
  }
  run.updatedAt = nowIso()
  persistSoon()
  logEvent('run.resumed', run)

  const useOrigin = origin || originForRunner
  if (useOrigin) {
    startWatchdog(useOrigin)
    void processRuns(useOrigin)
  }

  return run
}

export async function retryTaskRun(id: string, origin?: string): Promise<TaskRunRecord | undefined> {
  await hydrate()
  const run = runs.get(id)
  if (!run) return undefined

  run.pauseRequested = false
  run.state = 'retrying'
  run.attempt = Math.min(run.maxAttempts, run.attempt + 1)
  const failedStep = run.execution.steps.find((s) => !s.ok)
  run.checkpoint.nextStep = failedStep ? failedStep.step : run.checkpoint.nextStep
  run.nextAttemptAt = Date.now()
  run.lastError = undefined
  run.updatedAt = nowIso()
  persistSoon()
  logEvent('run.retry.requested', run)

  const useOrigin = origin || originForRunner
  if (useOrigin) {
    startWatchdog(useOrigin)
    void processRuns(useOrigin)
  }

  return run
}

export function startWatchdog(origin: string) {
  originForRunner = origin
  if (watchdogTimer) return

  watchdogTimer = setInterval(() => {
    void processRuns(originForRunner)
  }, WATCHDOG_INTERVAL_MS)
}

export function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = undefined
  }
}

export async function processRuns(origin: string): Promise<void> {
  await hydrate()
  if (processing) return
  processing = true

  try {
    const nowMs = Date.now()

    for (const run of runs.values()) {
      if (run.state === 'running' && run.heartbeatAt) {
        const stale = nowMs - new Date(run.heartbeatAt).getTime() > RUN_STALE_MS
        if (stale) {
          run.state = 'retrying'
          run.nextAttemptAt = nowMs + computeBackoffMs(run.attempt)
          run.diagnostics.notes.push('Watchdog detected stale running state, scheduling safe resume.')
          run.updatedAt = nowIso()
          persistSoon()
          logEvent('watchdog.stale.run', run)
        }
      }
    }

    const runnable = Array.from(runs.values())
      .filter((run) => {
        if (run.pauseRequested) return false
        if (run.state === 'planned') return true
        if (run.state === 'retrying') return !run.nextAttemptAt || run.nextAttemptAt <= Date.now()
        return false
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    for (const run of runnable) {
      run.state = 'running'
      run.startedAt = run.startedAt || nowIso()
      run.updatedAt = nowIso()
      run.heartbeatAt = nowIso()
      persistSoon()
      logEvent('run.started', run)

      if (run.dryRun) {
        const drySteps = run.plan
          .filter((s) => s.step >= run.checkpoint.nextStep)
          .map((s) => ({
            step: s.step,
            capabilityId: s.capabilityId,
            ok: true,
            status: 200,
            route: s.route,
            method: s.method,
            data: { dryRun: true },
          }))
        run.execution.steps.push(...drySteps)
        run.checkpoint.nextStep = run.plan.length + 1
        run.checkpoint.updatedAt = nowIso()
        run.state = 'succeeded'
        run.completedAt = nowIso()
        refreshVerification(run)
        run.updatedAt = nowIso()
        persistSoon()
        logEvent(run.state === 'blocked' ? 'run.blocked' : 'run.completed', run, { dryRun: true })
        continue
      }

      let shouldStop = false
      for (const step of run.plan) {
        if (step.step < run.checkpoint.nextStep) continue
        if (run.pauseRequested) {
          run.state = 'blocked'
          run.updatedAt = nowIso()
          persistSoon()
          logEvent('run.blocked', run, { reason: 'pause_requested' })
          shouldStop = true
          break
        }

        run.heartbeatAt = nowIso()
        run.updatedAt = nowIso()
        persistSoon()

        try {
          const result = await executeStep(step, origin)
          run.execution.steps = run.execution.steps.filter((s) => s.step !== step.step)
          run.execution.steps.push(result)
          run.execution.steps.sort((a, b) => a.step - b.step)

          if (!result.ok) {
            const err = result.error || `Step ${step.step} failed`
            run.lastError = err
            run.diagnostics.degraded = true
            run.diagnostics.failures.push(`${step.capabilityId} returned ${result.status}`)

            const retryable = isTransientError(err)
            if (retryable && run.attempt < run.maxAttempts) {
              run.attempt += 1
              run.state = 'retrying'
              run.nextAttemptAt = Date.now() + computeBackoffMs(run.attempt)
              refreshVerification(run)
              run.updatedAt = nowIso()
              persistSoon()
              logEvent('run.retry.scheduled', run, { reason: err, step: step.step })
            } else {
              run.state = 'failed'
              run.completedAt = nowIso()
              refreshVerification(run)
              run.updatedAt = nowIso()
              persistSoon()
              logEvent(run.state === 'blocked' ? 'run.blocked' : 'run.failed', run, { reason: err, step: step.step })
            }
            shouldStop = true
            break
          }

          run.checkpoint.nextStep = step.step + 1
          run.checkpoint.updatedAt = nowIso()
          run.updatedAt = nowIso()
          persistSoon()
          logEvent('run.step.succeeded', run, { step: step.step })
        } catch (error) {
          const err = error instanceof Error ? error.message : 'Unknown execution failure'
          run.lastError = err
          run.diagnostics.degraded = true
          run.diagnostics.failures.push(`${step.capabilityId} runtime error`)

          const retryable = isTransientError(err)
          if (retryable && run.attempt < run.maxAttempts) {
            run.attempt += 1
            run.state = 'retrying'
            run.nextAttemptAt = Date.now() + computeBackoffMs(run.attempt)
            refreshVerification(run)
            run.updatedAt = nowIso()
            persistSoon()
            logEvent('run.retry.scheduled', run, { reason: err, step: step.step })
          } else {
            run.state = 'failed'
            run.completedAt = nowIso()
            refreshVerification(run)
            run.updatedAt = nowIso()
            persistSoon()
            logEvent(run.state === 'blocked' ? 'run.blocked' : 'run.failed', run, { reason: err, step: step.step })
          }
          shouldStop = true
          break
        }
      }

      if (shouldStop) {
        continue
      }

      if (run.checkpoint.nextStep > run.plan.length) {
        run.state = 'succeeded'
        run.completedAt = nowIso()
        if (run.diagnostics.degraded) {
          run.diagnostics.notes.push('Completed with recoverable degradation signals.')
        }
        refreshVerification(run)
        run.updatedAt = nowIso()
        persistSoon()
        logEvent(run.state === 'blocked' ? 'run.blocked' : 'run.completed', run)
      }
    }
  } finally {
    processing = false
  }
}

export async function waitForRun(runId: string, timeoutMs = 25000, pollIntervalMs = 250): Promise<TaskRunRecord | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const run = await getTaskRun(runId)
    if (!run) return undefined
    if (run.state === 'succeeded' || run.state === 'failed' || run.state === 'blocked') return run
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  return getTaskRun(runId)
}

export async function kickWatchdog(origin: string): Promise<void> {
  startWatchdog(origin)
  void processRuns(origin)
}

export function asExecuteTaskPayload(run: TaskRunRecord) {
  return toOutput(run)
}
