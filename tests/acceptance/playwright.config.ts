import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  workers: 1, // Serial execution across files — prevents cleanup race conditions
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 375, height: 812 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
  webServer: [
    {
      command: 'cd ../../web && npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
    },
  ],
});
