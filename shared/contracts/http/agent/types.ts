// Dependency-free TypeScript interfaces for POST /api/agent/create-qrcode.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

/**
 * Rate limit: maximum QR code creations per agent per rolling 24h window.
 * Enforced by gateway Redis rate limiter; shared here so tests and plugin
 * callers can reference the same constant.
 */
export const AGENT_CREATE_QRCODE_LIMIT_PER_DAY = 100;

export const AGENT_LABEL_MIN = 1;
export const AGENT_LABEL_MAX = 64;
export const AGENT_SYSTEM_PROMPT_MAX = 4000;
export const AGENT_CALLBACK_HINT_MAX = 256;
export const AGENT_ACCOUNT_LABEL_MAX = 128;

export interface AgentCreateQrcodeRequest {
  label: string;
  system_prompt?: string;
  callback_hint?: string;
  agent_account_label?: string;
}

export interface AgentCreateQrcodeResponse {
  qr_code_id: string;
  slug: string;
  qr_image_url: string;
  public_url: string;
  expires_at: string | null;
}

export const AGENT_CREATE_QRCODE_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'internal_error',
] as const;
export type AgentCreateQrcodeErrorCode = (typeof AGENT_CREATE_QRCODE_ERROR_CODES)[number];
