/**
 * API helpers for calling Supabase Edge Functions and REST API.
 * All endpoints are on the remote Supabase instance.
 */
import { request } from '@playwright/test';
import { edgeFunctionUrl, getAuthHeaders } from './auth-setup';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } from './seed-data';

// ─── Edge Function Calls ───────────────────────────────────────

/**
 * Call a Supabase Edge Function.
 */
export async function callEdgeFunction(
  functionName: string,
  method: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{
  status: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}> {
  const ctx = await request.newContext();
  const url = edgeFunctionUrl(functionName);
  const defaultHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...headers,
  };

  const opts: Record<string, unknown> = { headers: defaultHeaders };
  if (body) opts.data = body;

  const res = await ctx[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](url, opts);
  const responseBody = await res.json().catch(() => null);

  await ctx.dispose();
  return { status: res.status(), body: responseBody, headers: res.headers() };
}

/**
 * Register a new agent via the claim-agent Edge Function (POST).
 */
export async function registerAgent(
  authToken: string,
  name?: string,
  description?: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction(
    'claim-agent',
    'POST',
    {
      name: name || `test-agent-${Date.now()}`,
      description: description || 'Acceptance test agent',
    },
    {
      Authorization: `Bearer ${authToken}`,
    }
  );
}

/**
 * Create a QR code via the create-qrcode Edge Function.
 */
export async function createQRCode(
  authToken: string,
  agentId: string,
  name?: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction(
    'create-qrcode',
    'POST',
    {
      agent_id: agentId,
      name: name || `test-qr-${Date.now()}`,
    },
    {
      Authorization: `Bearer ${authToken}`,
    }
  );
}

/**
 * Manage a QR code (pause/activate/revoke) via manage-qrcode Edge Function.
 */
export async function manageQRCode(
  authToken: string,
  qrCodeId: string,
  action: 'active' | 'paused' | 'revoked'
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction(
    'manage-qrcode',
    'PATCH',
    {
      qr_code_id: qrCodeId,
      status: action,
    },
    {
      Authorization: `Bearer ${authToken}`,
    }
  );
}

/**
 * Get a visitor WS ticket via visitor-ws-ticket Edge Function.
 */
export async function getVisitorTicket(
  qrCodeId: string,
  sessionToken?: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  return callEdgeFunction(
    'visitor-ws-ticket',
    'POST',
    {
      qr_code_id: qrCodeId,
    },
    headers
  );
}

/**
 * Get an agent WS ticket via agent-ws-ticket Edge Function.
 */
export async function getAgentTicket(
  apiKey: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction('agent-ws-ticket', 'POST', undefined, {
    Authorization: `Bearer ${apiKey}`,
  });
}

/**
 * Get usage stats via usage-stats Edge Function.
 */
export async function getUsageStats(
  authToken: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction('usage-stats', 'GET', undefined, {
    Authorization: `Bearer ${authToken}`,
  });
}

/**
 * Get decrypted messages via the unified `decrypted-messages` Edge Function
 * (M3). This helper targets the `owner` actor — agent-/visitor-facing tests
 * should pass their own `actor` and auth headers via `callEdgeFunction`.
 */
export async function getDecryptedMessages(
  authToken: string,
  conversationId: string
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return callEdgeFunction(
    'decrypted-messages',
    'POST',
    {
      actor: 'owner',
      conversation_id: conversationId,
    },
    {
      Authorization: `Bearer ${authToken}`,
    }
  );
}

// ─── Supabase REST API (Direct DB) ────────────────────────────

/**
 * Query Supabase REST API directly with service_role key.
 */
export async function supabaseRest(
  table: string,
  query: string = '',
  method: string = 'GET',
  body?: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown>[] | null }> {
  const ctx = await request.newContext();
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const opts: Record<string, unknown> = { headers };
  if (body) opts.data = body;

  const res = await ctx[method.toLowerCase() as 'get' | 'post'](url, opts);
  const data = await res.json().catch(() => null);

  await ctx.dispose();
  return { status: res.status(), data: Array.isArray(data) ? data : data ? [data] : null };
}
