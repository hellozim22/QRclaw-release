/**
 * Barrel re-export of WebSocket contract schemas and types.
 *
 * Source of truth: /shared/contracts/ws/
 * - Runtime Zod schemas live in `../../../shared/contracts/ws/protocol.ts`
 * - Pure TypeScript types live in `../../../shared/contracts/ws/types.ts`
 *
 * Do NOT add new schemas here; edit the shared contracts and re-run
 * `node scripts/sync-contracts.mjs` for Supabase propagation.
 */

export {
  pingFrameSchema,
  visitorMessageSchema,
  agentMessageSchema,
  streamChunkSchema,
  streamEndSchema,
  readReceiptSchema,
  authFrameSchema,
  validateFrame,
  type ValidationResult,
  type ValidationError,
} from '../../../shared/contracts/ws/protocol.js';

export type { InboundFrameType as ValidFrameType } from '../../../shared/contracts/ws/types.js';

// ─── Outbound schemas (Phase 2 Wave 2) ──────────────────────────────
// Gateway → Client frame validation. Imported by `send.ts` (introduced
// in T2) to enforce outbound shape before `ws.send()`.

export {
  connectionAckOutboundSchema,
  ackOutboundSchema,
  messageOutboundSchema,
  agentTypingOutboundSchema,
  pongOutboundSchema,
  errorOutboundSchema,
  systemOutboundSchema,
  streamChunkOutboundSchema,
  streamEndOutboundSchema,
  visitorMessageBroadcastOutboundSchema,
  outboundSchemaMap,
  validateOutboundFrame,
  type OutboundFrameType,
  type OutboundValidationResult,
  type OutboundValidationError,
} from '../../../shared/contracts/ws/outbound.js';
