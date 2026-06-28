// Zod validation schemas for POST /api/messages request body.
// Gateway imports these to feed into validateRequest middleware.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';
import { MESSAGES_LIMIT_MIN, MESSAGES_LIMIT_MAX } from './types.js';

export const messagesHistoryRequestSchema = z
  .object({
    qr_code_id: z.string().min(1),
    session_token: z.string().min(1),
    limit: z.number().int().min(MESSAGES_LIMIT_MIN).max(MESSAGES_LIMIT_MAX).optional(),
    before: z.string().optional(),
  })
  .strict();
