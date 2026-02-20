import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'
const parsedBaseURL = new URL(baseURL)
const previewHost = parsedBaseURL.hostname
const previewPort = Number(parsedBaseURL.port || (parsedBaseURL.protocol === 'https:' ? 443 : 80))

export default defineConfig({
  testDir: './tests/reliability',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : {
        command: `npm run build && npm run preview -- --host ${previewHost} --port ${previewPort} --strictPort`,
        url: baseURL,
        // Reliability sweeps may run in loops where preview is already up.
        // Reuse existing server to avoid hard failure on occupied port in reruns.
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
