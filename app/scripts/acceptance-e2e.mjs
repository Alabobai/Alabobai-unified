#!/usr/bin/env node
/* global process, console */
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

const APP_ROOT = '/Users/alaboebai/Alabobai/alabobai-unified/app'
const ACCEPT_ORIGIN = 'http://acceptance.local'
const REPORT_PATH = '/Users/alaboebai/.openclaw/workspace/NOW_TRACK_5_ACCEPTANCE_REPORT.md'

process.env.JOB_EXECUTION_TIMEOUT_MS = process.env.JOB_EXECUTION_TIMEOUT_MS || '80'

let generateCount = 0
const stubPort = 47811
const stubServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.url === '/generate') {
    generateCount += 1
    if (generateCount === 1) {
      await new Promise((r) => globalThis.setTimeout(r, 220))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ url: 'https://example.com/fake-video.mp4' }))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

await new Promise((resolve, reject) => {
  stubServer.once('error', reject)
  stubServer.listen(stubPort, '127.0.0.1', resolve)
})
process.env.VIDEO_INFERENCE_URL = `http://127.0.0.1:${stubPort}`

function mod(p) {
  return import(pathToFileURL(path.join(APP_ROOT, p)).href)
}

const handlers = {
  '/api/company': (await mod('api/company.ts')).default,
  '/api/search': (await mod('api/search.ts')).default,
  '/api/generate-image': (await mod('api/generate-image.ts')).default,
  '/api/generate-video': (await mod('api/generate-video.ts')).default,
  '/api/execute-task': (await mod('api/execute-task.ts')).default,
  '/api/jobs/submit': (await mod('api/jobs/submit.ts')).default,
  '/api/jobs/status': (await mod('api/jobs/status.ts')).default,
}

const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const request = input instanceof globalThis.Request ? input : new globalThis.Request(input, init)
  const url = new globalThis.URL(request.url)

  if (url.origin === ACCEPT_ORIGIN && handlers[url.pathname]) {
    return handlers[url.pathname](request)
  }

  return originalFetch(input, init)
}

async function callApi(pathname, method = 'GET', body = undefined) {
  const fullUrl = `${ACCEPT_ORIGIN}${pathname}`
  const req = new globalThis.Request(fullUrl, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const routePath = new globalThis.URL(fullUrl).pathname
  const handler = handlers[routePath]
  if (!handler) throw new Error(`No local handler for ${routePath}`)
  const res = await handler(req)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, ok: res.ok, data }
}

const tests = []
function addTest(name, fn) { tests.push({ name, fn }) }

addTest('Create company plan journey', async () => {
  const r = await callApi('/api/company', 'POST', {
    action: 'generate-plan',
    name: 'LedgerPilot',
    companyType: 'AI bookkeeping',
    description: 'Automate monthly closes for SMBs',
  })
  const plan = r.data?.plan
  if (r.status !== 200 || !plan?.executive_summary || !plan?.mission || !Array.isArray(plan?.departments)) {
    throw new Error(`Expected valid plan payload, got status=${r.status}`)
  }
  return { status: r.status, fields: ['executive_summary', 'mission', 'departments'] }
})

addTest('Deep research journey', async () => {
  const r = await callApi('/api/search', 'POST', { query: 'AI bookkeeping market trends 2026', limit: 3 })
  if (r.status !== 200 || !Array.isArray(r.data?.results)) {
    throw new Error(`Expected search results array, got status=${r.status}`)
  }
  const count = r.data.count ?? r.data.results.length
  if (!count || count < 1) {
    throw new Error('Deep research returned zero results for a broad market query')
  }
  return { status: r.status, count }
})

addTest('Generate image journey', async () => {
  const r = await callApi('/api/generate-image', 'POST', {
    prompt: 'Minimalist logo for LedgerPilot',
    width: 512,
    height: 512,
    style: 'logo',
  })
  if (r.status !== 200 || typeof r.data?.url !== 'string' || !r.data.url.startsWith('data:image/')) {
    throw new Error(`Expected image URL/fallback, got status=${r.status}`)
  }
  return { status: r.status, backend: r.data.backend, fallback: !!r.data.fallback }
})

addTest('Generate video journey', async () => {
  const r = await callApi('/api/generate-video', 'POST', {
    prompt: 'Product teaser for AI bookkeeping dashboard',
    durationSeconds: 3,
    fps: 12,
    width: 512,
    height: 512,
  })
  if (r.status !== 200 || typeof r.data?.url !== 'string') {
    throw new Error(`Expected video URL/fallback, got status=${r.status}`)
  }
  return { status: r.status, backend: r.data.backend, fallback: !!r.data.fallback }
})

addTest('Execute-task command mode journey', async () => {
  const r = await callApi('/api/execute-task', 'POST', {
    task: 'create company plan for an AI bookkeeping startup',
    dryRun: false,
  })
  if (r.status !== 200 || !r.data?.intent?.label || !Array.isArray(r.data?.execution?.steps) || r.data.execution.steps.length === 0) {
    throw new Error(`Expected execute-task execution steps, got status=${r.status}`)
  }
  if (!['ok', 'partial'].includes(String(r.data.status))) {
    throw new Error(`Execute-task returned non-healthy status=${r.data.status}`)
  }
  return {
    status: r.status,
    intent: r.data.intent.label,
    overall: r.data.status,
    steps: r.data.execution.steps.length,
  }
})

