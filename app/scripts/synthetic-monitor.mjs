#!/usr/bin/env node
/* eslint-env node */
/* global process, console, Request */

import searchHandler from '../api/search.ts'
import executeTaskHandler from '../api/execute-task.ts'
import companyHandler from '../api/company.ts'

async function check(name, fn) {
  const started = Date.now()
  try {
    const ok = await fn()
    return { name, ok, latencyMs: Date.now() - started }
  } catch (error) {
    return { name, ok: false, latencyMs: Date.now() - started, error: (error instanceof Error ? error.message : String(error)) }
  }
}

async function post(handler, path, body) {
  const req = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await handler(req)
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

const results = []
results.push(await check('search', async () => {
  const r = await post(searchHandler, '/api/search', { query: 'synthetic reliability', limit: 3 })
  return r.status === 200 && Array.isArray(r.json?.results)
}))

results.push(await check('execute-task', async () => {
  const r = await post(executeTaskHandler, '/api/execute-task', { task: 'Synthetic monitoring probe task' })
  return r.status === 200 && typeof r.json?.status === 'string'
}))

results.push(await check('company-plan', async () => {
  const r = await post(companyHandler, '/api/company', {
    action: 'generate-plan',
    name: 'MonitorCo',
    companyType: 'SaaS',
    description: 'probe',
  })
  return r.status === 200 && !!r.json?.plan
}))

const failed = results.filter((r) => !r.ok)
const p95 = [...results.map((r) => r.latencyMs)].sort((a, b) => a - b)[Math.max(0, Math.ceil(results.length * 0.95) - 1)]

const summary = {
  suite: 'synthetic-monitor',
  total: results.length,
  failed: failed.length,
  p95LatencyMs: p95,
  results,
}

console.log(JSON.stringify(summary, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
