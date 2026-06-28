// Zod validation schemas for QRClaw OUTBOUND WebSocket frames
// (Gateway → Client). Paired with `types.ts` so that
// `z.infer<typeof XschemaOutbound>` stays in lock-step with the
// hand-written `XFrame` interface (parity tests in
// `tests/unit/shared/contracts-ws-outbound.test.ts`).
//
// Why a separate file from `protocol.ts`?
// - `protocol.ts` validates inbound traffic (client → gateway). Keeping
//   outbound schemas alongside reinforces directionality at the
//   filesystem level — `.strict()` rules here target what the gateway
//   emits, not what it accepts.
// - Bidirectional frames (`stream_chunk`, `stream_end`) already diverge
//   on the wire (stream_end outbound can carry `security_envelope`),
//   so a single unified schema would require either a weaker strict
//   mode or per-direction refinements — both lose clarity.
// - Web MUST NOT import this file: it pulls in zod. Web continues to
//   consume TS types only (via `types.ts`). The barrel `index.ts`
//   intentionally does NOT re-export outbound schemas.

import { z } from 'zod';
import {
  ACK_STATUSES,
  OUTBOUND_FRAME_TYPES,
  OWNER_AGENT_WS_PROVIDERS,
  OWNER_AGENT_WS_RUN_EVENT_TYPES,
  type OutboundFrameType,
} from './types.js';

// ─── Field constraints ──────────────────────────────────────────────
//
// Kept in-file rather than shared with `protocol.ts` — outbound caps
// may evolve independently (e.g. gateway-generated frames can be longer
// than client-submitted ones). Today every limit matches inbound.

const MAX_CONTENT_LENGTH = 16_384;
const MAX_ID_LENGTH = 64;
const MAX_DELTA_LENGTH = 4_096;
const MAX_OWNER_AGENT_EVENT_CONTENT_LENGTH = 4_096;

// ─── Shared primitives ─────────────────────────────────────────────

const timestampSchema = z.string().min(1).max(64);
const messageIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const conversationIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const contentSchema = z.string().min(1).max(MAX_CONTENT_LENGTH);
const uuidSchema = z.string().uuid();

// ─── Security envelope (D2 / D3) ────────────────────────────────────
//
// Shared between `messageOutboundSchema` and `streamEndOutboundSchema`.
// Shape tracks `SecurityEnvelope` in `types.ts`.

const securityEnvelopeSchema = z
  .object({
    // NIT-3 (Phase 2 Wave 2): treat empty strings as drift — an envelope
    // with a blank `version` / `policy_id` / `policy_hash` / etc. is a
    // gateway bug, not a valid payload. Matches the `.min(1)` style used
    // by `messageIdSchema` / `contentSchema`.
    version: z.string().min(1),
    policy_id: z.string().min(1),
    policy_hash: z.string().min(1),
    rules: z.array(z.string().min(1)),
    enforcement_text: z.string().min(1),
    injected_at: z.string().min(1),
  })
  .strict();

// ─── 1. connection_ack ──────────────────────────────────────────────

