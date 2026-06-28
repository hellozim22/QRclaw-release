/**
 * agent-ws-ticket Edge Function
 *
 * Issues a short-lived JWT ticket for Agent WebSocket connections.
 * Protocol reference: §P2.2
 *
 * Flow:
 *   1. Extract API key from Authorization: Bearer <api_key>
 *   2. Hash the key and look up matching agent
 *   3. Verify agent status is active
 *   4. Issue 30s JWT ticket with agent_id + owner_id
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { createAgentTicket, TICKET_TTL_SECONDS } from '../_shared/jwt.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const GATEWAY_URL = Deno.env.get('GATEWAY_URL') ?? 'wss://gateway.qrclaw.ai';

/**
 * Hash an API key using SHA-256 to match against stored api_key_hash.
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is allowed', 405);
  }

  try {
    const supabase = getServiceClient();
    const jwtSecret = Deno.env.get('JWT_SECRET');
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return errorResponse('internal_error', 'Server configuration error', 500);
    }

    // Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
    }

    const apiKey = parts[1];
    if (!apiKey || apiKey.length < 10) {
      return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
    }

    // Hash the API key and look up the agent
    const keyHash = await hashApiKey(apiKey);

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, owner_id, status')
      .eq('api_key_hash', keyHash)
      .single();

    if (agentError || !agent) {
      return errorResponse('forbidden', 'API key is invalid or agent is deactivated', 403);
    }

    if (agent.status !== 'active') {
      return errorResponse('forbidden', 'API key is invalid or agent is deactivated', 403);
    }

    // Sign the JWT ticket
    const ticket = await createAgentTicket(agent.id, agent.owner_id, jwtSecret);

    return jsonResponse(
      {
        data: {
          ticket,
          expires_in: TICKET_TTL_SECONDS,
          gateway_url: GATEWAY_URL,
        },
      },
      201
    );
  } catch (err) {
    console.error('agent-ws-ticket error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
