/**
 * visitor-ws-ticket Edge Function
 *
 * Issues a short-lived JWT ticket for Visitor WebSocket connections.
 * Protocol reference: §P2.3
 *
 * Flow:
 *   1. Validate session token (from X-Session-Token header)
 *   2. Validate qr_code_id from request body
 *   3. Look up QR code → agent mapping, verify QR code is active
 *   4. Create or reuse session if no session_token provided
 *   5. Issue 30s JWT ticket
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { createVisitorTicket, TICKET_TTL_SECONDS } from '../_shared/jwt.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const GATEWAY_URL = Deno.env.get('GATEWAY_URL') ?? 'wss://gateway.qrclaw.ai';

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

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_request', 'Invalid JSON body', 400);
    }

    const qrCodeId = body.qr_code_id as string | undefined;
    if (!qrCodeId) {
      return errorResponse('invalid_request', 'qr_code_id is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(qrCodeId)) {
      return errorResponse('invalid_request', 'qr_code_id must be a valid UUID', 400);
    }

    // Look up the QR code and verify it's active
    const { data: qrCode, error: qrError } = await supabase
      .from('qrcodes')
      .select('id, agent_id, status')
      .eq('id', qrCodeId)
      .single();

    if (qrError || !qrCode) {
      return errorResponse('qrcode_not_found', 'QR code does not exist', 404);
    }

    if (qrCode.status === 'paused') {
      return errorResponse('qrcode_paused', 'This QR code is currently paused', 409);
    }

    if (qrCode.status !== 'active') {
      return errorResponse('qrcode_unavailable', 'This QR code is not available', 403);
    }

    // Verify the linked agent is active
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('id', qrCode.agent_id)
      .single();

    if (agentError || !agent || agent.status !== 'active') {
      return errorResponse('agent_unavailable', 'The agent for this QR code is not available', 403);
    }

    // Handle session: check X-Session-Token header or create new session
    let sessionToken = req.headers.get('X-Session-Token');

    if (sessionToken) {
      // Validate existing session
      const { data: session, error: sessError } = await supabase
        .from('sessions')
        .select('id, session_token, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessError || !session) {
        // Session not found — create a new one
        sessionToken = null;
      } else if (new Date(session.expires_at) < new Date()) {
        // Session expired — create a new one
        sessionToken = null;
      } else {
        // Update last_active_at
        await supabase
          .from('sessions')
          .update({ last_active_at: new Date().toISOString() })
          .eq('session_token', sessionToken);
      }
    }

    if (!sessionToken) {
      // Generate a new session token
      sessionToken = `sess_${crypto.randomUUID().replace(/-/g, '')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const { error: insertError } = await supabase.from('sessions').insert({
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        last_active_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Failed to create session:', insertError);
        return errorResponse('internal_error', 'Failed to create session', 500);
      }
    }

    // Sign the JWT ticket
    const ticket = await createVisitorTicket(sessionToken, qrCode.agent_id, jwtSecret);

    return jsonResponse(
      {
        data: {
          ticket,
          expires_in: TICKET_TTL_SECONDS,
          session_token: sessionToken,
          gateway_url: GATEWAY_URL,
        },
      },
      201
    );
  } catch (err) {
    console.error('visitor-ws-ticket error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
