export const config = {
  runtime: 'nodejs',
}

import { getJob, kickQueue } from '../_lib/job-queue.ts'

function responseJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return responseJson({}, 200)
  if (req.method !== 'GET') return responseJson({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return responseJson({ error: 'id is required' }, 400)

  await kickQueue()
  const job = await getJob(id)
  if (!job) return responseJson({ error: 'job not found' }, 404)

  const retryInMs = job.status === 'retrying' ? Math.max(0, job.nextRunAt - Date.now()) : 0

  return responseJson({
    ok: true,
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      attempts: {
        current: job.attempt,
        max: job.maxAttempts,
      },
      retryInMs,
      lastError: job.lastError,
      result: job.result,
    },
  })
}
