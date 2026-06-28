/**
 * Health check & metrics endpoints
 * GET /health → { status, uptime, timestamp, redis }
 * GET /metrics → { metrics, perfEnabled } (requires METRICS_BEARER_TOKEN)
 */
import { Router } from 'express';
import { isRedisConnected } from '../redis/client.js';
import { getMetrics } from '../monitoring/perf.js';
import { isEnabled as isPerfEnabled } from '../monitoring/perf.js';
import { getCounters } from '../monitoring/metrics.js';
import type { HealthResponse } from '../types/index.js';

const router = Router();

const startTime = Date.now();

router.get('/health', (_req, res) => {
  const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
  const status = redisStatus === 'connected' ? 'ok' : 'degraded';

  const response: HealthResponse = {
    status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    redis: redisStatus,
  };

  const httpStatus = status === 'ok' ? 200 : 503;
  res.status(httpStatus).json({
    ...response,
    qrclawBundle: process.env.QRCLAW_BUNDLE_MARKER === 'ai.qrclaw.desktop',
    bundleMarker: process.env.QRCLAW_BUNDLE_MARKER ?? null,
  });
});

/**
 * Metrics endpoint — requires Bearer token via METRICS_BEARER_TOKEN env var.
 * Returns 401 if token is not configured or does not match.
 */
router.get('/metrics', (req, res) => {
  const expectedToken = process.env.METRICS_BEARER_TOKEN;

  if (!expectedToken) {
    res.status(503).json({
      error: { code: 'metrics_disabled', message: 'METRICS_BEARER_TOKEN not configured' },
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedToken) {
    res
      .status(401)
      .json({ error: { code: 'unauthorized', message: 'Invalid or missing Bearer token' } });
    return;
  }

  res.json({
    perfEnabled: isPerfEnabled(),
    metrics: getMetrics(),
    counters: getCounters(),
  });
});

export { router as healthRouter };
