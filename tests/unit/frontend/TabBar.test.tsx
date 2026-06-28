import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabBar from '@/components/ui/TabBar';

describe('TabBar', () => {
  describe('rendering', () => {
    it('should render Messages and Me tabs', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('Me')).toBeInTheDocument();
    });

    it('should render two tab buttons', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('should render icons for both tabs', () => {
      const onTabChange = vi.fn();
      const { container } = render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBe(2);
    });
  });

  describe('active tab', () => {
    it('should highlight Messages tab when activeTab is messages', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      const messagesLabel = screen.getByText('Messages');
      expect(messagesLabel.style.color).toBe('var(--color-red)');
    });

    it('should highlight Me tab when activeTab is me', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="me" onTabChange={onTabChange} />);
      const meLabel = screen.getByText('Me');
      expect(meLabel.style.color).toBe('var(--color-red)');
    });

    it('should dim inactive tab', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      const meLabel = screen.getByText('Me');
      expect(meLabel.style.color).toBe('var(--color-gray-500)');
    });
  });

  describe('navigation', () => {
    it('should call onTabChange with "messages" when Messages tab is clicked', async () => {
      const onTabChange = vi.fn();
      const user = userEvent.setup();
      render(<TabBar activeTab="me" onTabChange={onTabChange} />);
      await user.click(screen.getByText('Messages'));
      expect(onTabChange).toHaveBeenCalledWith('messages');
    });

    it('should call onTabChange with "me" when Me tab is clicked', async () => {
      const onTabChange = vi.fn();
      const user = userEvent.setup();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      await user.click(screen.getByText('Me'));
      expect(onTabChange).toHaveBeenCalledWith('me');
    });

    it('should still call onTabChange when clicking already active tab', async () => {
      const onTabChange = vi.fn();
      const user = userEvent.setup();
      render(<TabBar activeTab="messages" onTabChange={onTabChange} />);
      await user.click(screen.getByText('Messages'));
      expect(onTabChange).toHaveBeenCalledWith('messages');
    });
  });
});
