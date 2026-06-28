/**
 * TDD RED: Tests that WSClient ping frame does NOT include payload.
 * Bug: Client sends { type:'ping', payload:{} }, Gateway strict schema rejects it.
 * Fix: Remove payload from ping frame.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }
}

(globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'mock-uuid') });

import { WSClient } from '@/lib/ws/client';

describe('WSClient ping frame format', () => {
  let client: WSClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new WSClient({
      gatewayUrl: 'ws://localhost:8080',
      agentId: 'agent-123',
    });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it('should send ping without payload field', () => {
    client.connect();
    vi.advanceTimersByTime(1); // trigger onopen

    const ws = (client as unknown as { ws: MockWebSocket }).ws;
    ws.readyState = MockWebSocket.OPEN;

    // Trigger connection_ack to start heartbeat
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'connection_ack',
        timestamp: '2026-03-24T00:00:00Z',
        payload: { connection_id: 'c1', heartbeat_interval_ms: 5000 },
      }),
    } as MessageEvent);

    // Advance past heartbeat interval
    vi.advanceTimersByTime(5000);

    const sentFrames = ws.send.mock.calls.map((call: [string]) => JSON.parse(call[0]));
    const pings = sentFrames.filter((f: { type: string }) => f.type === 'ping');

    expect(pings.length).toBeGreaterThanOrEqual(1);
    // The ping frame MUST NOT have a payload field
    for (const ping of pings) {
      expect(ping).not.toHaveProperty('payload');
      expect(ping).toHaveProperty('type', 'ping');
      expect(ping).toHaveProperty('timestamp');
    }
  });
});
