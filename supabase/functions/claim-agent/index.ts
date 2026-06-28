/**
 * claim-agent Edge Function
 *
 * Agent registration endpoint for Owners.
 * Protocol reference: §P2.6
 *
 * Flow:
 *   POST (create): Owner registers a new AI agent
 *     1. Authenticate Owner via Supabase JWT
 *     2. Generate API key (sk_live_ prefix + 32 random chars)
 *     3. Hash API key with SHA-256 for storage
 *     4. Create agent record with status: 'active'
 *     5. Return agent data + API key (shown only once)
 *
 *   PATCH (confirm): Owner activates a pending agent
 *     1. Authenticate Owner via Supabase JWT
 *     2. Verify ownership of the agent
 *     3. Transition status: pending → active
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const API_KEY_PREFIX = 'sk_live_';
const API_KEY_RANDOM_LENGTH = 32;

/**
 * Generate a random API key with sk_live_ prefix.
 */
function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(API_KEY_RANDOM_LENGTH));
  const randomPart = Array.from(randomValues)
    .map((v) => chars[v % chars.length])
    .join('');
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key using SHA-256.
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
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return errorResponse('method_not_allowed', 'Only POST and PATCH are allowed', 405);
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
    const supabase = getServiceClient();

    // Get owner record
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

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_request', 'Invalid JSON body', 400);
    }

    if (req.method === 'POST') {
      return await handleCreate(supabase, owner.id, body);
    }

    return await handleConfirm(supabase, user.id, owner.id, body);
  } catch (err) {
    console.error('claim-agent error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});

/**
 * POST: Create a new agent with a fresh API key.
 */
async function handleCreate(
  supabase: ReturnType<typeof getServiceClient>,
  ownerId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const name = body.name as string | undefined;
  if (!name || name.trim().length === 0) {
    return errorResponse('invalid_request', 'name is required', 400);
  }

  // Generate API key
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.substring(0, API_KEY_PREFIX.length + 4); // sk_live_XXXX

  // Create agent record
  const { data: agent, error: insertError } = await supabase
    .from('agents')
    .insert({
      owner_id: ownerId,
      name: name.trim(),
      api_key_hash: apiKeyHash,
      status: 'active',
    })
    .select('id, name, status, created_at')
    .single();

  if (insertError) {
    console.error('Failed to create agent:', insertError);
    return errorResponse('internal_error', 'Failed to create agent', 500);
  }

  // Return API key only on creation (never shown again)
  return jsonResponse(
    {
      data: {
        agent_id: agent.id,
        api_key: apiKey,
        api_key_prefix: apiKeyPrefix,
        name: agent.name,
        status: agent.status,
        created_at: agent.created_at,
      },
    },
    201
  );
}

/**
 * PATCH: Confirm/activate a pending agent.
 */
async function handleConfirm(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  ownerId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const agentId = body.agent_id as string | undefined;
  if (!agentId) {
    return errorResponse('invalid_request', 'agent_id is required', 400);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(agentId)) {
    return errorResponse('invalid_request', 'agent_id must be a valid UUID', 400);
  }

  // Fetch agent and verify ownership
  const { data: agent, error: fetchError } = await supabase
    .from('agents')
    .select('id, owner_id, status')
    .eq('id', agentId)
    .single();

  if (fetchError || !agent) {
    return errorResponse('not_found', 'Agent not found', 404);
  }

  if (agent.owner_id !== ownerId) {
    return errorResponse('forbidden', 'You do not own this agent', 403);
  }

  if (agent.status !== 'pending') {
    return errorResponse(
      'invalid_transition',
      `Cannot activate agent with status '${agent.status}'`,
      409
    );
  }

  // Activate the agent
  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update({ status: 'active' })
    .eq('id', agentId)
    .select('id, name, status, updated_at')
    .single();

  if (updateError) {
    console.error('Failed to activate agent:', updateError);
    return errorResponse('internal_error', 'Failed to activate agent', 500);
  }

  return jsonResponse({ data: updated });
}
