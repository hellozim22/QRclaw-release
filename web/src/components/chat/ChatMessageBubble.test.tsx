import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatMessageBubble from './ChatMessageBubble';

describe('ChatMessageBubble', () => {
  it('uses visitor bubble surface for user role', () => {
    render(<ChatMessageBubble role="user" content="hi" />);
    const bubble = screen.getByTestId('chat-bubble');
    expect(bubble).toHaveAttribute('data-role', 'user');
  });

  it('renders agent role with copy action by default', () => {
    render(<ChatMessageBubble role="agent" content="hello **you**" />);
    expect(screen.getByTestId('chat-bubble-copy')).toBeInTheDocument();
    // markdown compiled
    expect(screen.getByText('you').tagName).toBe('STRONG');
  });

  it('renders streaming path with caret when isStreaming', () => {
    render(<ChatMessageBubble role="agent" content="partial" isStreaming />);
    expect(screen.getByTestId('stream-caret')).toBeInTheDocument();
    // Actions are hidden while streaming.
    expect(screen.queryByTestId('chat-bubble-copy')).toBeNull();
  });

  it('invokes onRegenerate when button clicked', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessageBubble role="agent" content="x" onRegenerate={spy} />,
    );
    await user.click(screen.getByTestId('chat-bubble-regenerate'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('shows error banner with alert role', () => {
    render(
      <ChatMessageBubble role="agent" content="x" errorMessage="timeout" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('timeout');
  });

  it('system role centers and hides actions', () => {
    render(<ChatMessageBubble role="system" content="joined" />);
    expect(screen.getByTestId('chat-bubble')).toHaveAttribute(
      'data-role',
      'system',
    );
    expect(screen.queryByTestId('chat-bubble-copy')).toBeNull();
  });
});
