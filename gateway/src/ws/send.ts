/**
 * Outbound WebSocket frame send — single choke point (Phase 2 Wave 2 T2).
 *
 * Every gateway → client frame emission routes through `sendFrame()`
 * (T3a–T3e collapsed 15 emit sites onto this helper). The helper
 * guarantees, in order:
 *   1. Socket liveness check (readyState === OPEN)
 *   2. Backpressure guard (bufferedAmount ≤ MAX_BUFFER_SIZE, 128 KiB —
 *      preserves the pre-refactor delivery semantics)
 *   3. Zod validation via `validateOutboundFrame()`
 *   4. Feature-flag dispatch: 'strict' drops invalid frames, 'log-only'
 *      sends them anyway (rollout safety — see plan §3.4)
 *   5. Counter emission on validation failure
 *      (`outbound_validation_failures_total:<frame_type>`)
 *   6. `ws.send(JSON.stringify(frame))`
 *
 * Iron Rule C1: this helper MUST NOT parse or mutate the frame payload.
 * Validation failures are observed, not rewritten.
 */
import type { WebSocket } from 'ws';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';
import { OUTBOUND_FRAME_TYPES } from '../../../shared/contracts/ws/types.js';
import { validateOutboundFrame } from '../../../shared/contracts/ws/outbound.js';
import { getOutboundValidationMode } from '../config/feature-flags.js';
import { incrCounter } from '../monitoring/metrics.js';

/**
 * Backpressure threshold — sole definition after T3e retired the former
 * `fanout.ts` duplicate. 128 KiB preserves the pre-refactor delivery
 * semantics (drops the frame instead of queueing when a slow client
 * falls behind).
 */
const MAX_BUFFER_SIZE = 128 * 1024;

export type SendFrameResult = 'sent' | 'dropped_backpressure' | 'dropped_invalid' | 'closed';

export interface SendFrameContext {
  connectionId?: string;
}

/**
 * Send a validated outbound frame. See module header for semantics.
 *
 * Return values:
 *   - 'sent'                 → frame was handed to ws.send()
 *   - 'dropped_backpressure' → buffered > MAX_BUFFER_SIZE, nothing sent
 *   - 'dropped_invalid'      → Zod rejected in strict mode, nothing sent
 *   - 'closed'               → readyState !== OPEN, nothing sent
 */
export const sendFrame = (
  ws: WebSocket,
  frame: ServerFrame,
  context: SendFrameContext = {}
): SendFrameResult => {
  if (ws.readyState !== ws.OPEN) {
    return 'closed';
  }
  if (ws.bufferedAmount > MAX_BUFFER_SIZE) {
    return 'dropped_backpressure';
  }

  const validation = validateOutboundFrame(frame);
  if (!validation.success) {
    // `frame.type` is typed as a string literal union at compile time, but we
    // guard at runtime — an invalid frame may have been cast through `any`
    // upstream and have no `type` field at all. The raw value is whitelisted
    // against `OUTBOUND_FRAME_TYPES` before it becomes a counter key so a
    // malformed frame (typo'd `type`, null, non-string, missing field) cannot
    // inflate counter cardinality beyond 11 keys (10 outbound types + 'unknown').
    // IMPORTANT-1 follow-up from T2 review.
    const rawType = (frame as { type?: unknown }).type;
    const frameType =
      typeof rawType === 'string' && (OUTBOUND_FRAME_TYPES as readonly string[]).includes(rawType)
        ? rawType
        : 'unknown';
    incrCounter(`outbound_validation_failures_total:${frameType}`);
    // Structured log — consumed by log aggregation, not the /metrics endpoint.
    // We intentionally do NOT log the frame body (may contain PII / ciphertext).
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'outbound_frame_validation_failed',
        connectionId: context.connectionId,
        frameType,
        // Preserved (stringified) so operators can debug a frame whose `type`
        // was malformed without widening the counter key space above.
        rawFrameType: typeof rawType === 'string' ? rawType : typeof rawType,
        error: validation.error,
      })
    );
    if (getOutboundValidationMode() === 'strict') {
      return 'dropped_invalid';
    }
    // 'log-only': fall through and send the invalid payload anyway.
  }

  try {
    ws.send(JSON.stringify(frame));
    return 'sent';
  } catch {
    return 'closed';
  }
};

// ─── Test-only helper (Phase 2 Wave 2 T4) ──────────────────────────
//
// Integration coverage for the observability pipeline (counter + structured
// warn log + feature-flag branch) needs to feed `sendFrame` frames that the
// `ServerFrame` union forbids at compile time — e.g. a `message` frame with
// an empty payload, or a made-up `type`. Casting through `any` at every call
// site would scatter `@ts-expect-error` across the test tree; this export
// centralizes the cast so production call sites stay strict.
//
// Behavior: identical to `sendFrame` — runtime Zod validation, counter
// emission, feature-flag branch all run as normal. The only thing bypassed
// is the compile-time type check.
//
// NEVER import this from runtime code. It exists solely for
// `tests/integration/ws/outbound-validation-metric.test.ts` (and future
// tests that need to inject malformed frames through the public helper
// contract rather than re-implementing the validate+counter+log chain).
export const __sendRawForTest = (
  ws: WebSocket,
  rawFrame: unknown,
  context: SendFrameContext = {}
): SendFrameResult => sendFrame(ws, rawFrame as ServerFrame, context);
