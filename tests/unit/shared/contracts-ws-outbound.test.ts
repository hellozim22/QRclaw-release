import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  validateOutboundFrame,
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
} from '../../../shared/contracts/ws/outbound';
import {
  ACK_STATUSES,
  type ConnectionAckFrame,
  type AckFrame,
  type MessageFrame,
  type AgentTypingFrame,
  type PongFrame,
  type ErrorFrame,
  type SystemFrame,
  type StreamChunkFrame,
  type StreamEndFrame,
  type VisitorMessageBroadcastFrame,
} from '../../../shared/contracts/ws/types';
import type { z } from 'zod';

// ─── Fixtures ────────────────────────────────────────────────────────

const TS = '2026-04-20T00:00:00.000Z';

const envelope = {
  version: '1.0',
  policy_id: 'qrclaw-policy-1.0',
  policy_hash: 'abc123def4567890',
  rules: ['ai_generated_disclosure'],
  enforcement_text: 'Enforcement text.',
  injected_at: TS,
};

// ─── validateOutboundFrame dispatcher ─────────────────────────────────

describe('validateOutboundFrame', () => {
  it('accepts a well-formed connection_ack', () => {
    const res = validateOutboundFrame({
      type: 'connection_ack',
      timestamp: TS,
      payload: {
        connection_id: 'c-1',
        heartbeat_interval_ms: 25_000,
        server_time: TS,
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects unknown outbound frame type', () => {
    const res = validateOutboundFrame({ type: 'mystery', timestamp: TS });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/invalid or missing/i);
    }
  });

  it('rejects non-object input', () => {
    expect(validateOutboundFrame(null).success).toBe(false);
    expect(validateOutboundFrame('x').success).toBe(false);
    expect(validateOutboundFrame(42).success).toBe(false);
  });

  it('outboundSchemaMap has 15 entries', () => {
    expect(Object.keys(outboundSchemaMap)).toHaveLength(15);
  });
});

// ─── connection_ack ──────────────────────────────────────────────────

describe('connectionAckOutboundSchema', () => {
  it('accepts emit shape', () => {
    const res = connectionAckOutboundSchema.safeParse({
      type: 'connection_ack',
      timestamp: TS,
      payload: { connection_id: 'c-1', heartbeat_interval_ms: 25_000 },
    });
    expect(res.success).toBe(true);
  });

  it('rejects extra top-level field (.strict)', () => {
    const res = connectionAckOutboundSchema.safeParse({
      type: 'connection_ack',
      timestamp: TS,
      payload: { connection_id: 'c-1', heartbeat_interval_ms: 25_000 },
      extra: 'no',
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches ConnectionAckFrame', () => {
    expectTypeOf<z.infer<typeof connectionAckOutboundSchema>>().toEqualTypeOf<ConnectionAckFrame>();
  });
});

// ─── ack ─────────────────────────────────────────────────────────────

describe('ackOutboundSchema', () => {
  it('accepts status="sent" (legacy)', () => {
    const res = ackOutboundSchema.safeParse({
      type: 'ack',
      timestamp: TS,
      payload: { message_id: 'm-1', status: 'sent' },
    });
    expect(res.success).toBe(true);
  });

  // D5 drift lock-in — every router-emitted status must validate.
  // Driven off the `ACK_STATUSES` tuple in `types.ts` so adding a new
  // status in one place auto-covers it here.
  it.each(ACK_STATUSES)('D5: accepts status=%s', (status) => {
    const res = ackOutboundSchema.safeParse({
      type: 'ack',
      timestamp: TS,
      payload: { message_id: 'm-1', status },
    });
    expect(res.success).toBe(true);
  });

  it('D5: rejects unknown status value', () => {
    const res = ackOutboundSchema.safeParse({
      type: 'ack',
      timestamp: TS,
      payload: { message_id: 'm-1', status: 'teleported' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects extra field inside payload (.strict)', () => {
    const res = ackOutboundSchema.safeParse({
      type: 'ack',
      timestamp: TS,
      payload: { message_id: 'm-1', status: 'sent', bogus: 1 },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches AckFrame', () => {
    expectTypeOf<z.infer<typeof ackOutboundSchema>>().toEqualTypeOf<AckFrame>();
  });
});

// ─── message ─────────────────────────────────────────────────────────

describe('messageOutboundSchema', () => {
  it('accepts minimal agent→visitor emit', () => {
    const res = messageOutboundSchema.safeParse({
      type: 'message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'agent',
        conversation_id: 'c1',
      },
    });
    expect(res.success).toBe(true);
  });

  // D2 drift lock-in
  it('D2: accepts payload with security_envelope', () => {
    const res = messageOutboundSchema.safeParse({
      type: 'message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'markdown',
        sender_type: 'agent',
        conversation_id: 'c1',
        security_envelope: envelope,
      },
    });
    expect(res.success).toBe(true);
  });

  // D4 drift lock-in
  it('D4: accepts payload with queued_at (offline-queue drain)', () => {
    const res = messageOutboundSchema.safeParse({
      type: 'message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'c1',
        queued_at: TS,
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects extra field inside payload (.strict)', () => {
    const res = messageOutboundSchema.safeParse({
      type: 'message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'agent',
        conversation_id: 'c1',
        who_knows: 'what',
      },
    });
    expect(res.success).toBe(false);
  });

  it('rejects invalid sender_type', () => {
    const res = messageOutboundSchema.safeParse({
      type: 'message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'bystander',
        conversation_id: 'c1',
      },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches MessageFrame', () => {
    expectTypeOf<z.infer<typeof messageOutboundSchema>>().toEqualTypeOf<MessageFrame>();
  });
});

// ─── agent_typing ────────────────────────────────────────────────────

describe('agentTypingOutboundSchema', () => {
  it('accepts emit with id', () => {
    const res = agentTypingOutboundSchema.safeParse({
      type: 'agent_typing',
      id: 'm-1',
      timestamp: TS,
      payload: { conversation_id: 'c1' },
    });
    expect(res.success).toBe(true);
  });

  it('rejects extra payload field', () => {
    const res = agentTypingOutboundSchema.safeParse({
      type: 'agent_typing',
      id: 'm-1',
      timestamp: TS,
      payload: { conversation_id: 'c1', speed: 'fast' },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches AgentTypingFrame', () => {
    expectTypeOf<z.infer<typeof agentTypingOutboundSchema>>().toEqualTypeOf<AgentTypingFrame>();
  });
});

// ─── pong ────────────────────────────────────────────────────────────

describe('pongOutboundSchema', () => {
  it('accepts {type, timestamp}', () => {
    const res = pongOutboundSchema.safeParse({ type: 'pong', timestamp: TS });
    expect(res.success).toBe(true);
  });

  it('rejects with unexpected payload (.strict)', () => {
    const res = pongOutboundSchema.safeParse({
      type: 'pong',
      timestamp: TS,
      payload: { nope: true },
    });
    expect(res.success).toBe(false);
  });

  // NOTE: PongFrame inherits `id?` and `payload?` from WSFrame but the
  // gateway emit omits both. The strict Zod schema only declares
  // `type` + `timestamp`, so `z.infer` is a structural subtype of
  // PongFrame (lacks the optional inherited fields). Using
  // `toMatchTypeOf` — the Wave 1 T2a escape hatch for Zod v4 `.strict()`
  // / WSFrame parity mismatches — still catches drift on the declared
  // fields while accepting the "fewer optional" shape.
  it('parity: z.infer is-a PongFrame (subtype match)', () => {
    expectTypeOf<z.infer<typeof pongOutboundSchema>>().toMatchTypeOf<PongFrame>();
  });
});

// ─── error ───────────────────────────────────────────────────────────

describe('errorOutboundSchema', () => {
  it.each([
    'auth_required',
    'invalid_json',
    'invalid_frame',
    'routing_error',
    'rate_limited',
    'forbidden',
    'unknown_message_type',
    'unknown_error',
  ])('D7: accepts fixed code=%s', (code) => {
    const res = errorOutboundSchema.safeParse({
      type: 'error',
      timestamp: TS,
      payload: { code, message: 'boom' },
    });
    expect(res.success).toBe(true);
  });

  it('D7: rejects unknown_code_xyz (enum locked)', () => {
    const res = errorOutboundSchema.safeParse({
      type: 'error',
      timestamp: TS,
      payload: { code: 'unknown_code_xyz', message: 'boom' },
    });
    expect(res.success).toBe(false);
  });

  // D6 drift lock-in — router.ts:389 emits message_id inside payload
  it('D6: accepts payload with message_id', () => {
    const res = errorOutboundSchema.safeParse({
      type: 'error',
      timestamp: TS,
      payload: {
        code: 'routing_error',
        message: 'boom',
        message_id: 'm-1',
      },
    });
    expect(res.success).toBe(true);
  });

  it('accepts details object', () => {
    const res = errorOutboundSchema.safeParse({
      type: 'error',
      timestamp: TS,
      payload: {
        code: 'invalid_frame',
        message: 'boom',
        details: { path: 'payload.content' },
      },
    });
    expect(res.success).toBe(true);
  });

  // NOTE: TS keeps `code: string` per the drift policy ("Zod is the
  // single truth for the enum; TS stays forward-compat-friendly"), so
  // Zod's `'a'|'b'|...` inference is a strict subtype of the TS string.
  // `toMatchTypeOf` asserts assignability, which still catches drift
  // on every other payload field.
  it('parity: z.infer is-a ErrorFrame (code widened to string in TS)', () => {
    expectTypeOf<z.infer<typeof errorOutboundSchema>>().toMatchTypeOf<ErrorFrame>();
  });
});

// ─── system ──────────────────────────────────────────────────────────

describe('systemOutboundSchema', () => {
  it('accepts event=agent_online', () => {
    const res = systemOutboundSchema.safeParse({
      type: 'system',
      timestamp: TS,
      payload: { event: 'agent_online' },
    });
    expect(res.success).toBe(true);
  });

  it('rejects unknown event', () => {
    const res = systemOutboundSchema.safeParse({
      type: 'system',
      timestamp: TS,
      payload: { event: 'meteor_strike' },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches SystemFrame', () => {
    expectTypeOf<z.infer<typeof systemOutboundSchema>>().toEqualTypeOf<SystemFrame>();
  });
});

// ─── stream_chunk (outbound) ─────────────────────────────────────────

describe('streamChunkOutboundSchema', () => {
  it('accepts router forward emit', () => {
    const res = streamChunkOutboundSchema.safeParse({
      type: 'stream_chunk',
      id: 'm-1',
      timestamp: TS,
      payload: {
        conversation_id: 'c1',
        delta: 'chunk',
        sequence: 0,
        is_final: false,
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects delta overflow (>4096)', () => {
    const res = streamChunkOutboundSchema.safeParse({
      type: 'stream_chunk',
      id: 'm-1',
      timestamp: TS,
      payload: { conversation_id: 'c1', delta: 'a'.repeat(4097) },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches StreamChunkFrame', () => {
    expectTypeOf<z.infer<typeof streamChunkOutboundSchema>>().toEqualTypeOf<StreamChunkFrame>();
  });
});

// ─── stream_end (outbound) ───────────────────────────────────────────

describe('streamEndOutboundSchema', () => {
  it('accepts router plain forward (no envelope)', () => {
    const res = streamEndOutboundSchema.safeParse({
      type: 'stream_end',
      id: 'm-1',
      timestamp: TS,
      payload: {
        conversation_id: 'c1',
        total_chunks: 3,
        total_length: 42,
      },
    });
    expect(res.success).toBe(true);
  });

  // D3 drift lock-in
  it('D3: accepts payload with security_envelope', () => {
    const res = streamEndOutboundSchema.safeParse({
      type: 'stream_end',
      id: 'm-1',
      timestamp: TS,
      payload: {
        conversation_id: 'c1',
        total_chunks: 3,
        total_length: 42,
        security_envelope: envelope,
      },
    });
    expect(res.success).toBe(true);
  });

  it('parity: z.infer matches StreamEndFrame', () => {
    expectTypeOf<z.infer<typeof streamEndOutboundSchema>>().toEqualTypeOf<StreamEndFrame>();
  });
});

// ─── visitor_message (outbound broadcast, D1) ────────────────────────

describe('visitorMessageBroadcastOutboundSchema', () => {
  // D1 drift lock-in — gateway→agent fan-out shape from router.ts:203–218
  it('D1: accepts gateway→agent fan-out', () => {
    const res = visitorMessageBroadcastOutboundSchema.safeParse({
      type: 'visitor_message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'sess-1',
        qr_code_id: 'qr-1',
        system_prompt: 'Be nice.',
      },
    });
    expect(res.success).toBe(true);
  });

  it('D1: accepts fan-out without optional qr_code_id/system_prompt', () => {
    const res = visitorMessageBroadcastOutboundSchema.safeParse({
      type: 'visitor_message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'sess-1',
      },
    });
    expect(res.success).toBe(true);
  });

  it('D1: rejects sender_type="agent" (broadcast is always visitor)', () => {
    const res = visitorMessageBroadcastOutboundSchema.safeParse({
      type: 'visitor_message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'text',
        sender_type: 'agent',
        conversation_id: 'sess-1',
      },
    });
    expect(res.success).toBe(false);
  });

  it('D1: rejects content_type="markdown" (visitor frames never carry markdown)', () => {
    const res = visitorMessageBroadcastOutboundSchema.safeParse({
      type: 'visitor_message',
      id: 'm-1',
      timestamp: TS,
      payload: {
        content: 'hi',
        content_type: 'markdown',
        sender_type: 'visitor',
        conversation_id: 'sess-1',
      },
    });
    expect(res.success).toBe(false);
  });

  it('parity: z.infer matches VisitorMessageBroadcastFrame', () => {
    expectTypeOf<
      z.infer<typeof visitorMessageBroadcastOutboundSchema>
    >().toEqualTypeOf<VisitorMessageBroadcastFrame>();
  });
});
