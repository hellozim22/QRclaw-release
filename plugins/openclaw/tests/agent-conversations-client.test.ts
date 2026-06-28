import { describe, it, expect, vi, afterEach } from 'vitest';
import { listConversations, AgentConversationsError } from '../src/agent-conversations-client.js';
import type { ResolvedQRClawAccount } from '../src/accounts.js';
import type { AgentConversationsResponse } from '../../../shared/contracts/http/agent/conversations/types.js';

function createAccount(overrides?: Partial<ResolvedQRClawAccount>): ResolvedQRClawAccount {
  return {
    label: 'default',
    agentToken: 'qak_test',
    gatewayWsUrl: 'wss://gw.example.com/ws',
    supabaseUrl: 'https://xxx.supabase.co',
    ...overrides,
  };
}

function makeResponse(
  ids: string[],
  meta: AgentConversationsResponse['meta'] = { has_more: false, cursor: null, scope: 'self' }
): AgentConversationsResponse {
  return {
    data: ids.map((conversation_id) => ({
      conversation_id,
      qrcode_id: `qr-${conversation_id}`,
      qrcode_slug: `slug-${conversation_id}`.padEnd(12, '0'),
      qrcode_label: null,
      owner_id: 'owner-1',
      owned_by_me: true,
      message_count: 0,
      last_active_at: '2026-04-20T00:00:00Z',
      created_at: '2026-04-19T00:00:00Z',
    })),
    meta,
  };
}

describe('listConversations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs /api/agent/conversations with Bearer token and returns all items in one page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeResponse(['c1', 'c2']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await listConversations(
      { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      { account: createAccount() }
    );

    expect(items.map((i) => i.conversation_id)).toEqual(['c1', 'c2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /^https:\/\/gw\.example\.com\/api\/agent\/conversations\?limit=50$/
    );
    expect((init as RequestInit).method).toBe('GET');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer qak_test');
  });

  it('follows cursor across pages until has_more=false', async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      call++;
      if (call === 1) {
        expect(url).toContain('limit=50');
        expect(url).not.toContain('cursor=');
        return {
          ok: true,
          status: 200,
          json: async () => makeResponse(['c1'], { has_more: true, cursor: 'CUR1', scope: 'self' }),
        };
      }
      if (call === 2) {
        expect(url).toContain('cursor=CUR1');
        return {
          ok: true,
          status: 200,
          json: async () => makeResponse(['c2'], { has_more: true, cursor: 'CUR2', scope: 'self' }),
        };
      }
      expect(url).toContain('cursor=CUR2');
      return {
        ok: true,
        status: 200,
        json: async () => makeResponse(['c3'], { has_more: false, cursor: null, scope: 'self' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await listConversations({}, { account: createAccount() });
    expect(items.map((i) => i.conversation_id)).toEqual(['c1', 'c2', 'c3']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at maxPages and logs a warning', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        makeResponse(['x'], { has_more: true, cursor: 'keep-going', scope: 'self' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.fn();

    const items = await listConversations(
      { logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } },
      { account: createAccount(), maxPages: 2 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    const joined = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(joined).toMatch(/capped at 2 pages/);
  });

  it('derives http(s) base from ws(s) gatewayWsUrl and strips trailing /ws', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await listConversations(
      {},
      {
        account: createAccount({ gatewayWsUrl: 'ws://127.0.0.1:3001/ws' }),
      }
    );

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith('http://127.0.0.1:3001/api/agent/conversations')).toBe(true);
  });

  it('throws AgentConversationsError on 4xx with server-provided code/message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'unauthorized', message: 'Invalid agent token' } }),
      })
    );

    await expect(listConversations({}, { account: createAccount() })).rejects.toMatchObject({
      name: 'AgentConversationsError',
      status: 401,
      code: 'unauthorized',
    });
  });

  it('throws AgentConversationsError on 5xx with fallback http_NNN code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      })
    );

    const err = await listConversations({}, { account: createAccount() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentConversationsError);
    expect((err as AgentConversationsError).status).toBe(502);
    expect((err as AgentConversationsError).code).toBe('http_502');
  });

  it('wraps fetch throw as AgentConversationsError with code=network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const err = await listConversations({}, { account: createAccount() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentConversationsError);
    expect((err as AgentConversationsError).code).toBe('network_error');
    expect((err as AgentConversationsError).status).toBe(0);
    expect((err as AgentConversationsError).message).toContain('ECONNREFUSED');
  });
});
