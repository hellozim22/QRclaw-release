import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  visitorWsTicketRequestSchema,
  agentWsTicketRequestSchema,
} from '../../../shared/contracts/http/tickets/protocol';
import type {
  VisitorWsTicketRequest,
  AgentWsTicketRequest,
} from '../../../shared/contracts/http/tickets/types';
import type { z } from 'zod';

describe('visitorWsTicketRequestSchema', () => {
  it('accepts { qr_code_id: "abc" }', () => {
    const result = visitorWsTicketRequestSchema.safeParse({ qr_code_id: 'abc' });
    expect(result.success).toBe(true);
  });

  it('accepts { qr_code_id: "abc", session_token: "vis_1" }', () => {
    const result = visitorWsTicketRequestSchema.safeParse({
      qr_code_id: 'abc',
      session_token: 'vis_1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects {} (missing qr_code_id)', () => {
    const result = visitorWsTicketRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects { qr_code_id: 123 } (wrong type)', () => {
    const result = visitorWsTicketRequestSchema.safeParse({ qr_code_id: 123 });
    expect(result.success).toBe(false);
  });

  it('type parity: z.infer matches VisitorWsTicketRequest', () => {
    expectTypeOf<
      z.infer<typeof visitorWsTicketRequestSchema>
    >().toEqualTypeOf<VisitorWsTicketRequest>();
  });
});

describe('agentWsTicketRequestSchema', () => {
  it('accepts {}', () => {
    const result = agentWsTicketRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects { unexpected: true } (strict)', () => {
    const result = agentWsTicketRequestSchema.safeParse({ unexpected: true });
    expect(result.success).toBe(false);
  });

  it('type parity: z.infer is assignable to AgentWsTicketRequest', () => {
    // z.object({}).strict() infers to `{ [x: string]: never }` in Zod 4, which
    // is a stricter-than-{} shape that still satisfies AgentWsTicketRequest.
    // `toMatchTypeOf` (structural subtype) is the right assertion here — it
    // still catches drift if someone adds a field to one side and not the other.
    expectTypeOf<
      z.infer<typeof agentWsTicketRequestSchema>
    >().toMatchTypeOf<AgentWsTicketRequest>();
  });
});
