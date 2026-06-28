import { createCipheriv, randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { encrypt } from '../../../gateway/src/crypto/envelope.js';

const PROJECT_ROOT = process.cwd().endsWith(`${path.sep}tests`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const QRCLAW_KEK_V1 = process.env.QRCLAW_KEK_V1 ?? '';

const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD || 'CHANGE_ME_TEST_PASSWORD';
const OWNER_MESSAGE = `owner-private-history-${randomUUID()}`;
const AGENT_MESSAGE = `agent-private-history-${randomUUID()}`;
const EVENT_ONE = `owner-private-event-one-${randomUUID()}`;
const EVENT_TWO = `owner-private-event-two-${randomUUID()}`;

interface OwnerFixture {
  ownerId: string;
  token: string;
}

interface SeededConversation {
  conversationId: string;
  runId: string;
  ownerMessageId: string;
  agentMessageId: string;
}

const createdUserIds: string[] = [];

function createSupabaseClient(key: string, accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `decrypted-owner-agent-chat-${randomUUID()}`,
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

function requireLiveSupabaseEnv(): void {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['QRCLAW_KEK_V1', QRCLAW_KEK_V1],
  ].filter(([, value]) => !value || value.startsWith('test-'));

  if (missing.length > 0) {
    throw new Error(`Live Supabase env required: ${missing.map(([name]) => name).join(', ')}`);
  }
}

async function createOwnerFixture(label: string): Promise<OwnerFixture> {
  const email = `decrypted-owner-agent-${label}-${randomUUID()}@qrclaw.test`;
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
      display_name: `Decrypted Owner ${label}`,
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

  return {
    ownerId: owner.id as string,
    token: session.session.access_token,
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

function wrapDekWithKek(rawDek: Buffer): string {
  const kek = Buffer.from(QRCLAW_KEK_V1, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const encrypted = Buffer.concat([cipher.update(rawDek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

async function encryptForOwnerAgentChat(plaintext: string, rawDek: Buffer) {
  const envelope = await encrypt(plaintext, `dek_${randomUUID()}`, rawDek);
  return {
    content_encrypted: envelope.ciphertext,
    encryption_meta: {
      iv: envelope.iv,
      tag: envelope.tag,
      algorithm: envelope.algorithm,
      dek_id: envelope.dekId,
    },
  };
}

async function seedOwnerAgentConversation(owner: OwnerFixture): Promise<SeededConversation> {
  const rawDek = randomBytes(32);
  const encryptedDek = wrapDekWithKek(rawDek);

  const agent = await insertSingle<{ id: string }>(
    'agents',
    {
      owner_id: owner.ownerId,
      name: `decrypted-agent-${randomUUID()}`,
      api_key_hash: `decrypted-agent-key-${randomUUID()}`,
      status: 'active',
      description: 'Decrypted owner private Edge Function test agent',
      suggested_prompts: ['Replay private history'],
      execution_mode: 'standard',
    },
    'id'
  );

  const host = await insertSingle<{ id: string }>(
    'agent_hosts',
    {
      owner_id: owner.ownerId,
      host_type: 'local',
      display_name: `decrypted-host-${randomUUID()}`,
      status: 'online',
    },
    'id'
  );

  await insertSingle<{ id: string }>(
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
      status: 'active',
      last_active_at: new Date().toISOString(),
    },
    'id'
  );

  await insertSingle<{ key_id: string }>(
    'owner_agent_conversation_keys',
    {
      conversation_id: conversation.id,
      key_data_encrypted: `\\x${Buffer.from(encryptedDek, 'utf8').toString('hex')}`,
      kek_version: 1,
      algorithm: 'aes-256-gcm',
      status: 'active',
    },
    'key_id'
  );

  const run = await insertSingle<{ id: string }>(
    'owner_agent_runs',
    {
      conversation_id: conversation.id,
      owner_id: owner.ownerId,
      agent_id: agent.id,
      host_id: host.id,
      provider: 'openclaw',
      status: 'running',
      started_at: new Date().toISOString(),
    },
    'id'
  );

  const ownerMessageEnvelope = await encryptForOwnerAgentChat(OWNER_MESSAGE, rawDek);
  const ownerMessage = await insertSingle<{ id: string }>(
    'owner_agent_messages',
    {
      conversation_id: conversation.id,
      owner_id: owner.ownerId,
      agent_id: agent.id,
      run_id: run.id,
      sender_type: 'owner',
      content_type: 'text',
      status: 'sent',
      created_at: '2026-04-27T01:00:00.000Z',
      ...ownerMessageEnvelope,
    },
    'id'
  );

  const agentMessageEnvelope = await encryptForOwnerAgentChat(AGENT_MESSAGE, rawDek);
  const agentMessage = await insertSingle<{ id: string }>(
    'owner_agent_messages',
    {
      conversation_id: conversation.id,
      owner_id: owner.ownerId,
      agent_id: agent.id,
      run_id: run.id,
      sender_type: 'agent',
      content_type: 'text',
      status: 'sent',
      created_at: '2026-04-27T01:01:00.000Z',
      ...agentMessageEnvelope,
    },
    'id'
  );

  const eventOneEnvelope = await encryptForOwnerAgentChat(EVENT_ONE, rawDek);
  await insertSingle<{ id: string }>(
    'owner_agent_run_events',
    {
      run_id: run.id,
      owner_id: owner.ownerId,
      seq: 1,
      type: 'text',
      metadata: { source: 'test' },
      created_at: '2026-04-27T01:01:01.000Z',
      ...eventOneEnvelope,
    },
    'id'
  );

  const eventTwoEnvelope = await encryptForOwnerAgentChat(EVENT_TWO, rawDek);
  await insertSingle<{ id: string }>(
    'owner_agent_run_events',
    {
      run_id: run.id,
      owner_id: owner.ownerId,
      seq: 2,
      type: 'text',
      metadata: { source: 'test' },
      created_at: '2026-04-27T01:01:02.000Z',
      ...eventTwoEnvelope,
    },
    'id'
  );

  return {
    conversationId: conversation.id,
    runId: run.id,
    ownerMessageId: ownerMessage.id,
    agentMessageId: agentMessage.id,
  };
}

async function callDecryptedMessages(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/decrypted-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const parsed = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

describe('decrypted-messages owner-private-agent-chat actor', () => {
  let ownerA: OwnerFixture;
  let ownerB: OwnerFixture;
  let seeded: SeededConversation;

  beforeAll(async () => {
    requireLiveSupabaseEnv();
    ownerA = await createOwnerFixture('a');
    ownerB = await createOwnerFixture('b');
    seeded = await seedOwnerAgentConversation(ownerA);
  }, 30000);

  afterAll(async () => {
    await Promise.all(createdUserIds.map((userId) => adminClient.auth.admin.deleteUser(userId)));
  }, 30000);

  it('reads decrypted owner agent conversation history for the owning owner', async () => {
    const response = await callDecryptedMessages(ownerA.token, {
      actor: 'owner-private-agent-chat',
      conversation_id: seeded.conversationId,
      limit: 10,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: seeded.agentMessageId,
        sender_type: 'agent',
        content: AGENT_MESSAGE,
      }),
      expect.objectContaining({
        id: seeded.ownerMessageId,
        sender_type: 'owner',
        content: OWNER_MESSAGE,
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain('content_encrypted');
  });

  it('denies cross-owner conversation history reads', async () => {
    const response = await callDecryptedMessages(ownerB.token, {
      actor: 'owner-private-agent-chat',
      conversation_id: seeded.conversationId,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'forbidden', message: 'Access denied' },
    });
  });

  it('reads run events by run_id and seq cursor for reload-during-stream', async () => {
    const response = await callDecryptedMessages(ownerA.token, {
      actor: 'owner-private-agent-chat',
      conversation_id: seeded.conversationId,
      include_events: true,
      run_id: seeded.runId,
      after_seq: 1,
      limit: 10,
    });

    expect(response.status).toBe(200);
    expect(response.body.events).toEqual([
      expect.objectContaining({
        run_id: seeded.runId,
        seq: 2,
        type: 'text',
        content: EVENT_TWO,
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain(EVENT_ONE);
  });

  it('keeps plaintext out of decrypted-messages source logging', () => {
    const source = readFileSync(
      path.join(PROJECT_ROOT, 'supabase/functions/decrypted-messages/index.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/console\.log/);
    expect(source).not.toMatch(/console\.(?:warn|error)\([^)]*(?:plaintext|content|body|raw)/s);
  });
});
