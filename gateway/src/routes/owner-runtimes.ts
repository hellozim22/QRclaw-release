import { Router } from 'express';
import type { Request, Response } from 'express';
import { getOwnerByUserId } from '../db/owner-agent-chat.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { getOwnerRuntimeOverview } from '../services/default-owner-agents.js';
import type { AuthUser } from '../types/index.js';

export const handleListOwnerRuntimes = async (req: Request, res: Response): Promise<void> => {
  await handleOwnerRuntimes(req, res, false);
};

export const handleRescanOwnerRuntimes = async (req: Request, res: Response): Promise<void> => {
  await handleOwnerRuntimes(req, res, true);
};

const handleOwnerRuntimes = async (req: Request, res: Response, rescan: boolean): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const response = await getOwnerRuntimeOverview(owner.id, { rescan });
    res.status(200).json(response);
  } catch {
    console.error('[OwnerRuntimes] Request failed');
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to load owner runtimes' },
    });
  }
};

export const ownerRuntimesRouter = Router();
ownerRuntimesRouter.get('/api/owner/runtimes', jwtAuthMiddleware, handleListOwnerRuntimes);
ownerRuntimesRouter.post(
  '/api/owner/runtimes/rescan',
  jwtAuthMiddleware,
  handleRescanOwnerRuntimes
);
