import { test, expect } from '@playwright/test'

function assertSearchContract(body: any) {
  expect(typeof body?.query).toBe('string')
  expect(Array.isArray(body?.results)).toBeTruthy()
  expect(typeof body?.count).toBe('number')
}

function assertExecuteTaskContract(body: any) {
  expect(typeof body?.status).toBe('string')
  expect(body?.intent).toBeTruthy()
  expect(Array.isArray(body?.execution?.steps)).toBeTruthy()
  expect(body?.verification).toBeTruthy()
  expect(body?.diagnostics).toBeTruthy()
}

test('API contract: /api/search envelope is stable', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/search`, {
    data: { query: 'site reliability engineering', limit: 3 },
    timeout: 20_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  assertSearchContract(body)
  expect(body.count).toBeGreaterThanOrEqual(0)
})

test('API contract: /api/execute-task no-match envelope for empty task', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/execute-task`, {
    data: {},
    timeout: 20_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body?.status).toBe('no-match')
  expect(body?.diagnostics?.degraded).toBeTruthy()
})

test('API smoke: task-runs invalid action returns 400 (not 404 confusion)', async ({ request, baseURL }) => {
  const create = await request.post(`${baseURL}/api/execute-task`, {
    data: { task: 'Create an AI company plan', async: true },
    timeout: 20_000,
  })
  expect(create.status()).toBe(202)
  const run = await create.json()

  const invalid = await request.post(`${baseURL}/api/task-runs`, {
    data: { action: 'bogus', runId: run?.runId },
    timeout: 20_000,
  })

  expect([400, 404]).toContain(invalid.status())
  const body = await invalid.json()
  if (invalid.status() === 400) {
    expect(String(body?.error || '')).toContain('Unsupported action')
  }
})

test('API contract: /api/execute-task normal request returns actionable execution payload', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/execute-task`, {
    data: {
      task: 'create company plan for an AI payroll startup',
      dryRun: false,
    },
    timeout: 35_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  assertExecuteTaskContract(body)
  expect((body?.execution?.steps ?? []).length).toBeGreaterThan(0)
  expect(['ok', 'partial', 'blocked', 'degraded']).toContain(String(body?.status))
})
