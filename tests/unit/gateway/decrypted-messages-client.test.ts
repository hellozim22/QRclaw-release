/**
 * Unit tests for gateway/src/services/decrypted-messages-client.ts (M3-T4).
 *
 * Covers the full Result surface:
 *   1. Happy path (visitor): builds the correct URL/headers/body and returns
 *      the parsed DecryptedMessagesResponse.
 *   2. Owner/agent bearer pass-through.
 *   3. Non-2xx with error envelope is lowered into { ok: false }.
 *   4. Non-JSON / malformed response is flagged invalid_response.
 *   5. Response shape guard rejects missing data/meta fields.
 *   6. Transport error and AbortError surface as network_error / timeout.
 *   7. Missing SUPABASE_URL or apikey short-circuits to service_unavailable.
 *
 * We inject `fetchImpl` rather than monkey-patching global fetch so the
 * gateway's real `env` resolution path stays exercised.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { callDecryptedMessages } from '../../../gateway/src/services/decrypted-messages-client.js';
import type {
  DecryptedMessagesRequest,
  DecryptedMessagesResponse,
} from '../../../shared/contracts/http/decrypted-messages/types.js';

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const loadEnv = async (overrides: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  const mod = await import('../../../gateway/src/services/decrypted-messages-client.js');
  return mod.callDecryptedMessages;
};

const buildResponse = (status: number, bodyObj: unknown): Response => {
  const body = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

describe('callDecryptedMessages', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://zyxqadubhwrnsoujiyir.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-for-tests';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
  });

  afterEach(() => {
    process.env.SUPABASE_URL = ORIGINAL_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = ORIGINAL_ENV.SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
  });

  it('posts a visitor request with apikey + anon Authorization and returns the parsed body', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const payload: DecryptedMessagesResponse = {
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          message_id: 'client-msg-1',
          content: 'hello',
          sender_type: 'visitor',
          persisted_at: '2026-04-20T00:00:00.000Z',
          reply_to_message_id: null,
          thread_id: null,
        },
      ],
      meta: { cursor: null, has_more: false },
    };
    const fetchImpl = vi.fn().mockResolvedValue(buildResponse(200, payload));

    const req: DecryptedMessagesRequest = {
      actor: 'visitor',
      conversation_id: '22222222-2222-2222-2222-222222222222',
      session_token: 'sess-abc',
      limit: 50,
    };

    const result = await call(req, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/functions/v1/decrypted-messages');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init?.headers as Record<string, string>).apikey).toBe('anon-xyz');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer anon-xyz');
    expect(init?.body).toBe(JSON.stringify(req));
    expect(result).toEqual({ ok: true, data: payload });
  });

  it('forwards bearerToken for owner/agent calls without shadowing apikey', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse(200, {
        data: [],
        meta: { cursor: null, has_more: false },
      })
    );

    const result = await call(
      {
        actor: 'owner',
        conversation_id: '33333333-3333-3333-3333-333333333333',
        limit: 25,
      },
      { fetchImpl, bearerToken: 'owner-jwt' }
    );

    expect(result.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-xyz');
    expect(headers.Authorization).toBe('Bearer owner-jwt');
  });

  it('maps a non-2xx error envelope into an upstream error Result', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      buildResponse(403, {
        error: { code: 'forbidden', message: 'Access denied' },
      })
    );

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '44444444-4444-4444-4444-444444444444',
        session_token: 'bad',
      },
      { fetchImpl }
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'forbidden', message: 'Access denied', httpStatus: 403 },
    });
  });

  it('falls back to a synthetic upstream_error when the error body lacks the envelope', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi.fn().mockResolvedValue(buildResponse(500, { weird: true }));

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '55555555-5555-5555-5555-555555555555',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('upstream_error');
    expect(result.error.httpStatus).toBe(500);
  });

  it('flags non-JSON bodies as invalid_response', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('<html>crash</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '66666666-6666-6666-6666-666666666666',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_response');
  });

  it('rejects 200 responses that do not match the DecryptedMessagesResponse shape', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(buildResponse(200, { data: 'not-an-array', meta: {} }));

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '77777777-7777-7777-7777-777777777777',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_response');
  });

  it('surfaces transport errors as network_error', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '88888888-8888-8888-8888-888888888888',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('network_error');
    expect(result.error.message).toContain('ECONNREFUSED');
  });

  it('surfaces AbortError as timeout', async () => {
    const call = await loadEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-xyz',
    });
    const abortErr = new DOMException('Aborted', 'AbortError');
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: '99999999-9999-9999-9999-999999999999',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('timeout');
  });

  it('short-circuits to service_unavailable when Supabase env is unset', async () => {
    const call = await loadEnv({
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });
    const fetchImpl = vi.fn();

    const result = await call(
      {
        actor: 'visitor',
        conversation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        session_token: 'tok',
      },
      { fetchImpl }
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('service_unavailable');
  });
});
