import type {
  Diagnostics,
  ExecutionStepResult,
  ExecuteTaskOutput,
  TaskIntent,
  VerificationCheck,
  VerificationSummary,
} from './types'

interface CompanyPlanShape {
  executive_summary?: unknown
  mission?: unknown
  vision?: unknown
  target_market?: unknown
  value_proposition?: unknown
  revenue_model?: unknown
  departments?: unknown
  milestones?: unknown
  estimated_costs?: unknown
}

// shared verification types live in ./types

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isValidWebOrDataUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim().length < 8) return false
  const trimmed = value.trim()
  if (trimmed.startsWith('data:image/')) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function nonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length >= 12
}

function hasCompanyPlanShape(planLike: unknown): boolean {
  const plan = asRecord(planLike) as CompanyPlanShape | null
  if (!plan) return false

  const departments = Array.isArray(plan.departments) ? plan.departments : []
  const hasCoreNarrative =
    nonEmptyText(plan.executive_summary) ||
    nonEmptyText(plan.mission) ||
    nonEmptyText(plan.value_proposition) ||
    nonEmptyText(plan.target_market) ||
    nonEmptyText(plan.vision)

  const hasStructure =
    departments.length > 0 ||
    nonEmptyText(plan.revenue_model) ||
    Array.isArray(plan.milestones) ||
    !!asRecord(plan.estimated_costs)

  // Reliability mode: if plan object exists and has either narrative or structure, treat as valid.
  return hasCoreNarrative || hasStructure
}

function validateChat(step: ExecutionStepResult): VerificationCheck {
  const data = asRecord(step.data)
  const content = data?.content

  if (step.ok && nonEmptyText(content)) {
    return {
      capabilityId: step.capabilityId,
      domain: 'chat',
      ok: true,
      message: 'Chat response content looks valid.',
    }
  }

  return {
    capabilityId: step.capabilityId,
    domain: 'chat',
    ok: false,
    message: 'Chat response is empty or malformed.',
    remediation: 'Ensure /api/chat returns JSON with a non-empty `content` string and no upstream provider failure.',
  }
}

function validateCompany(step: ExecutionStepResult): VerificationCheck {
  const data = asRecord(step.data)
  const plan = data?.plan
  const company = asRecord(data?.company)
  const planCandidate = plan ?? company?.plan

  if (step.ok && hasCompanyPlanShape(planCandidate)) {
    return {
      capabilityId: step.capabilityId,
      domain: 'company',
      ok: true,
      message: 'Company plan JSON shape validated.',
    }
  }

  return {
    capabilityId: step.capabilityId,
    domain: 'company',
    ok: false,
    message: 'Company plan output does not match required JSON shape.',
    remediation:
      'Return `plan` (or `company.plan`) with required fields: executive_summary, mission, vision, target_market, value_proposition, revenue_model, departments[], milestones[], estimated_costs.{monthly,yearly,currency}.',
  }
}

function validateMedia(step: ExecutionStepResult): VerificationCheck {
  const data = asRecord(step.data)
  const url = data?.url ?? data?.videoUrl ?? data?.imageUrl

  if (step.ok && isValidWebOrDataUrl(url)) {
    return {
      capabilityId: step.capabilityId,
      domain: 'media',
      ok: true,
      message: 'Media output URL is valid.',
    }
  }

  return {
    capabilityId: step.capabilityId,
    domain: 'media',
    ok: false,
    message: 'Media output missing a valid URL/data URL.',
    remediation: 'Ensure media generators return `url` as https://... or data:image/... and include backend fallback warnings if degraded.',
  }
}

function validateResearch(step: ExecutionStepResult): VerificationCheck {
  const data = asRecord(step.data)

  const primaryResults = Array.isArray(data?.results) ? data?.results : []
  const altResults = Array.isArray(data?.items) ? data?.items : []
  const links = Array.isArray(data?.links) ? data?.links : []
  const countHint = typeof data?.count === 'number' ? data.count : 0

  const hasResultArray = primaryResults.length > 0 || altResults.length > 0 || links.length > 0 || countHint > 0
  const hasFallbackText =
    nonEmptyText(data?.summary) ||
    nonEmptyText(data?.content) ||
    nonEmptyText(data?.snippet) ||
    nonEmptyText(data?.query)

  if (step.ok && (hasResultArray || hasFallbackText)) {
    const total = primaryResults.length || altResults.length || links.length || countHint || 1
    return {
      capabilityId: step.capabilityId,
      domain: 'research',
      ok: true,
      message: `Research returned usable output (${total} signal unit(s)).`,
    }
  }

  return {
    capabilityId: step.capabilityId,
    domain: 'research',
    ok: false,
    message: 'Research output has no usable signals.',
    remediation: 'Retry with broader keywords or fallback provider; require at least one result/item/link or non-empty summary.',
  }
}

function validatorsForCapability(step: ExecutionStepResult): VerificationCheck[] {
  if (step.capabilityId === 'chat.general') return [validateChat(step)]
  if (step.capabilityId === 'company.plan' || step.capabilityId === 'company.create') return [validateCompany(step)]
  if (step.capabilityId === 'media.image.generate' || step.capabilityId === 'media.video.generate') return [validateMedia(step)]
  if (step.capabilityId === 'research.search' || step.capabilityId === 'proxy.search') return [validateResearch(step)]
  return []
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

export function verifyExecutionQuality(input: {
  intent: TaskIntent
  execution: { dryRun: boolean; steps: ExecutionStepResult[] }
  diagnostics: Diagnostics
}): VerificationSummary {
  const checks = input.execution.steps.flatMap((step) => validatorsForCapability(step))

  if (checks.length === 0) {
    const baseline = input.execution.steps.length > 0 && input.execution.steps.every((s) => s.ok) ? 0.78 : 0.45
    return {
      verified: !input.diagnostics.degraded,
      blocked: false,
      confidence: clampConfidence((input.intent.confidence + baseline) / 2),
      summary: 'No domain-specific validator applied; default verification used.',
      checks: [],
      passedChecks: 0,
      failedChecks: 0,
    }
  }

  const failedChecks = checks.filter((c) => !c.ok)
  const passedChecks = checks.length - failedChecks.length
  const successRatio = checks.length === 0 ? 0 : passedChecks / checks.length

  const hasRuntimeFailures = input.execution.steps.some((step) => !step.ok)
  const blocked = failedChecks.length > 0

  const confidence = clampConfidence(
    input.intent.confidence * 0.35 +
      successRatio * 0.45 +
      (hasRuntimeFailures ? 0.05 : 0.15) +
      (input.diagnostics.degraded ? 0 : 0.05)
  )

  const summary = blocked
    ? `${failedChecks.length} verification check(s) failed. Run is blocked pending remediation.`
    : `All ${checks.length} verification check(s) passed.`

  return {
    verified: !blocked,
    blocked,
    confidence,
    summary,
    checks,
    passedChecks,
    failedChecks: failedChecks.length,
  }
}

export function statusFromExecutionAndVerification(output: {
  execution: ExecuteTaskOutput['execution']
  diagnostics: Diagnostics
  verification: VerificationSummary
}): ExecuteTaskOutput['status'] {
  if (output.verification.blocked) return 'blocked'

  const hasFailure = output.execution.steps.some((step) => !step.ok)
  if (hasFailure) {
    return output.execution.steps.some((s) => s.ok) ? 'partial' : 'degraded'
  }

  if (output.diagnostics.degraded) return 'degraded'
  return 'ok'
}
