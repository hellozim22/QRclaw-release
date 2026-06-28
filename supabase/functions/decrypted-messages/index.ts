/**
 * decrypted-messages Edge Function — unified history read path for M3.
 *
 * Actors:
 *   - owner   (Authorization: Bearer <supabase-jwt>)
 *   - agent   (Authorization: Bearer <agent-api-key>)
 *   - visitor (session_token in body; no Authorization)
 *   - owner-private-agent-chat (Authorization: Bearer <supabase-jwt>)
 *
 * Flow (all actors):
 *   1. Parse + validate body against the shared contract (discriminated on actor).
 *   2. Authenticate per actor.
 *   3. Verify conversation access (authz chain for owner/agent, session_token
 *      match for visitor).
 *   4. Fetch encryption_keys.key_data_encrypted for the conversation.
 *   5. Unwrap DEK with QRCLAW_KEK_V1 (Web Crypto AES-256-GCM).
 *   6. Page messages (ORDER BY sent_at DESC, limit+1 for has_more).
 *   7. Decrypt each envelope in-memory; fall back to `[decryption_failed]`
 *      on a per-row error — never abort the page.
 *
 * Iron rules:
 *   - C2: content is encrypted at rest; we decrypt in memory only and never
 *     log plaintext. The sentinel message is all a failed row leaks.
 *   - C5: replayable history — visitors re-hydrate their chat with the same
 *     session_token they held on the original session.
 *
 * Design notes:
 *   - No RPC call (`decrypt_dek` was referenced by the legacy function but
 *     never defined in migrations — option C in plan v1.3 §M3-D3).
 *   - KEK env var unified on QRCLAW_KEK_V1 (previously ENCRYPTION_KEK in
 *     gateway, QRCLAW_KEK_V1 in Edge Function).
 *
 * Supersedes: supabase/functions/get-decrypted-messages (owner-only); to be
 * retired in M3-T6 once web and external integrators move off it.
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner, authenticateAgent } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
  DECRYPTED_ACTORS,
  DECRYPTED_MESSAGES_LIMIT_MIN,
  DECRYPTED_MESSAGES_LIMIT_MAX,
  DECRYPTED_MESSAGES_LIMIT_DEFAULT,
  DECRYPTION_FAILED_SENTINEL,
  DECRYPTION_UNAVAILABLE_SENTINEL,
  type DecryptedMessagesRequest,
  type DecryptedOwnerPrivateAgentChatRequest,
  type DecryptedMessage,
  type DecryptedOwnerAgentRunEvent,
  type DecryptedMessagesResponse,
  type MessageRole,
} from '../_shared/contracts/http/decrypted-messages/types.ts';
import {
  decryptDek,
  decryptEnvelope,
  readKekBytes,
  byteaToUtf8String,
  KekMissingError,
} from '../_shared/crypto/index.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is allowed', 405);
  }

  try {
    const parsedBody = await parseBody(req);
    if ('error' in parsedBody) {
      return errorResponse(parsedBody.error.code, parsedBody.error.message, 400);
    }

    const body = parsedBody.value;

    // Step 2 + 3: authenticate + authorize per actor (req reused for headers).
    const accessCheck = await resolveConversationAccess(req, body);
    if ('error' in accessCheck) {
      return errorResponse(
        accessCheck.error.code,
        accessCheck.error.message,
        accessCheck.error.status
      );
    }

    // Step 4 + 5 + 6 + 7.
    return await fetchAndDecrypt(body);
  } catch (err) {
    console.error('decrypted-messages error:', err instanceof Error ? err.message : String(err));
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});

// ---------------------------------------------------------------------------
// Step 1: body parsing + validation (inline; protocol.ts not mirrored to Deno).
// ---------------------------------------------------------------------------

type ParsedBody =
  | { value: DecryptedMessagesRequest }
  | { error: { code: string; message: string } };

async function parseBody(req: Request): Promise<ParsedBody> {
  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return { error: { code: 'invalid_request', message: 'Invalid JSON body' } };
  }

  const actor = raw.actor;
  if (typeof actor !== 'string' || !(DECRYPTED_ACTORS as readonly string[]).includes(actor)) {
    return {
      error: {
        code: 'invalid_request',
        message: `actor must be one of ${DECRYPTED_ACTORS.join(', ')}`,
      },
    };
  }

  const conversationId = raw.conversation_id;
  if (typeof conversationId !== 'string' || !UUID_REGEX.test(conversationId)) {
    return {
      error: { code: 'invalid_request', message: 'conversation_id must be a valid UUID' },
    };
  }

  let limit = DECRYPTED_MESSAGES_LIMIT_DEFAULT;
  if (raw.limit !== undefined) {
    const asNum = Number(raw.limit);
    if (!Number.isInteger(asNum)) {
      return { error: { code: 'invalid_request', message: 'limit must be an integer' } };
    }
    if (asNum < DECRYPTED_MESSAGES_LIMIT_MIN || asNum > DECRYPTED_MESSAGES_LIMIT_MAX) {
      return {
        error: {
          code: 'invalid_request',
          message: `limit must be between ${DECRYPTED_MESSAGES_LIMIT_MIN} and ${DECRYPTED_MESSAGES_LIMIT_MAX}`,
        },
      };
    }
    limit = asNum;
  }

  let cursor: string | undefined;
  if (raw.cursor !== undefined) {
    if (typeof raw.cursor !== 'string' || !UUID_REGEX.test(raw.cursor)) {
      return { error: { code: 'invalid_request', message: 'cursor must be a valid UUID' } };
    }
    cursor = raw.cursor;
  }

  if (actor === 'visitor') {
    const sessionToken = raw.session_token;
    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      return {
        error: { code: 'invalid_request', message: 'session_token is required for visitor' },
      };
    }
    return {
      value: {
        actor: 'visitor',
        conversation_id: conversationId,
        session_token: sessionToken,
        cursor,
        limit,
      },
    };
  }

  if (raw.session_token !== undefined) {
    return {
      error: {
        code: 'invalid_request',
        message: 'session_token must only be provided for visitor actor',
      },
    };
  }

  if (actor === 'owner-private-agent-chat') {
    let includeEvents: boolean | undefined;
    if (raw.include_events !== undefined) {
      if (typeof raw.include_events !== 'boolean') {
        return { error: { code: 'invalid_request', message: 'include_events must be a boolean' } };
      }
      includeEvents = raw.include_events;
    }

    let runId: string | undefined;
    if (raw.run_id !== undefined) {
      if (typeof raw.run_id !== 'string' || !UUID_REGEX.test(raw.run_id)) {
        return { error: { code: 'invalid_request', message: 'run_id must be a valid UUID' } };
      }
      runId = raw.run_id;
    }

    let afterSeq: number | undefined;
    if (raw.after_seq !== undefined) {
      const asNum = Number(raw.after_seq);
      if (!Number.isInteger(asNum) || asNum < 0) {
        return { error: { code: 'invalid_request', message: 'after_seq must be a non-negative integer' } };
      }
      afterSeq = asNum;
    }

    return {
      value: {
        actor: 'owner-private-agent-chat',
        conversation_id: conversationId,
        cursor,
        limit,
        include_events: includeEvents,
        run_id: runId,
        after_seq: afterSeq,
      },
    };
  }

  return {
    value: {
      actor: actor as 'owner' | 'agent',
      conversation_id: conversationId,
      cursor,
      limit,
    },
  };
}

// ---------------------------------------------------------------------------
// Step 2 + 3: authentication + conversation-access authorization.
// ---------------------------------------------------------------------------

type AccessError = { status: number; code: string; message: string };
type AccessResult = { ok: true } | { error: AccessError };

/**
 * authenticateOwner / authenticateAgent only inspect `Authorization` (and
 * internal env for server config). `req.json()` has already been consumed by
 * parseBody, which is fine — we pass the same Request object; the helpers
 * never re-read the body.
 */
