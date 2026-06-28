import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from '@/components/ui/TopBar';

describe('TopBar', () => {
  describe('rendering', () => {
    it('should render the title', () => {
      render(<TopBar title="Chat" />);
      expect(screen.getByText('Chat')).toBeInTheDocument();
    });

    it('should center the title text', () => {
      render(<TopBar title="Settings" />);
      const titleEl = screen.getByText('Settings');
      expect(titleEl.style.textAlign).toBe('center');
    });

    it('should truncate long titles with ellipsis', () => {
      render(<TopBar title="Very Long Title That Should Be Truncated" />);
      const titleEl = screen.getByText('Very Long Title That Should Be Truncated');
      expect(titleEl.style.overflow).toBe('hidden');
      expect(titleEl.style.textOverflow).toBe('ellipsis');
      expect(titleEl.style.whiteSpace).toBe('nowrap');
    });
  });

  describe('back button', () => {
    it('should render back icon when onBack is provided', () => {
      const onBack = vi.fn();
      const { container } = render(<TopBar title="Page" onBack={onBack} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should not render back icon when onBack is not provided', () => {
      const { container } = render(<TopBar title="Page" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });

    it('should call onBack when back area is clicked', async () => {
      const onBack = vi.fn();
      const user = userEvent.setup();
      const { container } = render(<TopBar title="Page" onBack={onBack} />);
      const svg = container.querySelector('svg');
      // Click the parent div that has the onClick handler
      await user.click(svg!.parentElement!);
      expect(onBack).toHaveBeenCalledOnce();
    });
  });

  describe('right action', () => {
    it('should render right action when provided', () => {
      render(
        <TopBar title="Page" rightAction={<button data-testid="action-btn">Action</button>} />
      );
      expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    });

    it('should not render right action when not provided', () => {
      render(<TopBar title="Page" />);
      expect(screen.queryByTestId('action-btn')).not.toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should have a bottom border', () => {
      const { container } = render(<TopBar title="Page" />);
      const topBar = container.firstElementChild as HTMLElement;
      expect(topBar.style.borderBottom).toBe('1px solid var(--color-gray-border)');
    });

    it('should have white background', () => {
      const { container } = render(<TopBar title="Page" />);
      const topBar = container.firstElementChild as HTMLElement;
      expect(topBar.style.background).toBe('var(--color-white)');
    });
  });
});
