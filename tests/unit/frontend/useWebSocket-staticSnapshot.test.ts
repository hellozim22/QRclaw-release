/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ChatMessage } from '@/types/chat';

const { mockLoadHistory, mockSetConnectionStatus, mockReset, mockAddMessage, WSClientMock } =
  vi.hoisted(() => ({
    mockLoadHistory: vi.fn(),
    mockSetConnectionStatus: vi.fn(),
    mockReset: vi.fn(),
    mockAddMessage: vi.fn(),
    WSClientMock: vi.fn(),
  }));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn(() => ({
    connectionStatus: 'disconnected',
    addMessage: mockAddMessage,
    updateMessageStatus: vi.fn(),
    loadHistory: mockLoadHistory,
    startStream: vi.fn(),
    appendStreamDelta: vi.fn(),
    endStream: vi.fn(),
    setConnectionStatus: mockSetConnectionStatus,
    reset: mockReset,
  })),
}));

vi.mock('@/lib/ws/client', () => ({
  WSClient: WSClientMock,
}));

vi.mock('@/lib/ws/ticket', () => ({
  fetchVisitorTicket: vi.fn(),
}));

vi.mock('@/lib/ws/history', () => ({
  fetchMessageHistory: vi.fn(),
}));

import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchVisitorTicket } from '@/lib/ws/ticket';

describe('useWebSocket staticSnapshotMessages', () => {
  const staticMessages: ChatMessage[] = [
    {
      id: 's1',
      content: 'hello',
      contentType: 'text',
      senderType: 'agent',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 'delivered',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    WSClientMock.mockImplementation(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
    }));
  });

  it('skips WebSocket when staticSnapshotMessages is non-empty', () => {
    renderHook(() =>
      useWebSocket({
        agentId: 'agent-1',
        qrCodeId: 'qr-1',
        staticSnapshotMessages: staticMessages,
      })
    );

    expect(WSClientMock).not.toHaveBeenCalled();
  });

  it('empty staticSnapshotMessages [] does not use static branch; attempts normal WebSocket path', async () => {
    vi.mocked(fetchVisitorTicket).mockResolvedValue({
      ticket: 't1',
      sessionToken: 'sess-1',
    });

    const { result } = renderHook(() =>
      useWebSocket({
        agentId: 'agent-1',
        qrCodeId: 'qr-99',
        staticSnapshotMessages: [],
      })
    );

    expect(result.current.isStaticSnapshot).toBe(false);

    await waitFor(() => {
      expect(WSClientMock).toHaveBeenCalled();
    });

    expect(mockLoadHistory).not.toHaveBeenCalled();
  });

  it('returns isStaticSnapshot true', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        agentId: 'agent-1',
        qrCodeId: null,
        staticSnapshotMessages: staticMessages,
      })
    );

    expect(result.current.isStaticSnapshot).toBe(true);
  });

  it('calls loadHistory with static messages and sets connected', async () => {
    renderHook(() =>
      useWebSocket({
        agentId: 'agent-1',
        qrCodeId: null,
        staticSnapshotMessages: staticMessages,
      })
    );

    await waitFor(() => {
      expect(mockLoadHistory).toHaveBeenCalledWith(staticMessages);
    });
    expect(mockReset).toHaveBeenCalled();
    expect(mockSetConnectionStatus).toHaveBeenCalledWith('connected');
  });

  it('sendMessage does not throw when client is absent', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        agentId: 'agent-1',
        qrCodeId: null,
        staticSnapshotMessages: staticMessages,
      })
    );

    expect(() => {
      act(() => {
        result.current.sendMessage('x');
      });
    }).not.toThrow();

    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});
