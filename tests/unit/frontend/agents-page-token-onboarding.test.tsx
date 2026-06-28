import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadAgents = vi.hoisted(() => vi.fn());
const mockCreateAgent = vi.hoisted(() => vi.fn());
const mockCreateHostToken = vi.hoisted(() => vi.fn());

vi.mock('@/stores/owner-agent-chat-store', () => ({
  useOwnerAgentChatStore: () => ({
    agents: [],
    statusByAgent: {},
    loading: false,
    loadAgents: mockLoadAgents,
    createAgent: mockCreateAgent,
    createHostToken: mockCreateHostToken,
  }),
}));

import AgentsPage from '@/app/(dashboard)/agents/page';

describe('dashboard agents page token onboarding', () => {
  beforeEach(() => {
    mockLoadAgents.mockReset();
    mockLoadAgents.mockResolvedValue(undefined);
    mockCreateAgent.mockReset();
    mockCreateAgent.mockResolvedValue({
      id: 'agent-1',
      name: '产品助手',
      description: null,
      avatar_url: null,
      backend_provider: 'openclaw',
      backend_source: 'local',
      execution_mode: 'standard',
      status: 'active',
      runtime_id: null,
      runtime_status: 'online',
      is_default: false,
      source: 'user_created',
      last_active_at: null,
      created_at: '2026-06-23T00:00:00.000Z',
    });
    mockCreateHostToken.mockReset();
    mockCreateHostToken.mockResolvedValue({ token: 'qrclaw_host_test_token' });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('creates an agent from the simplified form without host token onboarding', async () => {
    render(<AgentsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '产品助手' },
    });
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: '负责分析商品价格。\n输出要简洁。' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: '产品助手',
        backend_provider: 'openclaw',
        backend_source: 'local',
        description: '负责分析商品价格。',
        instructions: '负责分析商品价格。\n输出要简洁。',
      }));
    });

    expect(mockCreateHostToken).not.toHaveBeenCalled();
    expect(screen.queryByText(/复制 token|下载 .qrclaw-host/)).not.toBeInTheDocument();
  });
});
