/**
 * Agent WebSocket ticket endpoint — issues short-lived JWT tickets.
 * This replicates the Supabase Edge Function `agent-ws-ticket` locally
 * so agents can connect without requiring Edge Function deployment.
 *
 * Flow: API key → SHA-256 hash → look up agent → sign JWT → return ticket
 */
import { Router } from 'express';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { validateRequest } from '../middleware/validate-request.js';
import {
  visitorWsTicketRequestSchema,
  agentWsTicketRequestSchema,
} from '../../../shared/contracts/http/tickets/protocol.js';
import type { VisitorWsTicketRequest } from '../../../shared/contracts/http/tickets/types.js';

const TICKET_TTL_SECONDS = 30;

const getTicketSecret = (): string => process.env.WS_TICKET_SECRET?.trim() || '';
const getSupabaseUrl = (): string => (process.env.SUPABASE_URL?.trim() || '').replace(/\/+$/, '');
const getSupabaseServiceRoleKey = (): string => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
export const getGatewayWsUrl = (): string => {
  const explicitWsUrl = process.env.GATEWAY_WS_URL?.trim();
  if (explicitWsUrl) {
    return explicitWsUrl;
  }

  const gatewayBaseUrl = process.env.GATEWAY_BASE_URL?.trim();
  if (gatewayBaseUrl) {
    return `${gatewayBaseUrl.replace(/^http/i, 'ws').replace(/\/$/, '')}/ws`;
  }

  return `ws://localhost:${process.env.PORT || '3001'}/ws`;
};

export const ticketRouter = Router();

/**
 * POST /api/agent-ws-ticket
 * Body: (none required)
 * Header: Authorization: Bearer <agent_api_key>
 * Response: { data: { ticket, expires_in, gateway_url } }
 */
ticketRouter.post(
  '/api/agent-ws-ticket',
  validateRequest(agentWsTicketRequestSchema),
  async (req, res) => {
    try {
      const wsTicketSecret = getTicketSecret();
      const supabaseUrl = getSupabaseUrl();
      const serviceRoleKey = getSupabaseServiceRoleKey();

      if (!wsTicketSecret) {
        res
          .status(500)
          .json({ error: { code: 'internal_error', message: 'WS_TICKET_SECRET not configured' } });
        return;
      }

      if (!supabaseUrl || !serviceRoleKey) {
        res.status(500).json({
          error: { code: 'internal_error', message: 'Supabase credentials not configured' },
        });
        return;
      }

      // Extract API key from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res
          .status(401)
          .json({ error: { code: 'unauthorized', message: 'Missing Authorization header' } });
        return;
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res
          .status(401)
          .json({ error: { code: 'unauthorized', message: 'Invalid Authorization format' } });
        return;
      }

      const apiKey = parts[1];
      if (!apiKey || apiKey.length < 10) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid API key' } });
        return;
      }

      // Hash the API key (SHA-256, matching Edge Function and setup-agent.ts)
      const keyHash = createHash('sha256').update(apiKey).digest('hex');

      // Look up agent in Supabase
      const lookupUrl = `${supabaseUrl}/rest/v1/agents?api_key_hash=eq.${keyHash}&select=id,owner_id,status&limit=1`;
      const lookupRes = await fetch(lookupUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!lookupRes.ok) {
        res
          .status(500)
          .json({ error: { code: 'internal_error', message: 'Database lookup failed' } });
        return;
      }

      const agents = (await lookupRes.json()) as Array<{
        id: string;
        owner_id: string;
        status: string;
      }>;
      if (agents.length === 0) {
        res.status(403).json({
          error: { code: 'forbidden', message: 'API key is invalid or agent is deactivated' },
        });
        return;
      }

      const agent = agents[0];
      if (agent.status !== 'active') {
        res.status(403).json({ error: { code: 'forbidden', message: 'Agent is not active' } });
        return;
      }

      // Sign JWT ticket (matches Gateway's verifyWSTicket expectations)
      const now = Math.floor(Date.now() / 1000);
      const ticket = jwt.sign(
        {
          sub: agent.id,
          role: 'agent',
          agentId: agent.id,
          ownerId: agent.owner_id,
        },
        wsTicketSecret,
        {
          expiresIn: TICKET_TTL_SECONDS,
          algorithm: 'HS256',
        }
      );

      res.status(201).json({
        data: {
          ticket,
          expires_in: TICKET_TTL_SECONDS,
          gateway_url: getGatewayWsUrl(),
        },
      });
    } catch (err) {
      console.error('[Ticket] Error:', (err as Error).message);
      res
        .status(500)
        .json({ error: { code: 'internal_error', message: 'An unexpected error occurred' } });
    }
  }
);

