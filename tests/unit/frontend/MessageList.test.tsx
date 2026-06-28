import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageList from '@/components/chat/MessageList';
import type { ChatMessage, StreamingState } from '@/types/chat';

// Mock MessageBubble used by MessageList
vi.mock('@/components/ui', () => ({
  formatChatTimestampLabel: (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  MessageBubble: ({
    variant,
    children,
    avatarSrc,
    avatarAlt,
    isStreaming,
    timestampLabel,
  }: {
    variant: string;
    children: React.ReactNode;
    avatarSrc?: string;
    avatarAlt?: string;
    isStreaming?: boolean;
    timestampLabel?: string;
  }) => (
    <div
      data-testid={`bubble-${variant}`}
      data-avatar-src={avatarSrc}
      data-avatar-alt={avatarAlt}
      data-streaming={isStreaming}
      data-timestamp={timestampLabel}
    >
      {children}
    </div>
  ),
}));

// Mock scrollIntoView
const scrollIntoViewMock = vi.fn();
HTMLDivElement.prototype.scrollIntoView = scrollIntoViewMock;

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  content: 'Hello',
  contentType: 'text',
  senderType: 'visitor',
  timestamp: '2026-03-15T10:00:00Z',
  status: 'delivered',
  ...overrides,
});

describe('MessageList', () => {
  describe('rendering messages', () => {
    it('should render all messages', () => {
      const messages: ChatMessage[] = [
        createMessage({ id: '1', content: 'Hi', senderType: 'visitor' }),
        createMessage({ id: '2', content: 'Hello!', senderType: 'agent' }),
        createMessage({ id: '3', content: 'How are you?', senderType: 'visitor' }),
      ];
      render(<MessageList messages={messages} streaming={null} />);
      expect(screen.getByText('Hi')).toBeInTheDocument();
      expect(screen.getByText('Hello!')).toBeInTheDocument();
      expect(screen.getByText('How are you?')).toBeInTheDocument();
    });

    it('should render empty list when no messages', () => {
      const { container } = render(<MessageList messages={[]} streaming={null} />);
      expect(screen.queryAllByTestId(/^bubble-/)).toHaveLength(0);
      // Container should still exist
      expect(container.firstElementChild).toBeInTheDocument();
    });

    it('should render visitor messages as sent variant', () => {
      const messages = [createMessage({ id: '1', senderType: 'visitor', content: 'Mine' })];
      render(<MessageList messages={messages} streaming={null} />);
      expect(screen.getByTestId('bubble-sent')).toBeInTheDocument();
    });

    it('should render agent messages as received variant', () => {
      const messages = [createMessage({ id: '1', senderType: 'agent', content: 'Theirs' })];
      render(<MessageList messages={messages} streaming={null} />);
      expect(screen.getByTestId('bubble-received')).toBeInTheDocument();
    });

    it('should pass timestamp labels when showTimestamps is true', () => {
      const messages = [createMessage({ id: '1', content: 'Hi', senderType: 'visitor' })];
      render(<MessageList messages={messages} streaming={null} showTimestamps />);
      const bubble = screen.getByTestId('bubble-sent');
      expect(bubble.dataset.timestamp).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
    });
  });

  describe('agent avatar', () => {
    it('should pass agent avatar to received messages', () => {
      const messages = [createMessage({ id: '1', senderType: 'agent', content: 'Hi' })];
      render(
        <MessageList
          messages={messages}
          streaming={null}
          agentAvatarSrc="/bot.png"
          agentName="Bot"
        />
      );
      const bubble = screen.getByTestId('bubble-received');
      expect(bubble.dataset.avatarSrc).toBe('/bot.png');
      expect(bubble.dataset.avatarAlt).toBe('Bot');
    });

    it('should not pass avatar to visitor messages', () => {
      const messages = [createMessage({ id: '1', senderType: 'visitor', content: 'Hi' })];
      render(
        <MessageList
          messages={messages}
          streaming={null}
          agentAvatarSrc="/bot.png"
          agentName="Bot"
        />
      );
      const bubble = screen.getByTestId('bubble-sent');
      expect(bubble.dataset.avatarSrc).toBeUndefined();
    });
  });

  describe('streaming', () => {
    it('should render streaming bubble when streaming state exists', () => {
      const streaming: StreamingState = {
        messageId: 'stream-1',
        content: 'Generating...',
        sequence: 1,
      };
      render(<MessageList messages={[]} streaming={streaming} />);
      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    it('should render streaming bubble as received variant', () => {
      const streaming: StreamingState = {
        messageId: 'stream-1',
        content: 'Thinking...',
        sequence: 1,
      };
      render(<MessageList messages={[]} streaming={streaming} />);
      const bubbles = screen.getAllByTestId('bubble-received');
      const streamBubble = bubbles[bubbles.length - 1];
      expect(streamBubble.dataset.streaming).toBe('true');
    });

    it('should not render streaming bubble when streaming is null', () => {
      render(<MessageList messages={[]} streaming={null} />);
      const bubbles = screen.queryAllByTestId(/^bubble-/);
      expect(bubbles).toHaveLength(0);
    });

    it('should render streaming after regular messages', () => {
      const messages = [createMessage({ id: '1', content: 'Question' })];
      const streaming: StreamingState = {
        messageId: 'stream-1',
        content: 'Answer...',
        sequence: 1,
      };
      render(<MessageList messages={messages} streaming={streaming} />);
      expect(screen.getByText('Question')).toBeInTheDocument();
      expect(screen.getByText('Answer...')).toBeInTheDocument();
    });
  });

  describe('scroll behavior', () => {
    it('should scroll to bottom when messages change', () => {
      const messages = [createMessage({ id: '1', content: 'Hello' })];
      render(<MessageList messages={messages} streaming={null} />);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    it('should scroll to bottom when streaming content updates', () => {
      scrollIntoViewMock.mockClear();
      const streaming: StreamingState = {
        messageId: 'stream-1',
        content: 'New content',
        sequence: 2,
      };
      render(<MessageList messages={[]} streaming={streaming} />);
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
