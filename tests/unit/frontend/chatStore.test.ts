/**
 * Unit tests for chatStore (Zustand store).
 * Tests message management, streaming, connection status, and reset.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage } from '@/types/chat';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useChatStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have empty messages', () => {
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it('should have disconnected status', () => {
      expect(useChatStore.getState().connectionStatus).toBe('disconnected');
    });

    it('should have null streaming', () => {
      expect(useChatStore.getState().streaming).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add a message to the list', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sending',
      };

      useChatStore.getState().addMessage(message);

      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().messages[0]).toEqual(message);
    });

    it('should append multiple messages in order', () => {
      const msg1: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sent',
      };
      const msg2: ChatMessage = {
        id: 'msg-2',
        content: 'Hi!',
        contentType: 'text',
        senderType: 'agent',
        timestamp: '2026-03-15T00:00:01Z',
        status: 'delivered',
      };

      useChatStore.getState().addMessage(msg1);
      useChatStore.getState().addMessage(msg2);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
    });

    it('should not mutate existing messages array', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sent',
      };

      useChatStore.getState().addMessage(msg);
      const firstRef = useChatStore.getState().messages;

      useChatStore.getState().addMessage({ ...msg, id: 'msg-2' });
      const secondRef = useChatStore.getState().messages;

      expect(firstRef).not.toBe(secondRef);
    });
  });

  describe('updateMessageStatus', () => {
    it('should update status of specific message', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sending',
      };

      useChatStore.getState().addMessage(msg);
      useChatStore.getState().updateMessageStatus('msg-1', 'delivered');

      expect(useChatStore.getState().messages[0].status).toBe('delivered');
    });

    it('should not affect other messages', () => {
      const msg1: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sending',
      };
      const msg2: ChatMessage = {
        id: 'msg-2',
        content: 'World',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:01Z',
        status: 'sending',
      };

      useChatStore.getState().addMessage(msg1);
      useChatStore.getState().addMessage(msg2);
      useChatStore.getState().updateMessageStatus('msg-1', 'delivered');

      expect(useChatStore.getState().messages[0].status).toBe('delivered');
      expect(useChatStore.getState().messages[1].status).toBe('sending');
    });

    it('should handle nonexistent message ID gracefully', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sending',
      };

      useChatStore.getState().addMessage(msg);
      useChatStore.getState().updateMessageStatus('nonexistent', 'delivered');

      // Original message should be unchanged
      expect(useChatStore.getState().messages[0].status).toBe('sending');
    });
  });

  describe('streaming', () => {
    it('should start stream', () => {
      useChatStore.getState().startStream('stream-1');

      expect(useChatStore.getState().streaming).toEqual({
        messageId: 'stream-1',
        content: '',
        sequence: undefined,
      });
    });

    it('should append stream delta', () => {
      useChatStore.getState().startStream('stream-1');
      useChatStore.getState().appendStreamDelta('stream-1', 'Hello', 1);

      expect(useChatStore.getState().streaming).toEqual({
        messageId: 'stream-1',
        content: 'Hello',
        sequence: 1,
      });
    });

    it('should concatenate multiple deltas', () => {
      useChatStore.getState().startStream('stream-1');
      useChatStore.getState().appendStreamDelta('stream-1', 'Hello', 1);
      useChatStore.getState().appendStreamDelta('stream-1', ' World', 2);

      expect(useChatStore.getState().streaming?.content).toBe('Hello World');
      expect(useChatStore.getState().streaming?.sequence).toBe(2);
    });

    it('should ignore out-of-order chunks', () => {
      useChatStore.getState().startStream('stream-1');
      useChatStore.getState().appendStreamDelta('stream-1', 'Hello', 2);
      useChatStore.getState().appendStreamDelta('stream-1', ' DUPLICATE', 1);

      expect(useChatStore.getState().streaming?.content).toBe('Hello');
      expect(useChatStore.getState().streaming?.sequence).toBe(2);
    });

    it('should initialize streaming if appendStreamDelta called without startStream', () => {
      useChatStore.getState().appendStreamDelta('stream-1', 'Hello', 1);

      expect(useChatStore.getState().streaming).toEqual({
        messageId: 'stream-1',
        content: 'Hello',
        sequence: 1,
      });
    });

    it('should end stream and add message to messages list', () => {
      useChatStore.getState().startStream('stream-1');
      useChatStore.getState().appendStreamDelta('stream-1', 'Hello', 1);
      useChatStore.getState().appendStreamDelta('stream-1', ' World', 2);
      useChatStore.getState().endStream('stream-1', 'Hello World');

      expect(useChatStore.getState().streaming).toBeNull();
      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('stream-1');
      expect(messages[0].content).toBe('Hello World');
      expect(messages[0].senderType).toBe('agent');
      expect(messages[0].status).toBe('delivered');
    });

    it('should use accumulated content when endStream has no fullContent', () => {
      useChatStore.getState().startStream('stream-1');
      useChatStore.getState().appendStreamDelta('stream-1', 'Accumulated', 1);
      useChatStore.getState().endStream('stream-1');

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Accumulated');
    });
  });

  describe('setConnectionStatus', () => {
    it('should update connection status', () => {
      useChatStore.getState().setConnectionStatus('connected');
      expect(useChatStore.getState().connectionStatus).toBe('connected');
    });

    it('should cycle through all statuses', () => {
      const statuses = ['connecting', 'connected', 'reconnecting', 'disconnected'] as const;
      for (const status of statuses) {
        useChatStore.getState().setConnectionStatus(status);
        expect(useChatStore.getState().connectionStatus).toBe(status);
      }
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Add some state
      useChatStore.getState().addMessage({
        id: 'msg-1',
        content: 'Hello',
        contentType: 'text',
        senderType: 'visitor',
        timestamp: '2026-03-15T00:00:00Z',
        status: 'sent',
      });
      useChatStore.getState().setConnectionStatus('connected');
      useChatStore.getState().startStream('stream-1');

      // Reset
      useChatStore.getState().reset();

      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().connectionStatus).toBe('disconnected');
      expect(useChatStore.getState().streaming).toBeNull();
    });
  });
});
