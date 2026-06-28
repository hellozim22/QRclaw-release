import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.QRCLAW_HOST_TOKEN_PEPPER = 'test-host-token-pepper';
});

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_A_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_B_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';
const HOST_ID = '44444444-4444-4444-8444-444444444444';
const HOST_B_ID = '55555555-5555-4555-8555-555555555555';
const AGENT_A_ID = '66666666-6666-4666-8666-666666666666';
const AGENT_B_ID = '77777777-7777-4777-8777-777777777777';
const BINDING_ID = '88888888-8888-4888-8888-888888888888';
const CONVERSATION_ID = '99999999-9999-4999-8999-999999999999';
const SESSION_B_ID = '12121212-1212-4121-8121-121212121212';
const MESSAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaaa';
const RUN_ID = 'bbbbbbbb-cccc-4ddd-8eee-bbbbbbbbbbbb';

const mockState = vi.hoisted(() => ({
  authUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owners: [{ id: '11111111-1111-4111-8111-111111111111', user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
  tokens: [] as Array<{
    id: string;
    owner_id: string;
    host_id: string | null;
    token_hash: string;
    label: string | null;
    scope: Record<string, unknown>;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>,
  agents: [] as Array<{
    id: string;
    owner_id: string;
    name: string;
    api_key_hash: string;
    avatar_url: string | null;
    description: string | null;
    instructions: string | null;
    suggested_prompts: unknown;
    execution_mode: string;
    status: string;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
  }>,
  hosts: [] as Array<{
    id: string;
    owner_id: string;
    host_type: string;
    display_name: string | null;
    status: string;
    last_seen_at: string | null;
    created_at: string;
  }>,
  providers: [] as Array<{
    id: string;
    host_id: string;
    provider: string;
    status: string;
    capabilities: Record<string, unknown>;
    created_at: string;
  }>,
  bindings: [] as Array<{
    id: string;
    agent_id: string;
    owner_id: string;
    binding_kind: string;
    host_id: string | null;
    preferred_host_id: string | null;
    provider: string;
    execution_mode: string;
    status: string;
    created_at: string;
  }>,
  conversations: [] as Array<{
    id: string;
    owner_id: string;
    agent_id: string;
    title: string;
    provider_session_id: string | null;
    provider_work_dir: string | null;
    status: string;
    last_active_at: string | null;
    created_at: string;
    updated_at: string;
  }>,
  conversationKeys: [] as Array<{
    key_id: string;
    conversation_id: string;
    key_data_encrypted: string;
    kek_version: number;
    algorithm: string;
    status: string;
    created_at: string;
  }>,
  messages: [] as Array<{
    id: string;
    conversation_id: string;
    owner_id: string;
    agent_id: string;
    run_id: string | null;
    sender_type: string;
    content_encrypted: string;
    content_type: string;
    encryption_meta: Record<string, unknown>;
    status: string;
    created_at: string;
  }>,
  runs: [] as Array<{
    id: string;
    conversation_id: string;
    owner_id: string;
    agent_id: string;
    host_id: string | null;
    provider: string;
    status: string;
    requested_model: string | null;
    actual_model: string | null;
    provider_session_id: string | null;
    provider_work_dir: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>,
  runEvents: [] as Array<{
    id: string;
    run_id: string;
    owner_id: string;
    seq: number;
    type: string;
    content_encrypted: string | null;
    encryption_meta: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>,
  nextTokenId: '33333333-3333-4333-8333-333333333333',
  nextAgentId: '66666666-6666-4666-8666-666666666666',
  nextBindingId: '88888888-8888-4888-8888-888888888888',
  nextConversationId: '99999999-9999-4999-8999-999999999999',
  nextConversationKeyId: 'cccccccc-dddd-4eee-8fff-cccccccccccc',
  nextMessageId: 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaaa',
  nextRunId: 'bbbbbbbb-cccc-4ddd-8eee-bbbbbbbbbbbb',
  nextRunEventId: 'dddddddd-eeee-4fff-8aaa-dddddddddddd',
  insertedPayloads: [] as Record<string, unknown>[],
}));

vi.mock('../../../gateway/src/db/supabase', () => {
  class QueryBuilder {
    private filters: Array<[string, unknown]> = [];
    private nullFilters: string[] = [];
    private insertPayload: Record<string, unknown> | null = null;
    private updatePayload: Record<string, unknown> | null = null;

    constructor(private readonly table: string) {}

    select(): this {
      return this;
    }

    order(): this {
      return this;
    }

    limit(): this {
      return this;
    }

    insert(payload: Record<string, unknown>): this {
      this.insertPayload = payload;
      return this;
    }

    update(payload: Record<string, unknown>): this {
      this.updatePayload = payload;
      return this;
    }

    eq(field: string, value: unknown): this {
      this.filters.push([field, value]);
      return this;
    }

    is(field: string, value: null): this {
      if (value === null) {
        this.nullFilters.push(field);
      }
      return this;
    }

    async single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
      if (this.insertPayload) {
        return this.insertSingle();
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
      return { data: this.findRows()[0] ?? null, error: null };
    }

    then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      if (this.insertPayload) {
        const inserted = this.insertSingle().data;
        return Promise.resolve({ data: [inserted], error: null }).then(onfulfilled, onrejected);
      }
      return Promise.resolve({ data: this.findRows(), error: null }).then(onfulfilled, onrejected);
    }

    private insertSingle(): { data: Record<string, unknown>; error: null } {
      if (!this.insertPayload) {
        return { data: {}, error: null };
      }
      mockState.insertedPayloads.push(this.insertPayload);
      if (this.table === 'agents') {
        const isDefaultAgent = this.insertPayload.is_default === true;
        const row = {
          id: isDefaultAgent
            ? `default-agent-${mockState.agents.length + 1}`
            : mockState.nextAgentId,
          owner_id: this.insertPayload.owner_id as string,
          runtime_id: (this.insertPayload.runtime_id as string | null | undefined) ?? null,
          name: this.insertPayload.name as string,
          api_key_hash: this.insertPayload.api_key_hash as string,
          avatar_url: (this.insertPayload.avatar_url as string | null | undefined) ?? null,
          description: (this.insertPayload.description as string | null | undefined) ?? null,
          instructions: (this.insertPayload.instructions as string | null | undefined) ?? null,
          suggested_prompts: (this.insertPayload.suggested_prompts as unknown[] | undefined) ?? [],
          execution_mode: this.insertPayload.execution_mode as string,
          status: (this.insertPayload.status as string | undefined) ?? 'active',
          is_default: isDefaultAgent,
          source: (this.insertPayload.source as string | undefined) ?? 'user_created',
          last_seen_at: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.agents.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'agent_bindings') {
        const row = {
          id: mockState.nextBindingId,
          agent_id: this.insertPayload.agent_id as string,
          owner_id: this.insertPayload.owner_id as string,
          binding_kind: this.insertPayload.binding_kind as string,
          host_id: (this.insertPayload.host_id as string | null | undefined) ?? null,
          preferred_host_id: (this.insertPayload.preferred_host_id as string | null | undefined) ?? null,
          provider: this.insertPayload.provider as string,
          execution_mode: this.insertPayload.execution_mode as string,
          status: (this.insertPayload.status as string | undefined) ?? 'active',
          created_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.bindings.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'owner_agent_conversations' || this.table === 'owner_agent_sessions') {
        const row = {
          id: mockState.nextConversationId,
          owner_id: this.insertPayload.owner_id as string,
          agent_id: this.insertPayload.agent_id as string,
          title: (this.insertPayload.title as string | undefined) ?? 'New chat',
          provider_session_id: (this.insertPayload.provider_session_id as string | null | undefined) ?? null,
          provider_work_dir: (this.insertPayload.provider_work_dir as string | null | undefined) ?? null,
          status: (this.insertPayload.status as string | undefined) ?? 'active',
          last_active_at: (this.insertPayload.last_active_at as string | null | undefined) ?? null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.conversations.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'owner_agent_conversation_keys') {
        const row = {
          key_id: mockState.nextConversationKeyId,
          conversation_id: this.insertPayload.conversation_id as string,
          key_data_encrypted: this.insertPayload.key_data_encrypted as string,
          kek_version: (this.insertPayload.kek_version as number | undefined) ?? 1,
          algorithm: (this.insertPayload.algorithm as string | undefined) ?? 'aes-256-gcm',
          status: (this.insertPayload.status as string | undefined) ?? 'active',
          created_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.conversationKeys.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'owner_agent_runs') {
        const row = {
          id: mockState.nextRunId,
          conversation_id: this.insertPayload.conversation_id as string,
          owner_id: this.insertPayload.owner_id as string,
          agent_id: this.insertPayload.agent_id as string,
          host_id: (this.insertPayload.host_id as string | null | undefined) ?? null,
          provider: this.insertPayload.provider as string,
          status: (this.insertPayload.status as string | undefined) ?? 'queued',
          requested_model: (this.insertPayload.requested_model as string | null | undefined) ?? null,
          actual_model: (this.insertPayload.actual_model as string | null | undefined) ?? null,
          provider_session_id: (this.insertPayload.provider_session_id as string | null | undefined) ?? null,
          provider_work_dir: (this.insertPayload.provider_work_dir as string | null | undefined) ?? null,
          error_code: (this.insertPayload.error_code as string | null | undefined) ?? null,
          error_message: (this.insertPayload.error_message as string | null | undefined) ?? null,
          created_at: '2026-04-27T00:00:00.000Z',
          started_at: (this.insertPayload.started_at as string | null | undefined) ?? null,
          completed_at: (this.insertPayload.completed_at as string | null | undefined) ?? null,
        };
        mockState.runs.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'owner_agent_messages') {
        const row = {
          id: mockState.nextMessageId,
          conversation_id: this.insertPayload.conversation_id as string,
          owner_id: this.insertPayload.owner_id as string,
          agent_id: this.insertPayload.agent_id as string,
          run_id: (this.insertPayload.run_id as string | null | undefined) ?? null,
          sender_type: this.insertPayload.sender_type as string,
          content_encrypted: this.insertPayload.content_encrypted as string,
          content_type: (this.insertPayload.content_type as string | undefined) ?? 'text',
          encryption_meta: this.insertPayload.encryption_meta as Record<string, unknown>,
          status: (this.insertPayload.status as string | undefined) ?? 'sent',
          created_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.messages.push(row);
        return { data: row, error: null };
      }
      if (this.table === 'owner_agent_run_events') {
        const existing = mockState.runEvents.find(
          (event) => event.run_id === this.insertPayload?.run_id && event.seq === this.insertPayload?.seq
        );
        if (existing) {
          return { data: existing, error: null };
        }
        const row = {
          id: mockState.nextRunEventId,
          run_id: this.insertPayload.run_id as string,
          owner_id: this.insertPayload.owner_id as string,
          seq: this.insertPayload.seq as number,
          type: this.insertPayload.type as string,
          content_encrypted: (this.insertPayload.content_encrypted as string | null | undefined) ?? null,
          encryption_meta: (this.insertPayload.encryption_meta as Record<string, unknown> | null | undefined) ?? null,
          metadata: (this.insertPayload.metadata as Record<string, unknown> | undefined) ?? {},
          created_at: '2026-04-27T00:00:00.000Z',
        };
        mockState.runEvents.push(row);
        return { data: row, error: null };
      }
      if (this.table !== 'agent_host_tokens') {
        return { data: {}, error: null };
      }
      const row = {
        id: mockState.nextTokenId,
        owner_id: this.insertPayload.owner_id as string,
        host_id: (this.insertPayload.host_id as string | null | undefined) ?? null,
        token_hash: this.insertPayload.token_hash as string,
        label: (this.insertPayload.label as string | null | undefined) ?? null,
        scope: this.insertPayload.scope as Record<string, unknown>,
        expires_at: (this.insertPayload.expires_at as string | null | undefined) ?? null,
        revoked_at: null,
        created_at: '2026-04-27T00:00:00.000Z',
      };
      mockState.tokens.push(row);
      return { data: row, error: null };
    }

    private findRows(): Record<string, unknown>[] {
      const source =
        this.table === 'owners'
          ? mockState.owners
          : this.table === 'agent_host_tokens'
            ? mockState.tokens
            : this.table === 'agents'
              ? mockState.agents
              : this.table === 'agent_hosts'
                ? mockState.hosts
                : this.table === 'agent_host_providers'
                  ? mockState.providers
                  : this.table === 'agent_bindings'
                    ? mockState.bindings
                : this.table === 'owner_agent_conversations' || this.table === 'owner_agent_sessions'
                  ? mockState.conversations
                  : this.table === 'owner_agent_conversation_keys'
                    ? mockState.conversationKeys
                    : this.table === 'owner_agent_messages'
                      ? mockState.messages
                      : this.table === 'owner_agent_runs'
                        ? mockState.runs
                        : this.table === 'owner_agent_run_events'
                          ? mockState.runEvents
                          : [];
      return source.filter((row) => {
        const matchesEq = this.filters.every(([field, value]) => row[field] === value);
        const matchesNull = this.nullFilters.every((field) => row[field] === null);
        return matchesEq && matchesNull;
      });
    }
  }

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockImplementation(async () => ({
          data: { user: { id: mockState.authUserId, role: 'authenticated' } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
    isSupabaseConfigured: vi.fn().mockReturnValue(true),
  };
});

import { jwtAuthMiddleware } from '../../../gateway/src/middleware/auth.js';
import { validateRequest } from '../../../gateway/src/middleware/validate-request.js';
import {
  handleCreateHostToken,
  handleDeleteHostToken,
} from '../../../gateway/src/routes/owner-host-tokens.js';
import {
  handleCreateOwnerAgent,
  handleListOwnerAgents,
} from '../../../gateway/src/routes/owner-agents.js';
import {
  handleArchiveOwnerAgentSession,
  handleCreateOwnerAgentSession,
  handleRenameOwnerAgentSession,
} from '../../../gateway/src/routes/owner-agent-sessions.js';
import {
  handleResendOwnerAgentMessage,
  handleSendOwnerAgentMessage,
} from '../../../gateway/src/routes/owner-agent-messages.js';
import { hashHostToken, verifyHostToken } from '../../../gateway/src/db/owner-agent-chat.js';
import {
  clearHostConnectionsForTest,
  hasHostConnection,
  registerHostConnection,
} from '../../../gateway/src/services/agent-host-registry.js';
import {
  ownerAgentCreateHostTokenRequestSchema,
  ownerAgentCreateSessionRequestSchema,
  ownerAgentRenameSessionRequestSchema,
} from '../../../shared/contracts/http/owner-agent-chat/protocol.js';

interface MockReq {
  headers: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  user?: { id: string; role: string };
}

interface MockRes {
  _statusCode: number;
  _body: Record<string, unknown> | null;
  _sent: boolean;
  status: (code: number) => MockRes;
  json: (body: Record<string, unknown>) => void;
  send: () => void;
}

function createRes(): MockRes {
  const res: MockRes = {
    _statusCode: 200,
    _body: null,
    _sent: false,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res._body = body;
      res._sent = true;
    },
    send() {
      res._sent = true;
    },
  };
  return res;
}

async function runSendOwnerAgentMessage(
  agentId: string,
  body: Record<string, unknown>
): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: { agentId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleSendOwnerAgentMessage(
    req as Parameters<typeof handleSendOwnerAgentMessage>[0],
    res as unknown as Parameters<typeof handleSendOwnerAgentMessage>[1]
  );
  return res;
}

async function runResendOwnerAgentMessage(
  agentId: string,
  runId: string,
  body: Record<string, unknown>
): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: { agentId, runId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleResendOwnerAgentMessage(
    req as Parameters<typeof handleResendOwnerAgentMessage>[0],
    res as unknown as Parameters<typeof handleResendOwnerAgentMessage>[1]
  );
  return res;
}

async function runCreateHostToken(body: Record<string, unknown>): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: {},
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  let validationPassed = false;
  const validate = validateRequest(ownerAgentCreateHostTokenRequestSchema);
  validate(
    req as Parameters<typeof validate>[0],
    res as unknown as Parameters<typeof validate>[1],
    () => {
      validationPassed = true;
    }
  );
  if (!validationPassed) return res;

  await handleCreateHostToken(
    req as Parameters<typeof handleCreateHostToken>[0],
    res as unknown as Parameters<typeof handleCreateHostToken>[1]
  );
  return res;
}

async function runDeleteHostToken(tokenId: string): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    params: { tokenId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleDeleteHostToken(
    req as Parameters<typeof handleDeleteHostToken>[0],
    res as unknown as Parameters<typeof handleDeleteHostToken>[1]
  );
  return res;
}

async function runListOwnerAgents(): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    params: {},
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleListOwnerAgents(
    req as Parameters<typeof handleListOwnerAgents>[0],
    res as unknown as Parameters<typeof handleListOwnerAgents>[1]
  );
  return res;
}

async function runCreateOwnerAgent(body: Record<string, unknown>): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: {},
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleCreateOwnerAgent(
    req as Parameters<typeof handleCreateOwnerAgent>[0],
    res as unknown as Parameters<typeof handleCreateOwnerAgent>[1]
  );
  return res;
}

async function runCreateOwnerAgentSession(
  agentId: string,
  body: Record<string, unknown>
): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: { agentId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  let validationPassed = false;
  const validate = validateRequest(ownerAgentCreateSessionRequestSchema);
  validate(
    req as Parameters<typeof validate>[0],
    res as unknown as Parameters<typeof validate>[1],
    () => {
      validationPassed = true;
    }
  );
  if (!validationPassed) return res;

  await handleCreateOwnerAgentSession(
    req as Parameters<typeof handleCreateOwnerAgentSession>[0],
    res as unknown as Parameters<typeof handleCreateOwnerAgentSession>[1]
  );
  return res;
}

async function runRenameOwnerAgentSession(
  sessionId: string,
  body: Record<string, unknown>
): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    body,
    params: { sessionId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  let validationPassed = false;
  const validate = validateRequest(ownerAgentRenameSessionRequestSchema);
  validate(
    req as Parameters<typeof validate>[0],
    res as unknown as Parameters<typeof validate>[1],
    () => {
      validationPassed = true;
    }
  );
  if (!validationPassed) return res;

  await handleRenameOwnerAgentSession(
    req as Parameters<typeof handleRenameOwnerAgentSession>[0],
    res as unknown as Parameters<typeof handleRenameOwnerAgentSession>[1]
  );
  return res;
}

async function runArchiveOwnerAgentSession(sessionId: string): Promise<MockRes> {
  const req: MockReq = {
    headers: { authorization: 'Bearer owner-jwt' },
    params: { sessionId },
  };
  const res = createRes();

  let authPassed = false;
  await jwtAuthMiddleware(
    req as Parameters<typeof jwtAuthMiddleware>[0],
    res as unknown as Parameters<typeof jwtAuthMiddleware>[1],
    () => {
      authPassed = true;
    }
  );
  if (!authPassed) return res;

  await handleArchiveOwnerAgentSession(
    req as Parameters<typeof handleArchiveOwnerAgentSession>[0],
    res as unknown as Parameters<typeof handleArchiveOwnerAgentSession>[1]
  );
  return res;
}

function validCreateBody(ownerId: string = OWNER_A_ID) {
  return {
    label: 'Zeze MacBook Pro',
    host_id: HOST_ID,
    scope: {
      owner_id: ownerId,
      allowed_provider_set: ['openclaw', 'claude'],
      can_register_local: true,
      can_receive_private_runs: true,
    },
    expires_at: '2026-05-27T00:00:00.000Z',
  };
}

function validCreateAgentBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Code Review Agent',
    avatar_url: null,
    description: 'Reviews pull requests.',
    backend_provider: 'cursor',
    backend_source: 'local',
    instructions: 'Focus on correctness.',
    suggested_prompts: ['Review this diff'],
    execution_mode: 'full_access',
    execution_mode_ack: true,
    ...overrides,
  };
}

function validSendMessageBody(overrides: Record<string, unknown> = {}) {
  return {
    content: 'Review this repository.',
    content_type: 'text',
    requested_model: 'gpt-5.5-high',
    ...overrides,
  };
}

function validCreateSessionBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Investigate flaky tests',
    ...overrides,
  };
}

function seedOwnerAgent(overrides: { agentId?: string; ownerId?: string; hostId?: string | null } = {}) {
  const ownerId = overrides.ownerId ?? OWNER_A_ID;
  const agentId = overrides.agentId ?? AGENT_A_ID;
  const hostId = overrides.hostId === undefined ? HOST_ID : overrides.hostId;

  mockState.agents.push({
    id: agentId,
    owner_id: ownerId,
    name: 'Code Review Agent',
    api_key_hash: 'hash-a',
    avatar_url: null,
    description: 'Reviews code.',
    instructions: 'Focus on correctness.',
    suggested_prompts: ['Review this diff'],
    execution_mode: 'full_access',
    status: 'active',
    last_seen_at: null,
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
  });
  mockState.bindings.push({
    id: BINDING_ID,
    agent_id: agentId,
    owner_id: ownerId,
    binding_kind: 'local_host',
    host_id: hostId,
    preferred_host_id: hostId,
    provider: 'cursor',
    execution_mode: 'full_access',
    status: 'active',
    created_at: '2026-04-27T00:00:00.000Z',
  });
}

function seedConversation() {
  mockState.conversations.push({
    id: CONVERSATION_ID,
    owner_id: OWNER_A_ID,
    agent_id: AGENT_A_ID,
    title: 'Existing session',
    provider_session_id: null,
    provider_work_dir: null,
    status: 'active',
    last_active_at: null,
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
  });
}

describe('Owner Agent Chat Host Token API', () => {
  beforeEach(() => {
    mockState.authUserId = AUTH_USER_ID;
    mockState.owners = [{ id: OWNER_A_ID, user_id: AUTH_USER_ID }];
    mockState.tokens = [];
    mockState.agents = [];
    mockState.hosts = [
      {
        id: HOST_ID,
        owner_id: OWNER_A_ID,
        host_type: 'local',
        display_name: 'Zeze MacBook Pro',
        status: 'online',
        last_seen_at: '2026-04-27T00:00:00.000Z',
        created_at: '2026-04-27T00:00:00.000Z',
      },
      {
        id: HOST_B_ID,
        owner_id: OWNER_B_ID,
        host_type: 'local',
        display_name: 'Other Host',
        status: 'online',
        last_seen_at: '2026-04-27T00:00:00.000Z',
        created_at: '2026-04-27T00:00:00.000Z',
      },
    ];
    mockState.providers = [
      {
        id: '99999999-9999-4999-8999-999999999999',
        host_id: HOST_ID,
        provider: 'cursor',
        status: 'available',
        capabilities: { full_access: true, streaming: true },
        created_at: '2026-04-27T00:00:00.000Z',
      },
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        host_id: HOST_B_ID,
        provider: 'cursor',
        status: 'available',
        capabilities: { full_access: true, streaming: true },
        created_at: '2026-04-27T00:00:00.000Z',
      },
    ];
    mockState.bindings = [];
    mockState.conversations = [];
    mockState.conversationKeys = [];
    mockState.messages = [];
    mockState.runs = [];
    mockState.runEvents = [];
    mockState.nextTokenId = TOKEN_ID;
    mockState.nextAgentId = AGENT_A_ID;
    mockState.nextBindingId = BINDING_ID;
    mockState.nextConversationId = CONVERSATION_ID;
    mockState.nextConversationKeyId = 'cccccccc-dddd-4eee-8fff-cccccccccccc';
    mockState.nextMessageId = MESSAGE_ID;
    mockState.nextRunId = RUN_ID;
    mockState.nextRunEventId = 'dddddddd-eeee-4fff-8aaa-dddddddddddd';
    mockState.insertedPayloads = [];
    clearHostConnectionsForTest();
  });

  it('POST /api/owner/host-tokens returns the plaintext token only in the response', async () => {
    const response = await runCreateHostToken(validCreateBody());

    expect(response._statusCode).toBe(201);
    expect(response._body?.token_id).toBe(TOKEN_ID);
    expect(response._body?.token).toMatch(/^qrclaw_host_[A-Za-z0-9_-]+$/);
    expect(response._body?.scope).toEqual(validCreateBody().scope);

    const persisted = mockState.insertedPayloads[0];
    expect(persisted).not.toHaveProperty('token');
  });

  it('stores only HMAC-SHA256 token_hash and never the plaintext token', async () => {
    const response = await runCreateHostToken(validCreateBody());

    expect(response._statusCode).toBe(201);
    const plaintextToken = response._body?.token as string;
    const expectedHash = createHmac('sha256', 'test-host-token-pepper')
      .update(plaintextToken, 'utf8')
      .digest('hex');

    expect(mockState.tokens[0].token_hash).toBe(expectedHash);
    expect(mockState.tokens[0].token_hash).not.toBe(plaintextToken);
    expect(JSON.stringify(mockState.tokens[0])).not.toContain(plaintextToken);
  });

  it('DELETE /api/owner/host-tokens/:tokenId revokes the token so future Host verification fails', async () => {
    const createResponse = await runCreateHostToken(validCreateBody());

    expect(createResponse._statusCode).toBe(201);
    const plaintextToken = createResponse._body?.token as string;
    const tokenHash = hashHostToken(plaintextToken);
    await expect(verifyHostToken(tokenHash)).resolves.toMatchObject({ tokenId: TOKEN_ID });

    const deleteResponse = await runDeleteHostToken(TOKEN_ID);
    expect(deleteResponse._statusCode).toBe(204);

    await expect(verifyHostToken(tokenHash)).resolves.toBeNull();
  });

  it('hot revokes an online Host connection when its token is revoked', async () => {
    const createResponse = await runCreateHostToken(validCreateBody());
    expect(createResponse._statusCode).toBe(201);

    const ws = {
      OPEN: 1,
      readyState: 1,
      close: vi.fn(),
    };
    registerHostConnection({
      hostId: HOST_ID,
      ownerId: OWNER_A_ID,
      tokenId: TOKEN_ID,
      ws,
    });

    const deleteResponse = await runDeleteHostToken(TOKEN_ID);
    expect(deleteResponse._statusCode).toBe(204);

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(hasHostConnection(HOST_ID)).toBe(false);
  });

  it('does not let Owner A revoke Owner B token', async () => {
    mockState.tokens.push({
      id: TOKEN_ID,
      owner_id: OWNER_B_ID,
      host_id: HOST_ID,
      token_hash: 'b-token-hash',
      label: null,
      scope: validCreateBody(OWNER_B_ID).scope,
      expires_at: null,
      revoked_at: null,
      created_at: '2026-04-27T00:00:00.000Z',
    });

    const response = await runDeleteHostToken(TOKEN_ID);
    expect(response._statusCode).toBe(404);

    expect(mockState.tokens[0].revoked_at).toBeNull();
    expect(hasHostConnection(HOST_ID)).toBe(false);
  });

  it('GET /api/owner/agents only returns the authenticated owner agents with Wave 1 fields', async () => {
    mockState.agents.push(
      {
        id: AGENT_A_ID,
        owner_id: OWNER_A_ID,
        name: 'Owner A Agent',
        api_key_hash: 'hash-a',
        avatar_url: 'https://example.com/a.png',
        description: 'A private agent.',
        instructions: 'Only help owner A.',
        suggested_prompts: ['Summarize this repo'],
        execution_mode: 'standard',
        status: 'active',
        last_seen_at: null,
        created_at: '2026-04-27T00:00:00.000Z',
        updated_at: '2026-04-27T00:00:00.000Z',
      },
      {
        id: AGENT_B_ID,
        owner_id: OWNER_B_ID,
        name: 'Owner B Agent',
        api_key_hash: 'hash-b',
        avatar_url: null,
        description: null,
        instructions: null,
        suggested_prompts: [],
        execution_mode: 'standard',
        status: 'active',
        last_seen_at: null,
        created_at: '2026-04-27T00:00:00.000Z',
        updated_at: '2026-04-27T00:00:00.000Z',
      }
    );
    mockState.bindings.push({
      id: BINDING_ID,
      agent_id: AGENT_A_ID,
      owner_id: OWNER_A_ID,
      binding_kind: 'local_host',
      host_id: HOST_ID,
      preferred_host_id: HOST_ID,
      provider: 'cursor',
      execution_mode: 'standard',
      status: 'active',
      created_at: '2026-04-27T00:00:00.000Z',
    });

    const response = await runListOwnerAgents();

    expect(response._statusCode).toBe(200);
    const agents = response._body?.data as Array<Record<string, unknown>>;
    expect(agents).toHaveLength(5);
    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: AGENT_A_ID,
        description: 'A private agent.',
        avatar_url: 'https://example.com/a.png',
        instructions: 'Only help owner A.',
        suggested_prompts: ['Summarize this repo'],
        execution_mode: 'standard',
        status: 'active',
      }),
      expect.objectContaining({
        name: 'OpenClaw Assistant',
        backend_provider: 'openclaw',
        is_default: true,
        source: 'system_default',
      }),
      expect.objectContaining({
        name: 'Claude Assistant',
        backend_provider: 'claude',
        is_default: true,
        source: 'system_default',
      }),
      expect.objectContaining({
        name: 'Cursor Assistant',
        backend_provider: 'cursor',
        is_default: true,
        source: 'system_default',
      }),
      expect.objectContaining({
        name: 'Codex Assistant',
        backend_provider: 'codex',
        is_default: true,
        source: 'system_default',
      }),
    ]));
  });

  it('POST /api/owner/agents creates an agent and an active provider binding', async () => {
    const response = await runCreateOwnerAgent(validCreateAgentBody());

    expect(response._statusCode).toBe(201);
    expect(response._body?.data).toEqual(
      expect.objectContaining({
        id: AGENT_A_ID,
        name: 'Code Review Agent',
        execution_mode: 'full_access',
      })
    );
    expect(mockState.agents).toHaveLength(1);
    expect(mockState.bindings).toEqual([
      expect.objectContaining({
        id: BINDING_ID,
        agent_id: AGENT_A_ID,
        owner_id: OWNER_A_ID,
        binding_kind: 'local_host',
        host_id: HOST_ID,
        preferred_host_id: HOST_ID,
        provider: 'cursor',
        execution_mode: 'full_access',
        status: 'active',
      }),
    ]);
  });

  it('POST /api/owner/agents/:agentId/sessions creates an active session for that owner agent', async () => {
    seedOwnerAgent();

    const response = await runCreateOwnerAgentSession(AGENT_A_ID, validCreateSessionBody());

    expect(response._statusCode).toBe(201);
    expect(response._body?.data).toEqual(
      expect.objectContaining({
        session_id: CONVERSATION_ID,
        conversation_id: CONVERSATION_ID,
        owner_id: OWNER_A_ID,
        agent_id: AGENT_A_ID,
        title: 'Investigate flaky tests',
        status: 'active',
      })
    );
    expect(mockState.conversations).toEqual([
      expect.objectContaining({
        id: CONVERSATION_ID,
        owner_id: OWNER_A_ID,
        agent_id: AGENT_A_ID,
        title: 'Investigate flaky tests',
        status: 'active',
      }),
    ]);
  });

  it('POST /api/owner/agents/:agentId/sessions returns 404 for another owner agent', async () => {
    seedOwnerAgent({ agentId: AGENT_B_ID, ownerId: OWNER_B_ID, hostId: HOST_B_ID });

    const response = await runCreateOwnerAgentSession(AGENT_B_ID, validCreateSessionBody());

    expect(response._statusCode).toBe(404);
    expect(mockState.conversations).toHaveLength(0);
  });

  it('PATCH /api/owner/sessions/:sessionId renames an owned session', async () => {
    seedOwnerAgent();
    seedConversation();

    const response = await runRenameOwnerAgentSession(CONVERSATION_ID, { title: 'PR review thread' });

    expect(response._statusCode).toBe(200);
    expect(response._body?.data).toEqual(
      expect.objectContaining({
        session_id: CONVERSATION_ID,
        title: 'PR review thread',
      })
    );
    expect(mockState.conversations[0]).toEqual(expect.objectContaining({ title: 'PR review thread' }));
  });

  it('PATCH /api/owner/sessions/:sessionId rejects blank titles', async () => {
    seedOwnerAgent();
    seedConversation();

    const response = await runRenameOwnerAgentSession(CONVERSATION_ID, { title: '' });

    expect(response._statusCode).toBe(400);
    expect(mockState.conversations[0].title).toBe('Existing session');
  });

  it('DELETE /api/owner/sessions/:sessionId archives an owned session without deleting history', async () => {
    seedOwnerAgent();
    seedConversation();

    const response = await runArchiveOwnerAgentSession(CONVERSATION_ID);

    expect(response._statusCode).toBe(204);
    expect(mockState.conversations).toHaveLength(1);
    expect(mockState.conversations[0]).toEqual(expect.objectContaining({ status: 'archived' }));
  });

  it('does not let Owner A rename or archive Owner B sessions', async () => {
    seedOwnerAgent({ agentId: AGENT_B_ID, ownerId: OWNER_B_ID, hostId: HOST_B_ID });
    mockState.conversations.push({
      id: SESSION_B_ID,
      owner_id: OWNER_B_ID,
      agent_id: AGENT_B_ID,
      title: 'Other owner session',
      provider_session_id: null,
      provider_work_dir: null,
      status: 'active',
      last_active_at: null,
      created_at: '2026-04-27T00:00:00.000Z',
      updated_at: '2026-04-27T00:00:00.000Z',
    });

    const renameResponse = await runRenameOwnerAgentSession(SESSION_B_ID, { title: 'Stolen title' });
    const archiveResponse = await runArchiveOwnerAgentSession(SESSION_B_ID);

    expect(renameResponse._statusCode).toBe(404);
    expect(archiveResponse._statusCode).toBe(404);
    expect(mockState.conversations[0]).toEqual(
      expect.objectContaining({
        title: 'Other owner session',
        status: 'active',
      })
    );
  });

  it('POST /api/owner/agents rejects full_access without acknowledgement', async () => {
    const response = await runCreateOwnerAgent(validCreateAgentBody({ execution_mode_ack: false }));

    expect(response._statusCode).toBe(400);
    expect(response._body?.error).toEqual(
      expect.objectContaining({
        code: 'invalid_request',
      })
    );
    expect(mockState.agents).toHaveLength(0);
    expect(mockState.bindings).toHaveLength(0);
  });

  it('POST /api/owner/agents returns 422 for semantic CHECK-sized payload violations', async () => {
    const response = await runCreateOwnerAgent(
      validCreateAgentBody({
        instructions: 'x'.repeat(8_001),
      })
    );

    expect(response._statusCode).toBe(422);
    expect(response._body?.error).toEqual(
      expect.objectContaining({
        code: 'invalid_request',
      })
    );
    expect(mockState.agents).toHaveLength(0);
  });

  it('POST /api/owner/agents refuses to bind through another owner host provider', async () => {
    mockState.hosts = mockState.hosts.filter((host) => host.owner_id === OWNER_B_ID);
    mockState.providers = mockState.providers.filter((provider) => provider.host_id === HOST_B_ID);

    const response = await runCreateOwnerAgent(validCreateAgentBody());

    expect(response._statusCode).toBe(403);
    expect(response._body?.error).toEqual(
      expect.objectContaining({
        code: 'forbidden',
      })
    );
    expect(mockState.agents).toHaveLength(0);
    expect(mockState.bindings).toHaveLength(0);
  });

  it('POST /api/owner/agents/:agentId/messages encrypts, persists, routes online Host, and returns running', async () => {
    seedOwnerAgent();
    const sentFrames: string[] = [];
    registerHostConnection({
      hostId: HOST_ID,
      ownerId: OWNER_A_ID,
      tokenId: TOKEN_ID,
      ws: {
        OPEN: 1,
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn((payload: string) => {
          sentFrames.push(payload);
        }),
        close: vi.fn(),
      },
    });

    const response = await runSendOwnerAgentMessage(AGENT_A_ID, validSendMessageBody());

    expect(response._statusCode).toBe(201);
    expect(response._body).toEqual(
      expect.objectContaining({
        message_id: MESSAGE_ID,
        conversation_id: CONVERSATION_ID,
        run_id: RUN_ID,
        status: 'running',
      })
    );
    expect(mockState.messages[0]).toEqual(expect.objectContaining({ status: 'sent' }));
    expect(mockState.runs[0]).toEqual(expect.objectContaining({ status: 'running', started_at: expect.any(String) }));
    expect(sentFrames).toHaveLength(1);
    expect(JSON.parse(sentFrames[0])).toEqual(
      expect.objectContaining({
        type: 'owner_agent_run_request',
        payload: expect.objectContaining({
          run_id: RUN_ID,
          owner_message_id: MESSAGE_ID,
          content: 'Review this repository.',
        }),
      })
    );
  });

  it('POST /api/owner/agents/:agentId/messages leaves the run pending when Host is offline', async () => {
    seedOwnerAgent();

    const response = await runSendOwnerAgentMessage(AGENT_A_ID, validSendMessageBody());

    expect(response._statusCode).toBe(201);
    expect(response._body).toEqual(
      expect.objectContaining({
        message_id: MESSAGE_ID,
        run_id: RUN_ID,
        status: 'pending',
      })
    );
    expect(mockState.messages[0]).toEqual(expect.objectContaining({ status: 'pending' }));
    expect(mockState.runs[0]).toEqual(expect.objectContaining({ status: 'pending', started_at: null }));
  });

  it('POST /api/owner/agents/:agentId/messages rejects the 51st pending owner message', async () => {
    seedOwnerAgent();
    seedConversation();
    for (let index = 0; index < 50; index += 1) {
      mockState.messages.push({
        id: `pending-${index}`,
        conversation_id: CONVERSATION_ID,
        owner_id: OWNER_A_ID,
        agent_id: AGENT_A_ID,
        run_id: null,
        sender_type: 'owner',
        content_encrypted: `cipher-${index}`,
        content_type: 'text',
        encryption_meta: {},
        status: 'pending',
        created_at: '2026-04-27T00:00:00.000Z',
      });
    }

    const response = await runSendOwnerAgentMessage(AGENT_A_ID, validSendMessageBody());

    expect(response._statusCode).toBe(400);
    expect(response._body?.error).toEqual(
      expect.objectContaining({
        code: 'pending_limit_reached',
      })
    );
    expect(mockState.runs).toHaveLength(0);
  });

  it('POST /api/owner/agents/:agentId/messages/:runId/resend replaces old pending and creates a new run', async () => {
    seedOwnerAgent();
    seedConversation();
    mockState.runs.push({
      id: RUN_ID,
      conversation_id: CONVERSATION_ID,
      owner_id: OWNER_A_ID,
      agent_id: AGENT_A_ID,
      host_id: HOST_ID,
      provider: 'cursor',
      status: 'pending',
      requested_model: null,
      actual_model: null,
      provider_session_id: null,
      provider_work_dir: null,
      error_code: null,
      error_message: null,
      created_at: '2026-04-27T00:00:00.000Z',
      started_at: null,
      completed_at: null,
    });
    mockState.messages.push({
      id: MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      owner_id: OWNER_A_ID,
      agent_id: AGENT_A_ID,
      run_id: RUN_ID,
      sender_type: 'owner',
      content_encrypted: 'old-cipher',
      content_type: 'text',
      encryption_meta: {},
      status: 'pending',
      created_at: '2026-04-27T00:00:00.000Z',
    });
    mockState.nextMessageId = 'eeeeeeee-ffff-4aaa-8bbb-eeeeeeeeeeee';
    mockState.nextRunId = 'ffffffff-aaaa-4bbb-8ccc-ffffffffffff';

    const response = await runResendOwnerAgentMessage(AGENT_A_ID, RUN_ID, validSendMessageBody({ content: 'Retry now.' }));

    expect(response._statusCode).toBe(201);
    expect(mockState.messages[0].status).toBe('replaced');
    expect(mockState.runs[0]).toEqual(expect.objectContaining({ status: 'cancelled', error_code: 'replaced' }));
    expect(response._body).toEqual(
      expect.objectContaining({
        message_id: 'eeeeeeee-ffff-4aaa-8bbb-eeeeeeeeeeee',
        run_id: 'ffffffff-aaaa-4bbb-8ccc-ffffffffffff',
        status: 'pending',
      })
    );
  });

  it('marks running runs as failed(timeout) when they started more than 30 minutes ago', async () => {
    seedOwnerAgent();
    seedConversation();
    mockState.runs.push({
      id: RUN_ID,
      conversation_id: CONVERSATION_ID,
      owner_id: OWNER_A_ID,
      agent_id: AGENT_A_ID,
      host_id: HOST_ID,
      provider: 'cursor',
      status: 'running',
      requested_model: null,
      actual_model: null,
      provider_session_id: null,
      provider_work_dir: null,
      error_code: null,
      error_message: null,
      created_at: '2026-04-27T00:00:00.000Z',
      started_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      completed_at: null,
    });
    mockState.nextRunId = 'ffffffff-aaaa-4bbb-8ccc-ffffffffffff';

    const response = await runSendOwnerAgentMessage(AGENT_A_ID, validSendMessageBody());

    expect(response._statusCode).toBe(201);
    expect(mockState.runs[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error_code: 'timeout',
      })
    );
    expect(mockState.runEvents).toEqual([
      expect.objectContaining({
        run_id: RUN_ID,
        seq: 1,
        type: 'error',
        metadata: expect.objectContaining({ error_code: 'timeout' }),
      }),
    ]);
  });

  it('POST /api/owner/agents/:agentId/messages returns 404 for another owner agent', async () => {
    seedOwnerAgent({ agentId: AGENT_B_ID, ownerId: OWNER_B_ID, hostId: HOST_B_ID });

    const response = await runSendOwnerAgentMessage(AGENT_B_ID, validSendMessageBody());

    expect(response._statusCode).toBe(404);
    expect(mockState.messages).toHaveLength(0);
    expect(mockState.runs).toHaveLength(0);
  });

  it('stores encrypted owner content without leaking plaintext into DB payloads', async () => {
    seedOwnerAgent();
    const plaintext = 'plain owner secret that must not be stored';

    const response = await runSendOwnerAgentMessage(AGENT_A_ID, validSendMessageBody({ content: plaintext }));

    expect(response._statusCode).toBe(201);
    expect(mockState.messages[0].content_encrypted).not.toContain(plaintext);
    expect(JSON.stringify(mockState.insertedPayloads)).not.toContain(plaintext);
  });
});
