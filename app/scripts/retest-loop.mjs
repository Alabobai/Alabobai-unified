#!/usr/bin/env node
/* eslint-env node */
/* global process, console, setTimeout */
import { spawn } from 'node:child_process'

const maxRounds = Number(process.env.RETEST_ROUNDS || 12)
const delayMs = Number(process.env.RETEST_DELAY_MS || 20000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runOnce(round) {
  return new Promise((resolve) => {
    console.log(`\n[retest] round ${round}/${maxRounds}`)
    const child = spawn('npx', ['playwright', 'test', '--reporter=list'], {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

let failures = 0
for (let i = 1; i <= maxRounds; i += 1) {
  const code = await runOnce(i)
  if (code !== 0) failures += 1

  if (i < maxRounds) {
    console.log(`[retest] sleeping ${delayMs}ms before next run...`)
    await sleep(delayMs)
  }
}

console.log(`\n[retest] done. failed rounds: ${failures}/${maxRounds}`)
process.exit(failures > 0 ? 1 : 0)
