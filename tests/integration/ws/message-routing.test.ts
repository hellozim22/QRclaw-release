import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockWsClient } from '../../mocks/ws-client';
import { sampleStreamChunks } from '../../fixtures/messages';

/**
 * WebSocket Message Routing Integration Tests
 *
 * Tests message forwarding per §P1.1/§P1.2 + §T3.3 (W5–W8, W11, W14):
 * - Visitor sends message → agent receives it
 * - Agent sends message → visitor receives it
 * - Stream chunks forwarded in order
 * - Stream end finalizes message
 * - Duplicate message ID → deduplicated
 * - Agent offline → ack:failed with reason
 * - Message persisted before ACK sent
 *
 * Uses mock WS clients and an in-memory message router.
 */

// ─── Types (per §P1 WSFrame) ───────────────────────────────────────

interface WSFrame {
  type: string;
  id?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface Connection {
  id: string;
  role: 'visitor' | 'agent';
  agentId: string;
  conversationId: string;
  ws: ReturnType<typeof createMockWsClient>;
}

// ─── Mock Message Router ────────────────────────────────────────────

const createMockRouter = () => {
  const connections = new Map<string, Connection>();
  const processedMessageIds = new Set<string>();
  const persistedMessages: WSFrame[] = [];

  const register = (conn: Connection) => {
    connections.set(conn.id, conn);
  };

  const findPeer = (senderId: string): Connection | undefined => {
    const sender = connections.get(senderId);
    if (!sender) return undefined;

    for (const [id, conn] of connections) {
      if (id !== senderId && conn.agentId === sender.agentId && conn.role !== sender.role) {
        return conn;
      }
    }
    return undefined;
  };

  const routeMessage = (senderId: string, frame: WSFrame): WSFrame | null => {
    // W11: Dedup check
    if (frame.id && processedMessageIds.has(frame.id)) {
      return null; // deduplicated
    }

    if (frame.id) {
      processedMessageIds.add(frame.id);
    }

    // W14: Persist before ACK
    persistedMessages.push({ ...frame });

    const peer = findPeer(senderId);
    if (!peer) {
      // W8: Agent offline → ack:failed
      return {
        type: 'ack',
        timestamp: new Date().toISOString(),
        payload: {
          messageId: frame.id,
          status: 'failed',
          errorCode: 'agent_unreachable',
          errorMessage: 'The agent is currently offline',
        },
      };
    }

    // Forward to peer
    peer.ws.send(
      JSON.stringify({
        type: 'message',
        id: frame.id,
        timestamp: frame.timestamp,
        payload: {
          ...frame.payload,
          senderType: connections.get(senderId)!.role,
          conversationId: connections.get(senderId)!.conversationId,
        },
      })
    );

    // Return ack:sent
    return {
      type: 'ack',
      timestamp: new Date().toISOString(),
      payload: {
        messageId: frame.id,
        status: 'sent',
      },
    };
  };

  const routeStreamChunk = (senderId: string, frame: WSFrame): void => {
    const peer = findPeer(senderId);
    if (!peer) return;

    peer.ws.send(
      JSON.stringify({
        type: 'stream_chunk',
        id: frame.id,
        timestamp: frame.timestamp,
        payload: frame.payload,
      })
    );
  };

  const routeStreamEnd = (senderId: string, frame: WSFrame): void => {
    const peer = findPeer(senderId);
    if (!peer) return;

    peer.ws.send(
      JSON.stringify({
        type: 'stream_end',
        id: frame.id,
        timestamp: frame.timestamp,
        payload: frame.payload,
      })
    );
  };

  return {
    register,
    routeMessage,
    routeStreamChunk,
    routeStreamEnd,
    _processedIds: processedMessageIds,
    _persistedMessages: persistedMessages,
  };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebSocket Message Routing', () => {
  let router: ReturnType<typeof createMockRouter>;
  let visitorWs: ReturnType<typeof createMockWsClient>;
  let agentWs: ReturnType<typeof createMockWsClient>;
  const conversationId = 'conv-001';
  const agentId = 'agent-001';

  beforeEach(() => {
    router = createMockRouter();
    visitorWs = createMockWsClient();
    agentWs = createMockWsClient();

    router.register({
      id: 'visitor-conn',
      role: 'visitor',
      agentId,
      conversationId,
      ws: visitorWs,
    });

    router.register({
      id: 'agent-conn',
      role: 'agent',
      agentId,
      conversationId,
      ws: agentWs,
    });

    vi.restoreAllMocks();
  });

  // W5: Visitor sends message → Agent receives it
  it('W5: visitor sends message → agent receives + visitor gets ack:sent', () => {
    const visitorFrame: WSFrame = {
      type: 'visitor_message',
      id: 'msg-001',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'Hello, I need help!',
        contentType: 'text',
      },
    };

    const ack = router.routeMessage('visitor-conn', visitorFrame);

    // Agent received the message
    expect(agentWs.send).toHaveBeenCalledTimes(1);
    const forwarded = agentWs._messages[0] as Record<string, unknown>;
    expect(forwarded.type).toBe('message');
    expect((forwarded.payload as Record<string, unknown>).senderType).toBe('visitor');
    expect((forwarded.payload as Record<string, unknown>).content).toBe('Hello, I need help!');

    // Visitor gets ack:sent
    expect(ack).toBeDefined();
    expect(ack!.type).toBe('ack');
    expect(ack!.payload.status).toBe('sent');
    expect(ack!.payload.messageId).toBe('msg-001');
  });

