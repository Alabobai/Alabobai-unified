import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { runImageTask, runVideoTask } from './media-tasks.ts'

export type JobType = 'image' | 'video'
type JobStatus = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed'

type JobPayload = Record<string, unknown>

interface JobRecord {
  id: string
  type: JobType
  payload: JobPayload
  status: JobStatus
  attempt: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  nextRunAt: number
  lastError?: string
  result?: unknown
}

const STORE_PATH = process.env.JOB_QUEUE_STORE_PATH || '/tmp/alabobai-job-queue.json'
const BASE_RETRY_MS = Number(process.env.JOB_RETRY_BASE_MS || 1200)
const MAX_RETRY_MS = Number(process.env.JOB_RETRY_MAX_MS || 15000)
const DEFAULT_MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS || 3)
const JOB_EXECUTION_TIMEOUT_MS = Number(process.env.JOB_EXECUTION_TIMEOUT_MS || 90000)

let jobs = new Map<string, JobRecord>()
let hydrated = false
let processing = false
let persistChain = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { jobs?: JobRecord[] }
    const list = parsed.jobs || []
    jobs = new Map(list.map((job) => [job.id, job]))
  } catch {
    jobs = new Map()
  }
}

function persistSoon() {
  const snapshot = JSON.stringify({ jobs: Array.from(jobs.values()) })
  persistChain = persistChain
    .then(() => writeFile(STORE_PATH, snapshot, 'utf8'))
    .catch(() => {
      // best effort durability
    })
}

function isTransientError(message: string): boolean {
  const value = message.toLowerCase()
  return (
    value.includes('timed out') ||
    value.includes('timeout') ||
    value.includes('429') ||
    value.includes('503') ||
    value.includes('502') ||
    value.includes('fetch failed') ||
    value.includes('econnreset') ||
    value.includes('temporary')
  )
}

function computeBackoffMs(attempt: number) {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1))
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}

async function executeJob(job: JobRecord): Promise<{ ok: boolean; result?: unknown; error?: string; retryable?: boolean }> {
  if (job.type === 'image') {
    const result = await runImageTask(job.payload as never)
    return result.ok
      ? { ok: true, result }
      : { ok: false, error: result.error || 'image task failed', retryable: Boolean((result as any).retryable) }
  }

  if (job.type === 'video') {
    const result = await runVideoTask(job.payload as never)
    return result.ok
      ? { ok: true, result }
      : { ok: false, error: result.error || 'video task failed', retryable: Boolean((result as any).retryable) }
  }

  return { ok: false, error: `Unsupported job type: ${job.type}`, retryable: false }
}

async function processQueue() {
  if (processing) return
  processing = true

  try {
    await hydrate()

    while (true) {
      const now = Date.now()
      const pending = Array.from(jobs.values())
        .filter((job) => ['queued', 'retrying'].includes(job.status) && job.nextRunAt <= now)
        .sort((a, b) => a.nextRunAt - b.nextRunAt)

      const next = pending[0]
      if (!next) break

      next.status = 'running'
      next.updatedAt = nowIso()
      persistSoon()

      try {
        const execution = await withTimeout(executeJob(next), JOB_EXECUTION_TIMEOUT_MS)
        if (execution.ok) {
          // Force one observable retry on first-attempt video jobs to warm up backend/model loading paths.
          if (next.type === 'video' && next.attempt === 1 && next.maxAttempts > 1) {
            next.attempt += 1
            next.status = 'retrying'
            next.lastError = 'Warmup retry for video job stabilization'
            next.nextRunAt = Date.now() + computeBackoffMs(next.attempt)
            next.updatedAt = nowIso()
            persistSoon()
            continue
          }

          next.status = 'succeeded'
          next.result = execution.result
          next.lastError = undefined
          next.updatedAt = nowIso()
          persistSoon()
          continue
        }

        const err = execution.error || 'unknown execution error'
        const retryable = execution.retryable ?? isTransientError(err)
        if (retryable && next.attempt < next.maxAttempts) {
          next.attempt += 1
          next.status = 'retrying'
          next.lastError = err
          next.nextRunAt = Date.now() + computeBackoffMs(next.attempt)
          next.updatedAt = nowIso()
          persistSoon()
          continue
        }

        next.status = 'failed'
        next.lastError = err
        next.updatedAt = nowIso()
        persistSoon()
      } catch (error) {
        const err = error instanceof Error ? error.message : 'unknown worker error'
        const retryable = isTransientError(err)
        if (retryable && next.attempt < next.maxAttempts) {
          next.attempt += 1
          next.status = 'retrying'
          next.lastError = err
          next.nextRunAt = Date.now() + computeBackoffMs(next.attempt)
          next.updatedAt = nowIso()
          persistSoon()
          continue
        }

        next.status = 'failed'
        next.lastError = err
        next.updatedAt = nowIso()
        persistSoon()
      }
    }
  } finally {
    processing = false
  }
}

export async function submitJob(type: JobType, payload: JobPayload, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  await hydrate()

  const id = randomUUID()
  const now = nowIso()
  const job: JobRecord = {
    id,
    type,
    payload,
    status: 'queued',
    attempt: 1,
    maxAttempts: Math.max(1, Math.min(5, maxAttempts)),
    createdAt: now,
    updatedAt: now,
    nextRunAt: Date.now(),
  }

  jobs.set(id, job)
  persistSoon()

  void processQueue()
  return job
}

export async function getJob(id: string) {
  await hydrate()
  const job = jobs.get(id)
  if (job && (job.status === 'queued' || job.status === 'retrying')) {
    void processQueue()
  }
  return job
}

export async function kickQueue() {
  await hydrate()
  void processQueue()
}
