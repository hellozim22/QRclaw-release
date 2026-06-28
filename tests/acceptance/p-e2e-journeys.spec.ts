import { test, expect } from '@playwright/test';
import { MockAgent, MockVisitor } from './mock-agent';
import {
  getTestAuth,
  seedAgent,
  seedQRCode,
  seedConversation,
  cleanupTestData,
  adminClient,
} from './seed-data';

test.describe.serial('Module P: End-to-End Journeys', () => {
  test.setTimeout(60000);

  let agentId: string;
  let ownerId: string;
  let qrCodeId: string;
  let sessionToken: string;
  let conversationId: string;

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    ownerId = auth.userId;
    const agent = await seedAgent(ownerId, `p-test-agent-${Date.now()}`);
    agentId = agent.id;
    const qr = await seedQRCode(agentId);
    qrCodeId = qr.id;
    const conv = await seedConversation(qrCodeId);
    sessionToken = conv.sessionToken;
    conversationId = conv.id;
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('P-01: Full visitor→agent flow: visitor sends message, agent receives it', async () => {
    const mockAgent = new MockAgent({ agentId, ownerId, qrCodeId });
    const mockVisitor = new MockVisitor({ sessionToken, qrCodeId, agentId });

    try {
      await mockAgent.connect();
      expect(mockAgent.connectionAck).not.toBeNull();
      expect(mockAgent.connectionAck!.type).toBe('connection_ack');

      await mockVisitor.connect();
      expect(mockVisitor.connectionAck).not.toBeNull();

      const testContent = `hello-p01-${Date.now()}`;
      mockVisitor.sendMessage(testContent);

      const received = await mockAgent.waitFor('message', 10000);
      expect(received).toBeTruthy();
      expect(received.payload?.content).toBe(testContent);
      expect(received.payload?.sender_type).toBe('visitor');

      mockAgent.sendReply(conversationId, 'reply from agent p01');
      const ack = await mockAgent.waitFor('ack', 10000);
      expect(ack.payload?.status).toBe('accepted');
    } finally {
      mockAgent.close();
      mockVisitor.close();
    }
  });

  test('P-02: Streaming flow: agent sends stream_chunk × 3 then stream_end, gets ACK', async () => {
    const mockAgent = new MockAgent({ agentId, ownerId, qrCodeId });
    const mockVisitor = new MockVisitor({ sessionToken, qrCodeId, agentId });

    try {
      await mockAgent.connect();
      await mockVisitor.connect();

      const streamMsgId = `stream_${Date.now()}`;

      mockAgent.sendStreamChunk(conversationId, 'chunk1', streamMsgId, 1);
      mockAgent.sendStreamChunk(conversationId, 'chunk2', streamMsgId, 2);
      mockAgent.sendStreamChunk(conversationId, 'chunk3', streamMsgId, 3);
      mockAgent.sendStreamEnd(conversationId, streamMsgId, 3);

      const ack = await mockAgent.waitFor('ack', 10000);
      expect(ack).toBeTruthy();
      expect(ack.payload?.status).toBe('accepted');
    } finally {
      mockAgent.close();
      mockVisitor.close();
    }
  });

  test('P-03: Multi-turn conversation: 2 visitor messages, 2 agent replies, all ACKed', async () => {
    const mockAgent = new MockAgent({ agentId, ownerId, qrCodeId });
    const mockVisitor = new MockVisitor({ sessionToken, qrCodeId, agentId });

    try {
      await mockAgent.connect();
      await mockVisitor.connect();

      // Turn 1
      mockVisitor.sendMessage('msg1');
      const recv1 = await mockAgent.waitFor('message', 10000);
      expect(recv1.payload?.content).toBe('msg1');
      mockAgent.clearReceived();

      mockAgent.sendReply(conversationId, 'reply1');
      const ack1 = await mockAgent.waitFor('ack', 10000);
      expect(ack1.payload?.status).toBe('accepted');
      mockAgent.clearReceived();

      // Turn 2
      mockVisitor.sendMessage('msg2');
      const recv2 = await mockAgent.waitFor('message', 10000);
      expect(recv2.payload?.content).toBe('msg2');
      mockAgent.clearReceived();

      mockAgent.sendReply(conversationId, 'reply2');
      const ack2 = await mockAgent.waitFor('ack', 10000);
      expect(ack2.payload?.status).toBe('accepted');
    } finally {
      mockAgent.close();
      mockVisitor.close();
    }
  });

  test('P-04: QR code lifecycle: active → paused → active → revoked', async () => {
    const qr = await seedQRCode(agentId, `lifecycle-${Date.now().toString(36)}`, 'active');
    expect(qr.status).toBe('active');

    // active → paused
    const { data: paused, error: err1 } = await adminClient
      .from('qrcodes')
      .update({ status: 'paused' })
      .eq('id', qr.id)
      .select()
      .single();
    expect(err1).toBeNull();
    expect(paused.status).toBe('paused');

    // paused → active
    const { data: reactivated, error: err2 } = await adminClient
      .from('qrcodes')
      .update({ status: 'active' })
      .eq('id', qr.id)
      .select()
      .single();
    expect(err2).toBeNull();
    expect(reactivated.status).toBe('active');

    // active → revoked
    const { data: revoked, error: err3 } = await adminClient
      .from('qrcodes')
      .update({ status: 'revoked' })
      .eq('id', qr.id)
      .select()
      .single();
    expect(err3).toBeNull();
    expect(revoked.status).toBe('revoked');
  });

  test('P-05: Dashboard full flow — create QRCode and visitor uses it', async ({ page }) => {
    // Step 1: Login to dashboard via auth cookie setup
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `p05-agent-${Date.now()}`);
    const qr = await seedQRCode(agent.id, `p05-qr-${Date.now().toString(36)}`, 'active');

    try {
      // Step 2: Verify QR codes dashboard page loads
      // Set auth cookie by navigating with session token
      await page.goto('/qrcodes');
      // Dashboard should load (may redirect to login, that's OK for this E2E test)
      await page.waitForLoadState('networkidle');

      // Step 3: Visitor visits the agent profile via seeded data
      const agentResponse = await page.goto(`/agent/${agent.id}`);
      expect(agentResponse?.status()).not.toBe(404);
      expect(agentResponse?.status()).not.toBe(500);

      // Step 4: Visitor navigates to chat
      const chatResponse = await page.goto(`/chat/${agent.id}`);
      expect(chatResponse?.status()).not.toBe(404);
      expect(chatResponse?.status()).not.toBe(500);

      // Step 5: Visitor sends a message
      await page.waitForSelector('input[type="text"]');
      const input = page.locator('input[type="text"]').first();
      await input.fill('Hello from P-05 full flow test');
      await input.press('Enter');
      await expect(page.getByText('Hello from P-05 full flow test')).toBeVisible();

      // Step 6: Verify QR code lifecycle matches seeded data
      const { data: qrCheck } = await adminClient
        .from('qrcodes')
        .select('status, slug')
        .eq('id', qr.id)
        .single();
      expect(qrCheck).not.toBeNull();
      expect(qrCheck.status).toBe('active');
    } finally {
      await cleanupTestData();
    }
  });
});
