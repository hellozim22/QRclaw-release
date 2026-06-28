/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureOwnerWsSubscription = vi.hoisted(() => vi.fn());
const mockLoadAgents = vi.hoisted(() => vi.fn());
const mockSelectAgent = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockStopStream = vi.hoisted(() => vi.fn());
const mockResetContext = vi.hoisted(() => vi.fn());

vi.mock('@/stores/owner-agent-chat-store', () => ({
  ensureOwnerWsSubscription: mockEnsureOwnerWsSubscription,
  useOwnerAgentChatStore: () => ({
    agents: [],
    selectedAgentId: null,
    messagesByAgent: {},
    statusByAgent: {},
    loadAgents: mockLoadAgents,
    selectAgent: mockSelectAgent,
    sendMessage: mockSendMessage,
    stopStream: mockStopStream,
    resetContext: mockResetContext,
  }),
}));

import ChatPage from '@/app/(dashboard)/chat/page';

describe('dashboard chat page owner WS subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureOwnerWsSubscription.mockResolvedValue(undefined);
    mockLoadAgents.mockResolvedValue(undefined);
  });

  it('starts the owner WS subscription when the page mounts', async () => {
    render(<ChatPage />);

    await waitFor(() => {
      expect(mockEnsureOwnerWsSubscription).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadAgents).toHaveBeenCalledTimes(1);
  });

  it('warns without blocking the page when owner WS subscription fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('ws down');
    mockEnsureOwnerWsSubscription.mockRejectedValueOnce(error);

    render(<ChatPage />);

    expect(screen.getByText('Set up local runtime')).toBeInTheDocument();
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith('Failed to subscribe owner WS', error);
    });
  });
});