/**
 * POST /api/visitor-ws-ticket
 * Body: { qr_code_id: string }
 * Response: { data: { ticket, expires_in, gateway_url } }
 */
ticketRouter.post(
  '/api/visitor-ws-ticket',
  validateRequest(visitorWsTicketRequestSchema),
  async (req, res) => {
    try {
      const wsTicketSecret = getTicketSecret();
      const supabaseUrl = getSupabaseUrl();
      const serviceRoleKey = getSupabaseServiceRoleKey();

      if (!wsTicketSecret) {
        res
          .status(500)
          .json({ error: { code: 'internal_error', message: 'WS_TICKET_SECRET not configured' } });
        return;
      }

      if (!supabaseUrl || !serviceRoleKey) {
        res.status(500).json({
          error: { code: 'internal_error', message: 'Supabase credentials not configured' },
        });
        return;
      }

      const { qr_code_id, session_token: existingSessionToken } =
        req.body as VisitorWsTicketRequest;

      // Look up QR code to find the linked agent
      const lookupUrl = `${supabaseUrl}/rest/v1/qrcodes?id=eq.${qr_code_id}&select=id,agent_id,status&limit=1`;
      const lookupRes = await fetch(lookupUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!lookupRes.ok) {
        res
          .status(500)
          .json({ error: { code: 'internal_error', message: 'Database lookup failed' } });
        return;
      }

      const qrCodes = (await lookupRes.json()) as Array<{
        id: string;
        agent_id: string;
        status: string;
      }>;
      if (qrCodes.length === 0) {
        res.status(404).json({ error: { code: 'not_found', message: 'QR code not found' } });
        return;
      }

      const qrCode = qrCodes[0];
      if (qrCode.status !== 'active') {
        res.status(403).json({ error: { code: 'forbidden', message: 'QR code is not active' } });
        return;
      }

      // Use existing session token if provided (for conversation resumption on refresh)
      // Otherwise generate a new one
      const sessionToken =
        existingSessionToken || `vis_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const ticket = jwt.sign(
        {
          sub: sessionToken,
          role: 'visitor',
          sessionToken,
          qrCodeId: qr_code_id,
          agentId: qrCode.agent_id,
        },
        wsTicketSecret,
        {
          expiresIn: TICKET_TTL_SECONDS,
          algorithm: 'HS256',
        }
      );

      res.status(201).json({
        data: {
          ticket,
          session_token: sessionToken,
          expires_in: TICKET_TTL_SECONDS,
          gateway_url: getGatewayWsUrl(),
        },
      });
    } catch (err) {
      console.error('[Ticket] Visitor error:', (err as Error).message);
      res
        .status(500)
        .json({ error: { code: 'internal_error', message: 'An unexpected error occurred' } });
    }
  }
);

/**
 * POST /api/owner/ws-ticket
 * Header: Authorization: Bearer <supabase_jwt>
 * Response: { data: { ticket, expires_in, gateway_url } }
 */
ticketRouter.post('/api/owner/ws-ticket', async (req, res) => {
  try {
    const wsTicketSecret = getTicketSecret();
    if (!wsTicketSecret) {
      res
        .status(500)
        .json({ error: { code: 'internal_error', message: 'WS_TICKET_SECRET not configured' } });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Missing bearer token' } });
      return;
    }

    const supabaseJWT = authHeader.slice(7);
    // Decode JWT to get owner_id (we trust supabase JWT, already validated by middleware)
    let decoded: any;
    try {
      decoded = jwt.decode(supabaseJWT);
    } catch {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid JWT' } });
      return;
    }

    const ownerId = decoded?.sub;
    if (!ownerId) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Missing owner_id in JWT' } });
      return;
    }

    const ticket = jwt.sign(
      {
        sub: ownerId,
        role: 'owner',
        ownerId,
      },
      wsTicketSecret,
      {
        expiresIn: TICKET_TTL_SECONDS,
        algorithm: 'HS256',
      }
    );

    res.json({
      data: {
        ticket,
        expires_in: TICKET_TTL_SECONDS,
        gateway_url: getGatewayWsUrl(),
      },
    });
  } catch (err) {
    console.error('[Ticket] owner ws-ticket error:', (err as Error).message);
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to issue ticket' } });
  }
});
