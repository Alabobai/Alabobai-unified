import { test, expect } from '@playwright/test'

async function gotoAndSettle(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('domcontentloaded')
}

test('UI flow replay: switch critical sections from sidebar without runtime crash', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (err) => runtimeErrors.push(String(err?.message || err)))

  await gotoAndSettle(page, '/')

  const views = ['Autonomous Agents', 'Command Center', 'Code Sandbox', 'Memory Dashboard']

  for (const navText of views) {
    const btn = page.getByRole('button', { name: navText })
    await expect(btn).toBeVisible({ timeout: 15_000 })
    await btn.click()

    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/encountered an error/i)).toHaveCount(0)
  }

  const fatal = runtimeErrors.filter((e) => /chunk|dynamic import|cannot read|undefined|not a function/i.test(e))
  expect(fatal).toEqual([])
})
