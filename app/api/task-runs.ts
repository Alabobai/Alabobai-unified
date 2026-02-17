export const config = {
  runtime: 'nodejs',
}

import {
  asExecuteTaskPayload,
  getTaskRun,
  kickWatchdog,
  listTaskRuns,
  pauseTaskRun,
  resumeTaskRun,
  retryTaskRun,
} from './_lib/task-runtime.ts'

interface ControlRequest {
  action: 'pause' | 'resume' | 'retry' | 'watchdog-kick'
  runId?: string
}

function responseJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return responseJson({}, 200)

  const origin = new URL(req.url).origin

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const runId = url.searchParams.get('runId')

    if (runId) {
      const run = await getTaskRun(runId)
      if (!run) return responseJson({ error: 'run not found' }, 404)
      return responseJson(asExecuteTaskPayload(run), 200)
    }

    const limit = Number(url.searchParams.get('limit') || 25)
    const runs = await listTaskRuns(limit)
    return responseJson(
      {
        runs: runs.map((r) => ({
          id: r.id,
          task: r.task,
          state: r.state,
          attempt: r.attempt,
          maxAttempts: r.maxAttempts,
          checkpoint: r.checkpoint,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.completedAt,
          lastError: r.lastError,
        })),
      },
      200
    )
  }

  if (req.method !== 'POST') return responseJson({ error: 'Method not allowed' }, 405)

  let body: ControlRequest
  try {
    body = (await req.json()) as ControlRequest
  } catch {
    return responseJson({ error: 'Invalid JSON body' }, 400)
  }

  if (body.action === 'watchdog-kick') {
    await kickWatchdog(origin)
    return responseJson({ ok: true, action: body.action }, 200)
  }

  if (!body.runId) return responseJson({ error: 'runId is required' }, 400)

  const supportedActions = new Set(['pause', 'resume', 'retry'])
  if (!supportedActions.has(body.action)) {
    return responseJson({ error: `Unsupported action '${body.action}'. Expected one of: pause, resume, retry, watchdog-kick` }, 400)
  }

  const handlerByAction: Record<'pause' | 'resume' | 'retry', () => Promise<unknown>> = {
    pause: () => pauseTaskRun(body.runId!),
    resume: () => resumeTaskRun(body.runId!, origin),
    retry: () => retryTaskRun(body.runId!, origin),
  }

  const run = await handlerByAction[body.action as 'pause' | 'resume' | 'retry']?.()
  if (!run) return responseJson({ error: 'run not found' }, 404)

  return responseJson({ ok: true, action: body.action, run: asExecuteTaskPayload(run) }, 200)
}
