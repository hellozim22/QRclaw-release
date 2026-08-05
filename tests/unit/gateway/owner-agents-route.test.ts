import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  ensureDefaultAgents: vi.fn(),
  getOwnerByUserId: vi.fn(),
  listOwnerAgents: vi.fn(),
}));

vi.mock('../../../gateway/src/db/owner-agent-chat.js', () => ({
  getOwnerByUserId: mocks.getOwnerByUserId,
}));

vi.mock('../../../gateway/src/services/default-owner-agents.js', () => ({
  ensureDefaultAgents: mocks.ensureDefaultAgents,
}));

vi.mock('../../../gateway/src/services/owner-agent-chat.js', () => ({
  createOwnerAgent: vi.fn(),
  listOwnerAgents: mocks.listOwnerAgents,
  OwnerAgentChatServiceError: class OwnerAgentChatServiceError extends Error {
    constructor(
      public readonly statusCode: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

const createResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

describe('owner agents route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerByUserId.mockResolvedValue({ id: OWNER_ID, userId: USER_ID });
    mocks.ensureDefaultAgents.mockResolvedValue([]);
    mocks.listOwnerAgents.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Claude Assistant',
        avatar_url: null,
        description: null,
        instructions: null,
        suggested_prompts: [],
        backend_provider: 'claude',
        backend_source: 'local',
        execution_mode: 'standard',
        status: 'active',
        runtime_id: null,
        runtime_status: null,
        is_default: true,
        source: 'system_default',
        last_active_at: null,
        created_at: '2026-04-28T00:00:00.000Z',
      },
    ]);
  });

  it('ensures default agents before listing owner agents', async () => {
    const { handleListOwnerAgents } = await import('../../../gateway/src/routes/owner-agents.js');
    const req = { user: { id: USER_ID, role: 'authenticated' } } as unknown as Request;
    const res = createResponse();

    await handleListOwnerAgents(req, res);

    expect(mocks.getOwnerByUserId).toHaveBeenCalledWith(USER_ID);
    expect(mocks.ensureDefaultAgents).toHaveBeenCalledWith(OWNER_ID);
    expect(mocks.listOwnerAgents).toHaveBeenCalledWith(OWNER_ID);
    expect(mocks.ensureDefaultAgents.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listOwnerAgents.mock.invocationCallOrder[0]
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: 'Claude Assistant',
          is_default: true,
          source: 'system_default',
        }),
      ],
    });
  });
});
