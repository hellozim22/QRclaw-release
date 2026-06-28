// Module C: Agent Register
// Tests agent CRUD operations via direct Supabase DB access (adminClient bypasses RLS).
// Edge Functions are NOT deployed — all assertions go through the database directly.

import { test, expect } from '@playwright/test';
import { adminClient, getTestAuth, seedAgent, cleanupTestData } from './seed-data';

test.describe.serial('Module C: Agent Register', () => {
  let userId: string;
  let ownerId: string;
  let agentId: string;
  let agentApiKeyHash: string;

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;

    const { data: owner } = await adminClient
      .from('owners')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!owner) throw new Error('Owner record not found — ensure getTestAuth() ran successfully');
    ownerId = owner.id;
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  // C-01: Create agent via DB and verify it exists
  test('C-01: Create agent via DB and verify it exists', async () => {
    const apiKeyHash = `test_hash_c01_${Date.now()}`;

    const { data, error } = await adminClient
      .from('agents')
      .insert({
        name: 'test-agent-c01',
        owner_id: ownerId,
        status: 'active',
        api_key_hash: apiKeyHash,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.id).toBeTruthy();

    agentId = data.id;
    agentApiKeyHash = data.api_key_hash;

    // Verify record exists by fetching it back
    const { data: fetched } = await adminClient
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .single();

    expect(fetched?.id).toBe(agentId);
  });

  // C-02: Agent record has correct fields (name, description, status=active)
  test('C-02: Agent record has correct fields', async () => {
    const { data, error } = await adminClient
      .from('agents')
      .select('name, status')
      .eq('id', agentId)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe('test-agent-c01');
    expect(data?.status).toBe('active');
  });

  // C-03: API key hash is stored
  test('C-03: API key hash is stored', async () => {
    const { data, error } = await adminClient
      .from('agents')
      .select('api_key_hash')
      .eq('id', agentId)
      .single();

    expect(error).toBeNull();
    expect(data?.api_key_hash).toBeTruthy();
    expect(data?.api_key_hash).toBe(agentApiKeyHash);
  });

  // C-04: Cannot create agent without required fields (name + owner_id)
  test('C-04: Cannot create agent without required fields', async () => {
    const { data, error } = await adminClient
      .from('agents')
      .insert({
        status: 'active',
        api_key_hash: `test_hash_c04_${Date.now()}`,
      } as Parameters<typeof adminClient.from>[0] extends never ? never : Record<string, unknown>)
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  // C-05: Agent belongs to correct owner
  test('C-05: Agent belongs to correct owner', async () => {
    const { data, error } = await adminClient
      .from('agents')
      .select('owner_id')
      .eq('id', agentId)
      .single();

    expect(error).toBeNull();
    expect(data?.owner_id).toBe(ownerId);
  });

  // C-06: List agents for an owner
  test('C-06: List agents for an owner', async () => {
    const extra = await seedAgent(userId, 'test-agent-c06');

    const { data, error } = await adminClient
      .from('agents')
      .select('id, name')
      .eq('owner_id', ownerId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const ids = data!.map((a) => a.id);
    expect(ids).toContain(agentId);
    expect(ids).toContain(extra.id);
  });

  // C-07: Agent status transitions (active → suspended)
  test('C-07: Agent status transitions (active → suspended)', async () => {
    const { data: suspended, error: suspendErr } = await adminClient
      .from('agents')
      .update({ status: 'suspended' })
      .eq('id', agentId)
      .select('status')
      .single();

    expect(suspendErr).toBeNull();
    expect(suspended?.status).toBe('suspended');

    // Restore to active
    const { data: restored, error: restoreErr } = await adminClient
      .from('agents')
      .update({ status: 'active' })
      .eq('id', agentId)
      .select('status')
      .single();

    expect(restoreErr).toBeNull();
    expect(restored?.status).toBe('active');
  });

  // C-08: Duplicate agent name allowed (different owners)
  test('C-08: Duplicate agent name allowed (different owners)', async () => {
    const SECOND_EMAIL = 'acceptance-test-2@qrclaw.ai';
    let secondUserId: string;

    // Ensure second auth user exists
    const { data: adminData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
    const existing = adminData?.users?.find((u: { email?: string }) => u.email === SECOND_EMAIL);

    if (existing) {
      secondUserId = existing.id;
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: SECOND_EMAIL,
        password: process.env.TEST_OWNER_PASSWORD || 'CHANGE_ME_TEST_PASSWORD',
        email_confirm: true,
      });
      if (createErr) throw new Error(`Failed to create second test user: ${createErr.message}`);
      secondUserId = created.user!.id;
    }

    // Ensure owner record exists for second user
    let secondOwnerId: string;
    const { data: existingOwner } = await adminClient
      .from('owners')
      .select('id')
      .eq('user_id', secondUserId)
      .single();

    if (existingOwner) {
      secondOwnerId = existingOwner.id;
    } else {
      const { data: newOwner, error: ownerErr } = await adminClient
        .from('owners')
        .insert({
          user_id: secondUserId,
          email: SECOND_EMAIL,
          display_name: 'Test Owner 2',
          plan: 'free',
        })
        .select('id')
        .single();

      if (ownerErr) throw new Error(`Failed to create second owner: ${ownerErr.message}`);
      secondOwnerId = newOwner!.id;
    }

    // Create agent with same name under second owner — should succeed
    const { data, error } = await adminClient
      .from('agents')
      .insert({
        name: 'test-agent-c01',
        owner_id: secondOwnerId,
        status: 'active',
        api_key_hash: `test_hash_c08_${Date.now()}`,
      })
      .select('id, name, owner_id')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.name).toBe('test-agent-c01');
    expect(data!.owner_id).toBe(secondOwnerId);
    expect(data!.owner_id).not.toBe(ownerId);
  });
});
