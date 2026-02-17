import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import executeTaskHandler from '../api/execute-task'
import taskRunsHandler from '../api/task-runs'
import jobsSubmitHandler from '../api/jobs/submit'
import jobsStatusHandler from '../api/jobs/status'

type Handler = (req: Request) => Promise<Response>

const PORT = Number(process.env.RUNTIME_API_BRIDGE_PORT || 8891)
const HOST = process.env.RUNTIME_API_BRIDGE_HOST || '127.0.0.1'

function pickHandler(pathname: string): Handler | null {
  if (pathname === '/api/execute-task') return executeTaskHandler
  if (pathname === '/api/task-runs') return taskRunsHandler
  if (pathname === '/api/jobs/submit') return jobsSubmitHandler
  if (pathname === '/api/jobs/status') return jobsStatusHandler
  return null
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function copyResponseHeaders(from: Response, to: ServerResponse) {
  from.headers.forEach((value, key) => {
    to.setHeader(key, value)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const method = req.method || 'GET'
  const host = req.headers.host || `${HOST}:${PORT}`
  const url = new URL(req.url || '/', `http://${host}`)
  const handler = pickHandler(url.pathname)

  if (!handler) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  try {
    const bodyBuffer = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
    const request = new Request(url.toString(), {
      method,
      headers: req.headers as HeadersInit,
      body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
    })

    const response = await handler(request)
    res.statusCode = response.status
    copyResponseHeaders(response, res)

    const payload = Buffer.from(await response.arrayBuffer())
    res.end(payload)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'runtime-api-bridge failure',
        details: error instanceof Error ? error.message : 'unknown error',
      })
    )
  }
}

createServer((req, res) => {
  void handle(req, res)
}).listen(PORT, HOST, () => {
  console.log(`[runtime-api-bridge] listening on http://${HOST}:${PORT}`)
})
