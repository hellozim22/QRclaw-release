import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from '@/components/ui/Input';

describe('Input', () => {
  describe('rendering', () => {
    it('should render an input element', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with placeholder text', () => {
      render(<Input placeholder="Enter email" />);
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
    });
  });

  describe('label', () => {
    it('should render label when provided', () => {
      render(<Input label="Email" />);
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('should associate label with the input for accessibility', () => {
      render(<Input label="Email" placeholder="Enter email" />);
      expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'Enter email');
    });

    it('should not render label when not provided', () => {
      const { container } = render(<Input />);
      expect(container.querySelector('label')).toBeNull();
    });
  });

  describe('value changes', () => {
    it('should update value on user input', async () => {
      const user = userEvent.setup();
      render(<Input placeholder="Type here" />);
      const input = screen.getByPlaceholderText('Type here');
      await user.type(input, 'hello');
      expect(input).toHaveValue('hello');
    });

    it('should call onChange when typing', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();
      render(<Input onChange={handleChange} placeholder="Type" />);
      await user.type(screen.getByPlaceholderText('Type'), 'a');
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('should display error message when error prop is provided', () => {
      render(<Input error="This field is required" />);
      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('should not display error when not provided', () => {
      const { container } = render(<Input />);
      const spans = container.querySelectorAll('span');
      // No error span should exist
      const errorSpans = Array.from(spans).filter((s) => s.style.color === 'var(--color-red)');
      expect(errorSpans).toHaveLength(0);
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Input disabled placeholder="Disabled" />);
      expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
    });

    it('should not be disabled by default', () => {
      render(<Input placeholder="Enabled" />);
      expect(screen.getByPlaceholderText('Enabled')).not.toBeDisabled();
    });
  });

  describe('focus behavior', () => {
    it('should call onFocus when focused', async () => {
      const handleFocus = vi.fn();
      const user = userEvent.setup();
      render(<Input onFocus={handleFocus} placeholder="Focus me" />);
      await user.click(screen.getByPlaceholderText('Focus me'));
      expect(handleFocus).toHaveBeenCalledOnce();
    });

    it('should call onBlur when blurred', async () => {
      const handleBlur = vi.fn();
      const user = userEvent.setup();
      render(<Input onBlur={handleBlur} placeholder="Blur me" />);
      const input = screen.getByPlaceholderText('Blur me');
      await user.click(input);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledOnce();
    });
  });

  describe('icons', () => {
    it('should render left icon when provided', () => {
      render(<Input iconLeft={<span data-testid="left-icon">L</span>} />);
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('should render right icon when provided', () => {
      render(<Input iconRight={<span data-testid="right-icon">R</span>} />);
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('should not render icon containers when icons are not provided', () => {
      const { container } = render(<Input />);
      expect(container.querySelectorAll('[data-testid]')).toHaveLength(0);
    });
  });

  describe('HTML attributes passthrough', () => {
    it('should pass through type attribute', () => {
      render(<Input type="password" placeholder="Password" />);
      const input = screen.getByPlaceholderText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should pass through name attribute', () => {
      render(<Input name="email" placeholder="Email" />);
      expect(screen.getByPlaceholderText('Email')).toHaveAttribute('name', 'email');
    });
  });
});
