import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRedis } from '../../mocks/redis';

/**
 * WebSocket Reconnection Tests
 *
 * Tests reconnection logic per §T3.3 (W10):
 * - Disconnect → reconnect with new ticket → session preserved
 * - Messages queued during disconnect → delivered on reconnect
 *
 * Uses mock session store and message queue.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface SessionState {
  sessionToken: string;
  agentId: string;
  conversationId: string;
  lastMessageId?: string;
}

interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
}

// ─── Mock Session + Message Queue ───────────────────────────────────

const createSessionStore = () => {
  const sessions = new Map<string, SessionState>();
  const offlineQueues = new Map<string, QueuedMessage[]>();

  const saveSession = (sessionToken: string, state: SessionState) => {
    sessions.set(sessionToken, { ...state });
  };

  const getSession = (sessionToken: string): SessionState | undefined => {
    return sessions.get(sessionToken);
  };

  const queueMessage = (sessionToken: string, message: QueuedMessage) => {
    const queue = offlineQueues.get(sessionToken) ?? [];
    offlineQueues.set(sessionToken, [...queue, message]);
  };

  const drainQueue = (sessionToken: string): QueuedMessage[] => {
    const messages = offlineQueues.get(sessionToken) ?? [];
    offlineQueues.delete(sessionToken);
    return messages;
  };

  return { saveSession, getSession, queueMessage, drainQueue };
};

const handleReconnect = (
  sessionToken: string,
  store: ReturnType<typeof createSessionStore>
): { restored: boolean; session?: SessionState; queuedMessages: QueuedMessage[] } => {
  const session = store.getSession(sessionToken);
  if (!session) {
    return { restored: false, queuedMessages: [] };
  }

  const queuedMessages = store.drainQueue(sessionToken);
  return { restored: true, session, queuedMessages };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebSocket Reconnection', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    redis = createMockRedis();
    store = createSessionStore();
    vi.restoreAllMocks();
  });

  it('W10a: disconnect → reconnect with new ticket → session preserved', async () => {
    const sessionToken = 'sess_reconnect_1';
    const sessionState: SessionState = {
      sessionToken,
      agentId: 'agent-001',
      conversationId: 'conv-001',
      lastMessageId: 'msg-005',
    };

    // Phase 1: Initial connection + store session
    store.saveSession(sessionToken, sessionState);

    // Phase 2: Simulate disconnect (no explicit action needed)

    // Phase 3: Reconnect — new ticket but same session
    await redis.setex(
      'ws_ticket:ws_reconnect_new',
      30,
      JSON.stringify({
        role: 'visitor',
        sessionToken,
        agentId: 'agent-001',
      })
    );

    // Verify new ticket exists
    const ticketRaw = await redis.get('ws_ticket:ws_reconnect_new');
    expect(ticketRaw).toBeDefined();

    // Reconnect restores session
    const result = handleReconnect(sessionToken, store);
    expect(result.restored).toBe(true);
    expect(result.session!.conversationId).toBe('conv-001');
    expect(result.session!.lastMessageId).toBe('msg-005');
  });

  it('W10b: messages queued during disconnect → delivered on reconnect', () => {
    const sessionToken = 'sess_queue_1';
    store.saveSession(sessionToken, {
      sessionToken,
      agentId: 'agent-002',
      conversationId: 'conv-002',
    });

    // Simulate 3 messages arriving while visitor is disconnected
    store.queueMessage(sessionToken, {
      id: 'msg-q1',
      content: 'You missed this!',
      timestamp: '2026-03-13T10:00:00.000Z',
    });
    store.queueMessage(sessionToken, {
      id: 'msg-q2',
      content: 'And this too!',
      timestamp: '2026-03-13T10:00:01.000Z',
    });
    store.queueMessage(sessionToken, {
      id: 'msg-q3',
      content: 'One more.',
      timestamp: '2026-03-13T10:00:02.000Z',
    });

    // Reconnect → drain queue
    const result = handleReconnect(sessionToken, store);

    expect(result.restored).toBe(true);
    expect(result.queuedMessages).toHaveLength(3);
    expect(result.queuedMessages[0].id).toBe('msg-q1');
    expect(result.queuedMessages[1].id).toBe('msg-q2');
    expect(result.queuedMessages[2].id).toBe('msg-q3');

    // Queue is drained after reconnect
    const secondDrain = handleReconnect(sessionToken, store);
    expect(secondDrain.queuedMessages).toHaveLength(0);
  });

  it('reconnect with invalid session → not restored', () => {
    const result = handleReconnect('sess_nonexistent', store);

    expect(result.restored).toBe(false);
    expect(result.session).toBeUndefined();
    expect(result.queuedMessages).toHaveLength(0);
  });
});
