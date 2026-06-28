import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatComposer from './ChatComposer';

describe('ChatComposer', () => {
  it('disables send until text entered', () => {
    render(<ChatComposer onSend={() => {}} />);
    expect(screen.getByTestId('chat-composer-send')).toBeDisabled();
  });

  it('sends trimmed value on Enter', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={spy} />);
    const input = screen.getByTestId('chat-composer-input');
    await user.type(input, '  hello  ');
    await user.keyboard('{Enter}');
    expect(spy).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('');
  });

  it('inserts newline on Shift+Enter', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={spy} />);
    const input = screen.getByTestId('chat-composer-input');
    await user.type(input, 'line1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(input, 'line2');
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue('line1\nline2');
  });

  it('morphs send button into stop while streaming and fires onStop', async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={() => {}} onStop={onStop} isStreaming />);
    const btn = screen.getByTestId('chat-composer-send');
    expect(btn).toHaveAttribute('aria-label', '停止生成');
    await user.click(btn);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('does not send when disabled', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={spy} disabled />);
    const input = screen.getByTestId('chat-composer-input');
    expect(input).toBeDisabled();
    await user.click(screen.getByTestId('chat-composer-send'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows regenerate when handler provided and not streaming', async () => {
    const onRegen = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={() => {}} onRegenerate={onRegen} />);
    await user.click(screen.getByTestId('chat-composer-regenerate'));
    expect(onRegen).toHaveBeenCalledOnce();
  });
});