async function resolveConversationAccess(
  req: Request,
  body: DecryptedMessagesRequest
): Promise<AccessResult> {
  const supabase = getServiceClient();

  // All actors collapse "conversation missing" and "conversation not yours"
  // into a single 403. Owners and agents are authenticated callers, so a 404
  // would leak conversation-id existence to anyone who can mint a valid
  // Supabase JWT or agent API key (M3-C1 DB-M1). The visitor path has always
  // behaved this way.
  if (body.actor === 'owner-private-agent-chat') {
    let auth: Awaited<ReturnType<typeof authenticateOwner>>;
    try {
      auth = await authenticateOwner(req);
    } catch {
      return {
        error: { status: 401, code: 'unauthorized', message: 'Missing or invalid token' },
      };
    }

    const { data, error } = await supabase
      .from('owner_agent_conversations')
      .select('id, owner_id, owners!inner ( user_id )')
      .eq('id', body.conversation_id)
      .single();

    if (error || !data) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }

    const ownerConversation = data as unknown as Record<string, unknown>;
    const owners = ownerConversation.owners as Record<string, unknown> | null;
    if (!owners || owners.user_id !== auth.user.id) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }

    if (body.run_id) {
      const { data: run, error: runError } = await supabase
        .from('owner_agent_runs')
        .select('id')
        .eq('id', body.run_id)
        .eq('conversation_id', body.conversation_id)
        .eq('owner_id', String(ownerConversation.owner_id))
        .single();

      if (runError || !run) {
        return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
      }
    }

    return { ok: true };
  }

  if (body.actor === 'owner') {
    let auth: Awaited<ReturnType<typeof authenticateOwner>>;
    try {
      auth = await authenticateOwner(req);
    } catch {
      return {
        error: { status: 401, code: 'unauthorized', message: 'Missing or invalid token' },
      };
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('id, qrcodes!inner ( agents!inner ( owner_id, owners!inner ( user_id ) ) )')
      .eq('id', body.conversation_id)
      .single();

    if (error || !data) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }

    const qrcodes = (data as unknown as Record<string, unknown>).qrcodes as Record<
      string,
      unknown
    > | null;
    const agents = qrcodes?.agents as Record<string, unknown> | null;
    const owners = agents?.owners as Record<string, unknown> | null;
    if (!qrcodes || !agents || !owners || owners.user_id !== auth.user.id) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }
    return { ok: true };
  }

  if (body.actor === 'agent') {
    let auth: Awaited<ReturnType<typeof authenticateAgent>>;
    try {
      auth = await authenticateAgent(req);
    } catch {
      return {
        error: { status: 401, code: 'unauthorized', message: 'Invalid agent credentials' },
      };
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('id, qrcodes!inner ( agent_id )')
      .eq('id', body.conversation_id)
      .single();

    if (error || !data) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }

    const qrcodes = (data as unknown as Record<string, unknown>).qrcodes as Record<
      string,
      unknown
    > | null;
    if (!qrcodes || qrcodes.agent_id !== auth.agentId) {
      return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
    }
    return { ok: true };
  }

  // visitor
  const { data, error } = await supabase
    .from('conversations')
    .select('id, session_token')
    .eq('id', body.conversation_id)
    .single();

  if (error || !data) {
    // Do not leak existence; 403 instead of 404 hides the conversation-id oracle.
    return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
  }

  if (!constantTimeEqual(String(data.session_token), body.session_token)) {
    return { error: { status: 403, code: 'forbidden', message: 'Access denied' } };
  }

  return { ok: true };
}

