import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Set TEST_USER_EMAIL and TEST_USER_PASSWORD in the environment before running visual audit (see tests/e2e/visual-audit/README.md).'
    );
  }

  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign In' }).click();

  const errorLine = page.getByText(/invalid login|invalid email|email not confirmed/i);
  const navigated = page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 120000,
  });
  const errored = errorLine
    .waitFor({ state: 'visible', timeout: 120000 })
    .then(() => 'error' as const);
  const outcome = await Promise.race([navigated.then(() => 'ok' as const), errored]);
  if (outcome === 'error') {
    const msg = (await errorLine.textContent())?.trim() || 'Login error';
    throw new Error(`Vercel login failed: ${msg}. Check email/password and Supabase user state.`);
  }
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
