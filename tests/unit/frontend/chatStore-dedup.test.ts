/**
 * TDD RED: Tests for chatStore message deduplication.
 * Bug: addMessage blindly appends, causing duplicate messages on screen.
 * Fix: Deduplicate by messageId.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage } from '@/types/chat';

const makeMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  content: 'Hello',
  contentType: 'text',
  senderType: 'visitor',
  timestamp: '2026-03-24T00:00:00Z',
  status: 'sending',
  ...overrides,
});

describe('chatStore deduplication', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('should not add duplicate messages with the same id', () => {
    const msg = makeMsg();
    useChatStore.getState().addMessage(msg);
    useChatStore.getState().addMessage(msg);

    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('should update status when duplicate message arrives with different status', () => {
    const optimistic = makeMsg({ status: 'sending' });
    const confirmed = makeMsg({ status: 'delivered' });

    useChatStore.getState().addMessage(optimistic);
    useChatStore.getState().addMessage(confirmed);

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe('delivered');
  });

  it('should allow messages with different ids', () => {
    useChatStore.getState().addMessage(makeMsg({ id: 'msg-1' }));
    useChatStore.getState().addMessage(makeMsg({ id: 'msg-2' }));

    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('should return same reference when duplicate has identical status (no-op)', () => {
    const msg = makeMsg({ status: 'delivered' });
    useChatStore.getState().addMessage(msg);
    const ref1 = useChatStore.getState().messages;

    useChatStore.getState().addMessage(msg);
    const ref2 = useChatStore.getState().messages;

    expect(ref1).toBe(ref2);
  });
});
