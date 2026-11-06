import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: process.platform === 'win32' && fs.existsSync(windowsChrome) ? { executablePath: windowsChrome } : {},
  },
  webServer: { command: 'node --experimental-sqlite scripts/e2e-server.mjs', url: 'http://127.0.0.1:3101/api/health', reuseExistingServer: false },
})
