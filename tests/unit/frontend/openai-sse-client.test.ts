import { describe, expect, it } from 'vitest';

import { parseOpenAISSE } from '@/lib/openai-sse-client';

const streamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

describe('parseOpenAISSE', () => {
  it('yields OpenAI content deltas across split SSE chunks', async () => {
    const stream = streamFromChunks([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
      '\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const events = [];
    for await (const event of parseOpenAISSE(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'delta', content: 'Hel' },
      { type: 'delta', content: 'lo' },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('normalizes CRLF separators and stops on finish_reason', async () => {
    const stream = streamFromChunks([
      'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"ignored"}}]}\r\n\r\n',
    ]);

    const events = [];
    for await (const event of parseOpenAISSE(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'delta', content: 'done' },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('surfaces OpenAI error payloads without logging content', async () => {
    const stream = streamFromChunks([
      'data: {"error":{"message":"runtime unavailable"}}\n\n',
    ]);

    const events = [];
    for await (const event of parseOpenAISSE(stream)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'error', message: 'runtime unavailable' },
    ]);
  });
});
