import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  validateFrame,
  pingFrameSchema,
  visitorMessageSchema,
  agentMessageSchema,
  streamChunkSchema,
  streamEndSchema,
  readReceiptSchema,
  authFrameSchema,
} from '../../../shared/contracts/ws/protocol';
import type {
  PingFrame,
  VisitorMessageFrame,
  AgentMessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  ReadReceiptFrame,
  AuthFrame,
} from '../../../shared/contracts/ws/types';
import type { z } from 'zod';

describe('validateFrame', () => {
  it('accepts a well-formed visitor_message', () => {
    const frame = {
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content: 'hi', content_type: 'text' },
    };
    const res = validateFrame(frame);
    expect(res.success).toBe(true);
  });

  it('rejects unknown frame type', () => {
    const res = validateFrame({
      type: 'nope',
      timestamp: '2026-04-19T00:00:00Z',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/invalid or missing/i);
    }
  });

  it('rejects visitor_message without content', () => {
    const res = validateFrame({
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content_type: 'text' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateFrame(null).success).toBe(false);
    expect(validateFrame('hello').success).toBe(false);
    expect(validateFrame(42).success).toBe(false);
  });

  it('accepts ping with no payload', () => {
    const res = validateFrame({
      type: 'ping',
      timestamp: '2026-04-19T00:00:00Z',
    });
    expect(res.success).toBe(true);
  });

  it('accepts stream_end with all optional fields omitted', () => {
    const res = validateFrame({
      type: 'stream_end',
      id: 'm-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { conversation_id: 'c1' },
    });
    expect(res.success).toBe(true);
  });

  it('accepts stream_end with full_content + total_length', () => {
    const res = validateFrame({
      type: 'stream_end',
      id: 'm-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        conversation_id: 'c1',
        total_length: 12,
        full_content: 'hello, world',
      },
    });
    expect(res.success).toBe(true);
  });

  it('accepts a well-formed agent_message', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'hi there',
        content_type: 'text',
        conversation_id: 'c1',
      },
    });
    expect(res.success).toBe(true);
  });

  it('accepts a well-formed read_receipt', () => {
    const res = validateFrame({
      type: 'read_receipt',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { message_ids: ['m1', 'm2'] },
    });
    expect(res.success).toBe(true);
  });

  it('accepts a well-formed auth frame', () => {
    const res = validateFrame({
      type: 'auth',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { ticket: 'abc.def.ghi' },
    });
    expect(res.success).toBe(true);
  });

  it('rejects visitor_message with unknown extra field in payload', () => {
    const res = validateFrame({
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content: 'hi', content_type: 'text', extra: 'x' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects visitor_message with content exceeding MAX_CONTENT_LENGTH (16384)', () => {
    const res = validateFrame({
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content: 'a'.repeat(16_385), content_type: 'text' },
    });
    expect(res.success).toBe(false);
  });

  it('accepts agent_message with reply_to_message_id (M2-WS-OPT forward-compat)', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'replying',
        content_type: 'text',
        conversation_id: 'c1',
        reply_to_message_id: 'msg-original-42',
      },
    });
    expect(res.success).toBe(true);
  });

  it('accepts agent_message with thread_id (M2-WS-OPT forward-compat)', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'inside a thread',
        content_type: 'text',
        conversation_id: 'c1',
        thread_id: 'thread-abc',
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects agent_message with oversized reply_to_message_id (>64 chars)', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'x',
        content_type: 'text',
        conversation_id: 'c1',
        reply_to_message_id: 'a'.repeat(65),
      },
    });
    expect(res.success).toBe(false);
  });

  it('rejects agent_message with oversized thread_id (>64 chars)', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'x',
        content_type: 'text',
        conversation_id: 'c1',
        thread_id: 't'.repeat(65),
      },
    });
    expect(res.success).toBe(false);
  });

  it('accepts agent_message with both reply_to_message_id and thread_id (M2-WS-OPT)', () => {
    const res = validateFrame({
      type: 'agent_message',
      id: 'msg-a1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'reply inside thread',
        content_type: 'text',
        conversation_id: 'c1',
        reply_to_message_id: 'msg-original-7',
        thread_id: 'thread-xyz',
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects visitor_message with reply_to_message_id (visitor side intentionally NOT extended)', () => {
    const res = validateFrame({
      type: 'visitor_message',
      id: 'msg-v1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        content: 'hi',
        content_type: 'text',
        reply_to_message_id: 'msg-x',
      },
    });
    expect(res.success).toBe(false);
  });

  it('rejects read_receipt with more than MAX_MESSAGE_IDS (50) ids', () => {
    const res = validateFrame({
      type: 'read_receipt',
      timestamp: '2026-04-19T00:00:00Z',
      payload: {
        message_ids: Array.from({ length: 51 }, (_, i) => `m${i}`),
      },
    });
    expect(res.success).toBe(false);
  });
});

describe('schema ↔ type parity', () => {
  it('pingFrameSchema infers to PingFrame-compatible shape', () => {
    expectTypeOf<z.infer<typeof pingFrameSchema>>().toEqualTypeOf<PingFrame>();
  });
  it('visitorMessageSchema infers compatible with VisitorMessageFrame', () => {
    expectTypeOf<z.infer<typeof visitorMessageSchema>>().toEqualTypeOf<VisitorMessageFrame>();
  });
  it('agentMessageSchema infers compatible with AgentMessageFrame', () => {
    expectTypeOf<z.infer<typeof agentMessageSchema>>().toEqualTypeOf<AgentMessageFrame>();
  });
  it('streamChunkSchema infers compatible with StreamChunkFrame', () => {
    expectTypeOf<z.infer<typeof streamChunkSchema>>().toEqualTypeOf<StreamChunkFrame>();
  });
  // Phase 2 Wave 2 D3 widened `StreamEndFrame.payload` with an optional
  // `security_envelope` field (gateway-injected on the outbound side,
  // never accepted on inbound). The inbound Zod schema intentionally
  // does NOT include it — this keeps visitor-submitted frames from
  // forging an envelope. That makes `z.infer<streamEndSchema>` a strict
  // structural subtype of `StreamEndFrame`, so the parity assertion
  // switches to `toMatchTypeOf` (assignability). Drift on the other
  // fields is still caught.
  it('streamEndSchema infers compatible with StreamEndFrame (subtype)', () => {
    expectTypeOf<z.infer<typeof streamEndSchema>>().toMatchTypeOf<StreamEndFrame>();
  });
  it('readReceiptSchema infers compatible with ReadReceiptFrame', () => {
    expectTypeOf<z.infer<typeof readReceiptSchema>>().toEqualTypeOf<ReadReceiptFrame>();
  });
  it('authFrameSchema infers compatible with AuthFrame', () => {
    expectTypeOf<z.infer<typeof authFrameSchema>>().toEqualTypeOf<AuthFrame>();
  });
});
