import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../test-results/visual-audit-20260327/implementation');

test.describe('Mobile empty QR (before dashboard creates QR)', () => {
  test.beforeAll(async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(outDir, { recursive: true });
  });

  test('Mobile!MyQRCodes-Empty', async ({ page }) => {
    await page.goto('/m/qrcodes');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(outDir, 'Mobile!MyQRCodes-Empty.png'),
      fullPage: false,
      animations: 'disabled',
    });
  });
});
