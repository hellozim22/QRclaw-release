import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInboundFrame, type InboundDeps } from '../src/inbound.js';
import type { ServerFrame, MessageFrame, SystemFrame } from '../../../shared/contracts/ws/types.js';

function createDeps(overrides?: Partial<InboundDeps>): InboundDeps {
  return {
    dispatchInbound: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe('handleInboundFrame', () => {
  let deps: InboundDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  it('dispatches visitor message with correct mapped shape', () => {
    const frame: MessageFrame = {
      type: 'message',
      id: 'msg-001',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        content: 'Hello from visitor',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-123',
        reply_to_message_id: 'parent-msg-001',
        thread_id: 'thread-001',
      },
    };

    handleInboundFrame(deps, 'default', frame as ServerFrame);

    expect(deps.dispatchInbound).toHaveBeenCalledOnce();
    const call = vi.mocked(deps.dispatchInbound).mock.calls[0][0];
    expect(call).toMatchObject({
      channel: 'qrclaw',
      accountLabel: 'default',
      chatId: 'conv-123',
      user: 'conv-123',
      text: 'Hello from visitor',
      extra: {
        message_id: 'msg-001',
        reply_to_message_id: 'parent-msg-001',
        thread_id: 'thread-001',
      },
    });
  });

  it('derives user from visitor_id when present on broadcast frame', () => {
    const frame = {
      type: 'visitor_message',
      id: 'msg-002',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        content: 'Hi',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-456',
        visitor_id: 'vis-789',
      },
    } as unknown as ServerFrame;

    handleInboundFrame(deps, 'bot-1', frame);

    const call = vi.mocked(deps.dispatchInbound).mock.calls[0][0];
    expect(call.user).toBe('vis-789');
    expect(call.chatId).toBe('conv-456');
  });

  it('does NOT dispatch agent-echo messages (prevents loop)', () => {
    const frame: MessageFrame = {
      type: 'message',
      id: 'msg-003',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        content: 'Agent reply',
        content_type: 'markdown',
        sender_type: 'agent',
        conversation_id: 'conv-123',
      },
    };

    handleInboundFrame(deps, 'default', frame as ServerFrame);

    expect(deps.dispatchInbound).not.toHaveBeenCalled();
  });

  it('handles system agent_online event — logs and drops', () => {
    const frame: SystemFrame = {
      type: 'system',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        event: 'agent_online',
        data: { agent_id: 'agent-1' },
      },
    };

    handleInboundFrame(deps, 'default', frame as ServerFrame);

    expect(deps.dispatchInbound).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalled();
  });

  it('handles system agent_offline event — logs and drops', () => {
    const frame: SystemFrame = {
      type: 'system',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        event: 'agent_offline',
      },
    };

    handleInboundFrame(deps, 'default', frame as ServerFrame);

    expect(deps.dispatchInbound).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalled();
  });

  it('silently drops read_receipt frames', () => {
    const frame = {
      type: 'read_receipt',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        message_ids: ['msg-1', 'msg-2'],
      },
    } as unknown as ServerFrame;

    handleInboundFrame(deps, 'default', frame);

    expect(deps.dispatchInbound).not.toHaveBeenCalled();
    expect(deps.logger.debug).not.toHaveBeenCalled();
  });

  it('logs debug and drops unknown frame types without throwing', () => {
    const frame = {
      type: 'some_future_frame',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {},
    } as unknown as ServerFrame;

    expect(() => handleInboundFrame(deps, 'default', frame)).not.toThrow();

    expect(deps.dispatchInbound).not.toHaveBeenCalled();
    expect(deps.logger.debug).toHaveBeenCalled();
  });

  it('catches dispatchInbound errors and logs via logger.warn', () => {
    const throwingDeps = createDeps({
      dispatchInbound: vi.fn(() => {
        throw new Error('dispatch exploded');
      }),
    });

    const frame: MessageFrame = {
      type: 'message',
      id: 'msg-err',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        content: 'trigger error',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-err',
      },
    };

    expect(() => handleInboundFrame(throwingDeps, 'default', frame as ServerFrame)).not.toThrow();
    expect(throwingDeps.logger.warn).toHaveBeenCalled();
  });

  it('passes through visitor message with no optional fields in extra', () => {
    const frame: MessageFrame = {
      type: 'message',
      id: 'msg-minimal',
      timestamp: '2026-04-20T00:00:00Z',
      payload: {
        content: 'Just text',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-min',
      },
    };

    handleInboundFrame(deps, 'default', frame as ServerFrame);

    const call = vi.mocked(deps.dispatchInbound).mock.calls[0][0];
    expect(call.extra.reply_to_message_id).toBeUndefined();
    expect(call.extra.thread_id).toBeUndefined();
    expect(call.extra.message_id).toBe('msg-minimal');
  });
});
