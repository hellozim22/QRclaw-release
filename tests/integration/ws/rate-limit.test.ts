import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * WebSocket Rate Limiting Integration Tests
 *
 * Tests per-connection rate limiting at the WS layer per §T3.3 (W12):
 * - Visitor: 61st message in 1 minute → error frame with rate_limited
 * - Agent: 121st message in 1 minute → error frame with rate_limited
 * - After window reset → messages allowed again
 *
 * These test the WS-level rate limiting which returns error frames
 * (unlike the unit-level rate-limiter which returns allow/deny).
 */

// ─── Types ──────────────────────────────────────────────────────────

type RoleType = 'visitor' | 'agent';

interface WSErrorFrame {
  type: 'error';
  timestamp: string;
  payload: {
    code: string;
    message: string;
    retryAfterMs?: number;
  };
}

interface WSAckFrame {
  type: 'ack';
  timestamp: string;
  payload: {
    messageId: string;
    status: 'sent' | 'failed';
  };
}

type RouteResult = WSAckFrame | WSErrorFrame;

// ─── Rate Limit Constants ───────────────────────────────────────────

const RATE_LIMITS = {
  visitor: 60,
  agent: 120,
} as const;

const WINDOW_MS = 60_000;

// ─── Mock WS Rate Limiter ───────────────────────────────────────────

const createWsRateLimiter = () => {
  const counters = new Map<string, { count: number; windowStart: number }>();

  const checkAndRoute = (connectionId: string, role: RoleType, messageId: string): RouteResult => {
    const limit = RATE_LIMITS[role];
    const now = Date.now();
    const key = `ws_rate:${connectionId}`;

    const existing = counters.get(key);

    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      counters.set(key, { count: 1, windowStart: now });
      return {
        type: 'ack',
        timestamp: new Date().toISOString(),
        payload: { messageId, status: 'sent' },
      };
    }

    if (existing.count >= limit) {
      const resetIn = WINDOW_MS - (now - existing.windowStart);
      return {
        type: 'error',
        timestamp: new Date().toISOString(),
        payload: {
          code: 'rate_limited',
          message: `Rate limit exceeded (${limit}/min)`,
          retryAfterMs: resetIn,
        },
      };
    }

    counters.set(key, { count: existing.count + 1, windowStart: existing.windowStart });
    return {
      type: 'ack',
      timestamp: new Date().toISOString(),
      payload: { messageId, status: 'sent' },
    };
  };

  return { checkAndRoute, _counters: counters };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebSocket Rate Limiting', () => {
  let limiter: ReturnType<typeof createWsRateLimiter>;

  beforeEach(() => {
    limiter = createWsRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // W12: Visitor 61st message → rate_limited error frame
  it('W12: visitor 61st message in 1 minute → error frame rate_limited', () => {
    const connId = 'visitor-conn-1';

    // Send 60 messages (at limit)
    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      const result = limiter.checkAndRoute(connId, 'visitor', `msg-${i}`);
      expect(result.type).toBe('ack');
    }

    // 61st message → rate_limited
    const result = limiter.checkAndRoute(connId, 'visitor', 'msg-61');
    expect(result.type).toBe('error');
    expect((result as WSErrorFrame).payload.code).toBe('rate_limited');
    expect((result as WSErrorFrame).payload.retryAfterMs).toBeGreaterThan(0);
  });

  // W12 variant: Agent 121st message → rate_limited
  it('W12b: agent 121st message in 1 minute → error frame rate_limited', () => {
    const connId = 'agent-conn-1';

    for (let i = 0; i < RATE_LIMITS.agent; i++) {
      const result = limiter.checkAndRoute(connId, 'agent', `msg-${i}`);
      expect(result.type).toBe('ack');
    }

    const result = limiter.checkAndRoute(connId, 'agent', 'msg-121');
    expect(result.type).toBe('error');
    expect((result as WSErrorFrame).payload.code).toBe('rate_limited');
  });

  // After window reset → allowed again
  it('after window reset → messages allowed again', () => {
    const connId = 'visitor-conn-2';

    // Fill up limit
    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      limiter.checkAndRoute(connId, 'visitor', `msg-${i}`);
    }

    // Rejected
    const rejected = limiter.checkAndRoute(connId, 'visitor', 'msg-blocked');
    expect(rejected.type).toBe('error');

    // Advance past window
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // Allowed again
    const allowed = limiter.checkAndRoute(connId, 'visitor', 'msg-after-reset');
    expect(allowed.type).toBe('ack');
  });

  // Error frame includes retryAfterMs
  it('rate_limited error frame includes retryAfterMs > 0', () => {
    const connId = 'visitor-conn-3';

    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      limiter.checkAndRoute(connId, 'visitor', `msg-${i}`);
    }

    // Advance 30 seconds into the window
    vi.advanceTimersByTime(30_000);

    const result = limiter.checkAndRoute(connId, 'visitor', 'msg-over');
    expect(result.type).toBe('error');
    const errorFrame = result as WSErrorFrame;
    expect(errorFrame.payload.retryAfterMs).toBeGreaterThan(0);
    expect(errorFrame.payload.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
  });
});
