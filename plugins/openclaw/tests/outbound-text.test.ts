import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendText, QRClawOutboundError, type OutboundTextDeps } from '../src/outbound/text.js';

function createMockConnection() {
  return {
    send: vi.fn(),
    state: 'connected' as const,
    accountLabel: 'default',
  };
}

function createMockRuntime(conn?: ReturnType<typeof createMockConnection>) {
  return {
    connection: vi.fn().mockReturnValue(conn ?? createMockConnection()),
  };
}

describe('sendText', () => {
  let deps: OutboundTextDeps;
  let mockConn: ReturnType<typeof createMockConnection>;

  beforeEach(() => {
    mockConn = createMockConnection();
    deps = {
      runtime: createMockRuntime(mockConn) as unknown as OutboundTextDeps['runtime'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  it('builds an AgentMessageFrame and sends via runtime connection', () => {
    const messageId = sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'Hello world',
    });

    expect(deps.runtime.connection).toHaveBeenCalledWith('default');
    expect(mockConn.send).toHaveBeenCalledOnce();

    const frame = mockConn.send.mock.calls[0][0];
    expect(frame.type).toBe('agent_message');
    expect(frame.id).toBe(messageId);
    expect(frame.payload.content).toBe('Hello world');
    expect(frame.payload.content_type).toBe('markdown');
    expect(frame.payload.conversation_id).toBe('conv-1');
    expect(typeof frame.timestamp).toBe('string');
  });

  it('uses provided contentType instead of default markdown', () => {
    sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'Plain text message',
      contentType: 'text',
    });

    const frame = mockConn.send.mock.calls[0][0];
    expect(frame.payload.content_type).toBe('text');
  });

  it('throws QRClawOutboundError with not_connected when connection is undefined', () => {
    const noConnDeps: OutboundTextDeps = {
      runtime: {
        connection: vi.fn().mockReturnValue(undefined),
      } as unknown as OutboundTextDeps['runtime'],
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    expect(() =>
      sendText(noConnDeps, {
        accountLabel: 'missing',
        conversationId: 'conv-1',
        text: 'hello',
      })
    ).toThrow(QRClawOutboundError);

    try {
      sendText(noConnDeps, {
        accountLabel: 'missing',
        conversationId: 'conv-1',
        text: 'hello',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(QRClawOutboundError);
      expect((err as QRClawOutboundError).code).toBe('not_connected');
    }
  });

  it('passes text through unchanged (no rewrite)', () => {
    const original = '# Markdown **bold** `code`\n\nLine 2';
    sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: original,
    });

    const frame = mockConn.send.mock.calls[0][0];
    expect(frame.payload.content).toBe(original);
  });

  it('returns the generated message_id', () => {
    const result = sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'test',
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    const frame = mockConn.send.mock.calls[0][0];
    expect(frame.id).toBe(result);
    expect(frame.payload).not.toHaveProperty('message_id');
  });

  it('generates unique message_ids on successive calls', () => {
    const id1 = sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'msg1',
    });
    const id2 = sendText(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'msg2',
    });

    expect(id1).not.toBe(id2);
  });
});
