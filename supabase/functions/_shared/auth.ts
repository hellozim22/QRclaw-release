/**
 * Shared authentication utilities for Edge Functions.
 * Extracts and validates Supabase JWT for Owner-authenticated endpoints.
 * M3 adds authenticateAgent() for API-key-based agent auth.
 */
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { getServiceClient } from './supabase.ts';

interface AuthResult {
  user: User;
  client: SupabaseClient;
}

export interface AgentAuthResult {
  agentId: string;
  ownerId: string;
}

/**
 * Authenticate a request using the Supabase JWT from the Authorization header.
 * Returns the authenticated user and a user-scoped Supabase client (with RLS).
 *
 * Throws a descriptive error string if authentication fails.
 */
export async function authenticateOwner(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw 'missing_auth';
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw 'invalid_auth';
  }

  const token = parts[1];
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw 'server_config';
  }

  // Create a user-scoped client that respects RLS
  const client = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) {
    throw 'unauthorized';
  }

  return { user, client };
}

/**
 * Authenticate a request using an Agent API key from the Authorization header.
 * The plaintext key is SHA-256 hashed and looked up against agents.api_key_hash.
 *
 * Flow:
 *   1. Bearer <api_key>
 *   2. SHA-256(key) → api_key_hash
 *   3. SELECT ... FROM agents WHERE api_key_hash = $1 AND status = 'active'
 *
 * Returns { agentId, ownerId } on success. Throws descriptive error strings on
 * failure: 'missing_auth', 'invalid_auth', 'unauthorized', 'server_config'.
 */
export async function authenticateAgent(req: Request): Promise<AgentAuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw 'missing_auth';
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw 'invalid_auth';
  }

  const apiKey = parts[1];
  if (!apiKey || apiKey.length < 10) {
    throw 'invalid_auth';
  }

  const keyHash = await sha256Hex(apiKey);

  const supabase = getServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, status')
    .eq('api_key_hash', keyHash)
    .single();

  if (error || !agent) {
    throw 'unauthorized';
  }
  if (agent.status !== 'active') {
    throw 'unauthorized';
  }

  return { agentId: agent.id, ownerId: agent.owner_id };
}

/**
 * SHA-256 hash an API key and return lowercase hex.
 * Matches supabase/functions/agent-ws-ticket/index.ts:22-29 and
 * gateway-side hashing — any change must be mirrored.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i += 1) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}
