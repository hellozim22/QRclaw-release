/**
 * WebSocket connection handler
 * Per §4: Agent and Visitor WebSocket connections
 *
 * Supports dual authentication:
 *   Method A (legacy): ticket in URL query params
 *   Method B (OWASP): auth frame sent after onopen
 */
import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { extractTicket, verifyTicket } from './auth.js';
import { routeMessage } from './router.js';
import {
  registerConnection,
  unregisterConnection,
  getConnectionCount as registryGetConnectionCount,
  registerAgentForQrCodes,
  getAgentConnections,
} from './registry.js';
import { WS_CLOSE_CODES } from '../types/index.js';
import type { WSFrame, ConnectionInfo } from '../types/index.js';
import type {
  ConnectionAckFrame,
  ErrorFrame as OutboundErrorFrame,
  MessageFrame,
} from '../../../shared/contracts/ws/types.js';
import { setAgentOnline, setAgentOffline, refreshPresence } from '../redis/presence.js';
import { drainOfflineQueue } from '../redis/offline-queue.js';
import { validateFrame } from './schemas.js';
import { checkIpRateLimit } from '../redis/ip-rate-limiter.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { sendFrame } from './send.js';
import {
  cleanupStaleHostConnections,
  markHostOffline,
  unregisterHostConnectionByConnectionId,
} from '../services/agent-host-registry.js';

const HEARTBEAT_INTERVAL_MS = 25000;
const MAX_FRAME_SIZE = 64 * 1024; // 64 KB per spec
const AUTH_TIMEOUT_MS = 3000; // 3s window for auth frame
type PendingMessage = Buffer | string;

interface PendingMessageBuffer {
  take: () => PendingMessage[];
  discard: () => void;
}

/**
 * Fetch all QR code IDs owned by an agent from the database.
 * This is needed to populate the agent→qrCode routing map on connection.
 */
const getAgentQrCodeIds = async (agentId: string): Promise<string[]> => {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from('qrcodes')
      .select('id')
      .eq('agent_id', agentId)
      .eq('status', 'active');

    if (error) {
      console.error(`[WSS] Failed to fetch QR codes for agent ${agentId}:`, error.message);
      return [];
    }

    return (data || []).map((row) => row.id);
  } catch (err) {
    console.error(`[WSS] Error fetching agent QR codes:`, (err as Error).message);
    return [];
  }
};

export const getConnectionCount = (): number => registryGetConnectionCount();

export const setupWebSocketServer = (server: Server): WebSocketServer => {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_FRAME_SIZE,
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleConnection(ws, req);
  });

  wss.on('error', (err: Error) => {
    console.error('[WSS] Server error:', err.message);
  });

  console.log('[WSS] WebSocket server initialized on /ws');
  return wss;
};

const handleConnection = async (ws: WebSocket, req: IncomingMessage): Promise<void> => {
  // Method A clients can send their first business frame immediately after
  // the WS handshake. Buffer those frames while async ticket verification runs.
  const urlTicket = extractTicket(req);
  const pendingUrlTicketMessages = urlTicket ? bufferPendingMessages(ws) : undefined;

  // Tier 1: IP-level rate limiting (before any ticket processing)
  const clientIp = extractClientIp(req);
  try {
    const ipResult = await checkIpRateLimit(clientIp);
    if (!ipResult.allowed) {
      pendingUrlTicketMessages?.discard();
      ws.close(WS_CLOSE_CODES.RATE_LIMITED, 'IP rate limit exceeded');
      return;
    }
  } catch {
    // IP rate limit failure should not block connections (fail-open)
  }

  // ── Method A: URL ticket (legacy clients) ──────────────────────
  if (urlTicket) {
    const connectionInfo = await verifyTicket(urlTicket);
    if (!connectionInfo) {
      pendingUrlTicketMessages?.discard();
      ws.close(WS_CLOSE_CODES.INVALID_TICKET, 'Invalid or expired ticket');
      return;
    }
    await completeAuth(ws, connectionInfo, pendingUrlTicketMessages?.take);
    return;
  }

  // ── Method B: Auth frame (OWASP-compliant, new clients) ────────
  // No URL ticket → enter AUTH_PENDING state, wait for auth frame
  awaitAuthFrame(ws);
};

/**
 * AUTH_PENDING state: buffer messages, wait up to AUTH_TIMEOUT_MS for
 * an auth frame. If it arrives and verifies, complete authentication.
 * If timeout or invalid, close with appropriate code.
 */
