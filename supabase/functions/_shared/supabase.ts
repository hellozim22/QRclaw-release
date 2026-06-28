/**
 * Shared Supabase client factory for Edge Functions.
 * Uses service_role key to bypass RLS for server-side operations.
 */
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

let client: SupabaseClient | null = null;

/**
 * Get a Supabase client with service_role privileges.
 * Reuses the same instance across invocations within the same isolate.
 */
export function getServiceClient(): SupabaseClient {
  if (client) {
    return client;
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
