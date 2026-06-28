import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Production Smoke Tests — Health Check (Phase 7)
 *
 * Validates GET /health contract:
 * - Returns 200 + { status: 'ok' } when all dependencies healthy
 * - Returns 503 + { status: 'degraded' } when Redis disconnected
 * - Response shape matches HealthResponse type
 * - Uptime is a non-negative integer
 * - Timestamp is valid ISO 8601
 *
 * Mock-based: defines the contract for deployment verification.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  redis: 'connected' | 'disconnected';
}

// ─── Mock Health Service ────────────────────────────────────────────

const createHealthService = (deps: { redisConnected: boolean }) => {
  const startTime = Date.now();

  const getHealth = (): { httpStatus: number; body: HealthResponse } => {
    const redisStatus = deps.redisConnected ? 'connected' : 'disconnected';
    const status = redisStatus === 'connected' ? 'ok' : 'degraded';

    const body: HealthResponse = {
      status,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      redis: redisStatus,
    };

    const httpStatus = status === 'ok' ? 200 : 503;
    return { httpStatus, body };
  };

  return { getHealth };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Smoke: Health Check Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with status ok when Redis connected', () => {
    const svc = createHealthService({ redisConnected: true });
    const { httpStatus, body } = svc.getHealth();

    expect(httpStatus).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.redis).toBe('connected');
  });

  it('returns 503 with status degraded when Redis disconnected', () => {
    const svc = createHealthService({ redisConnected: false });
    const { httpStatus, body } = svc.getHealth();

    expect(httpStatus).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.redis).toBe('disconnected');
  });

  it('includes valid ISO 8601 timestamp', () => {
    const svc = createHealthService({ redisConnected: true });
    const { body } = svc.getHealth();

    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('includes non-negative integer uptime', () => {
    const svc = createHealthService({ redisConnected: true });
    const { body } = svc.getHealth();

    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime)).toBe(true);
  });

  it('response shape matches HealthResponse contract', () => {
    const svc = createHealthService({ redisConnected: true });
    const { body } = svc.getHealth();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('redis');
    expect(Object.keys(body)).toHaveLength(4);
  });
});
