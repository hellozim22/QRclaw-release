/**
 * manage-agents Edge Function
 *
 * Dashboard-facing CRUD operations for Owner-scoped agent management.
 * Complements claim-agent (creation + pending→active confirm), which
 * remains the sole entry point for new agent registration.
 *
 * Endpoint: POST /functions/v1/manage-agents
 * Auth:     Supabase User JWT (Authorization: Bearer <jwt>)
 *
 * Actions (selected via body.action):
 *   - update          : patch name / description / account_label
 *   - regenerate_key  : rotate api_key (new sk_live_ token, old hash overwritten)
 *   - delete          : soft-delete via status='archived'
 *
 * Ownership enforcement:
 *   Every action resolves owners.id via owners.user_id = auth.uid(), then
 *   verifies agents.owner_id matches that owner.id. The client-provided
 *   agent_id is NEVER trusted to belong to the caller without this join.
 *
 * API-key plaintext policy:
 *   - New api_key is generated with crypto.getRandomValues and hashed with
 *     SHA-256 before persistence.
 *   - Plaintext is returned EXACTLY ONCE in the regenerate_key response.
 *   - Plaintext is never written to console.log / structured logs.
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const API_KEY_PREFIX = 'sk_live_';
const API_KEY_RANDOM_LENGTH = 32;

const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2048;
const MAX_ACCOUNT_LABEL_LENGTH = 128;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Action = 'update' | 'regenerate_key' | 'delete';

interface Body {
  action?: Action;
  agent_id?: string;
  name?: string;
  description?: string | null;
  account_label?: string | null;
}

/**
 * Generate a random API key with sk_live_ prefix.
 *
 * Uses rejection sampling to avoid modular bias: the 62-char alphabet does
 * not divide evenly into 256, so a naive `byte % 62` slightly over-weights
 * the first 8 characters. We reject any byte >= 248 (62*4) and resample,
 * producing a uniform distribution across the alphabet.
 */
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const out: string[] = [];
  while (out.length < API_KEY_RANDOM_LENGTH) {
    const buf = crypto.getRandomValues(new Uint8Array(1));
    if (buf[0] < 248) {
      out.push(chars[buf[0] % 62]);
    }
  }
  return `${API_KEY_PREFIX}${out.join('')}`;
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function validateAgentId(agentId: unknown): string | null {
  if (typeof agentId !== 'string' || !UUID_REGEX.test(agentId)) {
    return null;
  }
  return agentId;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is allowed', 405);
  }

  try {
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
    const supabase = getServiceClient();

    // Resolve owners.id from user.id — never trust any owner_id from body.
    const { data: owner, error: ownerError } = await supabase
      .from('owners')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (ownerError || !owner) {
      return errorResponse(
        'forbidden',
        'Owner profile not found. Please complete registration first.',
        403
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid_request', 'Invalid JSON body', 400);
    }

    const action = body.action;
    if (action !== 'update' && action !== 'regenerate_key' && action !== 'delete') {
      return errorResponse(
        'invalid_request',
        "action must be one of: 'update', 'regenerate_key', 'delete'",
        400
      );
    }

    const agentId = validateAgentId(body.agent_id);
    if (!agentId) {
      return errorResponse('invalid_request', 'agent_id must be a valid UUID', 400);
    }

    // Fetch agent + verify ownership against resolved owner.id (NOT body.owner_id).
    //
    // IDOR hardening: return 404 for both "agent not found" and "agent exists
    // but owned by someone else" — preventing attackers from using response
    // codes to enumerate valid agent IDs across accounts.
    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, owner_id, status')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent || agent.owner_id !== owner.id) {
      return errorResponse('not_found', 'Agent not found', 404);
    }

    switch (action) {
      case 'update':
        return await handleUpdate(supabase, agent.id, agent.status, body);
      case 'regenerate_key':
        return await handleRegenerateKey(supabase, agent.id, agent.status);
      case 'delete':
        return await handleDelete(supabase, agent.id, agent.status);
    }
  } catch (err) {
    console.error('manage-agents error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});

/**
 * Patch name / description / account_label.
 * All three are optional; at least one must be provided.
 * Archived agents cannot be updated (must unarchive first — out of scope).
 */
async function handleUpdate(
  supabase: ReturnType<typeof getServiceClient>,
  agentId: string,
  currentStatus: string,
  body: Body
): Promise<Response> {
  if (currentStatus === 'archived') {
    return errorResponse('invalid_state', 'Archived agents cannot be updated', 409);
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return errorResponse('invalid_request', 'name must be a string', 400);
    }
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return errorResponse('invalid_request', 'name cannot be empty', 400);
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return errorResponse(
        'invalid_request',
        `name exceeds maximum length of ${MAX_NAME_LENGTH}`,
        400
      );
    }
    patch.name = trimmed;
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      patch.description = null;
    } else {
      if (typeof body.description !== 'string') {
        return errorResponse('invalid_request', 'description must be a string or null', 400);
      }
      if (body.description.length > MAX_DESCRIPTION_LENGTH) {
        return errorResponse(
          'invalid_request',
          `description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH}`,
          400
        );
      }
      patch.description = body.description;
    }
  }

  if (body.account_label !== undefined) {
    if (body.account_label === null) {
      patch.account_label = null;
    } else {
      if (typeof body.account_label !== 'string') {
        return errorResponse('invalid_request', 'account_label must be a string or null', 400);
      }
      const trimmed = body.account_label.trim();
      if (trimmed.length > MAX_ACCOUNT_LABEL_LENGTH) {
        return errorResponse(
          'invalid_request',
          `account_label exceeds maximum length of ${MAX_ACCOUNT_LABEL_LENGTH}`,
          400
        );
      }
      patch.account_label = trimmed.length === 0 ? null : trimmed;
    }
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(
      'invalid_request',
      'At least one of name / description / account_label must be provided',
      400
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update(patch)
    .eq('id', agentId)
    .select('id, name, description, account_label, status, updated_at')
    .single();

  if (updateError) {
    console.error('Failed to update agent:', updateError);
    return errorResponse('internal_error', 'Failed to update agent', 500);
  }

  return jsonResponse({ data: updated });
}

/**
 * Rotate api_key: generate a new sk_live_ token, hash it, persist the hash,
 * and return the plaintext exactly once.
 *
 * Plaintext is never logged. Response is issued only after the DB write
 * succeeds — if persistence fails, the caller sees an error and retries,
 * so there is no state where the client has a key the server does not.
 */
async function handleRegenerateKey(
  supabase: ReturnType<typeof getServiceClient>,
  agentId: string,
  currentStatus: string
): Promise<Response> {
  if (currentStatus === 'archived') {
    return errorResponse('invalid_state', 'Cannot regenerate key for archived agent', 409);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.substring(0, API_KEY_PREFIX.length + 4);

  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update({ api_key_hash: apiKeyHash })
    .eq('id', agentId)
    .select('id, updated_at')
    .single();

  if (updateError || !updated) {
    // Do NOT log apiKey. updateError may contain hash fragments via its
    // message, but Supabase error objects do not echo the input values.
    console.error('Failed to regenerate agent api_key');
    return errorResponse('internal_error', 'Failed to regenerate key', 500);
  }

  return jsonResponse({
    data: {
      agent_id: updated.id,
      api_key: apiKey,
      api_key_prefix: apiKeyPrefix,
      regenerated_at: updated.updated_at,
    },
  });
}

/**
 * Soft-delete via status='archived'.
 *
 * Idempotent: archiving an already-archived agent returns 200 with the
 * existing archived_at timestamp (no-op, api_key_hash already revoked).
 *
 * Key revocation on archive:
 *   Since Gateway WS auth does not yet filter on status (see follow-up),
 *   we overwrite api_key_hash with an unmatchable sentinel the moment the
 *   agent is archived. This guarantees the plaintext token issued via
 *   claim-agent / regenerate_key can no longer authenticate, regardless of
 *   whether Gateway ships the status check.
 *
 *   Schema: agents.api_key_hash is NOT NULL (confirmed via
 *   information_schema.columns 2026-04-20), so we cannot use NULL.
 *   Instead, we write 'revoked-<uuid>' — a string that cannot be the
 *   output of SHA-256(anything) (collision probability ~0, and the
 *   'revoked-' prefix is longer than any valid 64-hex-char SHA-256).
 *
 * Follow-up (out of scope for M2-DASH-BE):
 *   - Gateway must reject WS connections for status='archived' agents
 *     (belt-and-suspenders on top of hash revocation).
 */
async function handleDelete(
  supabase: ReturnType<typeof getServiceClient>,
  agentId: string,
  currentStatus: string
): Promise<Response> {
  if (currentStatus === 'archived') {
    // Idempotent: already archived (hash already revoked on first archive).
    const { data: existing, error: fetchError } = await supabase
      .from('agents')
      .select('id, status, updated_at')
      .eq('id', agentId)
      .single();
    if (fetchError || !existing) {
      return errorResponse('not_found', 'Agent not found', 404);
    }
    return jsonResponse({
      data: {
        agent_id: existing.id,
        status: existing.status,
        archived_at: existing.updated_at,
      },
    });
  }

  // Overwrite api_key_hash with an unmatchable sentinel so the plaintext
  // token issued earlier cannot authenticate against this row anymore.
  // api_key_hash is NOT NULL in schema, so NULL cannot be used.
  const revokedHash = `revoked-${crypto.randomUUID()}`;

  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update({ status: 'archived', api_key_hash: revokedHash })
    .eq('id', agentId)
    .select('id, status, updated_at')
    .single();

  if (updateError || !updated) {
    console.error('Failed to archive agent:', updateError);
    return errorResponse('internal_error', 'Failed to archive agent', 500);
  }

  return jsonResponse({
    data: {
      agent_id: updated.id,
      status: updated.status,
      archived_at: updated.updated_at,
    },
  });
}
