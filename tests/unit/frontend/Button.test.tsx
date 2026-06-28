import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '@/components/ui/Button';

describe('Button', () => {
  describe('rendering', () => {
    it('should render children text', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should render as a button element', () => {
      render(<Button>Test</Button>);
      const btn = screen.getByRole('button');
      expect(btn.tagName).toBe('BUTTON');
    });
  });

  describe('variants', () => {
    it('should apply primary variant styles by default', () => {
      render(<Button>Primary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.background).toBe('var(--color-red)');
      expect(btn.style.color).toBe('var(--color-white)');
    });

    it('should apply secondary variant styles', () => {
      render(<Button variant="secondary">Secondary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.background).toBe('var(--color-white)');
      expect(btn.style.color).toBe('var(--color-gray-800)');
      expect(btn.style.border).toBe('1px solid var(--color-gray-border)');
    });

    it('should apply ghost variant styles', () => {
      render(<Button variant="ghost">Ghost</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.background).toBe('transparent');
      // border: 'none' is parsed by jsdom into border-style: none
      expect(btn.style.borderStyle).toBe('none');
    });
  });

  describe('sizes', () => {
    it('should default to lg size', () => {
      render(<Button>Large</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.height).toBe('var(--btn-height-primary)');
      expect(btn.style.fontSize).toBe('var(--text-xl)');
    });

    it('should apply sm size styles', () => {
      render(<Button size="sm">Small</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.height).toBe('36px');
      expect(btn.style.fontSize).toBe('var(--text-md)');
    });

    it('should apply md size styles', () => {
      render(<Button size="md">Medium</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.height).toBe('var(--btn-height-outline)');
      expect(btn.style.fontSize).toBe('var(--text-lg)');
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
    });

    it('should apply reduced opacity when disabled', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.opacity).toBe('0.5');
    });

    it('should set cursor to not-allowed when disabled', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.cursor).toBe('not-allowed');
    });

    it('should not be disabled by default', () => {
      render(<Button>Enabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn).not.toBeDisabled();
      expect(btn.style.opacity).toBe('1');
      expect(btn.style.cursor).toBe('pointer');
    });
  });

  describe('click handler', () => {
    it('should call onClick when clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(<Button onClick={handleClick}>Click</Button>);
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(
        <Button onClick={handleClick} disabled>
          Click
        </Button>
      );
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('custom style', () => {
    it('should merge custom style with base styles', () => {
      render(<Button style={{ marginTop: '10px' }}>Styled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.marginTop).toBe('10px');
      // Base styles should still be applied
      expect(btn.style.display).toBe('flex');
    });

    it('should keep base background when custom style passes undefined', () => {
      render(<Button style={{ background: undefined }}>Styled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.style.background).toBe('var(--color-red)');
      expect(btn.style.color).toBe('var(--color-white)');
    });
  });

  describe('HTML attributes passthrough', () => {
    it('should pass through type attribute', () => {
      render(<Button type="submit">Submit</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('type', 'submit');
    });

    it('should pass through aria attributes', () => {
      render(<Button aria-label="Close dialog">X</Button>);
      const btn = screen.getByRole('button', { name: 'Close dialog' });
      expect(btn).toBeInTheDocument();
    });
  });
});
