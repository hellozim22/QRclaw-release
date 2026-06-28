/**
 * Module K: Conversation
 * Tests conversation and message persistence in the database.
 *
 * NOTE: K-01 through K-03 test WS message persistence. Gateway's persistMessage()
 * is currently a TODO (only logs). These tests use test.fixme() to document
 * the expected behavior once the persist pipeline is complete.
 *
 * K-04 through K-07 test seeded DB records directly and are fully functional.
 */
import { test, expect } from '@playwright/test';
import { MockAgent, MockVisitor } from './mock-agent';
import {
  adminClient,
  getTestAuth,
  seedAgent,
  seedQRCode,
  seedConversation,
  getMessages,
  cleanupTestData,
} from './seed-data';

test.describe.serial('Module K: Conversation', () => {
  let userId: string;
  let agentId: string;
  let qrCodeId: string;
  let conversationId: string;
  let sessionToken: string;
  const connections: { close: () => void }[] = [];

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;
    const agent = await seedAgent(userId, `k-agent-${Date.now()}`);
    agentId = agent.id;
    const qrcode = await seedQRCode(agentId);
    qrCodeId = qrcode.id;
    const conv = await seedConversation(qrCodeId);
    conversationId = conv.id;
    sessionToken = conv.sessionToken;
  });

  test.afterAll(async () => {
    for (const conn of connections) {
      conn.close();
    }
    await cleanupTestData();
  });

  // K-01: After visitor sends message via WS, verify message exists in DB
  test('K-01: After visitor sends message via WS, message exists in DB', async () => {
    const visitor = new MockVisitor({ sessionToken, qrCodeId, agentId });
    connections.push(visitor);
    await visitor.connect();

    // Also connect an agent so the message gets routed (not just queued)
    const agent = new MockAgent({ agentId, qrCodeId });
    connections.push(agent);
    await agent.connect();

    visitor.sendMessage('Hello from visitor K-01');

    // Wait for persist pipeline (encrypt → upsert key → insert message)
    await new Promise((r) => setTimeout(r, 3000));

    const messages = await getMessages(conversationId);
    expect(messages.length).toBeGreaterThan(0);
  });

  // K-02: Message in DB has correct fields
  test('K-02: Message record has correct fields (encrypted content, role)', async () => {
    // Relies on K-01 having inserted a message
    const messages = await getMessages(conversationId);
    expect(messages.length).toBeGreaterThan(0);

    const msg = messages[0];
    expect(msg.conversation_id).toBe(conversationId);
    // content_encrypted is BYTEA — returned as hex string by PostgREST
    expect(msg.content_encrypted).toBeTruthy();
    expect(typeof msg.content_encrypted).toBe('string');
    // role should be 'visitor' (sent by visitor in K-01)
    expect(msg.role).toBeDefined();
    expect(['visitor', 'agent']).toContain(msg.role);
    // encryption_meta should contain iv, tag, algorithm
    expect(msg.encryption_meta).toBeDefined();
    expect(msg.encryption_meta.algorithm).toBe('aes-256-gcm');
    // encryption_key_id should be set (FK to encryption_keys)
    expect(msg.encryption_key_id).toBeTruthy();
  });

  // K-03: Multiple messages are ordered by timestamp
  test('K-03: Multiple messages in a conversation are ordered by sent_at', async () => {
    // Send a second message to ensure ordering can be tested
    const visitor = new MockVisitor({ sessionToken, qrCodeId, agentId });
    connections.push(visitor);
    await visitor.connect();

    visitor.sendMessage('Second message K-03');
    await new Promise((r) => setTimeout(r, 3000));

    const messages = await getMessages(conversationId);
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // getMessages returns ordered by sent_at ascending
    for (let i = 1; i < messages.length; i++) {
      const prev = new Date(messages[i - 1].sent_at).getTime();
      const curr = new Date(messages[i].sent_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  // K-04: Conversation record exists in DB after seeding
  test('K-04: Conversation record exists in DB after seeding', async () => {
    const { data, error } = await adminClient
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(conversationId);
    expect(data!.qrcode_id).toBe(qrCodeId);
  });

  // K-05: Conversation has session_token set
  test('K-05: Conversation has session_token set', async () => {
    const { data, error } = await adminClient
      .from('conversations')
      .select('session_token')
      .eq('id', conversationId)
      .single();

    expect(error).toBeNull();
    expect(data!.session_token).toBeTruthy();
  });

  // K-06: Conversation session_token matches the visitor's token
  test("K-06: Conversation session_token matches the visitor's session token", async () => {
    const { data, error } = await adminClient
      .from('conversations')
      .select('session_token')
      .eq('id', conversationId)
      .single();

    expect(error).toBeNull();
    expect(data!.session_token).toBe(sessionToken);
  });

  // K-07: Visitor session tracked via conversation record (no visitor_sessions table)
  test('K-07: Visitor session tracked via conversation session_token', async () => {
    // NOTE: visitor_sessions table does NOT exist in schema.
    // Visitor sessions are tracked via the conversations.session_token column.
    const { data, error } = await adminClient
      .from('conversations')
      .select('id, session_token, qrcode_id')
      .eq('session_token', sessionToken)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.session_token).toBe(sessionToken);
    expect(data!.qrcode_id).toBe(qrCodeId);
  });
});
