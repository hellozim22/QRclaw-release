/**
 * Connection registry — indexes active WebSocket connections for routing.
 * Enables lookup by connectionId, agentId, or sessionToken.
 *
 * Iron Rule C1: This is a pure routing data structure — no AI processing.
 */
import type { WebSocket } from 'ws';
import type { ConnectionInfo } from '../types/index.js';

export interface ConnectionEntry {
  ws: WebSocket;
  info: ConnectionInfo;
}

// Primary index: connectionId → entry
const byConnectionId = new Map<string, ConnectionEntry>();

// Secondary indexes for routing lookups
const byAgentId = new Map<string, Set<string>>();
const bySessionToken = new Map<string, string>();
const agentToQrCodes = new Map<string, Set<string>>();
const byQrCodeVisitors = new Map<string, Set<string>>();
const byOwnerId = new Map<string, Set<string>>();

export const registerConnection = (ws: WebSocket, info: ConnectionInfo): void => {
  byConnectionId.set(info.connectionId, { ws, info });

  if (info.role === 'agent' && info.agentId) {
    const existing = byAgentId.get(info.agentId) || new Set();
    existing.add(info.connectionId);
    byAgentId.set(info.agentId, existing);
  }

  if (info.sessionToken) {
    bySessionToken.set(info.sessionToken, info.connectionId);
  }

  if (info.role === 'agent' && info.agentId && info.qrCodeId) {
    const qrCodes = agentToQrCodes.get(info.agentId) || new Set();
    qrCodes.add(info.qrCodeId);
    agentToQrCodes.set(info.agentId, qrCodes);
  }

  if (info.role === 'visitor' && info.qrCodeId) {
    const visitors = byQrCodeVisitors.get(info.qrCodeId) || new Set();
    visitors.add(info.connectionId);
    byQrCodeVisitors.set(info.qrCodeId, visitors);
  }

  if (info.role === 'owner' && info.ownerId) {
    const owners = byOwnerId.get(info.ownerId) || new Set();
    owners.add(info.connectionId);
    byOwnerId.set(info.ownerId, owners);
  }
};

/**
 * @deprecated Visitor chat compatibility only. Owner-agent live streaming
 * moved to SSE via stream-hub; do not reintroduce owner-agent WS fanout here.
 */
export const getOwnerConnections = (ownerId: string): ConnectionEntry[] => {
  const connIds = byOwnerId.get(ownerId);
  if (!connIds) return [];
  const out: ConnectionEntry[] = [];
  for (const id of connIds) {
    const entry = byConnectionId.get(id);
    if (entry) out.push(entry);
  }
  return out;
};

/**
 * Register an agent for multiple QR codes in the routing map.
 * Used when agent connects - we query DB for all their QR codes and register them here.
 */
export const registerAgentForQrCodes = (agentId: string, qrCodeIds: string[]): void => {
  const qrCodes = agentToQrCodes.get(agentId) || new Set();
  for (const qrCodeId of qrCodeIds) {
    qrCodes.add(qrCodeId);
  }
  agentToQrCodes.set(agentId, qrCodes);
};

export const unregisterConnection = (connectionId: string): void => {
  const entry = byConnectionId.get(connectionId);
  if (!entry) return;

  const { info } = entry;
  byConnectionId.delete(connectionId);

  if (info.role === 'agent' && info.agentId) {
    const agentConns = byAgentId.get(info.agentId);
    if (agentConns) {
      agentConns.delete(connectionId);
      if (agentConns.size === 0) {
        byAgentId.delete(info.agentId);
        agentToQrCodes.delete(info.agentId);
      }
    }
  }

  if (info.sessionToken) {
    bySessionToken.delete(info.sessionToken);
  }

  if (info.role === 'visitor' && info.qrCodeId) {
    const visitors = byQrCodeVisitors.get(info.qrCodeId);
    if (visitors) {
      visitors.delete(connectionId);
      if (visitors.size === 0) {
        byQrCodeVisitors.delete(info.qrCodeId);
      }
    }
  }

  if (info.role === 'owner' && info.ownerId) {
    const owners = byOwnerId.get(info.ownerId);
    if (owners) {
      owners.delete(connectionId);
      if (owners.size === 0) byOwnerId.delete(info.ownerId);
    }
  }
};

export const getConnection = (connectionId: string): ConnectionEntry | undefined => {
  return byConnectionId.get(connectionId);
};

export const getAgentConnections = (agentId: string): ConnectionEntry[] => {
  const connIds = byAgentId.get(agentId);
  if (!connIds) return [];

  const entries: ConnectionEntry[] = [];
  for (const id of connIds) {
    const entry = byConnectionId.get(id);
    if (entry) entries.push(entry);
  }
  return entries;
};

export const getAgentConnectionIds = (agentId: string): string[] => {
  const connIds = byAgentId.get(agentId);
  if (!connIds) return [];
  return [...connIds];
};

export const getVisitorConnection = (sessionToken: string): ConnectionEntry | undefined => {
  const connId = bySessionToken.get(sessionToken);
  if (!connId) return undefined;
  return byConnectionId.get(connId);
};

export const getConnectionCount = (): number => byConnectionId.size;

/** Get QR code IDs served by a specific agent. */
export const getQrCodesForAgent = (agentId: string): string[] => {
  const qrCodes = agentToQrCodes.get(agentId);
  return qrCodes ? [...qrCodes] : [];
};

/**
 * Find agent connections that serve a specific QR code.
 */
export const getAgentForQrCode = (qrCodeId: string): ConnectionEntry[] => {
  const results: ConnectionEntry[] = [];
  for (const [agentId, qrCodes] of agentToQrCodes) {
    if (qrCodes.has(qrCodeId)) {
      results.push(...getAgentConnections(agentId));
    }
  }
  return results;
};

/**
 * Find all visitor connections for a specific QR code (conversation).
 */
export const getVisitorsForQrCode = (qrCodeId: string): ConnectionEntry[] => {
  const connIds = byQrCodeVisitors.get(qrCodeId);
  if (!connIds) return [];

  const entries: ConnectionEntry[] = [];
  for (const id of connIds) {
    const entry = byConnectionId.get(id);
    if (entry) entries.push(entry);
  }
  return entries;
};
