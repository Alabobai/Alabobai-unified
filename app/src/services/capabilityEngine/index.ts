import { executePlan } from './executor'
import { planExecution } from './planner'
import { inferIntent, retrieveCapabilities } from './retriever'
import type { ExecuteTaskInput, ExecuteTaskOutput } from './types'
import { statusFromExecutionAndVerification, verifyExecutionQuality } from './verification'

export async function executeTask(input: ExecuteTaskInput, origin: string): Promise<ExecuteTaskOutput> {
  const safeTask = input.task?.trim() || ''

  const intent = inferIntent(safeTask)
  const matchedCapabilities = retrieveCapabilities({ task: safeTask, context: input.context, limit: 5 })

  if (!safeTask || matchedCapabilities.length === 0) {
    return {
      intent,
      matchedCapabilities,
      plan: [],
      execution: { dryRun: !!input.dryRun, steps: [] },
      status: 'no-match',
      diagnostics: {
        degraded: true,
        notes: [
          'No suitable capability matched the task. Fallback to chat/general assistant is recommended.',
          'TODO(v2): add embedding index + reranking across capability metadata.',
        ],
        failures: [],
      },
      verification: {
        verified: false,
        blocked: false,
        confidence: 0.2,
        summary: 'No execution happened, so verification was not applied.',
        checks: [],
        passedChecks: 0,
        failedChecks: 0,
      },
    }
  }

  const plan = planExecution(intent, safeTask, matchedCapabilities)
  const execution = await executePlan(plan, { origin, dryRun: input.dryRun })
  const executionResult = {
    dryRun: !!input.dryRun,
    steps: execution.steps,
  }

  const verification = verifyExecutionQuality({
    intent,
    execution: executionResult,
    diagnostics: execution.diagnostics,
  })

  if (verification.blocked) {
    const remediationNotes = verification.checks
      .filter((check) => !check.ok && check.remediation)
      .map((check) => `[${check.capabilityId}] ${check.remediation}`)

    execution.diagnostics.degraded = true
    execution.diagnostics.failures.push('verification-blocked: output failed quality gate(s)')
    execution.diagnostics.notes.push(...remediationNotes)
  }

  const status: ExecuteTaskOutput['status'] = statusFromExecutionAndVerification({
    execution: executionResult,
    diagnostics: execution.diagnostics,
    verification,
  })

  return {
    intent,
    matchedCapabilities,
    plan,
    execution: executionResult,
    status,
    diagnostics: execution.diagnostics,
    verification,
  }
}

export * from './types'
