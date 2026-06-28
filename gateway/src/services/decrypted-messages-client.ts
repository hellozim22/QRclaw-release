/**
 * M3-T4 — Thin client for the `decrypted-messages` Supabase Edge Function.
 *
 * Role:
 *   Gateway is a pass-through layer for message history reads. Instead of
 *   decrypting content in Node, it forwards the request to the Edge Function
 *   which owns KEK access and Web-Crypto decryption. The gateway never sees
 *   QRCLAW_KEK_V1, DEK bytes, or plaintext — a deliberate narrowing of the
 *   Node trust boundary (plan v1.3 §M3 rationale).
 *
 * Call pattern (from T5 gateway route):
 *   1. Validate the public-facing request body (qr_code_id + session_token).
 *   2. Resolve conversation_id via `conversations` lookup (still allowed; no
 *      decryption involved).
 *   3. callDecryptedMessages({ actor: 'visitor', conversation_id,
 *      session_token, limit, cursor }).
 *   4. Shape the response for the legacy client.
 *
 * Auth:
 *   - The Edge Function is deployed with verify_jwt = false (see
 *     supabase/config.toml); Supabase Gateway only needs the apikey header.
 *   - Visitor requests carry no Authorization header; auth happens in-function
 *     via session_token.
 *   - Owner/agent forwarders (future) pass their Bearer token unchanged so the
 *     Edge Function's authenticateOwner / authenticateAgent helpers authn end
 *     to end.
 */

import type { DecryptedMessagesRequest } from '@shared/contracts/http/decrypted-messages/types.js';
import type { DecryptedMessagesResponse } from '@shared/contracts/http/decrypted-messages/types.js';
import { env } from '../env.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const FUNCTION_PATH = '/functions/v1/decrypted-messages';

export interface CallOptions {
  /** Bearer token to forward — owner JWT or agent API key. Visitor leaves this undefined. */
  bearerToken?: string;
  /** Abort the call if the Edge Function hasn't replied in this many ms. */
  timeoutMs?: number;
  /** Override fetch (test seam). */
  fetchImpl?: typeof fetch;
}

export type CallResult =
  | { ok: true; data: DecryptedMessagesResponse }
  | { ok: false; error: CallError };

export interface CallError {
  /** Transport / config failures map to these first; Edge-Function-emitted codes mirror the contract's DecryptedErrorCode. */
  code:
    | 'service_unavailable'
    | 'network_error'
    | 'timeout'
    | 'invalid_response'
    | 'upstream_error'
    | string;
  message: string;
  httpStatus?: number;
}

/**
 * POST /functions/v1/decrypted-messages with the given request body.
 * Returns a Result rather than throwing, so the forwarder can map failures to
 * the client-facing envelope without try/catch noise.
 */
export async function callDecryptedMessages(
  request: DecryptedMessagesRequest,
  options: CallOptions = {}
): Promise<CallResult> {
  const url = env.SUPABASE_URL;
  // M3-C1 SEC-M-1: never fall back to SUPABASE_SERVICE_ROLE_KEY here. The
  // apikey header is logged on the Supabase platform and forwarded along
  // Cloudflare → Deno hops; putting the service-role key in that header would
  // give anyone on the request path full admin access to the project.
  // If SUPABASE_ANON_KEY is missing we refuse to call out rather than leaking
  // the admin key.
  const apikey = env.SUPABASE_ANON_KEY;

  if (!url || !apikey) {
    return {
      ok: false,
      error: {
        code: 'service_unavailable',
        message: 'Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)',
      },
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey,
    // `verify_jwt = false` still accepts an Authorization header — passing the
    // apikey fallback keeps the Supabase gateway happy when no caller Bearer
    // token is forwarded.
    Authorization: `Bearer ${options.bearerToken ?? apikey}`,
  };

  let response: Response;
  try {
    response = await fetchImpl(`${url}${FUNCTION_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: { code: 'timeout', message: 'decrypted-messages request timed out' },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: 'network_error', message: `decrypted-messages transport error: ${message}` },
    };
  }

  clearTimeout(timer);

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: {
          code: 'invalid_response',
          message: 'decrypted-messages returned non-JSON body',
          httpStatus: response.status,
        },
      };
    }
  }

  if (!response.ok) {
    const errCode = extractStringField(parsed, ['error', 'code']) ?? 'upstream_error';
    const errMsg =
      extractStringField(parsed, ['error', 'message']) ??
      `decrypted-messages failed with status ${response.status}`;
    return {
      ok: false,
      error: { code: errCode, message: errMsg, httpStatus: response.status },
    };
  }

  if (!isDecryptedMessagesResponse(parsed)) {
    return {
      ok: false,
      error: {
        code: 'invalid_response',
        message: 'decrypted-messages returned unexpected shape',
        httpStatus: response.status,
      },
    };
  }

  return { ok: true, data: parsed };
}

function extractStringField(value: unknown, path: string[]): string | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function isDecryptedMessagesResponse(value: unknown): value is DecryptedMessagesResponse {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.data)) return false;
  const meta = v.meta;
  if (meta === null || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  if (m.cursor !== null && typeof m.cursor !== 'string') return false;
  if (typeof m.has_more !== 'boolean') return false;
  return true;
}
