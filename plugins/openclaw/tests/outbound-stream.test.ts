import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStream, type StreamDeps } from '../src/outbound/stream.js';

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

describe('createStream', () => {
  let deps: StreamDeps;
  let mockConn: ReturnType<typeof createMockConnection>;

  beforeEach(() => {
    mockConn = createMockConnection();
    deps = {
      runtime: createMockRuntime(mockConn) as unknown as StreamDeps['runtime'],
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  it('emits 3 stream_chunk frames with sequences 1,2,3 then stream_end with total_chunks=3', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-1',
    });

    ctrl.pushChunk('Hello');
    ctrl.pushChunk(' world');
    ctrl.pushChunk('!');
    ctrl.end();

    expect(mockConn.send).toHaveBeenCalledTimes(4);

    const chunk1 = mockConn.send.mock.calls[0][0];
    expect(chunk1.type).toBe('stream_chunk');
    expect(chunk1.id).toBe(ctrl.messageId);
    expect(chunk1.payload.delta).toBe('Hello');
    expect(chunk1.payload.sequence).toBe(1);
    expect(chunk1.payload.conversation_id).toBe('conv-1');

    const chunk2 = mockConn.send.mock.calls[1][0];
    expect(chunk2.payload.delta).toBe(' world');
    expect(chunk2.payload.sequence).toBe(2);

    const chunk3 = mockConn.send.mock.calls[2][0];
    expect(chunk3.payload.delta).toBe('!');
    expect(chunk3.payload.sequence).toBe(3);

    const endFrame = mockConn.send.mock.calls[3][0];
    expect(endFrame.type).toBe('stream_end');
    expect(endFrame.id).toBe(ctrl.messageId);
    expect(endFrame.payload.total_chunks).toBe(3);
    expect(endFrame.payload.conversation_id).toBe('conv-1');
  });

  it('forwards totalLength and fullContent in stream_end payload', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-2',
    });

    ctrl.pushChunk('abc');
    ctrl.end({ totalLength: 100, fullContent: 'full content here' });

    const endFrame = mockConn.send.mock.calls[1][0];
    expect(endFrame.payload.total_length).toBe(100);
    expect(endFrame.payload.full_content).toBe('full content here');
  });

  it('calling pushChunk after end is a no-op with logger.warn', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-3',
    });

    ctrl.pushChunk('data');
    ctrl.end();

    const callCountAfterEnd = mockConn.send.mock.calls.length;

    ctrl.pushChunk('should be ignored');

    expect(mockConn.send.mock.calls.length).toBe(callCountAfterEnd);
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('abort emits stream_end with aborted=true', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-4',
    });

    ctrl.pushChunk('partial');
    ctrl.abort('timeout');

    const lastCall = mockConn.send.mock.calls[mockConn.send.mock.calls.length - 1][0];
    expect(lastCall.type).toBe('stream_end');
    expect(lastCall.payload.aborted).toBe(true);
    expect(lastCall.id).toBe(ctrl.messageId);
  });

  it('all chunks and end share the same messageId', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-5',
    });

    ctrl.pushChunk('a');
    ctrl.pushChunk('b');
    ctrl.end();

    const allIds = mockConn.send.mock.calls.map(
      (call: unknown[]) => (call as [{ id: string }])[0].id
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(1);
    expect(uniqueIds.has(ctrl.messageId)).toBe(true);
  });

  it('handles send failure during pushChunk gracefully', () => {
    mockConn.send.mockImplementationOnce(() => {
      throw new Error('WebSocket broken');
    });

    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-6',
    });

    ctrl.pushChunk('will fail');
    expect(deps.logger.warn).toHaveBeenCalled();

    mockConn.send.mockClear();
    ctrl.pushChunk('should be skipped after error');
    expect(mockConn.send).not.toHaveBeenCalled();
  });

  it('calling end with zero chunks still emits stream_end', () => {
    const ctrl = createStream(deps, {
      accountLabel: 'default',
      conversationId: 'conv-7',
    });

    ctrl.end();

    expect(mockConn.send).toHaveBeenCalledOnce();
    const endFrame = mockConn.send.mock.calls[0][0];
    expect(endFrame.type).toBe('stream_end');
    expect(endFrame.payload.total_chunks).toBe(0);
  });
});
