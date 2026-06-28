/**
 * Phase 2 Wave 2 T2 — sendFrame helper unit tests.
 *
 * Covers the single choke point for all gateway outbound frame emissions:
 *   - valid frame → 'sent', no counter increment
 *   - invalid + strict mode → 'dropped_invalid', counter++, ws.send not called
 *   - invalid + log-only mode → 'sent', counter++, ws.send called with bad payload
 *   - closed socket (readyState !== OPEN) → 'closed', no validation, no metric
 *   - backpressure (bufferedAmount > 128 KiB) → 'dropped_backpressure', no validation, no metric
 *   - ws.send() throws after validation → 'closed', no crash (T2 NIT-5 follow-up)
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { sendFrame } from '../../../gateway/src/ws/send.js';
import {
  setOutboundValidationModeForTest,
  resetOutboundValidationMode,
} from '../../../gateway/src/config/feature-flags.js';
import { getCounters, resetCounters } from '../../../gateway/src/monitoring/metrics.js';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

interface FakeWS {
  readyState: number;
  bufferedAmount: number;
  OPEN: number;
  send: ReturnType<typeof vi.fn>;
}

const OPEN = 1;
const CLOSED = 3;

const makeWS = (overrides: Partial<FakeWS> = {}): FakeWS => ({
  readyState: OPEN,
  bufferedAmount: 0,
  OPEN,
  send: vi.fn(),
  ...overrides,
});

const validConnectionAck = (): ServerFrame => ({
  type: 'connection_ack',
  timestamp: '2026-04-19T00:00:00Z',
  payload: {
    connection_id: 'conn-1',
    heartbeat_interval_ms: 30000,
  },
});

// Invalid ack frame — `status: 'teleported'` is not in ACK_STATUSES enum.
// We cast because the hand-written `ServerFrame` union refuses this shape;
// the whole point of the test is that the Zod layer rejects it at runtime.
const invalidAck = (): ServerFrame =>
  ({
    type: 'ack',
    timestamp: '2026-04-19T00:00:00Z',
    payload: {
      message_id: 'msg-1',
      status: 'teleported',
    },
  }) as unknown as ServerFrame;

describe('sendFrame helper (Phase 2 Wave 2 T2)', () => {
  beforeEach(() => {
    resetCounters();
    resetOutboundValidationMode();
  });

  it('valid frame → sent, counter not incremented', () => {
    const ws = makeWS();
    const frame = validConnectionAck();

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('sent');
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));
    expect(getCounters()['outbound_validation_failures_total:connection_ack']).toBeUndefined();
  });

  it('invalid frame + strict mode → dropped_invalid, counter+1, ws.send NOT called', () => {
    setOutboundValidationModeForTest('strict');
    const ws = makeWS();
    const frame = invalidAck();

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('dropped_invalid');
    expect(ws.send).not.toHaveBeenCalled();
    expect(getCounters()['outbound_validation_failures_total:ack']).toBe(1);
  });

  it('invalid frame + log-only mode → sent, counter+1, ws.send called with bad payload', () => {
    setOutboundValidationModeForTest('log-only');
    const ws = makeWS();
    const frame = invalidAck();

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('sent');
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(frame));
    expect(getCounters()['outbound_validation_failures_total:ack']).toBe(1);
  });

  it('closed ws (readyState !== OPEN) → closed, no validation, no metric', () => {
    const ws = makeWS({ readyState: CLOSED });
    const frame = invalidAck(); // bad payload, but must never hit Zod

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('closed');
    expect(ws.send).not.toHaveBeenCalled();
    expect(getCounters()).toEqual({});
  });

  it('bufferedAmount > MAX → dropped_backpressure, no validation, no metric', () => {
    const ws = makeWS({ bufferedAmount: 200_000 });
    const frame = invalidAck();

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('dropped_backpressure');
    expect(ws.send).not.toHaveBeenCalled();
    expect(getCounters()).toEqual({});
  });

  // T2 NIT-5 follow-up: ws.send() can throw (socket torn down between the
  // OPEN check and the write, node ws `send after close` race, etc.). The
  // helper must translate that to a 'closed' result rather than surfacing
  // the exception to the caller — every emit site is a fire-and-forget
  // dispatch and a throw there would crash the router pipeline.
  it('ws.send() throws → closed, no crash', () => {
    const ws = makeWS({
      send: vi.fn(() => {
        throw new Error('write after end');
      }),
    });
    const frame = validConnectionAck();

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('closed');
    expect(ws.send).toHaveBeenCalledTimes(1);
    // Validation passed, so no counter increment on this path.
    expect(getCounters()['outbound_validation_failures_total:connection_ack']).toBeUndefined();
  });

  // T2 IMPORTANT-1 follow-up: the counter key must be sourced from the
  // OUTBOUND_FRAME_TYPES whitelist so a malformed frame whose `type` is a
  // string the Zod layer never expected (typo, caller bug, cast-through-any)
  // cannot inflate counter cardinality.
  it('invalid frame with unknown type → counter key is unknown, not raw string', () => {
    setOutboundValidationModeForTest('strict');
    const ws = makeWS();
    const frame = {
      type: 'totally_made_up',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {},
    } as unknown as ServerFrame;

    const result = sendFrame(ws as unknown as WebSocket, frame);

    expect(result).toBe('dropped_invalid');
    expect(getCounters()['outbound_validation_failures_total:unknown']).toBe(1);
    expect(getCounters()['outbound_validation_failures_total:totally_made_up']).toBeUndefined();
  });
});
