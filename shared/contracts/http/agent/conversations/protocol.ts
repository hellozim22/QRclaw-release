// Zod runtime validation for GET /api/agent/conversations.
// Source of truth for query-string shape; types.ts is dep-free for consumers.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';
import { AGENT_CONVERSATIONS_DEFAULT_LIMIT, AGENT_CONVERSATIONS_MAX_LIMIT } from './types.js';

// Query-string params arrive as strings; coerce numeric fields.
export const agentConversationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(AGENT_CONVERSATIONS_MAX_LIMIT).optional(),
    cursor: z.string().min(1).max(256).optional(),
  })
  .strict();

export type AgentConversationsQueryInput = z.infer<typeof agentConversationsQuerySchema>;

export { AGENT_CONVERSATIONS_DEFAULT_LIMIT };
