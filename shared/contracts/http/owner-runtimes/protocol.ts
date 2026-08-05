// Zod validation schemas for Owner Runtimes HTTP DTOs.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';
import { OWNER_RUNTIME_STATUSES, OWNER_RUNTIME_TYPES } from './types.js';

const uuidSchema = z.string().uuid();
const isoTimestampSchema = z.string().min(1).max(64);
const nullableIsoTimestampSchema = isoTimestampSchema.nullable();
const nullableStringSchema = z.string().nullable();

export { OWNER_RUNTIME_TYPES };

export const ownerRuntimeInstallHintSchema = z
  .object({
    label: z.string().min(1).max(64),
    command: z.string().min(1).max(512),
    docs_url: z.string().url(),
  })
  .strict();

export const ownerRuntimeDefaultAgentSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(128),
    avatar_url: nullableStringSchema,
    status: z.enum(['active', 'archived']),
    is_default: z.boolean(),
    source: z.enum(['system_default', 'user_created', 'imported']),
  })
  .strict();

export const ownerRuntimeSchema = z
  .object({
    id: uuidSchema.nullable(),
    runtime_type: z.enum(OWNER_RUNTIME_TYPES),
    display_name: z.string().min(1).max(128),
    runtime_status: z.enum(OWNER_RUNTIME_STATUSES),
    status_reason: nullableStringSchema,
    version: nullableStringSchema,
    capabilities: z.record(z.string(), z.unknown()),
    last_seen_at: nullableIsoTimestampSchema,
    install_hint: ownerRuntimeInstallHintSchema,
    default_agent: ownerRuntimeDefaultAgentSchema.nullable(),
  })
  .strict();

export const ownerRuntimesResponseSchema = z
  .object({
    data: z.array(ownerRuntimeSchema),
    meta: z
      .object({
        total: z.number().int().nonnegative(),
        online_count: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
