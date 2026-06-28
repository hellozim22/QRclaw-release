import { test, expect } from '@playwright/test';

test.describe('Module B: Auth', () => {
  test('B-01: 注册页面布局', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/signup');
    // Desktop: left brand side + right form side
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByText('Give your Agent')).toBeVisible();
    await expect(page.getByText('Back to home')).toBeVisible();
  });

  test('B-01b: 注册页面移动端布局', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/signup');
    // Mobile: only form side, brand side hidden
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
  });

  test('B-04: 登录页面可访问', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in to sync your conversations')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('B-06: 密码强度校验', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('input[type="email"]').first().fill('test@example.com');
    // Fill weak password
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('123');
    await passwordInputs.nth(1).fill('123');
    await page.getByRole('button', { name: /sign up/i }).click();
    // Should show error about password length
    await expect(page.getByText(/password must be at least/i)).toBeVisible({ timeout: 5000 });
  });

  test('B-07: 密码不匹配错误提示', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('input[type="email"]').first().fill('test@example.com');
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill('password123');
    await passwordInputs.nth(1).fill('differentpass');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 });
  });

  test('B-08: V1 不支持 OAuth', async ({ page }) => {
    await page.goto('/login');
    // No Google or GitHub OAuth buttons
    await expect(page.locator('button:has-text("Google")')).toHaveCount(0);
    await expect(page.locator('button:has-text("GitHub")')).toHaveCount(0);
  });

  test('B-04b: 登录→注册链接跳转', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Sign Up').click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('B-01c: 注册→登录链接跳转', async ({ page }) => {
    await page.goto('/signup');
    await page.getByText('Sign In').click();
    await expect(page).toHaveURL(/\/login/);
  });
});
