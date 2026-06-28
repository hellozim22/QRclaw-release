#!/usr/bin/env node
/**
 * 产品汇报截图 — 对话 / 看板 / 智能体
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE = process.env.QRCLAW_WEB_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('docs/assets/screenshots');
mkdirSync(OUT_DIR, { recursive: true });

async function bootstrap(page) {
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1500);
  const boot = await page.evaluate(async () => {
    const r = await fetch('/api/dev/bootstrap', { method: 'POST' });
    return { ok: r.ok, status: r.status };
  });
  if (!boot.ok) throw new Error(`bootstrap failed: ${boot.status}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 24; i++) {
    const store = await page.evaluate(() => {
      const s = window.__OWNER_AGENT_STORE__?.getState?.();
      return {
        agents: s?.agents?.length ?? 0,
        online: s?.localHostOnlineCount ?? 0,
      };
    });
    if (store.agents >= 5 && store.online > 0) return;
    if (store.agents >= 4 && store.online > 0 && i > 8) return;
    await page.waitForTimeout(2000);
  }
  throw new Error('agents not online after bootstrap');
}

async function selectOpenClaw(page) {
  await page.getByTestId('agent-list-rail').getByText('OpenClaw', { exact: true }).first().click();
  await page.waitForTimeout(800);
}

async function createNewSession(page) {
  const newBtn = page.getByTestId('chat-header-new-session-button');
  if (await newBtn.count()) {
    await newBtn.first().click();
    await page.waitForTimeout(600);
    // The new-session button also opens the history drawer; close it so its
    // overlay stops intercepting clicks on the composer.
    const close = page.getByTestId('agent-session-drawer-close');
    if (await close.count()) {
      await close.first().click().catch(() => {});
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page
      .getByTestId('agent-session-drawer-overlay')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function sendMessages(page, messages) {
  const ta = page.getByTestId('chat-composer-input');
  const sendBtn = page.getByTestId('chat-composer-send');
  const streaming = page.locator('[data-testid="chat-composer-send"][aria-label="停止生成"]');
  const idle = page.locator('[data-testid="chat-composer-send"][aria-label="发送消息"]');
  await ta.waitFor({ state: 'visible', timeout: 15_000 });
  for (const text of messages) {
    await idle.waitFor({ timeout: 150_000 }).catch(() => {});
    await ta.click();
    await ta.fill(text);
    await page.waitForTimeout(300);
    await sendBtn.click();
    // Reply finished once the stop button morphs back into the send button.
    await streaming.waitFor({ timeout: 12_000 }).catch(() => {});
    await idle.waitFor({ timeout: 150_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
}

async function seedProgressTasks(page) {
  await page.evaluate(() => {
    const ownerId = window.localStorage.getItem('bibisheng.local.ownerId') ?? 'local-dev';
    const key = `bibisheng.progress.tasks.v2.${ownerId}`;
    const now = Date.now();
    let seq = 1;
    const mk = (title, status, offsetMs, priority = 'medium') => {
      seq += 1;
      return {
      id: `demo-${status}-${seq}-${now}`,
      identifier: `TASK-${String(seq).padStart(3, '0')}`,
      title,
      description:
        status === 'in_progress'
          ? '支持列间拖拽、自动同步任务状态，并与对话侧联动。'
          : status === 'blocked'
            ? '等待产品排期与接口确认。'
            : `任务说明：${title}。包含目标与验收标准。`,
      status,
      priority,
      position: seq,
      projectId: 'default',
      agentId: null,
      agentName: null,
      sourceMessage: null,
      activity: [],
      comments: [],
      createdAt: new Date(now - offsetMs).toISOString(),
      updatedAt: new Date(now - offsetMs / 8).toISOString(),
      };
    };
    const tasks = [
      mk('梳理 OpenClaw 接入说明', 'backlog', 86400000),
      mk('补充 Pi 本地运行时探测', 'backlog', 82000000, 'low'),
      mk('优化对话搜索体验', 'todo', 7200000),
      mk('实现看板拖拽与列计数', 'in_progress', 5400000, 'high'),
      mk('对话执行过程可视化验收', 'in_review', 3600000),
      mk('本地五智能体一键上线', 'done', 10800000),
      mk('访客扫码发布链路', 'blocked', 4000000, 'urgent'),
      mk('统一任务详情 Markdown 编辑', 'done', 9000000),
      mk('模型选择与默认模型同步', 'in_progress', 3000000),
      mk('ECC 本地验收脚本补齐', 'todo', 2400000),
    ];
    localStorage.setItem(key, JSON.stringify(tasks));
    window.dispatchEvent(new Event('bibisheng-progress-tasks-changed'));
  });
  await page.waitForTimeout(800);
}

async function scrollProgressBoardEnd(page) {
  const board = page.getByTestId('progress-board');
  await board.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-first-run'],
  });
  const context = await browser.newContext({ viewport: { width: 1680, height: 960 } });
  const page = await context.newPage();

  console.log('→ bootstrap…');
  await bootstrap(page);

  if (!process.env.SKIP_CHAT) {
    console.log('→ OpenClaw 对话…');
    await selectOpenClaw(page);
    // Single clean exchange: one user message, one agent reply.
    await sendMessages(page, [
      '请用一句话介绍 QRClaw 多智能体管理平台。',
    ]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-chat-openclaw.png') });
    console.log('✓ 01-chat-openclaw.png');
  }

  console.log('→ 看板…');
  await seedProgressTasks(page);
  await page.getByRole('navigation', { name: 'Dashboard primary navigation' })
    .getByRole('link', { name: /progress/i }).click();
  await page.waitForURL(/\/progress/, { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await scrollProgressBoardEnd(page);
  await page.screenshot({ path: path.join(OUT_DIR, '02-progress-board.png') });
  console.log('✓ 02-progress-board.png');

  await page.getByTestId('progress-column-in_progress').getByText('实现看板拖拽与列计数').click();
  await page.waitForURL(/\/progress\/[^/]+$/, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '03-progress-task-detail.png') });
  console.log('✓ 03-progress-task-detail.png');

  console.log('→ 智能体…');
  await page.getByRole('navigation', { name: 'Dashboard primary navigation' })
    .getByRole('link', { name: /^agents$/i }).click();
  await page.waitForURL(/\/agents/, { timeout: 10_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, '04-agents.png') });
  console.log('✓ 04-agents.png');

  await browser.close();
  console.log(`Done → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
