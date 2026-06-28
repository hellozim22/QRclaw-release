import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  getOwnerByUserId: vi.fn(),
  getOwnerRuntimeOverview: vi.fn(),
}));

vi.mock('../../../gateway/src/db/owner-agent-chat.js', () => ({
  getOwnerByUserId: mocks.getOwnerByUserId,
}));

vi.mock('../../../gateway/src/services/default-owner-agents.js', () => ({
  getOwnerRuntimeOverview: mocks.getOwnerRuntimeOverview,
}));

const createResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
};

describe('owner-runtimes route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerByUserId.mockResolvedValue({ id: OWNER_ID, userId: USER_ID });
    mocks.getOwnerRuntimeOverview.mockResolvedValue({
      data: [],
      meta: { total: 0, online_count: 0 },
    });
  });

  it('lists owner runtimes for the authenticated owner', async () => {
    const { handleListOwnerRuntimes } = await import('../../../gateway/src/routes/owner-runtimes.js');
    const req = { user: { id: USER_ID, role: 'authenticated' } } as unknown as Request;
    const res = createResponse();

    await handleListOwnerRuntimes(req, res);

    expect(mocks.getOwnerByUserId).toHaveBeenCalledWith(USER_ID);
    expect(mocks.getOwnerRuntimeOverview).toHaveBeenCalledWith(OWNER_ID, { rescan: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [], meta: { total: 0, online_count: 0 } });
  });

  it('rescans host providers before returning owner runtimes', async () => {
    const { handleRescanOwnerRuntimes } = await import('../../../gateway/src/routes/owner-runtimes.js');
    const req = { user: { id: USER_ID, role: 'authenticated' } } as unknown as Request;
    const res = createResponse();

    await handleRescanOwnerRuntimes(req, res);

    expect(mocks.getOwnerRuntimeOverview).toHaveBeenCalledWith(OWNER_ID, { rescan: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns forbidden when the auth user has no owner profile', async () => {
    const { handleListOwnerRuntimes } = await import('../../../gateway/src/routes/owner-runtimes.js');
    mocks.getOwnerByUserId.mockResolvedValue(null);
    const req = { user: { id: USER_ID, role: 'authenticated' } } as unknown as Request;
    const res = createResponse();

    await handleListOwnerRuntimes(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'forbidden', message: 'Owner profile not found' },
    });
  });

  it('hides internal errors from API callers', async () => {
    const { handleListOwnerRuntimes } = await import('../../../gateway/src/routes/owner-runtimes.js');
    mocks.getOwnerRuntimeOverview.mockRejectedValue(new Error('database password leaked detail'));
    const req = { user: { id: USER_ID, role: 'authenticated' } } as unknown as Request;
    const res = createResponse();

    await handleListOwnerRuntimes(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'Failed to load owner runtimes' },
    });
  });
});