export const connectionAckOutboundSchema = z
  .object({
    type: z.literal('connection_ack'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        connection_id: z.string().min(1),
        heartbeat_interval_ms: z.number().int().nonnegative(),
        server_time: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// ─── 2. ack ─────────────────────────────────────────────────────────
//
// D5 drift resolution: the enum below mirrors `AckStatus` from
// `types.ts` and covers every value the router actually emits.

export const ackOutboundSchema = z
  .object({
    type: z.literal('ack'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        message_id: messageIdSchema,
        // Single source of truth: `ACK_STATUSES` tuple in `types.ts`.
        // Zod v4's `z.enum(<const readonly string[]>)` overload preserves
        // the literal union in the inferred type, which is what the
        // parity test against `AckStatus` relies on. We deliberately do
        // NOT use the `as unknown as [string, ...string[]]` cast that
        // the frame-type dispatcher below uses — that cast erases
        // literals down to `string` and would break parity.
        status: z.enum(ACK_STATUSES),
        error_code: z.string().optional(),
        error_message: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// ─── 3. message ─────────────────────────────────────────────────────
//
// D2: optional `security_envelope` (injected on agent→visitor forwards).
// D4: optional `queued_at` (offline-queue drain on agent reconnect).

export const messageOutboundSchema = z
  .object({
    type: z.literal('message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'markdown', 'image_url', 'file_url']),
        sender_type: z.enum(['visitor', 'agent']),
        conversation_id: conversationIdSchema,
        reply_to_message_id: messageIdSchema.optional(),
        thread_id: messageIdSchema.optional(),
        security_envelope: securityEnvelopeSchema.optional(),
        queued_at: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// ─── 4. agent_typing ────────────────────────────────────────────────

export const agentTypingOutboundSchema = z
  .object({
    type: z.literal('agent_typing'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        conversation_id: conversationIdSchema,
      })
      .strict(),
  })
  .strict();

// ─── 5. pong ────────────────────────────────────────────────────────
//
// Gateway emits `{type, timestamp}` with no `id` and no `payload`
// (`router.ts:589–595`). The schema therefore omits both — parity with
// `PongFrame` (which inherits optional `id` / `payload` from WSFrame)
// is via `toMatchTypeOf` in the test file, not `toEqualTypeOf`.

export const pongOutboundSchema = z
  .object({
    type: z.literal('pong'),
    timestamp: timestampSchema,
  })
  .strict();

// ─── 6. error ───────────────────────────────────────────────────────
//
// D7: `code` is locked to the eight fixed values the gateway actually
// emits (seven router codes plus an explicit `unknown_error` catch-all
// for future additions — NOT a passthrough). TS keeps `code: string`;
// this Zod enum is the single source of truth for the closed set.
// D6: optional `message_id` (router.ts:389 on routing_error).

export const errorOutboundSchema = z
  .object({
    type: z.literal('error'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        code: z.enum([
          'auth_required',
          'invalid_json',
          'invalid_frame',
          'routing_error',
          'rate_limited',
          'forbidden',
          'unknown_message_type',
          'unknown_error',
        ]),
        message: z.string().min(1),
        details: z.record(z.string(), z.unknown()).optional(),
        message_id: messageIdSchema.optional(),
      })
      .strict(),
  })
  .strict();

// ─── 7. system ──────────────────────────────────────────────────────

export const systemOutboundSchema = z
  .object({
    type: z.literal('system'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        event: z.enum([
          'agent_online',
          'agent_offline',
          'qrcode_paused',
          'qrcode_activated',
          'session_expired',
        ]),
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

// ─── 8. stream_chunk (outbound) ─────────────────────────────────────
//
// Currently identical in shape to the inbound schema, declared
// independently so the two can diverge without cross-contamination
// (same motivation as `stream_end`).

export const streamChunkOutboundSchema = z
  .object({
    type: z.literal('stream_chunk'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        conversation_id: conversationIdSchema,
        delta: z.string().min(1).max(MAX_DELTA_LENGTH),
        sequence: z.number().int().nonnegative().optional(),
        is_final: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

// ─── 9. stream_end (outbound) ───────────────────────────────────────
//
// D3: optional `security_envelope` on the outbound side only.

export const streamEndOutboundSchema = z
  .object({
    type: z.literal('stream_end'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        conversation_id: conversationIdSchema,
        total_chunks: z.number().int().nonnegative().optional(),
        total_length: z.number().int().nonnegative().optional(),
        full_content: z.string().max(MAX_CONTENT_LENGTH).optional(),
        security_envelope: securityEnvelopeSchema.optional(),
      })
      .strict(),
  })
  .strict();

// ─── 10. visitor_message (outbound broadcast, D1) ───────────────────
//
// Emitted by `router.ts:203–218` when a visitor frame is fanned out to
// agent runtimes. Distinct from the inbound `visitor_message` schema in
// `protocol.ts` because this direction carries gateway-only fields
// (`sender_type`, `conversation_id`, `qr_code_id`, `system_prompt`)
// that must never be accepted from clients.

export const visitorMessageBroadcastOutboundSchema = z
  .object({
    type: z.literal('visitor_message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'image_url', 'file_url']),
        sender_type: z.literal('visitor'),
        conversation_id: conversationIdSchema,
        qr_code_id: z.string().min(1).max(MAX_ID_LENGTH).optional(),
        system_prompt: z.string().max(MAX_CONTENT_LENGTH).optional(),
        reply_to_message_id: messageIdSchema.optional(),
        thread_id: messageIdSchema.optional(),
      })
      .strict(),
  })
  .strict();

const ownerAgentRunBasePayloadShape = {
  run_id: uuidSchema,
  conversation_id: uuidSchema,
  agent_id: uuidSchema,
  provider: z.enum(OWNER_AGENT_WS_PROVIDERS),
  correlation_id: z.string().min(1).max(MAX_ID_LENGTH),
};

export const ownerAgentRunRequestOutboundSchema = z
  .object({
    type: z.literal('owner_agent_run_request'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        owner_message_id: uuidSchema,
        content: contentSchema,
        content_type: z.literal('text'),
        instructions: z.string().nullable().optional(),
        requested_model: z.string().nullable().optional(),
        provider_session_id: z.string().nullable().optional(),
        provider_work_dir: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunEventOutboundSchema = z
  .object({
    type: z.literal('owner_agent_run_event'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        seq: z.number().int().positive(),
        event_type: z.enum(OWNER_AGENT_WS_RUN_EVENT_TYPES),
        content: z.string().max(MAX_OWNER_AGENT_EVENT_CONTENT_LENGTH).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunCompletedOutboundSchema = z
  .object({
    type: z.literal('owner_agent_run_completed'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        seq: z.number().int().positive(),
        final_message: z.string().max(MAX_CONTENT_LENGTH).optional(),
        actual_model: z.string().nullable().optional(),
        provider_session_id: z.string().nullable().optional(),
        provider_work_dir: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunFailedOutboundSchema = z
  .object({
    type: z.literal('owner_agent_run_failed'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        seq: z.number().int().positive(),
        error_code: z.string().min(1).max(128),
        error_message: z.string().min(1).max(512),
        retryable: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunCancelOutboundSchema = z
  .object({
    type: z.literal('owner_agent_run_cancel'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        reason: z.string().min(1).max(256).optional(),
        requested_by: z.enum(['owner', 'gateway']),
      })
      .strict(),
  })
  .strict();

// ─── Discriminator + dispatch ───────────────────────────────────────
//
// `OUTBOUND_FRAME_TYPES` / `OutboundFrameType` now live in `./types.ts`
// (symmetric with `INBOUND_FRAME_TYPES`) so zod-free consumers can do
// exhaustive narrowing without pulling in this schema module. Re-exported
// here to keep `gateway/src/ws/schemas.ts` and existing call sites
// working without churn.
export { OUTBOUND_FRAME_TYPES };
export type { OutboundFrameType };

export const outboundSchemaMap: Record<OutboundFrameType, z.ZodType> = {
  connection_ack: connectionAckOutboundSchema,
  ack: ackOutboundSchema,
  message: messageOutboundSchema,
  agent_typing: agentTypingOutboundSchema,
  pong: pongOutboundSchema,
  error: errorOutboundSchema,
  system: systemOutboundSchema,
  stream_chunk: streamChunkOutboundSchema,
  stream_end: streamEndOutboundSchema,
  visitor_message: visitorMessageBroadcastOutboundSchema,
  owner_agent_run_request: ownerAgentRunRequestOutboundSchema,
  owner_agent_run_event: ownerAgentRunEventOutboundSchema,
  owner_agent_run_completed: ownerAgentRunCompletedOutboundSchema,
  owner_agent_run_failed: ownerAgentRunFailedOutboundSchema,
  owner_agent_run_cancel: ownerAgentRunCancelOutboundSchema,
};

const outboundFrameTypeSchema = z
  .object({
    type: z.enum(OUTBOUND_FRAME_TYPES as unknown as [string, ...string[]]),
  })
  .passthrough();

export interface OutboundValidationResult {
  success: true;
  data: Record<string, unknown>;
}

export interface OutboundValidationError {
  success: false;
  error: string;
}

export const validateOutboundFrame = (
  raw: unknown
): OutboundValidationResult | OutboundValidationError => {
  const typeResult = outboundFrameTypeSchema.safeParse(raw);
  if (!typeResult.success) {
    const firstIssue = typeResult.error.issues[0];
    return {
      success: false,
      error: firstIssue?.path.includes('type')
        ? 'Invalid or missing message type'
        : firstIssue?.message || 'Invalid frame structure',
    };
  }

  const frameType = typeResult.data.type as OutboundFrameType;
  const schema = outboundSchemaMap[frameType];
  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join('.') || '';
    return {
      success: false,
      error: `Validation failed${path ? ` at ${path}` : ''}: ${
        firstIssue?.message || 'unknown error'
      }`,
    };
  }

  return { success: true, data: result.data as Record<string, unknown> };
};
