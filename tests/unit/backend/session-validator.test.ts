import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRedis } from '../../mocks/redis';

/**
 * Session Validator Unit Tests
 *
 * Tests the visitor session validation logic:
 * - Session tokens are stored in Redis as `session:<token>`
 * - Sessions have TTL (default 24h)
 * - Validates session existence and extracts metadata
 *
 * Import path matches planned backend structure:
 *   gateway/src/ws/auth → validateSession function
 */

// ─── Types (expected interface) ─────────────────────────────────────

interface SessionData {
  visitorId: string;
  qrCodeId: string;
  agentId: string;
  createdAt: string;
}

interface SessionValidResult {
  valid: true;
  session: SessionData;
}

interface SessionInvalidResult {
  valid: false;
  reason: string;
}

type SessionResult = SessionValidResult | SessionInvalidResult;

// ─── Mock validateSession (TDD: implementation doesn't exist yet) ───

const validateSession = async (
  sessionToken: string,
  redis: ReturnType<typeof createMockRedis>
): Promise<SessionResult> => {
  if (!sessionToken || typeof sessionToken !== 'string') {
    return { valid: false, reason: 'missing_session_token' };
  }

  if (!sessionToken.startsWith('sess_')) {
    return { valid: false, reason: 'invalid_session_format' };
  }

  const key = `session:${sessionToken}`;
  const raw = await redis.get(key);

  if (!raw) {
    return { valid: false, reason: 'session_expired_or_not_found' };
  }

  try {
    const session = JSON.parse(raw) as SessionData;
    return { valid: true, session };
  } catch {
    return { valid: false, reason: 'corrupted_session_data' };
  }
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('validateSession', () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    vi.restoreAllMocks();
  });

  it('valid session token → returns session data', async () => {
    const sessionData: SessionData = {
      visitorId: 'visitor-001',
      qrCodeId: 'qr-001',
      agentId: 'agent-001',
      createdAt: '2026-03-13T00:00:00.000Z',
    };
    await redis.setex('session:sess_valid123', 86400, JSON.stringify(sessionData));

    const result = await validateSession('sess_valid123', redis);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.session.visitorId).toBe('visitor-001');
      expect(result.session.qrCodeId).toBe('qr-001');
      expect(result.session.agentId).toBe('agent-001');
    }
  });

  it('expired session → rejected', async () => {
    // Don't store anything — simulates expired TTL
    const result = await validateSession('sess_expired456', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('session_expired_or_not_found');
    }
  });

  it('missing session token (empty string) → rejected', async () => {
    const result = await validateSession('', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('missing_session_token');
    }
  });

  it('invalid session format (no sess_ prefix) → rejected', async () => {
    const result = await validateSession('invalid_token', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_session_format');
    }
  });

  it('corrupted session data in Redis → rejected', async () => {
    await redis.setex('session:sess_corrupt', 86400, 'not-valid-json{{{');

    const result = await validateSession('sess_corrupt', redis);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('corrupted_session_data');
    }
  });

  it('session with all fields populated → extracts correctly', async () => {
    const sessionData: SessionData = {
      visitorId: 'visitor-999',
      qrCodeId: 'qr-abc',
      agentId: 'agent-xyz',
      createdAt: '2026-03-12T12:00:00.000Z',
    };
    await redis.setex('session:sess_full', 86400, JSON.stringify(sessionData));

    const result = await validateSession('sess_full', redis);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.session).toEqual(sessionData);
    }
  });
});
