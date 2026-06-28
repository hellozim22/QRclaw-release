import { randomUUID } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD || 'CHANGE_ME_TEST_PASSWORD';

const PRIVATE_TABLES = [
  'agent_hosts',
  'agent_host_tokens',
  'agent_host_providers',
  'agent_bindings',
  'owner_agent_conversations',
  'owner_agent_messages',
  'owner_agent_runs',
  'owner_agent_run_events',
  'owner_agent_conversation_keys',
] as const;

type PrivateTable = (typeof PRIVATE_TABLES)[number];

const PRIMARY_KEY_BY_TABLE: Record<PrivateTable, string> = {
  agent_hosts: 'id',
  agent_host_tokens: 'id',
  agent_host_providers: 'id',
  agent_bindings: 'id',
  owner_agent_conversations: 'id',
  owner_agent_messages: 'id',
  owner_agent_runs: 'id',
  owner_agent_run_events: 'id',
  owner_agent_conversation_keys: 'key_id',
};

const UPDATE_BY_TABLE: Record<PrivateTable, Record<string, unknown>> = {
  agent_hosts: { display_name: 'cross-owner-update-attempt' },
  agent_host_tokens: { label: 'cross-owner-update-attempt' },
  agent_host_providers: { status: 'disabled' },
  agent_bindings: { status: 'disabled' },
  owner_agent_conversations: { status: 'archived' },
  owner_agent_messages: { status: 'deleted' },
  owner_agent_runs: { status: 'cancelled' },
  owner_agent_run_events: { metadata: { cross_owner_update_attempt: true } },
  owner_agent_conversation_keys: { status: 'revoked' },
};

interface OwnerFixture {
  ownerId: string;
  userId: string;
  client: SupabaseClient;
}

interface SeededRows {
  agentId: string;
  hostId: string;
  tokenId: string;
  providerId: string;
  bindingId: string;
  conversationId: string;
  runId: string;
  messageId: string;
  eventId: string;
  keyId: string;
}

const createdUserIds = new Set<string>();
const createdOwnerIds = new Set<string>();

function requireLiveSupabaseEnv() {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => !value || value.startsWith('test-'));

  if (missing.length > 0) {
    throw new Error(`Live Supabase env required: ${missing.map(([name]) => name).join(', ')}`);
  }
}

function client(key: string, token?: string) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `owner-agent-chat-qa-${randomUUID()}`,
    },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

const adminClient = client(SUPABASE_SERVICE_ROLE_KEY);
const anonAuthClient = client(SUPABASE_ANON_KEY);

async function createOwner(label: string): Promise<OwnerFixture> {
  const email = `owner-agent-chat-qa-${label}-${randomUUID()}@qrclaw.test`;
  const { data: userResult, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (userError || !userResult.user) {
    throw new Error(`create user failed: ${userError?.message ?? 'missing user'}`);
  }

  createdUserIds.add(userResult.user.id);

  const { data: owner, error: ownerError } = await adminClient
    .from('owners')
    .insert({
      user_id: userResult.user.id,
      email,
      display_name: `QA Owner ${label}`,
      plan: 'free',
    })
    .select('id')
    .single();
  if (ownerError || !owner) {
    throw new Error(`create owner failed: ${ownerError?.message ?? 'missing owner'}`);
  }

  createdOwnerIds.add(owner.id as string);

  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({
    email,
    password: OWNER_PASSWORD,
  });
  if (signInError || !session.session?.access_token) {
    throw new Error(`sign in failed: ${signInError?.message ?? 'missing access token'}`);
  }

  return {
    ownerId: owner.id as string,
    userId: userResult.user.id,
    client: client(SUPABASE_ANON_KEY, session.session.access_token),
  };
}

async function insertSingle<T extends Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
  columns: string
): Promise<T> {
  const { data, error } = await adminClient.from(table).insert(values).select(columns).single();
  if (error || !data) {
    throw new Error(`${table} insert failed: ${error?.message ?? 'missing row'}`);
  }
  return data as T;
}

