/**
 * Dashboard Create QR wizard — default copy (single source; tweak here + design alignment).
 * `SYSTEM_PROMPT_MAX` must stay in sync with Gateway `create-qrcode` truncation (1000).
 */
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant for visitors who scan this QR code. Be concise, friendly, and follow the owner’s guidelines.';

export const SYSTEM_PROMPT_MAX = 1000;
