#!/usr/bin/env node
/**
 * ECC 本地验证 — 使用系统 Chrome（channel: chrome），不走 Cursor 内置浏览器。
 * 验证：bootstrap session → /chat 加载 → Agent 列表 → 可选发消息。
 *
 * Usage:
 *   node tests/ecc-local-verify.mjs [--send] [--headed-open]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const BASE = process.env.QRCLAW_WEB_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('output/ecc-verify');
mkdirSync(OUT_DIR, { recursive: true });

const args = new Set(process.argv.slice(2));
const doSend = args.has('--send');
const headedOpen = args.has('--headed-open');

const report = {
  ts: new Date().toISOString(),
  steps: [],
  pass: false,
};

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail.msg ? `: ${detail.msg}` : ''}`);
}

async function main() {
  // Phase 0: health
  for (const [label, url] of [
    ['gateway', 'http://localhost:3100/health'],
    ['web', `${BASE}/chat`],
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      step(`${label} reachable`, r.ok, { status: r.status });
    } catch (e) {
      step(`${label} reachable`, false, { msg: e.message });
    }
  }

  const browser = await chromium.launch({
    headless: !headedOpen,
    channel: 'chrome',
    args: ['--no-first-run'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // 1. Bootstrap + Chat (fresh context has no stale cookies)
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(6000);

  const urlAfter = page.url();
  step('no /login redirect', !urlAfter.includes('/login'), { url: urlAfter });

  const boot = await page.evaluate(async () => {
    const r = await fetch('/api/dev/bootstrap', { method: 'POST' });
    return { ok: r.ok, status: r.status, body: await r.text() };
  });
  step('dev bootstrap API', boot.ok, { status: boot.status, body: boot.body.slice(0, 120) });

  // 1b. Stale-session recovery — inject bogus auth cookie then reload (Cursor browser scenario)
  await context.addCookies([
    {
      name: 'sb-stale-ecc-test',
      value: '1',
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const staleRecovery = await page.evaluate(async () => {
    const s = window.__OWNER_AGENT_STORE__?.getState?.();
    return {
      localDevAuthReady: s?.localDevAuthReady ?? null,
      localHostOnlineCount: s?.localHostOnlineCount ?? null,
      agentCount: s?.agents?.length ?? 0,
      error: s?.error ?? null,
    };
  });
  step(
    'stale session recovery',
    (staleRecovery.localHostOnlineCount ?? 0) > 0 && staleRecovery.agentCount >= 4,
    staleRecovery
  );

  // Reload 期间可能有短暂 401，不计入最终 console 检查
  consoleErrors.length = 0;
  await page.waitForTimeout(2000);

  // 2. Agent list visible
  const agentNames = ['Codex', 'Cursor', 'Claude Code', 'OpenClaw'];
  let visibleAgents = 0;
  for (const name of agentNames) {
    const n = await page.getByText(name, { exact: false }).count();
    if (n > 0) visibleAgents += 1;
  }
  step('four default agents in UI', visibleAgents >= 4, { visibleAgents });
  const chatAgentRailText = await page.getByTestId('agent-list-rail').innerText();
  step('default agent names omit Assistant suffix', !/Assistant/.test(chatAgentRailText), {
    chatAgentRailText: chatAgentRailText.slice(0, 200),
  });

  // 3. Store state — poll until host online or timeout
  let store = null;
  for (let i = 0; i < 12; i += 1) {
    store = await page.evaluate(() => {
      const s = window.__OWNER_AGENT_STORE__?.getState?.();
      if (!s) return null;
      return {
        agentCount: s.agents?.length ?? 0,
        loading: s.loading,
        error: s.error,
        localHostOnlineCount: s.localHostOnlineCount,
        selectedAgentId: s.selectedAgentId,
      };
    });
    if (store && store.agentCount >= 4 && (store.localHostOnlineCount ?? 0) > 0) break;
    await page.waitForTimeout(2000);
  }
  step(
    'zustand store loaded',
    Boolean(store && store.agentCount >= 4),
    store ?? { msg: 'store not exposed' }
  );

  const onlineFromStore = store?.localHostOnlineCount ?? 0;
  step('local host online count > 0', onlineFromStore > 0, {
    localHostOnlineCount: onlineFromStore,
  });

  // 4. Composer
  const composer = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return { found: false };
    const r = ta.getBoundingClientRect();
    return {
      found: true,
      disabled: ta.disabled,
      inViewport: r.height > 0 && r.y < window.innerHeight,
    };
  });
  step('composer textarea', composer.found, composer);

  let prompt = '';
  if (doSend && composer.found && !composer.disabled) {
    prompt = `ecc-verify ${Date.now()}`;
    await page.locator('textarea').first().fill(prompt);
    await page.getByRole('button', { name: /发送/i }).click();
    await page.waitForTimeout(8000);
    const hasPrompt = (await page.getByText(prompt).count()) > 0;
    step('send message optimistic UI', hasPrompt, { prompt });
  }

  if (prompt) {
    await page.getByTestId('chat-search-input').fill(prompt);
    await page.waitForTimeout(1500);
    const searchHit = await page.locator('[data-testid^="chat-search-result-"]').count();
    step('chat history search returns result', searchHit > 0, { searchHit });
    if (searchHit > 0) {
      await page.locator('[data-testid^="chat-search-result-"]').first().click();
      await page.waitForTimeout(500);
      const stillHasPrompt = (await page.getByText(prompt).count()) > 0;
      step('chat search result jumps to agent', stillHasPrompt, { prompt });
    }
    await page.getByTestId('chat-search-input').fill('');
  }

  const progressLink = page
    .getByRole('navigation', { name: 'Dashboard primary navigation' })
    .getByRole('link', { name: /progress/i });
  await progressLink.click();
  await page.waitForURL(/\/progress/, { timeout: 10_000 });
  const progressVisible = await page.getByTestId('progress-board').isVisible();
  step('progress board route visible', progressVisible);
  const boardDetailPanelCount = await page.getByTestId('progress-task-detail').count();
  step('progress board does not show inline detail panel', boardDetailPanelCount === 0, {
    boardDetailPanelCount,
  });

  if (prompt) {
    const autoTaskCount = await page.getByText(prompt.slice(0, 24), { exact: false }).count();
    step('chat send auto-creates progress task', autoTaskCount > 0, { autoTaskCount });
  }

  await page.getByTestId('progress-create-task').click();
  await page.waitForURL(/\/progress\/[^/]+$/, { timeout: 10_000 });
  const detailVisible = await page.getByTestId('progress-task-detail-page').isVisible();
  step('manual task opens dedicated detail page', detailVisible, { url: page.url() });
  const titleVisible = await page.getByTestId('progress-task-title-input').inputValue();
  step('task detail title editable', titleVisible.includes('新任务'), { titleVisible });
  await page
    .getByTestId('progress-task-description')
    .fill('验收：支持直接输入详情，离开后自动渲染。');
  const descriptionDraft = await page.getByTestId('progress-task-description').inputValue();
  step('task detail description editor works', /直接输入详情/.test(descriptionDraft), {
    descriptionDraft,
  });
  const detailsSaveVisible = await page
    .getByRole('button', { name: '保存' })
    .isVisible()
    .catch(() => false);
  step('task detail description has save button', detailsSaveVisible);
  const assigneeSelectVisible = await page.getByTestId('progress-task-assignee-select').isVisible();
  const projectSelectVisible = await page.getByTestId('progress-task-project-select').isVisible();
  step('task detail editable assignee and project', assigneeSelectVisible && projectSelectVisible);
  await page.getByTestId('progress-task-comment-input').fill('收到，补充一条 **评论**。');
  await page.getByTestId('progress-task-comment-submit').click();
  const commentVisible = await page.getByText('收到，补充一条', { exact: false }).count();
  step('task detail comments work', commentVisible > 0, { commentVisible });

  await page.screenshot({ path: path.join(OUT_DIR, 'chat-verify.png'), fullPage: true });
  step('screenshot saved', true, { path: path.join(OUT_DIR, 'chat-verify.png') });

  if (consoleErrors.length) {
    step('no console errors', false, {
      count: consoleErrors.length,
      sample: consoleErrors.slice(0, 3),
    });
  } else {
    step('no console errors', true);
  }

  const forbiddenCopy = await page.evaluate(() => document.body.innerText);
  const hasDevLeak = /dev-up|Multica daemon|bash scripts|Agent Host/i.test(forbiddenCopy);
  step('no developer-only onboarding copy', !hasDevLeak);

  report.pass = report.steps.every((s) => s.ok);
  writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  await browser.close();

  if (headedOpen) {
    const { execFileSync } = await import('child_process');
    execFileSync('open', ['-a', 'Google Chrome', `${BASE}/chat`]);
    console.log('Opened system Chrome — leave window for manual inspection');
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
