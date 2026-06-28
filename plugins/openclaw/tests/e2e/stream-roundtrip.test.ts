import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('e2e: stream roundtrip (createStream → chunks + end at gateway)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('pushChunk × 3 + end produces ordered stream_chunk + stream_end frames', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_stream' } },
    });
    await harness.lifecycle.start();

    const controller = harness.lifecycle.createStream({
      accountLabel: 'default',
      conversationId: 'conv-1',
    });

    controller.pushChunk('Hel');
    controller.pushChunk('lo ');
    controller.pushChunk('world');
    controller.end({ totalLength: 11, fullContent: 'Hello world' });

    await harness.waitForOutboundFrame('default', 'stream_end');

    const allFrames = harness.capture.outboundFrames.get('default')!;
    const streamFrames = allFrames.filter((f) => f.id === controller.messageId);

    expect(streamFrames).toHaveLength(4);

    const chunks = streamFrames.filter((f) => f.type === 'stream_chunk');
    const end = streamFrames.find((f) => f.type === 'stream_end')!;

    expect(chunks).toHaveLength(3);
    expect((chunks[0].payload as Record<string, unknown>).sequence).toBe(1);
    expect((chunks[0].payload as Record<string, unknown>).delta).toBe('Hel');
    expect((chunks[1].payload as Record<string, unknown>).sequence).toBe(2);
    expect((chunks[1].payload as Record<string, unknown>).delta).toBe('lo ');
    expect((chunks[2].payload as Record<string, unknown>).sequence).toBe(3);
    expect((chunks[2].payload as Record<string, unknown>).delta).toBe('world');

    const endPayload = end.payload as Record<string, unknown>;
    expect(endPayload.total_chunks).toBe(3);
    expect(endPayload.total_length).toBe(11);
    expect(endPayload.full_content).toBe('Hello world');
    expect(endPayload.conversation_id).toBe('conv-1');

    for (const f of streamFrames) {
      expect(f.id).toBe(controller.messageId);
    }
  });
});
