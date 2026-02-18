import { test, expect } from '@playwright/test'

const previewUrl = process.env.PREVIEW_URL

test('home shell loads without fatal runtime errors', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/')
  await expect(page).toHaveTitle(/alabobai/i)
  await expect(page.locator('body')).toBeVisible()

  const fatalErrors = consoleErrors.filter((e) =>
    /uncaught|cannot read|is not a function|failed to fetch/i.test(e)
  )
  expect(fatalErrors).toEqual([])
})

test('major sections are reachable', async ({ page }) => {
  await page.goto('/')

  const sections = ['Autonomous Agents', 'Command Center', 'Code Sandbox', 'Memory Dashboard']

  for (const name of sections) {
    const btn = page.getByRole('button', { name })
    await expect(btn).toBeVisible({ timeout: 15_000 })
    await btn.click()
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/encountered an error/i)).toHaveCount(0)
  }
})

test('preview URL health check', async ({ request }) => {
  test.skip(!previewUrl, 'PREVIEW_URL not provided')
  const res = await request.get(previewUrl!, { timeout: 15_000 })
  expect(res.ok()).toBeTruthy()
  const text = await res.text()
  expect(text.toLowerCase()).toContain('<!doctype html')
})
