#!/usr/bin/env node
/**
 * ECC Runtimes 验证 — 系统 Chrome，禁止 Cursor 内置浏览器。
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const BASE = process.env.QRCLAW_WEB_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('output/ecc-verify');
mkdirSync(OUT_DIR, { recursive: true });

const report = { ts: new Date().toISOString(), steps: [], pass: false };
function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail.msg ? `: ${detail.msg}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.request.post(`${BASE}/api/dev/bootstrap`);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('SupabaseAuthClient')) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${BASE}/runtimes`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForURL(/\/agents$/, { timeout: 30_000 });
  await page.getByTestId('agents-page').waitFor({ timeout: 15_000 });
  step('runtimes route redirects to agents', /\/agents$/.test(page.url()));
  step('merged agents page visible', await page.getByTestId('agents-page').isVisible());

  const runtimesNavCount = await page.getByRole('link', { name: /runtimes/i }).count();
  step('runtimes nav hidden', runtimesNavCount === 0, { runtimesNavCount });
  const runtimeStatusVisible = await page.getByText('本机运行状态', { exact: true }).isVisible().catch(() => false);
  step('runtime status module hidden on agents page', !runtimeStatusVisible);
  step('no console errors', consoleErrors.length === 0, { count: consoleErrors.length, sample: consoleErrors.slice(0, 3) });

  report.pass = report.steps.every((s) => s.ok);
  writeFileSync(path.join(OUT_DIR, 'runtimes-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