const awaitAuthFrame = (ws: WebSocket): void => {
  let resolved = false;

  const authTimeout = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(WS_CLOSE_CODES.MISSING_TICKET, 'Auth timeout: no ticket or auth frame received');
    }
  }, AUTH_TIMEOUT_MS);

  const onMessage = async (data: Buffer | string): Promise<void> => {
    if (resolved) return;

    // Parse JSON
    let raw: unknown;
    try {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      raw = JSON.parse(text);
    } catch {
      // Non-JSON during auth pending → ignore (timeout will close)
      return;
    }

    // Check if this is an auth frame
    if (
      typeof raw === 'object' &&
      raw !== null &&
      (raw as Record<string, unknown>).type === 'auth'
    ) {
      resolved = true;
      clearTimeout(authTimeout);
      ws.removeListener('message', onMessage);
      ws.removeListener('close', onClose);

      // Validate auth frame structure via Zod
      const validation = validateFrame(raw);
      if (!validation.success) {
        ws.close(WS_CLOSE_CODES.MISSING_TICKET, 'Invalid auth frame');
        return;
      }

      const authPayload = (validation.data as Record<string, unknown>).payload as {
        ticket: string;
        session_token?: string;
      };

      const connectionInfo = await verifyTicket(authPayload.ticket);
      if (!connectionInfo) {
        ws.close(WS_CLOSE_CODES.INVALID_TICKET, 'Invalid or expired ticket');
        return;
      }

      // Merge session_token from auth frame if provided
      const enrichedInfo: ConnectionInfo = authPayload.session_token
        ? { ...connectionInfo, sessionToken: authPayload.session_token }
        : connectionInfo;

      await completeAuth(ws, enrichedInfo);
      return;
    }

    // Non-auth frame during AUTH_PENDING → send error, keep waiting.
    // No `connectionId` yet: the socket is pre-registration, so sendFrame
    // receives `undefined` (its structured-log metadata will omit the field).
    const errorFrame: OutboundErrorFrame = {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: {
        code: 'auth_required',
        message: 'Authentication required. Send an auth frame first.',
      },
    };
    sendFrame(ws, errorFrame);
  };

  const onClose = (): void => {
    if (resolved) return;
    resolved = true;
    clearTimeout(authTimeout);
  };

  ws.on('message', onMessage);
  ws.on('close', onClose);
};

const bufferPendingMessages = (ws: WebSocket): PendingMessageBuffer => {
  const messages: PendingMessage[] = [];
  let buffering = true;

  const onMessage = (data: PendingMessage): void => {
    if (!buffering) return;
    messages.push(data);
  };

  ws.on('message', onMessage);

  const stop = (): PendingMessage[] => {
    if (!buffering) return [];
    buffering = false;
    ws.removeListener('message', onMessage);
    return messages.splice(0);
  };

  return {
    take: stop,
    discard: () => {
      stop();
    },
  };
};

/**
 * Complete authentication: register, send connection_ack, set up
 * heartbeat, message handler, and close handler.
 * Shared by both Method A (URL ticket) and Method B (auth frame).
 */
