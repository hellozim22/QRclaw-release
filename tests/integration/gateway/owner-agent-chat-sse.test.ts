import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OwnerAgentRunCompletedFrame,
  OwnerAgentRunEventFrame,
} from '../../../shared/contracts/ws/types';

const mockServices = vi.hoisted(() => ({
  getOwnerByUserId: vi.fn(),
  startOwnerAgentRun: vi.fn(),
}));

vi.mock('../../../gateway/src/db/owner-agent-chat', () => ({
  getOwnerByUserId: mockServices.getOwnerByUserId,
}));

vi.mock('../../../gateway/src/services/owner-agent-chat', async () => {
  const actual = await vi.importActual<
    typeof import('../../../gateway/src/services/owner-agent-chat')
  >('../../../gateway/src/services/owner-agent-chat');
  return {
    OwnerAgentChatServiceError: actual.OwnerAgentChatServiceError,
    startOwnerAgentRun: mockServices.startOwnerAgentRun,
  };
});

import {
  extractLatestUserTextForTest,
  formatOpenAIChatChunkForTest,
  handleOwnerAgentChatSse,
} from '../../../gateway/src/routes/owner-agent-chat-sse';
import { publishRunFrame } from '../../../gateway/src/ws/stream-hub';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_ID = '77777777-7777-4777-8777-777777777777';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

class MockReq extends EventEmitter {
  headers: Record<string, string | undefined> = {};
  params: Record<string, string> = { agentId: AGENT_ID };
  body: Record<string, unknown> = {};
  user = { id: USER_ID, role: 'authenticated' };
}

class MockRes {
  statusCode = 200;
  headers = new Map<string, string>();
  writes: string[] = [];
  ended = false;
  readonly flushHeaders = vi.fn();

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
  }

  json(body: unknown): void {
    this.writes.push(JSON.stringify(body));
    this.ended = true;
  }
}

const runEventFrame = (content: string): OwnerAgentRunEventFrame => ({
  type: 'owner_agent_run_event',
  id: 'event-1',
  timestamp: '2026-04-28T00:00:00.000Z',
  payload: {
    run_id: RUN_ID,
    conversation_id: CONVERSATION_ID,
    agent_id: AGENT_ID,
    provider: 'cursor',
    correlation_id: RUN_ID,
    seq: 1,
    event_type: 'text',
    content,
  },
});

const completedFrame = (): OwnerAgentRunCompletedFrame => ({
  type: 'owner_agent_run_completed',
  id: 'completed-1',
  timestamp: '2026-04-28T00:00:00.000Z',
  payload: {
    run_id: RUN_ID,
    conversation_id: CONVERSATION_ID,
    agent_id: AGENT_ID,
    provider: 'cursor',
    correlation_id: RUN_ID,
    seq: 2,
    final_message: 'final fallback',
    actual_model: 'gpt-5.5-high',
  },
});

describe('OpenAI-compatible owner-agent SSE route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getOwnerByUserId.mockResolvedValue({ id: OWNER_ID });
    mockServices.startOwnerAgentRun.mockImplementation(
      async (
        _ownerId: string,
        _agentId: string,
        _input: unknown,
        options?: { beforeDispatch?: (run: unknown) => void }
      ) => {
        options?.beforeDispatch?.({
          runId: RUN_ID,
          conversationId: CONVERSATION_ID,
          provider: 'cursor',
          requestedModel: 'gpt-5.5-high',
        });
        return {
          runId: RUN_ID,
          conversationId: CONVERSATION_ID,
          status: 'running',
          provider: 'cursor',
          requestedModel: 'gpt-5.5-high',
        };
      }
    );
  });

  it('extracts the latest user text and rejects inline base64 attachments before streaming', () => {
    expect(
      extractLatestUserTextForTest({
        messages: [
          { role: 'user', content: 'older' },
          { role: 'assistant', content: 'reply' },
          { role: 'user', content: [{ type: 'text', text: 'new text' }] },
        ],
      })
    ).toBe('new text');

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

  it('streams Host run events as OpenAI chunks with C2 buffering headers', async () => {
    const req = new MockReq();
    const res = new MockRes();
    req.headers['last-event-id'] = 'ignored-resume-cursor';
    req.body = {
      model: 'gpt-5.5-high',
      messages: [{ role: 'user', content: 'Review this diff.' }],
    };

    await handleOwnerAgentChatSse(req as never, res as never);
    publishRunFrame(RUN_ID, { kind: 'event', frame: runEventFrame('streamed delta') });
    publishRunFrame(RUN_ID, { kind: 'completed', frame: completedFrame() });

    expect(res.statusCode).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(res.headers.get('X-QRClaw-Run-Id')).toBe(RUN_ID);
    expect(mockServices.startOwnerAgentRun).toHaveBeenCalledWith(
      OWNER_ID,
      AGENT_ID,
      {
        content: 'Review this diff.',
        content_type: 'text',
        requested_model: 'gpt-5.5-high',
      },
      expect.objectContaining({ beforeDispatch: expect.any(Function) })
    );
    expect(res.writes.join('')).toContain('"role":"assistant"');
    expect(res.writes.join('')).toContain('"content":"streamed delta"');
    expect(res.writes.join('')).toContain('"finish_reason":"stop"');
    expect(res.writes.at(-1)).toBe('data: [DONE]\n\n');
    expect(res.writes.join('')).not.toContain('final fallback');
    expect(res.ended).toBe(true);
  });

  it('returns JSON 502 before opening SSE when no Host is online', async () => {
    mockServices.startOwnerAgentRun.mockResolvedValue({
      runId: RUN_ID,
      conversationId: CONVERSATION_ID,
      status: 'pending',
      provider: 'cursor',
      requestedModel: null,
    });
    const req = new MockReq();
    const res = new MockRes();
    req.body = { messages: [{ role: 'user', content: 'hello' }] };

    await handleOwnerAgentChatSse(req as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.headers.get('Content-Type')).toBeUndefined();
    expect(res.writes.join('')).toContain('host_unavailable');
  });
});
