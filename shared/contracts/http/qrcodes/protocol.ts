// Zod validation schema for POST /api/create-qrcode request body.

import { z } from 'zod';
import {
  QR_TEMPLATES,
  PROFILE_AVATAR_MAX_DATA_URL_CHARS,
  // SYSTEM_PROMPT_MAX_LENGTH — intentionally NOT enforced at schema level in Wave 1.
  // See types.ts JSDoc and docs/refactor/execution-log.md Drift F follow-up.
} from './types.js';

export const createQrcodeRequestSchema = z
  .object({
    agent_id: z.string().min(1, 'agent_id is required'),
    name: z.string().trim().min(1, 'name is required'),
    greeting: z.string().optional(),
    template: z.enum(QR_TEMPLATES).optional(),
    system_prompt: z.string().optional(),
    // Boundary note: schema uses `.max(N)` (accepts exactly N), while the server-side
    // decoder in gateway/src/routes/create-qrcode-avatar.ts uses `>= N` (rejects exactly N).
    // At length === N the decoder is stricter and produces a soft `profile_avatar_rejected`
    // warning while still creating the QR. Above N, Wave 1 intentionally hard-rejects at
    // the schema layer (400) instead of the previous soft-reject-with-warning behavior —
    // the web client pre-filters at `< N` so this is transparent to today's callers.
    // Future maintainers: if you delete the decoder check, change this to `.max(N - 1)`
    // to preserve the original "soft reject at exactly N" semantics.
    profile_avatar: z.string().max(PROFILE_AVATAR_MAX_DATA_URL_CHARS).optional(),
  })
  .strict();
