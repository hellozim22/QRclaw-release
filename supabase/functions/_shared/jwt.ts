/**
 * Shared JWT signing utility for WS ticket issuance.
 * Generates short-lived (30s) JWT tickets for WebSocket authentication.
 *
 * Uses the HMAC-SHA256 algorithm compatible with the Gateway's verification.
 */

const TICKET_TTL_SECONDS = 30;

interface VisitorTicketPayload {
  sub: string; // session_token
  agent_id: string;
  role: 'visitor';
  exp: number;
  iat: number;
}

interface AgentTicketPayload {
  sub: string; // agent_id
  owner_id: string;
  role: 'agent';
  exp: number;
  iat: number;
}

type TicketPayload = VisitorTicketPayload | AgentTicketPayload;

/**
 * Base64url encode a Uint8Array or string.
 */
function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a JWT payload with HMAC-SHA256.
 */
async function signJwt(payload: TicketPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));

  const encodedSignature = base64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Create a visitor WS ticket JWT.
 */
export async function createVisitorTicket(
  sessionToken: string,
  agentId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: VisitorTicketPayload = {
    sub: sessionToken,
    agent_id: agentId,
    role: 'visitor',
    iat: now,
    exp: now + TICKET_TTL_SECONDS,
  };
  return signJwt(payload, secret);
}

/**
 * Create an agent WS ticket JWT.
 */
export async function createAgentTicket(
  agentId: string,
  ownerId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AgentTicketPayload = {
    sub: agentId,
    owner_id: ownerId,
    role: 'agent',
    iat: now,
    exp: now + TICKET_TTL_SECONDS,
  };
  return signJwt(payload, secret);
}

export { TICKET_TTL_SECONDS };
