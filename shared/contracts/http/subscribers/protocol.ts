// Zod validation schema for POST /api/subscribe request body.
// This is a verbatim lift from gateway/src/routes/subscribe.ts — DO NOT invent new rules.

import { z } from 'zod';
import { SUBSCRIBE_EMAIL_MAX_LENGTH } from './types.js';

export const subscribeRequestSchema = z.object({
  email: z.string().trim().max(SUBSCRIBE_EMAIL_MAX_LENGTH).email('Invalid email format'),
});
