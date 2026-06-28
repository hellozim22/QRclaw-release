import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
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
// inject one agent + stub sendMessage so we can verify the input wiring
await page.evaluate(() => {
  const now = new Date().toISOString();
  const id = '8bbbaf88-3ccc-472c-ad70-7f7546f26a87';
  const agents = [{ id, name: 'OpenClaw Assistant', avatar_url: '/avatars/openclaw-color.png', description: 'd', instructions: '', suggested_prompts: [], backend_provider: 'openclaw', backend_source: 'cloud', execution_mode: 'standard', status: 'active', runtime_id: 'rt', runtime_status: 'online', is_default: true, source: 'system_default', last_active_at: now, created_at: now }];
  const store = window.__OWNER_AGENT_STORE__;
  store.setState({
    agents, loading: false, error: null, selectedAgentId: id,
    statusByAgent: { [id]: 'online' }, messagesByAgent: { [id]: [] },
    sendMessage: (agentId, content) => {
      const s = store.getState();
      const ts = new Date().toISOString();
      store.setState({ messagesByAgent: { ...s.messagesByAgent, [agentId]: [
        ...(s.messagesByAgent[agentId] ?? []),
        { id: 'u-'+Date.now(), client_id: 'u-'+Date.now(), sender_type: 'owner', content, status: 'sent', created_at: ts },
        { id: 'a-'+Date.now(), client_id: 'a-'+Date.now(), sender_type: 'agent', content: '收到：'+content, status: 'sent', run_status: 'completed', created_at: ts },
      ] } });
    },
  });
});
await page.waitForTimeout(1000);
const ta = page.locator('textarea, [contenteditable="true"]').first();
await ta.click();
await ta.fill('你好');
await ta.press('Enter');
await page.waitForTimeout(1000);
const body = await page.locator('body').innerText();
console.log('SEND_RESULT_CONTAINS_REPLY=' + body.includes('收到：你好'));
console.log(body);
await browser.close();
