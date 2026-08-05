#!/usr/bin/env node
/**
 * ECC Agents 验证 — 系统 Chrome，禁止 Cursor 内置浏览器。
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
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-first-run'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.request.post(`${BASE}/api/dev/bootstrap`);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('SupabaseAuthClient')) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${BASE}/agents`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByTestId('agents-page').waitFor({ timeout: 15_000 });
  step('agents page visible', await page.getByTestId('agents-page').isVisible());

  await page
    .locator('[data-testid^="agent-avatar-"]')
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  const avatarCount = await page.locator('[data-testid^="agent-avatar-"]').count();
  step('agent avatars visible', avatarCount > 0, { avatarCount });

  const runtimeStatusVisible = await page
    .getByText('本机运行状态', { exact: true })
    .isVisible()
    .catch(() => false);
  step('agents page hides runtime status module', !runtimeStatusVisible);
  const configVisible = await page
    .getByText('Agent 配置', { exact: true })
    .isVisible()
    .catch(() => false);
  step('agent settings are merged into one panel', configVisible);
  const roleFieldVisible = await page
    .getByText(/角色说明/)
    .first()
    .isVisible()
    .catch(() => false);
  step('agent role field replaces description/instructions split', roleFieldVisible);
  const hiddenTabCount = await page.locator('[data-testid^="agent-tab-"]').count();
  step('agent detail tabs are hidden', hiddenTabCount === 0, { hiddenTabCount });

  step('no console errors', consoleErrors.length === 0, {
    count: consoleErrors.length,
    sample: consoleErrors.slice(0, 3),
  });
  report.pass = report.steps.every((s) => s.ok);
  writeFileSync(path.join(OUT_DIR, 'agents-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
