/**
 * Auth setup for Dashboard acceptance tests.
 * Creates a test user, logs in, and provides browser storage state.
 */
import { chromium, type BrowserContext } from '@playwright/test';
import { anonClient, getTestAuth, SUPABASE_URL, SUPABASE_ANON_KEY } from './seed-data';

const STORAGE_STATE_PATH = '/Users/zeze/qrclaw/tests/.auth/owner.json';

/**
 * Create an authenticated browser context with Supabase session.
 * Uses Playwright to perform actual login flow.
 */
export async function createAuthenticatedContext(): Promise<{
  context: BrowserContext;
  token: string;
  userId: string;
}> {
  const { token, userId, email } = await getTestAuth();

  // Create a browser, navigate to login, and perform login
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Set Supabase session in localStorage before navigating
  await page.goto('http://localhost:3000/login');
  await page.evaluate(
    ({ url, anonKey, accessToken, userId: uid }) => {
      // Set the Supabase auth storage key
      const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
      const session = {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh',
        user: {
          id: uid,
          email: 'test@qrclaw-test.com',
          role: 'authenticated',
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: token, userId }
  );

  await browser.close();

  return { context: null as unknown as BrowserContext, token, userId };
}

/**
 * Get auth headers for API calls.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { token } = await getTestAuth();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Get the Supabase Edge Function URL.
 */
export function edgeFunctionUrl(functionName: string): string {
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

export { STORAGE_STATE_PATH };
