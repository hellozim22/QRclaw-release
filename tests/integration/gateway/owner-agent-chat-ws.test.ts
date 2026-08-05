import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockOwnerAgentHost,
  createOwnerAgentRunRequestFixture,
  validateGatewayToHostRoundTrip,
  validateHostToGatewayRoundTrip,
} from './_helpers/mock-host';
import type {
  HostProviderCapability,
  HostRegisterFrame,
  OwnerAgentRunEventFrame,
  OwnerAgentRunRequestFrame,
  ServerFrame,
} from '../../../shared/contracts/ws/types';

vi.hoisted(() => {
  process.env.QRCLAW_HOST_TOKEN_PEPPER = 'test-host-token-pepper';
  process.env.QRCLAW_KEK_V1 = 'a'.repeat(64);
  process.env.WS_TICKET_SECRET = 'test-ws-ticket-secret';
});

const HOST_TOKEN = 'qrclaw_host_test_token';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const HOST_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const RUN_ID_2 = '55555555-5555-4555-8555-555555555556';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';
const AGENT_ID = '77777777-7777-4777-8777-777777777777';
const OWNER_MESSAGE_ID = '88888888-8888-4888-8888-888888888888';

const mockState = vi.hoisted(() => ({
  tokens: [] as Array<Record<string, unknown>>,
  hosts: [] as Array<Record<string, unknown>>,
  providers: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  runEvents: [] as Array<Record<string, unknown>>,
  conversationKeys: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../gateway/src/db/supabase', () => {
  class QueryBuilder {
    private filters: Array<[string, unknown]> = [];
    private insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    private updatePayload: Record<string, unknown> | null = null;
    private upsertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    private deleteRequested = false;
    private maxRows: number | null = null;

    constructor(private readonly table: string) {}

    select(): this {
      return this;
    }

    order(): this {
      return this;
    }

    limit(count: number): this {
      this.maxRows = count;
      return this;
    }

    insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
      this.insertPayload = payload;
      return this;
    }

    update(payload: Record<string, unknown>): this {
      this.updatePayload = payload;
      return this;
    }

    upsert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
      this.upsertPayload = payload;
      return this;
    }

    delete(): this {
      this.deleteRequested = true;
      return this;
    }

    eq(field: string, value: unknown): this {
      this.filters.push([field, value]);
      return this;
    }

    async single(): Promise<{
      data: Record<string, unknown> | null;
      error: { message: string; code?: string } | null;
    }> {
      if (this.insertPayload) {
        return { data: this.insertRows(this.insertPayload)[0] ?? null, error: null };
      }
      if (this.upsertPayload) {
        return { data: this.upsertRows(this.upsertPayload)[0] ?? null, error: null };
      }
      const row = this.findRows()[0] ?? null;
      return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
    }

    async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
      if (this.updatePayload) {
        const row = this.findRows()[0] ?? null;
        if (row) {
          Object.assign(row, this.updatePayload);
        }
        return { data: row, error: null };
      }
      if (this.insertPayload) {
        return { data: this.insertRows(this.insertPayload)[0] ?? null, error: null };
      }
      if (this.upsertPayload) {
        return { data: this.upsertRows(this.upsertPayload)[0] ?? null, error: null };
      }
      return { data: this.findRows()[0] ?? null, error: null };
    }

    then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: {
            data: Record<string, unknown>[];
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      if (this.deleteRequested) {
        this.deleteRows();
      }
      if (this.updatePayload) {
        for (const row of this.findRows()) {
          Object.assign(row, this.updatePayload);
        }
      }
      if (this.insertPayload) {
        this.insertRows(this.insertPayload);
      }
      if (this.upsertPayload) {
        if (this.table === 'agent_host_providers') {
          return Promise.resolve({
            data: [],
            error: {
              message:
                'there is no unique or exclusion constraint matching the ON CONFLICT specification',
            },
          } as never).then(onfulfilled, onrejected);
        }
        this.upsertRows(this.upsertPayload);
      }
      return Promise.resolve({ data: this.findRows(), error: null }).then(onfulfilled, onrejected);
    }

    private deleteRows(): void {
      const target = this.sourceRows();
      for (let i = target.length - 1; i >= 0; i -= 1) {
        const row = target[i];
        if (this.filters.every(([field, value]) => row[field] === value)) {
          target.splice(i, 1);
        }
      }
    }

    private insertRows(
      payload: Record<string, unknown> | Record<string, unknown>[]
    ): Record<string, unknown>[] {
      const rows = Array.isArray(payload) ? payload : [payload];
      const target = this.sourceRows();
      const inserted = rows.map((row, index) => ({
        id: row.id ?? `${this.table}-${target.length + index + 1}`,
        key_id: row.key_id ?? `${this.table}-key-${target.length + index + 1}`,
        created_at: '2026-04-27T00:00:00.000Z',
        ...row,
      }));
      target.push(...inserted);
      return inserted;
    }

    private upsertRows(
      payload: Record<string, unknown> | Record<string, unknown>[]
    ): Record<string, unknown>[] {
      const rows = Array.isArray(payload) ? payload : [payload];
      return rows.map((row, index) => {
        const target = this.sourceRows();
        const match = target.find((existing) => this.matchesUpsertKey(existing, row));
        if (match) {
          Object.assign(match, row);
          return match;
        }
        const inserted = {
          id: row.id ?? `${this.table}-${target.length + index + 1}`,
          created_at: '2026-04-27T00:00:00.000Z',
          ...row,
        };
        target.push(inserted);
        return inserted;
      });
    }

    private matchesUpsertKey(
      existing: Record<string, unknown>,
      row: Record<string, unknown>
    ): boolean {
      if (this.table === 'agent_host_providers') {
        return existing.host_id === row.host_id && existing.provider === row.provider;
      }
      if (this.table === 'owner_agent_conversation_keys') {
        return existing.conversation_id === row.conversation_id && existing.status === 'active';
      }
      return existing.id === row.id;
    }

    private findRows(): Record<string, unknown>[] {
      const rows = this.sourceRows().filter((row) =>
        this.filters.every(([field, value]) => row[field] === value)
      );
      return this.maxRows === null ? rows : rows.slice(0, this.maxRows);
    }

    private sourceRows(): Array<Record<string, unknown>> {
      if (this.table === 'agent_host_tokens') return mockState.tokens;
      if (this.table === 'agent_hosts') return mockState.hosts;
      if (this.table === 'agent_host_providers') return mockState.providers;
      if (this.table === 'owner_agent_runs') return mockState.runs;
      if (this.table === 'owner_agent_run_events') return mockState.runEvents;
      if (this.table === 'owner_agent_conversation_keys') return mockState.conversationKeys;
      return [];
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
    isSupabaseConfigured: vi.fn().mockReturnValue(true),
  };
});

