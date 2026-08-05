import { randomBytes } from 'crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { ownerAgentCreateHostTokenRequestSchema } from '../../../shared/contracts/http/owner-agent-chat/protocol.js';
import type {
  OwnerAgentCreateHostTokenRequest,
  OwnerAgentCreateHostTokenResponse,
} from '../../../shared/contracts/http/owner-agent-chat/types.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import type { AuthUser } from '../types/index.js';
import {
  createHostTokenRecord,
  getOwnerByUserId,
  hashHostToken,
  revokeHostTokenRecord,
} from '../db/owner-agent-chat.js';
import { revokeHostConnection } from '../services/agent-host-registry.js';

const HOST_TOKEN_PREFIX = 'qrclaw_host_';

const generateHostToken = (): string =>
  `${HOST_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

export const handleCreateHostToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const body = req.body as OwnerAgentCreateHostTokenRequest;
    if (body.scope.owner_id !== owner.id) {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Host token scope does not belong to owner' },
      });
      return;
    }

    const token = generateHostToken();
    const record = await createHostTokenRecord({
      ownerId: owner.id,
      hostId: body.host_id ?? null,
      tokenHash: hashHostToken(token),
      label: body.label ?? null,
      scope: body.scope as unknown as Record<string, unknown>,
      expiresAt: body.expires_at ?? null,
    });

    const response: OwnerAgentCreateHostTokenResponse = {
      token_id: record.tokenId,
      token,
      scope: body.scope,
      expires_at: record.expiresAt,
      created_at: record.createdAt,
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('[OwnerHostTokens] Create failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to create host token' },
    });
  }
};

export const handleDeleteHostToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const rawTokenId = req.params.tokenId;
    if (typeof rawTokenId !== 'string' || rawTokenId.length === 0) {
      res
        .status(400)
        .json({ error: { code: 'invalid_request', message: 'Host token id is required' } });
      return;
    }

    const tokenId = rawTokenId;
    const revoked = await revokeHostTokenRecord(tokenId, owner.id);
    if (!revoked) {
      res.status(404).json({ error: { code: 'not_found', message: 'Host token not found' } });
      return;
    }

    if (revoked.hostId) {
      revokeHostConnection(revoked.hostId);
    }

    res.status(204).send();
  } catch (err) {
    console.error('[OwnerHostTokens] Revoke failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to revoke host token' },
    });
  }
};

export const ownerHostTokensRouter = Router();
ownerHostTokensRouter.post(
  '/api/owner/host-tokens',
  jwtAuthMiddleware,
  validateRequest(ownerAgentCreateHostTokenRequestSchema),
  handleCreateHostToken
);
ownerHostTokensRouter.delete(
  '/api/owner/host-tokens/:tokenId',
  jwtAuthMiddleware,
  handleDeleteHostToken
);
