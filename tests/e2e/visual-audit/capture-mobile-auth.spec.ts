import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../test-results/visual-audit-20260327/implementation');

const AGENT_ID = process.env.VISUAL_AUDIT_AGENT_ID || 'a26c6cf5-4eff-4d9f-aae7-45cf9a061712';

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

test.describe('Mobile auth 390×844', () => {
  test.beforeAll(async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(outDir, { recursive: true });
  });

  test('Mobile!Messages', async ({ page }) => {
    await page.goto('/m/messages');
    await expect(page.locator('body')).toBeVisible();
    await shot(page, 'Mobile!Messages');
  });

  test('Mobile!Messages-NewUser — same as Messages if empty state unavailable', async ({
    page,
  }) => {
    await page.goto('/m/messages');
    const newUserHint = page.getByText(/get started|no conversation|empty|first/i);
    if (
      !(await newUserHint
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, 'Need distinct new-user empty state copy or dedicated test account');
    }
    await shot(page, 'Mobile!Messages-NewUser');
  });

  test('Mobile!Me', async ({ page }) => {
    await page.goto('/m/me');
    await expect(page.locator('body')).toBeVisible();
    await shot(page, 'Mobile!Me');
  });

  test('Mobile!MyQRCodes', async ({ page }) => {
    await page.goto('/m/qrcodes');
    await expect(page.locator('body')).toBeVisible();
    const empty = page.getByText(/no qr|empty|create/i);
    if (
      await empty
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, 'Need account with ≥1 QR for Mobile!MyQRCodes');
    }
    await shot(page, 'Mobile!MyQRCodes');
  });

  test('Mobile!QRCodeDetail', async ({ page }) => {
    await page.goto('/m/qrcodes');
    await page.waitForTimeout(2000);
    const row = page.locator('a, button, [role="button"]').filter({ hasText: /./ }).first();
    await row.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!QRCodeDetail.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!Chat', async ({ page }) => {
    await page.goto(`/m/chat/${AGENT_ID}?audit=1`);
    await expect(page.locator('body')).toBeVisible();
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('How can QRClaw help my business?') ||
          document.body.innerText.includes('Type a message') ||
          document.body.innerText.includes('Message Echo Agent'),
        { timeout: 20000 }
      )
      .catch(() => {});
    await shot(page, 'Mobile!Chat');
  });

  test('Mobile!Chat-Streaming', async ({ page }) => {
    await page.goto(`/m/chat/${AGENT_ID}?audit=1&streaming=1`);
    await expect(page.locator('body')).toBeVisible();
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('How can QRClaw help my business?') ||
          document.body.innerText.includes('Type a message') ||
          document.body.innerText.includes('Message Echo Agent'),
        { timeout: 20000 }
      )
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 'Mobile!Chat-Streaming');
  });

  test('Mobile!AgentNoReply / Mobile!Offline-Agent — same shell snapshot', async ({ page }) => {
    await page.goto(`/m/chat/${AGENT_ID}?audit=1`);
    await shot(page, 'Mobile!AgentNoReply');
    await page.screenshot({
      path: path.join(outDir, 'Mobile!Offline-Agent.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!LongPressCopy — chat shell', async ({ page }) => {
    await page.goto(`/m/chat/${AGENT_ID}?audit=1&copymenu=1`);
    await shot(page, 'Mobile!LongPressCopy');
  });

  test('Mobile!SwipeDelete — messages list', async ({ page }) => {
    await page.goto('/m/messages');
    await shot(page, 'Mobile!SwipeDelete');
  });
});
