import { describe, it, expect, expectTypeOf } from 'vitest';
import { messagesHistoryRequestSchema } from '../../../shared/contracts/http/messages/protocol';
import type { MessagesHistoryRequest } from '../../../shared/contracts/http/messages/types';
import type { z } from 'zod';

describe('messagesHistoryRequestSchema', () => {
  it('accepts minimum valid body', () => {
    const result = messagesHistoryRequestSchema.safeParse({
      qr_code_id: 'x',
      session_token: 'y',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full body with before', () => {
    const result = messagesHistoryRequestSchema.safeParse({
      qr_code_id: 'x',
      session_token: 'y',
      limit: 25,
      before: '2025-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing qr_code_id', () => {
    const result = messagesHistoryRequestSchema.safeParse({
      session_token: 'y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit: 0 (below min)', () => {
    const result = messagesHistoryRequestSchema.safeParse({
      qr_code_id: 'x',
      session_token: 'y',
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit: 101 (above max)', () => {
    const result = messagesHistoryRequestSchema.safeParse({
      qr_code_id: 'x',
      session_token: 'y',
      limit: 101,
    });
    expect(result.success).toBe(false);
  });

  it('type parity: z.input matches MessagesHistoryRequest', () => {
    expectTypeOf<
      z.input<typeof messagesHistoryRequestSchema>
    >().toEqualTypeOf<MessagesHistoryRequest>();
  });
});
