import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { promisify } from 'util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd().endsWith(`${path.sep}tests`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OWNER_PASSWORD = 'Wave10SchemaTest123!';

interface QueryResult<T> {
  rows: T[];
}

interface OwnerFixture {
  userId: string;
  ownerId: string;
  client: SupabaseClient;
}

const createdUserIds: string[] = [];
const createdOwnerIds: string[] = [];

function requireLiveSupabaseEnv() {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    // ['SUPABASE_ACCESS_TOKEN', process.env.SUPABASE_ACCESS_TOKEN ?? ''], // Not required - created via signInWithPassword
  ].filter(([, value]) => !value || value.startsWith('test-'));

  if (missing.length > 0) {
    throw new Error(`Live Supabase env required: ${missing.map(([name]) => name).join(', ')}`);
  }
}

function createSupabaseClient(key: string, accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `wave10-schema-${randomUUID()}`,
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
  const email = `wave10-schema-${label}-${randomUUID()}@qrclaw.test`;
  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (createUserError || !createdUser.user) {
    throw new Error(`createUser failed: ${createUserError?.message ?? 'missing user'}`);
  }
  createdUserIds.push(createdUser.user.id);

  const owner = await insertSingle<{ id: string }>(
    'owners',
    {
      user_id: createdUser.user.id,
      email,
      display_name: `Wave 10 Owner ${label}`,
      plan: 'free',
    },
    'id'
  );
  createdOwnerIds.push(owner.id);

  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: OWNER_PASSWORD,
  });
  if (signInError || !session.session?.access_token) {
    throw new Error(`signIn failed: ${signInError?.message ?? 'missing token'}`);
  }

  return {
    userId: createdUser.user.id,
    ownerId: owner.id,
    client: createSupabaseClient(SUPABASE_ANON_KEY, session.session.access_token),
  };
}

async function createRuntime(ownerId: string, label: string): Promise<string> {
  const host = await insertSingle<{ id: string }>(
    'agent_hosts',
    {
      owner_id: ownerId,
      host_type: 'local',
      display_name: `wave10-host-${label}`,
      status: 'online',
    },
    'id'
  );
  const runtime = await insertSingle<{ id: string }>(
    'agent_runtimes',
    {
      owner_id: ownerId,
      host_id: host.id,
      runtime_type: `wave10-${label}`,
      display_name: `Wave 10 Runtime ${label}`,
      runtime_status: 'online',
      capabilities: { private_chat: true },
    },
    'id'
  );
  return runtime.id;
}

async function createAgent(ownerId: string, runtimeId: string, label: string): Promise<string> {
  const agent = await insertSingle<{ id: string }>(
    'agents',
    {
      owner_id: ownerId,
      runtime_id: runtimeId,
      name: `wave10-agent-${label}-${randomUUID()}`,
      api_key_hash: `wave10-agent-key-${label}-${randomUUID()}`,
      status: 'active',
      source: 'user_created',
    },
    'id'
  );
  return agent.id;
}

describe('Wave 10 runtime/session schema', () => {
  let ownerA: OwnerFixture;
  let ownerB: OwnerFixture;
  let runtimeA: string;
  let runtimeB: string;
  let agentA: string;

  beforeAll(async () => {
    requireLiveSupabaseEnv();
    ownerA = await createOwner('a');
    ownerB = await createOwner('b');
    runtimeA = await createRuntime(ownerA.ownerId, 'a');
    runtimeB = await createRuntime(ownerB.ownerId, 'b');
    agentA = await createAgent(ownerA.ownerId, runtimeA, 'a');
  }, 60000);

  afterAll(async () => {
    if (createdOwnerIds.length > 0) {
      await adminClient.from('owners').delete().in('id', createdOwnerIds);
    }
    await Promise.allSettled(
      createdUserIds.map((userId) => adminClient.auth.admin.deleteUser(userId))
    );
  }, 60000);

  it('creates runtime and session schema objects with RLS and compatibility view', async () => {
    const rows = await querySql<{
      runtime_rls: boolean;
      sessions_rls: boolean;
      compatibility_view_security_invoker: boolean;
      runtime_policy_count: number;
      session_policy_count: number;
    }>(`
      select
        (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'agent_runtimes') as runtime_rls,
        (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'owner_agent_sessions') as sessions_rls,
        exists (
          select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'owner_agent_conversations'
            and c.relkind = 'v'
            and c.reloptions @> array['security_invoker=true']
        ) as compatibility_view_security_invoker,
        (
          select count(*)::int
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'agent_runtimes'
            and p.polname like 'agent_runtimes_owner_%'
        ) as runtime_policy_count,
        (
          select count(*)::int
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'owner_agent_sessions'
            and p.polname like 'owner_agent_sessions_owner_%'
        ) as session_policy_count;
    `);

    expect(rows).toEqual([
      {
        runtime_rls: true,
        sessions_rls: true,
        compatibility_view_security_invoker: true,
        runtime_policy_count: 4,
        session_policy_count: 4,
      },
    ]);
  }, 60000);

  it('enforces owner-only RLS for runtimes and renamed sessions through the compatibility view', async () => {
    const { data: ownRuntime, error: ownRuntimeError } = await ownerA.client
      .from('agent_runtimes')
      .select('id')
      .eq('id', runtimeA);
    const { data: otherRuntime, error: otherRuntimeError } = await ownerA.client
      .from('agent_runtimes')
      .select('id')
      .eq('id', runtimeB);

    expect(ownRuntimeError).toBeNull();
    expect(ownRuntime).toEqual([{ id: runtimeA }]);
    expect(otherRuntimeError).toBeNull();
    expect(otherRuntime).toEqual([]);

    const session = await insertSingle<{ id: string }>(
      'owner_agent_sessions',
      {
        owner_id: ownerA.ownerId,
        agent_id: agentA,
        title: 'Wave 10 test chat',
        status: 'active',
        last_active_at: new Date().toISOString(),
      },
      'id'
    );

    const { data: ownSession, error: ownSessionError } = await ownerA.client
      .from('owner_agent_conversations')
      .select('id, title')
      .eq('id', session.id);
    const { data: otherSession, error: otherSessionError } = await ownerB.client
      .from('owner_agent_conversations')
      .select('id')
      .eq('id', session.id);

    expect(ownSessionError).toBeNull();
    expect(ownSession).toEqual([{ id: session.id, title: 'Wave 10 test chat' }]);
    expect(otherSessionError).toBeNull();
    expect(otherSession).toEqual([]);
  }, 60000);

  it('adds agents.runtime_id as a foreign key that nulls out on runtime deletion', async () => {
    const constraints = await querySql<{ confdeltype: string }>(`
      select confdeltype
      from pg_constraint
      where conrelid = 'public.agents'::regclass
        and conname = 'agents_runtime_id_fkey'
        and contype = 'f'
        and confrelid = 'public.agent_runtimes'::regclass;
    `);

    expect(constraints).toEqual([{ confdeltype: 'n' }]);

    const runtime = await createRuntime(ownerA.ownerId, 'fk');
    const agent = await createAgent(ownerA.ownerId, runtime, 'fk');
    const { error: deleteError } = await adminClient.from('agent_runtimes').delete().eq('id', runtime);
    expect(deleteError).toBeNull();

    const { data: updatedAgent, error: agentError } = await adminClient
      .from('agents')
      .select('runtime_id')
      .eq('id', agent)
      .single();

    expect(agentError).toBeNull();
    expect(updatedAgent?.runtime_id).toBeNull();
  }, 60000);
});
