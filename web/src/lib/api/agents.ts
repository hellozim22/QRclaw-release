/**
 * Agents API client (thin wrapper around claim-agent / manage-agents Edge Functions).
 *
 * Usage:
 *   const { api_key, agent_id } = await createAgent('My Bot');
 *   await updateAgent(id, { description: 'updated' });
 *   const rotated = await regenerateAgentKey(id);
 *   await archiveAgent(id);
 *
 * Design notes:
 *   - All calls attach `Authorization: Bearer <jwt>` from the current Supabase
 *     session. If no session is present, the call throws ApiError('unauthenticated').
 *   - Non-2xx responses are parsed as `{ error: { code, message } }` and rethrown
 *     as ApiError, preserving the backend-issued code for UI-level mapping.
 *   - A 15s AbortController timeout guards against hung Edge Function calls.
 *   - Plaintext api_key values returned by createAgent / regenerateAgentKey are
 *     handed back to callers for one-time display. This module intentionally
 *     does not persist, log, or cache the plaintext anywhere.
 */
import { createClient } from '@/lib/supabase/browser';

const REQUEST_TIMEOUT_MS = 15_000;

const getSupabaseUrl = (): string => process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export type AgentActionCode =
  | 'unauthenticated'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'invalid_state'
  | 'invalid_transition'
  | 'method_not_allowed'
  | 'internal_error'
  | 'network_error'
  | 'timeout'
  | 'unknown';

export class ApiError extends Error {
  readonly code: AgentActionCode;
  constructor(code: AgentActionCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface CreatedAgent {
  agent_id: string;
  api_key: string;
  api_key_prefix: string;
  name: string;
  status: string;
  created_at: string;
}

export interface UpdatedAgent {
  id: string;
  name: string;
  description: string | null;
  account_label: string | null;
  status: string;
  updated_at: string;
}

export interface RegeneratedKey {
  agent_id: string;
  api_key: string;
  api_key_prefix: string;
  regenerated_at: string;
}

export interface ArchivedAgent {
  agent_id: string;
  status: 'archived';
  archived_at: string;
}

export interface UpdateAgentPatch {
  name?: string;
  description?: string | null;
  account_label?: string | null;
}

type EdgeFunctionName = 'claim-agent' | 'manage-agents';

/**
 * Resolve the current Supabase access token.
 *
 * We first call `supabase.auth.getUser()` so the access token is validated
 * against the Supabase auth server — `getSession()` on its own only reads
 * the local storage copy and will happily hand back an expired token the
 * client hasn't refreshed yet, which would cause every Edge Function call
 * to 401 one-by-one. `getUser()` surfaces a revoked/expired session here so
 * the caller can redirect to login once instead.
 *
 * Throws ApiError('unauthenticated') for any failure mode (no session,
 * validation failed, token missing).
 */
async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.');
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.');
  }
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.');
  }
  return token;
}

interface EdgeFunctionErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * POST to a Supabase Edge Function and parse the unified envelope.
 *
 * Success response: `{ data: T }` → returns `T`.
 * Error response  : `{ error: { code, message } }` → throws ApiError.
 */
async function callEdgeFunction<T>(fn: EdgeFunctionName, body: unknown): Promise<T> {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    throw new ApiError('internal_error', 'Supabase URL is not configured');
  }

  const token = await getAccessToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('timeout', 'Request timed out. Please try again.');
    }
    throw new ApiError('network_error', 'Network error. Please check your connection and retry.');
  }

  clearTimeout(timeoutId);

  let parsed: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError('internal_error', 'Unexpected server response');
    }
  }

  if (!response.ok) {
    const errBody = (parsed ?? {}) as EdgeFunctionErrorBody;
    const code = (errBody.error?.code ?? 'unknown') as AgentActionCode;
    const message = errBody.error?.message ?? 'Request failed';
    throw new ApiError(code, message);
  }

  const successBody = (parsed ?? {}) as { data?: T };
  if (successBody.data === undefined) {
    throw new ApiError('internal_error', 'Empty response body');
  }
  return successBody.data;
}

/**
 * Create a new agent. Returns the freshly minted api_key — **shown only once**.
 */
export const createAgent = async (name: string): Promise<CreatedAgent> => {
  return await callEdgeFunction<CreatedAgent>('claim-agent', { name });
};

/**
 * Patch an agent's metadata. At least one field must be provided; passing
 * `null` for description / account_label clears the column.
 */
export const updateAgent = async (
  agentId: string,
  updates: UpdateAgentPatch
): Promise<UpdatedAgent> => {
  return await callEdgeFunction<UpdatedAgent>('manage-agents', {
    action: 'update',
    agent_id: agentId,
    ...updates,
  });
};

/**
 * Rotate an agent's api_key. The previous key is revoked immediately.
 * Returns the new api_key — **shown only once**.
 */
export const regenerateAgentKey = async (agentId: string): Promise<RegeneratedKey> => {
  return await callEdgeFunction<RegeneratedKey>('manage-agents', {
    action: 'regenerate_key',
    agent_id: agentId,
  });
};

/**
 * Soft-delete an agent (status → 'archived'). The api_key_hash is revoked
 * server-side, so any existing plaintext token stops working immediately.
 * This cannot be undone from the dashboard.
 */
export const archiveAgent = async (agentId: string): Promise<ArchivedAgent> => {
  return await callEdgeFunction<ArchivedAgent>('manage-agents', {
    action: 'delete',
    agent_id: agentId,
  });
};

/**
 * Map an error (ApiError or unknown) into a user-friendly sentence for the UI.
 * Keeps all user-visible strings in one place for i18n later.
 */
export const friendlyAgentError = (err: unknown): string => {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'unauthenticated':
        return 'Your session expired. Please sign in again.';
      case 'unauthorized':
        return 'You are not authorized for this action.';
      case 'forbidden':
        return 'Complete your owner profile before managing agents.';
      case 'not_found':
        return 'This agent no longer exists.';
      case 'invalid_state':
      case 'invalid_transition':
        return err.message;
      case 'invalid_request':
        return err.message;
      case 'timeout':
        return 'The request took too long. Please retry.';
      case 'network_error':
        return 'Network error. Please check your connection and retry.';
      default:
        return 'Something went wrong, please retry.';
    }
  }
  return 'Something went wrong, please retry.';
};
