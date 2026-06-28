import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  ownerAgentCreateSessionRequestSchema,
  ownerAgentRenameSessionRequestSchema,
} from '../../../shared/contracts/http/owner-agent-chat/protocol.js';
import type {
  OwnerAgentSessionResponse,
  OwnerAgentSessionMutationResponse,
} from '../../../shared/contracts/http/owner-agent-chat/types.js';
import { getOwnerByUserId } from '../db/owner-agent-chat.js';
import {
  archiveOwnerAgentSession,
  createOwnerAgentSession,
  getOwnerAgentSessionById,
  listOwnerAgentSessions,
  renameOwnerAgentSession,
  type OwnerAgentSessionRecord,
} from '../db/owner-sessions.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../types/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toSessionResponse = (record: OwnerAgentSessionRecord): OwnerAgentSessionResponse => ({
  session_id: record.id,
  conversation_id: record.id,
  agent_id: record.agentId,
  owner_id: record.ownerId,
  title: record.title,
  provider_session_id: record.providerSessionId,
  provider_work_dir: record.providerWorkDir,
  status: record.status,
  last_active_at: record.lastActiveAt,
  created_at: record.createdAt,
});

const sendError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void => {
  res.status(statusCode).json({ error: { code, message } });
};

const assertAgentOwnership = async (
  ownerId: string,
  agentId: string
): Promise<boolean> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Database not configured');
  }
  const { data, error } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) {
    throw new Error('Failed to verify agent ownership');
  }
  return !!data;
};

const resolveOwner = async (
  req: Request,
  res: Response
): Promise<{ id: string } | null> => {
  const user = (req as Request & { user: AuthUser }).user;
  const owner = await getOwnerByUserId(user.id);
  if (!owner) {
    sendError(res, 403, 'forbidden', 'Owner profile not found');
    return null;
  }
  return owner;
};

export const handleCreateSession = async (req: Request, res: Response): Promise<void> => {
  const agentId = String(req.params.agentId ?? '');
  if (!UUID_RE.test(agentId)) {
    sendError(res, 400, 'invalid_request', 'agentId must be a UUID');
    return;
  }

  const parsed = ownerAgentCreateSessionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') || '';
    sendError(
      res,
      issue?.path[0] === 'title' ? 422 : 400,
      'invalid_request',
      `Validation failed${path ? ` at ${path}` : ''}: ${issue?.message ?? 'unknown error'}`
    );
    return;
  }

  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;
    const ok = await assertAgentOwnership(owner.id, agentId);
    if (!ok) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }
    const record = await createOwnerAgentSession({
      ownerId: owner.id,
      agentId,
      title: parsed.data.title ?? 'New chat',
    });
    const body: OwnerAgentSessionMutationResponse = { data: toSessionResponse(record) };
    res.status(201).json(body);
  } catch (err) {
    console.error('[OwnerSessions] create failed:', (err as Error).message);
    sendError(res, 500, 'internal_error', 'Failed to create session');
  }
};

export const handleListSessions = async (req: Request, res: Response): Promise<void> => {
  const agentId = String(req.params.agentId ?? '');
  if (!UUID_RE.test(agentId)) {
    sendError(res, 400, 'invalid_request', 'agentId must be a UUID');
    return;
  }
  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;
    const ok = await assertAgentOwnership(owner.id, agentId);
    if (!ok) {
      sendError(res, 404, 'not_found', 'Agent not found');
      return;
    }
    const records = await listOwnerAgentSessions({ ownerId: owner.id, agentId });
    res.status(200).json({ data: records.map(toSessionResponse) });
  } catch (err) {
    console.error('[OwnerSessions] list failed:', (err as Error).message);
    sendError(res, 500, 'internal_error', 'Failed to list sessions');
  }
};

export const handleRenameSession = async (req: Request, res: Response): Promise<void> => {
  const sessionId = String(req.params.sessionId ?? '');
  if (!UUID_RE.test(sessionId)) {
    sendError(res, 400, 'invalid_request', 'sessionId must be a UUID');
    return;
  }
  const parsed = ownerAgentRenameSessionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    sendError(
      res,
      issue?.path[0] === 'title' ? 422 : 400,
      'invalid_request',
      `Validation failed: ${issue?.message ?? 'unknown error'}`
    );
    return;
  }

  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;
    const record = await renameOwnerAgentSession({
      ownerId: owner.id,
      sessionId,
      title: parsed.data.title,
    });
    if (!record) {
      sendError(res, 404, 'not_found', 'Session not found');
      return;
    }
    const body: OwnerAgentSessionMutationResponse = { data: toSessionResponse(record) };
    res.status(200).json(body);
  } catch (err) {
    console.error('[OwnerSessions] rename failed:', (err as Error).message);
    sendError(res, 500, 'internal_error', 'Failed to rename session');
  }
};

export const handleDeleteSession = async (req: Request, res: Response): Promise<void> => {
  const sessionId = String(req.params.sessionId ?? '');
  if (!UUID_RE.test(sessionId)) {
    sendError(res, 400, 'invalid_request', 'sessionId must be a UUID');
    return;
  }
  try {
    const owner = await resolveOwner(req, res);
    if (!owner) return;
    const existing = await getOwnerAgentSessionById({ ownerId: owner.id, sessionId });
    if (!existing) {
      sendError(res, 404, 'not_found', 'Session not found');
      return;
    }
    const record = await archiveOwnerAgentSession({ ownerId: owner.id, sessionId });
    if (!record) {
      sendError(res, 404, 'not_found', 'Session not found');
      return;
    }
    const body: OwnerAgentSessionMutationResponse = { data: toSessionResponse(record) };
    res.status(200).json(body);
  } catch (err) {
    console.error('[OwnerSessions] delete failed:', (err as Error).message);
    sendError(res, 500, 'internal_error', 'Failed to delete session');
  }
};

export const ownerSessionsRouter = Router();
ownerSessionsRouter.post(
  '/api/owner/agents/:agentId/sessions',
  jwtAuthMiddleware,
  handleCreateSession
);
ownerSessionsRouter.get(
  '/api/owner/agents/:agentId/sessions',
  jwtAuthMiddleware,
  handleListSessions
);
ownerSessionsRouter.patch(
  '/api/owner/sessions/:sessionId',
  jwtAuthMiddleware,
  handleRenameSession
);
ownerSessionsRouter.delete(
  '/api/owner/sessions/:sessionId',
  jwtAuthMiddleware,
  handleDeleteSession
);