async function seedOwnerRows(owner: OwnerFixture, label: string): Promise<SeededRows> {
  const agent = await insertSingle<{ id: string }>(
    'agents',
    {
      owner_id: owner.ownerId,
      name: `qa-agent-${label}-${randomUUID()}`,
      api_key_hash: `qa-agent-key-${label}-${randomUUID()}`,
      status: 'active',
      description: `QA private agent ${label}`,
      avatar_url: 'https://example.com/qa-avatar.png',
      instructions: 'Keep this owner private.',
      suggested_prompts: ['Inspect isolation'],
      execution_mode: 'standard',
    },
    'id'
  );

  const host = await insertSingle<{ id: string }>(
    'agent_hosts',
    {
      owner_id: owner.ownerId,
      host_type: 'local',
      display_name: `qa-host-${label}`,
      status: 'online',
    },
    'id'
  );

  const token = await insertSingle<{ id: string }>(
    'agent_host_tokens',
    {
      owner_id: owner.ownerId,
      host_id: host.id,
      token_hash: `qa-token-hash-${label}-${randomUUID()}`,
      label: 'qa token',
      scope: {
        owner_id: owner.ownerId,
        allowed_provider_set: ['openclaw'],
        can_register_local: true,
        can_receive_private_runs: true,
      },
    },
    'id'
  );

  const provider = await insertSingle<{ id: string }>(
    'agent_host_providers',
    {
      host_id: host.id,
      provider: 'openclaw',
      binary_path: 'opaque-qa-binary',
      status: 'available',
      capabilities: { private_chat: true },
    },
    'id'
  );

  const binding = await insertSingle<{ id: string }>(
    'agent_bindings',
    {
      agent_id: agent.id,
      owner_id: owner.ownerId,
      binding_kind: 'local_host',
      host_id: host.id,
      preferred_host_id: host.id,
      provider: 'openclaw',
      execution_mode: 'standard',
      status: 'active',
    },
    'id'
  );

  const conversation = await insertSingle<{ id: string }>(
    'owner_agent_conversations',
    {
      owner_id: owner.ownerId,
      agent_id: agent.id,
      provider_session_id: `qa-session-${randomUUID()}`,
      provider_work_dir: 'opaque-qa-workdir',
      status: 'active',
      last_active_at: new Date().toISOString(),
    },
    'id'
  );

  const run = await insertSingle<{ id: string }>(
    'owner_agent_runs',
    {
      conversation_id: conversation.id,
      owner_id: owner.ownerId,
      agent_id: agent.id,
      host_id: host.id,
      provider: 'openclaw',
      status: 'queued',
      requested_model: 'qa-model',
    },
    'id'
  );

  const message = await insertSingle<{ id: string }>(
    'owner_agent_messages',
    {
      conversation_id: conversation.id,
      owner_id: owner.ownerId,
      agent_id: agent.id,
      run_id: run.id,
      sender_type: 'owner',
      content_encrypted: 'qa-ciphertext-message',
      content_type: 'text',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'qa' },
      status: 'sent',
    },
    'id'
  );

  const event = await insertSingle<{ id: string }>(
    'owner_agent_run_events',
    {
      run_id: run.id,
      owner_id: owner.ownerId,
      seq: 1,
      type: 'text',
      content_encrypted: 'qa-ciphertext-event',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'qa' },
      metadata: {},
    },
    'id'
  );

  const key = await insertSingle<{ key_id: string }>(
    'owner_agent_conversation_keys',
    {
      conversation_id: conversation.id,
      key_data_encrypted: '\\x00112233',
      kek_version: 1,
      algorithm: 'aes-256-gcm',
      status: 'active',
    },
    'key_id'
  );

  return {
    agentId: agent.id,
    hostId: host.id,
    tokenId: token.id,
    providerId: provider.id,
    bindingId: binding.id,
    conversationId: conversation.id,
    runId: run.id,
    messageId: message.id,
    eventId: event.id,
    keyId: key.key_id,
  };
}

function idsByTable(rows: SeededRows): Record<PrivateTable, string> {
  return {
    agent_hosts: rows.hostId,
    agent_host_tokens: rows.tokenId,
    agent_host_providers: rows.providerId,
    agent_bindings: rows.bindingId,
    owner_agent_conversations: rows.conversationId,
    owner_agent_messages: rows.messageId,
    owner_agent_runs: rows.runId,
    owner_agent_run_events: rows.eventId,
    owner_agent_conversation_keys: rows.keyId,
  };
}

async function selectById(db: SupabaseClient, table: PrivateTable, id: string) {
  const pk = PRIMARY_KEY_BY_TABLE[table];
  return db.from(table).select(pk).eq(pk, id);
}

async function expectGone(table: PrivateTable | 'agents', pk: string, id: string) {
  const { data, error } = await adminClient.from(table).select(pk).eq(pk, id);
  expect(error, `${table} lookup after cascade`).toBeNull();
  expect(data, `${table}.${pk}=${id} should be cascaded`).toEqual([]);
}

