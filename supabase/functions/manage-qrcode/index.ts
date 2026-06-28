/**
 * manage-qrcode Edge Function
 *
 * Owner-only endpoint for QR code status management.
 * Protocol reference: §P2.7
 *
 * Supported operations:
 *   PATCH  — Update QR code fields (name, status transitions)
 *   DELETE — Soft-delete (set status to 'revoked')
 *
 * Status transitions:
 *   draft  → active
 *   active → paused
 *   paused → active
 *   any    → revoked (terminal, irreversible)
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/** Valid status transitions (from → allowed targets). */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'revoked'],
  active: ['paused', 'revoked'],
  paused: ['active', 'revoked'],
  revoked: [], // terminal state
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return errorResponse('method_not_allowed', 'Only PATCH and DELETE are allowed', 405);
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

    const qrcodeId = body.qrcode_id as string | undefined;
    if (!qrcodeId) {
      return errorResponse('invalid_request', 'qrcode_id is required', 400);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(qrcodeId)) {
      return errorResponse('invalid_request', 'qrcode_id must be a valid UUID', 400);
    }

    const supabase = getServiceClient();

    // Fetch QR code and verify ownership
    const { data: qrCode, error: fetchError } = await supabase
      .from('qrcodes')
      .select('id, status, agent_id, profile, slug, agents!inner(owner_id, owners!inner(user_id))')
      .eq('id', qrcodeId)
      .single();

    if (fetchError || !qrCode) {
      return errorResponse('not_found', 'QR code not found', 404);
    }

    const agents = qrCode.agents as Record<string, unknown>;
    const owners = agents.owners as Record<string, unknown>;
    if (owners.user_id !== user.id) {
      return errorResponse('forbidden', 'You do not own this QR code', 403);
    }

    // Handle DELETE → soft-delete (revoke)
    if (req.method === 'DELETE') {
      const { data: updated, error: updateError } = await supabase
        .from('qrcodes')
        .update({ status: 'revoked' })
        .eq('id', qrcodeId)
        .select('id, status, updated_at')
        .single();

      if (updateError) {
        console.error('Failed to revoke QR code:', updateError);
        return errorResponse('internal_error', 'Failed to revoke QR code', 500);
      }

      return jsonResponse({ data: updated });
    }

    // Handle PATCH — update fields and/or status
    const updates: Record<string, unknown> = {};

    // Status transition
    const newStatus = body.status as string | undefined;
    if (newStatus) {
      const currentStatus = qrCode.status as string;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];

      if (!allowed.includes(newStatus)) {
        return errorResponse(
          'invalid_transition',
          `Cannot transition from '${currentStatus}' to '${newStatus}'`,
          409
        );
      }

      updates.status = newStatus;
    }

    // Profile updates
    const name = body.name as string | undefined;
    const greeting = body.greeting as string | undefined;
    if (name || greeting) {
      const currentProfile = (qrCode.profile || {}) as Record<string, unknown>;
      const updatedProfile = { ...currentProfile };
      if (name) updatedProfile.name = name.trim();
      if (greeting) updatedProfile.greeting = greeting;
      updates.profile = updatedProfile;
    }

    // Style config updates
    const theme = body.theme as Record<string, unknown> | undefined;
    if (theme) {
      updates.style_config = theme;
    }

    // System prompt update
    const systemPrompt = body.system_prompt as string | undefined;
    if (systemPrompt !== undefined) {
      updates.system_prompt = systemPrompt;
    }

    // Suggested questions update
    const suggestedQuestions = body.suggested_questions as string[] | undefined;
    if (suggestedQuestions !== undefined) {
      updates.suggested_questions = suggestedQuestions;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('invalid_request', 'No updates provided', 400);
    }

    // Bump config_version on any update
    const { data: updated, error: updateError } = await supabase.rpc('update_qrcode_with_version', {
      p_qrcode_id: qrcodeId,
      p_updates: updates,
    });

    // Fallback: if RPC doesn't exist, update directly
    if (updateError) {
      const { data: directUpdate, error: directError } = await supabase
        .from('qrcodes')
        .update({
          ...updates,
          config_version: ((qrCode as Record<string, unknown>).config_version as number) + 1,
        })
        .eq('id', qrcodeId)
        .select('id, slug, status, profile, style_config, config_version, updated_at')
        .single();

      if (directError) {
        console.error('Failed to update QR code:', directError);
        return errorResponse('internal_error', 'Failed to update QR code', 500);
      }

      return jsonResponse({ data: directUpdate });
    }

    return jsonResponse({ data: updated });
  } catch (err) {
    console.error('manage-qrcode error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