import { verifyTicket } from '../../../gateway/src/ws/auth';
import {
  routeHostMessage,
  __setHostRouterLimitsForTest,
} from '../../../gateway/src/ws/host-router';
import { subscribeRunFrames } from '../../../gateway/src/ws/stream-hub';
import {
  cancelRunsForConversation,
  cleanupStaleHostConnections,
  clearHostConnectionsForTest,
  getPendingDispatchCountForTest,
  hasHostConnection,
  sendRunToHost,
} from '../../../gateway/src/services/agent-host-registry';

class FakeHostSocket {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = this.OPEN;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  readonly close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = this.CLOSED;
  });

  send(frame: string): void {
    this.sent.push(frame);
  }

  sentFrames(): ServerFrame[] {
    return this.sent.map((frame) => JSON.parse(frame) as ServerFrame);
  }
}

const hashToken = (token: string): string =>
  createHmac('sha256', 'test-host-token-pepper').update(token, 'utf8').digest('hex');

const providerCapability = (): HostProviderCapability => ({
  provider: 'claude',
  version: '1.0.0',
  status: 'available',
  capabilities: {
    streaming: true,
    full_access: true,
    models: ['gpt-5.5-high'],
  },
});

const registerFrame = (
  overrides: Partial<HostRegisterFrame['payload']> = {}
): HostRegisterFrame => ({
  type: 'host_register',
  id: 'host-register-1',
  timestamp: '2026-04-27T00:00:00.000Z',
  payload: {
    host_id: HOST_ID,
    host_type: 'local',
    display_name: 'QRClaw Mock Host',
    providers: [providerCapability()],
    ...overrides,
  },
});

