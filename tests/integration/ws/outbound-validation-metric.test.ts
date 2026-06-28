/**
 * Phase 2 Wave 2 T4 — outbound validation observability (integration).
 *
 * Exercises the T2 counter + T3 sendFrame wiring end-to-end so the
 * `outbound_validation_failures_total:<type>` series, the structured
 * `console.warn` log, and the `QRCLAW_OUTBOUND_VALIDATION` feature-flag
 * branch fire together — the three pieces land in three different
 * modules and the unit test for each only covers its own seam.
 *
 * Three assertions from plan §4 T4:
 *  - strict mode + malformed frame → counter++, warn logged, frame dropped
 *  - log-only mode + malformed frame → counter++, warn logged, frame sent
 *  - strict mode + valid frame → counter untouched, frame sent, no warn
 *
 * We additionally assert that `getCounters()` — the snapshot the
 * `/metrics` endpoint (`gateway/src/routes/health.ts`) exposes — reflects
 * the same state the counter pipeline produces, closing the loop with
 * the HTTP surface without booting an Express server.
 *
 * Drift vs. plan §4 T4 prescription:
 *  - Plan said `prom-client` + Prometheus text scrape; this repo uses the
 *    in-memory `incrCounter` map (see `gateway/src/monitoring/metrics.ts`
 *    header comment + T2 execution-log drift entry).
 *  - Plan said `pino` + `pino-test`; this repo uses `console.warn` with a
 *    JSON payload (matches `perf.ts` style). We capture via
 *    `vi.spyOn(console, 'warn')`.
 *  - Integration here is module-level (FakeWS mock, same harness as the
 *    T2 unit test) rather than a real `ws` server. The goal is wiring
 *    verification across three modules — a live socket adds flakiness
 *    without exercising anything the wiring tests don't already cover.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { sendFrame, __sendRawForTest } from '../../../gateway/src/ws/send.js';
import {
  setOutboundValidationModeForTest,
  resetOutboundValidationMode,
} from '../../../gateway/src/config/feature-flags.js';
import { getCounters, resetCounters } from '../../../gateway/src/monitoring/metrics.js';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

// ─── FakeWS harness ─────────────────────────────────────────────────
//
// Matches the `ws.WebSocket` surface that `sendFrame` actually touches
// (`readyState`, `OPEN`, `bufferedAmount`, `send`). Mirrors the shape used
// by the T2 unit test (`tests/unit/backend/ws-send.test.ts`) so the two
// suites agree on the contract — if a real `ws` server is ever wired in
// here it must keep these five fields observable.

interface FakeWS {
  readyState: number;
  bufferedAmount: number;
  OPEN: number;
  send: ReturnType<typeof vi.fn>;
}

const OPEN = 1;

const makeWS = (overrides: Partial<FakeWS> = {}): FakeWS => ({
  readyState: OPEN,
  bufferedAmount: 0,
  OPEN,
  send: vi.fn(),
  ...overrides,
});

// ─── Fixtures ───────────────────────────────────────────────────────

const validAck = (): ServerFrame => ({
  type: 'ack',
  timestamp: '2026-04-20T00:00:00Z',
  payload: {
    message_id: 'msg-valid-1',
    status: 'delivered',
  },
});

// Known outbound type (`message`) but payload violates the Zod schema —
// every required field (`content`, `content_type`, `sender_type`,
// `conversation_id`) is missing. Pushed through `__sendRawForTest` so we
// don't need an inline `as unknown as ServerFrame` cast at the call site.
const malformedMessage = (): unknown => ({
  type: 'message',
  id: 'msg-malformed-1',
  timestamp: '2026-04-20T00:00:00Z',
  payload: {},
});

// Typo / cast-through-any scenario: `type` is a string the Zod discriminator
// never saw. The counter key must collapse to `:unknown` rather than
// inflating cardinality (IMPORTANT-1 follow-up from T2 review).
const unknownTypeFrame = (): unknown => ({
  type: 'teleport',
  timestamp: '2026-04-20T00:00:00Z',
  payload: {},
});

describe('Phase 2 Wave 2 T4 — outbound validation observability (integration)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetCounters();
    resetOutboundValidationMode();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('strict mode + malformed frame → counter++, warn logged, frame dropped', () => {
    setOutboundValidationModeForTest('strict');
    const ws = makeWS();

    const result = __sendRawForTest(ws as unknown as WebSocket, malformedMessage(), {
      connectionId: 'conn-strict-1',
    });

    expect(result).toBe('dropped_invalid');
    expect(ws.send).not.toHaveBeenCalled();
    expect(getCounters()['outbound_validation_failures_total:message']).toBe(1);

    // Structured log: exactly one warn, JSON-shaped, carries the frameType
    // + connectionId + the validation error string. No frame body (IR C2).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const rawLog = warnSpy.mock.calls[0]?.[0] as string;
    expect(typeof rawLog).toBe('string');
    const logged = JSON.parse(rawLog) as Record<string, unknown>;
    expect(logged.msg).toBe('outbound_frame_validation_failed');
    expect(logged.level).toBe('warn');
    expect(logged.frameType).toBe('message');
    expect(logged.connectionId).toBe('conn-strict-1');
    expect(logged.error).toEqual(expect.any(String));
    expect(logged).not.toHaveProperty('payload');
  });

  it('log-only mode + malformed frame → counter++, warn logged, frame STILL sent', () => {
    setOutboundValidationModeForTest('log-only');
    const ws = makeWS();
    const frame = malformedMessage();

    const result = __sendRawForTest(ws as unknown as WebSocket, frame, {
      connectionId: 'conn-logonly-1',
    });

    expect(result).toBe('sent');
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));
    expect(getCounters()['outbound_validation_failures_total:message']).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('strict mode + valid frame → counter unchanged, frame sent, no warn', () => {
    setOutboundValidationModeForTest('strict');
    const ws = makeWS();
    const frame = validAck();

    const result = sendFrame(ws as unknown as WebSocket, frame, {
      connectionId: 'conn-valid-1',
    });

    expect(result).toBe('sent');
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));
    expect(getCounters()).toEqual({});
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Closes the loop with the `/metrics` endpoint contract. We don't mount
  // Express here (supertest is available but express lives in gateway/ and
  // pulling it into tests/ just to GET one route is disproportionate).
  // Instead: verify the snapshot returned by `getCounters()` — the function
  // `health.ts` calls to populate the `counters` field — matches the
  // observable state after the failure pipeline runs, and that cardinality
  // stays bounded to the 11-key whitelist.
  it('getCounters() snapshot matches the /metrics shape contract', () => {
    setOutboundValidationModeForTest('strict');
    const ws = makeWS();

    __sendRawForTest(ws as unknown as WebSocket, malformedMessage());
    __sendRawForTest(ws as unknown as WebSocket, malformedMessage());
    __sendRawForTest(ws as unknown as WebSocket, unknownTypeFrame());

    const snapshot = getCounters();
    expect(snapshot['outbound_validation_failures_total:message']).toBe(2);
    expect(snapshot['outbound_validation_failures_total:unknown']).toBe(1);

    // Cardinality guard: `/metrics` must never surface a counter key sourced
    // from attacker-controlled input. Every key should either be a known
    // outbound type or the `unknown` bucket.
    for (const key of Object.keys(snapshot)) {
      expect(key.startsWith('outbound_validation_failures_total:')).toBe(true);
    }
    // `teleport` is attacker-controlled; it must NOT have leaked into a key.
    expect(snapshot['outbound_validation_failures_total:teleport']).toBeUndefined();
  });
});
