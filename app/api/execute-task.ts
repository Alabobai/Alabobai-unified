export const config = {
  runtime: 'nodejs',
}

import {
  asExecuteTaskPayload,
  createTaskRun,
  getTaskRun,
  kickWatchdog,
  waitForRun,
} from './_lib/task-runtime'

interface ExecuteTaskRequest {
  task: string
  context?: Record<string, unknown>
  dryRun?: boolean
  async?: boolean
  waitTimeoutMs?: number
  runId?: string
}

function responseJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return responseJson({}, 200)
  }

  const origin = new URL(req.url).origin

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const runId = url.searchParams.get('runId') || ''
    if (!runId) {
      return responseJson({ error: 'runId is required' }, 400)
    }

    const run = await getTaskRun(runId)
    if (!run) return responseJson({ error: 'run not found' }, 404)
    return responseJson(asExecuteTaskPayload(run), 200)
  }

  if (req.method !== 'POST') {
    return responseJson({ error: 'Method not allowed' }, 405)
  }

  let body: ExecuteTaskRequest | null = null
  try {
    body = (await req.json()) as ExecuteTaskRequest
  } catch {
    return responseJson(
      {
        status: 'degraded',
        diagnostics: {
          degraded: true,
          notes: ['Invalid JSON payload. Provide { task, context?, dryRun?, async?, waitTimeoutMs? }.'],
          failures: ['request.json parse failed'],
        },
        verification: {
          verified: false,
          blocked: false,
          confidence: 0,
          summary: 'Request rejected before execution; no verification performed.',
          checks: [],
          passedChecks: 0,
          failedChecks: 0,
        },
      },
      200
    )
  }

  const task = body?.task?.trim() || ''
  if (!task) {
    return responseJson(
      {
        status: 'no-match',
        diagnostics: {
          degraded: true,
          notes: ['Task is required and must be a non-empty string.'],
          failures: [],
        },
        verification: {
          verified: false,
          blocked: false,
          confidence: 0.1,
          summary: 'No task provided; verification skipped.',
          checks: [],
          passedChecks: 0,
          failedChecks: 0,
        },
      },
      200
    )
  }

  try {
    await kickWatchdog(origin)
    const run = await createTaskRun(
      {
        task,
        context: body?.context,
        dryRun: body?.dryRun,
      },
      origin
    )

    const asyncMode = body?.async === true
    if (asyncMode) {
      return responseJson(
        {
          accepted: true,
          runId: run.id,
          runState: run.state,
          checkpoint: run.checkpoint,
          statusUrl: `/api/execute-task?runId=${run.id}`,
          controlUrl: `/api/task-runs`,
        },
        202
      )
    }

    const settled = await waitForRun(run.id, Math.max(1000, Math.min(60000, body?.waitTimeoutMs || 25000)))
    const latest = settled || run
    return responseJson(asExecuteTaskPayload(latest), 200)
  } catch (error) {
    return responseJson(
      {
        status: 'degraded',
        diagnostics: {
          degraded: true,
          notes: ['Execution runtime failed unexpectedly.'],
          failures: [error instanceof Error ? error.message : 'unknown execution error'],
        },
        verification: {
          verified: false,
          blocked: false,
          confidence: 0.15,
          summary: 'Runtime failed before verification completed.',
          checks: [],
          passedChecks: 0,
          failedChecks: 0,
        },
      },
      200
    )
  }
}
