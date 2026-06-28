/**
 * Seed data utilities for acceptance testing.
 * Uses Supabase service_role key for direct DB access (bypasses RLS).
 *
 * DB Schema (from 20260312_init_schema.sql):
 *   agents: id, owner_id, name, api_key_hash, status, ws_connected, last_seen_at
 *   qrcodes: id, agent_id, slug (UNIQUE, min 12 chars), status, profile, system_prompt, ...
 *   conversations: id, qrcode_id, session_token, message_count, last_active_at
 *   messages: id, conversation_id, content_encrypted, encryption_key_id, encryption_meta, role, idempotency_key, message_id, sent_at
 *   owners: id, user_id, display_name, email, locale, plan
 *   NOTE: visitor_sessions table does NOT exist in schema.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zyxqadubhwrnsoujiyir.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[seed-data] SUPABASE_SERVICE_ROLE_KEY not set — acceptance tests will fail');
}

// Admin client (bypasses RLS)
export const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (for auth operations)
export const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };

// ─── Test User ─────────────────────────────────────────────────

const TEST_EMAIL = process.env.TEST_EMAIL || 'acceptance-test@qrclaw.ai';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123XYZ';

let cachedAuthToken: string | null = null;
let cachedUserId: string | null = null;

/**
 * Create a test user via Admin API (bypasses email validation) and
 * sign in to get a session token. Caches the result for reuse.
 */
export async function getTestAuth(): Promise<{ token: string; userId: string; email: string }> {
  if (cachedAuthToken && cachedUserId) {
    return { token: cachedAuthToken, userId: cachedUserId, email: TEST_EMAIL };
  }

  // Ensure user exists via Admin API (idempotent)
  const { data: adminData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 50 });
  const existingUser = adminData?.users?.find((u: { email?: string }) => u.email === TEST_EMAIL);

  if (!existingUser) {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw new Error(`Admin createUser failed: ${createErr.message}`);
    cachedUserId = created.user?.id || '';
  } else {
    cachedUserId = existingUser.id;
  }

  // Sign in with password to get session token
  const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (loginError) throw new Error(`Auth login failed: ${loginError.message}`);

  cachedAuthToken = loginData.session?.access_token || '';
  cachedUserId = loginData.user?.id || '';

  // Ensure owner record exists
  if (cachedUserId) {
    await ensureOwnerRecord(cachedUserId, TEST_EMAIL);
  }

  return { token: cachedAuthToken!, userId: cachedUserId!, email: TEST_EMAIL };
}

/**
 * Ensure an owner record exists for the given user.
 *
 * Wave 10 B2: the `on_auth_user_created` trigger on auth.users now inserts
 * the owners row automatically. We still call upsert (ON CONFLICT user_id
 * DO NOTHING) so acceptance seeding works against older databases that
 * predate the trigger, and so re-runs are idempotent.
 */
