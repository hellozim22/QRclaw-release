import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'user.json');

const baseURL =
  process.env.VISUAL_AUDIT_BASE_URL?.replace(/\/$/, '') || 'https://qrclaw-test.vercel.app';

export default defineConfig({
  testDir: __dirname,
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 20000,
    navigationTimeout: 60000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile-empty-qr',
      dependencies: ['setup'],
      testMatch: /capture-mobile-empty-qr\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        storageState: authFile,
      },
    },
    {
      name: 'dashboard',
      dependencies: ['setup', 'mobile-empty-qr'],
      testMatch: /capture-dashboard\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: authFile,
      },
    },
    {
      name: 'mobile-public',
      testMatch: /capture-mobile-public\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-auth',
      dependencies: ['setup', 'dashboard'],
      testMatch: /capture-mobile-auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        storageState: authFile,
      },
    },
  ],
});
