export type CapabilityDomain =
  | 'chat'
  | 'company'
  | 'research'
  | 'media'
  | 'local-ai'
  | 'proxy'
  | 'webhook'

export interface CapabilityDefinition {
  id: string
  name: string
  description: string
  domain: CapabilityDomain
  route: string
  method: 'GET' | 'POST'
  tags: string[]
  triggers: string[]
  inputSchema?: Record<string, unknown>
  defaultPayload?: Record<string, unknown>
  outputHint?: string
}

export interface RetrievalInput {
  task: string
  context?: Record<string, unknown>
  limit?: number
}

export interface CapabilityMatch {
  capability: CapabilityDefinition
  score: number
  reasons: string[]
}

export interface TaskIntent {
  label: string
  confidence: number
  normalizedTask: string
}

export interface PlanStep {
  step: number
  capabilityId: string
  route: string
  method: 'GET' | 'POST'
  goal: string
  payload?: Record<string, unknown>
}

export interface ExecutionStepResult {
  step: number
  capabilityId: string
  ok: boolean
  status: number
  route: string
  method: 'GET' | 'POST'
  data?: unknown
  error?: string
}

export interface Diagnostics {
  degraded: boolean
  notes: string[]
  failures: string[]
}

export interface ExecuteTaskInput {
  task: string
  context?: Record<string, unknown>
  dryRun?: boolean
}

export interface VerificationCheck {
  capabilityId: string
  domain: 'chat' | 'company' | 'media' | 'research'
  ok: boolean
  message: string
  remediation?: string
}

export interface VerificationSummary {
  verified: boolean
  blocked: boolean
  confidence: number
  summary: string
  checks: VerificationCheck[]
  passedChecks: number
  failedChecks: number
}

export interface ExecuteTaskOutput {
  intent: TaskIntent
  matchedCapabilities: CapabilityMatch[]
  plan: PlanStep[]
  execution: {
    dryRun: boolean
    steps: ExecutionStepResult[]
  }
  status: 'ok' | 'partial' | 'degraded' | 'no-match' | 'blocked' | 'error'
  diagnostics: Diagnostics
  verification: VerificationSummary
}
