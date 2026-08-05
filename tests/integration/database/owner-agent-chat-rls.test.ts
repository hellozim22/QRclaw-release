import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const OWNER_PASSWORD = 'OwnerAgentChatTest123!';

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

interface OwnerFixture {
  userId: string;
  ownerId: string;
  token: string;
  client: SupabaseClient;
}

interface SeededRows {
  agentId: string;
  hostId: string;
  tokenId: string;
  providerId: string;
  bindingId: string;
  conversationId: string;
  messageId: string;
  runId: string;
  eventId: string;
  keyId: string;
}

const createdUserIds: string[] = [];

function createSupabaseClient(key: string, accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `owner-agent-chat-rls-${randomUUID()}`,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

const adminClient = createSupabaseClient(SUPABASE_SERVICE_ROLE_KEY);
const authClient = createSupabaseClient(SUPABASE_ANON_KEY);

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

async function createOwnerFixture(label: string): Promise<OwnerFixture> {
  const email = `owner-agent-chat-${label}-${randomUUID()}@qrclaw.test`;
  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (createUserError || !createdUser.user) {
    throw new Error(`createUser failed: ${createUserError?.message ?? 'missing user'}`);
  }

  createdUserIds.push(createdUser.user.id);

  const { data: owner, error: ownerError } = await adminClient
    .from('owners')
    .insert({
      user_id: createdUser.user.id,
      email,
      display_name: `Owner ${label}`,
      plan: 'free',
    })
    .select('id')
    .single();
  if (ownerError || !owner) {
    throw new Error(`owner insert failed: ${ownerError?.message ?? 'missing owner'}`);
  }

  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: OWNER_PASSWORD,
  });
  if (signInError || !session.session?.access_token) {
    throw new Error(`signIn failed: ${signInError?.message ?? 'missing token'}`);
  }

  const client = createSupabaseClient(SUPABASE_ANON_KEY, session.session.access_token);

  return {
    userId: createdUser.user.id,
    ownerId: owner.id as string,
    token: session.session.access_token,
    client,
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

async function seedOwnerRows(owner: OwnerFixture): Promise<SeededRows> {
  const agent = await insertSingle<{ id: string }>(
    'agents',
    {
      owner_id: owner.ownerId,
      name: `agent-${randomUUID()}`,
      api_key_hash: `agent-hash-${randomUUID()}`,
      status: 'active',
      description: 'Owner private test agent',
      avatar_url: 'https://example.com/avatar.png',
      instructions: 'Keep owner private chat isolated.',
      suggested_prompts: ['Summarize the repo'],
      execution_mode: 'standard',
    },
    'id'
  );

  const host = await insertSingle<{ id: string }>(
    'agent_hosts',
    {
      owner_id: owner.ownerId,
      host_type: 'local',
      display_name: `host-${randomUUID()}`,
      status: 'online',
    },
    'id'
  );

  const token = await insertSingle<{ id: string }>(
    'agent_host_tokens',
    {
      owner_id: owner.ownerId,
      host_id: host.id,
      token_hash: `token-hash-${randomUUID()}`,
      label: 'test token',
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
      binary_path: 'opaque-openclaw',
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
      provider_session_id: `session-${randomUUID()}`,
      provider_work_dir: 'opaque-workdir',
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
      requested_model: 'test-model',
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
      content_encrypted: 'ciphertext-message',
      content_type: 'text',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'test' },
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
      content_encrypted: 'ciphertext-event',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'test' },
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
    messageId: message.id,
    runId: run.id,
    eventId: event.id,
    keyId: key.key_id,
  };
}

async function selectById(client: SupabaseClient, table: PrivateTable, id: string) {
  const primaryKey = PRIMARY_KEY_BY_TABLE[table];
  return client.from(table).select(primaryKey).eq(primaryKey, id);
}

