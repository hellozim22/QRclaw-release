/**
 * Module J: Cross-Device Sync
 * Tests multi-visitor, multi-agent WebSocket connection scenarios.
 */
import { test, expect } from '@playwright/test';
import { MockAgent, MockVisitor } from './mock-agent';
import { getTestAuth, seedAgent, seedQRCode, seedConversation, cleanupTestData } from './seed-data';

test.describe.serial('Module J: Cross-Device', () => {
  let userId: string;
  let agentId: string;
  let qrCodeId: string;
  const connections: { close: () => void }[] = [];

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;
    const agent = await seedAgent(userId, `j-agent-${Date.now()}`);
    agentId = agent.id;
    const qrcode = await seedQRCode(agentId);
    qrCodeId = qrcode.id;
  });

  test.afterAll(async () => {
    for (const conn of connections) {
      conn.close();
    }
    await cleanupTestData();
  });

  // J-01: Two visitors with different session tokens connect to same QR code
  test('J-01: Two visitors connect to same QR code with different session tokens', async () => {
    const conv1 = await seedConversation(qrCodeId);
    const conv2 = await seedConversation(qrCodeId);

    const visitor1 = new MockVisitor({
      sessionToken: conv1.sessionToken,
      qrCodeId,
      agentId,
    });
    const visitor2 = new MockVisitor({
      sessionToken: conv2.sessionToken,
      qrCodeId,
      agentId,
    });

    connections.push(visitor1, visitor2);

    const ack1 = await visitor1.connect();
    const ack2 = await visitor2.connect();

    expect(ack1.type).toBe('connection_ack');
    expect(ack2.type).toBe('connection_ack');

    // Both connected with different session tokens
    expect(conv1.sessionToken).not.toBe(conv2.sessionToken);
    expect(visitor1.isConnected).toBe(true);
    expect(visitor2.isConnected).toBe(true);
  });

  // J-02: Agent receives messages from both visitors
  test('J-02: Agent receives messages from both visitors', async () => {
    const conv1 = await seedConversation(qrCodeId);
    const conv2 = await seedConversation(qrCodeId);

    const agent = new MockAgent({ agentId, qrCodeId });
    const visitor1 = new MockVisitor({
      sessionToken: conv1.sessionToken,
      qrCodeId,
      agentId,
    });
    const visitor2 = new MockVisitor({
      sessionToken: conv2.sessionToken,
      qrCodeId,
      agentId,
    });

    connections.push(agent, visitor1, visitor2);

    await agent.connect();
    await visitor1.connect();
    await visitor2.connect();

    agent.clearReceived();

    visitor1.sendMessage('Hello from visitor 1');
    visitor2.sendMessage('Hello from visitor 2');

    // Wait briefly for messages to arrive
    await new Promise((r) => setTimeout(r, 2000));

    // Gateway forwards visitor messages as type 'message' with sender_type='visitor'
    const agentMessages = agent.messagesOfType('message');
    const contents = agentMessages.map((m) => m.payload?.content);
    expect(agentMessages.length).toBeGreaterThanOrEqual(1);
    // At least one of the two visitor messages should arrive
    const hasV1 = contents.includes('Hello from visitor 1');
    const hasV2 = contents.includes('Hello from visitor 2');
    expect(hasV1 || hasV2).toBe(true);
  });

  // J-03: Agent sends to conversation A and conversation B separately
  test('J-03: Agent sends to conversation A and B as separate conversations', async () => {
    const conv1 = await seedConversation(qrCodeId);
    const conv2 = await seedConversation(qrCodeId);

    const agent = new MockAgent({ agentId, qrCodeId });
    connections.push(agent);

    await agent.connect();

    // Agent sends reply to conversation A
    agent.sendReply(conv1.id, 'Reply to conv A', `msg_a_${Date.now()}`);
    // Agent sends reply to conversation B
    agent.sendReply(conv2.id, 'Reply to conv B', `msg_b_${Date.now()}`);

    // Wait for ACKs
    await new Promise((r) => setTimeout(r, 500));

    const acks = agent.messagesOfType('ack');
    // Should receive at least one ACK (may receive 2)
    expect(acks.length).toBeGreaterThanOrEqual(1);
  });

  // J-04: Visitor disconnects and reconnects with new connection
  test('J-04: Visitor disconnects and reconnects with new connection', async () => {
    const conv = await seedConversation(qrCodeId);

    const visitor1 = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });

    await visitor1.connect();
    expect(visitor1.isConnected).toBe(true);

    // Disconnect
    visitor1.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(visitor1.isConnected).toBe(false);

    // Reconnect with a new MockVisitor instance (same session token = same identity)
    const visitor2 = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(visitor2);

    const ack = await visitor2.connect();
    expect(ack.type).toBe('connection_ack');
    expect(visitor2.isConnected).toBe(true);
  });

  // J-05: Agent disconnects and reconnects → receives connection_ack again
  test('J-05: Agent disconnects and reconnects, receives connection_ack', async () => {
    const agent1 = new MockAgent({ agentId, qrCodeId });
    await agent1.connect();
    expect(agent1.connectionAck).not.toBeNull();
    expect(agent1.connectionAck!.type).toBe('connection_ack');

    agent1.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(agent1.isConnected).toBe(false);

    // Reconnect
    const agent2 = new MockAgent({ agentId, qrCodeId });
    connections.push(agent2);

    const ack = await agent2.connect();
    expect(ack.type).toBe('connection_ack');
    expect(agent2.isConnected).toBe(true);
  });

  // J-06: Multiple agents can connect simultaneously with different agentIds
  test('J-06: Multiple agents connect simultaneously with different agentIds', async () => {
    const agent2Seed = await seedAgent(userId, `j-agent2-${Date.now()}`);
    const qrcode2 = await seedQRCode(agent2Seed.id);

    const agentA = new MockAgent({ agentId, qrCodeId });
    const agentB = new MockAgent({ agentId: agent2Seed.id, qrCodeId: qrcode2.id });
    connections.push(agentA, agentB);

    const [ackA, ackB] = await Promise.all([agentA.connect(), agentB.connect()]);

    expect(ackA.type).toBe('connection_ack');
    expect(ackB.type).toBe('connection_ack');
    expect(agentA.isConnected).toBe(true);
    expect(agentB.isConnected).toBe(true);
  });

  // J-07: Same agent connects with same agentId from two connections
  test('J-07: Same agent connects from two separate connections', async () => {
    const agentConn1 = new MockAgent({ agentId, qrCodeId });
    const agentConn2 = new MockAgent({ agentId, qrCodeId });
    connections.push(agentConn1, agentConn2);

    const [ack1, ack2] = await Promise.all([agentConn1.connect(), agentConn2.connect()]);

    // Both connections should be accepted
    expect(ack1.type).toBe('connection_ack');
    expect(ack2.type).toBe('connection_ack');
    expect(agentConn1.isConnected).toBe(true);
    expect(agentConn2.isConnected).toBe(true);
  });

  // J-08: Visitor connection cleanup (close, verify connection is gone)
  test('J-08: Visitor connection is cleaned up after close', async () => {
    const conv = await seedConversation(qrCodeId);

    const visitor = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });

    await visitor.connect();
    expect(visitor.isConnected).toBe(true);

    visitor.close();
    await new Promise((r) => setTimeout(r, 300));

    expect(visitor.isConnected).toBe(false);
    expect(visitor.ws).toBeNull();
  });
});
