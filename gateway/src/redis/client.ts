/**
 * Redis client — ioredis connection to standalone Redis
 * Desktop local mode: REDIS_DISABLED_FOR_DESKTOP=1 skips Redis entirely.
 */
import { Redis } from 'ioredis';
import { isRedisDisabledForDesktop } from '../desktop/mode.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (isRedisDisabledForDesktop()) {
    throw new Error('Redis is disabled in desktop local mode');
  }
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 10) {
          return null; // Stop retrying
        }
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    redisClient.on('close', () => {
      console.warn('[Redis] Connection closed');
    });
  }

  return redisClient;
};

export const connectRedis = async (): Promise<void> => {
  if (isRedisDisabledForDesktop()) {
    console.log('[Redis] Skipped — desktop local mode (in-memory registry)');
    return;
  }
  const client = getRedisClient();
  await client.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

export const isRedisConnected = (): boolean => {
  if (isRedisDisabledForDesktop()) {
    return true; // desktop uses in-memory registry; treat as connected for health
  }
  return redisClient?.status === 'ready';
};
