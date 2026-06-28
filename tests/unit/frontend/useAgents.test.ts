/**
 * Unit tests for useAgents hook.
 * Tests fetching all agents for the authenticated user.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─── Mock useAuth ──────────────────────────────────────────────────

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock Supabase Client ──────────────────────────────────────────

const mockOrder = vi.fn();
const mockSelect = vi.fn(() => ({ order: mockOrder }));

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    from: () => ({ select: mockSelect }),
  }),
}));

import { useAgents } from '@/hooks/useAgents';

describe('useAgents', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  const mockAgentsData = [
    {
      id: 'agent-1',
      owner_id: 'user-123',
      display_name: 'Agent One',
      avatar_url: null,
      status: 'active',
      system_prompt: null,
      created_at: '2026-03-15T00:00:00Z',
    },
    {
      id: 'agent-2',
      owner_id: 'user-123',
      display_name: 'Agent Two',
      avatar_url: 'https://example.com/avatar.png',
      status: 'active',
      system_prompt: 'Hello',
      created_at: '2026-03-14T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading true when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useAgents());

    expect(result.current.loading).toBe(true);
    expect(result.current.agents).toEqual([]);
  });

  it('should return empty agents when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch agents for authenticated user', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockAgentsData, error: null });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual(mockAgentsData);
    expect(result.current.error).toBeNull();
  });

  it('should set error when fetch fails', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Fetch error' } });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBe('Fetch error');
  });

  it('should handle null data as empty array', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual([]);
  });

  it('should refetch agents when refetch is called', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockAgentsData, error: null });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockOrder.mockResolvedValue({ data: [mockAgentsData[0]], error: null });

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.agents).toHaveLength(1);
    });
  });
});
