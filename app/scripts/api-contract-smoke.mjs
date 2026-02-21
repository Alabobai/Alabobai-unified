#!/usr/bin/env node
/* eslint-env node */
/* global process, console, Request */

import searchHandler from '../api/search.ts'
import companyHandler from '../api/company.ts'
import executeTaskHandler from '../api/execute-task.ts'
import taskRunsHandler from '../api/task-runs.ts'

async function post(handler, path, body) {
  const req = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await handler(req)
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

const strictNonDegraded = ['1', 'true', 'yes', 'on'].includes(String(process.env.STRICT_NON_DEGRADED || '').toLowerCase())
const checks = []

const s = await post(searchHandler, '/api/search', { query: 'site reliability engineering', limit: 3 })
checks.push({
  name: 'search contract',
  ok: s.status === 200 && Array.isArray(s.json?.results) && typeof s.json?.count === 'number',
  evidence: { status: s.status, count: s.json?.count },
})

const c = await post(companyHandler, '/api/company', {
  action: 'generate-plan',
  name: 'ReliabilityProbe',
  companyType: 'SaaS',
  description: 'contract smoke',
})
checks.push({
  name: 'company contract',
  ok: c.status === 200 && !!c.json?.plan,
  evidence: { status: c.status, hasPlan: !!c.json?.plan },
})

const e = await post(executeTaskHandler, '/api/execute-task', { task: 'Create AI company plan', dryRun: false })
const executeTaskStatus = String(e.json?.status || '')
checks.push({
  name: strictNonDegraded ? 'execute-task contract (strict non-degraded)' : 'execute-task contract',
  ok:
    e.status === 200 &&
    typeof e.json?.status === 'string' &&
    Array.isArray(e.json?.execution?.steps) &&
    (!strictNonDegraded || executeTaskStatus !== 'degraded'),
  evidence: {
    status: e.status,
    runStatus: e.json?.status,
    steps: e.json?.execution?.steps?.length ?? 0,
    strictNonDegraded,
  },
})

const created = await post(executeTaskHandler, '/api/execute-task', { task: 'Create AI company plan', async: true })
const t = await post(taskRunsHandler, '/api/task-runs', { action: 'bogus', runId: created.json?.runId || 'missing' })
checks.push({
  name: 'task-runs invalid action is explicit',
  ok: [400, 404].includes(t.status),
  evidence: { status: t.status, error: String(t.json?.error || '') },
})

const failed = checks.filter((c0) => !c0.ok)
console.log(JSON.stringify({ suite: 'api-contract-smoke', pass: checks.length - failed.length, fail: failed.length, checks }, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
