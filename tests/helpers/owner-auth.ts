import type { Page } from '@playwright/test';

export interface OwnerCreds {
  email: string;
  password: string;
}

/**
 * Sign in to the web app as the owner and wait until the app has navigated
 * to a logged-in page (/messages or /dashboard).
 *
 * Uses the real login form at /login (see web/src/app/(auth)/login/page.tsx),
 * which calls Supabase `signInWithPassword` via useAuth().signIn.
 */
export async function loginAsOwner(page: Page, creds: OwnerCreds): Promise<void> {
  await page.goto('/login');
  // If already authenticated the login page may auto-redirect to /messages.
  // Give it a short window to settle before trying to fill the form.
  await page.waitForTimeout(500);
  if (/\/(messages|dashboard)(\?|$|\/)/.test(page.url())) {
    return;
  }
  await page.getByPlaceholder('Email address').fill(creds.email);
  await page.getByPlaceholder('Password').fill(creds.password);
  // Button text is "Sign In" (or "Signing in..." while loading); be tolerant.
  await page.getByRole('button', { name: /^sign\s*in/i }).click();
  await page.waitForURL(/\/(messages|dashboard)(\?|$|\/)/, { timeout: 15_000 });
}

/**
 * Log the owner out by clearing Supabase storage. We avoid relying on a
 * specific UI affordance (avatar menu varies between layouts); wiping the
 * auth token + reloading is deterministic.
 */
export async function logoutOwner(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  });
  await page.context().clearCookies();
  await page.goto('/login');
}

/**
 * Extract the current Supabase session `access_token` (JWT) from the page.
 *
 * The Supabase JS client persists sessions to localStorage under the key
 * `sb-<project-ref>-auth-token` as a JSON blob of the shape
 * `{ access_token, refresh_token, ... }` (newer SDKs) or
 * `{ currentSession: { access_token, ... } }` (legacy).
 *
 * Returns `null` if no session is found — callers should treat that as
 * "not logged in".
 */
export async function getOwnerJWT(page: Page): Promise<string | null> {
  // Try localStorage first (supabase-js direct), then cookies (@supabase/ssr).
  // @supabase/ssr stores chunked base64-<idx> cookies named `sb-<ref>-auth-token[.N]`.
  const fromLS = await page.evaluate(() => {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (typeof parsed.access_token === 'string' && parsed.access_token) {
            return parsed.access_token as string;
          }
          const cs = parsed.currentSession as Record<string, unknown> | undefined;
          if (cs && typeof cs.access_token === 'string') {
            return cs.access_token as string;
          }
        } catch {
          /* not JSON */
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  if (fromLS) return fromLS;

  // @supabase/ssr cookie path. Chunked values are stored as
  // base64-<idx> with name `sb-<ref>-auth-token` (+ `.1`, `.2`, ...).
  const cookies = await page.context().cookies();
  const authCookies = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => {
      const ai = a.name.match(/\.(\d+)$/);
      const bi = b.name.match(/\.(\d+)$/);
      return (ai ? parseInt(ai[1], 10) : 0) - (bi ? parseInt(bi[1], 10) : 0);
    });
  if (authCookies.length === 0) return null;

  let raw = authCookies.map((c) => decodeURIComponent(c.value)).join('');
  // @supabase/ssr prefixes values with `base64-`.
  if (raw.startsWith('base64-')) {
    try {
      raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = parsed.access_token;
    if (typeof token === 'string' && token) return token;
  } catch {
    /* fall through */
  }
  return null;
}