async function insertAgentCase(ownerId: string, values: Record<string, unknown>) {
  return adminClient
    .from('agents')
    .insert({
      owner_id: ownerId,
      name: `qa-agent-check-${randomUUID()}`,
      api_key_hash: `qa-agent-check-key-${randomUUID()}`,
      status: 'active',
      ...values,
    })
    .select('id')
    .single();
}

describe('Owner Agent Chat QA independent probe', () => {
  afterAll(async () => {
    if (createdOwnerIds.size > 0) {
      await adminClient.from('owners').delete().in('id', [...createdOwnerIds]);
    }
    await Promise.all([...createdUserIds].map((userId) => adminClient.auth.admin.deleteUser(userId)));
  }, 60000);

  it('covers P0 owner isolation, unauthorized actors, and service-role access', async () => {
    requireLiveSupabaseEnv();

    const ownerA = await createOwner('p0-a');
    const ownerB = await createOwner('p0-b');
    const rowsA = await seedOwnerRows(ownerA, 'p0-a');
    const rowsB = await seedOwnerRows(ownerB, 'p0-b');
    const idsA = idsByTable(rowsA);
    const idsB = idsByTable(rowsB);

    for (const table of PRIVATE_TABLES) {
      const own = await selectById(ownerA.client, table, idsA[table]);
      const other = await selectById(ownerA.client, table, idsB[table]);

      expect(other.error, `${table} cross-owner select should not error`).toBeNull();
      expect(other.data, `${table} cross-owner select should return no rows`).toEqual([]);

      if (table === 'owner_agent_conversation_keys') {
        expect(own.data, `${table} direct owner SELECT is intentionally denied`).toEqual([]);
      } else {
        expect(own.error, `${table} own select`).toBeNull();
        expect(own.data, `${table} own select`).toHaveLength(1);
      }

      const pk = PRIMARY_KEY_BY_TABLE[table];
      const crossOwnerUpdate = await ownerA.client
        .from(table)
        .update(UPDATE_BY_TABLE[table])
        .eq(pk, idsB[table])
        .select(pk);
      expect(
        crossOwnerUpdate.data ?? [],
        `${table} cross-owner update must not mutate or return rows`
      ).toEqual([]);
    }

    const ownAgent = await ownerA.client
      .from('agents')
      .select('id, description, avatar_url, instructions, suggested_prompts, execution_mode, status')
      .eq('id', rowsA.agentId);
    const otherAgent = await ownerA.client
      .from('agents')
      .select('id, description, avatar_url, instructions, suggested_prompts, execution_mode, status')
      .eq('id', rowsB.agentId);
    const updateOtherAgent = await ownerA.client
      .from('agents')
      .update({ description: 'cross-owner-agent-update-attempt' })
      .eq('id', rowsB.agentId)
      .select('id');

    expect(ownAgent.error).toBeNull();
    expect(ownAgent.data).toEqual([
      expect.objectContaining({
        id: rowsA.agentId,
        description: 'QA private agent p0-a',
        execution_mode: 'standard',
      }),
    ]);
    expect(otherAgent.error).toBeNull();
    expect(otherAgent.data).toEqual([]);
    expect(updateOtherAgent.data ?? []).toEqual([]);

    const anonymousClient = client(SUPABASE_ANON_KEY);
    const pluginTokenClient = client(SUPABASE_ANON_KEY, 'plugin-agent-token');
    for (const table of PRIVATE_TABLES) {
      const pk = PRIMARY_KEY_BY_TABLE[table];
      const anonRead = await anonymousClient.from(table).select(pk).limit(1);
      const pluginRead = await pluginTokenClient.from(table).select(pk).limit(1);

      expect(anonRead.data ?? [], `${table} anon direct read`).toEqual([]);
      expect(pluginRead.data ?? [], `${table} plugin-token direct read`).toEqual([]);
    }

    for (const table of PRIVATE_TABLES) {
      const pk = PRIMARY_KEY_BY_TABLE[table];
      const serviceRead = await adminClient.from(table).select(pk).in(pk, [idsA[table], idsB[table]]);
      expect(serviceRead.error, `${table} service-role read`).toBeNull();
      expect(serviceRead.data, `${table} service-role read`).toHaveLength(2);
    }
  }, 60000);

  it('verifies CHECK constraint boundaries on agents extension fields', async () => {
    requireLiveSupabaseEnv();

    const owner = await createOwner('checks');
    const prompt200 = 'p'.repeat(200);
    const prompt201 = 'p'.repeat(201);

    const instructions8000 = await insertAgentCase(owner.ownerId, {
      instructions: 'i'.repeat(8000),
      suggested_prompts: [],
      execution_mode: 'standard',
    });
    const instructions8001 = await insertAgentCase(owner.ownerId, {
      instructions: 'i'.repeat(8001),
      suggested_prompts: [],
      execution_mode: 'standard',
    });
    const prompts10 = await insertAgentCase(owner.ownerId, {
      suggested_prompts: Array.from({ length: 10 }, (_, index) => `prompt-${index}`),
      execution_mode: 'standard',
    });
    const prompts11 = await insertAgentCase(owner.ownerId, {
      suggested_prompts: Array.from({ length: 11 }, (_, index) => `prompt-${index}`),
      execution_mode: 'standard',
    });
    const promptItem200 = await insertAgentCase(owner.ownerId, {
      suggested_prompts: [prompt200],
      execution_mode: 'standard',
    });
    const promptItem201 = await insertAgentCase(owner.ownerId, {
      suggested_prompts: [prompt201],
      execution_mode: 'standard',
    });
    const standard = await insertAgentCase(owner.ownerId, { execution_mode: 'standard' });
    const fullAccess = await insertAgentCase(owner.ownerId, { execution_mode: 'full_access' });
    const invalidMode = await insertAgentCase(owner.ownerId, { execution_mode: 'unsafe_mode' });

    expect(instructions8000.error, 'instructions length 8000 should pass').toBeNull();
    expect(instructions8001.error?.message ?? '', 'instructions length 8001 should reject').toMatch(
      /agents_instructions_length_check|violates/i
    );
    expect(prompts10.error, 'suggested_prompts length 10 should pass').toBeNull();
    expect(prompts11.error?.message ?? '', 'suggested_prompts length 11 should reject').toMatch(
      /agents_suggested_prompts_check|violates/i
    );
    expect(promptItem200.error, 'single prompt length 200 should pass').toBeNull();
    expect(promptItem201.error?.message ?? '', 'single prompt length 201 should reject').toMatch(
      /agents_suggested_prompts_check|violates/i
    );
    expect(standard.error, 'execution_mode standard should pass').toBeNull();
    expect(fullAccess.error, 'execution_mode full_access should pass').toBeNull();
    expect(invalidMode.error?.message ?? '', 'invalid execution_mode should reject').toMatch(
      /agents_execution_mode_check|violates/i
    );
  }, 60000);

  it('verifies owner, agent, and conversation cascade behavior', async () => {
    requireLiveSupabaseEnv();

    const ownerCascade = await createOwner('cascade-owner');
    const ownerCascadeRows = await seedOwnerRows(ownerCascade, 'cascade-owner');
    const ownerCascadeIds = idsByTable(ownerCascadeRows);
    const ownerDelete = await adminClient.from('owners').delete().eq('id', ownerCascade.ownerId);
    expect(ownerDelete.error).toBeNull();
    createdOwnerIds.delete(ownerCascade.ownerId);

    for (const table of PRIVATE_TABLES) {
      await expectGone(table, PRIMARY_KEY_BY_TABLE[table], ownerCascadeIds[table]);
    }

    const agentCascadeOwner = await createOwner('cascade-agent');
    const agentCascadeRows = await seedOwnerRows(agentCascadeOwner, 'cascade-agent');
    const agentDelete = await adminClient.from('agents').delete().eq('id', agentCascadeRows.agentId);
    expect(agentDelete.error).toBeNull();

    await expectGone('agent_bindings', 'id', agentCascadeRows.bindingId);
    await expectGone('owner_agent_conversations', 'id', agentCascadeRows.conversationId);
    await expectGone('owner_agent_messages', 'id', agentCascadeRows.messageId);
    await expectGone('owner_agent_runs', 'id', agentCascadeRows.runId);
    await expectGone('owner_agent_run_events', 'id', agentCascadeRows.eventId);
    await expectGone('owner_agent_conversation_keys', 'key_id', agentCascadeRows.keyId);

    const conversationCascadeOwner = await createOwner('cascade-conversation');
    const conversationCascadeRows = await seedOwnerRows(
      conversationCascadeOwner,
      'cascade-conversation'
    );
    const conversationDelete = await adminClient
      .from('owner_agent_conversations')
      .delete()
      .eq('id', conversationCascadeRows.conversationId);
    expect(conversationDelete.error).toBeNull();

    await expectGone('owner_agent_messages', 'id', conversationCascadeRows.messageId);
    await expectGone('owner_agent_runs', 'id', conversationCascadeRows.runId);
    await expectGone('owner_agent_run_events', 'id', conversationCascadeRows.eventId);
    await expectGone('owner_agent_conversation_keys', 'key_id', conversationCascadeRows.keyId);
  }, 60000);
});
