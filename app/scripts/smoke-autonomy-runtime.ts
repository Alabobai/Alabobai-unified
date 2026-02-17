import executeTaskHandler from '../api/execute-task'
import taskRunsHandler from '../api/task-runs'

async function post(url: string, body: unknown) {
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await (url.includes('/api/task-runs') ? taskRunsHandler(req) : executeTaskHandler(req))
  return { status: res.status, json: await res.json() }
}

async function get(url: string) {
  const req = new Request(url, { method: 'GET' })
  const res = await (url.includes('/api/task-runs') ? taskRunsHandler(req) : executeTaskHandler(req))
  return { status: res.status, json: await res.json() }
}

async function main() {
  const base = 'http://localhost:3000'

  const create = await post(`${base}/api/execute-task`, {
    task: 'Create company plan for AI bookkeeping startup',
    async: true,
  })
  console.log('CREATE', create.status, create.json)

  const runId = create.json?.runId as string
  if (!runId) throw new Error('runId missing from create response')

  const pause = await post(`${base}/api/task-runs`, { action: 'pause', runId })
  console.log('PAUSE', pause.status, pause.json?.run?.runState)

  const resume = await post(`${base}/api/task-runs`, { action: 'resume', runId })
  console.log('RESUME', resume.status, resume.json?.run?.runState)

  const retry = await post(`${base}/api/task-runs`, { action: 'retry', runId })
  console.log('RETRY', retry.status, retry.json?.run?.runState)

  const status = await get(`${base}/api/task-runs?runId=${runId}`)
  console.log('STATUS', status.status, {
    runId: status.json?.runId,
    runState: status.json?.runState,
    status: status.json?.status,
    checkpoint: status.json?.execution?.steps?.length,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
