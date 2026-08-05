#!/usr/bin/env node
/**
 * ECC 真实 Agent 验证 — 使用系统 Chrome（channel: chrome），不走 Cursor 内置浏览器。
 *
 * 串行验证 3 个本机 Agent：
 * 1. 发起真实对话
 * 2. 自动创建 Progress task
 * 3. 等待任务进入 done/blocked
 * 4. 验证看板与详情页可查看 activity/comment/markdown
 *
 * Usage:
 *   node tests/ecc-local-verify-3agents.mjs [--headed] [--agents claude,openclaw,cursor]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const BASE = process.env.QRCLAW_WEB_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('output/ecc-verify');
mkdirSync(OUT_DIR, { recursive: true });

const args = new Set(process.argv.slice(2));
const headed = args.has('--headed');
const agentArg = process.argv.find((arg) => arg.startsWith('--agents='));

const CASES = {
  claude: {
    name: 'Claude Code',
    provider: 'claude',
    prompt: `ecc-3agent-claude-${Date.now()}：请只回复数字 42，不要加任何其他字符。`,
    expect: (text) => /^42\.?\s*$/.test(text.trim()),
  },
  openclaw: {
    name: 'OpenClaw',
    provider: 'openclaw',
    prompt: `ecc-3agent-openclaw-${Date.now()}：请只用 JSON 回复 {"ok": true, "echo": "ping"}，不要额外解释。`,
    expect: (text) => {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) return false;
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return parsed.ok === true && parsed.echo === 'ping';
      } catch {
        return false;
      }
    },
  },
  cursor: {
    name: 'Cursor',
    provider: 'cursor',
    prompt: `ecc-3agent-cursor-${Date.now()}：用一句中文回答：“今天星期几” 是哪个语言的问句。`,
    expect: (text) => /中文|汉语|普通话/.test(text) && text.trim().length >= 4,
  },
  codex: {
    name: 'Codex',
    provider: 'codex',
    prompt: `ecc-3agent-codex-${Date.now()}：请只回复 OK，不要额外解释。`,
    expect: (text) => /^OK\.?\s*$/i.test(text.trim()),
  },
};

const selectedKeys = agentArg
  ? agentArg
      .replace('--agents=', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : ['claude', 'openclaw', 'cursor'];

const report = {
  ts: new Date().toISOString(),
  base: BASE,
  agents: [],
  steps: [],
  pass: false,
};

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail.msg ? `: ${detail.msg}` : ''}`);
}

function agentStep(agentReport, name, ok, detail = {}) {
  agentReport.steps.push({ name, ok, ...detail });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${agentReport.key}: ${name}${detail.msg ? `: ${detail.msg}` : ''}`);
}

async function waitForStore(page, predicate, timeoutMs = 30_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(() => {
      const s = window.__OWNER_AGENT_STORE__?.getState?.();
      if (!s) return null;
      return {
        agents:
          s.agents?.map((agent) => ({
            id: agent.id,
            name: agent.name,
            backendProvider: agent.backend_provider,
          })) ?? [],
        localHostOnlineCount: s.localHostOnlineCount,
        statusByAgent: s.statusByAgent,
        selectedAgentId: s.selectedAgentId,
        messagesByAgent: s.messagesByAgent,
      };
    });
    if (predicate(last)) return last;
    await page.waitForTimeout(1000);
  }
  return last;
}

async function readTasks(page) {
  return page.evaluate(() => {
    try {
      return Object.keys(window.localStorage)
        .filter((key) => key.startsWith('bibisheng.progress.tasks.v2.'))
        .flatMap((key) => {
          const raw = window.localStorage.getItem(key);
          return raw ? JSON.parse(raw) : [];
        });
    } catch {
      return [];
    }
  });
}

async function waitForTask(page, prompt, predicate, timeoutMs = 180_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const tasks = await readTasks(page);
    last =
      tasks.find((task) => task.sourceMessage === prompt || task.description === prompt) ?? null;
    if (last && predicate(last)) return last;
    await page.waitForTimeout(1500);
  }
  return last;
}

async function selectAgent(page, testCase) {
  const agent = await page.evaluate((provider) => {
    const s = window.__OWNER_AGENT_STORE__?.getState?.();
    return s?.agents?.find((item) => item.backend_provider === provider && item.is_default) ?? null;
  }, testCase.provider);
  if (!agent?.id) return null;
  await page
    .getByRole('button', { name: new RegExp(testCase.name, 'i') })
    .waitFor({ timeout: 10_000 });
  await page.getByTestId(`agent-list-item-${agent.id}`).click();
  return agent;
}

async function sendAndWait(page, agent, prompt, timeoutMs = 180_000) {
  await page.getByTestId('chat-composer-input').fill(prompt);
  await page.getByTestId('chat-composer-send').click();
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate((agentId) => {
      const s = window.__OWNER_AGENT_STORE__?.getState?.();
      const messages = s?.messagesByAgent?.[agentId] ?? [];
      const agentMessages = messages.filter((message) => message.sender_type === 'agent');
      const latest = agentMessages.at(-1);
      return latest
        ? {
            content: latest.content ?? '',
            status: latest.status,
            runStatus: latest.run_status,
          }
        : null;
    }, agent.id);
    if (last?.content?.trim() && last.runStatus !== 'running') return last;
    await page.waitForTimeout(1500);
  }
  return last;
}

async function main() {
  const browser = await chromium.launch({
    headless: !headed,
    channel: 'chrome',
    args: ['--no-first-run'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(6000);
  const boot = await page.evaluate(async () => {
    const r = await fetch('/api/dev/bootstrap', { method: 'POST' });
    return { ok: r.ok, status: r.status };
  });
  step('dev bootstrap API', boot.ok, boot);

  const store = await waitForStore(
    page,
    (s) => Boolean(s && s.agents.length >= 4 && (s.localHostOnlineCount ?? 0) > 0),
    45_000
  );
  step(
    'local agents online',
    Boolean(store && store.agents.length >= 4 && store.localHostOnlineCount > 0),
    {
      agentCount: store?.agents?.length ?? 0,
      localHostOnlineCount: store?.localHostOnlineCount ?? 0,
    }
  );
  // Initial Supabase auth/session recovery can briefly log fetch errors while
  // the local-dev session is being restored. Match ecc-local-verify.mjs and
  // only enforce console cleanliness after the app is stable.
  consoleErrors.length = 0;
  await page.waitForTimeout(1000);

  for (const key of selectedKeys) {
    const testCase = CASES[key];
    if (!testCase) {
      step(`unknown agent case ${key}`, false);
      continue;
    }
    const agentReport = {
      key,
      name: testCase.name,
      prompt: testCase.prompt,
      steps: [],
      taskId: null,
      reply: '',
      pass: false,
    };
    report.agents.push(agentReport);

    const agent = await selectAgent(page, testCase);
    agentStep(agentReport, 'agent selectable', Boolean(agent), agent ?? {});
    if (!agent) continue;

    const online = await page.getByTestId(`agent-list-item-${agent.id}-online`).count();
    agentStep(agentReport, 'agent online badge visible', online > 0, { online });

    const composerReady = await page.getByTestId('chat-composer-input').isEnabled();
    agentStep(agentReport, 'composer enabled', composerReady);
    if (!composerReady) continue;

    const taskStarted = waitForTask(
      page,
      testCase.prompt,
      (task) => task.status === 'in_progress',
      45_000
    );
    const reply = await sendAndWait(page, agent, testCase.prompt);
    agentReport.reply = reply?.content ?? '';
    const runTerminal = ['completed', 'failed'].includes(reply?.runStatus ?? '');
    agentStep(
      agentReport,
      'agent run surfaced terminal UI state',
      Boolean(reply?.content?.trim()) && runTerminal,
      reply ?? {}
    );
    if (reply?.runStatus === 'completed') {
      agentStep(
        agentReport,
        'reply matches expected shape',
        testCase.expect(reply?.content ?? ''),
        {
          reply: (reply?.content ?? '').slice(0, 300),
        }
      );
    } else {
      agentStep(
        agentReport,
        'failed agent shows user-safe error',
        /Agent execution failed/i.test(reply?.content ?? ''),
        {
          reply: (reply?.content ?? '').slice(0, 300),
        }
      );
    }

    const startedTask = await taskStarted;
    agentStep(agentReport, 'progress task reached in_progress', Boolean(startedTask), {
      status: startedTask?.status,
    });

    const finishedTask = await waitForTask(
      page,
      testCase.prompt,
      (task) => ['done', 'blocked'].includes(task.status),
      120_000
    );
    agentReport.taskId = finishedTask?.id ?? startedTask?.id ?? null;
    const taskTerminal = ['done', 'blocked'].includes(finishedTask?.status ?? '');
    agentStep(agentReport, 'progress task reached terminal status', taskTerminal, {
      status: finishedTask?.status,
      taskId: agentReport.taskId,
    });
    agentStep(agentReport, 'progress task completed or blocked visibly', taskTerminal, {
      status: finishedTask?.status,
    });
  }

  const progressLink = page
    .getByRole('navigation', { name: 'Dashboard primary navigation' })
    .getByRole('link', { name: /progress/i });
  await progressLink.click();
  await page.waitForURL(/\/progress/, { timeout: 30_000 });
  await page.getByTestId('progress-board').waitFor({ timeout: 10_000 });
  const expectedTaskIds = report.agents.map((agent) => agent.taskId).filter(Boolean);
  await page
    .waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-testid^="progress-task-card-"]').length >= expected,
      expectedTaskIds.length,
      { timeout: 15_000 }
    )
    .catch(() => undefined);
  const doneCards = await page.locator('[data-testid^="progress-task-card-"]').count();
  const tasksAfterNav = await readTasks(page);
  step('progress board shows agent tasks', doneCards >= expectedTaskIds.length, {
    cardCount: doneCards,
    expectedTaskIds: expectedTaskIds.length,
    localStorageTasks: tasksAfterNav.length,
  });
  const agentBadgeCount = await page.locator('[data-testid^="progress-task-card-agent-"]').count();
  const projectBadgeCount = await page
    .locator('[data-testid^="progress-task-card-project-"]')
    .count();
  step(
    'progress cards show agent and project',
    agentBadgeCount >= expectedTaskIds.length && projectBadgeCount >= expectedTaskIds.length,
    {
      agentBadgeCount,
      projectBadgeCount,
    }
  );

  const firstTaskId =
    report.agents.find((agent) => agent.taskId && agent.pass)?.taskId ??
    report.agents.find((agent) => agent.taskId)?.taskId;
  if (firstTaskId) {
    await page.getByTestId(`progress-task-card-${firstTaskId}`).click();
    await page.waitForURL(new RegExp(`/progress/${firstTaskId}$`), { timeout: 30_000 });
    await page
      .getByTestId('progress-task-detail-page')
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    const detailVisible = await page
      .getByTestId('progress-task-detail-page')
      .isVisible()
      .catch(() => false);
    const detailText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    step('agent task detail page visible', detailVisible, {
      taskId: firstTaskId,
      body: detailText.slice(0, 200),
    });
    const timelineCount = await page.locator('[data-testid^="progress-task-activity-"]').count();
    step('agent task activity visible', timelineCount > 0, { timelineCount });
    await page.getByTestId('progress-task-comment-input').fill('ECC 真实 agent 流程复核留言。');
    await page.getByTestId('progress-task-comment-submit').click();
    const commentCount = await page.locator('[data-testid^="progress-task-comment-"]').count();
    step('agent task comment works', commentCount > 0, { commentCount });
  }

  await page.screenshot({ path: path.join(OUT_DIR, '3agents-progress.png'), fullPage: true });
  step('screenshot saved', true, { path: path.join(OUT_DIR, '3agents-progress.png') });

  if (consoleErrors.length) {
    step('no console errors', false, {
      count: consoleErrors.length,
      sample: consoleErrors.slice(0, 3),
    });
  } else {
    step('no console errors', true);
  }

  for (const agent of report.agents) {
    agent.pass = agent.steps.every((item) => item.ok);
  }
  report.pass = report.steps.every((item) => item.ok) && report.agents.every((agent) => agent.pass);
  writeFileSync(path.join(OUT_DIR, '3agents-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  writeFileSync(
    path.join(OUT_DIR, '3agents-error.json'),
    JSON.stringify({ error: String(err) }, null, 2)
  );
  process.exit(1);
});
