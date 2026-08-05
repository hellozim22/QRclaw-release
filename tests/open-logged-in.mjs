import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false, args: ['--no-first-run'] });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:3000/login');
await page.getByPlaceholder('Email address').fill('e2e-owner@test.qrclaw.ai');
await page.getByPlaceholder('Password').fill('E2E-HappyPath-9x!');
await page.getByRole('button', { name: /^sign\s*in/i }).click();
await page.waitForURL(/\/(messages|dashboard)(\?|$|\/)/, { timeout: 20_000 });
console.log('✓ logged in. Browser left open — Ctrl-C in terminal to close.');
// Do NOT close; keep process alive so user can interact.
await new Promise(() => {});
