#!/usr/bin/env node
/* eslint-env node */
/* global process, console, fetch, setTimeout, clearTimeout */
import { spawn } from 'node:child_process'

const repeatEach = Number(process.env.FLAKE_REPEAT_EACH || 5)
const maxFailures = Number(process.env.FLAKE_MAX_FAILURES || 0)
const timeoutMs = Number(process.env.FLAKE_TIMEOUT_MS || 180000)
const previewPort = Number(process.env.FLAKE_PREVIEW_PORT || 4173)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${previewPort}`

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runCommand(command, args, options = {}) {
  const { env = process.env, timeout = timeoutMs } = options
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, env })
    let out = ''
    let err = ''
    let finished = false

    const timer = setTimeout(() => {
      if (finished) return
      err += `\n[flaky-scan] command timed out after ${timeout}ms: ${command} ${args.join(' ')}`
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!finished) child.kill('SIGKILL')
      }, 5000)
    }, timeout)

    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })

    child.on('close', (code) => {
      finished = true
      clearTimeout(timer)
      resolve({ code: code ?? 1, out, err, child })
    })
  })
}

async function startPreview() {
  const args = ['vite', 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort']
  const child = spawn('npx', args, { shell: true, env: process.env })

  let logs = ''
  child.stdout.on('data', (d) => { logs += d.toString() })
  child.stderr.on('data', (d) => { logs += d.toString() })

  const startedAt = Date.now()
  while (Date.now() - startedAt < 20000) {
    if (child.exitCode !== null) {
      throw new Error(`preview server exited early (code ${child.exitCode}). Logs:\n${logs}`)
    }
    try {
      const res = await fetch(baseUrl)
      if (res.ok) return { child, logs }
    } catch {
      // keep polling
    }
    await wait(500)
  }

  child.kill('SIGTERM')
  throw new Error(`preview server did not become ready at ${baseUrl} within 20s. Logs:\n${logs}`)
}

let preview = null
try {
  preview = await startPreview()

  const playwrightArgs = [
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

  const env = {
    ...process.env,
    SKIP_WEBSERVER: '1',
    BASE_URL: baseUrl,
    PREVIEW_URL: baseUrl,
  }

  const result = await runCommand('npx', playwrightArgs, { env })

  let parsed
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
  const pass = result.code === 0 && unexpected <= maxFailures

  console.log(JSON.stringify({
    suite: 'flaky-scan',
    baseUrl,
    repeatEach,
    expected,
    unexpected,
    flaky,
    pass,
  }, null, 2))

  process.exit(pass ? 0 : 1)
} catch (error) {
  console.error('[flaky-scan] fatal error')
  console.error(String(error?.message || error))
  process.exit(1)
} finally {
  if (preview?.child && preview.child.exitCode === null) {
    preview.child.kill('SIGTERM')
    await wait(500)
    if (preview.child.exitCode === null) {
      preview.child.kill('SIGKILL')
    }
  }
}