  // W6: Agent sends message → Visitor receives it
  it('W6: agent sends message → visitor receives + agent gets ack:sent', () => {
    const agentFrame: WSFrame = {
      type: 'agent_message',
      id: 'msg-002',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'How can I help you today?',
        contentType: 'text',
        conversationId,
        isFinal: true,
      },
    };

    const ack = router.routeMessage('agent-conn', agentFrame);

    // Visitor received the message
    expect(visitorWs.send).toHaveBeenCalledTimes(1);
    const forwarded = visitorWs._messages[0] as Record<string, unknown>;
    expect(forwarded.type).toBe('message');
    expect((forwarded.payload as Record<string, unknown>).senderType).toBe('agent');

    // Agent gets ack:sent
    expect(ack!.payload.status).toBe('sent');
  });

  // W7: Agent stream chunks → Visitor receives in order
  it('W7: agent stream chunks → visitor receives all in order + stream_end', () => {
    const messageId = 'msg-stream-001';

    sampleStreamChunks.forEach((delta, idx) => {
      router.routeStreamChunk('agent-conn', {
        type: 'stream_chunk',
        id: messageId,
        timestamp: new Date().toISOString(),
        payload: {
          conversationId,
          delta,
          sequence: idx,
          isFinal: false,
        },
      });
    });

    router.routeStreamEnd('agent-conn', {
      type: 'stream_end',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: {
        conversationId,
        totalChunks: sampleStreamChunks.length,
        totalLength: sampleStreamChunks.join('').length,
      },
    });

    // Visitor received all chunks + end
    expect(visitorWs.send).toHaveBeenCalledTimes(sampleStreamChunks.length + 1);

    // Verify order
    const messages = visitorWs._messages as WSFrame[];
    const chunks = messages.filter((m) => m.type === 'stream_chunk');
    const ends = messages.filter((m) => m.type === 'stream_end');

    expect(chunks).toHaveLength(sampleStreamChunks.length);
    expect(ends).toHaveLength(1);

    chunks.forEach((chunk, idx) => {
      expect(chunk.payload.sequence).toBe(idx);
      expect(chunk.payload.delta).toBe(sampleStreamChunks[idx]);
    });
  });

  // W8: Agent offline → ack:failed
  it('W8: agent offline → visitor gets ack:failed with agent_unreachable', () => {
    // Create router with only visitor, no agent peer
    const lonelyRouter = createMockRouter();
    const lonelyVisitorWs = createMockWsClient();
    lonelyRouter.register({
      id: 'lonely-visitor',
      role: 'visitor',
      agentId: 'agent-offline',
      conversationId: 'conv-lonely',
      ws: lonelyVisitorWs,
    });

    const frame: WSFrame = {
      type: 'visitor_message',
      id: 'msg-lonely',
      timestamp: new Date().toISOString(),
      payload: { content: 'Anyone there?', contentType: 'text' },
    };

    const ack = lonelyRouter.routeMessage('lonely-visitor', frame);

    expect(ack).toBeDefined();
    expect(ack!.type).toBe('ack');
    expect(ack!.payload.status).toBe('failed');
    expect(ack!.payload.errorCode).toBe('agent_unreachable');
  });

  // W11: Duplicate message ID → deduplicated
  it('W11: duplicate message_id → only delivered once', () => {
    const frame: WSFrame = {
      type: 'visitor_message',
      id: 'msg-dedup',
      timestamp: new Date().toISOString(),
      payload: { content: 'Hello!', contentType: 'text' },
    };

    const first = router.routeMessage('visitor-conn', frame);
    const second = router.routeMessage('visitor-conn', frame);

    expect(first).toBeDefined();
    expect(first!.payload.status).toBe('sent');

    // Second is deduplicated (null return)
    expect(second).toBeNull();

    // Agent only received once
    expect(agentWs.send).toHaveBeenCalledTimes(1);
  });

  // W14: Message persisted before ACK
  it('W14: message persisted to store before ack:sent is returned', () => {
    const frame: WSFrame = {
      type: 'visitor_message',
      id: 'msg-persist',
      timestamp: new Date().toISOString(),
      payload: { content: 'Persist me', contentType: 'text' },
    };

    const ack = router.routeMessage('visitor-conn', frame);

    // Verify persisted
    expect(router._persistedMessages).toHaveLength(1);
    expect(router._persistedMessages[0].id).toBe('msg-persist');

    // ACK returned after persistence
    expect(ack!.payload.status).toBe('sent');
  });
});
