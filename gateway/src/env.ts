import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

// Force gateway/.env to win over inherited shell values. Cursor Cloud shells can
// retain stale exported secrets across restarts, which breaks local debugging.
//
// Test guard (Wave 2): when running under vitest, the root suite sets its own
// process.env values via beforeEach/loadEnv to exercise edge cases such as
// "SUPABASE_ANON_KEY unset → service_unavailable". Overriding from gateway/.env
// here would silently replace those values with production-like secrets and
// flip those tests red. `VITEST` is the vitest-injected flag; `NODE_ENV=test`
// is a belt-and-braces fallback for other runners.
const isTestRun = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
dotenv.config({ path: envPath, override: !isTestRun });

const trimEnv = (value: string | undefined): string => value?.trim() ?? '';

export const env = {
  PORT: trimEnv(process.env.PORT) || '3001',
  HOST: trimEnv(process.env.HOST) || '0.0.0.0',
  REDIS_URL: trimEnv(process.env.REDIS_URL) || 'redis://localhost:6379',
  CORS_ORIGIN: trimEnv(process.env.CORS_ORIGIN),
  SUPABASE_URL: trimEnv(process.env.SUPABASE_URL).replace(/\/+$/, ''),
  SUPABASE_ANON_KEY: trimEnv(process.env.SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  WS_TICKET_SECRET: trimEnv(process.env.WS_TICKET_SECRET),
  // M3-T6: QRCLAW_KEK_V1 is the canonical KEK env var. ENCRYPTION_KEK is kept
  // as a deprecated fallback so existing deploys do not immediately break;
  // gateway/src/crypto/key-manager.ts emits a one-time warning when it falls
  // back. Remove the ENCRYPTION_KEK read entirely after a full release cycle.
  QRCLAW_KEK_V1: trimEnv(process.env.QRCLAW_KEK_V1 || process.env.ENCRYPTION_KEK),
  QRCLAW_HOST_TOKEN_PEPPER: trimEnv(process.env.QRCLAW_HOST_TOKEN_PEPPER),
  SUPABASE_JWT_SECRET: trimEnv(process.env.SUPABASE_JWT_SECRET),
  GATEWAY_BASE_URL: trimEnv(process.env.GATEWAY_BASE_URL),
  DESKTOP_LOCAL_MODE: trimEnv(process.env.DESKTOP_LOCAL_MODE),
  DESKTOP_CLOUD_GATEWAY_URL: trimEnv(process.env.DESKTOP_CLOUD_GATEWAY_URL),
  DESKTOP_RUNTIME_TOKEN: trimEnv(process.env.DESKTOP_RUNTIME_TOKEN),
  DESKTOP_LOCAL_TICKET_KEY: trimEnv(process.env.DESKTOP_LOCAL_TICKET_KEY),
  REDIS_DISABLED_FOR_DESKTOP: trimEnv(process.env.REDIS_DISABLED_FOR_DESKTOP),
};

export type EnvKey = keyof typeof env;

export const getTrimmedEnv = (key: EnvKey): string => env[key];

export const getRequiredEnv = (key: EnvKey): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};
