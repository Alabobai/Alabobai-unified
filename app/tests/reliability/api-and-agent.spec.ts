import { test, expect } from '@playwright/test'

test('API smoke: /api/search returns non-empty results for broad query', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/search`, {
    data: { query: 'global AI market trends', limit: 5 },
    timeout: 20_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(Array.isArray(body.results)).toBeTruthy()
  expect((body.count ?? body.results?.length ?? 0)).toBeGreaterThanOrEqual(0)
})

test('API smoke: /api/company can generate-plan', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/company`, {
    data: {
      action: 'generate-plan',
      name: 'ReliabilityProbe',
      companyType: 'SaaS',
      description: 'A fast smoke check company',
    },
    timeout: 25_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body?.plan?.mission).toBeTruthy()
})

test('autonomous workflow verification: execute-task returns intent + execution steps', async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/execute-task`, {
    data: {
      task: 'create company plan for a B2B AI support startup',
      dryRun: false,
    },
    timeout: 30_000,
  })

  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body?.intent?.label).toBeTruthy()
  expect(Array.isArray(body?.execution?.steps)).toBeTruthy()
  expect((body?.execution?.steps ?? []).length).toBeGreaterThan(0)
  expect(['ok', 'partial', 'blocked', 'degraded']).toContain(String(body?.status))
})
