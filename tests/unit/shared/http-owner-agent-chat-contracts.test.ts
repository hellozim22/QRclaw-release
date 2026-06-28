import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  hostTokenScopeSchema,
  ownerAgentCreateAgentRequestSchema,
  ownerAgentSendMessageRequestSchema,
  ownerAgentCreateHostTokenRequestSchema,
} from '../../../shared/contracts/http/owner-agent-chat/protocol.js';
import {
  OWNER_AGENT_PROVIDERS,
  type HostTokenScope,
  type OwnerAgentCreateAgentRequest,
  type OwnerAgentSendMessageRequest,
  type OwnerAgentCreateHostTokenRequest,
} from '../../../shared/contracts/http/owner-agent-chat/types.js';
import type { z } from 'zod';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('owner-agent-chat HTTP contracts — type parity', () => {
  it('HostTokenScope schema matches interface', () => {
    expectTypeOf<z.infer<typeof hostTokenScopeSchema>>().toEqualTypeOf<HostTokenScope>();
  });

  it('create Agent request schema matches interface', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentCreateAgentRequestSchema>
    >().toEqualTypeOf<OwnerAgentCreateAgentRequest>();
  });

  it('send message request schema matches interface', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentSendMessageRequestSchema>
    >().toEqualTypeOf<OwnerAgentSendMessageRequest>();
  });

  it('create Host token request schema matches interface', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentCreateHostTokenRequestSchema>
    >().toEqualTypeOf<OwnerAgentCreateHostTokenRequest>();
  });
});

describe('HostTokenScope schema', () => {
  it('accepts the fixed owner/private-chat local Host scope shape', () => {
    const parsed = hostTokenScopeSchema.parse({
      owner_id: VALID_UUID,
      allowed_provider_set: OWNER_AGENT_PROVIDERS,
      can_register_local: true,
      can_receive_private_runs: true,
    });

    expect(parsed).toEqual({
      owner_id: VALID_UUID,
      allowed_provider_set: OWNER_AGENT_PROVIDERS,
      can_register_local: true,
      can_receive_private_runs: true,
    });
  });

  it('rejects non-UUID owner_id', () => {
    expect(() =>
      hostTokenScopeSchema.parse({
        owner_id: 'owner-1',
        allowed_provider_set: ['claude'],
        can_register_local: true,
        can_receive_private_runs: true,
      })
    ).toThrow();
  });

  it('rejects providers outside the Wave 1 DB CHECK enum', () => {
    expect(() =>
      hostTokenScopeSchema.parse({
        owner_id: VALID_UUID,
        allowed_provider_set: ['gemini'],
        can_register_local: true,
        can_receive_private_runs: true,
      })
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      hostTokenScopeSchema.parse({
        owner_id: VALID_UUID,
        allowed_provider_set: ['cursor'],
        can_register_local: true,
        can_receive_private_runs: true,
        can_read_visitor_messages: true,
      })
    ).toThrow();
  });
});

describe('owner-agent-chat HTTP request schemas', () => {
  it('accepts create Agent body with binding and Full Access acknowledgement', () => {
    const parsed = ownerAgentCreateAgentRequestSchema.parse({
      name: 'Code Review Agent',
      avatar_url: null,
      description: 'Reviews pull requests.',
      backend_provider: 'cursor',
      backend_source: 'local',
      instructions: 'Focus on correctness.',
      suggested_prompts: ['Review this diff'],
      execution_mode: 'full_access',
      execution_mode_ack: true,
    });

    expect(parsed.backend_provider).toBe('cursor');
  });

  it('rejects too many suggested prompts', () => {
    expect(() =>
      ownerAgentCreateAgentRequestSchema.parse({
        name: 'Agent',
        backend_provider: 'claude',
        backend_source: 'local',
        execution_mode: 'standard',
        execution_mode_ack: true,
        suggested_prompts: Array.from({ length: 11 }, (_, index) => `Prompt ${index}`),
      })
    ).toThrow();
  });

  it('accepts owner message body', () => {
    const parsed = ownerAgentSendMessageRequestSchema.parse({
      content: 'Please summarize this repository.',
      content_type: 'text',
      client_message_id: 'msg-owner-1',
      requested_model: 'gpt-5.5-high',
    });

    expect(parsed.content_type).toBe('text');
  });

  it('accepts create Host token body with scoped providers', () => {
    const parsed = ownerAgentCreateHostTokenRequestSchema.parse({
      label: 'Zeze MacBook Pro',
      scope: {
        owner_id: VALID_UUID,
        allowed_provider_set: ['openclaw', 'claude'],
        can_register_local: true,
        can_receive_private_runs: true,
      },
      expires_at: '2026-05-27T00:00:00Z',
    });

    expect(parsed.scope.allowed_provider_set).toEqual(['openclaw', 'claude']);
  });
});
