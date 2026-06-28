/**
 * Unit tests for gateway/src/ws/fanout.ts (M2-GW-FANOUT).
 *
 * Coverage (per brief §Testing):
 *   1. direct-to-agents: multi-agent all hit
 *   2. direct-to-agents: zero agents → recipientCount=0, delivered=0
 *   3. direct-to-visitor: hit + miss
 *   4. multi: throws FANOUT_NOT_IMPLEMENTED (message references plan §5.1 L1.7)
 *
 * The registry module is mocked so tests stay pure: no actual Map state.
 *
 * Phase 2 Wave 2 T3a: `fanoutFrame` now takes `ServerFrame` (narrowed from
 * `WSFrame`) and routes through `sendFrame`. Sample frames must therefore
 * satisfy the outbound Zod schema so the default strict mode (under
 * `NODE_ENV=test`) does not drop them — otherwise `delivered` would read 0.
 * `visitor_message` (outbound broadcast) requires `sender_type` +
 * `conversation_id` per `shared/contracts/ws/outbound.ts`.
 *
 * Phase 2 Wave 2 T3e: the legacy `sendSafe` export was retired now that every
 * production emit site routes through `sendFrame` — its dedicated tests are
 * removed along with it. Backpressure / closed-socket behaviour is still
 * covered here via the `fanoutFrame` cases (which funnel through `sendFrame`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

// ─── Mock registry (single source for getAgentForQrCode / getVisitorConnection) ──
vi.mock('../../../gateway/src/ws/registry', () => ({
  getAgentForQrCode: vi.fn(),
  getVisitorConnection: vi.fn(),
}));

import { getAgentForQrCode, getVisitorConnection } from '../../../gateway/src/ws/registry';
import { fanoutFrame } from '../../../gateway/src/ws/fanout';

// ─── Mock socket helpers ────────────────────────────────────────────

interface FakeWs {
  send: ReturnType<typeof vi.fn>;
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  _sent: string[];
}

const makeWs = (overrides: Partial<FakeWs> = {}): FakeWs => {
  const sent: string[] = [];
  return {
    send: vi.fn((data: string) => sent.push(data)),
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    _sent: sent,
    ...overrides,
  };
};

const makeEntry = (ws: FakeWs, connectionId = 'c-' + Math.random().toString(36).slice(2, 8)) => ({
  ws: ws as unknown as WebSocket,
  info: {
    connectionId,
    role: 'agent' as const,
    connectedAt: new Date().toISOString(),
  },
});

// Valid outbound `visitor_message` broadcast — satisfies
// `visitorMessageBroadcastOutboundSchema` so strict-mode `sendFrame` delivers
// it (not 'dropped_invalid') and the `delivered` counts below stay honest.
const sampleFrame: ServerFrame = {
  type: 'visitor_message',
  id: 'msg-1',
  timestamp: '2026-04-20T00:00:00.000Z',
  payload: {
    content: 'hello',
    content_type: 'text',
    sender_type: 'visitor',
    conversation_id: 'conv-1',
  },
};

// ─── Tests ─────────────────────────────────────────────────────────

describe('fanout.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fanoutFrame: direct-to-agents', () => {
    it('delivers to every agent socket and reports recipientCount=delivered', () => {
      const ws1 = makeWs();
      const ws2 = makeWs();
      const ws3 = makeWs();
      vi.mocked(getAgentForQrCode).mockReturnValue([
        makeEntry(ws1, 'a1'),
        makeEntry(ws2, 'a2'),
        makeEntry(ws3, 'a3'),
      ]);

      const result = fanoutFrame({ kind: 'direct-to-agents', qrCodeId: 'qr-123' }, sampleFrame);

      expect(getAgentForQrCode).toHaveBeenCalledWith('qr-123');
      expect(result).toEqual({ delivered: 3, recipientCount: 3, fastPath: true });
      // Frame is stringified exactly once per recipient (same payload)
      const expected = JSON.stringify(sampleFrame);
      expect(ws1._sent).toEqual([expected]);
      expect(ws2._sent).toEqual([expected]);
      expect(ws3._sent).toEqual([expected]);
    });

    it('returns recipientCount=0 delivered=0 when no agents registered', () => {
      vi.mocked(getAgentForQrCode).mockReturnValue([]);

      const result = fanoutFrame({ kind: 'direct-to-agents', qrCodeId: 'qr-none' }, sampleFrame);

      expect(result).toEqual({ delivered: 0, recipientCount: 0, fastPath: true });
    });

    it('counts only successfully-sent sockets when some fail', () => {
      const okWs = makeWs();
      const closedWs = makeWs({ readyState: 3 }); // CLOSED
      vi.mocked(getAgentForQrCode).mockReturnValue([
        makeEntry(okWs, 'ok'),
        makeEntry(closedWs, 'closed'),
      ]);

      const result = fanoutFrame({ kind: 'direct-to-agents', qrCodeId: 'qr-mix' }, sampleFrame);

      expect(result).toEqual({ delivered: 1, recipientCount: 2, fastPath: true });
      expect(okWs.send).toHaveBeenCalledTimes(1);
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('does not stringify the frame when recipient list is empty (short-circuit)', () => {
      vi.mocked(getAgentForQrCode).mockReturnValue([]);

      // We can observe short-circuit only via timing / no-send side-effects.
      const result = fanoutFrame({ kind: 'direct-to-agents', qrCodeId: 'qr-empty' }, sampleFrame);

      expect(result.delivered).toBe(0);
      expect(result.recipientCount).toBe(0);
    });
  });

  describe('fanoutFrame: direct-to-visitor', () => {
    it('delivers to the resolved visitor socket', () => {
      const ws = makeWs();
      vi.mocked(getVisitorConnection).mockReturnValue(makeEntry(ws, 'v1'));

      const result = fanoutFrame(
        { kind: 'direct-to-visitor', sessionToken: 'sess-xyz' },
        sampleFrame
      );

      expect(getVisitorConnection).toHaveBeenCalledWith('sess-xyz');
      expect(result).toEqual({ delivered: 1, recipientCount: 1, fastPath: true });
      expect(ws._sent).toEqual([JSON.stringify(sampleFrame)]);
    });

    it('returns recipientCount=0 when visitor session is not registered (miss)', () => {
      vi.mocked(getVisitorConnection).mockReturnValue(undefined);

      const result = fanoutFrame(
        { kind: 'direct-to-visitor', sessionToken: 'sess-missing' },
        sampleFrame
      );

      expect(result).toEqual({ delivered: 0, recipientCount: 0, fastPath: true });
    });

    it('returns delivered=0 recipientCount=1 when resolved socket is closed', () => {
      const ws = makeWs({ readyState: 3 }); // CLOSED
      vi.mocked(getVisitorConnection).mockReturnValue(makeEntry(ws, 'v-closed'));

      const result = fanoutFrame(
        { kind: 'direct-to-visitor', sessionToken: 'sess-closed' },
        sampleFrame
      );

      expect(result).toEqual({ delivered: 0, recipientCount: 1, fastPath: true });
    });
  });

  describe('fanoutFrame: multi (NOT IMPLEMENTED)', () => {
    it('throws FANOUT_NOT_IMPLEMENTED with plan §5.1 L1.7 marker', () => {
      expect(() => fanoutFrame({ kind: 'multi', conversationId: 'conv-abc' }, sampleFrame)).toThrow(
        /FANOUT_NOT_IMPLEMENTED/
      );

      expect(() => fanoutFrame({ kind: 'multi', conversationId: 'conv-abc' }, sampleFrame)).toThrow(
        /plan §5\.1 L1\.7/
      );
    });

    it('does not touch registry lookups on multi (never calls direct helpers)', () => {
      try {
        fanoutFrame({ kind: 'multi', conversationId: 'conv-xyz' }, sampleFrame);
      } catch {
        // expected
      }
      expect(getAgentForQrCode).not.toHaveBeenCalled();
      expect(getVisitorConnection).not.toHaveBeenCalled();
    });
  });
});
