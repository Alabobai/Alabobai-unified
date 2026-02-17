export const config = {
  runtime: 'nodejs',
}

import { submitJob, type JobType } from '../_lib/job-queue.ts'

function responseJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return responseJson({}, 200)
  if (req.method !== 'POST') return responseJson({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    const type = body?.type as JobType
    const payload = body?.payload as Record<string, unknown>
    const maxAttempts = Number(body?.maxAttempts || 3)

    if (!type || !['image', 'video'].includes(type)) {
      return responseJson({ error: 'type must be one of: image, video' }, 400)
    }

    if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
      return responseJson({ error: 'payload.prompt is required' }, 400)
    }

    const job = await submitJob(type, payload, maxAttempts)
    return responseJson(
      {
        ok: true,
        jobId: job.id,
        status: job.status,
        statusUrl: `/api/jobs/status?id=${job.id}`,
        attempts: { current: job.attempt, max: job.maxAttempts },
        createdAt: job.createdAt,
      },
      202
    )
  } catch (error) {
    return responseJson(
      {
        ok: false,
        error: 'submit failed',
        details: error instanceof Error ? error.message : 'unknown error',
      },
      200
    )
  }
}
