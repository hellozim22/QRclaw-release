/**
 * Message deduplication via Redis SET NX
 * TTL 300s per §5.6 spec
 */
import { getRedisClient } from './client.js';

const DEDUP_PREFIX = 'dedup:msg:';
const DEDUP_TTL_SECONDS = 300;

/**
 * Check if a message ID has already been processed.
 * Returns true if the message is a duplicate.
 */
export const isDuplicate = async (messageId: string): Promise<boolean> => {
  const redis = getRedisClient();
  const key = `${DEDUP_PREFIX}${messageId}`;

  // SET NX returns 'OK' if key was set (new message), null if already exists (duplicate)
  const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
  return result === null;
};

/**
 * Mark a message ID as processed (used when processing via different path).
 */
export const markProcessed = async (messageId: string): Promise<void> => {
  const redis = getRedisClient();
  const key = `${DEDUP_PREFIX}${messageId}`;
  await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS);
};
