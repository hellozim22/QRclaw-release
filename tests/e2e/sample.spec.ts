import { test, expect } from '@playwright/test';

test.describe('QRClaw Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QRClaw/i);
  });

  test('should be accessible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page).toHaveTitle(/QRClaw/i);
  });
});
