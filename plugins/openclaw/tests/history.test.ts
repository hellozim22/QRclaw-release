import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { replayHistory, type HistoryDeps } from '../src/history.js';
import type { ResolvedQRClawAccount } from '../src/accounts.js';
import type { DecryptedMessagesResponse } from '../../../shared/contracts/http/decrypted-messages/types.js';

function createAccount(overrides?: Partial<ResolvedQRClawAccount>): ResolvedQRClawAccount {
  return {
    label: 'default',
    agentToken: 'qak_test_token',
    gatewayWsUrl: 'wss://gw.example.com/ws',
    supabaseUrl: 'https://xxx.supabase.co',
    supabaseAnonKey: 'anon-key-123',
    ...overrides,
  };
}

function createDeps(overrides?: Partial<HistoryDeps>): HistoryDeps {
  return {
    dispatchInbound: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

function makeResponse(
  messages: Array<{
    id: string;
    message_id: string;
    content: string;
    sender_type: 'visitor' | 'agent';
    persisted_at: string;
  }>,
  hasMore = false,
  cursor: string | null = null
): DecryptedMessagesResponse {
  return {
    data: messages.map((m) => ({
      id: m.id,
      message_id: m.message_id,
      content: m.content,
      sender_type: m.sender_type,
      persisted_at: m.persisted_at,
    })),
    meta: { cursor, has_more: hasMore },
  };
}

describe('replayHistory', () => {
  let deps: HistoryDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches 3 messages for a single conversation', async () => {
    const messages = [
      {
        id: 'db-1',
        message_id: 'mid-1',
        content: 'Hello',
        sender_type: 'visitor' as const,
        persisted_at: '2026-04-20T01:00:00Z',
      },
      {
        id: 'db-2',
        message_id: 'mid-2',
        content: 'World',
        sender_type: 'visitor' as const,
        persisted_at: '2026-04-20T01:01:00Z',
      },
      {
        id: 'db-3',
        message_id: 'mid-3',
        content: '!',
        sender_type: 'visitor' as const,
        persisted_at: '2026-04-20T01:02:00Z',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeResponse(messages),
      })
    );

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
    });

    expect(result.replayed).toBe(3);
    expect(result.seen.size).toBe(3);
    expect(result.seen.has('mid-1')).toBe(true);
    expect(result.seen.has('mid-2')).toBe(true);
    expect(result.seen.has('mid-3')).toBe(true);
    expect(deps.dispatchInbound).toHaveBeenCalledTimes(3);
    expect(result.errors).toHaveLength(0);
  });

  it('paginates across 2 pages then stops', async () => {
    const page1 = makeResponse(
      [
        {
          id: 'db-1',
          message_id: 'mid-1',
          content: 'Page 1',
          sender_type: 'visitor',
          persisted_at: '2026-04-20T01:00:00Z',
        },
      ],
      true,
      'db-1'
    );
    const page2 = makeResponse(
      [
        {
          id: 'db-2',
          message_id: 'mid-2',
          content: 'Page 2',
          sender_type: 'visitor',
          persisted_at: '2026-04-20T01:01:00Z',
        },
      ],
      false,
      null
    );

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => (callCount === 1 ? page1 : page2),
        };
      })
    );

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
    });

    expect(result.replayed).toBe(2);
    expect(deps.dispatchInbound).toHaveBeenCalledTimes(2);
  });

  it('deduplicates messages using prepopulated seen set', async () => {
    const messages = [
      {
        id: 'db-1',
        message_id: 'mid-1',
        content: 'Already seen',
        sender_type: 'visitor' as const,
        persisted_at: '2026-04-20T01:00:00Z',
      },
      {
        id: 'db-2',
        message_id: 'mid-2',
        content: 'New msg',
        sender_type: 'visitor' as const,
        persisted_at: '2026-04-20T01:01:00Z',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeResponse(messages),
      })
    );

    const preSeen = new Set(['mid-1']);
    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
      seen: preSeen,
    });

    expect(result.replayed).toBe(1);
    expect(deps.dispatchInbound).toHaveBeenCalledTimes(1);
    const dispatchedCall = vi.mocked(deps.dispatchInbound).mock.calls[0][0];
    expect(dispatchedCall.text).toBe('New msg');
  });

  it('bails immediately on 401 with an error entry (no retries)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
    );

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].conversation_id).toBe('conv-1');
    expect(result.errors[0].reason).toContain('401');
    expect(result.replayed).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 then bails (4 total attempts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })
    );

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('500');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('bails on network error (fetch throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unreachable')));

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1'],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('Network unreachable');
    expect(result.replayed).toBe(0);
  });

  it('handles multiple conversations in parallel', async () => {
    const msg1 = makeResponse([
      {
        id: 'db-1',
        message_id: 'mid-1',
        content: 'Conv 1',
        sender_type: 'visitor',
        persisted_at: '2026-04-20T01:00:00Z',
      },
    ]);
    const msg2 = makeResponse([
      {
        id: 'db-2',
        message_id: 'mid-2',
        content: 'Conv 2',
        sender_type: 'visitor',
        persisted_at: '2026-04-20T01:00:00Z',
      },
    ]);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => (body.conversation_id === 'conv-1' ? msg1 : msg2),
        };
      })
    );

    const result = await replayHistory(deps, {
      account: createAccount(),
      conversationIds: ['conv-1', 'conv-2'],
    });

    expect(result.replayed).toBe(2);
    expect(result.seen.size).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('includes apikey header when supabaseAnonKey is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeResponse([]),
      })
    );

    await replayHistory(deps, {
      account: createAccount({ supabaseAnonKey: 'my-anon-key' }),
      conversationIds: ['conv-1'],
    });

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = (callArgs[1] as { headers: Record<string, string> }).headers;
    expect(headers['apikey']).toBe('my-anon-key');
  });

  it('omits apikey header when supabaseAnonKey is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeResponse([]),
      })
    );

    await replayHistory(deps, {
      account: createAccount({ supabaseAnonKey: undefined }),
      conversationIds: ['conv-1'],
    });

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = (callArgs[1] as { headers: Record<string, string> }).headers;
    expect(headers['apikey']).toBeUndefined();
  });
});
