// Zod validation schemas for QRClaw WebSocket frames.
// Lifted from gateway/src/ws/schemas.ts so gateway + any future runtime
// validator (e.g. Supabase Edge) share one definition.
// Web MUST NOT import this file — it pulls in zod. Web imports types only.
//
// Iron Rule: Never trust client-supplied data. Validate structure and
// constrain field sizes before any processing.

import { z } from 'zod';
import {
  INBOUND_FRAME_TYPES,
  OWNER_AGENT_WS_PROVIDERS,
  OWNER_AGENT_WS_PROVIDER_STATUSES,
  OWNER_AGENT_WS_RUN_EVENT_TYPES,
  type InboundFrameType,
} from './types.js';

// ─── Field Constraints ──────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 16_384; // 16 KB text content
const MAX_ID_LENGTH = 64;
const MAX_DELTA_LENGTH = 4_096;
const MAX_MESSAGE_IDS = 50;
const MAX_METADATA_KEYS = 10;
const MAX_OWNER_AGENT_EVENT_CONTENT_LENGTH = 4_096;

// ─── Shared primitives ──────────────────────────────────────────────

const timestampSchema = z.string().min(1).max(64);
const messageIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const conversationIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const contentSchema = z.string().min(1).max(MAX_CONTENT_LENGTH);
const uuidSchema = z.string().uuid();
const metadataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .refine((val) => !val || Object.keys(val).length <= MAX_METADATA_KEYS, {
    message: `Metadata must have at most ${MAX_METADATA_KEYS} keys`,
  });

// ─── Frame schemas (inbound only) ───────────────────────────────────

export const pingFrameSchema = z
  .object({
    type: z.literal('ping'),
    timestamp: timestampSchema,
    payload: z.object({}).optional(),
  })
  .strict();

export const visitorMessageSchema = z
  .object({
    type: z.literal('visitor_message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'image_url', 'file_url']),
        metadata: metadataSchema,
      })
      .strict(),
  })
  .strict();

export const agentMessageSchema = z
  .object({
    type: z.literal('agent_message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'markdown', 'image_url', 'file_url']),
        conversation_id: conversationIdSchema,
        is_final: z.boolean().optional(),
        metadata: metadataSchema,
        reply_to_message_id: messageIdSchema.optional(),
        thread_id: messageIdSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const streamChunkSchema = z
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

export const streamEndSchema = z
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
      })
      .strict(),
  })
  .strict();

export const readReceiptSchema = z
  .object({
    type: z.literal('read_receipt'),
    timestamp: timestampSchema,
    payload: z
      .object({
        message_ids: z.array(messageIdSchema).min(1).max(MAX_MESSAGE_IDS),
      })
      .strict(),
  })
  .strict();

export const authFrameSchema = z
  .object({
    type: z.literal('auth'),
    timestamp: timestampSchema,
    payload: z
      .object({
        ticket: z.string().min(1).max(4096),
        session_token: z.string().max(4096).optional(),
      })
      .strict(),
  })
  .strict();

const hostProviderCapabilitySchema = z
  .object({
    provider: z.enum(OWNER_AGENT_WS_PROVIDERS),
    version: z.string().nullable(),
    status: z.enum(OWNER_AGENT_WS_PROVIDER_STATUSES),
    binary_path: z.string().nullable().optional(),
    capabilities: z
      .object({
        streaming: z.boolean(),
        full_access: z.boolean(),
        models: z.array(z.string().min(1)).optional(),
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

export const hostRegisterFrameSchema = z
  .object({
    type: z.literal('host_register'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        host_id: uuidSchema,
        host_type: z.enum(['local', 'cloud']),
        display_name: z.string().min(1).max(128),
        providers: z.array(hostProviderCapabilitySchema).min(1),
        in_flight_runs: z
          .array(
            z
              .object({
                run_id: uuidSchema,
                last_seq: z.number().int().nonnegative(),
                status: z.enum(['accepted', 'running']),
              })
              .strict()
          )
          .optional(),
      })
      .strict(),
  })
  .strict();

export const hostHeartbeatFrameSchema = z
  .object({
    type: z.literal('host_heartbeat'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        host_id: uuidSchema,
        active_run_ids: z.array(uuidSchema).optional(),
      })
      .strict(),
  })
  .strict();

export const hostCapabilitiesUpdatedFrameSchema = z
  .object({
    type: z.literal('host_capabilities_updated'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        host_id: uuidSchema,
        providers: z.array(hostProviderCapabilitySchema),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunAcceptedFrameSchema = z
  .object({
    type: z.literal('owner_agent_run_accepted'),
    id: messageIdSchema.optional(),
    timestamp: timestampSchema,
    payload: z
      .object({
        ...ownerAgentRunBasePayloadShape,
        host_id: uuidSchema,
        accepted_at: timestampSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentRunEventFrameSchema = z
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

export const ownerAgentRunCompletedFrameSchema = z
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

export const ownerAgentRunFailedFrameSchema = z
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

// ─── Discriminator + dispatch ───────────────────────────────────────

const frameTypeSchema = z
  .object({
    type: z.enum(INBOUND_FRAME_TYPES as unknown as [string, ...string[]]),
  })
  .passthrough();

const schemaMap: Record<InboundFrameType, z.ZodType> = {
  ping: pingFrameSchema,
  visitor_message: visitorMessageSchema,
  agent_message: agentMessageSchema,
  stream_chunk: streamChunkSchema,
  stream_end: streamEndSchema,
  read_receipt: readReceiptSchema,
  auth: authFrameSchema,
  host_register: hostRegisterFrameSchema,
  host_heartbeat: hostHeartbeatFrameSchema,
  host_capabilities_updated: hostCapabilitiesUpdatedFrameSchema,
  owner_agent_run_accepted: ownerAgentRunAcceptedFrameSchema,
  owner_agent_run_event: ownerAgentRunEventFrameSchema,
  owner_agent_run_completed: ownerAgentRunCompletedFrameSchema,
  owner_agent_run_failed: ownerAgentRunFailedFrameSchema,
};

export interface ValidationResult {
  success: true;
  data: Record<string, unknown>;
}

export interface ValidationError {
  success: false;
  error: string;
}

export const validateFrame = (raw: unknown): ValidationResult | ValidationError => {
  const typeResult = frameTypeSchema.safeParse(raw);
  if (!typeResult.success) {
    const firstIssue = typeResult.error.issues[0];
    return {
      success: false,
      error: firstIssue?.path.includes('type')
        ? 'Invalid or missing message type'
        : firstIssue?.message || 'Invalid frame structure',
    };
  }

  const frameType = typeResult.data.type as InboundFrameType;
  const schema = schemaMap[frameType];
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
