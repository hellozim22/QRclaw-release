import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockSingle = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => ({ single: mockSingle })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ eq: mockEq })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ select: mockSelect })));

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

import {
  __resetOwnerAgentChatStoreForTests,
  ensureOwnerWsSubscription,
  httpChatClient,
  useOwnerAgentChatStore,
  type ChatClient,
} from '@/stores/owner-agent-chat-store';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';

const agentA: OwnerAgentSummary = {
  id: 'agent-a',
  name: 'Agent A',
  avatar_url: null,
  description: null,
  backend_provider: 'claude',
  backend_source: 'local',
  execution_mode: 'standard',
  status: 'active',
  runtime_id: null,
  runtime_status: null,
  is_default: false,
  source: 'user_created',
  last_active_at: null,
  created_at: '2026-04-27T00:00:00Z',
};

function makeClient(overrides: Partial<ChatClient> = {}): ChatClient {
  return {
    listAgents: vi.fn(async () => [agentA]),
    createAgent: vi.fn(async () => agentA),
    createHostToken: vi.fn(async () => ({
      token_id: 'token-1',
      token: 'qrclaw_host_test',
      scope: {
        owner_id: 'owner-1',
        allowed_provider_set: ['claude'],
        can_register_local: true,
        can_receive_private_runs: true,
      },
      expires_at: null,
      created_at: '2026-04-27T00:00:00Z',
    })),
    listMessages: vi.fn(async () => []),
    sendMessage: vi.fn(async (_aid, _c, cid) => ({
      message_id: `srv-${cid}`,
      conversation_id: 'conv-1',
      run_id: `run-${cid}`,
      status: 'running' as const,
    })),
    streamMessage: vi.fn(async function* () {
      yield { type: 'delta' as const, content: 'Hello' };
      yield { type: 'delta' as const, content: ' from SSE' };
      yield { type: 'done' as const, finishReason: 'stop' };
    }),
    waitForRunReply: vi.fn(async () => null),
    resetContext: vi.fn(async () => undefined),
    stopStream: vi.fn(),
    ...overrides,
  };
}