/**
 * Constant-time string equality.
 *
 * M3-C1 SEC-M-2 / DB-M2: the previous version returned early on length
 * mismatch, which leaked the stored token's length through response-time
 * jitter. We now always iterate max(a.length, b.length) and XOR the length
 * difference into the accumulator so both short and long inputs take the same
 * amount of work before the final comparison.
 *
 * `charCodeAt(i)` returns NaN for indices past the end of the string; `| 0`
 * normalises that to zero without branching.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = a.length > b.length ? a.length : b.length;
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    const ca = a.charCodeAt(i) | 0;
    const cb = b.charCodeAt(i) | 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Step 4 + 5 + 6 + 7: fetch encryption key, unwrap DEK, page messages, decrypt.
// ---------------------------------------------------------------------------

async function fetchAndDecrypt(body: DecryptedMessagesRequest): Promise<Response> {
  if (body.actor === 'owner-private-agent-chat') {
    return fetchAndDecryptOwnerAgentChat(body);
  }

  const supabase = getServiceClient();

  let kekBytes: Uint8Array;
  try {
    kekBytes = readKekBytes();
  } catch (err) {
    if (err instanceof KekMissingError) {
      console.error('QRCLAW_KEK_V1 not configured');
      return errorResponse('internal_error', 'Encryption configuration error', 500);
    }
    throw err;
  }

  const { data: encKey, error: keyError } = await supabase
    .from('encryption_keys')
    .select('key_id, key_data_encrypted')
    .eq('conversation_id', body.conversation_id)
    .eq('status', 'active')
    .single();

  if (keyError || !encKey) {
    return jsonResponse(emptyEnvelope());
  }

  let dekBytes: Uint8Array;
  try {
    const encryptedDekString = byteaToUtf8String(encKey.key_data_encrypted);
    dekBytes = await decryptDek(encryptedDekString, kekBytes);
  } catch (err) {
    console.error('Failed to unwrap DEK:', err instanceof Error ? err.message : String(err));
    return errorResponse('encryption_error', 'Failed to decrypt messages', 500);
  }

  const limit = body.limit ?? DECRYPTED_MESSAGES_LIMIT_DEFAULT;

  // Composite keyset pagination on (sent_at DESC, id DESC).
  //
  // M3-C1 DB-B1: the previous strict-less-than on sent_at silently dropped
  // rows with identical sent_at values (timestamptz has microsecond
  // resolution, but tied inserts do happen in batch flush paths). We now
  // break ties on messages.id, matching the composite index introduced in
  // 20260420_m3_c1_fixes.sql.
  //
  // M3-C1 DB-M3: an invalid cursor used to silently reset to page 1, which
  // made client-side paging bugs invisible. We now return 400 so callers
  // fail fast.
  let cursorRow: { sent_at: string; id: string } | null = null;
  if (body.cursor) {
    const { data: cursorMsg, error: cursorErr } = await supabase
      .from('messages')
      .select('sent_at, id')
      .eq('id', body.cursor)
      .eq('conversation_id', body.conversation_id)
      .maybeSingle();
    if (cursorErr) {
      console.error('Cursor lookup failed:', cursorErr.message);
      return errorResponse('internal_error', 'Failed to resolve cursor', 500);
    }
    if (!cursorMsg) {
      return errorResponse('invalid_cursor', 'Cursor does not reference a visible message', 400);
    }
    cursorRow = { sent_at: String(cursorMsg.sent_at), id: String(cursorMsg.id) };
  }

  let query = supabase
    .from('messages')
    .select(
      'id, message_id, content_encrypted, encryption_meta, role, sent_at, reply_to_message_id, thread_id'
    )
    .eq('conversation_id', body.conversation_id)
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursorRow) {
    // (sent_at, id) < (cursor.sent_at, cursor.id) in reverse-chronological
    // order. PostgREST does not support raw row-value comparisons, so we
    // express this as:
    //   sent_at <  cursor.sent_at
    //   OR (sent_at = cursor.sent_at AND id < cursor.id)
    // via .or(), which emits a single AND group at the SQL layer.
    const orExpr = `and(sent_at.eq.${cursorRow.sent_at},id.lt.${cursorRow.id}),sent_at.lt.${cursorRow.sent_at}`;
    query = query.or(orExpr);
  }

  const { data: messages, error: msgError } = await query;
  if (msgError || !messages) {
    return jsonResponse(emptyEnvelope());
  }

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  const decrypted = await Promise.all(
    page.map((row) => decryptRow(row as Record<string, unknown>, dekBytes))
  );

  const nextCursor = hasMore ? String((page[page.length - 1] as Record<string, unknown>).id) : null;

  const response: DecryptedMessagesResponse = {
    data: decrypted,
    meta: { cursor: nextCursor, has_more: hasMore },
  };
  return jsonResponse(response);
}

async function fetchAndDecryptOwnerAgentChat(
  body: DecryptedOwnerPrivateAgentChatRequest
): Promise<Response> {
  const supabase = getServiceClient();

  let kekBytes: Uint8Array;
  try {
    kekBytes = readKekBytes();
  } catch (err) {
    if (err instanceof KekMissingError) {
      console.error('QRCLAW_KEK_V1 not configured');
      return errorResponse('internal_error', 'Encryption configuration error', 500);
    }
    throw err;
  }

  const { data: encKey, error: keyError } = await supabase
    .from('owner_agent_conversation_keys')
    .select('key_id, key_data_encrypted')
    .eq('conversation_id', body.conversation_id)
    .eq('status', 'active')
    .single();

  if (keyError || !encKey) {
    return jsonResponse(emptyEnvelope());
  }

  let dekBytes: Uint8Array;
  try {
    const encryptedDekString = byteaToUtf8String(encKey.key_data_encrypted);
    dekBytes = await decryptDek(encryptedDekString, kekBytes);
  } catch (err) {
    console.error('Failed to unwrap owner agent DEK:', err instanceof Error ? err.message : String(err));
    return errorResponse('encryption_error', 'Failed to decrypt messages', 500);
  }

  const limit = body.limit ?? DECRYPTED_MESSAGES_LIMIT_DEFAULT;
  let cursorRow: { created_at: string; id: string } | null = null;
  if (body.cursor) {
    const { data: cursorMsg, error: cursorErr } = await supabase
      .from('owner_agent_messages')
      .select('created_at, id')
      .eq('id', body.cursor)
      .eq('conversation_id', body.conversation_id)
      .maybeSingle();
    if (cursorErr) {
      console.error('Owner private cursor lookup failed:', cursorErr.message);
      return errorResponse('internal_error', 'Failed to resolve cursor', 500);
    }
    if (!cursorMsg) {
      return errorResponse('invalid_cursor', 'Cursor does not reference a visible message', 400);
    }
    cursorRow = { created_at: String(cursorMsg.created_at), id: String(cursorMsg.id) };
  }

  let messageQuery = supabase
    .from('owner_agent_messages')
    .select(
      'id, run_id, sender_type, content_encrypted, content_type, encryption_meta, status, created_at'
    )
    .eq('conversation_id', body.conversation_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursorRow) {
    const orExpr = `and(created_at.eq.${cursorRow.created_at},id.lt.${cursorRow.id}),created_at.lt.${cursorRow.created_at}`;
    messageQuery = messageQuery.or(orExpr);
  }

  const { data: messages, error: msgError } = await messageQuery;
  if (msgError || !messages) {
    return jsonResponse(emptyEnvelope());
  }

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const decrypted = await Promise.all(
    page.map((row) => decryptOwnerAgentMessageRow(row as Record<string, unknown>, dekBytes))
  );
  const nextCursor = hasMore ? String((page[page.length - 1] as Record<string, unknown>).id) : null;

  const events = body.include_events
    ? await fetchAndDecryptOwnerAgentRunEvents(body, dekBytes)
    : undefined;

  const response: DecryptedMessagesResponse = {
    data: decrypted,
    ...(events ? { events } : {}),
    meta: {
      cursor: nextCursor,
      has_more: hasMore,
      ...(events ? { event_cursor: events.length > 0 ? events[events.length - 1].seq : null } : {}),
    },
  };
  return jsonResponse(response);
}

async function fetchAndDecryptOwnerAgentRunEvents(
  body: DecryptedOwnerPrivateAgentChatRequest,
  dekBytes: Uint8Array
): Promise<DecryptedOwnerAgentRunEvent[]> {
  if (!body.run_id) {
    return [];
  }

  const supabase = getServiceClient();
  const limit = body.limit ?? DECRYPTED_MESSAGES_LIMIT_DEFAULT;
  let query = supabase
    .from('owner_agent_run_events')
    .select('id, run_id, seq, type, content_encrypted, encryption_meta, metadata, created_at')
    .eq('run_id', body.run_id)
    .order('seq', { ascending: true })
    .limit(limit + 1);

  if (typeof body.after_seq === 'number') {
    query = query.gt('seq', body.after_seq);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  const page = data.length > limit ? data.slice(0, limit) : data;
  return Promise.all(
    page.map((row) => decryptOwnerAgentRunEventRow(row as Record<string, unknown>, dekBytes))
  );
}

function emptyEnvelope(): DecryptedMessagesResponse {
  return { data: [], meta: { cursor: null, has_more: false } };
}

async function decryptRow(
  row: Record<string, unknown>,
  dekBytes: Uint8Array
): Promise<DecryptedMessage> {
  const meta = (row.encryption_meta as { iv?: string; tag?: string } | null) ?? null;
  const base: Omit<DecryptedMessage, 'content'> = {
    id: String(row.id),
    message_id: String(row.message_id),
    sender_type: row.role as MessageRole,
    persisted_at: String(row.sent_at),
    reply_to_message_id: (row.reply_to_message_id as string | null | undefined) ?? null,
    thread_id: (row.thread_id as string | null | undefined) ?? null,
  };

  const content = await decryptPayload(base.id, row.content_encrypted, meta, dekBytes);
  return { ...base, content };
}

async function decryptOwnerAgentMessageRow(
  row: Record<string, unknown>,
  dekBytes: Uint8Array
): Promise<DecryptedMessage> {
  const meta = (row.encryption_meta as { iv?: string; tag?: string } | null) ?? null;
  const base: Omit<DecryptedMessage, 'content'> = {
    id: String(row.id),
    message_id: String(row.id),
    sender_type: row.sender_type as MessageRole,
    persisted_at: String(row.created_at),
    run_id: (row.run_id as string | null | undefined) ?? null,
    content_type: String(row.content_type ?? 'text'),
    status: String(row.status ?? 'sent'),
    reply_to_message_id: null,
    thread_id: null,
  };

  const content = await decryptPayload(base.id, row.content_encrypted, meta, dekBytes);
  return { ...base, content };
}

async function decryptOwnerAgentRunEventRow(
  row: Record<string, unknown>,
  dekBytes: Uint8Array
): Promise<DecryptedOwnerAgentRunEvent> {
  const meta = (row.encryption_meta as { iv?: string; tag?: string } | null) ?? null;
  const rawContent = row.content_encrypted;
  const content = rawContent
    ? await decryptPayload(String(row.id), rawContent, meta, dekBytes)
    : null;

  return {
    id: String(row.id),
    run_id: String(row.run_id),
    seq: Number(row.seq),
    type: String(row.type),
    content,
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? {},
    persisted_at: String(row.created_at),
  };
}

async function decryptPayload(
  rowId: string,
  raw: unknown,
  meta: { iv?: string; tag?: string } | null,
  dekBytes: Uint8Array
): Promise<string> {
  if (!meta?.iv || !meta?.tag || !raw) {
    return DECRYPTION_UNAVAILABLE_SENTINEL;
  }

  try {
    const ciphertextBase64 = normalizeCiphertext(raw);
    if (!ciphertextBase64) {
      return DECRYPTION_UNAVAILABLE_SENTINEL;
    }

    return await decryptEnvelope(
      {
        ciphertext: ciphertextBase64,
        iv: meta.iv,
        tag: meta.tag,
        dekId: '',
        algorithm: 'aes-256-gcm',
      },
      dekBytes
    );
  } catch (err) {
    console.error(`Failed to decrypt payload ${rowId}:`, err instanceof Error ? err.message : String(err));
    return DECRYPTION_FAILED_SENTINEL;
  }
}

function normalizeCiphertext(raw: unknown): string | null {
  // content_encrypted arrives from supabase-js as one of:
  //   - Uint8Array (preferred in Deno supabase-js)
  //   - `\x<hex>` string (bytea hex-escape form)
  //   - base64 string (rare driver variant)
  // Normalise into a base64 envelope for decryptEnvelope().
  if (raw instanceof Uint8Array) {
    return uint8ArrayToBase64(raw);
  }
  if (typeof raw === 'string' && raw.startsWith('\\x')) {
    return hexToBase64(raw.slice(2));
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return uint8ArrayToBase64(bytes);
}
