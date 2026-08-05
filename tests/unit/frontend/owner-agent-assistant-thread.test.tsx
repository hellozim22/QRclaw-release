import { describe, expect, it, vi } from 'vitest';

import { createOwnerAssistantAdapter } from '@/components/chat/OwnerAssistantThread';
import type { ChatMessage } from '@/stores/owner-agent-chat-store';

const makeMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'msg-1',
  sender_type: 'owner',
  content: 'hello',
  status: 'sent',
  created_at: '2026-04-28T00:00:00Z',
  ...overrides,
});

describe('OwnerAssistantThread', () => {
  it('adapts QRClaw messages and actions into assistant-ui runtime', async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const adapter = createOwnerAssistantAdapter({
      canSend: true,
      isRunning: true,
      messages: [
        makeMessage({ id: 'owner-1', sender_type: 'owner', content: 'literal **owner**' }),
        makeMessage({
          id: 'agent-1',
          sender_type: 'agent',
          content: '**streamed** reply',
          status: 'streaming',
          run_status: 'running',
        }),
      ],
      onSend,
      onStop,
    });

    expect(adapter.isDisabled).toBe(false);
    expect(adapter.isRunning).toBe(true);
    expect(adapter.messages).toHaveLength(2);
    expect(adapter.convertMessage(adapter.messages[0], 0)).toMatchObject({
      id: 'owner-1',
      role: 'user',
      content: [{ type: 'text', text: 'literal **owner**' }],
    });
    expect(adapter.convertMessage(adapter.messages[1], 1)).toMatchObject({
      id: 'agent-1',
      role: 'assistant',
      content: [{ type: 'text', text: '**streamed** reply' }],
      status: { type: 'running' },
    });

    await adapter.onNew({
      parentId: null,
      sourceId: null,
      runConfig: undefined,
      role: 'user',
      content: [
        { type: 'text', text: 'Hi ' },
        { type: 'text', text: 'there' },
      ],
      attachments: [],
      metadata: { custom: {} },
      createdAt: new Date('2026-04-28T00:00:02Z'),
    });
    expect(onSend).toHaveBeenCalledWith('Hi there');

    await adapter.onCancel();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('keeps assistant-ui composer disabled when the selected runtime cannot send', () => {
    const adapter = createOwnerAssistantAdapter({
      canSend: false,
      isRunning: false,
      messages: [],
      onSend: vi.fn(),
      onStop: vi.fn(),
    });
    expect(adapter.isDisabled).toBe(true);
  });
});
