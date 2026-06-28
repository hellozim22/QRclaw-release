#!/usr/bin/env node
/**
 * ECC Project 验证 — 系统 Chrome，禁止 Cursor 内置浏览器。
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
  const bootstrap = await context.request.post(`${BASE}/api/dev/bootstrap`);
  const bootstrapBody = await bootstrap.json().catch(() => ({}));
  if (bootstrapBody.user_id) {
    await context.addInitScript((ownerId) => {
      window.localStorage.setItem('bibisheng.local.ownerId', ownerId);
    }, bootstrapBody.user_id);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('SupabaseAuthClient')) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${BASE}/progress`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByTestId('progress-board').waitFor({ timeout: 15_000 });
  step('progress route visible', await page.getByTestId('progress-board').isVisible());

  await page.getByTestId('progress-project-create').click();
  await page.getByLabel('Project title').fill('ECC测试项目');
  await page.getByText('创建', { exact: true }).click();
  await page.getByText('ECC测试项目').waitFor({ timeout: 10_000 });
  step('project created and selected', await page.getByText('ECC测试项目').isVisible());

  await page.getByTestId('progress-create-task').click();
  await page.waitForURL(/\/progress\/.+/, { timeout: 30_000 });
  const selectValue = await page.getByTestId('progress-task-project-select').inputValue();
  step('new task uses selected project', selectValue.length > 0, { selectValue });

  await page.goto(`${BASE}/progress`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const projectBadge = await page.locator('[data-testid^="progress-task-card-project-"]').first().innerText();
  step('card shows project name', /ECC测试项目/.test(projectBadge), { projectBadge });

  step('no console errors', consoleErrors.length === 0, { count: consoleErrors.length, sample: consoleErrors.slice(0, 3) });
  report.pass = report.steps.every((s) => s.ok);
  writeFileSync(path.join(OUT_DIR, 'projects-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
