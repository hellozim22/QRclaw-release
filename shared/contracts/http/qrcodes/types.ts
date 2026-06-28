// Dependency-free TypeScript interfaces and constants for POST /api/create-qrcode.
// Web imports types only (no zod); gateway imports protocol.ts alongside.
// DO NOT import any library from this file.

export const QR_TEMPLATES = ['default', 'minimal', 'showcase', 'custom'] as const;
export type QrTemplate = (typeof QR_TEMPLATES)[number];

export const PROFILE_AVATAR_MAX_DATA_URL_CHARS = 600_000;
export const SYSTEM_PROMPT_MAX_LENGTH = 1000;

/**
 * Canonical data-URL pattern for profile avatars.
 * Mirrors gateway/src/routes/create-qrcode-avatar.ts. The captured groups expose
 * the image subtype and base64 payload — web only uses this for a shape test
 * (.test()), the gateway uses it for decoding via tryDecodeProfileAvatarDataUrl.
 */
export const PROFILE_AVATAR_DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i;

/**
 * Request body for POST /api/create-qrcode.
 *
 * Notes:
 * - `template` is a string union (Drift C resolved: enum enforced on both sides).
 * - `profile_avatar` is a base64 data URL, capped at PROFILE_AVATAR_MAX_DATA_URL_CHARS
 *   (Drift E resolved: single source of truth).
 * - `system_prompt` is NOT capped at the schema level in Wave 1 (Drift F deferred):
 *   gateway truncates >1000 chars server-side and emits a `system_prompt_truncated`
 *   warning. When PHASE2_STRICT_SYSTEM_PROMPT flips to true in a future wave, the
 *   schema should be extended with `.max(SYSTEM_PROMPT_MAX_LENGTH)`.
 */
export interface CreateQrcodeRequest {
  agent_id: string;
  name: string;
  greeting?: string;
  template?: QrTemplate;
  system_prompt?: string;
  profile_avatar?: string;
}
