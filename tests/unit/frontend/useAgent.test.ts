/**
 * Unit tests for useAgent hook.
 * Tests fetching a single agent by ID from Supabase.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─── Mock Supabase Client ──────────────────────────────────────────

const mockSingle = vi.fn();
const mockEqAgent = vi.fn(() => ({ single: mockSingle }));
const mockSelectAgent = vi.fn(() => ({ eq: mockEqAgent }));

const mockConvHead = vi.fn();
const mockConvIn = vi.fn(() => mockConvHead());
const mockConvSelect = vi.fn(() => ({ in: mockConvIn }));

const mockQrOrder = vi.fn();
const mockQrQuery = {
  order: mockQrOrder,
};
const mockQrEq = vi.fn(() => mockQrQuery);
const mockQrSelect = vi.fn(() => ({ eq: mockQrEq }));

const mockFrom = vi.fn((table: string) => {
  if (table === 'agents_public') {
    return { select: mockSelectAgent };
  }
  if (table === 'conversations') {
    return { select: mockConvSelect };
  }
  if (table === 'qrcodes') {
    return { select: mockQrSelect };
  }
  return { select: vi.fn() };
});

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

import { useAgent } from '@/hooks/useAgent';

describe('useAgent', () => {
  // agents_public view only exposes: id, name, status, created_at
  const mockAgentData = {
    id: 'agent-123',
    name: 'Test Agent',
    status: 'active',
    created_at: '2026-03-15T00:00:00Z',
  };
  const mockQrcodeRows = [
    { id: 'qr-1', status: 'draft', created_at: '2026-03-14T00:00:00Z', profile: {} },
    { id: 'qr-2', status: 'active', created_at: '2026-03-16T00:00:00Z', profile: {} },
    { id: 'qr-3', status: 'active', created_at: '2026-03-15T00:00:00Z', profile: {} },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockSingle.mockResolvedValue({
      data: mockAgentData,
      error: null,
    });

    mockQrOrder.mockResolvedValue({
      data: mockQrcodeRows,
    });

    mockConvHead.mockResolvedValue({ count: 5 });
  });

  it('should start with loading true', () => {
    const { result } = renderHook(() => useAgent('agent-123'));
    expect(result.current.loading).toBe(true);
    expect(result.current.agent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should fetch agent by ID and include conversation count', async () => {
    const { result } = renderHook(() => useAgent('agent-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent).toEqual({
      ...mockAgentData,
      conversation_count: 5,
      default_qrcode_id: null,
      has_chat_context: false,
      avatar_url: null,
    });
    expect(result.current.error).toBeNull();
  });

  it('should set error when agent fetch fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Agent not found' },
    });

    const { result } = renderHook(() => useAgent('nonexistent'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent).toBeNull();
    expect(result.current.error).toBe('Agent not found');
  });

  it('should handle empty agentId', async () => {
    const { result } = renderHook(() => useAgent(''));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should refetch when refetch is called', async () => {
    const { result } = renderHook(() => useAgent('agent-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Call refetch
    await result.current.refetch();

    // from('agents_public') should have been called twice
    expect(mockFrom).toHaveBeenCalledWith('agents_public');
  });

  it('should handle zero conversation count', async () => {
    mockConvHead.mockResolvedValue({ count: 0 });

    const { result } = renderHook(() => useAgent('agent-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.conversation_count).toBe(0);
  });

  it('should handle null count', async () => {
    mockConvHead.mockResolvedValue({ count: null });

    const { result } = renderHook(() => useAgent('agent-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.conversation_count).toBe(0);
  });

  it('should preserve initial qrCodeId only when it belongs to the current agent', async () => {
    const { result } = renderHook(() => useAgent('agent-123', 'qr-3'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.default_qrcode_id).toBe('qr-3');
  });

  it('should surface avatar_url from the selected qrcode profile', async () => {
    mockQrOrder.mockResolvedValue({
      data: [
        {
          id: 'qr-9',
          status: 'active',
          created_at: '2026-03-18T00:00:00Z',
          profile: { avatar_url: 'https://cdn.example.com/avatar.webp' },
        },
      ],
    });

    const { result } = renderHook(() => useAgent('agent-123', null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.avatar_url).toBe('https://cdn.example.com/avatar.webp');
  });

  it('should keep default_qrcode_id null when multiple active qrcodes exist and route qrCodeId is missing', async () => {
    const { result } = renderHook(() => useAgent('agent-123', null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.default_qrcode_id).toBeNull();
    expect(result.current.agent?.avatar_url).toBeNull();
  });

  it('should keep default_qrcode_id null when the agent has no qrcodes', async () => {
    mockQrOrder.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useAgent('agent-123', null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.default_qrcode_id).toBeNull();
  });

  it('should fall back to the only active qrcode when exactly one active qrcode exists', async () => {
    mockQrOrder.mockResolvedValue({
      data: [
        { id: 'qr-1', status: 'draft', created_at: '2026-03-14T00:00:00Z' },
        { id: 'qr-2', status: 'active', created_at: '2026-03-16T00:00:00Z' },
      ],
    });

    const { result } = renderHook(() => useAgent('agent-123', null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agent?.default_qrcode_id).toBe('qr-2');
  });
});
