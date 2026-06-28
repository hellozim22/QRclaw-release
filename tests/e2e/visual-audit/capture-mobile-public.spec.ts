import { test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../test-results/visual-audit-20260327/implementation');

const AGENT_ID = process.env.VISUAL_AUDIT_AGENT_ID || 'a26c6cf5-4eff-4d9f-aae7-45cf9a061712';

test.describe('Mobile public 390×844', () => {
  test.beforeAll(async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(outDir, { recursive: true });
  });

  test('Mobile!Login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, 'Mobile!Login.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!SignUp', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, 'Mobile!SignUp.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!Verify', async ({ page }) => {
    await page.goto('/verify?email=test@example.com');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, 'Mobile!Verify.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!404', async ({ page }) => {
    await page.goto('/m/__visual_audit_404__');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!404.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!Profile', async ({ page }) => {
    await page.goto(`/agent/${AGENT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!Profile.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!Profile-Paused — needs paused agent', async ({ page }) => {
    const id = process.env.VISUAL_AUDIT_PAUSED_AGENT_ID;
    if (!id) {
      test.skip(true, 'Set VISUAL_AUDIT_PAUSED_AGENT_ID for paused profile screenshot');
    }
    await page.goto(`/agent/${id}`);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!Profile-Paused.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!ScanQR', async ({ page }) => {
    await page.goto('/m/scan');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, 'Mobile!ScanQR.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('Mobile!ScanQR-AgentGuide — Support chat (?guide=1&audit=1), design DFoBo', async ({
    page,
  }) => {
    const supportId = process.env.VISUAL_AUDIT_SUPPORT_AGENT_ID || AGENT_ID;
    await page.goto(`/m/chat/${supportId}?guide=1&audit=1`);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!ScanQR-AgentGuide.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });
});