addTest('Queue submit/status/retry journey', async () => {
  const submit = await callApi('/api/jobs/submit', 'POST', {
    type: 'video',
    payload: { prompt: 'Queue retry probe video' },
    maxAttempts: 3,
  })
  if (submit.status !== 202 || !submit.data?.jobId) {
    throw new Error(`Expected queue submit 202, got status=${submit.status}`)
  }

  const jobId = submit.data.jobId
  let observedRetry = false
  let finalStatus = 'unknown'
  let attempts = 0

  for (let i = 0; i < 30; i++) {
    const st = await callApi(`/api/jobs/status?id=${jobId}`, 'GET')
    if (st.status !== 200 || !st.data?.job) {
      throw new Error(`status polling failed status=${st.status}`)
    }
    finalStatus = st.data.job.status
    attempts = st.data.job.attempts.current
    if (finalStatus === 'retrying') observedRetry = true
    if (finalStatus === 'succeeded' || finalStatus === 'failed') break
    await new Promise((r) => globalThis.setTimeout(r, 120))
  }

  if (!observedRetry && attempts <= 1) {
    throw new Error(`Expected retry evidence (retrying state or attempts>1), final=${finalStatus}, attempts=${attempts}`)
  }
  if (finalStatus !== 'succeeded') throw new Error(`Expected succeeded after retry, final=${finalStatus}`)

  return { submitted: true, observedRetry, finalStatus, attempts }
})

const startedAt = new Date().toISOString()
const results = []
for (const t of tests) {
  try {
    const details = await t.fn()
    results.push({ name: t.name, pass: true, details })
  } catch (error) {
    results.push({ name: t.name, pass: false, error: error instanceof Error ? error.message : String(error) })
  }
}
const finishedAt = new Date().toISOString()

await new Promise((resolve) => stubServer.close(resolve))

const passCount = results.filter((r) => r.pass).length
const failCount = results.length - passCount
const go = failCount === 0

const blockers = []
if (results.find((r) => r.name.includes('retry') && !r.pass)) {
  blockers.push({
    title: 'Queue retry path failed to meet acceptance behavior',
    fix: '/Users/alaboebai/Alabobai/alabobai-unified/app/api/_lib/job-queue.ts',
    reason: 'Ensure retry transitions are observable and terminal status can recover to succeeded for transient worker timeout/fetch errors.',
  })
}
if (results.find((r) => r.name.includes('Deep research') && !r.pass)) {
  blockers.push({
    title: 'Deep research search failed in local acceptance',
    fix: '/Users/alaboebai/Alabobai/alabobai-unified/app/api/search.ts',
    reason: 'Harden fallback pathway when external providers are unavailable and always return deterministic non-empty local results.',
  })
}
if (results.find((r) => r.name.includes('Execute-task') && !r.pass)) {
  blockers.push({
    title: 'Execute-task command mode did not complete core flow',
    fix: '/Users/alaboebai/Alabobai/alabobai-unified/app/api/execute-task.ts and /Users/alaboebai/Alabobai/alabobai-unified/app/src/services/capabilityEngine/executor.ts',
    reason: 'Ensure command-mode API always returns planned execution steps for core prompts and route execution remains resilient.',
  })
}

const lines = []
lines.push('# NOW Track 5 - End-to-End Acceptance Report')
lines.push('')
lines.push(`- App: \`/Users/alaboebai/Alabobai/alabobai-unified/app\``)
lines.push(`- Started: ${startedAt}`)
lines.push(`- Finished: ${finishedAt}`)
lines.push(`- Harness: \`scripts/acceptance-e2e.mjs\` (in-process API routing + retry stub backend)`)
lines.push('')
lines.push(`## Verdict: ${go ? 'GO' : 'NO-GO'}`)
lines.push('')
lines.push(`- Passed: **${passCount}/${results.length}**`)
lines.push(`- Failed: **${failCount}/${results.length}**`)
lines.push('')
lines.push('## Journey Results')
lines.push('')
for (const r of results) {
  lines.push(`### ${r.pass ? '✅ PASS' : '❌ FAIL'} - ${r.name}`)
  if (r.pass) lines.push(`- Details: \`${JSON.stringify(r.details)}\``)
  else lines.push(`- Error: ${r.error}`)
  lines.push('')
}

lines.push('## Blockers (with exact file-path fixes)')
lines.push('')
if (blockers.length === 0) {
  lines.push('- None. No blockers detected in this acceptance run.')
} else {
  for (const b of blockers) {
    lines.push(`- **${b.title}**`)
    lines.push(`  - Fix file(s): \`${b.fix}\``)
    lines.push(`  - Why: ${b.reason}`)
  }
}
lines.push('')
lines.push('## Notes')
lines.push('')
lines.push('- This harness validates API-level user journeys, including execute-task command mode and queue retry behavior.')
lines.push('- Media generation acceptance allows successful fallback assets as valid completion for local/offline reliability mode.')

await fs.writeFile(REPORT_PATH, lines.join('\n'), 'utf8')

console.log(JSON.stringify({ reportPath: REPORT_PATH, go, passCount, failCount }, null, 2))
process.exit(go ? 0 : 1)
