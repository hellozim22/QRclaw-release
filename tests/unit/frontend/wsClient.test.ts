/**
 * Unit tests for WSClient class.
 * Tests connection lifecycle, frame handling, heartbeat, and reconnection.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock WebSocket ────────────────────────────────────────────────

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
    // Simulate async open
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }
}

// Set on globalThis for both node and jsdom
(globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
});

import { WSClient } from '@/lib/ws/client';

describe('WSClient', () => {
  let client: WSClient;
  let mockOnStatusChange: ReturnType<typeof vi.fn>;
  let mockOnConnectionAck: ReturnType<typeof vi.fn>;
  let mockOnAck: ReturnType<typeof vi.fn>;
  let mockOnMessage: ReturnType<typeof vi.fn>;
  let mockOnStreamChunk: ReturnType<typeof vi.fn>;
  let mockOnStreamEnd: ReturnType<typeof vi.fn>;
  let mockOnError: ReturnType<typeof vi.fn>;
  let mockOnSystem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnStatusChange = vi.fn();
    mockOnConnectionAck = vi.fn();
    mockOnAck = vi.fn();
    mockOnMessage = vi.fn();
    mockOnStreamChunk = vi.fn();
    mockOnStreamEnd = vi.fn();
    mockOnError = vi.fn();
    mockOnSystem = vi.fn();

    client = new WSClient({
      gatewayUrl: 'ws://localhost:8080',
      agentId: 'agent-123',
      onStatusChange: mockOnStatusChange,
      onConnectionAck: mockOnConnectionAck,
      onAck: mockOnAck,
      onMessage: mockOnMessage,
      onStreamChunk: mockOnStreamChunk,
      onStreamEnd: mockOnStreamEnd,
      onError: mockOnError,
      onSystem: mockOnSystem,
    });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should set status to connecting', () => {
      client.connect();
      expect(mockOnStatusChange).toHaveBeenCalledWith('connecting');
    });

    it('should create WebSocket with correct URL', () => {
      client.connect();
      // Access the internal ws via the mock
      expect(mockOnStatusChange).toHaveBeenCalledWith('connecting');
    });

    it('should include session token in URL when provided', () => {
      const clientWithToken = new WSClient({
        gatewayUrl: 'ws://localhost:8080',
        agentId: 'agent-123',
        sessionToken: 'my-token',
        onStatusChange: mockOnStatusChange,
      });
      clientWithToken.connect();
      expect(mockOnStatusChange).toHaveBeenCalledWith('connecting');
      clientWithToken.disconnect();
    });
  });

  describe('frame handling', () => {
    it('should handle connection_ack frame', () => {
      client.connect();
      vi.advanceTimersByTime(1); // trigger onopen

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'connection_ack',
        timestamp: '2026-03-15T00:00:00Z',
        payload: {
          connection_id: 'conn-1',
          heartbeat_interval_ms: 20000,
        },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);

      expect(mockOnConnectionAck).toHaveBeenCalledOnce();
      expect(mockOnStatusChange).toHaveBeenCalledWith('connected');
    });

    it('should handle ack frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'ack',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { message_id: 'msg-1', status: 'delivered' },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnAck).toHaveBeenCalledOnce();
    });

    it('should handle message frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'message',
        id: 'msg-1',
        timestamp: '2026-03-15T00:00:00Z',
        payload: {
          content: 'Hello!',
          content_type: 'text',
          sender_type: 'agent',
          conversation_id: 'conv-1',
        },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnMessage).toHaveBeenCalledOnce();
    });

    it('should handle stream_chunk frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'stream_chunk',
        id: 'stream-1',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { conversation_id: 'conv-1', delta: 'He', sequence: 1 },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnStreamChunk).toHaveBeenCalledOnce();
    });

    it('should handle stream_end frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'stream_end',
        id: 'stream-1',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { conversation_id: 'conv-1', full_content: 'Hello World' },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnStreamEnd).toHaveBeenCalledOnce();
    });

    it('should handle error frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'error',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { code: 'rate_limited', message: 'Too many requests' },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnError).toHaveBeenCalledOnce();
    });

    it('should handle system frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'system',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { event: 'agent_online' },
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      expect(mockOnSystem).toHaveBeenCalledOnce();
    });

    it('should handle pong frame silently', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      const frame = JSON.stringify({
        type: 'pong',
        timestamp: '2026-03-15T00:00:00Z',
        payload: {},
      });

      ws.onmessage?.({ data: frame } as MessageEvent);
      // No callbacks should be called for pong
      expect(mockOnMessage).not.toHaveBeenCalled();
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it('should ignore non-string messages', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.onmessage?.({ data: new ArrayBuffer(8) } as MessageEvent);

      expect(mockOnMessage).not.toHaveBeenCalled();
    });

    it('should ignore malformed JSON', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.onmessage?.({ data: 'not-json{' } as MessageEvent);

      expect(mockOnMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should send visitor_message frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.readyState = MockWebSocket.OPEN;

      const messageId = client.sendMessage('Hello!');

      expect(messageId).toBeDefined();
      expect(ws.send).toHaveBeenCalledOnce();

      const sentFrame = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sentFrame.type).toBe('visitor_message');
      expect(sentFrame.payload.content).toBe('Hello!');
      expect(sentFrame.payload.content_type).toBe('text');
    });

    it('should not send when WebSocket is not open', () => {
      client.connect();
      // Don't advance timer — ws still CONNECTING

      const ws = getInternalWs(client);
      ws.readyState = MockWebSocket.CONNECTING;

      client.sendMessage('Hello');
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('sendReadReceipt', () => {
    it('should send read_receipt frame', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.readyState = MockWebSocket.OPEN;

      client.sendReadReceipt(['msg-1', 'msg-2']);

      const sentFrame = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sentFrame.type).toBe('read_receipt');
      expect(sentFrame.payload.message_ids).toEqual(['msg-1', 'msg-2']);
    });
  });

  describe('disconnect', () => {
    it('should set status to disconnected', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      client.disconnect();
      expect(mockOnStatusChange).toHaveBeenCalledWith('disconnected');
    });

    it('should close the WebSocket', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      client.disconnect();

      expect(ws.close).toHaveBeenCalledOnce();
    });
  });

  describe('auth frame (CRITICAL-1: tokens must NOT be in URL)', () => {
    it('should NOT include ticket in the WebSocket URL query string', () => {
      const clientWithTicket = new WSClient({
        gatewayUrl: 'ws://localhost:8080',
        agentId: 'agent-123',
        ticket: 'secret-jwt-ticket',
        role: 'visitor',
        sessionToken: 'session-token-abc',
        onStatusChange: mockOnStatusChange,
      });
      clientWithTicket.connect();

      const ws = getInternalWs(clientWithTicket);
      const url = new URL(ws.url);

      // Tokens MUST NOT appear in URL (OWASP: logged in server access logs, Referer headers)
      expect(url.searchParams.has('ticket')).toBe(false);
      expect(url.searchParams.has('token')).toBe(false);
      // Only agent_id and role should be in URL
      expect(url.searchParams.get('agent_id')).toBe('agent-123');

      clientWithTicket.disconnect();
    });

    it('should send an auth frame as the first message after WebSocket opens', () => {
      const clientWithTicket = new WSClient({
        gatewayUrl: 'ws://localhost:8080',
        agentId: 'agent-123',
        ticket: 'secret-jwt-ticket',
        role: 'visitor',
        sessionToken: 'session-token-abc',
        onStatusChange: mockOnStatusChange,
      });
      clientWithTicket.connect();
      vi.advanceTimersByTime(1); // trigger onopen

      const ws = getInternalWs(clientWithTicket);
      ws.readyState = MockWebSocket.OPEN;

      // The first message sent after open should be an auth frame
      expect(ws.send).toHaveBeenCalled();
      const firstFrame = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(firstFrame.type).toBe('auth');
      expect(firstFrame.payload.ticket).toBe('secret-jwt-ticket');
      expect(firstFrame.payload.session_token).toBe('session-token-abc');

      clientWithTicket.disconnect();
    });
  });

  describe('reconnection', () => {
    it('should schedule reconnect on unexpected close', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      // Simulate unexpected close
      ws.onclose?.({} as CloseEvent);

      expect(mockOnStatusChange).toHaveBeenCalledWith('reconnecting');
    });

    it('should not reconnect after intentional disconnect', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      client.disconnect();

      // The last status should be 'disconnected', not 'reconnecting'
      const lastCall = mockOnStatusChange.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('disconnected');
    });

    it('should use exponential backoff for reconnects', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.onclose?.({} as CloseEvent);

      // After first close, should try to reconnect after 1s (BASE_RECONNECT_DELAY_MS)
      expect(mockOnStatusChange).toHaveBeenCalledWith('reconnecting');
    });

    it('should invoke onTicketRefresh callback before reconnecting (HIGH-1)', () => {
      const mockOnTicketRefresh = vi.fn().mockResolvedValue({
        ticket: 'fresh-ticket',
        sessionToken: 'fresh-session',
      });

      const clientWithRefresh = new WSClient({
        gatewayUrl: 'ws://localhost:8080',
        agentId: 'agent-123',
        ticket: 'expired-ticket',
        role: 'visitor',
        sessionToken: 'old-session',
        onStatusChange: mockOnStatusChange,
        onTicketRefresh: mockOnTicketRefresh,
      });

      clientWithRefresh.connect();
      vi.advanceTimersByTime(1); // trigger onopen

      const ws = getInternalWs(clientWithRefresh);
      ws.onclose?.({} as CloseEvent); // unexpected close

      // Advance past reconnect delay
      vi.advanceTimersByTime(1000);

      // onTicketRefresh should have been called to get a fresh ticket
      expect(mockOnTicketRefresh).toHaveBeenCalledOnce();

      clientWithRefresh.disconnect();
    });
  });

  describe('heartbeat', () => {
    it('should start heartbeat after connection_ack', () => {
      client.connect();
      vi.advanceTimersByTime(1);

      const ws = getInternalWs(client);
      ws.readyState = MockWebSocket.OPEN;

      // Trigger connection_ack
      const ackFrame = JSON.stringify({
        type: 'connection_ack',
        timestamp: '2026-03-15T00:00:00Z',
        payload: { connection_id: 'conn-1', heartbeat_interval_ms: 5000 },
      });
      ws.onmessage?.({ data: ackFrame } as MessageEvent);

      // Advance past heartbeat interval
      vi.advanceTimersByTime(5000);

      // Should have sent a ping
      const sentFrames = ws.send.mock.calls.map((call: [string]) => JSON.parse(call[0]));
      const pings = sentFrames.filter((f: { type: string }) => f.type === 'ping');
      expect(pings.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// Helper to access the private ws field
function getInternalWs(client: WSClient): MockWebSocket {
  return (client as unknown as { ws: MockWebSocket }).ws;
}
