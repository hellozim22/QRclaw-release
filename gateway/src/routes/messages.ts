/**
 * POST /api/messages — thin forwarder to the `decrypted-messages` Edge
 * Function (M3-T5).
 *
 * BEFORE (legacy): the gateway unwrapped the DEK with ENCRYPTION_KEK and
 * decrypted message envelopes in Node. That duplicated every bit of crypto we
 * also run in the Edge Function and kept the KEK inside the Node trust
 * boundary. M3-T6 retires the gateway KEK read-path entirely.
 *
 * NOW: the gateway only:
 *   1. Validates the public request body (unchanged shape for backward
 *      compatibility with web/src/lib/ws/history.ts and the gateway-test /
 *      production curl callers).
 *   2. Resolves conversation_id from (qr_code_id + session_token) — a
 *      privacy-safe lookup that never touches plaintext.
 *   3. Forwards to the unified Edge Function as a `visitor` actor.
 *   4. Reshapes the unified response into the legacy envelope
 *      { data: { messages: [{ id, content, role, sent_at }] } }, preserving
 *      the contract that web already consumes.
 *
 * Notes:
 *   - The legacy `before` (ISO timestamp) parameter is not forwarded. The new
 *     contract's cursor is `messages.id`, not a timestamp, and no live caller
 *     sends `before` today (see web/src/lib/ws/history.ts — only limit is
 *     set). Supporting a timestamp → UUID translation is deferred until any
 *     caller actually needs pagination.
 *   - Error mapping mirrors the historical status codes to keep the public
 *     behaviour stable:
 *       no conversation found      → 200 with empty list (privacy; do not
 *                                    distinguish "wrong token" from "no
 *                                    history yet")
 *       forbidden upstream          → 200 with empty list (same reason)
 *       other upstream failures     → 500 (generic)
 *       supabase unconfigured       → 503
 */
import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { validateRequest } from '../middleware/validate-request.js';
import { messagesHistoryRequestSchema } from '../../../shared/contracts/http/messages/protocol.js';
import {
  MESSAGES_LIMIT_DEFAULT,
  MESSAGES_LIMIT_MAX,
  MESSAGES_LIMIT_MIN,
  type MessagesHistoryRequest,
} from '../../../shared/contracts/http/messages/types.js';
import {
  DECRYPTED_MESSAGES_LIMIT_MAX,
  DECRYPTED_MESSAGES_LIMIT_MIN,
  type DecryptedMessage,
} from '../../../shared/contracts/http/decrypted-messages/types.js';
import { callDecryptedMessages } from '../services/decrypted-messages-client.js';

export const messagesRouter = Router();

messagesRouter.post(
  '/api/messages',
  validateRequest(messagesHistoryRequestSchema),
  async (req, res) => {
    try {
      if (!isSupabaseConfigured()) {
        res
          .status(503)
          .json({ error: { code: 'service_unavailable', message: 'Database not configured' } });
        return;
      }

      const body = req.body as MessagesHistoryRequest;
      const { qr_code_id, session_token } = body;
      const pageLimit = clampLimit(body.limit ?? MESSAGES_LIMIT_DEFAULT);

      // Step 1: resolve conversation_id without reading any plaintext.
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('qrcode_id', qr_code_id)
        .eq('session_token', session_token)
        .limit(1)
        .maybeSingle();

      if (!conversation) {
        // No conversation for this (qr_code_id, session_token). Return empty
        // rather than leak existence of the qrcode or session.
        res.status(200).json({ data: { messages: [] } });
        return;
      }

      // Step 2: forward to the unified Edge Function.
      const result = await callDecryptedMessages({
        actor: 'visitor',
        conversation_id: conversation.id,
        session_token,
        limit: pageLimit,
      });

      if (!result.ok) {
        // Forbidden / not_found upstream = treat as empty history (privacy).
        // Any other failure = surface as generic 500 so observability catches
        // real regressions but the session_token is never echoed back.
        if (result.error.code === 'forbidden' || result.error.code === 'not_found') {
          res.status(200).json({ data: { messages: [] } });
          return;
        }
        console.error(
          '[Messages] Upstream decrypted-messages failed:',
          result.error.code,
          result.error.message
        );
        res
          .status(500)
          .json({ error: { code: 'internal_error', message: 'Failed to fetch messages' } });
        return;
      }

      // Step 3: reshape to the legacy envelope.
      res.status(200).json({ data: { messages: result.data.data.map(toLegacyMessage) } });
    } catch (err) {
      console.error('[Messages] Error:', (err as Error).message);
      res
        .status(500)
        .json({ error: { code: 'internal_error', message: 'Failed to fetch messages' } });
    }
  }
);

/**
 * Clamp the legacy `limit` to the intersection of the legacy and unified
 * ranges. Legacy accepts [1, 100]; unified accepts [1, 100]. The intersection
 * is identical today but the explicit clamp future-proofs drift.
 */
function clampLimit(raw: number): number {
  const low = Math.max(MESSAGES_LIMIT_MIN, DECRYPTED_MESSAGES_LIMIT_MIN);
  const high = Math.min(MESSAGES_LIMIT_MAX, DECRYPTED_MESSAGES_LIMIT_MAX);
  if (raw < low) return low;
  if (raw > high) return high;
  return raw;
}

interface LegacyMessage {
  id: string;
  content: string;
  role: DecryptedMessage['sender_type'];
  sent_at: string;
}

/**
 * Map a unified `DecryptedMessage` into the legacy shape the web client
 * expects. `id` uses `message_id` (the client-generated identifier) for
 * continuity with the previous behaviour — before M3 the Node route returned
 * `message_id` as `id`. Switching to the surrogate UUID would break the web
 * ChatMessage reconciliation logic.
 */
function toLegacyMessage(m: DecryptedMessage): LegacyMessage {
  return {
    id: m.message_id,
    content: m.content,
    role: m.sender_type,
    sent_at: m.persisted_at,
  };
}
