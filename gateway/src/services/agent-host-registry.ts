import type {
  HostProviderCapability,
  OwnerAgentRunCancelFrame,
  OwnerAgentRunRequestFrame,
} from '../../../shared/contracts/ws/types.js';
import { sendFrame, type SendFrameResult } from '../ws/send.js';
import { markAgentHostOfflineRecord } from '../db/owner-agent-chat.js';
import { syncAgentRuntimesFromHostProviders } from '../db/owner-runtimes.js';

interface HostSocket {
  OPEN: number;
  readyState: number;
  bufferedAmount?: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export interface HostConnectionRegistration {
  hostId: string;
  ownerId: string;
  tokenId: string;
  connectionId?: string;
  providers?: HostProviderCapability[];
  ws: HostSocket;
}

interface HostConnection extends HostConnectionRegistration {
  connectedAt: string;
  lastSeenAt: string;
  providers: HostProviderCapability[];
}

const HOST_TOKEN_REVOKED_CLOSE_CODE = 4003;
const HOST_DUPLICATE_CLOSE_CODE = 4010;
const HOST_HEARTBEAT_TIMEOUT_MS = 90_000;
const hostConnections = new Map<string, HostConnection>();
const activeRuns = new Map<
  string,
  {
    hostId: string;
    conversationId: string;
    agentId: string;
    provider: OwnerAgentRunRequestFrame['payload']['provider'];
    correlationId: string;
    lastSeq: number;
  }
>();
const pendingDispatches = new Map<string, OwnerAgentRunRequestFrame[]>();

export const registerHostConnection = (registration: HostConnectionRegistration): void => {
  const existing = hostConnections.get(registration.hostId);
  if (existing && existing.ws !== registration.ws && existing.ws.readyState === existing.ws.OPEN) {
    existing.ws.close(HOST_DUPLICATE_CLOSE_CODE, 'Replaced by a newer host connection');
  }

  const now = new Date().toISOString();
  hostConnections.set(registration.hostId, {
    ...registration,
    connectedAt: now,
    lastSeenAt: now,
    providers: registration.providers ?? [],
  });
  flushPendingDispatches(registration.hostId);
};

export const unregisterHostConnection = (hostId: string): void => {
  hostConnections.delete(hostId);
};

export const unregisterHostConnectionByConnectionId = (connectionId: string): string | null => {
  for (const [hostId, connection] of hostConnections) {
    if (connection.connectionId === connectionId) {
      hostConnections.delete(hostId);
      return hostId;
    }
  }
  return null;
};

export const hasHostConnection = (hostId: string): boolean => hostConnections.has(hostId);

export const getHostConnection = (hostId: string): HostConnection | undefined =>
  hostConnections.get(hostId);

const isHostSocketOpen = (connection: HostConnection): boolean =>
  connection.ws.readyState === connection.ws.OPEN;

export const countHostConnectionsForOwner = (ownerId: string): number => {
  let count = 0;
  for (const connection of hostConnections.values()) {
    if (connection.ownerId === ownerId && isHostSocketOpen(connection)) {
      count += 1;
    }
  }
  return count;
};

/** Live WS provider snapshot (may be ahead of DB sync). */
export const getLiveProviderStatusForOwner = (
  ownerId: string
): Map<HostProviderCapability['provider'], 'online' | 'offline'> => {
  const providers = new Map<HostProviderCapability['provider'], 'online' | 'offline'>();
  for (const connection of hostConnections.values()) {
    if (connection.ownerId !== ownerId || !isHostSocketOpen(connection)) {
      continue;
    }
    for (const provider of connection.providers) {
      const live =
        provider.status === 'available' || provider.status === 'online' ? 'online' : 'offline';
      if (live === 'online') {
        providers.set(provider.provider, 'online');
      } else if (!providers.has(provider.provider)) {
        providers.set(provider.provider, 'offline');
      }
    }
  }
  return providers;
};

export const touchHostConnection = (
  hostId: string,
  activeRunIds: string[] = [],
  now = new Date().toISOString()
): boolean => {
  const connection = hostConnections.get(hostId);
  if (!connection) {
    return false;
  }
  connection.lastSeenAt = now;

  for (const [runId, active] of activeRuns) {
    if (active.hostId === hostId && !activeRunIds.includes(runId)) {
      activeRuns.delete(runId);
    }
  }
  return true;
};

export const updateHostCapabilities = (
  hostId: string,
  providers: HostProviderCapability[],
  now = new Date().toISOString()
): boolean => {
  const connection = hostConnections.get(hostId);
  if (!connection) {
    return false;
  }
  connection.providers = providers;
  connection.lastSeenAt = now;
  return true;
};

export const revokeHostConnection = (hostId: string): boolean => {
  const connection = hostConnections.get(hostId);
  if (!connection) {
    return false;
  }

  hostConnections.delete(hostId);
  if (connection.ws.readyState === connection.ws.OPEN) {
    connection.ws.close(HOST_TOKEN_REVOKED_CLOSE_CODE, 'host token revoked');
  }
  return true;
};

export type HostDispatchResult = SendFrameResult | 'queued';

export const sendRunToHost = (
  hostId: string,
  frame: OwnerAgentRunRequestFrame
): HostDispatchResult => dispatchRunFrame(hostId, frame);

export const dispatchRunFrame = (
  hostId: string,
  frame: OwnerAgentRunRequestFrame
): HostDispatchResult => {
  const connection = hostConnections.get(hostId);
  if (!connection) {
    queueDispatch(hostId, frame);
    return 'queued';
  }

  const result = sendFrame(connection.ws as never, frame, {
    connectionId: connection.connectionId,
  });
  if (result === 'sent') {
    trackActiveRun(hostId, frame);
    return result;
  }
  if (result === 'dropped_backpressure' || result === 'closed') {
    queueDispatch(hostId, frame);
    return 'queued';
  }
  return result;
};

export const recordRunAccepted = (
  hostId: string,
  runId: string,
  payload: {
    conversationId: string;
    agentId: string;
    provider: OwnerAgentRunRequestFrame['payload']['provider'];
    correlationId: string;
  }
): void => {
  activeRuns.set(runId, {
    hostId,
    conversationId: payload.conversationId,
    agentId: payload.agentId,
    provider: payload.provider,
    correlationId: payload.correlationId,
    lastSeq: activeRuns.get(runId)?.lastSeq ?? 0,
  });
};

export const getLastRunSeq = (runId: string): number => activeRuns.get(runId)?.lastSeq ?? 0;

export const recordRunSeq = (runId: string, seq: number): void => {
  const active = activeRuns.get(runId);
  if (active) {
    active.lastSeq = seq;
  }
};

export const clearActiveRun = (runId: string): void => {
  activeRuns.delete(runId);
};

export const cancelRunsForConversation = (conversationId: string, reason: string): number => {
  let cancelled = 0;
  for (const [runId, run] of [...activeRuns]) {
    if (run.conversationId !== conversationId) {
      continue;
    }

    const connection = hostConnections.get(run.hostId);
    if (connection) {
      const frame: OwnerAgentRunCancelFrame = {
        type: 'owner_agent_run_cancel',
        timestamp: new Date().toISOString(),
        payload: {
          run_id: runId,
          conversation_id: run.conversationId,
          agent_id: run.agentId,
          provider: run.provider,
          correlation_id: run.correlationId,
          reason,
          requested_by: 'gateway',
        },
      };
      sendFrame(connection.ws as never, frame, { connectionId: connection.connectionId });
      cancelled += 1;
    }
    activeRuns.delete(runId);
  }

  for (const [hostId, frames] of pendingDispatches) {
    const kept = frames.filter((frame) => frame.payload.conversation_id !== conversationId);
    if (kept.length === 0) {
      pendingDispatches.delete(hostId);
    } else {
      pendingDispatches.set(hostId, kept);
    }
  }

  return cancelled;
};

export const cleanupStaleHostConnections = async (nowMs = Date.now()): Promise<void> => {
  for (const [hostId, connection] of [...hostConnections]) {
    if (nowMs - Date.parse(connection.lastSeenAt) <= HOST_HEARTBEAT_TIMEOUT_MS) {
      continue;
    }
    hostConnections.delete(hostId);
    if (connection.ws.readyState === connection.ws.OPEN) {
      connection.ws.close(HOST_TOKEN_REVOKED_CLOSE_CODE, 'host heartbeat timeout');
    }
    await markAgentHostOfflineRecord(hostId);
  }
};

export const markHostOffline = (hostId: string): void => {
  const ownerId = hostConnections.get(hostId)?.ownerId;
  void markAgentHostOfflineRecord(hostId)
    .then(async () => {
      if (ownerId) {
        await syncAgentRuntimesFromHostProviders(ownerId);
      }
    })
    .catch((err) => {
      console.error('[AgentHostRegistry] Failed to mark host offline:', (err as Error).message);
    });
};

export const getPendingDispatchCountForTest = (hostId: string): number =>
  pendingDispatches.get(hostId)?.length ?? 0;

export const clearHostConnectionsForTest = (): void => {
  hostConnections.clear();
  activeRuns.clear();
  pendingDispatches.clear();
};

const trackActiveRun = (hostId: string, frame: OwnerAgentRunRequestFrame): void => {
  activeRuns.set(frame.payload.run_id, {
    hostId,
    conversationId: frame.payload.conversation_id,
    agentId: frame.payload.agent_id,
    provider: frame.payload.provider,
    correlationId: frame.payload.correlation_id,
    lastSeq: 0,
  });
};

const queueDispatch = (hostId: string, frame: OwnerAgentRunRequestFrame): void => {
  const queue = pendingDispatches.get(hostId) ?? [];
  queue.push(frame);
  pendingDispatches.set(hostId, queue);
};

const flushPendingDispatches = (hostId: string): void => {
  const frames = pendingDispatches.get(hostId);
  if (!frames || frames.length === 0) {
    return;
  }
  pendingDispatches.delete(hostId);
  for (const frame of frames) {
    const result = dispatchRunFrame(hostId, frame);
    if (result === 'queued') {
      break;
    }
  }
};
