import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInputBar from '@/components/chat/ChatInputBar';

describe('ChatInputBar', () => {
  describe('rendering', () => {
    it('should render input with placeholder', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} />);
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should render as a form element', () => {
      const onSend = vi.fn();
      const { container } = render(<ChatInputBar onSend={onSend} />);
      expect(container.querySelector('form')).toBeInTheDocument();
    });

    it('should render arrow icon inside button', () => {
      const onSend = vi.fn();
      const { container } = render(<ChatInputBar onSend={onSend} />);
      const svg = container.querySelector('button svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('input handling', () => {
    it('should update input value on typing', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello');
      expect(input).toHaveValue('Hello');
    });

    it('should clear input after sending', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello');
      await user.click(screen.getByRole('button'));
      expect(input).toHaveValue('');
    });
  });

  describe('send behavior', () => {
    it('should call onSend with trimmed message on button click', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '  Hello  ');
      await user.click(screen.getByRole('button'));
      expect(onSend).toHaveBeenCalledWith('Hello');
    });

    it('should call onSend on Enter key press', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello{Enter}');
      expect(onSend).toHaveBeenCalledWith('Hello');
    });

    it('should not send empty message', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      await user.click(screen.getByRole('button'));
      expect(onSend).not.toHaveBeenCalled();
    });

    it('should not send whitespace-only message', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '   ');
      await user.click(screen.getByRole('button'));
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should disable input when disabled prop is true', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} disabled />);
      expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
    });

    it('should disable submit button when disabled', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} disabled />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should not send message when disabled', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} disabled />);
      await user.click(screen.getByRole('button'));
      expect(onSend).not.toHaveBeenCalled();
    });

    it('should not be disabled by default', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} />);
      expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
    });
  });

  describe('send button appearance', () => {
    it('should have reduced opacity when input is empty', () => {
      const onSend = vi.fn();
      render(<ChatInputBar onSend={onSend} />);
      const button = screen.getByRole('button');
      expect(button.style.opacity).toBe('0.5');
    });

    it('should have full opacity when input has content', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatInputBar onSend={onSend} />);
      await user.type(screen.getByPlaceholderText('Type a message...'), 'Hi');
      const button = screen.getByRole('button');
      expect(button.style.opacity).toBe('1');
    });
  });
});
