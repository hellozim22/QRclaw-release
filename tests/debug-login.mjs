import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL,
  supabaseAnon = process.env.SUPABASE_ANON_KEY;
const { data } = await createClient(supabaseUrl, supabaseAnon).auth.signInWithPassword({
  email: 'zeze-test@qrclaw.test',
  password: 'QRClaw-Test-Aa1!',
});
const authKey = `sb-${new URL(supabaseUrl).host.split('.')[0]}-auth-token`;
const browser = await chromium.launchPersistentContext(
  '/Users/zeze/.openclaw/workspace/output/qrclaw-demo-chrome-profile',
  { headless: false, channel: 'chrome' }
);
const page = browser.pages()[0] ?? (await browser.newPage());
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('response', async (r) => {
  if (r.url().includes('/api/owner/agents'))
    console.log('resp', r.status(), await r.text().catch(() => ''));
});
await page.goto('http://localhost:3000/login');
await page.evaluate(
  ({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)),
  { authKey, session: data.session }
);
console.log(
  'key',
  authKey,
  await page.evaluate((k) => localStorage.getItem(k)?.slice(0, 80), authKey)
);
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(10000);
console.log('url', page.url());
console.log(await page.locator('body').innerText());
await page.screenshot({
  path: '/Users/zeze/.openclaw/workspace/output/qrclaw-debug-login.png',
  fullPage: true,
});
await browser.close();
