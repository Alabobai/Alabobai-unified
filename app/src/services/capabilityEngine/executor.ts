import { recordExecutionTelemetry } from './telemetry'
import type { Diagnostics, ExecutionStepResult, PlanStep } from './types'

export async function executePlan(
  plan: PlanStep[],
  opts: { origin: string; dryRun?: boolean }
): Promise<{ steps: ExecutionStepResult[]; diagnostics: Diagnostics }> {
  const steps: ExecutionStepResult[] = []
  const diagnostics: Diagnostics = {
    degraded: false,
    notes: [],
    failures: [],
  }

  if (opts.dryRun) {
    const dryRunSteps = plan.map((p) => {
      recordExecutionTelemetry({
        ts: new Date().toISOString(),
        capabilityId: p.capabilityId,
        step: p.step,
        latencyMs: 0,
        failureClass: 'dry_run',
        fallbackUsed: p.step > 1,
        status: 200,
      })

      return {
        step: p.step,
        capabilityId: p.capabilityId,
        ok: true,
        status: 200,
        route: p.route,
        method: p.method,
        data: { dryRun: true },
      }
    })

    return {
      steps: dryRunSteps,
      diagnostics,
    }
  }

  for (const step of plan) {
    const startedAt = Date.now()

    try {
      const url = `${opts.origin}${step.route}`
      const response = await fetch(url, {
        method: step.method,
        headers: step.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: step.method === 'POST' ? JSON.stringify(step.payload || {}) : undefined,
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = await response.text().catch(() => null)
      }

      const ok = response.ok
      const latencyMs = Date.now() - startedAt
      const failureClass = ok ? 'success' : 'http_error'

      if (!ok) {
        diagnostics.degraded = true
        diagnostics.failures.push(`${step.capabilityId} returned ${response.status}`)
      }

      steps.push({
        step: step.step,
        capabilityId: step.capabilityId,
        ok,
        status: response.status,
        route: step.route,
        method: step.method,
        data,
        error: ok ? undefined : `Request failed with status ${response.status}`,
      })

      recordExecutionTelemetry({
        ts: new Date().toISOString(),
        capabilityId: step.capabilityId,
        step: step.step,
        latencyMs,
        failureClass,
        fallbackUsed: step.step > 1,
        status: response.status,
      })
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      diagnostics.degraded = true
      diagnostics.failures.push(`${step.capabilityId} threw network/runtime error`)
      steps.push({
        step: step.step,
        capabilityId: step.capabilityId,
        ok: false,
        status: 0,
        route: step.route,
        method: step.method,
        error: error instanceof Error ? error.message : 'Unknown execution failure',
      })

      recordExecutionTelemetry({
        ts: new Date().toISOString(),
        capabilityId: step.capabilityId,
        step: step.step,
        latencyMs,
        failureClass: 'runtime_error',
        fallbackUsed: step.step > 1,
        status: 0,
      })
    }
  }

  if (diagnostics.degraded) {
    diagnostics.notes.push('One or more execution steps degraded in v1 fallback mode.')
    diagnostics.notes.push('TODO(v2): add queue + retry + circuit-breaker state for resilient execution.')
  }

  return { steps, diagnostics }
}
