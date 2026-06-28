/**
 * Unit tests for useQRCodes hook.
 * Tests QR code list fetching for authenticated user.
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
const mockNeq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ neq: mockNeq }));

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    from: () => ({ select: mockSelect }),
  }),
}));

import { useQRCodes } from '@/hooks/useQRCodes';

describe('useQRCodes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  const mockQRCodesData = [
    {
      id: 'qr-1',
      agent_id: 'agent-1',
      owner_id: 'user-123',
      label: 'My QR Code',
      status: 'active',
      scan_count: 42,
      created_at: '2026-03-15T00:00:00Z',
      agents: { display_name: 'Agent One', avatar_url: null },
    },
    {
      id: 'qr-2',
      agent_id: 'agent-2',
      owner_id: 'user-123',
      label: 'Another QR',
      status: 'paused',
      scan_count: 10,
      created_at: '2026-03-14T00:00:00Z',
      agents: { display_name: 'Agent Two', avatar_url: 'https://example.com/a.png' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading true when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useQRCodes());

    expect(result.current.loading).toBe(true);
    expect(result.current.qrcodes).toEqual([]);
  });

  it('should return empty qrcodes when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.qrcodes).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch QR codes for authenticated user', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockQRCodesData, error: null });

    const { result } = renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.qrcodes).toEqual(mockQRCodesData);
    expect(result.current.error).toBeNull();
  });

  it('should filter out deleted QR codes via neq', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockQRCodesData, error: null });

    renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(mockNeq).toHaveBeenCalledWith('status', 'revoked');
    });
  });

  it('should set error when fetch fails', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });

    const { result } = renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.qrcodes).toEqual([]);
    expect(result.current.error).toBe('Permission denied');
  });

  it('should handle null data as empty array', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.qrcodes).toEqual([]);
  });

  it('should support refetch', async () => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockOrder.mockResolvedValue({ data: mockQRCodesData, error: null });

    const { result } = renderHook(() => useQRCodes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockOrder.mockResolvedValue({ data: [mockQRCodesData[0]], error: null });
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.qrcodes).toHaveLength(1);
    });
  });
});
