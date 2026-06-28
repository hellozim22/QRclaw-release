/**
 * WebSocket ticket verification
 * Per §4 / §5.5: ws_ticket burn-after-read mechanism
 * Per §P2: WS ticket protocol — JWT-based, verified on upgrade
 */
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { ConnectionInfo, TicketPayload } from '../types/index.js';
import { hashHostToken, verifyHostToken } from '../db/owner-agent-chat.js';

const WS_TICKET_SECRET = process.env.WS_TICKET_SECRET || '';
const HOST_TOKEN_PREFIX = 'qrclaw_host_';

/**
 * Extract ticket from WebSocket upgrade request URL params.
 */
export const extractTicket = (req: IncomingMessage): string | null => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  return url.searchParams.get('ticket');
};

/**
 * Verify a WebSocket ticket JWT and return connection info.
 * Throws with descriptive message on failure (caller maps to close codes).
 */
export const verifyWSTicket = (ticket: string): TicketPayload => {
  if (!WS_TICKET_SECRET) {
    throw new Error('WS_TICKET_SECRET is not configured');
  }

  const decoded = jwt.verify(ticket, WS_TICKET_SECRET) as TicketPayload;

  if (
    !decoded.role ||
    (decoded.role !== 'visitor' && decoded.role !== 'agent' && decoded.role !== 'owner')
  ) {
    throw new Error('Invalid role in ticket');
  }

  return {
    role: decoded.role,
    sessionToken: decoded.sessionToken,
    agentId: decoded.agentId,
    ownerId: decoded.ownerId,
    qrCodeId: decoded.qrCodeId,
  };
};

/**
 * Verify ticket and build ConnectionInfo.
 * Returns null if ticket is invalid/expired.
 */
export const verifyTicket = async (ticket: string): Promise<ConnectionInfo | null> => {
  try {
    if (ticket.startsWith(HOST_TOKEN_PREFIX)) {
      const record = await verifyHostToken(hashHostToken(ticket));
      if (!record) {
        return null;
      }

      return {
        connectionId: uuidv4(),
        role: 'host',
        ownerId: record.ownerId,
        hostId: record.hostId ?? undefined,
        tokenId: record.tokenId,
        hostTokenScope: record.scope,
        connectedAt: new Date().toISOString(),
      };
    }

    const payload = verifyWSTicket(ticket);

    return {
      connectionId: uuidv4(),
      role: payload.role as ConnectionInfo['role'],
      agentId: payload.agentId,
      ownerId: payload.ownerId,
      sessionToken: payload.sessionToken,
      qrCodeId: payload.qrCodeId,
      connectedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[Auth] Ticket verification failed:', (err as Error).message);
    return null;
  }
};
