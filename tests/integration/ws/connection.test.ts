import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRedis } from '../../mocks/redis';
import { createMockWsClient } from '../../mocks/ws-client';

/**
 * WebSocket Connection Integration Tests
 *
 * Tests WS connection lifecycle per §P1.2 + §T3.3 (W1–W4, W9):
 * - Connect with valid ticket → connection_ack frame received
 * - Connect with invalid/expired ticket → rejected with close code
 * - Connect without ticket → rejected with 4001
 * - Heartbeat ping/pong within interval
 * - Graceful disconnect
 *
 * These tests use mocked Gateway + Redis. Once the real gateway is
 * available, swap mocks for real WS connections.
 */

// ─── Types (per §P1.2 connection_ack) ───────────────────────────────

interface ConnectionAckPayload {
  connectionId: string;
  heartbeatIntervalMs: number;
  serverTime: string;
}

interface WSFrame {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface CloseResult {
  code: number;
  reason: string;
}

// ─── Mock Gateway Connection Handler ────────────────────────────────

const handleConnection = async (
  ticket: string | undefined,
  redis: ReturnType<typeof createMockRedis>
): Promise<{ frame?: WSFrame; close?: CloseResult }> => {
  if (!ticket) {
    return { close: { code: 4001, reason: 'missing_ticket' } };
  }

  if (!ticket.startsWith('ws_')) {
    return { close: { code: 4001, reason: 'invalid_ticket_format' } };
  }

  const key = `ws_ticket:${ticket}`;
  const raw = await redis.get(key);

  if (!raw) {
    return { close: { code: 4003, reason: 'invalid_ticket' } };
  }

  // Atomic consume (single-use)
  await redis.del(key);

  const payload = JSON.parse(raw);

  // Check QR code status if present
  if (payload.qrCodeStatus === 'paused') {
    return { close: { code: 4004, reason: 'qrcode_paused' } };
  }

  const ackFrame: WSFrame = {
    type: 'connection_ack',
    timestamp: new Date().toISOString(),
    payload: {
      connectionId: `conn_${Date.now()}`,
      heartbeatIntervalMs: 25000,
      serverTime: new Date().toISOString(),
    },
  };

  return { frame: ackFrame };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebSocket Connection', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    vi.restoreAllMocks();
  });

  // W1: Visitor connects with valid ticket
  it('W1: visitor connects with valid ticket → receives connection_ack', async () => {
    const ticketPayload = {
      role: 'visitor',
      sessionToken: 'sess_abc123',
      agentId: 'agent-001',
      qrCodeId: 'qr-001',
      ownerId: 'owner-001',
    };
    await redis.setex('ws_ticket:ws_visitor_conn', 30, JSON.stringify(ticketPayload));

    const result = await handleConnection('ws_visitor_conn', redis);

    expect(result.frame).toBeDefined();
    expect(result.frame!.type).toBe('connection_ack');
    expect(result.frame!.payload.connectionId).toBeDefined();
    expect(result.frame!.payload.heartbeatIntervalMs).toBe(25000);
    expect(result.frame!.payload.serverTime).toBeDefined();
    expect(result.close).toBeUndefined();
  });

  // W2: Agent connects with valid ticket
  it('W2: agent connects with valid ticket → receives connection_ack', async () => {
    const ticketPayload = {
      role: 'agent',
      agentId: 'agent-002',
      ownerId: 'owner-002',
    };
    await redis.setex('ws_ticket:ws_agent_conn', 30, JSON.stringify(ticketPayload));

    const result = await handleConnection('ws_agent_conn', redis);

    expect(result.frame).toBeDefined();
    expect(result.frame!.type).toBe('connection_ack');
    expect(result.close).toBeUndefined();
  });

  // W3: Connection without ticket → rejected 4001
  it('W3: connection without ticket → close 4001 missing_ticket', async () => {
    const result = await handleConnection(undefined, redis);

    expect(result.close).toBeDefined();
    expect(result.close!.code).toBe(4001);
    expect(result.close!.reason).toBe('missing_ticket');
    expect(result.frame).toBeUndefined();
  });

  // W4: Connection with invalid ticket → rejected 4003
  it('W4: connection with invalid ticket → close 4003 invalid_ticket', async () => {
    // Ticket not in Redis (expired or never existed)
    const result = await handleConnection('ws_nonexistent', redis);

    expect(result.close).toBeDefined();
    expect(result.close!.code).toBe(4003);
    expect(result.close!.reason).toBe('invalid_ticket');
  });

  // W4 variant: Ticket format invalid (no ws_ prefix)
  it('W4b: ticket without ws_ prefix → close 4001 invalid_ticket_format', async () => {
    const result = await handleConnection('bad_prefix_ticket', redis);

    expect(result.close).toBeDefined();
    expect(result.close!.code).toBe(4001);
    expect(result.close!.reason).toBe('invalid_ticket_format');
  });

  // Ticket consumed on connection — cannot reuse
  it('ticket is consumed on connection (single-use)', async () => {
    const ticketPayload = {
      role: 'visitor',
      sessionToken: 'sess_single',
      agentId: 'agent-003',
      ownerId: 'owner-003',
    };
    await redis.setex('ws_ticket:ws_single_use', 30, JSON.stringify(ticketPayload));

    const first = await handleConnection('ws_single_use', redis);
    expect(first.frame).toBeDefined();

    const second = await handleConnection('ws_single_use', redis);
    expect(second.close).toBeDefined();
    expect(second.close!.code).toBe(4003);
  });

  // W9: Heartbeat interval in connection_ack
  it('W9: connection_ack includes heartbeat_interval_ms = 25000', async () => {
    await redis.setex(
      'ws_ticket:ws_heartbeat',
      30,
      JSON.stringify({
        role: 'visitor',
        sessionToken: 'sess_hb',
        agentId: 'agent-hb',
        ownerId: 'owner-hb',
      })
    );

    const result = await handleConnection('ws_heartbeat', redis);
    const payload = result.frame!.payload as unknown as ConnectionAckPayload;

    expect(payload.heartbeatIntervalMs).toBe(25000);
  });

  // W13: QR code paused → reject connection
  it('W13: QR code paused → close 4004 qrcode_paused', async () => {
    await redis.setex(
      'ws_ticket:ws_paused_qr',
      30,
      JSON.stringify({
        role: 'visitor',
        sessionToken: 'sess_paused',
        agentId: 'agent-paused',
        qrCodeStatus: 'paused',
      })
    );

    const result = await handleConnection('ws_paused_qr', redis);

    expect(result.close).toBeDefined();
    expect(result.close!.code).toBe(4004);
    expect(result.close!.reason).toBe('qrcode_paused');
  });
});
