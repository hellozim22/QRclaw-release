/**
 * Unit tests for useConversations hook.
 * Tests conversation list fetching with join queries and fallback.
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

import { useConversations } from '@/hooks/useConversations';

describe('useConversations', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  const mockConversationsData = [
    {
      id: 'conv-1',
      qr_code_id: 'qr-1',
      visitor_session_token: 'sess-abc',
      started_at: '2026-03-15T10:00:00Z',
      last_message_at: '2026-03-15T11:00:00Z',
      qr_codes: { label: 'My QR', agent_id: 'agent-1' },
      agents: { display_name: 'Agent One', avatar_url: null },
    },
    {
      id: 'conv-2',
      qr_code_id: 'qr-2',
      visitor_session_token: 'sess-def',
      started_at: '2026-03-14T10:00:00Z',
      last_message_at: null,
      qr_codes: { label: 'Other QR', agent_id: 'agent-2' },
      agents: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading true when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useConversations());

    expect(result.current.loading).toBe(true);
    expect(result.current.conversations).toEqual([]);
  });

  it('should return empty conversations when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch conversations with join query', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockConversationsData, error: null });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual(mockConversationsData);
    expect(result.current.error).toBeNull();
  });

  it('should fall back to simple query when join fails', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });

    const simpleData = [
      {
        id: 'conv-1',
        qr_code_id: 'qr-1',
        visitor_session_token: 'sess-abc',
        started_at: '2026-03-15T10:00:00Z',
        last_message_at: '2026-03-15T11:00:00Z',
        qr_codes: { label: 'My QR', agent_id: 'agent-1' },
        agents: null,
      },
    ];

    // First call (complex join) fails, second call (simple) succeeds
    mockOrder
      .mockResolvedValueOnce({ data: null, error: { message: 'Join failed' } })
      .mockResolvedValueOnce({ data: simpleData, error: null });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual(simpleData);
    expect(result.current.error).toBeNull();
  });

  it('should set error when both queries fail', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });

    mockOrder
      .mockResolvedValueOnce({ data: null, error: { message: 'Join failed' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'Simple query also failed' } });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBe('Simple query also failed');
  });

  it('should handle null data as empty array', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual([]);
  });

  it('should refetch conversations', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockConversationsData, error: null });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toHaveLength(2);

    mockOrder.mockResolvedValue({ data: [mockConversationsData[0]], error: null });
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });
  });
});
