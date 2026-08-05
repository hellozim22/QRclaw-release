import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Runtime switches so the same config works in three contexts:
//   1. Local dev (`npm run test:e2e` from tests/): reuse whatever dev server
//      the developer already started; fall back to `next dev` in web/.
//   2. CI pipeline (tests-e2e job): start `next start` against a pre-built
//      web/ output (faster than `next dev`, closer to production).
//   3. Local visual-audit runs (`npm run visual-audit:capture`): handled by a
//      separate config under e2e/visual-audit/; this file is NOT that one.
const isCI = !!process.env.CI;
const configDir = path.dirname(fileURLToPath(import.meta.url));

for (const file of ['../gateway/.env', '../web/.env.local']) {
  loadEnvFile(path.resolve(configDir, file));
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    process.env[parsed.key] ??= parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key: match[1], value };
}

export default defineConfig({
  testDir: './e2e',
  // Scope Playwright to *real* browser specs only. The e2e/ tree historically
  // also holds vitest-based mock "specs" (web/, mobile/, flows/) that live
  // here for narrative reasons and are executed by the `tests` Vitest job
  // (see tests/vitest.config.ts `include`). Running them with the Playwright
  // runner crashes because they import vitest's expect + web `@/lib` alias.
  //
  // The visual-audit/ folder owns its own config
  // (e2e/visual-audit/playwright.config.ts) and is driven manually via
  // `npm run visual-audit:capture`.
  //
  // Follow-up: rename web/mobile/flows `*.spec.ts` → `*.test.ts` and relocate
  // under tests/integration/ to make this split structural rather than rule-based.
  testIgnore: ['visual-audit/**', 'web/**', 'mobile/**', 'flows/**'],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },
  projects: isCI
    ? [
        // CI pipeline: chromium only to keep wall-clock sane.
        // Add mobile-chrome / firefox in a follow-up once the spec inventory justifies it.
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      ]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
        { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
      ],
  webServer: {
    // CI expects `web/` to be built already (see .github/workflows/ci.yml tests-e2e job).
    // Local dev uses `next dev` with HMR.
    command: isCI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    cwd: '../web',
    timeout: 120_000,
    // Propagate the Supabase placeholders already used by `web-lint` job so
    // `next start` can prerender routes that instantiate a Supabase client.
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
      NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001',
      NEXT_PUBLIC_GATEWAY_WS_URL:
        process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? 'ws://localhost:3001/ws',
    },
  },
});