class MockOwnerWebSocket {
  static readonly OPEN = 1;
  static instances: MockOwnerWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockOwnerWebSocket.instances.push(this);
  }

  dispatchJson(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

describe('owner-agent-chat-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockOwnerWebSocket.instances = [];
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'http://gateway.local';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-1' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { id: 'owner-1' },
      error: null,
    });
    __resetOwnerAgentChatStoreForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    __resetOwnerAgentChatStoreForTests();
  });

  it('initial state is empty', () => {
    const s = useOwnerAgentChatStore.getState();
    expect(s.agents).toEqual([]);
    expect(s.selectedAgentId).toBeNull();
    expect(s.loading).toBe(false);
  });

  it('loadAgents populates list and auto-selects first', async () => {
    useOwnerAgentChatStore.getState()._setClient(makeClient());
    await useOwnerAgentChatStore.getState().loadAgents();
    const s = useOwnerAgentChatStore.getState();
    expect(s.agents).toHaveLength(1);
    expect(s.selectedAgentId).toBe('agent-a');
    expect(s.loading).toBe(false);
  });

  it('loadAgents initializes statuses from default agent runtime status', async () => {
    const defaults: OwnerAgentSummary[] = [
      {
        ...agentA,
        id: 'agent-openclaw',
        name: 'OpenClaw Assistant',
        backend_provider: 'openclaw',
        runtime_status: 'online',
        is_default: true,
        source: 'system_default',
      },
      {
        ...agentA,
        id: 'agent-claude',
        name: 'Claude Assistant',
        runtime_status: 'offline',
        is_default: true,
        source: 'system_default',
      },
      {
        ...agentA,
        id: 'agent-cursor',
        name: 'Cursor Assistant',
        backend_provider: 'cursor',
        runtime_status: 'updating',
        is_default: true,
        source: 'system_default',
      },
      {
        ...agentA,
        id: 'agent-codex',
        name: 'Codex Assistant',
        backend_provider: 'codex',
        runtime_status: null,
        is_default: true,
        source: 'system_default',
      },
    ];
    useOwnerAgentChatStore.getState()._setClient(makeClient({
      listAgents: vi.fn(async () => defaults),
    }));

    await useOwnerAgentChatStore.getState().loadAgents();

    const s = useOwnerAgentChatStore.getState();
    expect(s.agents.map((agent) => agent.name)).toEqual([
      'OpenClaw Assistant',
      'Claude Assistant',
      'Cursor Assistant',
      'Codex Assistant',
    ]);
    expect(s.statusByAgent).toMatchObject({
      'agent-openclaw': 'online',
      'agent-claude': 'offline',
      'agent-cursor': 'pending',
      'agent-codex': 'offline',
    });
  });

  it('sendMessage streams assistant deltas into a single markdown-ready bubble', async () => {
    const client = makeClient();
    useOwnerAgentChatStore.getState()._setClient(client);
    await useOwnerAgentChatStore.getState().sendMessage('agent-a', 'hello');
    const msgs = useOwnerAgentChatStore.getState().messagesByAgent['agent-a'] ?? [];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].status).toBe('sent');
    expect(msgs[0].content).toBe('hello');
    expect(msgs[1]).toMatchObject({
      sender_type: 'agent',
      content: 'Hello from SSE',
      status: 'sent',
      run_status: 'completed',
    });
    expect(client.streamMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('selectAgent loads persisted owner-agent history', async () => {
    const client = makeClient({
      listMessages: vi.fn(async () => [
        {
          id: 'msg-owner',
          sender_type: 'owner',
          content: 'say hello in one line',
          status: 'sent',
          run_id: 'run-1',
          run_status: 'completed',
          created_at: '2026-04-27T00:00:00Z',
        },
        {
          id: 'msg-agent',
          sender_type: 'agent',
          content: 'Reply received.',
          status: 'sent',
          run_id: 'run-1',
          run_status: 'completed',
          created_at: '2026-04-27T00:00:01Z',
        },
      ]),
    });
    useOwnerAgentChatStore.getState()._setClient(client);

    useOwnerAgentChatStore.getState().selectAgent('agent-a');
    await vi.waitFor(() => {
      expect(useOwnerAgentChatStore.getState().messagesByAgent['agent-a']).toHaveLength(2);
    });

    expect(client.listMessages).toHaveBeenCalledWith('agent-a');
  });

  it('marks the assistant stream failed when SSE returns an error event', async () => {
    const client = makeClient({
      streamMessage: vi.fn(async function* () {
        yield { type: 'delta' as const, content: 'partial' };
        yield { type: 'error' as const, message: 'agent offline' };
      }),
    });
    useOwnerAgentChatStore.getState()._setClient(client);

    await useOwnerAgentChatStore.getState().sendMessage('agent-a', 'hello');

    const s = useOwnerAgentChatStore.getState();
    const msgs = s.messagesByAgent['agent-a'] ?? [];
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({
      sender_type: 'agent',
      content: 'partial',
      status: 'failed',
      run_status: 'failed',
    });
    expect(s.statusByAgent['agent-a']).toBe('failed');
    expect(s.error).toBe('agent offline');
  });

  it('sendMessage marks failed on client error', async () => {
    const client = makeClient({
      streamMessage: vi.fn(async function* () {
        throw new Error('boom');
      }),
    });
    useOwnerAgentChatStore.getState()._setClient(client);
    await useOwnerAgentChatStore.getState().sendMessage('agent-a', 'hi');
    const s = useOwnerAgentChatStore.getState();
    expect(s.messagesByAgent['agent-a'][0].status).toBe('failed');
    expect(s.statusByAgent['agent-a']).toBe('failed');
    expect(s.error).toContain('boom');
  });

  it('resetContext preserves messages and restores online status', async () => {
    const client = makeClient();
    useOwnerAgentChatStore.getState()._setClient(client);
    await useOwnerAgentChatStore.getState().sendMessage('agent-a', 'hi');
    const beforeReset = useOwnerAgentChatStore.getState().messagesByAgent['agent-a'];
    await useOwnerAgentChatStore.getState().resetContext('agent-a');
    const s = useOwnerAgentChatStore.getState();
    expect(s.messagesByAgent['agent-a']).toEqual(beforeReset);
    expect(s.statusByAgent['agent-a']).toBe('online');
    expect(client.resetContext).toHaveBeenCalledWith('agent-a');
  });

  it('stopStream aborts the active stream and leaves the partial assistant response sent', async () => {
    let signalRef: AbortSignal | null = null;
    let releaseStream: () => void = () => undefined;
    const client = makeClient({
      streamMessage: vi.fn(async function* (_agentId, _content, _clientId, signal) {
        signalRef = signal;
        yield { type: 'delta' as const, content: 'partial' };
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }),
    });
    useOwnerAgentChatStore.getState()._setClient(client);

    const sendPromise = useOwnerAgentChatStore.getState().sendMessage('agent-a', 'hello');
    await vi.waitFor(() => {
      expect(signalRef).not.toBeNull();
    });
    await vi.waitFor(() => {
      const msgs = useOwnerAgentChatStore.getState().messagesByAgent['agent-a'] ?? [];
      expect(msgs[1]?.content).toBe('partial');
    });
    useOwnerAgentChatStore.getState().stopStream('agent-a');
    releaseStream();
    await sendPromise;

    expect(signalRef?.aborted).toBe(true);
    const msgs = useOwnerAgentChatStore.getState().messagesByAgent['agent-a'] ?? [];
    expect(msgs[1]).toMatchObject({
      content: 'partial',
      status: 'sent',
    });
  });

  it('empty message is a no-op', async () => {
    useOwnerAgentChatStore.getState()._setClient(makeClient());
    await useOwnerAgentChatStore.getState().sendMessage('agent-a', '   ');
    expect(useOwnerAgentChatStore.getState().messagesByAgent['agent-a']).toBeUndefined();
  });

  it('creates an owner agent and host token through Gateway using the current owner', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: agentA }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token_id: 'token-1',
            token: 'qrclaw_host_secret',
            scope: {
              owner_id: 'owner-1',
              allowed_provider_set: ['claude'],
              can_register_local: true,
              can_receive_private_runs: true,
            },
            expires_at: null,
            created_at: '2026-04-27T00:00:00Z',
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    useOwnerAgentChatStore.getState()._setClient(httpChatClient);

    const created = await useOwnerAgentChatStore.getState().createAgent({
      name: 'Agent A',
      description: null,
      backend_provider: 'claude',
      backend_source: 'local',
      execution_mode: 'standard',
      execution_mode_ack: false,
    });
    const token = await useOwnerAgentChatStore.getState().createHostToken({
      label: 'Agent A local host',
      provider: 'claude',
    });

    expect(created).toEqual(agentA);
    expect(token.token).toBe('qrclaw_host_secret');
    expect(useOwnerAgentChatStore.getState().agents).toEqual([agentA]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [createAgentUrl, createAgentInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createAgentUrl).toBe('http://gateway.local/api/owner/agents');
    expect(createAgentInit.method).toBe('POST');
    expect(createAgentInit.headers).toMatchObject({
      Authorization: 'Bearer jwt-1',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(createAgentInit.body as string)).toMatchObject({
      name: 'Agent A',
      backend_provider: 'claude',
      backend_source: 'local',
      execution_mode: 'standard',
    });

    const [hostTokenUrl, hostTokenInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(hostTokenUrl).toBe('http://gateway.local/api/owner/host-tokens');
    expect(JSON.parse(hostTokenInit.body as string)).toEqual({
      label: 'Agent A local host',
      scope: {
        owner_id: 'owner-1',
        allowed_provider_set: ['claude'],
        can_register_local: true,
        can_receive_private_runs: true,
      },
    });
  });

  it('subscribes to owner WS and appends assistant message on completed frame', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ticket: 'ticket-1',
            gateway_url: 'ws://gateway.local/ws',
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('WebSocket', MockOwnerWebSocket);

    await ensureOwnerWsSubscription();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.local/api/owner/ws-ticket',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-1',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(MockOwnerWebSocket.instances).toHaveLength(1);
    expect(MockOwnerWebSocket.instances[0].url).toBe('ws://gateway.local/ws?ticket=ticket-1');

    MockOwnerWebSocket.instances[0].dispatchJson({
      type: 'owner_agent_run_completed',
      timestamp: '2026-04-27T00:00:02Z',
      payload: {
        agent_id: 'agent-a',
        run_id: 'run-1',
        final_message: 'hello from websocket',
      },
    });

    const msgs = useOwnerAgentChatStore.getState().messagesByAgent['agent-a'] ?? [];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: 'run-1-evt',
      sender_type: 'agent',
      content: 'hello from websocket',
      status: 'sent',
      run_id: 'run-1',
      run_status: 'completed',
      created_at: '2026-04-27T00:00:02Z',
    });
  });
});
