/**
 * create-qrcode Edge Function
 *
 * Owner-only endpoint to create a new QR code.
 * Protocol reference: §P2.7
 *
 * Flow:
 *   1. Authenticate Owner via Supabase JWT
 *   2. Validate input (agent_id, name, optional slug)
 *   3. Verify Owner owns the agent
 *   4. Generate unique slug (12+ chars) if not provided
 *   5. Create qrcode record with status: 'draft'
 *   6. Return created QR code data
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const SLUG_LENGTH = 12;
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random URL-safe slug using rejection sampling to avoid modulo bias.
 * SLUG_CHARS has 36 characters; 252 = 7*36 is the largest multiple of 36 that fits
 * in a byte (0-255). Bytes >= 252 are discarded to ensure uniform distribution.
 */
function generateSlug(length: number = SLUG_LENGTH): string {
  const maxUnbiased = 252; // 7 * 36
  const result: string[] = [];
  while (result.length < length) {
    const batch = crypto.getRandomValues(new Uint8Array(length * 2));
    for (let i = 0; i < batch.length && result.length < length; i++) {
      if (batch[i] < maxUnbiased) {
        result.push(SLUG_CHARS[batch[i] % SLUG_CHARS.length]);
      }
    }
  }
  return result.join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is allowed', 405);
  }

  try {
    // Authenticate Owner
    let authResult;
    try {
      authResult = await authenticateOwner(req);
    } catch (authError) {
      if (authError === 'missing_auth' || authError === 'invalid_auth') {
        return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
      }
      if (authError === 'unauthorized') {
        return errorResponse('unauthorized', 'Invalid or expired token', 401);
      }
      return errorResponse('internal_error', 'Server configuration error', 500);
    }

    const { user } = authResult;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_request', 'Invalid JSON body', 400);
    }

    const agentId = body.agent_id as string | undefined;
    const name = body.name as string | undefined;

    if (!agentId) {
      return errorResponse('invalid_request', 'agent_id is required', 400);
    }
    if (!name || name.trim().length === 0) {
      return errorResponse('invalid_request', 'name is required', 400);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agentId)) {
      return errorResponse('invalid_request', 'agent_id must be a valid UUID', 400);
    }

    // Verify Owner owns this agent
    const supabase = getServiceClient();

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, owner_id, owners!inner(user_id)')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return errorResponse('not_found', 'Agent not found', 404);
    }

    const owners = agent.owners as Record<string, unknown>;
    if (owners.user_id !== user.id) {
      return errorResponse('forbidden', 'You do not own this agent', 403);
    }

    // Handle slug: use custom or generate
    let slug = body.custom_slug as string | undefined;
    if (slug) {
      // Validate custom slug
      if (slug.length < SLUG_LENGTH) {
        return errorResponse(
          'invalid_request',
          `Slug must be at least ${SLUG_LENGTH} characters`,
          400
        );
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return errorResponse(
          'invalid_request',
          'Slug must contain only lowercase letters, numbers, and hyphens',
          400
        );
      }

      // Check uniqueness
      const { data: existing } = await supabase
        .from('qrcodes')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        return errorResponse('invalid_request', 'This slug is already in use', 409);
      }
    } else {
      // Generate unique slug with retry (10 attempts)
      for (let attempt = 0; attempt < 10; attempt++) {
        slug = generateSlug();
        const { data: existing } = await supabase
          .from('qrcodes')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (!existing) break;
        if (attempt === 9) {
          return errorResponse('internal_error', 'Failed to generate unique slug', 500);
        }
      }
    }

    // Extract optional fields
    const greeting = body.greeting as string | undefined;
    const language = body.language as string | undefined;
    const theme = body.theme as Record<string, unknown> | undefined;

    // Build profile and style_config from input
    const profile: Record<string, unknown> = { name: name.trim() };
    if (greeting) profile.greeting = greeting;

    const styleConfig: Record<string, unknown> = {};
    if (theme) {
      if (theme.primary_color) styleConfig.primary_color = theme.primary_color;
      if (theme.avatar_url) styleConfig.avatar_url = theme.avatar_url;
    }

    // Create QR code record
    const { data: qrCode, error: insertError } = await supabase
      .from('qrcodes')
      .insert({
        agent_id: agentId,
        slug,
        status: 'draft',
        profile,
        style_config: styleConfig,
        locale: language || 'en',
      })
      .select(
        'id, slug, status, agent_id, profile, style_config, locale, config_version, created_at'
      )
      .single();

    if (insertError) {
      console.error('Failed to create QR code:', insertError);
      return errorResponse('internal_error', 'Failed to create QR code', 500);
    }

    return jsonResponse(
      {
        data: {
          id: qrCode.id,
          slug: qrCode.slug,
          status: qrCode.status,
          profile_url: `https://qrclaw.ai/q/${qrCode.slug}`,
          qr_image_url: `https://qrclaw.ai/api/qr/${qrCode.slug}.png`,
          agent_id: qrCode.agent_id,
          config_version: qrCode.config_version,
          created_at: qrCode.created_at,
        },
      },
      201
    );
  } catch (err) {
    console.error('create-qrcode error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