const completeAuth = async (
  ws: WebSocket,
  connectionInfo: ConnectionInfo,
  takePendingMessages?: () => PendingMessage[]
): Promise<void> => {
  // For agent connections, fetch all QR codes from database and populate routing map
  if (connectionInfo.role === 'host') {
    registerConnection(ws, connectionInfo);
  } else if (connectionInfo.role === 'agent' && connectionInfo.agentId) {
    const existingConnections = getAgentConnections(connectionInfo.agentId);
    for (const existing of existingConnections) {
      if (existing.ws !== ws) {
        try {
          existing.ws.close(
            WS_CLOSE_CODES.DUPLICATE_CONNECTION,
            'Replaced by a newer agent runtime'
          );
        } catch {
          // Best effort: close old runtime before registering the new one.
        }
        unregisterConnection(existing.info.connectionId);
      }
    }

    const qrCodeIds = await getAgentQrCodeIds(connectionInfo.agentId);
    console.log(`[WSS] Agent ${connectionInfo.agentId} serves ${qrCodeIds.length} QR codes`);

    // Register the agent connection once (no qrCodeId in connectionInfo)
    registerConnection(ws, connectionInfo);

    // Manually populate agent→qrCode routing map for all QR codes
    // This enables getAgentForQrCode() to find this agent for any of its QR codes
    if (qrCodeIds.length > 0) {
      registerAgentForQrCodes(connectionInfo.agentId, qrCodeIds);
    }
  } else {
    // Visitor connections register normally (already have qrCodeId in ticket)
    registerConnection(ws, connectionInfo);
  }

  // Mark agent as online in Redis presence tracker
  if (connectionInfo.role === 'agent' && connectionInfo.agentId) {
    setAgentOnline(connectionInfo.agentId).catch((err) => {
      console.error(`[WSS] Presence set error:`, (err as Error).message);
    });
  }

  console.log(`[WSS] New connection: ${connectionInfo.connectionId} (${connectionInfo.role})`);

  // Send connection_ack — T3e: typed frame routed through `sendFrame` so the
  // outbound Zod schema + backpressure guard apply here too.
  const ackFrame: ConnectionAckFrame = {
    type: 'connection_ack',
    timestamp: new Date().toISOString(),
    payload: {
      connection_id: connectionInfo.connectionId,
      heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
      server_time: new Date().toISOString(),
    },
  };
  sendFrame(ws, ackFrame, { connectionId: connectionInfo.connectionId });

  // Drain offline message queue for reconnecting agents
  if (connectionInfo.role === 'agent' && connectionInfo.agentId) {
    drainOfflineQueue(connectionInfo.agentId)
      .then((queued) => {
        for (const msg of queued) {
          // T3d: typed frame — `queued_at` is declared optional on
          // `MessageFrame.payload` (D4) so drain emissions no longer need
          // a cast. `sendFrame` owns the readyState check, dropping the
          // outer `WebSocket.OPEN` guard (parity with T3c E1 migration).
          const messageFrame: MessageFrame = {
            type: 'message',
            id: msg.id,
            timestamp: msg.timestamp,
            payload: {
              content: msg.content,
              content_type: msg.contentType as MessageFrame['payload']['content_type'],
              sender_type: msg.senderType as MessageFrame['payload']['sender_type'],
              conversation_id: msg.conversationId,
              queued_at: msg.queuedAt,
            },
          };
          sendFrame(ws, messageFrame, { connectionId: connectionInfo.connectionId });
        }
        if (queued.length > 0) {
          console.log(
            `[WSS] Delivered ${queued.length} queued messages to agent ${connectionInfo.agentId}`
          );
        }
      })
      .catch((err) => {
        console.error(`[WSS] Offline queue drain error:`, (err as Error).message);
      });
  }

  // Setup heartbeat
  const heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      // Refresh agent presence TTL on each heartbeat
      if (connectionInfo.role === 'agent' && connectionInfo.agentId) {
        refreshPresence(connectionInfo.agentId).catch(() => {});
      }
      if (connectionInfo.role === 'host') {
        cleanupStaleHostConnections().catch(() => {});
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Message handler (auth frames after authentication are silently ignored)
  const pendingMessages = takePendingMessages?.() ?? [];
  ws.on('message', (data: Buffer | string) => {
    handleMessage(ws, data, connectionInfo);
  });
  for (const data of pendingMessages) {
    handleMessage(ws, data, connectionInfo);
  }

  // Close handler
  ws.on('close', (code: number, reason: Buffer) => {
    clearInterval(heartbeatTimer);
    unregisterConnection(connectionInfo.connectionId);
    // Mark agent as offline in Redis presence tracker
    if (connectionInfo.role === 'agent' && connectionInfo.agentId) {
      setAgentOffline(connectionInfo.agentId).catch(() => {});
    }
    if (connectionInfo.role === 'host') {
      const hostId = unregisterHostConnectionByConnectionId(connectionInfo.connectionId);
      if (hostId) {
        markHostOffline(hostId);
      }
    }
    console.log(
      `[WSS] Connection closed: ${connectionInfo.connectionId} (code: ${code}, reason: ${reason.toString()})`
    );
  });

  // Error handler
  ws.on('error', (err: Error) => {
    console.error(`[WSS] Connection error: ${connectionInfo.connectionId}:`, err.message);
  });
};

/**
 * Extract client IP from request, respecting X-Forwarded-For behind trusted proxies.
 */
const extractClientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // Take the first IP (client) from the chain
    return forwarded.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
};

const handleMessage = (ws: WebSocket, data: Buffer | string, connection: ConnectionInfo): void => {
  // Step 1: Parse JSON
  let raw: unknown;
  try {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    raw = JSON.parse(text);
  } catch {
    const errorFrame: OutboundErrorFrame = {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: {
        code: 'invalid_json',
        message: 'Failed to parse message as JSON',
      },
    };
    sendFrame(ws, errorFrame, { connectionId: connection.connectionId });
    return;
  }

  console.log('[WSS-DEBUG] frame received', {
    role: connection.role,
    type: (raw as any)?.type,
    keys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
  });
  // Step 2: Validate against zod schemas (OWASP input validation)
  const validation = validateFrame(raw);
  if (!validation.success) {
    console.warn('[WSS-DEBUG] validation failed', { error: validation.error, raw });
    const errorFrame: OutboundErrorFrame = {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: {
        code: 'invalid_frame',
        message: validation.error,
      },
    };
    sendFrame(ws, errorFrame, { connectionId: connection.connectionId });
    return;
  }

  const frame = validation.data as unknown as WSFrame;

  // Silently ignore auth frames after authentication is complete
  if (frame.type === 'auth') {
    return;
  }

  routeMessage(ws, frame, connection).catch((err: Error) => {
    console.error(`[WSS] Route error for ${connection.connectionId}:`, err.message);
    const errorFrame: OutboundErrorFrame = {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: {
        code: 'routing_error',
        message: 'Failed to process message',
        message_id: frame.id,
      },
    };
    sendFrame(ws, errorFrame, { connectionId: connection.connectionId });
  });
};