const requestFrame = (runId = RUN_ID): OwnerAgentRunRequestFrame =>
  createOwnerAgentRunRequestFixture({
    id: `request-${runId}`,
    payload: {
      run_id: runId,
      conversation_id: CONVERSATION_ID,
      agent_id: AGENT_ID,
      provider: 'claude',
      correlation_id: `corr-${runId}`,
      owner_message_id: OWNER_MESSAGE_ID,
      content: 'Review this repository.',
      content_type: 'text',
      instructions: 'Be concise.',
      requested_model: 'gpt-5.5-high',
      provider_session_id: null,
      provider_work_dir: null,
    },
  });

const eventFrame = (seq: number, content: string, runId = RUN_ID): OwnerAgentRunEventFrame => ({
  type: 'owner_agent_run_event',
  id: `event-${runId}-${seq}`,
  timestamp: '2026-04-27T00:00:00.000Z',
  payload: {
    run_id: runId,
    conversation_id: CONVERSATION_ID,
    agent_id: AGENT_ID,
    provider: 'claude',
    correlation_id: `corr-${runId}`,
    seq,
    event_type: 'text',
    content,
  },
});

const hostConnection = (ws: FakeHostSocket, connectionId = 'host-connection-1') => ({
  connectionId,
  role: 'host' as const,
  ownerId: OWNER_ID,
  tokenId: TOKEN_ID,
  hostId: HOST_ID,
  hostTokenScope: {
    owner_id: OWNER_ID,
    allowed_provider_set: ['claude'],
    can_register_local: true,
    can_receive_private_runs: true,
  },
  connectedAt: '2026-04-27T00:00:00.000Z',
  ws,
});

const seedHostToken = (): void => {
  mockState.tokens.push({
    id: TOKEN_ID,
    owner_id: OWNER_ID,
    host_id: HOST_ID,
    token_hash: hashToken(HOST_TOKEN),
    scope: {
      owner_id: OWNER_ID,
      allowed_provider_set: ['claude'],
      can_register_local: true,
      can_receive_private_runs: true,
    },
    expires_at: null,
    revoked_at: null,
    created_at: '2026-04-27T00:00:00.000Z',
  });
};

const seedRun = (runId = RUN_ID): void => {
  mockState.runs.push({
    id: runId,
    conversation_id: CONVERSATION_ID,
    owner_id: OWNER_ID,
    agent_id: AGENT_ID,
    host_id: HOST_ID,
    provider: 'claude',
    status: 'queued',
    requested_model: 'gpt-5.5-high',
    actual_model: null,
    provider_session_id: null,
    provider_work_dir: null,
    error_code: null,
    error_message: null,
    created_at: '2026-04-27T00:00:00.000Z',
    started_at: null,
    completed_at: null,
  });
};

beforeEach(() => {
  mockState.tokens = [];
  mockState.hosts = [];
  mockState.providers = [];
  mockState.runs = [];
  mockState.runEvents = [];
  mockState.conversationKeys = [];
  clearHostConnectionsForTest();
  __setHostRouterLimitsForTest({ maxInFlightEvents: 32 });
  seedHostToken();
});

