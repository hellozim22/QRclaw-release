import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { promisify } from 'util';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd().endsWith(`${path.sep}tests`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const OWNER_AGENT_TABLES = [
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

const REQUIRED_FK_INDEXES = [
  'idx_agent_host_tokens_host_id',
  'idx_agent_bindings_host_id',
  'idx_agent_bindings_preferred_host_id',
  'idx_owner_agent_runs_host_id',
  'idx_owner_agent_messages_run_id',
] as const;

const REQUIRED_FK_INDEX_BY_NAME: Record<
  (typeof REQUIRED_FK_INDEXES)[number],
  { table: string; column: string }
> = {
  idx_agent_host_tokens_host_id: { table: 'agent_host_tokens', column: 'host_id' },
  idx_agent_bindings_host_id: { table: 'agent_bindings', column: 'host_id' },
  idx_agent_bindings_preferred_host_id: {
    table: 'agent_bindings',
    column: 'preferred_host_id',
  },
  idx_owner_agent_runs_host_id: { table: 'owner_agent_runs', column: 'host_id' },
  idx_owner_agent_messages_run_id: { table: 'owner_agent_messages', column: 'run_id' },
};

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: `owner-agent-chat-schema-${randomUUID()}`,
  },
});

const createdOwnerIds = new Set<string>();
const createdUserIds = new Set<string>();

interface OwnerFixture {
  ownerId: string;
  userId: string;
}

interface SeededGraph {
  ownerId: string;
  agentId: string;
  hostId: string;
  tokenId: string;
  conversationId: string;
  runId: string;
  messageId: string;
  eventId: string;
  keyId: string;
}

interface QueryResult<T> {
  rows: T[];
}

function requireLiveSupabaseEnv() {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_ACCESS_TOKEN', process.env.SUPABASE_ACCESS_TOKEN ?? ''],
  ].filter(([, value]) => !value || value.startsWith('test-'));

  if (missing.length > 0) {
    throw new Error(`Live Supabase env required: ${missing.map(([name]) => name).join(', ')}`);
  }
}

async function querySql<T>(sql: string): Promise<T[]> {
  const { stdout } = await execFileAsync(
    'supabase',
    ['db', 'query', '--linked', '--output', 'json', sql],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
      maxBuffer: 1024 * 1024 * 5,
    }
  );
  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error(`Unable to parse supabase query output: ${stdout}`);
  }
  const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as QueryResult<T>;
  return parsed.rows;
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

async function createOwner(label: string): Promise<OwnerFixture> {
  const email = `owner-agent-schema-${label}-${randomUUID()}@qrclaw.test`;
  const { data: userResult, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password: 'OwnerAgentSchemaTest123!',
    email_confirm: true,
  });
  if (userError || !userResult.user) {
    throw new Error(`create user failed: ${userError?.message ?? 'missing user'}`);
  }
  createdUserIds.add(userResult.user.id);

  const owner = await insertSingle<{ id: string }>(
    'owners',
    {
      user_id: userResult.user.id,
      email,
      display_name: `Schema Owner ${label}`,
      plan: 'free',
    },
    'id'
  );
  createdOwnerIds.add(owner.id);

  return {
    ownerId: owner.id,
    userId: userResult.user.id,
  };
}

async function seedGraph(label: string): Promise<SeededGraph> {
  const owner = await createOwner(label);
  const agent = await insertSingle<{ id: string }>(
    'agents',
    {
      owner_id: owner.ownerId,
      name: `schema-agent-${label}-${randomUUID()}`,
      api_key_hash: `schema-agent-key-${label}-${randomUUID()}`,
      status: 'active',
      description: 'Schema integration test agent',
      avatar_url: 'https://example.com/schema-avatar.png',
      instructions: 'Keep schema constraints explicit.',
      suggested_prompts: ['Inspect schema'],
      execution_mode: 'standard',
    },
    'id'
  );

  const host = await insertSingle<{ id: string }>(
    'agent_hosts',
    {
      owner_id: owner.ownerId,
      host_type: 'local',
      display_name: `schema-host-${label}`,
      status: 'online',
    },
    'id'
  );

  const token = await insertSingle<{ id: string }>(
    'agent_host_tokens',
    {
      owner_id: owner.ownerId,
      host_id: host.id,
      token_hash: `schema-token-hash-${label}-${randomUUID()}`,
      label: 'schema token',
      scope: {
        owner_id: owner.ownerId,
        allowed_provider_set: ['openclaw'],
        can_register_local: true,
        can_receive_private_runs: true,
      },
    },
    'id'
  );

  await insertSingle<{ id: string }>(
    'agent_host_providers',
    {
      host_id: host.id,
      provider: 'openclaw',
      binary_path: 'opaque-schema-binary',
      status: 'available',
      capabilities: { private_chat: true },
    },
    'id'
  );

  await insertSingle<{ id: string }>(
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
      provider_session_id: `schema-session-${randomUUID()}`,
      provider_work_dir: 'opaque-schema-workdir',
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
      requested_model: 'schema-model',
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
      content_encrypted: 'schema-ciphertext-message',
      content_type: 'text',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'schema' },
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
      content_encrypted: 'schema-ciphertext-event',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'schema' },
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
    ownerId: owner.ownerId,
    agentId: agent.id,
    hostId: host.id,
    tokenId: token.id,
    conversationId: conversation.id,
    runId: run.id,
    messageId: message.id,
    eventId: event.id,
    keyId: key.key_id,
  };
}

