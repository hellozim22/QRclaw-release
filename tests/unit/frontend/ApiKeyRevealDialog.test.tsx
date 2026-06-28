/**
 * Unit tests for ApiKeyRevealDialog — specifically the "must check before close"
 * logic that guards against accidental dismissal of the one-time plaintext key.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApiKeyRevealDialog from '@/app/(dashboard)/settings/agents/ApiKeyRevealDialog';

describe('ApiKeyRevealDialog', () => {
  beforeEach(() => {
    // jsdom doesn't ship clipboard; stub a no-op.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('shows the key in monospace and renders a copy button', () => {
    render(
      <ApiKeyRevealDialog
        open
        agentName="Bot A"
        apiKey="sk_live_abcdef"
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('sk_live_abcdef')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy api key to clipboard/i })).toBeInTheDocument();
  });

  it('disables the close button until the acknowledgement checkbox is ticked', () => {
    const onClose = vi.fn();
    render(<ApiKeyRevealDialog open agentName="Bot A" apiKey="sk_live_x" onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();

    const checkbox = screen.getByRole('checkbox', { name: /confirm you have saved/i });
    fireEvent.click(checkbox);

    expect(closeBtn).not.toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on ESC or overlay click (must confirm explicitly)', () => {
    const onClose = vi.fn();
    render(<ApiKeyRevealDialog open agentName="Bot A" apiKey="sk_live_x" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(overlay);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('writes the key to clipboard and does not echo to console', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    render(
      <ApiKeyRevealDialog
        open
        agentName="Bot A"
        apiKey="sk_live_secret"
        onClose={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /copy api key to clipboard/i }));

    // allow the promise to resolve
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('sk_live_secret');
    // ensure the plaintext wasn't logged anywhere
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('sk_live_secret');
    logSpy.mockRestore();
  });
});
