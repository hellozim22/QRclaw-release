/**
 * Offline message queue — Redis List per agent
 * Per §4.3: Queue messages for offline agents, drain on reconnect.
 *
 * Key format: offline:agent:<agentId>
 * Each entry is a JSON-serialized QueuedMessage.
 * Max 200 messages per agent, 24h TTL.
 */
import { getRedisClient, isRedisConnected } from './client.js';

const OFFLINE_PREFIX = 'offline:agent:';
const MAX_QUEUE_LENGTH = 200;
const QUEUE_TTL_SECONDS = 86400; // 24 hours

export interface QueuedMessage {
  id: string;
  timestamp: string;
  senderType: string;
  conversationId: string;
  content: string;
  contentType: string;
  queuedAt: string;
}

/**
 * Enqueue a message for an offline agent.
 * Returns true if enqueued, false if Redis unavailable.
 */
export const enqueueOfflineMessage = async (
  agentId: string,
  message: QueuedMessage
): Promise<boolean> => {
  if (!isRedisConnected()) return false;

  const redis = getRedisClient();
  const key = `${OFFLINE_PREFIX}${agentId}`;
  const serialized = JSON.stringify(message);

  const pipeline = redis.pipeline();
  pipeline.rpush(key, serialized);
  pipeline.ltrim(key, -MAX_QUEUE_LENGTH, -1); // Keep only last N messages
  pipeline.expire(key, QUEUE_TTL_SECONDS);
  await pipeline.exec();

  return true;
};

/**
 * Atomically drain all queued messages for an agent.
 * Uses a Lua script to LRANGE + DEL in one atomic operation.
 */
export const drainOfflineQueue = async (agentId: string): Promise<QueuedMessage[]> => {
  if (!isRedisConnected()) return [];

  const redis = getRedisClient();
  const key = `${OFFLINE_PREFIX}${agentId}`;

  const luaScript = `
    local msgs = redis.call('LRANGE', KEYS[1], 0, -1)
    redis.call('DEL', KEYS[1])
    return msgs
  `;

  const results = (await redis.eval(luaScript, 1, key)) as string[];

  if (!results || results.length === 0) return [];

  const messages: QueuedMessage[] = [];
  for (const raw of results) {
    try {
      messages.push(JSON.parse(raw) as QueuedMessage);
    } catch {
      console.warn('[OfflineQueue] Failed to parse queued message, skipping');
    }
  }

  return messages;
};

/**
 * Get the number of queued messages for an agent.
 */
export const getQueueLength = async (agentId: string): Promise<number> => {
  if (!isRedisConnected()) return 0;

  const redis = getRedisClient();
  const key = `${OFFLINE_PREFIX}${agentId}`;
  return redis.llen(key);
};
