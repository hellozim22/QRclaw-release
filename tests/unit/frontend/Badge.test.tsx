import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '@/components/ui/Badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('should render with status text', () => {
      render(<Badge status="online" />);
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should display "Online" for online status', () => {
      render(<Badge status="online" />);
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('should display "Offline" for offline status', () => {
      render(<Badge status="offline" />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('should display "Busy" for busy status', () => {
      render(<Badge status="busy" />);
      expect(screen.getByText('Busy')).toBeInTheDocument();
    });
  });

  describe('custom label', () => {
    it('should display custom label instead of default', () => {
      render(<Badge status="online" label="Available" />);
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.queryByText('Online')).not.toBeInTheDocument();
    });

    it('should show default label when custom label is not provided', () => {
      render(<Badge status="offline" />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('status dot', () => {
    it('should render a colored dot for online status', () => {
      const { container } = render(<Badge status="online" />);
      const dot = container.querySelector('span > span:first-child');
      expect(dot?.style.background).toBe('var(--color-green)');
    });

    it('should render gray dot for offline status', () => {
      const { container } = render(<Badge status="offline" />);
      const dot = container.querySelector('span > span:first-child');
      expect(dot?.style.background).toBe('var(--color-gray-500)');
    });

    it('should render warning dot for busy status', () => {
      const { container } = render(<Badge status="busy" />);
      const dot = container.querySelector('span > span:first-child');
      expect(dot?.style.background).toBe('var(--color-warning)');
    });
  });

  describe('styling', () => {
    it('should render as inline-flex', () => {
      const { container } = render(<Badge status="online" />);
      const badge = container.firstElementChild as HTMLElement;
      expect(badge.style.display).toBe('inline-flex');
    });

    it('should have pill shape (full border radius)', () => {
      const { container } = render(<Badge status="online" />);
      const badge = container.firstElementChild as HTMLElement;
      expect(badge.style.borderRadius).toBe('var(--radius-full)');
    });
  });
});
