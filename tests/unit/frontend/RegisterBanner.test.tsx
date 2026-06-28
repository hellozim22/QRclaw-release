import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterBanner from '@/components/chat/RegisterBanner';

describe('RegisterBanner', () => {
  describe('rendering', () => {
    it('should render banner with signup message', () => {
      render(<RegisterBanner />);
      expect(screen.getByText(/Sign up to save chats/)).toBeInTheDocument();
    });

    it('should render signup link', () => {
      render(<RegisterBanner />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/signup');
    });

    it('should render icons', () => {
      const { container } = render(<RegisterBanner />);
      const svgs = container.querySelectorAll('svg');
      // UserPlus icon + X (close) icon
      expect(svgs.length).toBeGreaterThanOrEqual(1);
    });

    it('should render dismiss button', () => {
      render(<RegisterBanner />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('dismiss behavior', () => {
    it('should hide banner when dismiss button is clicked', async () => {
      const user = userEvent.setup();
      render(<RegisterBanner />);

      // Banner should be visible
      expect(screen.getByText(/Sign up to save chats/)).toBeInTheDocument();

      // Click dismiss
      await user.click(screen.getByRole('button'));

      // Banner should be gone
      expect(screen.queryByText(/Sign up to save chats/)).not.toBeInTheDocument();
    });

    it('should remove the entire banner from DOM after dismiss', async () => {
      const user = userEvent.setup();
      const { container } = render(<RegisterBanner />);

      await user.click(screen.getByRole('button'));

      // Container should be empty (returns null)
      expect(container.firstElementChild).toBeNull();
    });
  });

  describe('signup link', () => {
    it('should have correct href to signup page', () => {
      render(<RegisterBanner />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/signup');
    });

    it('should have no text decoration', () => {
      render(<RegisterBanner />);
      const link = screen.getByRole('link');
      expect(link.style.textDecoration).toBe('none');
    });
  });

  describe('styling', () => {
    it('should render with light red background', () => {
      const { container } = render(<RegisterBanner />);
      const banner = container.firstElementChild as HTMLElement;
      expect(banner.style.background).toBe('var(--color-red-bg)');
    });

    it('should have fixed height', () => {
      const { container } = render(<RegisterBanner />);
      const banner = container.firstElementChild as HTMLElement;
      expect(banner.style.height).toBe('44px');
    });
  });
});