describe('owner-agent-chat Gateway <-> Host WS contract harness', () => {
  it('roundtrips mock Host registration through the inbound WS contract', () => {
    const host = new MockOwnerAgentHost();
    const registerFrame = host.createRegisterFrame();
    const roundTrip = validateHostToGatewayRoundTrip(registerFrame);

    expect(roundTrip.reparsed).toEqual(registerFrame);
    expect(roundTrip.reparsed.type).toBe('host_register');
    expect(roundTrip.reparsed.payload.providers[0].provider).toBe('claude');
  });

  it('roundtrips run request, monotonic Host events, and completion frames', () => {
    const host = new MockOwnerAgentHost({ eventCount: 5 });
    const requestFrame = createOwnerAgentRunRequestFixture();
    const requestRoundTrip = validateGatewayToHostRoundTrip(requestFrame);

    expect(requestRoundTrip.reparsed).toEqual(requestFrame);

    const hostFrames = host.handleGatewayFrame(requestRoundTrip.reparsed);
    const eventFrames = hostFrames.filter((frame) => frame.type === 'owner_agent_run_event');
    const completedFrame = hostFrames.find((frame) => frame.type === 'owner_agent_run_completed');

    expect(hostFrames[0].type).toBe('owner_agent_run_accepted');
    expect(eventFrames.map((frame) => frame.payload.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(completedFrame?.payload.seq).toBe(6);

    for (const frame of hostFrames) {
      expect(validateHostToGatewayRoundTrip(frame).reparsed).toEqual(frame);
    }
  });
});

describe('owner-agent-chat Wave 3 Gateway behavior placeholders', () => {
  it('authenticates Host tokens and rejects invalid tokens', async () => {
    await expect(verifyTicket(HOST_TOKEN)).resolves.toMatchObject({
      role: 'host',
      ownerId: OWNER_ID,
      tokenId: TOKEN_ID,
      hostId: HOST_ID,
    });

    await expect(verifyTicket('qrclaw_host_invalid')).resolves.toBeNull();
  });

  it('registers a Host and replaces a duplicate registration', async () => {
    const firstWs = new FakeHostSocket();
    const secondWs = new FakeHostSocket();

    await routeHostMessage(firstWs as never, registerFrame(), hostConnection(firstWs));
    await routeHostMessage(
      secondWs as never,
      registerFrame(),
      hostConnection(secondWs, 'host-connection-2')
    );

    expect(hasHostConnection(HOST_ID)).toBe(true);
    expect(firstWs.close).toHaveBeenCalledTimes(1);
    expect(mockState.hosts[0]).toMatchObject({
      id: HOST_ID,
      owner_id: OWNER_ID,
      host_type: 'local',
      status: 'online',
    });
    expect(mockState.providers[0]).toMatchObject({
      host_id: HOST_ID,
      provider: 'claude',
      status: 'available',
    });
  });

  it('cleans up Hosts that miss the heartbeat timeout', async () => {
    const ws = new FakeHostSocket();

    await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
    await cleanupStaleHostConnections(Date.now() + 91_000);

    expect(hasHostConnection(HOST_ID)).toBe(false);
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(mockState.hosts[0].status).toBe('offline');
  });

  it('dispatches a run and persists accepted, event, and completed updates encrypted', async () => {
    seedRun();
    const ws = new FakeHostSocket();
    const request = requestFrame();
    const streamedKinds: string[] = [];
    const subscription = subscribeRunFrames(RUN_ID, (payload) => {
      streamedKinds.push(payload.kind);
    });

    try {
      await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
      expect(sendRunToHost(HOST_ID, request)).toBe('sent');

      await routeHostMessage(
        ws as never,
        {
          type: 'owner_agent_run_accepted',
          id: 'accepted-1',
          timestamp: '2026-04-27T00:00:00.000Z',
          payload: {
            run_id: RUN_ID,
            conversation_id: CONVERSATION_ID,
            agent_id: AGENT_ID,
            provider: 'claude',
            correlation_id: `corr-${RUN_ID}`,
            host_id: HOST_ID,
            accepted_at: '2026-04-27T00:00:00.000Z',
          },
        },
        hostConnection(ws)
      );
      await routeHostMessage(ws as never, eventFrame(1, 'super-secret-token'), hostConnection(ws));
      await routeHostMessage(
        ws as never,
        {
          type: 'owner_agent_run_completed',
          id: 'completed-1',
          timestamp: '2026-04-27T00:00:00.000Z',
          payload: {
            run_id: RUN_ID,
            conversation_id: CONVERSATION_ID,
            agent_id: AGENT_ID,
            provider: 'claude',
            correlation_id: `corr-${RUN_ID}`,
            seq: 2,
            final_message: 'final-secret-message',
            actual_model: 'gpt-5.5-high',
            provider_session_id: 'provider-session-1',
            provider_work_dir: null,
          },
        },
        hostConnection(ws)
      );
    } finally {
      subscription.unsubscribe();
    }

    expect(mockState.runs[0]).toMatchObject({
      status: 'completed',
      actual_model: 'gpt-5.5-high',
      provider_session_id: 'provider-session-1',
    });
    expect(mockState.runEvents).toHaveLength(2);
    expect(JSON.stringify(mockState.runEvents)).not.toContain('super-secret-token');
    expect(JSON.stringify(mockState.runEvents)).not.toContain('final-secret-message');
    expect(mockState.runEvents[0]).toMatchObject({
      run_id: RUN_ID,
      owner_id: OWNER_ID,
      seq: 1,
      type: 'text',
    });
    expect(streamedKinds).toEqual(['accepted', 'event', 'completed']);
    expect(ws.sentFrames().some((frame) => frame.type === 'ack')).toBe(true);
  });

  it('marks a run failed and notifies Host when a seq gap is detected', async () => {
    seedRun();
    const ws = new FakeHostSocket();

    await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
    sendRunToHost(HOST_ID, requestFrame());
    await routeHostMessage(ws as never, eventFrame(2, 'skipped seq one'), hostConnection(ws));

    expect(mockState.runs[0]).toMatchObject({
      status: 'failed',
      error_code: 'seq_gap',
    });
    expect(ws.sentFrames()).toContainEqual(
      expect.objectContaining({
        type: 'owner_agent_run_failed',
        payload: expect.objectContaining({ error_code: 'seq_gap' }),
      })
    );
  });

  it('fails fast with backpressure when inbound Host event processing is saturated', async () => {
    seedRun();
    const ws = new FakeHostSocket();
    __setHostRouterLimitsForTest({ maxInFlightEvents: 0 });

    await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
    sendRunToHost(HOST_ID, requestFrame());
    await routeHostMessage(ws as never, eventFrame(1, 'too much output'), hostConnection(ws));

    expect(mockState.runs[0]).toMatchObject({
      status: 'failed',
      error_code: 'backpressure',
    });
    expect(mockState.runEvents).toHaveLength(0);
  });

  it('clears pending dispatch and cancels active runs on session reset', async () => {
    seedRun();
    seedRun(RUN_ID_2);
    const ws = new FakeHostSocket();

    await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
    sendRunToHost(HOST_ID, requestFrame(RUN_ID));
    await routeHostMessage(
      ws as never,
      {
        type: 'owner_agent_run_accepted',
        id: 'accepted-reset',
        timestamp: '2026-04-27T00:00:00.000Z',
        payload: {
          run_id: RUN_ID,
          conversation_id: CONVERSATION_ID,
          agent_id: AGENT_ID,
          provider: 'claude',
          correlation_id: `corr-${RUN_ID}`,
          host_id: HOST_ID,
        },
      },
      hostConnection(ws)
    );

    ws.bufferedAmount = 200_000;
    expect(sendRunToHost(HOST_ID, requestFrame(RUN_ID_2))).toBe('queued');
    expect(getPendingDispatchCountForTest(HOST_ID)).toBe(1);

    ws.bufferedAmount = 0;
    cancelRunsForConversation(CONVERSATION_ID, 'context_reset');

    expect(getPendingDispatchCountForTest(HOST_ID)).toBe(0);
    expect(ws.sentFrames()).toContainEqual(
      expect.objectContaining({
        type: 'owner_agent_run_cancel',
        payload: expect.objectContaining({
          run_id: RUN_ID,
          requested_by: 'gateway',
          reason: 'context_reset',
        }),
      })
    );
  });

  it('does not write Host event plaintext to logs', async () => {
    seedRun();
    const ws = new FakeHostSocket();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await routeHostMessage(ws as never, registerFrame(), hostConnection(ws));
    sendRunToHost(HOST_ID, requestFrame());
    await routeHostMessage(
      ws as never,
      eventFrame(1, 'plaintext-that-must-not-log'),
      hostConnection(ws)
    );

    const logText = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .join('\n');

    expect(logText).not.toContain('plaintext-that-must-not-log');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
