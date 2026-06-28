// Dependency-free TypeScript interfaces for GET /api/agent/conversations.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

/**
 * GET /api/agent/conversations — list conversations visible to the authenticated agent.
 *
 * Visibility is governed by agents.visibility_scope (default 'self').
 *   - 'self'  : only conversations whose qrcode.agent_id === authenticated agent
 *   - 'owner' : all conversations under any qrcode owned by the agent's owner_id
 *
 * Keyset pagination by (last_active_at DESC, id DESC) to handle ties.
 */
export interface AgentConversationsRequest {
  // Query string params (all optional).
  limit?: number; // 1..200, default 50
  cursor?: string; // opaque; returned by previous response.meta.cursor
}

export interface AgentConversationItem {
  conversation_id: string;
  qrcode_id: string;
  qrcode_slug: string;
  qrcode_label: string | null;
  owner_id: string;
  owned_by_me: boolean; // true when qrcode.agent_id === authenticated agent
  message_count: number;
  last_active_at: string; // ISO-8601
  created_at: string; // ISO-8601
}

export interface AgentConversationsResponse {
  data: AgentConversationItem[];
  meta: {
    has_more: boolean;
    cursor: string | null;
    scope: 'self' | 'owner';
  };
}

export const AGENT_CONVERSATIONS_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'invalid_cursor',
  'invalid_request',
  'rate_limited',
  'internal_error',
] as const;

export type AgentConversationsErrorCode = (typeof AGENT_CONVERSATIONS_ERROR_CODES)[number];

export const AGENT_CONVERSATIONS_DEFAULT_LIMIT = 50;
export const AGENT_CONVERSATIONS_MAX_LIMIT = 200;
export const AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE = 60;
