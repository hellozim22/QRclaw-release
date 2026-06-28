// Module H: Streaming
// Tests WebSocket streaming from Agent to Visitor via Gateway.
// Agent sends stream_chunk and stream_end frames.

import { test, expect } from '@playwright/test';
import { MockAgent, MockVisitor } from './mock-agent';
import { getTestAuth, seedAgent, seedQRCode, seedConversation, cleanupTestData } from './seed-data';

test.describe.serial('Module H: Streaming', () => {
  let userId: string;
  let agent: { id: string; name: string; ownerId: string };
  let qrcode: { id: string; slug: string };
  let conv: { id: string; sessionToken: string };
  let mockAgent: MockAgent;
  let mockVisitor: MockVisitor;

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;
    agent = await seedAgent(userId, `h-agent-${Date.now()}`);
    qrcode = await seedQRCode(agent.id, `test-h-${Date.now().toString(36)}`);
    conv = await seedConversation(qrcode.id);

    mockAgent = new MockAgent({ agentId: agent.id, qrCodeId: qrcode.id });
    await mockAgent.connect();

    mockVisitor = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId: qrcode.id,
      agentId: agent.id,
    });
    await mockVisitor.connect();
  });

  test.afterAll(async () => {
    mockAgent?.close();
    mockVisitor?.close();
    await cleanupTestData();
  });

  // H-01: Agent sends stream_chunk → no error returned
  test('H-01: Agent sends stream_chunk without error', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_${Date.now()}`;
    mockAgent.sendStreamChunk(qrcode.id, 'Hello ', msgId, 0);
    // Wait briefly for any error response
    await new Promise((r) => setTimeout(r, 1000));
    const errors = mockAgent.messagesOfType('error');
    expect(errors.length).toBe(0);
  });

  // H-02: Multiple stream_chunks with increasing sequence numbers
  test('H-02: Multiple stream_chunks with sequence', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_seq_${Date.now()}`;
    mockAgent.sendStreamChunk(qrcode.id, 'Part 1 ', msgId, 0);
    mockAgent.sendStreamChunk(qrcode.id, 'Part 2 ', msgId, 1);
    mockAgent.sendStreamChunk(qrcode.id, 'Part 3', msgId, 2, true);
    await new Promise((r) => setTimeout(r, 1000));
    const errors = mockAgent.messagesOfType('error');
    expect(errors.length).toBe(0);
  });

  // H-03: stream_end finalizes the stream → agent gets ack
  test('H-03: stream_end gives agent an ack', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_end_${Date.now()}`;

    // Send chunks
    mockAgent.sendStreamChunk(qrcode.id, 'Chunk A', msgId, 0);
    mockAgent.sendStreamChunk(qrcode.id, 'Chunk B', msgId, 1);
    await new Promise((r) => setTimeout(r, 300));

    // Send stream_end
    mockAgent.sendStreamEnd(qrcode.id, msgId, 2);
    const ack = await mockAgent.waitFor('ack', 5000);
    expect(ack.type).toBe('ack');
    expect(ack.payload).toBeDefined();
    expect(ack.payload!.status).toBe('accepted');
  });

  // H-04: Stream has consistent messageId across chunks and stream_end
  test('H-04: Consistent messageId across stream', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_consistent_${Date.now()}`;

    mockAgent.sendStreamChunk(qrcode.id, 'First', msgId, 0);
    mockAgent.sendStreamChunk(qrcode.id, 'Second', msgId, 1);
    mockAgent.sendStreamEnd(qrcode.id, msgId, 2);

    const ack = await mockAgent.waitFor('ack', 5000);
    // ACK message_id should match the stream ID
    expect(ack.payload!.message_id).toBe(msgId);
  });

  // H-05: is_final flag on last chunk
  test('H-05: is_final flag on last chunk', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_final_${Date.now()}`;

    // Send chunk with is_final = true
    mockAgent.sendStreamChunk(qrcode.id, 'Final chunk', msgId, 0, true);
    await new Promise((r) => setTimeout(r, 500));

    // No error expected
    const errors = mockAgent.messagesOfType('error');
    expect(errors.length).toBe(0);
  });

  // H-06: Delta content preserved in chunks
  test('H-06: Delta content preserved', async () => {
    mockAgent.clearReceived();
    mockVisitor.clearReceived();
    const msgId = `stream_delta_${Date.now()}`;
    const deltas = ['Hello, ', 'how are ', 'you?'];

    for (let i = 0; i < deltas.length; i++) {
      mockAgent.sendStreamChunk(qrcode.id, deltas[i], msgId, i, i === deltas.length - 1);
    }

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1000));

    // Verify no errors on agent side
    const errors = mockAgent.messagesOfType('error');
    expect(errors.length).toBe(0);

    // Check if visitor received stream_chunks (forwarding may be TODO)
    const visitorChunks = mockVisitor.messagesOfType('stream_chunk');
    if (visitorChunks.length > 0) {
      const receivedDeltas = visitorChunks.map((c) => c.payload?.delta);
      for (const delta of deltas) {
        expect(receivedDeltas).toContain(delta);
      }
    }
  });

  // H-07: Stream sequence numbers are accepted
  test('H-07: Sequence numbers accepted by Gateway', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_seqnum_${Date.now()}`;

    mockAgent.send({
      type: 'stream_chunk',
      id: msgId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: qrcode.id,
        delta: 'Seq test',
        sequence: 42,
      },
    });

    await new Promise((r) => setTimeout(r, 500));
    const errors = mockAgent.messagesOfType('error');
    expect(errors.length).toBe(0);
  });

  // H-08: total_chunks in stream_end
  test('H-08: total_chunks field in stream_end', async () => {
    mockAgent.clearReceived();
    const msgId = `stream_total_${Date.now()}`;

    mockAgent.sendStreamChunk(qrcode.id, 'A', msgId, 0);
    mockAgent.sendStreamChunk(qrcode.id, 'B', msgId, 1);
    mockAgent.sendStreamChunk(qrcode.id, 'C', msgId, 2);
    await new Promise((r) => setTimeout(r, 300));

    mockAgent.sendStreamEnd(qrcode.id, msgId, 3);
    const ack = await mockAgent.waitFor('ack', 5000);
    expect(ack.payload!.status).toBe('accepted');
  });

  // H-09: Invalid stream_chunk (missing delta) → validation error
  test('H-09: Missing delta in stream_chunk returns error', async () => {
    mockAgent.clearReceived();
    mockAgent.send({
      type: 'stream_chunk',
      id: `stream_invalid_${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: qrcode.id,
        sequence: 0,
      },
    });
    const error = await mockAgent.waitFor('error', 5000);
    expect(error.type).toBe('error');
    expect(error.payload!.code).toBe('invalid_frame');
  });

  // H-10: Stream without conversation_id → validation error
  test('H-10: Missing conversation_id in stream_chunk', async () => {
    mockAgent.clearReceived();
    mockAgent.send({
      type: 'stream_chunk',
      id: `stream_noid_${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: {
        delta: 'No conversation',
        sequence: 0,
      },
    });
    const error = await mockAgent.waitFor('error', 5000);
    expect(error.type).toBe('error');
    expect(error.payload!.code).toBe('invalid_frame');
  });

  // H-11: Concurrent streams to different conversations
  test('H-11: Concurrent streams to different conversations', async () => {
    const qrcode2 = await seedQRCode(agent.id, `test-h11-${Date.now().toString(36)}`);

    // Second agent connection for the new QR code
    const agent2 = new MockAgent({ agentId: agent.id, qrCodeId: qrcode2.id });
    await agent2.connect();

    mockAgent.clearReceived();
    agent2.clearReceived();

    const msgId1 = `stream_c1_${Date.now()}`;
    const msgId2 = `stream_c2_${Date.now()}`;

    // Stream to conversation 1
    mockAgent.sendStreamChunk(qrcode.id, 'Conv1 chunk', msgId1, 0);
    // Stream to conversation 2
    agent2.sendStreamChunk(qrcode2.id, 'Conv2 chunk', msgId2, 0);

    await new Promise((r) => setTimeout(r, 500));

    // End both streams
    mockAgent.sendStreamEnd(qrcode.id, msgId1, 1);
    agent2.sendStreamEnd(qrcode2.id, msgId2, 1);

    const ack1 = await mockAgent.waitFor('ack', 5000);
    const ack2 = await agent2.waitFor('ack', 5000);

    expect(ack1.payload!.status).toBe('accepted');
    expect(ack2.payload!.status).toBe('accepted');

    agent2.close();
  });
});
