import { describe, expect, it } from 'vitest';
import {
  extractLatestUserTextForTest,
  formatOpenAIChatChunkForTest,
} from '../../../gateway/src/routes/owner-agent-chat-sse';

const RUN_ID = '55555555-5555-4555-8555-555555555555';

describe('owner-agent OpenAI SSE helpers', () => {
  it('extracts latest user text from OpenAI-style message content', () => {
    const text = extractLatestUserTextForTest({
      messages: [
        { role: 'user', content: 'older' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: [{ type: 'text', text: 'new text' }] },
      ],
    });

    expect(text).toBe('new text');
  });

  it('rejects inline base64 image URLs before opening an SSE stream', () => {
    expect(() =>
      extractLatestUserTextForTest({
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }],
          },
        ],
      })
    ).toThrow('base64 data: URLs not allowed');
  });

  it('formats anonymous OpenAI data chunks and never ai-sdk stream lines', () => {
    const line = formatOpenAIChatChunkForTest(RUN_ID, 'cursor', { content: 'hello' });

    expect(line).toMatch(/^data: \{/);
    expect(line).toContain('"delta":{"content":"hello"}');
    expect(line).toContain('"finish_reason":null');
    expect(line).toContain('\n\n');
    expect(line).not.toMatch(/^0:/);
  });
});
