import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from '@/components/ui/Avatar';

describe('Avatar', () => {
  describe('with image source', () => {
    it('should render an image when src is provided', () => {
      render(<Avatar src="/avatar.png" alt="John Doe" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/avatar.png');
      expect(img).toHaveAttribute('alt', 'John Doe');
    });

    it('should apply correct size to image', () => {
      render(<Avatar src="/avatar.png" alt="Test" size={48} />);
      const img = screen.getByRole('img');
      expect(img.style.width).toBe('48px');
      expect(img.style.height).toBe('48px');
    });
  });

  describe('agent variant', () => {
    it('should default to agent variant', () => {
      render(<Avatar alt="Bot" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/qrclaw-logo-icon.png');
      expect(img).toHaveAttribute('alt', 'Bot');
    });

    it('should use logo and alt for agent without src', () => {
      render(<Avatar alt="MyAgent" variant="agent" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/qrclaw-logo-icon.png');
      expect(img).toHaveAttribute('alt', 'MyAgent');
    });

    it('should use default alt when alt is empty', () => {
      render(<Avatar alt="" variant="agent" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'QRClaw');
    });

    it('should use default alt when alt is not provided', () => {
      render(<Avatar variant="agent" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'QRClaw');
    });
  });

  describe('user variant', () => {
    it('should show User icon when no src and no initials', () => {
      const { container } = render(<Avatar variant="user" />);
      // lucide-react renders an SVG with class "lucide-user"
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should show initials when provided', () => {
      render(<Avatar variant="user" initials="JD" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should render image when src is provided for user variant', () => {
      render(<Avatar variant="user" src="/user.png" alt="User" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/user.png');
    });
  });

  describe('sizes', () => {
    it('should default to size 36', () => {
      const { container } = render(<Avatar variant="user" />);
      // User variant without src renders a container div
      const svg = container.querySelector('svg');
      const containerDiv = svg?.parentElement;
      expect(containerDiv?.style.width).toBe('36px');
      expect(containerDiv?.style.height).toBe('36px');
    });

    it('should apply custom size', () => {
      const { container } = render(<Avatar variant="user" size={64} />);
      const svg = container.querySelector('svg');
      const containerDiv = svg?.parentElement;
      expect(containerDiv?.style.width).toBe('64px');
      expect(containerDiv?.style.height).toBe('64px');
    });

    it('should use larger border radius for size > 40', () => {
      const { container } = render(<Avatar variant="user" size={48} />);
      const svg = container.querySelector('svg');
      const containerDiv = svg?.parentElement;
      expect(containerDiv?.style.borderRadius).toBe('var(--radius-xl)');
    });

    it('should use small border radius for size <= 40', () => {
      const { container } = render(<Avatar variant="user" size={36} />);
      const svg = container.querySelector('svg');
      const containerDiv = svg?.parentElement;
      expect(containerDiv?.style.borderRadius).toBe('var(--radius-sm)');
    });
  });

  describe('initials font size', () => {
    it('should scale initials font size to 40% of avatar size', () => {
      render(<Avatar variant="user" initials="AB" size={50} />);
      const initialsEl = screen.getByText('AB');
      expect(initialsEl.style.fontSize).toBe('20px');
    });
  });
});
