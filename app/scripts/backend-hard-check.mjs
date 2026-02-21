#!/usr/bin/env node
/* eslint-env node */
/* global process, console */

const upstreamOrigin = process.env.API_BACKEND_ORIGIN || 'http://127.0.0.1:8888'
const timeoutMs = Number(process.env.BACKEND_CHECK_TIMEOUT_MS || 2000)
const requiredPaths = (process.env.BACKEND_REQUIRED_PATHS || '/api/sandbox/health,/api/memory/stats')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)

async function check(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${upstreamOrigin}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    return {
      path,
      ok: res.ok,
      status: res.status,
    }
  } catch (error) {
    return {
      path,
      ok: false,
      status: null,
      error: String(error?.message || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

const results = await Promise.all(requiredPaths.map(check))
const failed = results.filter((r) => !r.ok)

console.log(JSON.stringify({
  suite: 'backend-hard-check',
  upstreamOrigin,
  timeoutMs,
  checked: results.length,
  failed: failed.length,
  results,
}, null, 2))

process.exit(failed.length === 0 ? 0 : 1)
