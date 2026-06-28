import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from '@/components/ui/MessageBubble';

// Mock Avatar component
vi.mock('@/components/ui/Avatar', () => ({
  default: ({
    variant,
    src,
    alt,
    size,
  }: {
    variant: string;
    src?: string;
    alt?: string;
    size: number;
  }) => <div data-testid={`avatar-${variant}`} data-src={src} data-alt={alt} data-size={size} />,
}));

describe('MessageBubble', () => {
  describe('rendering', () => {
    it('should render message content', () => {
      render(<MessageBubble variant="sent">Hello world</MessageBubble>);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should render children as ReactNode', () => {
      render(
        <MessageBubble variant="sent">
          <strong>Bold text</strong>
        </MessageBubble>
      );
      expect(screen.getByText('Bold text')).toBeInTheDocument();
    });
  });

  describe('sent variant', () => {
    it('should align to the right for sent messages', () => {
      const { container } = render(<MessageBubble variant="sent">Sent</MessageBubble>);
      const row = container.firstElementChild as HTMLElement;
      expect(row.style.justifyContent).toBe('flex-end');
    });

    it('should apply visitor bubble background', () => {
      render(<MessageBubble variant="sent">Sent</MessageBubble>);
      const bubble = screen.getByText('Sent');
      expect(bubble.style.background).toBe('var(--color-visitor-bubble)');
    });

    it('should show user avatar on right side', () => {
      render(<MessageBubble variant="sent">Sent</MessageBubble>);
      const av = screen.getByTestId('avatar-user');
      expect(av).toBeInTheDocument();
      expect(av.dataset.size).toBe('32');
      expect(screen.queryByTestId('avatar-agent')).not.toBeInTheDocument();
    });
  });

  describe('received variant', () => {
    it('should align to the left for received messages', () => {
      const { container } = render(<MessageBubble variant="received">Received</MessageBubble>);
      const row = container.firstElementChild as HTMLElement;
      expect(row.style.justifyContent).toBe('flex-start');
    });

    it('should apply white background for received messages', () => {
      render(<MessageBubble variant="received">Received</MessageBubble>);
      const bubble = screen.getByText('Received');
      expect(bubble.style.background).toBe('var(--color-white)');
    });

    it('should show agent avatar on left side', () => {
      render(
        <MessageBubble variant="received" avatarSrc="/bot.png" avatarAlt="Bot">
          Received
        </MessageBubble>
      );
      const avatar = screen.getByTestId('avatar-agent');
      expect(avatar).toBeInTheDocument();
      expect(avatar.dataset.src).toBe('/bot.png');
      expect(avatar.dataset.alt).toBe('Bot');
    });
  });

  describe('streaming indicator', () => {
    it('should show streaming indicator when isStreaming is true', () => {
      render(
        <MessageBubble variant="received" isStreaming>
          Partial response
        </MessageBubble>
      );
      expect(screen.getByText('typing')).toBeInTheDocument();
    });

    it('should not show streaming indicator by default', () => {
      render(<MessageBubble variant="received">Complete response</MessageBubble>);
      expect(screen.queryByText('typing')).not.toBeInTheDocument();
    });

    it('should not show streaming indicator when isStreaming is false', () => {
      render(
        <MessageBubble variant="received" isStreaming={false}>
          Done
        </MessageBubble>
      );
      expect(screen.queryByText('typing')).not.toBeInTheDocument();
    });
  });

  describe('bubble styling', () => {
    it('should constrain thread column to 75% width', () => {
      render(<MessageBubble variant="sent">Message</MessageBubble>);
      const bubble = screen.getByText('Message');
      expect(bubble.style.maxWidth).toBe('100%');
      expect(bubble.parentElement?.style.maxWidth).toBe('75%');
    });

    it('should break words for long content', () => {
      render(<MessageBubble variant="sent">Message</MessageBubble>);
      const bubble = screen.getByText('Message');
      expect(bubble.style.wordBreak).toBe('break-word');
    });
  });
});
