// Dependency-free TypeScript interfaces for POST /api/subscribe.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

/**
 * Request body for POST /api/subscribe.
 * RFC 5321 caps email length at 254 chars.
 */
export interface SubscribeRequest {
  email: string;
}

export const SUBSCRIBE_EMAIL_MAX_LENGTH = 254;
