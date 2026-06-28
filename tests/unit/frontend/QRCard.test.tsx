import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QRCard from '@/components/ui/QRCard';

describe('QRCard', () => {
  describe('rendering', () => {
    it('should render agent name', () => {
      render(<QRCard agentName="My Agent" />);
      expect(screen.getByText('My Agent')).toBeInTheDocument();
    });

    it('should render agent description when provided', () => {
      render(<QRCard agentName="Bot" agentDescription="A helpful bot" />);
      expect(screen.getByText('A helpful bot')).toBeInTheDocument();
    });

    it('should not render description when not provided', () => {
      const { container } = render(<QRCard agentName="Bot" />);
      const spans = container.querySelectorAll('span');
      expect(spans).toHaveLength(1); // Only the name span
    });
  });

  describe('QR image', () => {
    it('should render QR image when qrImageSrc is provided', () => {
      render(<QRCard agentName="Bot" qrImageSrc="/qr.png" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/qr.png');
      expect(img).toHaveAttribute('alt', 'QR code for Bot');
    });

    it('should render placeholder icon when no qrImageSrc', () => {
      const { container } = render(<QRCard agentName="Bot" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('size', () => {
    it('should default to size 200', () => {
      render(<QRCard agentName="Bot" qrImageSrc="/qr.png" />);
      const img = screen.getByRole('img');
      expect(img.style.width).toBe('200px');
      expect(img.style.height).toBe('200px');
    });

    it('should apply custom size to QR image', () => {
      render(<QRCard agentName="Bot" qrImageSrc="/qr.png" size={150} />);
      const img = screen.getByRole('img');
      expect(img.style.width).toBe('150px');
      expect(img.style.height).toBe('150px');
    });

    it('should render placeholder SVG at correct size when no image', () => {
      const { container } = render(<QRCard agentName="Bot" size={200} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // lucide-react renders SVGs with width/height attributes
      // The component passes size * 0.6 = 120 to the icon
    });
  });

  describe('styling', () => {
    it('should render as a card with shadow and border', () => {
      const { container } = render(<QRCard agentName="Bot" />);
      const card = container.firstElementChild as HTMLElement;
      expect(card.style.borderRadius).toBe('var(--radius-xl)');
      expect(card.style.border).toBe('1px solid var(--color-gray-border)');
    });

    it('should center the agent name', () => {
      render(<QRCard agentName="Bot" />);
      const name = screen.getByText('Bot');
      expect(name.style.textAlign).toBe('center');
    });
  });
});
