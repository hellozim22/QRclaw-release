// Zod validation schema for POST /api/agent/create-qrcode request body.

import { z } from 'zod';
import {
  AGENT_LABEL_MIN,
  AGENT_LABEL_MAX,
  AGENT_SYSTEM_PROMPT_MAX,
  AGENT_CALLBACK_HINT_MAX,
  AGENT_ACCOUNT_LABEL_MAX,
} from './types.js';

export const agentCreateQrcodeSchema = z
  .object({
    label: z
      .string()
      .min(AGENT_LABEL_MIN, 'label is required')
      .max(AGENT_LABEL_MAX, `label must be at most ${AGENT_LABEL_MAX} characters`),
    system_prompt: z
      .string()
      .max(
        AGENT_SYSTEM_PROMPT_MAX,
        `system_prompt must be at most ${AGENT_SYSTEM_PROMPT_MAX} characters`
      )
      .optional(),
    callback_hint: z
      .string()
      .max(
        AGENT_CALLBACK_HINT_MAX,
        `callback_hint must be at most ${AGENT_CALLBACK_HINT_MAX} characters`
      )
      .optional(),
    agent_account_label: z
      .string()
      .max(
        AGENT_ACCOUNT_LABEL_MAX,
        `agent_account_label must be at most ${AGENT_ACCOUNT_LABEL_MAX} characters`
      )
      .optional(),
  })
  .strict();
