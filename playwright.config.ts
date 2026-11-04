import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test/scratch/browser-results.json' }]],
  outputDir: 'test/scratch/browser-output',
  use: { baseURL: 'http://127.0.0.1:4173/preview/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:4173/preview/', reuseExistingServer: false },
});
