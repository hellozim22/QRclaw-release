import { test, expect } from '@playwright/test';

test.describe('Module A: Landing Page', () => {
  // ===== Extra tests: A-04, A-05, A-06, A-08, A-09 =====

  test('A-04: Connect Your Agent section with curl command and Copy button', async ({ page }) => {
    await page.goto('/');
    // Scroll to connect-agent section
    await page.evaluate(() => {
      document.getElementById('connect-agent')?.scrollIntoView();
    });
    // Check the curl command text is present
    const curlText = page.getByText('curl -s https://qrclaw.ai/skill.md');
    await expect(curlText).toBeVisible();
    // Check Copy button is present — the button adjacent to the curl command
    // It appears after the curl text in the code block section
    const copyBtn = page
      .locator('#connect-agent button')
      .filter({ has: page.locator('svg') })
      .first();
    await expect(copyBtn).toBeVisible();
  });

  test('A-05: 3-step guide in Connect Your Agent section', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('connect-agent')?.scrollIntoView();
    });
    // Check for step labels
    await expect(page.getByText('Read the skill guide')).toBeVisible();
    await expect(page.getByText('Register your agent')).toBeVisible();
    await expect(page.getByText('Create your first QRcode')).toBeVisible();
  });

  test('A-06: Use case cards section (See it in action)', async ({ page }) => {
    await page.goto('/');
    // Check "See it in action" heading
    await expect(page.getByText('See it in action')).toBeVisible();
    // Check the two use case cards
    await expect(page.getByText('Share your agent')).toBeVisible();
    await expect(page.getByText('Serve your customers')).toBeVisible();
  });

  test('A-08: Hero QR card (dogfooding QRCode)', async ({ page, viewport }) => {
    // Hero right panel (QR card) is hidden on mobile via CSS media query
    test.skip(!!viewport && viewport.width < 768, 'Hero QR card hidden on mobile');
    await page.goto('/');
    await expect(page.getByText('QRClaw Support').first()).toBeVisible();
    await expect(page.getByText('Scan to start chatting')).toBeVisible();
  });

  test('A-09: Language switcher (EN/Globe) visible in nav', async ({ page, viewport }) => {
    // EN label is hidden on narrow screens
    test.skip(!!viewport && viewport.width < 768, 'Language label hidden on mobile');
    await page.goto('/');
    const enLabel = page.locator('nav').getByText('EN');
    await expect(enLabel).toBeVisible();
  });

  test('A-01: 首页可访问', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('A-02: Nav Bar 导航', async ({ page }) => {
    await page.goto('/');
    // Check logo image is visible
    const logo = page.locator('img[alt*="QRClaw"], img[alt*="qrclaw"], img[alt*="Logo"]').first();
    await expect(logo).toBeVisible();
    // Check navigation links exist
    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();
  });

  test('A-03: Hero 区域', async ({ page }) => {
    await page.goto('/');
    // Check for main heading/slogan
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    expect(headingText?.length).toBeGreaterThan(0);
  });

  test('A-07: Footer', async ({ page }) => {
    await page.goto('/');
    // Check footer exists with copyright or brand text
    const footer = page.locator('footer').first();
    if ((await footer.count()) > 0) {
      await expect(footer).toBeVisible();
    } else {
      // Check for copyright text anywhere on page
      const copyright = page.getByText(/QRClaw|©|Copyright/i).first();
      await expect(copyright).toBeVisible();
    }
  });

  test('A-10: 响应式布局 - desktop 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1440 + 20); // small tolerance
  });

  test('A-10: 响应式布局 - mobile 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 20);
  });
});
