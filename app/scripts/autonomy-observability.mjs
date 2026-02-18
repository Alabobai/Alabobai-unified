#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
import fs from 'node:fs'

const storePath = process.env.TASK_RUNTIME_STORE_PATH || '/tmp/alabobai-task-runs.json'
const eventsPath = process.env.TASK_RUNTIME_EVENTS_PATH || '/tmp/alabobai-task-runs.jsonl'
const staleMs = Number(process.env.OBS_STALE_MS || 10 * 60 * 1000)

function safeRead(path, fallback) {
  try { return fs.readFileSync(path, 'utf8') } catch { return fallback }
}

const storeRaw = safeRead(storePath, '{"runs":[]}')
let runs = []
try { runs = JSON.parse(storeRaw).runs || [] } catch { runs = [] }

const now = Date.now()
const stateCounts = runs.reduce((acc, run) => {
  const k = run?.state || 'unknown'
  acc[k] = (acc[k] || 0) + 1
  return acc
}, {})

const staleRuns = runs.filter((run) => {
  const t = Date.parse(run?.updatedAt || run?.createdAt || '')
  if (!Number.isFinite(t)) return false
  return now - t > staleMs && ['running', 'retrying', 'planned'].includes(String(run?.state || ''))
})

const eventsRaw = safeRead(eventsPath, '')
const eventLines = eventsRaw.split('\n').filter(Boolean)
const lastEvents = eventLines.slice(-20).map((line) => {
  try { return JSON.parse(line) } catch { return { parseError: true } }
})

const retryEvents = lastEvents.filter((e) => e.type === 'run.retry.scheduled').length

const report = {
  suite: 'autonomy-observability',
  storePath,
  eventsPath,
  runCount: runs.length,
  stateCounts,
  staleCandidateCount: staleRuns.length,
  staleCandidates: staleRuns.slice(0, 10).map((r) => ({ id: r.id, state: r.state, updatedAt: r.updatedAt, task: r.task })),
  recentEventCount: lastEvents.length,
  retryEventsInRecentWindow: retryEvents,
}

console.log(JSON.stringify(report, null, 2))
process.exit(0)
