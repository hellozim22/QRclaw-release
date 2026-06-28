/**
 * WebSocket fanout — unified forward entry point.
 *
 * Abstracts message forwarding from the router so every V→A and A→V send
 * goes through a single function. MVP supports two `direct-*` kinds that hit
 * the in-memory routing map (zero DB queries, synchronous fast-path); the
 * `multi` kind is a placeholder for future group / topic fanout and throws
 * `FANOUT_NOT_IMPLEMENTED` so callers cannot silently regress iron rule C1.
 *
 * Iron Rule C1 (neutral relay): fanout does not parse payload content, does
 * not call into LLMs, and never emits new frame types; it only forwards what
 * the router hands it. Security Envelope injection stays in router.ts.
 *
 * Future direction for `multi` (tracked in plan §5.1 L1.7 / M5+):
 *   1. Resolve `conversation_participants` rows for `conversationId` (DB).
 *   2. For each participant (visitor / agent), look up live sockets via the
 *      registry (sessionToken / agentId).
 *   3. Reuse `sendFrame` for the per-socket delivery loop (same helper the
 *      `direct-*` paths below use, for uniform validation + backpressure).
 * The DB step makes `multi` inherently async, so the router call site will
 * need refactoring before it can be wired up — do **not** add a DB query to
 * this file in the meantime (it would pull the V→A / A→V hot path off the
 * synchronous fast-path and violate the zero-regression contract).
 */
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';
import { getAgentForQrCode, getVisitorConnection } from './registry.js';
import { sendFrame } from './send.js';

/**
 * Fanout target selector. `direct-*` hit the in-memory registry only; `multi`
 * is reserved for group/topic fanout and is not implemented in the MVP.
 */
export type FanoutTarget =
  | { kind: 'direct-to-agents'; qrCodeId: string }
  | { kind: 'direct-to-visitor'; sessionToken: string }
  | { kind: 'multi'; conversationId: string };

/**
 * Result of a fanout attempt.
 *
 * - `delivered` counts sockets that accepted the frame (ws.send succeeded and
 *   passed the backpressure guard).
 * - `recipientCount` counts sockets resolved from the routing map — callers
 *   use this to distinguish "nobody online" (recipientCount=0) from "all sends
 *   failed" (recipientCount>0, delivered=0).
 * - `fastPath` is true for `direct-*` (sync, no DB). Reserved for future
 *   observability; multi will eventually return false.
 */
export interface FanoutResult {
  delivered: number;
  recipientCount: number;
  fastPath: boolean;
}

/**
 * Single forward entry. Routes the frame through `sendFrame()` for every
 * socket resolved from the target, so the Zod validation + counter
 * observability path applies uniformly to fanned-out emissions.
 *
 * ⚠️ Must stay synchronous — all current call sites (router.ts handleVisitor
 * /handleAgent/handleStream*) rely on sync delivery ordering. `sendFrame()`
 * is itself synchronous; do NOT introduce `await` here.
 *
 * Delivery semantics: `delivered` counts sockets that `sendFrame` reported
 * as `'sent'`. Backpressure / closed / invalid frame results do NOT count
 * as delivered — `sendFrame` owns the readyState + bufferedAmount guards
 * (see `send.ts:MAX_BUFFER_SIZE`).
 */
export const fanoutFrame = (target: FanoutTarget, frame: ServerFrame): FanoutResult => {
  switch (target.kind) {
    case 'direct-to-agents': {
      const recipients = getAgentForQrCode(target.qrCodeId);
      if (recipients.length === 0) {
        return { delivered: 0, recipientCount: 0, fastPath: true };
      }
      let delivered = 0;
      for (const entry of recipients) {
        if (sendFrame(entry.ws, frame, { connectionId: entry.info.connectionId }) === 'sent') {
          delivered += 1;
        }
      }
      return { delivered, recipientCount: recipients.length, fastPath: true };
    }

    case 'direct-to-visitor': {
      const entry = getVisitorConnection(target.sessionToken);
      if (!entry) {
        return { delivered: 0, recipientCount: 0, fastPath: true };
      }
      const result = sendFrame(entry.ws, frame, { connectionId: entry.info.connectionId });
      return { delivered: result === 'sent' ? 1 : 0, recipientCount: 1, fastPath: true };
    }

    case 'multi': {
      throw new Error(
        'FANOUT_NOT_IMPLEMENTED: multi-participant fanout requires conversation_participants integration; tracked in plan §5.1 L1.7 / M5+'
      );
    }

    default: {
      const _exhaustive: never = target;
      throw new Error(`FANOUT_UNKNOWN_KIND: ${JSON.stringify(_exhaustive)}`);
    }
  }
};
