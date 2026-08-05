import { chromium } from 'playwright';

const userDataDir = '/Users/zeze/.openclaw/workspace/output/qrclaw-demo-chrome-profile';
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1440, height: 950 },
  args: ['--no-first-run', '--start-maximized'],
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto('http://localhost:3000/chat', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const now = new Date().toISOString();
  const defs = [
    [
      '359b5fcc-936e-4469-a8e7-8a6dfef8601b',
      'Codex Assistant',
      'codex',
      '/avatars/codex.png',
      '你好，我是 Codex Assistant，已准备好协助终端与代码任务。',
    ],
    [
      '9cdd348e-7ba9-4a95-b0ef-1f5714419056',
      'Cursor Assistant',
      'cursor',
      '/avatars/cursor.png',
      '你好，我是 Cursor Assistant，已准备好协助编辑和实现。',
    ],
    [
      'eaa547c4-6966-4733-b6ba-4924e1297a4e',
      'Claude Assistant',
      'claude',
      '/avatars/claude.png',
      '你好，我是 Claude Assistant，已准备好协助分析、审查和方案设计。',
    ],
    [
      '8bbbaf88-3ccc-472c-ad70-7f7546f26a87',
      'OpenClaw Assistant',
      'openclaw',
      '/avatars/openclaw-color.png',
      '你好，我是 OpenClaw Assistant，已准备好协调本地运行时和工作流。',
    ],
  ];
  const agents = defs.map(([id, name, provider, avatar_url]) => ({
    id,
    name,
    avatar_url,
    description: `Default ${name}`,
    instructions: '',
    suggested_prompts: [],
    backend_provider: provider,
    backend_source: 'cloud',
    execution_mode: 'standard',
    status: 'active',
    runtime_id: `runtime-${provider}`,
    runtime_status: 'online',
    is_default: true,
    source: 'system_default',
    last_active_at: now,
    created_at: now,
  }));
  const messagesByAgent = {};
  for (const [id, , , , reply] of defs) {
    messagesByAgent[id] = [
      {
        id: `${id}-hello-owner`,
        client_id: `${id}-hello-owner`,
        sender_type: 'owner',
        content: '你好',
        status: 'sent',
        created_at: now,
      },
      {
        id: `${id}-hello-agent`,
        client_id: `${id}-hello-agent`,
        sender_type: 'agent',
        content: reply,
        status: 'sent',
        run_status: 'completed',
        created_at: now,
      },
    ];
  }
  const statusByAgent = Object.fromEntries(agents.map((a) => [a.id, 'online']));
  window.__OWNER_AGENT_STORE__?.setState?.({
    agents,
    loading: false,
    error: null,
    selectedAgentId: agents[3].id,
    statusByAgent,
    messagesByAgent,
  });
});
await page.waitForTimeout(1000);
await page.getByText('OpenClaw Assistant').first().click();
await page.waitForTimeout(1200);
await page.screenshot({
  path: '/Users/zeze/.openclaw/workspace/output/qrclaw-chat-all-agents-hello.png',
  fullPage: true,
});
const composer = await page.evaluate(() => {
  const ta = document.querySelector('textarea, [contenteditable="true"]');
  if (!ta) return { hasInput: false };
  const r = ta.getBoundingClientRect();
  return {
    hasInput: true,
    y: Math.round(r.y),
    h: Math.round(r.height),
    innerHeight: window.innerHeight,
    visible: r.y >= 0 && r.y < window.innerHeight && r.height > 0,
  };
});
console.log('COMPOSER=' + JSON.stringify(composer));
console.log(await page.locator('body').innerText());
console.log('Chrome left open at http://localhost:3000/chat');
await new Promise(() => {});
