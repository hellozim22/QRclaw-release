import { chromium } from 'playwright';
// Use a fresh isolated context (NOT the persistent profile) so we never
// disturb the user's open Chrome window.
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();

// Log in via UI in this isolated context.
await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
if (await page.getByPlaceholder('Email address').count()) {
  await page.getByPlaceholder('Email address').fill('test-owner@example.invalid');
  await page.getByPlaceholder('Password').fill(process.env.E2E_OWNER_PASSWORD || 'CHANGE_ME_TEST_PASSWORD');
  await page.getByRole('button', { name: /^sign\s*in/i }).click();
  await page.waitForTimeout(3000);
}
await page.goto('http://localhost:3000/chat', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Inject demo agents + messages
await page.evaluate(() => {
  const now = new Date().toISOString();
  const agents = [
    ['359b5fcc-936e-4469-a8e7-8a6dfef8601b', 'Codex Assistant', 'codex', '/avatars/codex.png'],
    ['9cdd348e-7ba9-4a95-b0ef-1f5714419056', 'Cursor Assistant', 'cursor', '/avatars/cursor.png'],
    ['eaa547c4-6966-4733-b6ba-4924e1297a4e', 'Claude Assistant', 'claude', '/avatars/claude.png'],
    ['8bbbaf88-3ccc-472c-ad70-7f7546f26a87', 'OpenClaw Assistant', 'openclaw', '/avatars/openclaw-color.png'],
  ].map(([id, name, provider, avatar_url]) => ({
    id, name, avatar_url, description: `Default ${name}`, instructions: '', suggested_prompts: [], backend_provider: provider, backend_source: 'cloud', execution_mode: 'standard', status: 'active', runtime_id: `runtime-${provider}`, runtime_status: 'online', is_default: true, source: 'system_default', last_active_at: now, created_at: now,
  }));
  const statusByAgent = Object.fromEntries(agents.map((a) => [a.id, 'online']));
  window.__OWNER_AGENT_STORE__?.setState?.({ agents, loading: false, error: null, selectedAgentId: agents[3].id, statusByAgent, messagesByAgent: {} });
});
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const ta = document.querySelector('textarea, [contenteditable="true"]');
  const sendBtn = document.querySelector('button[aria-label="发送消息"], [data-testid="owner-assistant-thread"] button');
  const out = { hasTextarea: !!ta, hasSendBtn: !!sendBtn };
  if (ta) {
    const r = ta.getBoundingClientRect();
    out.textareaRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    out.textareaInViewport = r.y >= 0 && r.y < window.innerHeight && r.width > 0 && r.height > 0;
    out.innerHeight = window.innerHeight;
  }
  return out;
});
console.log('COMPOSER_CHECK=' + JSON.stringify(info));
await browser.close();
