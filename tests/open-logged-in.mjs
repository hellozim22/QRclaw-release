import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false, args: ['--no-first-run'] });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:3000/login');
await page.getByPlaceholder('Email address').fill(process.env.E2E_OWNER_EMAIL || 'e2e-owner@example.invalid');
await page.getByPlaceholder('Password').fill(process.env.E2E_OWNER_PASSWORD || 'CHANGE_ME_E2E_PASSWORD');
await page.getByRole('button', { name: /^sign\s*in/i }).click();
await page.waitForURL(/\/(messages|dashboard)(\?|$|\/)/, { timeout: 20_000 });
console.log('✓ logged in. Browser left open — Ctrl-C in terminal to close.');
// Do NOT close; keep process alive so user can interact.
await new Promise(() => {});
