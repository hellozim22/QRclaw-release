import { chromium } from 'playwright';
const browser = await chromium.launchPersistentContext('/Users/zeze/.openclaw/workspace/output/qrclaw-demo-chrome-profile', {headless:false, channel:'chrome'});
const page = browser.pages()[0] ?? await browser.newPage();
await page.goto('http://localhost:3000/chat', {waitUntil:'domcontentloaded'});
await page.waitForTimeout(8000);
console.log('url', page.url());
console.log(await page.locator('body').innerText().catch(e=>String(e)));
await page.screenshot({path:'/Users/zeze/.openclaw/workspace/output/qrclaw-debug.png', fullPage:true});
await browser.close();
