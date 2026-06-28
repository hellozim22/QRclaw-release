/**
 * Unit tests for the gateway thin-forwarder at POST /api/messages (M3-T5).
 *
 * After M3 the gateway no longer decrypts. It looks up conversation_id from
 * (qr_code_id + session_token) and forwards to the `decrypted-messages` Edge
 * Function, then reshapes the unified response into the legacy envelope.
 *
 * Coverage:
 *   1. Happy path → legacy envelope preserves { id, content, role, sent_at }
 *      with id = message_id.
 *   2. No conversation match → 200 empty list (privacy).
 *   3. Upstream forbidden / not_found → 200 empty list (privacy).
 *   4. Other upstream errors → 500 generic envelope; session_token never
 *      echoed.
 *   5. Supabase not configured → 503.
 *
 * The decrypted-messages client is mocked at the boundary so the test covers
 * only the forwarder's request reshaping + error mapping.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecryptedMessagesResponse } from '../../../shared/contracts/http/decrypted-messages/types.js';

const mockConversationMaybeSingle = vi.fn();
const mockCallDecryptedMessages = vi.fn();

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'conversations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: mockConversationMaybeSingle,
              })),
            })),
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock('../../../gateway/src/db/supabase.js', () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock('../../../gateway/src/services/decrypted-messages-client.js', () => ({
  callDecryptedMessages: mockCallDecryptedMessages,
}));

const loadRouter = async () => {
  vi.resetModules();
  const { messagesRouter } = await import('../../../gateway/src/routes/messages.js');
  const layer = messagesRouter.stack.find((entry) => entry.route?.path === '/api/messages');
  const stack = layer?.route?.stack;
  if (!stack || stack.length < 2) throw new Error('expected validate + handler middleware');
  return { middlewareFn: stack[0].handle, handlerFn: stack[1].handle };
};

const invoke = async (
  middlewareFn: (req: unknown, res: unknown, next: (err?: unknown) => void) => void | Promise<void>,
  handlerFn: (req: unknown, res: unknown) => void | Promise<void>,
  body: Record<string, unknown>
) => {
  const req = { body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await new Promise<void>((resolve, reject) => {
    const next = (err?: unknown) => (err ? reject(err) : resolve());
    const out = middlewareFn(req, res, next);
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      (out as Promise<unknown>).catch(reject);
    }
  });
  await handlerFn(req, res);
  return res;
};

describe('POST /api/messages — thin forwarder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationMaybeSingle.mockResolvedValue({ data: { id: 'conv-123' } });
  });

  it('forwards to decrypted-messages and maps the response to the legacy envelope', async () => {
    const upstream: DecryptedMessagesResponse = {
      data: [
        {
          id: 'row-1-uuid',
          message_id: 'msg-1',
          content: 'hello world',
          sender_type: 'agent',
          persisted_at: '2026-04-01T10:00:00Z',
          reply_to_message_id: null,
          thread_id: null,
        },
        {
          id: 'row-2-uuid',
          message_id: 'msg-2',
          content: 'hi back',
          sender_type: 'visitor',
          persisted_at: '2026-04-01T10:00:05Z',
        },
      ],
      meta: { cursor: null, has_more: false },
    };
    mockCallDecryptedMessages.mockResolvedValue({ ok: true, data: upstream });

    const { middlewareFn, handlerFn } = await loadRouter();
    const res = await invoke(middlewareFn, handlerFn, {
      qr_code_id: 'qr-123',
      session_token: 'sess-123',
      limit: 50,
    });

    expect(mockCallDecryptedMessages).toHaveBeenCalledWith({
      actor: 'visitor',
      conversation_id: 'conv-123',
      session_token: 'sess-123',
      limit: 50,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        messages: [
          { id: 'msg-1', content: 'hello world', role: 'agent', sent_at: '2026-04-01T10:00:00Z' },
          { id: 'msg-2', content: 'hi back', role: 'visitor', sent_at: '2026-04-01T10:00:05Z' },
        ],
      },
    });
  });

  it('returns an empty list when no conversation matches the session_token', async () => {
    mockConversationMaybeSingle.mockResolvedValue({ data: null });

    const { middlewareFn, handlerFn } = await loadRouter();
    const res = await invoke(middlewareFn, handlerFn, {
      qr_code_id: 'qr-missing',
      session_token: 'sess-missing',
    });

    expect(mockCallDecryptedMessages).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { messages: [] } });
  });

  it('returns an empty list when upstream reports forbidden', async () => {
    mockCallDecryptedMessages.mockResolvedValue({
      ok: false,
      error: { code: 'forbidden', message: 'Access denied', httpStatus: 403 },
    });

    const { middlewareFn, handlerFn } = await loadRouter();
    const res = await invoke(middlewareFn, handlerFn, {
      qr_code_id: 'qr-123',
      session_token: 'sess-wrong',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { messages: [] } });
  });

  it('returns 500 on other upstream failures without leaking the session_token', async () => {
    mockCallDecryptedMessages.mockResolvedValue({
      ok: false,
      error: { code: 'upstream_error', message: 'oops', httpStatus: 500 },
    });

    const { middlewareFn, handlerFn } = await loadRouter();
    const res = await invoke(middlewareFn, handlerFn, {
      qr_code_id: 'qr-123',
      session_token: 'sess-secret',
    });

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0]?.[0];
    expect(payload).toEqual({
      error: { code: 'internal_error', message: 'Failed to fetch messages' },
    });
    expect(JSON.stringify(payload)).not.toContain('sess-secret');
  });

  it('returns 503 when Supabase is not configured', async () => {
    vi.resetModules();
    vi.doMock('../../../gateway/src/db/supabase.js', () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: vi.fn(() => false),
    }));
    const { messagesRouter } = await import('../../../gateway/src/routes/messages.js');
    const layer = messagesRouter.stack.find((entry) => entry.route?.path === '/api/messages');
    const stack = layer?.route?.stack;
    if (!stack || stack.length < 2) throw new Error('expected validate + handler middleware');
    const middlewareFn = stack[0].handle;
    const handlerFn = stack[1].handle;

    const res = await invoke(middlewareFn, handlerFn, {
      qr_code_id: 'qr-123',
      session_token: 'sess-123',
    });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'service_unavailable', message: 'Database not configured' },
    });
    vi.doUnmock('../../../gateway/src/db/supabase.js');
  });
});
