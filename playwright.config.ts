import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const defaultSystemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const systemChromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? defaultSystemChromePath
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1' && existsSync(systemChromePath)

export default defineConfig({
  testDir: './scripts/theme-ui',
  testMatch: '**/*.pw.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: useSystemChrome ? { executablePath: systemChromePath } : undefined,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
    },
    {
      name: 'narrow-mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180/theme-audit.html',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
