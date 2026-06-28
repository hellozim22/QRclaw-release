// Dependency-free TypeScript interfaces for POST /api/messages.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

/**
 * Request body for POST /api/messages.
 * Fetches paginated, time-ordered decrypted message history.
 *
 * NOTE (pagination gap): Today no web caller sends `limit` or `before`.
 * The gateway clamps `limit` to [MESSAGES_LIMIT_MIN, MESSAGES_LIMIT_MAX] and
 * defaults to MESSAGES_LIMIT_DEFAULT. A future iteration may surface these
 * controls in the web UI.
 */
export interface MessagesHistoryRequest {
  qr_code_id: string;
  session_token: string;
  limit?: number;
  before?: string;
}

export const MESSAGES_LIMIT_MIN = 1;
export const MESSAGES_LIMIT_MAX = 100;
export const MESSAGES_LIMIT_DEFAULT = 50;
