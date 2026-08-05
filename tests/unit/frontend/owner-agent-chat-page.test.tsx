import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadAgents = vi.hoisted(() => vi.fn());
const mockEnsureOwnerWsSubscription = vi.hoisted(() => vi.fn());
const mockStopStream = vi.hoisted(() => vi.fn());
const mockOwnerAssistantThread = vi.hoisted(() => vi.fn());
const mockStoreState = vi.hoisted(() => ({
  agents: [] as any[],
  selectedAgentId: null as string | null,
  messagesByAgent: {} as Record<string, any[]>,
  statusByAgent: {} as Record<string, string>,
}));

vi.mock('@/stores/owner-agent-chat-store', () => ({
  ensureOwnerWsSubscription: mockEnsureOwnerWsSubscription,
  useOwnerAgentChatStore: () => ({
    ...mockStoreState,
    loadAgents: mockLoadAgents,
    selectAgent: vi.fn(),
    sendMessage: vi.fn(),
    stopStream: mockStopStream,
    resetContext: vi.fn(),
  }),
}));

vi.mock('@/components/chat/OwnerAssistantThread', () => ({
  default: (props: any) => {
    mockOwnerAssistantThread(props);
    return <div data-testid="owner-assistant-thread">{props.agentName}</div>;
  },
}));

import ChatPage from '@/app/(dashboard)/chat/page';

describe('dashboard owner chat page', () => {
  beforeEach(() => {
    mockLoadAgents.mockReset();
    mockEnsureOwnerWsSubscription.mockReset();
    mockEnsureOwnerWsSubscription.mockResolvedValue(undefined);
    mockStopStream.mockReset();
    mockOwnerAssistantThread.mockReset();
    mockStoreState.agents = [];
    mockStoreState.selectedAgentId = null;
    mockStoreState.messagesByAgent = {};
    mockStoreState.statusByAgent = {};
  });

  it('opens the owner WebSocket subscription when mounted', async () => {
    render(<ChatPage />);

    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalledTimes(1);
      expect(mockEnsureOwnerWsSubscription).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the selected agent conversation through assistant-ui', () => {
    mockStoreState.agents = [
      {
        id: 'agent-a',
        name: 'Agent A',
        avatar_url: null,
        description: null,
        backend_provider: 'claude',
        backend_source: 'local',
        execution_mode: 'standard',
        status: 'active',
        runtime_id: null,
        runtime_status: null,
        is_default: false,
        source: 'user_created',
        last_active_at: null,
        created_at: '2026-04-27T00:00:00Z',
      },
    ];
    mockStoreState.selectedAgentId = 'agent-a';
    mockStoreState.statusByAgent = { 'agent-a': 'online' };
    mockStoreState.messagesByAgent = {
      'agent-a': [
        {
          id: 'owner-1',
          sender_type: 'owner',
          content: '**literal owner**',
          status: 'sent',
          created_at: '2026-04-27T00:00:00Z',
        },
        {
          id: 'agent-1',
          sender_type: 'agent',
          content: '**bold reply**\n\n- streamed item',
          status: 'sent',
          created_at: '2026-04-27T00:00:01Z',
        },
      ],
    };

    render(<ChatPage />);

    expect(screen.getByTestId('owner-assistant-thread')).toHaveTextContent('Agent A');
    expect(mockOwnerAssistantThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-a',
        agentName: 'Agent A',
        canSend: true,
        isRunning: false,
        messages: mockStoreState.messagesByAgent['agent-a'],
      })
    );
  });

  it('allows the running stream to be stopped from the chat panel', () => {
    mockStoreState.agents = [
      {
        id: 'agent-a',
        name: 'Agent A',
        avatar_url: null,
        description: null,
        backend_provider: 'claude',
        backend_source: 'local',
        execution_mode: 'standard',
        status: 'active',
        runtime_id: null,
        runtime_status: null,
        is_default: false,
        source: 'user_created',
        last_active_at: null,
        created_at: '2026-04-27T00:00:00Z',
      },
    ];
    mockStoreState.selectedAgentId = 'agent-a';
    mockStoreState.statusByAgent = { 'agent-a': 'running' };
    mockStoreState.messagesByAgent = {
      'agent-a': [
        {
          id: 'agent-streaming',
          sender_type: 'agent',
          content: 'partial',
          status: 'streaming',
          created_at: '2026-04-27T00:00:01Z',
        },
      ],
    };

    render(<ChatPage />);
    const props = mockOwnerAssistantThread.mock.calls.at(-1)?.[0];
    props.onStop();

    expect(mockStopStream).toHaveBeenCalledWith('agent-a');
  });
});
