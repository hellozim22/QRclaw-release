/**
 * IP-level rate limiter — the first tier of three-tier rate limiting.
 * Per Phase 6: Global IP → Per-connection → Per-message.
 *
 * Uses a simple Redis counter with fixed-window expiry.
 * Cheaper than sorted sets since IP-level does not need per-message granularity.
 */
import { getRedisClient, isRedisConnected } from './client.js';

const IP_RATE_LIMIT = 1000; // max requests per IP per minute (raised for test automation)
const IP_WINDOW_SECONDS = 60;
const KEY_PREFIX = 'rl:ip:';

export interface IpRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check IP-level rate limit using Redis INCR + EXPIRE.
 * Returns allowed=true if Redis is unavailable (fail-open for availability).
 */
export const checkIpRateLimit = async (ipAddress: string): Promise<IpRateLimitResult> => {
  if (!isRedisConnected()) {
    return {
      allowed: true,
      remaining: IP_RATE_LIMIT,
      resetAt: Date.now() + IP_WINDOW_SECONDS * 1000,
    };
  }

  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${ipAddress}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, IP_WINDOW_SECONDS, 'NX');

  const results = await pipeline.exec();

  if (!results) {
    return {
      allowed: true,
      remaining: IP_RATE_LIMIT,
      resetAt: Date.now() + IP_WINDOW_SECONDS * 1000,
    };
  }

  const count = (results[0]?.[1] as number) || 0;
  const allowed = count <= IP_RATE_LIMIT;
  const remaining = Math.max(0, IP_RATE_LIMIT - count);

  return {
    allowed,
    remaining,
    resetAt: Date.now() + IP_WINDOW_SECONDS * 1000,
  };
};
