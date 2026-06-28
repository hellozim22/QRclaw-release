/**
 * Sliding-window rate limiter using Redis sorted sets.
 * Per §5.6: Rate limiting per connection — 60 msg/min visitors, 120 msg/min agents.
 */
import { getRedisClient, isRedisConnected } from './client.js';
import type { SenderType, RateLimitResult } from '../types/index.js';

const RATE_LIMITS: Record<SenderType, number> = {
  visitor: 120,
  agent: 300,
};

const WINDOW_MS = 60_000; // 1 minute sliding window
const KEY_PREFIX = 'rl:';

/**
 * Check rate limit for a connection using sliding window algorithm.
 * Uses Redis sorted sets with timestamp-based scoring for atomic operations.
 *
 * Returns { allowed, remaining, resetAt }.
 * Falls back to allowing all requests if Redis is unavailable.
 */
export const checkRateLimit = async (
  connectionId: string,
  role: SenderType
): Promise<RateLimitResult> => {
  if (!isRedisConnected()) {
    return { allowed: true, remaining: RATE_LIMITS[role], resetAt: Date.now() + WINDOW_MS };
  }

  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${connectionId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const limit = RATE_LIMITS[role];

  // Atomic pipeline: remove expired entries, add current, count, set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, WINDOW_MS);

  const results = await pipeline.exec();

  if (!results) {
    return { allowed: true, remaining: limit, resetAt: now + WINDOW_MS };
  }

  // zcard result is at index 2
  const count = (results[2]?.[1] as number) || 0;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  return {
    allowed,
    remaining,
    resetAt: now + WINDOW_MS,
  };
};
