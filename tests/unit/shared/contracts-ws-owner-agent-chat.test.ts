import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  validateFrame,
  hostRegisterFrameSchema,
  ownerAgentRunEventFrameSchema,
} from '../../../shared/contracts/ws/protocol.js';
import {
  validateOutboundFrame,
  ownerAgentRunRequestOutboundSchema,
  ownerAgentRunEventOutboundSchema,
  ownerAgentRunCompletedOutboundSchema,
  ownerAgentRunFailedOutboundSchema,
  ownerAgentRunCancelOutboundSchema,
} from '../../../shared/contracts/ws/outbound.js';
import {
  INBOUND_FRAME_TYPES,
  OUTBOUND_FRAME_TYPES,
  type HostRegisterFrame,
  type OwnerAgentRunRequestFrame,
  type OwnerAgentRunEventFrame,
  type OwnerAgentRunCompletedFrame,
  type OwnerAgentRunFailedFrame,
  type OwnerAgentRunCancelFrame,
} from '../../../shared/contracts/ws/types.js';
import type { z } from 'zod';

const TS = '2026-04-27T00:00:00.000Z';
const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';

const runPayloadBase = {
  run_id: UUID_1,
  conversation_id: UUID_2,
  agent_id: UUID_3,
  provider: 'claude',
  correlation_id: 'corr-1',
} as const;

describe('owner-agent-chat WS contracts — type parity', () => {
  it('host_register schema matches HostRegisterFrame', () => {
    expectTypeOf<z.infer<typeof hostRegisterFrameSchema>>().toEqualTypeOf<HostRegisterFrame>();
  });

  it('owner_agent_run_event inbound schema matches OwnerAgentRunEventFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunEventFrameSchema>
    >().toEqualTypeOf<OwnerAgentRunEventFrame>();
  });

  it('owner_agent_run_request outbound schema matches OwnerAgentRunRequestFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunRequestOutboundSchema>
    >().toEqualTypeOf<OwnerAgentRunRequestFrame>();
  });

  it('owner_agent_run_event outbound schema matches OwnerAgentRunEventFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunEventOutboundSchema>
    >().toEqualTypeOf<OwnerAgentRunEventFrame>();
  });

  it('owner_agent_run_completed outbound schema matches OwnerAgentRunCompletedFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunCompletedOutboundSchema>
    >().toEqualTypeOf<OwnerAgentRunCompletedFrame>();
  });

  it('owner_agent_run_failed outbound schema matches OwnerAgentRunFailedFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunFailedOutboundSchema>
    >().toEqualTypeOf<OwnerAgentRunFailedFrame>();
  });

  it('owner_agent_run_cancel outbound schema matches OwnerAgentRunCancelFrame', () => {
    expectTypeOf<
      z.infer<typeof ownerAgentRunCancelOutboundSchema>
    >().toEqualTypeOf<OwnerAgentRunCancelFrame>();
  });
});

describe('owner-agent-chat inbound WS schemas', () => {
  it('registers host capabilities without dotted frame names', () => {
    const result = validateFrame({
      type: 'host_register',
      id: 'host-register-1',
      timestamp: TS,
      payload: {
        host_id: UUID_4,
        host_type: 'local',
        display_name: 'Zeze MacBook Pro',
        providers: [
          {
            provider: 'claude',
            version: '1.2.3',
            status: 'online',
            capabilities: {
              streaming: true,
              full_access: true,
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(INBOUND_FRAME_TYPES).toContain('host_register');
    expect(INBOUND_FRAME_TYPES).not.toContain('host.register' as never);
  });

  it('accepts Wave 10 runtime statuses in capability updates', () => {
    const statuses = ['not_installed', 'needs_login', 'online', 'offline', 'error'] as const;
    const result = validateFrame({
      type: 'host_capabilities_updated',
      id: 'host-capabilities-1',
      timestamp: TS,
      payload: {
        host_id: UUID_4,
        providers: statuses.map((status) => ({
          provider: 'claude',
          version: status === 'not_installed' ? null : '1.2.3',
          status,
          capabilities: {
            streaming: true,
            full_access: true,
          },
        })),
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts Host run event chunks capped at 4 KB', () => {
    const result = validateFrame({
      type: 'owner_agent_run_event',
      id: 'run-event-1',
      timestamp: TS,
      payload: {
        ...runPayloadBase,
        seq: 1,
        event_type: 'text',
        content: 'hello',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects dotted owner-agent frame names', () => {
    const result = validateFrame({
      type: 'owner_agent.run.event',
      id: 'run-event-1',
      timestamp: TS,
      payload: {
        ...runPayloadBase,
        seq: 1,
        event_type: 'text',
        content: 'hello',
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('owner-agent-chat outbound WS schemas', () => {
  it('sends run request to Host', () => {
    const result = validateOutboundFrame({
      type: 'owner_agent_run_request',
      id: 'run-request-1',
      timestamp: TS,
      payload: {
        ...runPayloadBase,
        owner_message_id: UUID_4,
        content: 'Review this repository.',
        content_type: 'text',
        instructions: 'Be concise.',
        requested_model: 'gpt-5.5-high',
      },
    });

    expect(result.success).toBe(true);
    expect(OUTBOUND_FRAME_TYPES).toContain('owner_agent_run_request');
    expect(OUTBOUND_FRAME_TYPES).not.toContain('owner_agent.run.request' as never);
  });

  it('fans out run event/completed/failed frames with the same strict payloads', () => {
    expect(
      validateOutboundFrame({
        type: 'owner_agent_run_event',
        id: 'run-event-1',
        timestamp: TS,
        payload: {
          ...runPayloadBase,
          seq: 1,
          event_type: 'text',
          content: 'delta',
        },
      }).success
    ).toBe(true);

    expect(
      validateOutboundFrame({
        type: 'owner_agent_run_completed',
        id: 'run-completed-1',
        timestamp: TS,
        payload: {
          ...runPayloadBase,
          seq: 2,
          final_message: 'done',
          actual_model: 'claude-sonnet',
        },
      }).success
    ).toBe(true);

    expect(
      validateOutboundFrame({
        type: 'owner_agent_run_failed',
        id: 'run-failed-1',
        timestamp: TS,
        payload: {
          ...runPayloadBase,
          seq: 2,
          error_code: 'provider_error',
          error_message: 'Provider failed',
          retryable: false,
        },
      }).success
    ).toBe(true);
  });

  it('sends run cancel to Host', () => {
    const result = validateOutboundFrame({
      type: 'owner_agent_run_cancel',
      id: 'run-cancel-1',
      timestamp: TS,
      payload: {
        ...runPayloadBase,
        reason: 'owner_cancelled',
        requested_by: 'owner',
      },
    });

    expect(result.success).toBe(true);
  });
});
