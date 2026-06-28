/**
 * Supabase admin client for Gateway persistence.
 * Uses service_role key to bypass RLS for message storage.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTrimmedEnv } from '../env.js';

const SUPABASE_URL = getTrimmedEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = getTrimmedEnv('SUPABASE_SERVICE_ROLE_KEY');

const configured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

/**
 * In the desktop-local slim gateway the service-role key is intentionally absent
 * (C2 — secrets never ship in QRClaw.app). We must not throw at import time, or the
 * slim gateway can't boot. Callers guard privileged DB access with `isSupabaseConfigured()`;
 * if something reaches the client anyway, this proxy fails loudly instead of silently.
 */
const unconfiguredClient = new Proxy(
  {},
  {
    get() {
      throw new Error('Supabase admin client is not configured (desktop-local slim mode)');
    },
  },
) as unknown as SupabaseClient;

export const supabase: SupabaseClient = configured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : unconfiguredClient;

export const isSupabaseConfigured = (): boolean => configured;