async function ensureOwnerRecord(userId: string, email: string): Promise<void> {
  await adminClient
    .from('owners')
    .upsert(
      {
        user_id: userId,
        email,
        display_name: 'Test Owner',
        plan: 'free',
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
}

// ─── Agent Seeding ─────────────────────────────────────────────

export interface SeededAgent {
  id: string;
  name: string;
  apiKeyHash: string;
  ownerId: string;
}

/**
 * Create a test agent directly in the database.
 * Schema: agents(id, owner_id, name, api_key_hash, status, ws_connected, last_seen_at)
 */
export async function seedAgent(ownerId: string, name?: string): Promise<SeededAgent> {
  const agentName = name || `test-agent-${Date.now()}`;

  // Get owner's DB ID
  const { data: owner } = await adminClient
    .from('owners')
    .select('id')
    .eq('user_id', ownerId)
    .single();

  if (!owner) throw new Error('Owner not found');

  const { data, error } = await adminClient
    .from('agents')
    .insert({
      name: agentName,
      owner_id: owner.id,
      status: 'active',
      api_key_hash: `test_hash_${Date.now()}`,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to seed agent: ${error.message}`);

  return {
    id: data.id,
    name: data.name,
    apiKeyHash: data.api_key_hash,
    ownerId: owner.id,
  };
}

// ─── QRCode Seeding ────────────────────────────────────────────

export interface SeededQRCode {
  id: string;
  slug: string;
  agentId: string;
  status: string;
}

/**
 * Create a test QR code directly in the database.
 * Schema: qrcodes(id, agent_id, slug UNIQUE min 12 chars, status, profile JSONB, ...)
 * Default status in DB is 'draft'. Slug must be >= 12 characters.
 */
export async function seedQRCode(
  agentId: string,
  slug?: string,
  status: string = 'active'
): Promise<SeededQRCode> {
  // Ensure slug is at least 12 characters
  const qrSlug = slug || `test-qrcode-${Date.now().toString(36)}`;
  const paddedSlug = qrSlug.length < 12 ? qrSlug + '-'.repeat(12 - qrSlug.length) : qrSlug;

  const { data, error } = await adminClient
    .from('qrcodes')
    .insert({
      agent_id: agentId,
      slug: paddedSlug,
      status,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to seed QRCode: ${error.message}`);

  return {
    id: data.id,
    slug: data.slug,
    agentId: data.agent_id,
    status: data.status,
  };
}

// ─── Conversation Seeding ──────────────────────────────────────

export interface SeededConversation {
  id: string;
  qrCodeId: string;
  sessionToken: string;
}

/**
 * Create a test conversation.
 * Schema: conversations(id, qrcode_id, session_token, message_count, last_active_at)
 * NOTE: visitor_sessions table does NOT exist. Only conversations are created.
 */
export async function seedConversation(qrCodeId: string): Promise<SeededConversation> {
  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Create conversation (no visitor_sessions table in schema)
  const { data, error } = await adminClient
    .from('conversations')
    .insert({
      qrcode_id: qrCodeId,
      session_token: sessionToken,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to seed conversation: ${error.message}`);

  return {
    id: data.id,
    qrCodeId,
    sessionToken,
  };
}

// ─── Cleanup ───────────────────────────────────────────────────

/**
 * Clean up all test data created during this test run.
 * Delete in order respecting foreign keys: messages → conversations → qrcodes → agents
 */
export async function cleanupTestData(): Promise<void> {
  // First, find all test conversations (by session_token pattern)
  const { data: testConvs } = await adminClient
    .from('conversations')
    .select('id')
    .like('session_token', 'sess_%');

  // Delete messages belonging to test conversations (WS-created messages
  // have system-generated idempotency_keys that don't match 'test%')
  if (testConvs && testConvs.length > 0) {
    const convIds = testConvs.map((c: { id: string }) => c.id);
    await adminClient.from('messages').delete().in('conversation_id', convIds);
  }

  // Also delete any messages with test-prefixed idempotency keys (belt & suspenders)
  await adminClient.from('messages').delete().like('idempotency_key', 'test%');
  // Conversations with test session tokens
  await adminClient.from('conversations').delete().like('session_token', 'sess_%');
  // QR codes with test slugs
  await adminClient.from('qrcodes').delete().like('slug', 'test-%');
  // Agents with test API key hashes
  await adminClient.from('agents').delete().like('api_key_hash', 'test_hash_%');
}

// ─── Direct DB Queries ─────────────────────────────────────────

/**
 * Query messages for a conversation (encrypted, from DB).
 * Messages schema: id, conversation_id, content_encrypted, encryption_key_id, encryption_meta, role, idempotency_key, message_id, sent_at
 */
export async function getMessages(conversationId: string) {
  const { data } = await adminClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true });
  return data || [];
}

/**
 * Query conversations for a QR code.
 */
export async function getConversations(qrCodeId: string) {
  const { data } = await adminClient
    .from('conversations')
    .select('*')
    .eq('qrcode_id', qrCodeId)
    .order('created_at', { ascending: true });
  return data || [];
}

/**
 * Check if a table has RLS enabled.
 */
export async function checkRLS(tableName: string): Promise<boolean> {
  const { data } = await adminClient.rpc('check_rls_enabled', { table_name: tableName });
  return !!data;
}
