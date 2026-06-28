// Zod validation schemas for /api/*-ws-ticket request bodies.
// Gateway imports these to feed into validateRequest middleware.
// Web MUST NOT import this file — it pulls in zod.

import { z } from 'zod';

export const visitorWsTicketRequestSchema = z
  .object({
    qr_code_id: z.string().min(1),
    session_token: z.string().optional(),
  })
  .strict();

export const agentWsTicketRequestSchema = z.object({}).strict();
