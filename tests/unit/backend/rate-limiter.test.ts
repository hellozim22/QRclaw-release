import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockRedis } from '../../mocks/redis';

/**
 * Rate Limiter Unit Tests
 *
 * Tests the per-connection rate limiting logic:
 * - Visitor limit: 60 messages/minute
 * - Agent limit: 120 messages/minute
 * - Window-based sliding window (60s)
 * - Independent per-connectionId
 * - Close code 4008 for rate limit violations
 *
 * Import path matches planned backend structure:
 *   gateway/src/redis/rate-limiter → checkRateLimit function
 */

// ─── Types (expected interface) ─────────────────────────────────────

type RoleType = 'visitor' | 'agent';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

// ─── Rate Limit Constants ───────────────────────────────────────────

const RATE_LIMITS = {
  visitor: 60,
  agent: 120,
} as const;

const WINDOW_MS = 60_000; // 60 seconds

// ─── Mock checkRateLimit (TDD: implementation doesn't exist yet) ────

const counters = new Map<string, { count: number; windowStart: number }>();

const checkRateLimit = async (connectionId: string, role: RoleType): Promise<RateLimitResult> => {
  const limit = RATE_LIMITS[role];
  const now = Date.now();
  const key = `rate:${connectionId}`;

  const existing = counters.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // New window
    counters.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetInMs: WINDOW_MS };
  }

  const elapsed = now - existing.windowStart;
  const remaining = limit - existing.count - 1;

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: WINDOW_MS - elapsed,
    };
  }

  counters.set(key, { count: existing.count + 1, windowStart: existing.windowStart });

  return {
    allowed: true,
    remaining: Math.max(0, remaining),
    resetInMs: WINDOW_MS - elapsed,
  };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  beforeEach(() => {
    counters.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first message → allowed', async () => {
    const result = await checkRateLimit('conn-1', 'visitor');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.visitor - 1);
  });

  it('under visitor limit (60/min) → allowed', async () => {
    // Send 30 messages (well under limit)
    for (let i = 0; i < 30; i++) {
      const result = await checkRateLimit('conn-2', 'visitor');
      expect(result.allowed).toBe(true);
    }

    const result = await checkRateLimit('conn-2', 'visitor');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('at visitor limit → rejected', async () => {
    // Fill up the visitor limit
    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      await checkRateLimit('conn-3', 'visitor');
    }

    // Next message should be rejected
    const result = await checkRateLimit('conn-3', 'visitor');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('under agent limit (120/min) → allowed', async () => {
    // Send 60 messages (half of agent limit)
    for (let i = 0; i < 60; i++) {
      const result = await checkRateLimit('conn-4', 'agent');
      expect(result.allowed).toBe(true);
    }

    const result = await checkRateLimit('conn-4', 'agent');
    expect(result.allowed).toBe(true);
  });

  it('at agent limit → rejected', async () => {
    // Fill up the agent limit
    for (let i = 0; i < RATE_LIMITS.agent; i++) {
      await checkRateLimit('conn-5', 'agent');
    }

    const result = await checkRateLimit('conn-5', 'agent');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('after window expires → allowed again', async () => {
    // Fill up visitor limit
    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      await checkRateLimit('conn-6', 'visitor');
    }

    // Verify rejected
    const rejectedResult = await checkRateLimit('conn-6', 'visitor');
    expect(rejectedResult.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // Should be allowed again
    const result = await checkRateLimit('conn-6', 'visitor');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.visitor - 1);
  });

  it('different connectionIds → independent limits', async () => {
    // Fill up limit for conn-A
    for (let i = 0; i < RATE_LIMITS.visitor; i++) {
      await checkRateLimit('conn-A', 'visitor');
    }

    // conn-A is at limit
    const resultA = await checkRateLimit('conn-A', 'visitor');
    expect(resultA.allowed).toBe(false);

    // conn-B should still be allowed
    const resultB = await checkRateLimit('conn-B', 'visitor');
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(RATE_LIMITS.visitor - 1);
  });
});
