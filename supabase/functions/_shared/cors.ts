/**
 * Shared CORS headers for Supabase Edge Functions.
 * Allows cross-origin requests from QRClaw web client.
 */

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || 'https://qrclaw.ai';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token, X-Request-Id',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/**
 * Create a preflight response for OPTIONS requests.
 */
export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Create a JSON response with CORS headers.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a standard error response per P2.1 envelope format.
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): Response {
  const body: Record<string, unknown> = {
    error: { code, message, ...(details ? { details } : {}) },
  };
  return jsonResponse(body, status);
}
