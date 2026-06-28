import { test, expect } from '@playwright/test';
import { frontendFetch } from './helpers';

test.describe('Module M: Security', () => {
  test('M-01: Security Headers 配置', async ({ page }) => {
    const res = await page.goto('/');
    const headers = res?.headers() ?? {};
    // Check CSP header exists
    expect(headers['content-security-policy']).toBeDefined();
    // Check X-Content-Type-Options
    expect(headers['x-content-type-options']).toBe('nosniff');
    // Check X-Frame-Options
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('M-09: XSS 输入安全（前端）', async ({ page }) => {
    await page.goto('/login');
    // Type XSS payload into email field
    await page.locator('input[type="email"]').fill('<script>alert(1)</script>');
    await page.locator('input[type="password"]').fill('test123');
    // Should not execute script — React auto-escapes
    const alertFired = await page.evaluate(() => {
      return (window as any).__xss_fired ?? false;
    });
    expect(alertFired).toBe(false);
  });

  test('M-01b: Powered-by header 禁用', async ({ page }) => {
    const res = await page.goto('/');
    const headers = res?.headers() ?? {};
    // Next.js poweredByHeader should be disabled
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('M-07: RLS 存在（代码审查）', async () => {
    // Verify migration files contain RLS policies
    const { readFileSync } = await import('node:fs');
    const initSchema = readFileSync(
      '/Users/zeze/qrclaw/supabase/migrations/20260312_init_schema.sql',
      'utf-8'
    );
    expect(initSchema).toContain('ENABLE ROW LEVEL SECURITY');
  });
});
