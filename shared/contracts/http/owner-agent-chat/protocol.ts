// Zod validation schemas for Owner Agent Chat HTTP DTOs.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';
import {
  OWNER_AGENT_PROVIDERS,
  OWNER_AGENT_BACKEND_SOURCES,
  OWNER_AGENT_EXECUTION_MODES,
  OWNER_AGENT_SOURCES,
  OWNER_AGENT_RUNTIME_STATUSES,
  OWNER_AGENT_RUN_STATUSES,
  OWNER_AGENT_MESSAGE_CONTENT_TYPES,
  OWNER_AGENT_RUN_EVENT_TYPES,
  OWNER_AGENT_HOST_TYPES,
  OWNER_AGENT_HOST_STATUSES,
  OWNER_AGENT_PROVIDER_STATUSES,
  OWNER_AGENT_NAME_MAX,
  OWNER_AGENT_DESCRIPTION_MAX,
  OWNER_AGENT_INSTRUCTIONS_MAX,
  OWNER_AGENT_SUGGESTED_PROMPTS_MAX,
  OWNER_AGENT_SUGGESTED_PROMPT_MAX,
  OWNER_AGENT_MESSAGE_CONTENT_MAX,
  OWNER_AGENT_HOST_LABEL_MAX,
  OWNER_AGENT_SESSION_TITLE_MAX,
} from './types.js';

const uuidSchema = z.string().uuid();
const isoTimestampSchema = z.string().min(1).max(64);
const nullableIsoTimestampSchema = isoTimestampSchema.nullable();
const nullableStringSchema = z.string().nullable();

const suggestedPromptsSchema = z
  .array(z.string().min(1).max(OWNER_AGENT_SUGGESTED_PROMPT_MAX))
  .max(OWNER_AGENT_SUGGESTED_PROMPTS_MAX);

export const hostTokenScopeSchema = z
  .object({
    owner_id: uuidSchema,
    allowed_provider_set: z.array(z.enum(OWNER_AGENT_PROVIDERS)),
    can_register_local: z.boolean(),
    can_receive_private_runs: z.boolean(),
  })
  .strict();

export const ownerAgentCreateAgentRequestSchema = z
  .object({
    name: z.string().min(1).max(OWNER_AGENT_NAME_MAX),
    avatar_url: z.string().url().nullable().optional(),
    description: z.string().max(OWNER_AGENT_DESCRIPTION_MAX).nullable().optional(),
    backend_provider: z.enum(OWNER_AGENT_PROVIDERS),
    backend_source: z.enum(OWNER_AGENT_BACKEND_SOURCES),
    instructions: z.string().max(OWNER_AGENT_INSTRUCTIONS_MAX).nullable().optional(),
    suggested_prompts: suggestedPromptsSchema.optional(),
    execution_mode: z.enum(OWNER_AGENT_EXECUTION_MODES),
    execution_mode_ack: z.boolean(),
  })
  .strict();

export const ownerAgentUpdateAgentRequestSchema = z
  .object({
    name: z.string().min(1).max(OWNER_AGENT_NAME_MAX).optional(),
    avatar_url: z.string().url().nullable().optional(),
    description: z.string().max(OWNER_AGENT_DESCRIPTION_MAX).nullable().optional(),
    instructions: z.string().max(OWNER_AGENT_INSTRUCTIONS_MAX).nullable().optional(),
    suggested_prompts: suggestedPromptsSchema.optional(),
    execution_mode: z.enum(OWNER_AGENT_EXECUTION_MODES).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export const ownerAgentSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    avatar_url: nullableStringSchema,
    description: nullableStringSchema,
    backend_provider: z.enum(OWNER_AGENT_PROVIDERS),
    backend_source: z.enum(OWNER_AGENT_BACKEND_SOURCES),
    execution_mode: z.enum(OWNER_AGENT_EXECUTION_MODES),
    status: z.enum(['active', 'archived']),
    runtime_id: uuidSchema.nullable(),
    runtime_status: z.enum(OWNER_AGENT_RUNTIME_STATUSES).nullable(),
    is_default: z.boolean(),
    source: z.enum(OWNER_AGENT_SOURCES),
    last_active_at: nullableIsoTimestampSchema,
    created_at: isoTimestampSchema,
  })
  .strict();

export const ownerAgentListResponseSchema = z
  .object({
    data: z.array(ownerAgentSummarySchema),
  })
  .strict();

