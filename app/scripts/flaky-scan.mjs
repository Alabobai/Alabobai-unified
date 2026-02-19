#!/usr/bin/env node
/* eslint-env node */
/* global process, console, setTimeout, clearTimeout */
import { spawn } from 'node:child_process'

const repeatEach = Number(process.env.FLAKE_REPEAT_EACH || 5)
const maxFailures = Number(process.env.FLAKE_MAX_FAILURES || 0)
const timeoutMs = Number(process.env.FLAKE_TIMEOUT_MS || 180000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function run() {
  return new Promise((resolve) => {
    const args = [
      'playwright',
      'test',
      'tests/reliability/ui-and-preview.spec.ts',
      'tests/reliability/flow-replay.spec.ts',
      '--workers',
      '1',
      '--repeat-each',
      String(repeatEach),
      '--retries',
      '0',
      '--reporter',
      'json',
    ]
    const child = spawn('npx', args, { shell: true })

    let out = ''
    let err = ''
    let finished = false

    const timeout = setTimeout(() => {
      if (finished) return
      err += `\n[flaky-scan] timed out after ${timeoutMs}ms`
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!finished) child.kill('SIGKILL')
      }, 5000)
    }, timeoutMs)

    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })

    child.on('close', (code) => {
      finished = true
      clearTimeout(timeout)
      resolve({ code: code ?? 1, out, err })
    })
  })
}

const result = await run()

let parsed = null
try {
  const raw = result.out.trim()
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  const jsonPayload = firstBrace >= 0 && lastBrace > firstBrace
    ? raw.slice(firstBrace, lastBrace + 1)
    : raw
  parsed = JSON.parse(jsonPayload)
} catch {
  console.error('[flaky-scan] failed to parse playwright json output')
  console.error('--- stdout ---')
  console.error(result.out)
  console.error('--- stderr ---')
  console.error(result.err)
  process.exit(1)
}

const stats = parsed?.stats || {}
const expected = Number(stats?.expected || 0)
const unexpected = Number(stats?.unexpected || 0)
const flaky = Number(stats?.flaky || 0)

console.log(JSON.stringify({
  suite: 'flaky-scan',
  repeatEach,
  expected,
  unexpected,
  flaky,
  pass: unexpected <= maxFailures,
}, null, 2))

await sleep(5)
process.exit(unexpected <= maxFailures ? 0 : 1)
