import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type RunStatus = 'queued' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type DiagnosticLevel = 'info' | 'warn' | 'error'

export interface RunTimelineEvent {
  id: string
  title: string
  detail: string
  status: StepStatus
  timestamp: Date
}

export interface RunDiagnostic {
  id: string
  level: DiagnosticLevel
  message: string
  source: string
  timestamp: Date
}

export interface RunOutput {
  id: string
  title: string
  type: 'text' | 'code' | 'link' | 'json'
  content: string
  createdAt: Date
}

export interface CommandRun {
  id: string
  name: string
  objective: string
  status: RunStatus
  progress: number
  worker: string
  retryCount: number
  maxRetries: number
  startedAt: Date
  updatedAt: Date
  eta?: string
  errorMessage?: string
  timeline: RunTimelineEvent[]
  diagnostics: RunDiagnostic[]
  outputs: RunOutput[]
}

interface CommandCenterState {
  runs: CommandRun[]
  selectedRunId: string | null
  setSelectedRun: (runId: string) => void
  pauseRun: (runId: string) => void
  resumeRun: (runId: string) => void
  retryRun: (runId: string) => void
  cancelRun: (runId: string) => void
}

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)

const seededRuns: CommandRun[] = [
  {
    id: 'run-101',
    name: 'Market Intelligence Sweep',
    objective: 'Collect competitor pricing and summarize positioning gaps.',
    status: 'running',
    progress: 68,
    worker: 'Scout + Logic',
    retryCount: 1,
    maxRetries: 3,
    startedAt: minutesAgo(29),
    updatedAt: minutesAgo(1),
    eta: '5m',
    timeline: [
      { id: 't1', title: 'Plan generated', detail: '9-step plan accepted by orchestrator.', status: 'completed', timestamp: minutesAgo(28) },
      { id: 't2', title: 'SERP collection', detail: 'Fetched 40 source pages.', status: 'completed', timestamp: minutesAgo(16) },
      { id: 't3', title: 'Normalization', detail: 'Pricing tables parsed + deduplicated.', status: 'running', timestamp: minutesAgo(2) }
    ],
    diagnostics: [
      { id: 'd1', level: 'warn', message: '429 from one source; backing off 2s.', source: 'http-client', timestamp: minutesAgo(8) },
      { id: 'd2', level: 'info', message: 'Retry succeeded on attempt 2.', source: 'retry-engine', timestamp: minutesAgo(6) }
    ],
    outputs: [
      { id: 'o1', title: 'Pricing matrix.csv', type: 'text', content: '18 rows processed · confidence 0.91', createdAt: minutesAgo(5) },
      { id: 'o2', title: 'Insight brief', type: 'text', content: 'Top opportunity: mid-tier bundles underpriced by 14%.', createdAt: minutesAgo(3) }
    ]
  },
  {
    id: 'run-102',
    name: 'Landing Page Builder',
    objective: 'Generate hero, social proof, and conversion blocks for AI product.',
    status: 'paused',
    progress: 42,
    worker: 'Nova + Pixel',
    retryCount: 0,
    maxRetries: 2,
    startedAt: minutesAgo(21),
    updatedAt: minutesAgo(4),
    timeline: [
      { id: 't4', title: 'Requirements parsed', detail: 'Detected SaaS + B2B tone constraints.', status: 'completed', timestamp: minutesAgo(20) },
      { id: 't5', title: 'Section synthesis', detail: 'Paused by user during component drafting.', status: 'skipped', timestamp: minutesAgo(4) }
    ],
    diagnostics: [
      { id: 'd3', level: 'info', message: 'Run paused by operator.', source: 'control-plane', timestamp: minutesAgo(4) }
    ],
    outputs: [
      { id: 'o3', title: 'hero.tsx', type: 'code', content: '<section className="...">...</section>', createdAt: minutesAgo(11) }
    ]
  },
  {
    id: 'run-103',
    name: 'Quarterly Risk Audit',
    objective: 'Scan auth, data paths, and policy checks for gaps.',
    status: 'failed',
    progress: 83,
    worker: 'Atlas + Trust Architect',
    retryCount: 3,
    maxRetries: 3,
    startedAt: minutesAgo(51),
    updatedAt: minutesAgo(12),
    errorMessage: 'Exceeded retry budget while querying policy validator.',
    timeline: [
      { id: 't6', title: 'Policy baseline loaded', detail: 'SOC2 + internal policy set.', status: 'completed', timestamp: minutesAgo(45) },
      { id: 't7', title: 'Validator probe', detail: 'Policy endpoint unavailable.', status: 'failed', timestamp: minutesAgo(12) }
    ],
    diagnostics: [
      { id: 'd4', level: 'error', message: 'validator ECONNRESET after 3 retries', source: 'policy-service', timestamp: minutesAgo(12) }
    ],
    outputs: [
      { id: 'o4', title: 'Partial audit log', type: 'json', content: '{"coverage":0.83,"gaps":["token_ttl"]}', createdAt: minutesAgo(13) }
    ]
  }
]

const canPause = (status: RunStatus) => status === 'running' || status === 'retrying'
const canResume = (status: RunStatus) => status === 'paused'
const canRetry = (run: CommandRun) => (run.status === 'failed' || run.status === 'cancelled') && run.retryCount < run.maxRetries
const canCancel = (status: RunStatus) => status === 'running' || status === 'paused' || status === 'retrying' || status === 'queued'

export const useCommandCenterStore = create<CommandCenterState>()(
  immer((set) => ({
    runs: seededRuns,
    selectedRunId: seededRuns[0]?.id ?? null,

    setSelectedRun: (runId) => set((state) => {
      state.selectedRunId = runId
    }),

    pauseRun: (runId) => set((state) => {
      const run = state.runs.find((r) => r.id === runId)
      if (!run || !canPause(run.status)) return
      run.status = 'paused'
      run.updatedAt = new Date()
      run.diagnostics.unshift({
        id: crypto.randomUUID(),
        level: 'info',
        message: 'Run paused by operator command.',
        source: 'control-plane',
        timestamp: new Date()
      })
    }),

    resumeRun: (runId) => set((state) => {
      const run = state.runs.find((r) => r.id === runId)
      if (!run || !canResume(run.status)) return
      run.status = 'running'
      run.updatedAt = new Date()
      run.timeline.push({
        id: crypto.randomUUID(),
        title: 'Resumed',
        detail: 'Execution resumed from checkpoint.',
        status: 'running',
        timestamp: new Date()
      })
    }),

    retryRun: (runId) => set((state) => {
      const run = state.runs.find((r) => r.id === runId)
      if (!run || !canRetry(run)) return
      run.retryCount += 1
      run.status = 'retrying'
      run.progress = Math.max(10, run.progress - 20)
      run.updatedAt = new Date()
      run.errorMessage = undefined
      run.diagnostics.unshift({
        id: crypto.randomUUID(),
        level: 'warn',
        message: `Manual retry triggered (${run.retryCount}/${run.maxRetries}).`,
        source: 'control-plane',
        timestamp: new Date()
      })
    }),

    cancelRun: (runId) => set((state) => {
      const run = state.runs.find((r) => r.id === runId)
      if (!run || !canCancel(run.status)) return
      run.status = 'cancelled'
      run.updatedAt = new Date()
      run.timeline.push({
        id: crypto.randomUUID(),
        title: 'Cancelled',
        detail: 'Run terminated by operator.',
        status: 'failed',
        timestamp: new Date()
      })
    })
  }))
)
