/**
 * Unit tests for the generic Dialog primitive used by the dashboard agents
 * management flow. Covers open/closed states, ESC/overlay close, and
 * body-overflow locking.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dialog from '@/components/ui/Dialog';

describe('Dialog', () => {
  it('renders nothing when open is false', () => {
    render(
      <Dialog open={false} onClose={() => undefined} title="Hidden">
        <span>content</span>
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders title, content, and close button when open', () => {
    render(
      <Dialog open onClose={() => undefined} title="Visible">
        <button>Inner</button>
      </Dialog>
    );
    expect(screen.getByRole('dialog', { name: 'Visible' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Visible' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inner' })).toBeInTheDocument();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on ESC when closeOnEsc is default', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on ESC when closeOnEsc=false', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T" closeOnEsc={false}>
        <span />
      </Dialog>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fires onClose when overlay is clicked but not when card is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <button>Inner</button>
      </Dialog>
    );

    // clicking the inner button should NOT close (stopPropagation on card)
    fireEvent.click(screen.getByRole('button', { name: 'Inner' }));
    expect(onClose).not.toHaveBeenCalled();

    // Dialog renders overlay as parent of the card; .parentElement of the
    // dialog role is the overlay. Clicking it closes.
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on overlay click when closeOnOverlay=false', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T" closeOnOverlay={false}>
        <span />
      </Dialog>
    );
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the close button when hideCloseButton is set', () => {
    render(
      <Dialog open onClose={() => undefined} title="T" hideCloseButton>
        <span />
      </Dialog>
    );
    expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull();
  });

  it('locks document.body overflow while open and restores on close', () => {
    const { rerender, unmount } = render(
      <Dialog open={false} onClose={() => undefined} title="T">
        <span />
      </Dialog>
    );
    expect(document.body.style.overflow).not.toBe('hidden');

    rerender(
      <Dialog open onClose={() => undefined} title="T">
        <span />
      </Dialog>
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
