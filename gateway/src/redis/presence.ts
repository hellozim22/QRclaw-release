/**
 * Agent online presence tracking via Redis
 * Per §4.3: Heartbeat-based presence with last_seen timestamp.
 *
 * Each agent gets a Redis key `presence:agent:<agentId>` with TTL.
 * If the key expires, the agent is considered offline.
 */
import { getRedisClient, isRedisConnected } from './client.js';

const PRESENCE_PREFIX = 'presence:agent:';
const PRESENCE_TTL_SECONDS = 60; // Agent considered offline after 60s without heartbeat

/**
 * Mark an agent as online. Called on connection and on each heartbeat/message.
 */
export const setAgentOnline = async (agentId: string): Promise<void> => {
  if (!isRedisConnected()) return;

  const redis = getRedisClient();
  const key = `${PRESENCE_PREFIX}${agentId}`;
  const now = new Date().toISOString();

  await redis.set(key, now, 'EX', PRESENCE_TTL_SECONDS);
};

/**
 * Mark an agent as offline. Called on clean disconnect.
 */
export const setAgentOffline = async (agentId: string): Promise<void> => {
  if (!isRedisConnected()) return;

  const redis = getRedisClient();
  const key = `${PRESENCE_PREFIX}${agentId}`;
  await redis.del(key);
};

/**
 * Check if an agent is currently online.
 */
export const isAgentOnline = async (agentId: string): Promise<boolean> => {
  if (!isRedisConnected()) return false;

  const redis = getRedisClient();
  const key = `${PRESENCE_PREFIX}${agentId}`;
  const result = await redis.exists(key);
  return result === 1;
};

/**
 * Get the last_seen timestamp for an agent, or null if offline/unknown.
 */
export const getAgentLastSeen = async (agentId: string): Promise<string | null> => {
  if (!isRedisConnected()) return null;

  const redis = getRedisClient();
  const key = `${PRESENCE_PREFIX}${agentId}`;
  return redis.get(key);
};

/**
 * Refresh the presence TTL (called on each heartbeat ping).
 */
export const refreshPresence = async (agentId: string): Promise<void> => {
  await setAgentOnline(agentId);
};