async function countRows(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await adminClient
    .from(table)
    .select(column, { count: 'exact', head: true })
    .eq(column, value);
  expect(error, `${table} count`).toBeNull();
  return count ?? 0;
}

function expectDbErrorCode(error: { code?: string } | null, code: string) {
  expect(error?.code).toBe(code);
}

describe('Owner Agent Chat schema', () => {
  afterAll(async () => {
    if (createdOwnerIds.size > 0) {
      await adminClient
        .from('owners')
        .delete()
        .in('id', [...createdOwnerIds]);
    }
    await Promise.allSettled(
      [...createdUserIds].map((userId) => adminClient.auth.admin.deleteUser(userId))
    );
  }, 60000);

  it('DB-01 creates the 9 owner-agent tables', async () => {
    requireLiveSupabaseEnv();

    const rows = await querySql<{ tablename: string }>(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename = any(array[${OWNER_AGENT_TABLES.map((table) => `'${table}'`).join(',')}])
      order by tablename;
    `);

    expect(rows.map((row) => row.tablename)).toEqual([...OWNER_AGENT_TABLES].sort());
  }, 60000);

  it('DB-02 enables RLS on all 9 owner-agent tables', async () => {
    requireLiveSupabaseEnv();

    const rows = await querySql<{ tablename: string; rls_enabled: boolean }>(`
      select tablename, rowsecurity as rls_enabled
      from pg_tables
      where schemaname = 'public'
        and tablename = any(array[${OWNER_AGENT_TABLES.map((table) => `'${table}'`).join(',')}])
      order by tablename;
    `);

    expect(rows).toHaveLength(OWNER_AGENT_TABLES.length);
    expect(rows.every((row) => row.rls_enabled)).toBe(true);
  }, 60000);

  it('DB-03 stores host tokens only as token_hash, not plaintext token columns', async () => {
    requireLiveSupabaseEnv();

    const rows = await querySql<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'agent_host_tokens'
        and column_name in ('token', 'token_plain', 'token_value')
      order by column_name;
    `);

    expect(rows).toEqual([]);
  }, 60000);

  it('P1-A creates FK support indexes for host_id, preferred_host_id, and run_id', async () => {
    requireLiveSupabaseEnv();

    const rows = await querySql<{ tablename: string; indexname: string; indexdef: string }>(`
      select tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and indexname = any(array[${REQUIRED_FK_INDEXES.map((index) => `'${index}'`).join(',')}])
      order by indexname;
    `);

    expect(rows.map((row) => row.indexname)).toEqual([...REQUIRED_FK_INDEXES].sort());
    for (const row of rows) {
      const expected =
        REQUIRED_FK_INDEX_BY_NAME[row.indexname as (typeof REQUIRED_FK_INDEXES)[number]];
      expect(row.tablename, `${row.indexname} table`).toBe(expected.table);
      expect(row.indexdef, `${row.indexname} column`).toContain(`(${expected.column})`);
    }
  }, 60000);

  it('DB-04 rejects duplicate owner_agent_run_events(run_id, seq)', async () => {
    requireLiveSupabaseEnv();

    const graph = await seedGraph('db04');
    const { error } = await adminClient.from('owner_agent_run_events').insert({
      run_id: graph.runId,
      owner_id: graph.ownerId,
      seq: 1,
      type: 'text',
      content_encrypted: 'duplicate-seq',
      encryption_meta: { alg: 'aes-256-gcm', kid: 'schema' },
      metadata: {},
    });

    expectDbErrorCode(error, '23505');
  }, 60000);

  it('DB-05 rejects a second active conversation for the same owner and agent', async () => {
    requireLiveSupabaseEnv();

    const graph = await seedGraph('db05');
    const { data: original, error: originalError } = await adminClient
      .from('owner_agent_conversations')
      .select('owner_id, agent_id')
      .eq('id', graph.conversationId)
      .single();
    expect(originalError).toBeNull();

    const { error } = await adminClient.from('owner_agent_conversations').insert({
      owner_id: original?.owner_id,
      agent_id: original?.agent_id,
      status: 'active',
    });

    expectDbErrorCode(error, '23505');
  }, 60000);

  it('DB-06 cascades messages, runs, events, and keys when deleting a conversation', async () => {
    requireLiveSupabaseEnv();

    const graph = await seedGraph('db06');
    const { error } = await adminClient
      .from('owner_agent_conversations')
      .delete()
      .eq('id', graph.conversationId);
    expect(error).toBeNull();

    expect(await countRows('owner_agent_messages', 'id', graph.messageId)).toBe(0);
    expect(await countRows('owner_agent_runs', 'id', graph.runId)).toBe(0);
    expect(await countRows('owner_agent_run_events', 'id', graph.eventId)).toBe(0);
    expect(await countRows('owner_agent_conversation_keys', 'key_id', graph.keyId)).toBe(0);
  }, 60000);

  it('DB-07 rejects duplicate agent_host_tokens.token_hash values', async () => {
    requireLiveSupabaseEnv();

    const graph = await seedGraph('db07');
    const { data: original, error: originalError } = await adminClient
      .from('agent_host_tokens')
      .select('owner_id, host_id, token_hash')
      .eq('id', graph.tokenId)
      .single();
    expect(originalError).toBeNull();

    const { error } = await adminClient.from('agent_host_tokens').insert({
      owner_id: original?.owner_id,
      host_id: original?.host_id,
      token_hash: original?.token_hash,
      label: 'duplicate token hash',
      scope: {},
    });

    expectDbErrorCode(error, '23505');
  }, 60000);

  it('DB-08 rejects a second active key for the same owner-agent conversation', async () => {
    requireLiveSupabaseEnv();

    const graph = await seedGraph('db08');
    const { error } = await adminClient.from('owner_agent_conversation_keys').insert({
      conversation_id: graph.conversationId,
      key_data_encrypted: '\\x44556677',
      kek_version: 1,
      algorithm: 'aes-256-gcm',
      status: 'active',
    });

    expectDbErrorCode(error, '23505');
  }, 60000);

  it('DB-09 rejects invalid agents extension field values with check violations', async () => {
    requireLiveSupabaseEnv();

    const owner = await createOwner('db09');
    const baseAgent = {
      owner_id: owner.ownerId,
      name: `schema-agent-db09-${randomUUID()}`,
      api_key_hash: `schema-agent-key-db09-${randomUUID()}`,
      status: 'active',
    };

    const invalidInstructions = await adminClient.from('agents').insert({
      ...baseAgent,
      name: `schema-agent-db09-instructions-${randomUUID()}`,
      api_key_hash: `schema-agent-key-db09-instructions-${randomUUID()}`,
      instructions: 'i'.repeat(8001),
      suggested_prompts: [],
      execution_mode: 'standard',
    });
    const invalidPromptCount = await adminClient.from('agents').insert({
      ...baseAgent,
      name: `schema-agent-db09-prompts-${randomUUID()}`,
      api_key_hash: `schema-agent-key-db09-prompts-${randomUUID()}`,
      suggested_prompts: Array.from({ length: 11 }, (_, index) => `prompt-${index}`),
      execution_mode: 'standard',
    });
    const invalidPromptLength = await adminClient.from('agents').insert({
      ...baseAgent,
      name: `schema-agent-db09-prompt-length-${randomUUID()}`,
      api_key_hash: `schema-agent-key-db09-prompt-length-${randomUUID()}`,
      suggested_prompts: ['p'.repeat(201)],
      execution_mode: 'standard',
    });
    const invalidExecutionMode = await adminClient.from('agents').insert({
      ...baseAgent,
      name: `schema-agent-db09-mode-${randomUUID()}`,
      api_key_hash: `schema-agent-key-db09-mode-${randomUUID()}`,
      suggested_prompts: [],
      execution_mode: 'anything_else',
    });

    expectDbErrorCode(invalidInstructions.error, '23514');
    expectDbErrorCode(invalidPromptCount.error, '23514');
    expectDbErrorCode(invalidPromptLength.error, '23514');
    expectDbErrorCode(invalidExecutionMode.error, '23514');
  }, 60000);
});
