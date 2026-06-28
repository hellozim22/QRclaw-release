/**
 * Unit tests for Gateway dual-auth WebSocket handler
 * Tests both Method A (URL ticket) and Method B (auth frame) paths.
 *
 * Per Phase 3 of the 4001 BLOCKED fix plan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ConnectionInfo } from '../../../gateway/src/types/index';

// ─── Mock WebSocket ───────────────────────────────────────────────────

class MockWebSocket extends EventEmitter {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  // Instance-level `OPEN` mirrors the real `ws` library (`sendFrame` compares
  // `ws.readyState !== ws.OPEN`). Pre-T3c the handler called `ws.send()`
  // directly, so only `readyState` mattered; migrating E1 to `sendFrame`
  // made the comparison reach for this property and fail when it was
  // undefined. Kept static member for tests that still read the class.
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSED = MockWebSocket.CLOSED;
  readyState = MockWebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  closedWith: { code: number; reason: string } | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, Buffer.from(reason));
  }

  ping(): void {
    // noop for test
  }

  removeListener(event: string, fn: (...args: unknown[]) => void): this {
    super.removeListener(event, fn);
    return this;
  }
}

// ─── Mock Dependencies ───────────────────────────────────────────────

const mockExtractTicket = vi.fn<(req: unknown) => string | null>();
const mockVerifyTicket = vi.fn<(ticket: string) => Promise<ConnectionInfo | null>>();
const mockRegisterConnection = vi.fn();
const mockUnregisterConnection = vi.fn();
const mockRouteMessage = vi.fn().mockResolvedValue(undefined);
const mockSetAgentOnline = vi.fn().mockResolvedValue(undefined);
const mockSetAgentOffline = vi.fn().mockResolvedValue(undefined);
const mockRefreshPresence = vi.fn().mockResolvedValue(undefined);
const mockDrainOfflineQueue = vi.fn().mockResolvedValue([]);
const mockValidateFrame = vi.fn();
const mockCheckIpRateLimit = vi.fn().mockResolvedValue({ allowed: true });
const mockGetConnectionCount = vi.fn().mockReturnValue(0);

vi.mock('../../../gateway/src/ws/auth.js', () => ({
  extractTicket: mockExtractTicket,
  verifyTicket: mockVerifyTicket,
}));

vi.mock('../../../gateway/src/ws/router.js', () => ({
  routeMessage: mockRouteMessage,
}));

vi.mock('../../../gateway/src/ws/registry.js', () => ({
  registerConnection: mockRegisterConnection,
  unregisterConnection: mockUnregisterConnection,
  getConnectionCount: mockGetConnectionCount,
  getAgentConnections: vi.fn(() => []),
  getAgentConnectionIds: vi.fn(() => []),
}));

vi.mock('../../../gateway/src/redis/presence.js', () => ({
  setAgentOnline: mockSetAgentOnline,
  setAgentOffline: mockSetAgentOffline,
  refreshPresence: mockRefreshPresence,
}));

vi.mock('../../../gateway/src/redis/offline-queue.js', () => ({
  drainOfflineQueue: mockDrainOfflineQueue,
}));

vi.mock('../../../gateway/src/ws/schemas.js', () => ({
  validateFrame: mockValidateFrame,
}));

vi.mock('../../../gateway/src/redis/ip-rate-limiter.js', () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
}));

vi.mock('../../../gateway/src/db/supabase.js', () => ({
  supabase: {},
  isSupabaseConfigured: () => false,
}));

// ─── Import after mocks ──────────────────────────────────────────────

// We test the handler logic by simulating what setupWebSocketServer does:
// call the 'connection' event handler with a mock ws and request.
// Since the handler is not directly exported, we import setupWebSocketServer
// and extract the connection handler from the WSS mock.

// However, since ws.WebSocketServer is a real class with server binding,
// it's simpler to test the core functions directly.
// The handler.ts exports setupWebSocketServer and getConnectionCount.
// We'll mock the WebSocketServer and capture the connection handler.

vi.mock('ws', () => {
  class FakeWSS extends EventEmitter {
    constructor() {
      super();
    }
  }
  return {
    WebSocket: MockWebSocket,
    WebSocketServer: FakeWSS,
  };
});

// Now import — the mocks above will be applied
const { setupWebSocketServer } = await import('../../../gateway/src/ws/handler.js');

// ─── Helpers ─────────────────────────────────────────────────────────

const fakeReq = (headers: Record<string, string> = {}) =>
  ({
    url: '/ws',
    headers: { host: 'localhost', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as import('http').IncomingMessage;

const validConnectionInfo = {
  connectionId: 'conn-abc-123',
  role: 'visitor' as const,
  connectedAt: new Date().toISOString(),
};

const validAuthFrame = {
  type: 'auth',
  timestamp: new Date().toISOString(),
  payload: { ticket: 'valid-jwt-token' },
};

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Gateway Dual-Auth Handler', () => {
  let wss: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup the WSS (captures the connection handler)
    const fakeServer = new EventEmitter() as unknown as import('http').Server;
    wss = setupWebSocketServer(fakeServer) as unknown as EventEmitter;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emitConnection = (ws: MockWebSocket, req = fakeReq()) => {
    wss.emit('connection', ws, req);
  };

  // ── Method A: URL Ticket ────────────────────────────────────────

  describe('Method A: URL ticket (legacy)', () => {
    it('should authenticate with valid URL ticket and send connection_ack', async () => {
      mockExtractTicket.mockReturnValue('valid-url-ticket');
      mockVerifyTicket.mockResolvedValue(validConnectionInfo);

      const ws = new MockWebSocket();
      emitConnection(ws);

      // Allow async verifyTicket to resolve
      await vi.advanceTimersByTimeAsync(0);

      // Should register connection
      expect(mockRegisterConnection).toHaveBeenCalledWith(ws, validConnectionInfo);

      // Should send connection_ack
      expect(ws.sent.length).toBeGreaterThanOrEqual(1);
      const ack = JSON.parse(ws.sent[0]);
      expect(ack.type).toBe('connection_ack');
      expect(ack.payload.connection_id).toBe('conn-abc-123');
      expect(ack.payload.heartbeat_interval_ms).toBe(25000);

      // Should NOT be closed
      expect(ws.closedWith).toBeNull();
    });

    it('should close with 4003 for invalid URL ticket', async () => {
      mockExtractTicket.mockReturnValue('invalid-ticket');
      mockVerifyTicket.mockResolvedValue(null);

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      expect(ws.closedWith).toEqual({
        code: 4003,
        reason: 'Invalid or expired ticket',
      });
      expect(mockRegisterConnection).not.toHaveBeenCalled();
    });

    it('should route frames sent while URL ticket verification is still pending', async () => {
      mockExtractTicket.mockReturnValue('valid-url-ticket');

      const hostConnectionInfo: ConnectionInfo = {
        ...validConnectionInfo,
        role: 'host',
        ownerId: 'owner-1',
        tokenId: 'token-1',
      };
      let resolveVerify!: (value: ConnectionInfo) => void;
      mockVerifyTicket.mockReturnValue(
        new Promise((resolve) => {
          resolveVerify = resolve;
        })
      );

      const hostRegisterFrame = {
        type: 'host_register',
        id: 'host-register-1',
        timestamp: '2026-04-28T00:00:00.000Z',
        payload: {
          host_id: 'host-1',
          host_type: 'local',
          display_name: 'Local Host',
          providers: [{ provider: 'openclaw', available: true }],
        },
      };
      mockValidateFrame.mockReturnValue({
        success: true,
        data: hostRegisterFrame,
      });

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);
      ws.emit('message', JSON.stringify(hostRegisterFrame));
      resolveVerify(hostConnectionInfo);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockRegisterConnection).toHaveBeenCalledWith(ws, hostConnectionInfo);
      expect(mockValidateFrame).toHaveBeenCalledWith(hostRegisterFrame);
      expect(mockRouteMessage).toHaveBeenCalledWith(ws, hostRegisterFrame, hostConnectionInfo);
    });
  });

  // ── Method B: Auth Frame ────────────────────────────────────────

  describe('Method B: Auth frame (OWASP-compliant)', () => {
    beforeEach(() => {
      // No URL ticket → triggers auth frame flow
      mockExtractTicket.mockReturnValue(null);
    });

    it('should authenticate with valid auth frame and send connection_ack', async () => {
      mockValidateFrame.mockReturnValue({
        success: true,
        data: validAuthFrame,
      });
      mockVerifyTicket.mockResolvedValue(validConnectionInfo);

      const ws = new MockWebSocket();
      emitConnection(ws);

      // Allow IP rate limit check to resolve
      await vi.advanceTimersByTimeAsync(0);

      // Send auth frame
      ws.emit('message', JSON.stringify(validAuthFrame));

      // Allow async verifyTicket to resolve
      await vi.advanceTimersByTimeAsync(0);

      // Should register connection
      expect(mockRegisterConnection).toHaveBeenCalledWith(ws, validConnectionInfo);

      // Should send connection_ack
      expect(ws.sent.length).toBeGreaterThanOrEqual(1);
      const ack = JSON.parse(ws.sent[0]);
      expect(ack.type).toBe('connection_ack');
      expect(ack.payload.connection_id).toBe('conn-abc-123');

      // Should NOT be closed
      expect(ws.closedWith).toBeNull();
    });

    it('should close with 4001 on auth timeout (3s)', async () => {
      const ws = new MockWebSocket();
      emitConnection(ws);

      // Allow IP rate limit to resolve
      await vi.advanceTimersByTimeAsync(0);

      // No auth frame sent — advance past 3s timeout
      await vi.advanceTimersByTimeAsync(3100);

      expect(ws.closedWith).toEqual({
        code: 4001,
        reason: 'Auth timeout: no ticket or auth frame received',
      });
    });

    it('should close with 4003 for auth frame with invalid ticket', async () => {
      mockValidateFrame.mockReturnValue({
        success: true,
        data: validAuthFrame,
      });
      mockVerifyTicket.mockResolvedValue(null);

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      ws.emit('message', JSON.stringify(validAuthFrame));
      await vi.advanceTimersByTimeAsync(0);

      expect(ws.closedWith).toEqual({
        code: 4003,
        reason: 'Invalid or expired ticket',
      });
    });

    it('should close with 4001 for invalid auth frame structure', async () => {
      mockValidateFrame.mockReturnValue({
        success: false,
        error: 'Missing payload.ticket',
      });

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      // Send a frame that has type: 'auth' but fails Zod validation
      ws.emit('message', JSON.stringify({ type: 'auth', timestamp: 'x' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(ws.closedWith).toEqual({
        code: 4001,
        reason: 'Invalid auth frame',
      });
    });

    it('should send error for non-auth frame during AUTH_PENDING', async () => {
      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      // Send a non-auth message during AUTH_PENDING
      ws.emit('message', JSON.stringify({ type: 'visitor_message', id: '1' }));
      await vi.advanceTimersByTimeAsync(0);

      // Should receive an error frame, not be closed yet
      expect(ws.closedWith).toBeNull();
      expect(ws.sent.length).toBe(1);

      const errFrame = JSON.parse(ws.sent[0]);
      expect(errFrame.type).toBe('error');
      expect(errFrame.payload.code).toBe('auth_required');
    });

    it('should merge session_token from auth frame into connectionInfo', async () => {
      const authFrameWithSession = {
        ...validAuthFrame,
        payload: { ticket: 'valid-jwt', session_token: 'sess_abc123' },
      };

      mockValidateFrame.mockReturnValue({
        success: true,
        data: authFrameWithSession,
      });
      mockVerifyTicket.mockResolvedValue(validConnectionInfo);

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      ws.emit('message', JSON.stringify(authFrameWithSession));
      await vi.advanceTimersByTimeAsync(0);

      // registerConnection should be called with enriched info including sessionToken
      expect(mockRegisterConnection).toHaveBeenCalledWith(
        ws,
        expect.objectContaining({
          sessionToken: 'sess_abc123',
        })
      );
    });
  });

  // ── IP Rate Limiting ────────────────────────────────────────────

  describe('IP Rate Limiting', () => {
    it('should close with 4008 when IP rate limited', async () => {
      mockCheckIpRateLimit.mockResolvedValue({ allowed: false });

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      expect(ws.closedWith).toEqual({
        code: 4008,
        reason: 'IP rate limit exceeded',
      });
    });

    it('should fail-open when IP rate limiter throws', async () => {
      mockCheckIpRateLimit.mockRejectedValue(new Error('Redis down'));
      mockExtractTicket.mockReturnValue('valid-ticket');
      mockVerifyTicket.mockResolvedValue(validConnectionInfo);

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      // Should not be closed — fail-open behavior
      expect(ws.closedWith).toBeNull();
      expect(mockRegisterConnection).toHaveBeenCalled();
    });
  });

  // ── Post-Auth Behavior ──────────────────────────────────────────

  describe('Post-Auth Behavior', () => {
    it('should silently ignore auth frames after authentication', async () => {
      mockExtractTicket.mockReturnValue('valid-url-ticket');
      mockVerifyTicket.mockResolvedValue(validConnectionInfo);
      mockValidateFrame.mockReturnValue({
        success: true,
        data: { type: 'auth', timestamp: 'x', payload: { ticket: 'y' } },
      });

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(0);

      const ackCount = ws.sent.length;

      // Send another auth frame after already authenticated
      ws.emit(
        'message',
        JSON.stringify({ type: 'auth', timestamp: 'x', payload: { ticket: 'y' } })
      );
      await vi.advanceTimersByTimeAsync(0);

      // No additional messages sent, no routeMessage called
      expect(ws.sent.length).toBe(ackCount);
      expect(mockRouteMessage).not.toHaveBeenCalled();
    });

    it('should drain offline queue for agent connections', async () => {
      const agentInfo = {
        ...validConnectionInfo,
        role: 'agent' as const,
        agentId: 'agent-xyz',
      };

      mockExtractTicket.mockReturnValue('agent-ticket');
      mockVerifyTicket.mockResolvedValue(agentInfo);
      mockDrainOfflineQueue.mockResolvedValue([
        {
          id: 'msg-1',
          timestamp: new Date().toISOString(),
          content: 'Hello',
          contentType: 'text',
          senderType: 'visitor',
          conversationId: 'conv-1',
          queuedAt: new Date().toISOString(),
        },
      ]);

      const ws = new MockWebSocket();
      emitConnection(ws);

      await vi.advanceTimersByTimeAsync(100);

      // Should have called drainOfflineQueue
      expect(mockDrainOfflineQueue).toHaveBeenCalledWith('agent-xyz');

      // Should have set agent online
      expect(mockSetAgentOnline).toHaveBeenCalledWith('agent-xyz');
    });
  });
});
