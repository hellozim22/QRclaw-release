// Module E: QRCode CRUD
// Tests QR code CRUD operations via direct Supabase DB access (adminClient bypasses RLS).
// Edge Functions are NOT deployed — all assertions go through the database directly.

import { test, expect } from '@playwright/test';
import { adminClient, getTestAuth, seedAgent, seedQRCode, cleanupTestData } from './seed-data';

test.describe.serial('Module E: QRCode CRUD', () => {
  let userId: string;
  let agentId: string;
  let qrCodeId: string;
  let qrSlug: string;

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;

    const seeded = await seedAgent(userId, 'test-agent-e2e-qr');
    agentId = seeded.id;
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  // E-01: Create QR code and verify record
  test('E-01: Create QR code and verify record', async () => {
    qrSlug = `test-e01-${Date.now().toString(36)}`;

    const { data, error } = await adminClient
      .from('qrcodes')
      .insert({
        agent_id: agentId,
        slug: qrSlug,
        status: 'active',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBeTruthy();

    qrCodeId = data!.id;

    // Verify record can be fetched back
    const { data: fetched } = await adminClient
      .from('qrcodes')
      .select('id')
      .eq('id', qrCodeId)
      .single();

    expect(fetched?.id).toBe(qrCodeId);
  });

  // E-02: QR code has correct fields (slug, agent_id, status=active)
  test('E-02: QR code has correct fields', async () => {
    const { data, error } = await adminClient
      .from('qrcodes')
      .select('slug, agent_id, status')
      .eq('id', qrCodeId)
      .single();

    expect(error).toBeNull();
    expect(data?.slug).toBe(qrSlug);
    expect(data?.agent_id).toBe(agentId);
    expect(data?.status).toBe('active');
  });

  // E-03: List QR codes for an agent
  test('E-03: List QR codes for an agent', async () => {
    const extra = await seedQRCode(agentId, `test-e03-${Date.now().toString(36)}`);

    const { data, error } = await adminClient
      .from('qrcodes')
      .select('id, slug')
      .eq('agent_id', agentId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const ids = data!.map((q) => q.id);
    expect(ids).toContain(qrCodeId);
    expect(ids).toContain(extra.id);
  });

  // E-04: Update QR code status to paused
  test('E-04: Update QR code status to paused', async () => {
    const { data, error } = await adminClient
      .from('qrcodes')
      .update({ status: 'paused' })
      .eq('id', qrCodeId)
      .select('status')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('paused');
  });

  // E-05: Update QR code status back to active
  test('E-05: Update QR code status back to active', async () => {
    const { data, error } = await adminClient
      .from('qrcodes')
      .update({ status: 'active' })
      .eq('id', qrCodeId)
      .select('status')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('active');
  });

  // E-06: Revoke QR code (status=revoked)
  test('E-06: Revoke QR code (status=revoked)', async () => {
    const toRevoke = await seedQRCode(agentId, `test-e06-${Date.now().toString(36)}`);

    const { data, error } = await adminClient
      .from('qrcodes')
      .update({ status: 'revoked' })
      .eq('id', toRevoke.id)
      .select('status')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('revoked');
  });

  // E-07: Delete QR code
  test('E-07: Delete QR code', async () => {
    const toDelete = await seedQRCode(agentId, `test-e07-${Date.now().toString(36)}`);

    const { error } = await adminClient.from('qrcodes').delete().eq('id', toDelete.id);

    expect(error).toBeNull();

    const { data } = await adminClient.from('qrcodes').select('id').eq('id', toDelete.id).single();

    expect(data).toBeNull();
  });

  // E-08: QR code belongs to correct agent
  test('E-08: QR code belongs to correct agent', async () => {
    const { data, error } = await adminClient
      .from('qrcodes')
      .select('agent_id')
      .eq('id', qrCodeId)
      .single();

    expect(error).toBeNull();
    expect(data?.agent_id).toBe(agentId);
  });

  // E-09: Cannot create QR code for non-existent agent (FK constraint)
  test('E-09: Cannot create QR code for non-existent agent', async () => {
    const fakeAgentId = '00000000-0000-0000-0000-000000000000';

    const { data, error } = await adminClient
      .from('qrcodes')
      .insert({
        agent_id: fakeAgentId,
        slug: `test-e09-${Date.now().toString(36)}`,
        status: 'active',
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  // E-10: Duplicate slug rejected (unique constraint)
  test('E-10: Duplicate slug rejected (unique constraint)', async () => {
    // qrSlug from E-01 already exists
    const { data, error } = await adminClient
      .from('qrcodes')
      .insert({
        agent_id: agentId,
        slug: qrSlug,
        status: 'active',
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  // E-11: QR code system_prompt can be updated
  test('E-11: QR code system_prompt can be updated', async () => {
    const newPrompt = 'Updated system prompt for testing';

    const { data, error } = await adminClient
      .from('qrcodes')
      .update({ system_prompt: newPrompt })
      .eq('id', qrCodeId)
      .select('system_prompt')
      .single();

    expect(error).toBeNull();
    expect(data?.system_prompt).toBe(newPrompt);
  });

  // E-12: Get QR code by slug
  test('E-12: Get QR code by slug', async () => {
    const { data, error } = await adminClient
      .from('qrcodes')
      .select('id, slug, agent_id')
      .eq('slug', qrSlug)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(qrCodeId);
    expect(data?.slug).toBe(qrSlug);
    expect(data?.agent_id).toBe(agentId);
  });

  // E-13: Filter QR codes by status
  test('E-13: Filter QR codes by status', async () => {
    const pausedQR = await seedQRCode(
      agentId,
      `test-e13-paused-${Date.now().toString(36)}`,
      'paused'
    );
    const activeQR = await seedQRCode(
      agentId,
      `test-e13-active-${Date.now().toString(36)}`,
      'active'
    );

    const { data: activeResults, error: activeErr } = await adminClient
      .from('qrcodes')
      .select('id, status')
      .eq('agent_id', agentId)
      .eq('status', 'active');

    expect(activeErr).toBeNull();
    const activeIds = activeResults!.map((q) => q.id);
    expect(activeIds).toContain(activeQR.id);
    expect(activeIds).not.toContain(pausedQR.id);

    const { data: pausedResults, error: pausedErr } = await adminClient
      .from('qrcodes')
      .select('id, status')
      .eq('agent_id', agentId)
      .eq('status', 'paused');

    expect(pausedErr).toBeNull();
    const pausedIds = pausedResults!.map((q) => q.id);
    expect(pausedIds).toContain(pausedQR.id);
    expect(pausedIds).not.toContain(activeQR.id);
  });
});
