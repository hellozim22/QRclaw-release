/**
 * M3-T3: Parity + runtime tests for shared/contracts/http/decrypted-messages.
 *
 * Ensures:
 *   - Zod schemas accept each actor's legal shape and reject drift.
 *   - z.infer<Schema> equals the dependency-free TS interface (type-level).
 *   - Response schema enforces the cursor/has_more meta envelope.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  decryptedMessagesRequestSchema,
  decryptedMessagesOwnerSchema,
  decryptedMessagesAgentSchema,
  decryptedMessagesVisitorSchema,
  decryptedOwnerPrivateAgentChatSchema,
  decryptedMessagesResponseSchema,
  decryptedMessageSchema,
} from '../../../shared/contracts/http/decrypted-messages/protocol.js';
import type {
  DecryptedMessagesRequest,
  DecryptedMessagesOwnerRequest,
  DecryptedMessagesAgentRequest,
  DecryptedMessagesVisitorRequest,
  DecryptedOwnerPrivateAgentChatRequest,
  DecryptedMessagesResponse,
  DecryptedMessage,
} from '../../../shared/contracts/http/decrypted-messages/types.js';
import type { z } from 'zod';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('decrypted-messages contract — type parity', () => {
  it('owner schema matches OwnerRequest interface', () => {
    expectTypeOf<
      z.infer<typeof decryptedMessagesOwnerSchema>
    >().toMatchTypeOf<DecryptedMessagesOwnerRequest>();
    expectTypeOf<DecryptedMessagesOwnerRequest>().toMatchTypeOf<
      z.infer<typeof decryptedMessagesOwnerSchema>
    >();
  });

  it('agent schema matches AgentRequest interface', () => {
    expectTypeOf<
      z.infer<typeof decryptedMessagesAgentSchema>
    >().toMatchTypeOf<DecryptedMessagesAgentRequest>();
  });

  it('visitor schema matches VisitorRequest interface', () => {
    expectTypeOf<
      z.infer<typeof decryptedMessagesVisitorSchema>
    >().toMatchTypeOf<DecryptedMessagesVisitorRequest>();
  });

  it('owner-private-agent-chat schema matches OwnerPrivateAgentChatRequest interface', () => {
    expectTypeOf<
      z.infer<typeof decryptedOwnerPrivateAgentChatSchema>
    >().toMatchTypeOf<DecryptedOwnerPrivateAgentChatRequest>();
  });

  it('discriminated union matches DecryptedMessagesRequest', () => {
    expectTypeOf<
      z.infer<typeof decryptedMessagesRequestSchema>
    >().toMatchTypeOf<DecryptedMessagesRequest>();
  });

  it('response schema matches DecryptedMessagesResponse', () => {
    expectTypeOf<
      z.infer<typeof decryptedMessagesResponseSchema>
    >().toMatchTypeOf<DecryptedMessagesResponse>();
  });

  it('message schema matches DecryptedMessage', () => {
    expectTypeOf<z.infer<typeof decryptedMessageSchema>>().toMatchTypeOf<DecryptedMessage>();
  });
});

describe('decrypted-messages contract — runtime validation', () => {
  describe('owner actor', () => {
    it('accepts minimal owner request', () => {
      const parsed = decryptedMessagesRequestSchema.parse({
        actor: 'owner',
        conversation_id: VALID_UUID,
      });
      expect(parsed).toEqual({ actor: 'owner', conversation_id: VALID_UUID });
    });

    it('accepts owner with cursor + limit', () => {
      const parsed = decryptedMessagesRequestSchema.parse({
        actor: 'owner',
        conversation_id: VALID_UUID,
        cursor: VALID_UUID,
        limit: 20,
      });
      expect(parsed.limit).toBe(20);
    });

    it('rejects owner with session_token (not allowed for owner)', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner',
          conversation_id: VALID_UUID,
          session_token: 'should-not-be-here',
        })
      ).toThrow();
    });
  });

  describe('agent actor', () => {
    it('accepts minimal agent request', () => {
      const parsed = decryptedMessagesRequestSchema.parse({
        actor: 'agent',
        conversation_id: VALID_UUID,
      });
      expect(parsed.actor).toBe('agent');
    });

    it('rejects agent with session_token', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'agent',
          conversation_id: VALID_UUID,
          session_token: 'nope',
        })
      ).toThrow();
    });
  });

  describe('visitor actor', () => {
    it('requires session_token', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'visitor',
          conversation_id: VALID_UUID,
        })
      ).toThrow();
    });

    it('accepts visitor with session_token', () => {
      const parsed = decryptedMessagesRequestSchema.parse({
        actor: 'visitor',
        conversation_id: VALID_UUID,
        session_token: 'token-abc',
      });
      expect(parsed).toEqual({
        actor: 'visitor',
        conversation_id: VALID_UUID,
        session_token: 'token-abc',
      });
    });

    it('rejects empty session_token', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'visitor',
          conversation_id: VALID_UUID,
          session_token: '',
        })
      ).toThrow();
    });
  });

  describe('owner-private-agent-chat actor', () => {
    it('accepts owner private chat history request', () => {
      const parsed = decryptedMessagesRequestSchema.parse({
        actor: 'owner-private-agent-chat',
        conversation_id: VALID_UUID,
        include_events: true,
        run_id: VALID_UUID,
        after_seq: 2,
        limit: 20,
      });
      expect(parsed).toEqual({
        actor: 'owner-private-agent-chat',
        conversation_id: VALID_UUID,
        include_events: true,
        run_id: VALID_UUID,
        after_seq: 2,
        limit: 20,
      });
    });

    it('rejects owner private chat with session_token', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner-private-agent-chat',
          conversation_id: VALID_UUID,
          session_token: 'visitor-only',
        })
      ).toThrow();
    });
  });

  describe('shared validation', () => {
    it('rejects invalid conversation_id (not UUID)', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner',
          conversation_id: 'not-a-uuid',
        })
      ).toThrow();
    });

    it('rejects unknown actor', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'observer',
          conversation_id: VALID_UUID,
        })
      ).toThrow();
    });

    it('rejects limit below 1', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner',
          conversation_id: VALID_UUID,
          limit: 0,
        })
      ).toThrow();
    });

    it('rejects limit above 100', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner',
          conversation_id: VALID_UUID,
          limit: 101,
        })
      ).toThrow();
    });

    it('rejects unknown top-level fields (strict)', () => {
      expect(() =>
        decryptedMessagesRequestSchema.parse({
          actor: 'owner',
          conversation_id: VALID_UUID,
          extra_field: 'boom',
        })
      ).toThrow();
    });
  });

  describe('response schema', () => {
    it('accepts valid envelope with messages', () => {
      const parsed = decryptedMessagesResponseSchema.parse({
        data: [
          {
            id: VALID_UUID,
            message_id: 'msg_001',
            content: 'hello',
            sender_type: 'visitor',
            persisted_at: '2026-04-20T00:00:00Z',
            reply_to_message_id: null,
            thread_id: null,
          },
        ],
        meta: { cursor: null, has_more: false },
      });
      expect(parsed.data).toHaveLength(1);
    });

    it('accepts message without optional thread fields', () => {
      const parsed = decryptedMessagesResponseSchema.parse({
        data: [
          {
            id: VALID_UUID,
            message_id: 'msg_002',
            content: '[decryption_failed]',
            sender_type: 'agent',
            persisted_at: '2026-04-20T00:00:00Z',
          },
        ],
        meta: { cursor: VALID_UUID, has_more: true },
      });
      expect(parsed.data[0].content).toBe('[decryption_failed]');
    });

    it('accepts owner private message sender_type', () => {
      const parsed = decryptedMessagesResponseSchema.parse({
        data: [
          {
            id: VALID_UUID,
            message_id: VALID_UUID,
            content: 'owner message',
            sender_type: 'owner',
            persisted_at: '2026-04-20T00:00:00Z',
            run_id: VALID_UUID,
            content_type: 'text',
            status: 'sent',
          },
        ],
        events: [
          {
            id: VALID_UUID,
            run_id: VALID_UUID,
            seq: 2,
            type: 'text',
            content: 'stream chunk',
            metadata: {},
            persisted_at: '2026-04-20T00:00:01Z',
          },
        ],
        meta: { cursor: null, has_more: false, event_cursor: 2 },
      });
      expect(parsed.data[0].sender_type).toBe('owner');
      expect(parsed.events?.[0].seq).toBe(2);
    });

    it('rejects unknown sender_type', () => {
      expect(() =>
        decryptedMessagesResponseSchema.parse({
          data: [
            {
              id: VALID_UUID,
              message_id: 'm',
              content: 'x',
              sender_type: 'host',
              persisted_at: '2026-04-20T00:00:00Z',
            },
          ],
          meta: { cursor: null, has_more: false },
        })
      ).toThrow();
    });
  });
});
