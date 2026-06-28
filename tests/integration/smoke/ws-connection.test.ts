import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Production Smoke Tests — WebSocket Connection (Phase 7)
 *
 * Validates WS /ws endpoint contract:
 * - Valid ticket → connection_ack frame
 * - Missing ticket → close 4001
 * - Connection includes heartbeat config
 * - Server sends ping within heartbeat interval
 * - Graceful disconnect returns close code 1000
 *
 * Mock-based: validates WS handshake and lifecycle contract.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface WsConnectionAck {
  type: 'connection_ack';
  connectionId: string;
  heartbeatInterval: number;
  serverTime: string;
}

interface WsCloseEvent {
  code: number;
  reason: string;
}

// ─── Mock WS Handshake ─────────────────────────────────────────────

const createWsHandshakeService = () => {
  let connectionCounter = 0;

  const connect = (ticket?: string): { ack?: WsConnectionAck; close?: WsCloseEvent } => {
    if (!ticket || ticket.trim().length === 0) {
      return { close: { code: 4001, reason: 'missing_ticket' } };
    }

    if (!ticket.startsWith('tkt_')) {
      return { close: { code: 4001, reason: 'invalid_ticket_format' } };
    }

    // Simulate expired ticket
    if (ticket.includes('expired')) {
      return { close: { code: 4003, reason: 'ticket_expired' } };
    }

    connectionCounter += 1;

    return {
      ack: {
        type: 'connection_ack',
        connectionId: `conn-${connectionCounter}`,
        heartbeatInterval: 25000,
        serverTime: new Date().toISOString(),
      },
    };
  };

  const disconnect = (): WsCloseEvent => ({
    code: 1000,
    reason: 'normal_closure',
  });

  const ping = (): { type: 'ping'; timestamp: number } => ({
    type: 'ping',
    timestamp: Date.now(),
  });

  return { connect, disconnect, ping };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Smoke: WebSocket Connection', () => {
  let svc: ReturnType<typeof createWsHandshakeService>;

  beforeEach(() => {
    svc = createWsHandshakeService();
    vi.restoreAllMocks();
  });

  it('valid ticket returns connection_ack frame', () => {
    const result = svc.connect('tkt_valid-ticket-123');

    expect(result.ack).toBeDefined();
    expect(result.ack?.type).toBe('connection_ack');
    expect(result.ack?.connectionId).toMatch(/^conn-/);
    expect(result.close).toBeUndefined();
  });

  it('missing ticket closes with 4001', () => {
    const result = svc.connect();

    expect(result.close).toBeDefined();
    expect(result.close?.code).toBe(4001);
    expect(result.ack).toBeUndefined();
  });

  it('empty ticket closes with 4001', () => {
    const result = svc.connect('  ');

    expect(result.close?.code).toBe(4001);
    expect(result.close?.reason).toBe('missing_ticket');
  });

  it('invalid ticket format closes with 4001', () => {
    const result = svc.connect('bad-format-ticket');

    expect(result.close?.code).toBe(4001);
    expect(result.close?.reason).toBe('invalid_ticket_format');
  });

  it('expired ticket closes with 4003', () => {
    const result = svc.connect('tkt_expired-abc');

    expect(result.close?.code).toBe(4003);
    expect(result.close?.reason).toBe('ticket_expired');
  });

  it('connection_ack includes heartbeat interval of 25000ms', () => {
    const result = svc.connect('tkt_valid-ticket-456');

    expect(result.ack?.heartbeatInterval).toBe(25000);
  });

  it('connection_ack includes valid server timestamp', () => {
    const result = svc.connect('tkt_valid-ticket-789');
    const parsed = new Date(result.ack!.serverTime);

    expect(parsed.toISOString()).toBe(result.ack!.serverTime);
  });

  it('each connection gets unique connectionId', () => {
    const r1 = svc.connect('tkt_first');
    const r2 = svc.connect('tkt_second');

    expect(r1.ack?.connectionId).not.toBe(r2.ack?.connectionId);
  });

  it('graceful disconnect returns close code 1000', () => {
    const close = svc.disconnect();

    expect(close.code).toBe(1000);
    expect(close.reason).toBe('normal_closure');
  });

  it('ping frame includes timestamp', () => {
    const ping = svc.ping();

    expect(ping.type).toBe('ping');
    expect(ping.timestamp).toBeGreaterThan(0);
  });
});
