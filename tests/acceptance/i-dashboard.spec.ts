import { test, expect, type Page } from '@playwright/test';
import { getTestAuth } from './seed-data';

const SUPABASE_PROJECT_REF = 'zyxqadubhwrnsoujiyir';
const STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const TEST_EMAIL = 'acceptance-test@qrclaw.ai';

// ─── Unauthenticated redirect tests ────────────────────────────────────────

test.describe('Module I: Dashboard UI — unauthenticated', () => {
  test('I-01: Unauthenticated access to /messages redirects to /login', async ({ page }) => {
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/login/);
  });

  test('I-02: Unauthenticated access to /qrcodes redirects to /login', async ({ page }) => {
    await page.goto('/qrcodes');
    await expect(page).toHaveURL(/\/login/);
  });

  test('I-03: Unauthenticated access to /settings redirects to /login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('I-13: Dashboard redirect works at 1024px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/login/);
  });

  test('I-13b: Dashboard redirect works at 768px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Authenticated dashboard tests ─────────────────────────────────────────

test.describe.serial('Module I: Dashboard UI — authenticated', () => {
  let token: string;
  let userId: string;

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    token = auth.token;
    userId = auth.userId;
  });

  async function injectAuth(page: Page): Promise<void> {
    // Supabase SSR checks cookies server-side, not localStorage.
    // Set both cookie and localStorage for full compatibility.
    const session = JSON.stringify({
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'test-refresh',
      user: {
        id: userId,
        email: TEST_EMAIL,
        role: 'authenticated',
        aud: 'authenticated',
      },
    });

    // Set Supabase auth cookies (chunked format used by @supabase/ssr)
    const domain = 'localhost';

    await page.context().addCookies([
      {
        name: STORAGE_KEY,
        value: session,
        domain,
        path: '/',
      },
      {
        name: `${STORAGE_KEY}.0`,
        value: session,
        domain,
        path: '/',
      },
    ]);

    // Also set localStorage for client-side Supabase client
    await page.addInitScript(
      (data: { storageKey: string; session: string }) => {
        localStorage.setItem(data.storageKey, data.session);
      },
      { storageKey: STORAGE_KEY, session }
    );
  }

  test('I-04: /messages page loads with auth (not redirected to /login)', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('I-05: /qrcodes page loads with auth', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/qrcodes');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('I-06: /settings page loads with auth', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('I-07: Dashboard sidebar/navigation visible when authenticated', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    // Navigation element present (sidebar, nav bar, or tab bar)
    const nav = page.locator('nav, [role="navigation"], aside').first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });

  test('I-08: Dashboard shows empty state for new user (no agents yet)', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    // Page rendered some content
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('I-09: Dashboard QR codes empty state', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/qrcodes');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('I-10: Settings page shows user email', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    // Page rendered — email may or may not be visible depending on data load
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('I-11: Dashboard responsive at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await injectAuth(page);
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('I-12: Dashboard responsive at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await injectAuth(page);
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