export const ownerAgentConversationResponseSchema = z
  .object({
    conversation_id: uuidSchema,
    agent_id: uuidSchema,
    owner_id: uuidSchema,
    provider_session_id: nullableStringSchema,
    provider_work_dir: nullableStringSchema,
    status: z.enum(['active', 'archived']),
    last_active_at: nullableIsoTimestampSchema,
    created_at: isoTimestampSchema,
  })
  .strict();

const ownerAgentSessionTitleSchema = z.string().trim().min(1).max(OWNER_AGENT_SESSION_TITLE_MAX);

export const ownerAgentCreateSessionRequestSchema = z
  .object({
    title: ownerAgentSessionTitleSchema.optional(),
  })
  .strict();

export const ownerAgentRenameSessionRequestSchema = z
  .object({
    title: ownerAgentSessionTitleSchema,
  })
  .strict();

export const ownerAgentSessionResponseSchema = z
  .object({
    session_id: uuidSchema,
    conversation_id: uuidSchema,
    agent_id: uuidSchema,
    owner_id: uuidSchema,
    title: ownerAgentSessionTitleSchema,
    provider_session_id: nullableStringSchema,
    provider_work_dir: nullableStringSchema,
    status: z.enum(['active', 'archived']),
    last_active_at: nullableIsoTimestampSchema,
    created_at: isoTimestampSchema,
  })
  .strict();

export const ownerAgentSessionMutationResponseSchema = z
  .object({
    data: ownerAgentSessionResponseSchema,
  })
  .strict();

export const ownerAgentSendMessageRequestSchema = z
  .object({
    content: z.string().min(1).max(OWNER_AGENT_MESSAGE_CONTENT_MAX),
    content_type: z.enum(OWNER_AGENT_MESSAGE_CONTENT_TYPES),
    client_message_id: z.string().min(1).max(64).optional(),
    requested_model: z.string().min(1).max(128).optional(),
  })
  .strict();

export const ownerAgentSendMessageResponseSchema = z
  .object({
    message_id: uuidSchema,
    conversation_id: uuidSchema,
    run_id: uuidSchema,
    status: z.enum(OWNER_AGENT_RUN_STATUSES),
  })
  .strict();

export const ownerAgentRunSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    agent_id: uuidSchema,
    host_id: uuidSchema.nullable(),
    provider: z.enum(OWNER_AGENT_PROVIDERS),
    status: z.enum(OWNER_AGENT_RUN_STATUSES),
    requested_model: nullableStringSchema,
    actual_model: nullableStringSchema,
    error_code: nullableStringSchema,
    error_message: nullableStringSchema,
    created_at: isoTimestampSchema,
    started_at: nullableIsoTimestampSchema,
    completed_at: nullableIsoTimestampSchema,
  })
  .strict();

export const ownerAgentRunResponseSchema = z
  .object({
    data: ownerAgentRunSchema,
  })
  .strict();

export const ownerAgentProviderCapabilitySchema = z
  .object({
    provider: z.enum(OWNER_AGENT_PROVIDERS),
    version: nullableStringSchema,
    status: z.enum(OWNER_AGENT_PROVIDER_STATUSES),
    capabilities: z
      .object({
        streaming: z.boolean(),
        full_access: z.boolean(),
        models: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();

export const ownerAgentHostSchema = z
  .object({
    host_id: uuidSchema,
    host_type: z.enum(OWNER_AGENT_HOST_TYPES),
    display_name: nullableStringSchema,
    status: z.enum(OWNER_AGENT_HOST_STATUSES),
    last_seen_at: nullableIsoTimestampSchema,
    providers: z.array(ownerAgentProviderCapabilitySchema),
  })
  .strict();

export const ownerAgentHostsResponseSchema = z
  .object({
    data: z.array(ownerAgentHostSchema),
  })
  .strict();

export const ownerAgentCreateHostTokenRequestSchema = z
  .object({
    label: z.string().min(1).max(OWNER_AGENT_HOST_LABEL_MAX).optional(),
    host_id: uuidSchema.optional(),
    scope: hostTokenScopeSchema,
    expires_at: isoTimestampSchema.optional(),
  })
  .strict();

export const ownerAgentCreateHostTokenResponseSchema = z
  .object({
    token_id: uuidSchema,
    token: z.string().min(1),
    scope: hostTokenScopeSchema,
    expires_at: nullableIsoTimestampSchema,
    created_at: isoTimestampSchema,
  })
  .strict();

export const ownerAgentRunEventSchema = z
  .object({
    run_id: uuidSchema,
    seq: z.number().int().positive(),
    type: z.enum(OWNER_AGENT_RUN_EVENT_TYPES),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    created_at: isoTimestampSchema,
  })
  .strict();
