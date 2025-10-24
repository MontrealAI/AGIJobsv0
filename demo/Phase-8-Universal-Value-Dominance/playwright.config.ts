import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node tests/server.js',
    port: 4175,
    reuseExistingServer: !process.env.CI,
  },
});
