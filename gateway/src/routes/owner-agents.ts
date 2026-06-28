import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ownerAgentCreateAgentRequestSchema } from '../../../shared/contracts/http/owner-agent-chat/protocol.js';
import type { OwnerAgentCreateAgentRequest } from '../../../shared/contracts/http/owner-agent-chat/types.js';
import { getOwnerByUserId } from '../db/owner-agent-chat.js';
import { listAgentRuntimes, syncAgentRuntimesFromHostProviders } from '../db/owner-runtimes.js';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import {
  createOwnerAgent,
  listOwnerAgents,
  OwnerAgentChatServiceError,
} from '../services/owner-agent-chat.js';
import { ensureDefaultAgents } from '../services/default-owner-agents.js';
import {
  countHostConnectionsForOwner,
  getLiveProviderStatusForOwner,
} from '../services/agent-host-registry.js';
import type { AuthUser } from '../types/index.js';

const LOCAL_HOST_CONNECT_UI = {
  banner_title_idle: '本机助手尚未连接',
  banner_title_reconnecting: '正在重连本机助手…',
  banner_body:
    '正在连接本机 AI 助手，请稍候。若长时间无响应，请刷新页面后重试。',
  banner_extra: '你也可以在左侧查看各助手状态，或按提示安装缺失的 AI 工具。',
  agents_hint:
    '本机助手尚未连接，可点击「一键连接」自动检测并连接（最多重试 3 次）。',
} as const;

export const handleListOwnerAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    await ensureDefaultAgents(owner.id);
    const data = await listOwnerAgents(owner.id);
    res.status(200).json({ data });
  } catch (err) {
    console.error('[OwnerAgents] List failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to list owner agents' },
    });
  }
};

export const handleLocalHostStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    try {
      await syncAgentRuntimesFromHostProviders(owner.id);
    } catch (syncErr) {
      console.warn('[OwnerAgents] local-host sync failed:', (syncErr as Error).message);
    }

    const runtimes = await listAgentRuntimes({ ownerId: owner.id });
    const liveProviders = getLiveProviderStatusForOwner(owner.id);
    const liveHostCount = countHostConnectionsForOwner(owner.id);
    const defaultProviders = ['claude', 'cursor', 'codex', 'openclaw', 'pi'] as const;
    const providers = defaultProviders.map((provider) => {
      const runtime = runtimes.find((row) => row.runtimeType === provider);
      const dbStatus = runtime?.runtimeStatus ?? 'offline';
      const liveStatus = liveProviders.get(provider);
      const status =
        dbStatus === 'online' || liveStatus === 'online'
          ? 'online'
          : dbStatus;
      return {
        provider,
        status,
        detected: Boolean(runtime) || liveStatus !== undefined,
      };
    });

    const onlineRuntimeCount = providers.filter((row) => row.status === 'online').length;
    const hostConnected = onlineRuntimeCount > 0 || liveHostCount > 0;

    res.status(200).json({
      data: {
        user_id: user.id,
        owner_id: owner.id,
        online_runtime_count: onlineRuntimeCount,
        total_runtime_count: runtimes.length,
        host_connected: hostConnected,
        live_host_count: liveHostCount,
        providers,
        attach_command: `bash scripts/dev-up.sh`,
        install_hint: hostConnected ? null : LOCAL_HOST_CONNECT_UI.banner_body,
        connect_ui: hostConnected ? null : { ...LOCAL_HOST_CONNECT_UI },
      },
    });
  } catch (err) {
    console.error('[OwnerAgents] Local host status failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to load local host status' },
    });
  }
};

export const handleCreateOwnerAgent = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseCreateAgentBody(req.body);
  if (!parsed.ok) {
    res.status(parsed.statusCode).json({
      error: { code: 'invalid_request', message: parsed.message },
    });
    return;
  }

  try {
    const user = (req as Request & { user: AuthUser }).user;
    const owner = await getOwnerByUserId(user.id);
    if (!owner) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Owner profile not found' } });
      return;
    }

    const data = await createOwnerAgent(owner.id, parsed.body);
    res.status(201).json({ data });
  } catch (err) {
    if (err instanceof OwnerAgentChatServiceError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    console.error('[OwnerAgents] Create failed:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to create owner agent' },
    });
  }
};

interface ParsedCreateAgentBody {
  ok: true;
  body: OwnerAgentCreateAgentRequest;
}

interface InvalidCreateAgentBody {
  ok: false;
  statusCode: 400 | 422;
  message: string;
}

const parseCreateAgentBody = (body: unknown): ParsedCreateAgentBody | InvalidCreateAgentBody => {
  const result = ownerAgentCreateAgentRequestSchema.safeParse(body);
  if (result.success) {
    return { ok: true, body: result.data };
  }

  const firstIssue = result.error.issues[0];
  const path = firstIssue?.path.join('.') || '';
  const detail = firstIssue?.message || 'unknown error';
  return {
    ok: false,
    statusCode: isSemanticCreateAgentViolation(firstIssue) ? 422 : 400,
    message: `Validation failed${path ? ` at ${path}` : ''}: ${detail}`,
  };
};

const isSemanticCreateAgentViolation = (issue: z.ZodIssue | undefined): boolean => {
  const field = String(issue?.path[0] ?? '');
  return field === 'name'
    || field === 'avatar_url'
    || field === 'description'
    || field === 'instructions'
    || field === 'suggested_prompts';
};

export const ownerAgentsRouter = Router();
ownerAgentsRouter.get('/api/owner/agents', jwtAuthMiddleware, handleListOwnerAgents);
ownerAgentsRouter.get('/api/owner/local-host/status', jwtAuthMiddleware, handleLocalHostStatus);
ownerAgentsRouter.post('/api/owner/agents', jwtAuthMiddleware, handleCreateOwnerAgent);
