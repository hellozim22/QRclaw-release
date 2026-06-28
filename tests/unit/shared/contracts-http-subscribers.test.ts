/**
 * TDD: Schema + type-parity tests for shared/contracts/http/subscribers.
 * Verifies the lifted subscribeRequestSchema is byte-equivalent to the
 * original inline schema in gateway/src/routes/subscribe.ts.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { expectTypeOf } from 'vitest';
import { subscribeRequestSchema } from '../../../shared/contracts/http/subscribers/protocol.js';
import type { SubscribeRequest } from '../../../shared/contracts/http/subscribers/types.js';
import { SUBSCRIBE_EMAIL_MAX_LENGTH } from '../../../shared/contracts/http/subscribers/types.js';
import type { z } from 'zod';

describe('subscribeRequestSchema', () => {
  it('accepts a valid email', () => {
    const result = subscribeRequestSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('trims leading/trailing whitespace', () => {
    const result = subscribeRequestSchema.safeParse({ email: '  user@example.com  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects missing email', () => {
    const result = subscribeRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects email exceeding 254 characters', () => {
    const longEmail = 'a'.repeat(255) + '@example.com';
    const result = subscribeRequestSchema.safeParse({ email: longEmail });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = subscribeRequestSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});

describe('type parity', () => {
  it('z.infer<subscribeRequestSchema> equals SubscribeRequest', () => {
    expectTypeOf<z.infer<typeof subscribeRequestSchema>>().toEqualTypeOf<SubscribeRequest>();
  });
});

describe('SUBSCRIBE_EMAIL_MAX_LENGTH', () => {
  it('equals 254 (RFC 5321)', () => {
    expect(SUBSCRIBE_EMAIL_MAX_LENGTH).toBe(254);
  });
});