describe('Owner Agent Chat RLS', () => {
  let ownerA: OwnerFixture;
  let ownerB: OwnerFixture;
  let rowsA: SeededRows;
  let rowsB: SeededRows;

  beforeAll(async () => {
    requireLiveSupabaseEnv();
    ownerA = await createOwnerFixture('a');
    ownerB = await createOwnerFixture('b');
    rowsA = await seedOwnerRows(ownerA);
    rowsB = await seedOwnerRows(ownerB);
  }, 30000);

  afterAll(async () => {
    await Promise.all(createdUserIds.map((userId) => adminClient.auth.admin.deleteUser(userId)));
  }, 30000);

  it('lets an owner read only their own private rows across the 9 new tables', async () => {
    const idsByTable: Record<PrivateTable, [string, string]> = {
      agent_hosts: [rowsA.hostId, rowsB.hostId],
      agent_host_tokens: [rowsA.tokenId, rowsB.tokenId],
      agent_host_providers: [rowsA.providerId, rowsB.providerId],
      agent_bindings: [rowsA.bindingId, rowsB.bindingId],
      owner_agent_conversations: [rowsA.conversationId, rowsB.conversationId],
      owner_agent_messages: [rowsA.messageId, rowsB.messageId],
      owner_agent_runs: [rowsA.runId, rowsB.runId],
      owner_agent_run_events: [rowsA.eventId, rowsB.eventId],
      owner_agent_conversation_keys: [rowsA.keyId, rowsB.keyId],
    };

    for (const table of PRIVATE_TABLES) {
      const [ownId, otherId] = idsByTable[table];
      const own = await selectById(ownerA.client, table, ownId);
      const other = await selectById(ownerA.client, table, otherId);

      expect(other.error, `${table} cross-owner select should not error`).toBeNull();
      expect(other.data, `${table} cross-owner select should return no rows`).toEqual([]);

      if (table === 'owner_agent_conversation_keys') {
        expect(own.data, 'owner must not read wrapped DEKs directly').toEqual([]);
      } else {
        expect(own.error, `${table} own select should not error`).toBeNull();
        expect(own.data, `${table} own select should return one row`).toHaveLength(1);
      }
    }
  });

  it('keeps agents extension fields owner-scoped through owners.user_id mapping', async () => {
    const own = await ownerA.client
      .from('agents')
      .select(
        'id, description, avatar_url, instructions, suggested_prompts, execution_mode, status'
      )
      .eq('id', rowsA.agentId);
    const other = await ownerA.client
      .from('agents')
      .select(
        'id, description, avatar_url, instructions, suggested_prompts, execution_mode, status'
      )
      .eq('id', rowsB.agentId);

    expect(own.error).toBeNull();
    expect(own.data).toEqual([
      expect.objectContaining({
        id: rowsA.agentId,
        description: 'Owner private test agent',
        execution_mode: 'standard',
      }),
    ]);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it('RLS-09 rejects an invalid plugin-style bearer token before returning private rows', async () => {
    const anonymousClient = createSupabaseClient(SUPABASE_ANON_KEY);
    const pluginTokenClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: `owner-agent-chat-rls-plugin-${randomUUID()}`,
      },
      global: { headers: { Authorization: 'Bearer plugin-agent-token' } },
    });

    for (const table of PRIVATE_TABLES) {
      const anonRead = await anonymousClient
        .from(table)
        .select(PRIMARY_KEY_BY_TABLE[table])
        .limit(1);
      const pluginRead = await pluginTokenClient
        .from(table)
        .select(PRIMARY_KEY_BY_TABLE[table])
        .limit(1);

      expect(anonRead.error, `${table} anon read should not error`).toBeNull();
      expect(pluginRead.error?.code, `${table} invalid plugin token should be rejected`).toBe(
        'PGRST301'
      );
      expect(anonRead.data ?? [], `${table} anon should see no rows`).toEqual([]);
      expect(pluginRead.data, `${table} invalid plugin token should return no data`).toBeNull();
    }
  });

  it.skip('RLS-09b rejects a real plugin-scope JWT for owner-private access once signer exists', () => {
    // TODO(Wave 3): replace the invalid bearer fallback with a signed plugin-scope JWT,
    // then assert owner-private decrypted-messages access is rejected with 403.
  });

  it('allows owner token revocation only for the owning owner', async () => {
    const revokeOwn = await ownerA.client
      .from('agent_host_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', rowsA.tokenId)
      .select('id, revoked_at');

    const revokeOther = await ownerA.client
      .from('agent_host_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', rowsB.tokenId)
      .select('id');

    expect(revokeOwn.error).toBeNull();
    expect(revokeOwn.data).toHaveLength(1);
    expect(revokeOther.error).toBeNull();
    expect(revokeOther.data).toEqual([]);
  });

  it('rejects forged owner_id writes from authenticated owners', async () => {
    const forgedRun = await ownerA.client.from('owner_agent_runs').insert({
      conversation_id: rowsA.conversationId,
      owner_id: ownerB.ownerId,
      agent_id: rowsA.agentId,
      host_id: rowsA.hostId,
      provider: 'openclaw',
      status: 'queued',
    });

    expect(forgedRun.error?.message ?? '').toMatch(/row-level security|violates/i);
  });

  it('keeps service_role available for encrypted write paths', async () => {
    const { data, error } = await adminClient
      .from('owner_agent_run_events')
      .insert({
        run_id: rowsA.runId,
        owner_id: ownerA.ownerId,
        seq: 2,
        type: 'text',
        content_encrypted: 'ciphertext-service-role',
        encryption_meta: { alg: 'aes-256-gcm', kid: 'test' },
        metadata: {},
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it('does not give owner clients service-role admin capability', async () => {
    const { error } = await ownerA.client.auth.admin.listUsers();

    expect(error?.message ?? '').toMatch(/not allowed|forbidden|jwt|admin/i);
  });
});
