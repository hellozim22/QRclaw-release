// Zod validation schemas for POST /decrypted-messages.
// Gateway (as thin forwarder) validates; Edge Function validates on entry.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';
import {
  DECRYPTED_ACTORS,
  DECRYPTED_MESSAGES_LIMIT_MIN,
  DECRYPTED_MESSAGES_LIMIT_MAX,
  MESSAGE_ROLES,
} from './types.js';

// UUID v4 pattern; mirrors the inline regex in the legacy
// get-decrypted-messages Edge Function. Keeping it non-strict-v4 on purpose
// (accepts any valid UUID) so we don't reject UUIDs generated in older flows.
const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'conversation_id must be a valid UUID'
  );

const limitSchema = z
  .number()
  .int()
  .min(DECRYPTED_MESSAGES_LIMIT_MIN)
  .max(DECRYPTED_MESSAGES_LIMIT_MAX)
  .optional();

const baseShape = {
  conversation_id: uuidSchema,
  cursor: z.string().uuid().optional(),
  limit: limitSchema,
};

const afterSeqSchema = z.number().int().min(0).optional();

export const decryptedMessagesOwnerSchema = z
  .object({
    actor: z.literal('owner'),
    ...baseShape,
  })
  .strict();

export const decryptedMessagesAgentSchema = z
  .object({
    actor: z.literal('agent'),
    ...baseShape,
  })
  .strict();

export const decryptedMessagesVisitorSchema = z
  .object({
    actor: z.literal('visitor'),
    session_token: z.string().min(1),
    ...baseShape,
  })
  .strict();

export const decryptedOwnerPrivateAgentChatSchema = z
  .object({
    actor: z.literal('owner-private-agent-chat'),
    include_events: z.boolean().optional(),
    run_id: uuidSchema.optional(),
    after_seq: afterSeqSchema,
    ...baseShape,
  })
  .strict();

export const decryptedMessagesRequestSchema = z.discriminatedUnion('actor', [
  decryptedMessagesOwnerSchema,
  decryptedMessagesAgentSchema,
  decryptedMessagesVisitorSchema,
  decryptedOwnerPrivateAgentChatSchema,
]);

// Response schemas — useful for both Edge Function outbound validation (future)
// and gateway forwarder sanity-checking what it proxies back to web.
export const decryptedMessageSchema = z
  .object({
    id: z.string(),
    message_id: z.string(),
    content: z.string(),
    sender_type: z.enum(MESSAGE_ROLES),
    persisted_at: z.string(),
    run_id: z.string().nullable().optional(),
    content_type: z.string().optional(),
    status: z.string().optional(),
    reply_to_message_id: z.string().nullable().optional(),
    thread_id: z.string().nullable().optional(),
  })
  .strict();

export const decryptedOwnerAgentRunEventSchema = z
  .object({
    id: z.string(),
    run_id: z.string(),
    seq: z.number().int(),
    type: z.string(),
    content: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    persisted_at: z.string(),
  })
  .strict();

export const decryptedMessagesResponseSchema = z
  .object({
    data: z.array(decryptedMessageSchema),
    events: z.array(decryptedOwnerAgentRunEventSchema).optional(),
    meta: z
      .object({
        cursor: z.string().nullable(),
        has_more: z.boolean(),
        event_cursor: z.number().int().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const DECRYPTED_ACTORS_RUNTIME = DECRYPTED_ACTORS;
