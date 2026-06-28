/**
 * GET /api/agent/conversations — list conversations visible to the authenticated agent.
 *
 * §10 D3 agent_token (Bearer) authentication. Visibility is driven by the
 * agents.visibility_scope column:
 *   - 'self'  (default): conversations whose qrcode.agent_id === auth agent
 *   - 'owner'          : conversations under any qrcode that belongs to an
 *                        agent with the same owner_id
 *
 * Keyset pagination by (last_active_at DESC, id DESC). Cursor is a
 * base64url-encoded JSON `{ last_active_at, id }`.
 *
 * Rate limit: 60 requests / agent / rolling 60s window (Redis sorted set,
 * same primitive as agent-create-qrcode.ts, distinct key prefix).
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { getRedisClient, isRedisConnected } from '../redis/client.js';
import { agentConversationsQuerySchema } from '../../../shared/contracts/http/agent/conversations/protocol.js';
import type {
  AgentConversationItem,
  AgentConversationsResponse,
} from '../../../shared/contracts/http/agent/conversations/types.js';
import {
  AGENT_CONVERSATIONS_DEFAULT_LIMIT,
  AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE,
} from '../../../shared/contracts/http/agent/conversations/types.js';

// ─── Constants ──────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const RATE_LIMIT_KEY_PREFIX = 'rl:agent-conversations:';
const CURSOR_MAX_LENGTH = 256;

type VisibilityScope = 'self' | 'owner';

// ─── Agent Auth Context ─────────────────────────────────────────────

interface AgentAuthContext {
  agentId: string;
  ownerId: string;
  visibilityScope: VisibilityScope;
}

// ─── SHA-256 helper (mirrors agent-create-qrcode.ts) ────────────────

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ─── Agent Authentication Middleware ────────────────────────────────

/**
 * Express middleware: extracts Bearer <agent_token>, SHA-256 hashes it,
 * looks up agents.api_key_hash, verifies status === 'active'.
 *
 * Sets req.agentAuth = { agentId, ownerId, visibilityScope } on success.
 */
export const authenticateAgentMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Missing or invalid Authorization header' },
    });
    return;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey || apiKey.length < 10) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Missing or invalid Authorization header' },
    });
    return;
  }

  if (!isSupabaseConfigured()) {
    res.status(500).json({
      error: { code: 'internal_error', message: 'Database not configured' },
    });
    return;
  }

  const keyHash = sha256Hex(apiKey);

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, status, visibility_scope')
    .eq('api_key_hash', keyHash)
    .single();

  if (error || !agent) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid agent token' },
    });
    return;
  }

  if (agent.status !== 'active') {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Agent is suspended' },
    });
    return;
  }

  const scope: VisibilityScope = agent.visibility_scope === 'owner' ? 'owner' : 'self';

  (req as Request & { agentAuth: AgentAuthContext }).agentAuth = {
    agentId: agent.id,
    ownerId: agent.owner_id,
    visibilityScope: scope,
  };
  next();
};

// ─── Query validation middleware (req.query, not req.body) ──────────

/**
 * Exported for unit tests — invoke directly without mounting the router.
 */
export const validateQueryMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const parsed = agentConversationsQuerySchema.parse(req.query);
    (req as Request & { validatedQuery: typeof parsed }).validatedQuery = parsed;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      const path = firstIssue?.path.join('.') || '';
      const detail = firstIssue?.message || 'unknown error';
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: `Validation failed${path ? ` at ${path}` : ''}: ${detail}`,
        },
      });
      return;
    }
    next(err);
  }
};

// ─── Rate Limiter (per agent, rolling 60s) ──────────────────────────

interface AgentRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function checkRateLimit(agentId: string): Promise<AgentRateLimitResult> {
  const limit = AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE;

  if (!isRedisConnected()) {
    return { allowed: true, remaining: limit, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
  }

  const redis = getRedisClient();
  const key = `${RATE_LIMIT_KEY_PREFIX}${agentId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);

  const results = await pipeline.exec();
  if (!results) {
    return { allowed: true, remaining: limit, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  const currentCount = (results[1]?.[1] as number) || 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  const addPipeline = redis.pipeline();
  addPipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
  addPipeline.pexpire(key, RATE_LIMIT_WINDOW_MS);
  await addPipeline.exec();

  return {
    allowed: true,
    remaining: Math.max(0, limit - currentCount - 1),
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };
}

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const agentAuth = (req as Request & { agentAuth: AgentAuthContext }).agentAuth;
  if (!agentAuth) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Auth context missing' } });
    return;
  }

  const rl = await checkRateLimit(agentAuth.agentId);

  res.setHeader('X-RateLimit-Limit', AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rl.resetAt / 1000));

  if (!rl.allowed) {
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: `Rate limit exceeded: ${AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE} requests per minute`,
      },
    });
    return;
  }

  next();
};

// ─── Cursor encoding ────────────────────────────────────────────────

interface ConversationCursor {
  last_active_at: string;
  id: string;
}

function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Decode a base64url-JSON cursor. Returns null on any malformed input so
 * the caller can respond with a crisp 400 `invalid_cursor` instead of
 * silently resetting pagination.
 */
function decodeCursor(raw: string): ConversationCursor | null {
  if (!raw || raw.length > CURSOR_MAX_LENGTH) {
    return null;
  }
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.last_active_at !== 'string' || typeof obj.id !== 'string') {
      return null;
    }
    if (obj.last_active_at.length === 0 || obj.id.length === 0) {
      return null;
    }
    // Sanity-check the timestamp parses.
    if (Number.isNaN(Date.parse(obj.last_active_at))) {
      return null;
    }
    return { last_active_at: obj.last_active_at, id: obj.id };
  } catch {
    return null;
  }
}

// ─── Row shape returned by Supabase ────────────────────────────────

interface QrcodeJoinedRow {
  id: string;
  slug: string;
  profile: Record<string, unknown> | null;
  agent_id: string;
}

interface ConversationRow {
  id: string;
  qrcode_id: string;
  message_count: number | null;
  last_active_at: string;
  created_at: string;
  qrcodes: QrcodeJoinedRow | QrcodeJoinedRow[] | null;
}

function extractQrcode(row: ConversationRow): QrcodeJoinedRow | null {
  if (!row.qrcodes) return null;
  if (Array.isArray(row.qrcodes)) {
    return row.qrcodes[0] ?? null;
  }
  return row.qrcodes;
}

function extractQrcodeLabel(profile: Record<string, unknown> | null | undefined): string | null {
  if (!profile) return null;
  const name = profile['name'];
  return typeof name === 'string' && name.length > 0 ? name : null;
}

// ─── Handler ────────────────────────────────────────────────────────

export const handleAgentConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId, ownerId, visibilityScope } = (req as Request & { agentAuth: AgentAuthContext })
      .agentAuth;
    const { limit: rawLimit, cursor: rawCursor } = (
      req as Request & {
        validatedQuery: { limit?: number; cursor?: string };
      }
    ).validatedQuery;

    const limit = rawLimit ?? AGENT_CONVERSATIONS_DEFAULT_LIMIT;

    let cursor: ConversationCursor | null = null;
    if (rawCursor) {
      cursor = decodeCursor(rawCursor);
      if (!cursor) {
        res.status(400).json({
          error: { code: 'invalid_cursor', message: 'Malformed pagination cursor' },
        });
        return;
      }
    }

    const selectExpr =
      visibilityScope === 'owner'
        ? 'id, qrcode_id, message_count, last_active_at, created_at, qrcodes!inner(id, slug, profile, agent_id, agents!inner(owner_id))'
        : 'id, qrcode_id, message_count, last_active_at, created_at, qrcodes!inner(id, slug, profile, agent_id)';

    let query = supabase.from('conversations').select(selectExpr);

    if (visibilityScope === 'owner') {
      query = query.eq('qrcodes.agents.owner_id', ownerId);
    } else {
      query = query.eq('qrcodes.agent_id', agentId);
    }

    if (cursor) {
      // Composite keyset filter on (last_active_at, id):
      //   row < cursor  iff  last_active_at < C.last_active_at
      //                  OR  (last_active_at == C.last_active_at AND id < C.id)
      query = query.or(
        `last_active_at.lt.${cursor.last_active_at},and(last_active_at.eq.${cursor.last_active_at},id.lt.${cursor.id})`
      );
    }

    query = query
      .order('last_active_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const { data, error } = await query;

    if (error) {
      console.error('[AgentConversations] Query failed:', error.message);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to load conversations' },
      });
      return;
    }

    const rows = (data as unknown as ConversationRow[] | null) ?? [];
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;

    const items: AgentConversationItem[] = trimmed.map((row) => {
      const qr = extractQrcode(row);
      const qrcodeId = qr?.id ?? row.qrcode_id;
      const slug = qr?.slug ?? '';
      const label = extractQrcodeLabel(qr?.profile ?? null);
      const owningAgentId = qr?.agent_id ?? null;
      return {
        conversation_id: row.id,
        qrcode_id: qrcodeId,
        qrcode_slug: slug,
        qrcode_label: label,
        owner_id: ownerId,
        owned_by_me: owningAgentId === agentId,
        message_count: Number(row.message_count ?? 0),
        last_active_at: row.last_active_at,
        created_at: row.created_at,
      };
    });

    const nextCursor =
      hasMore && trimmed.length > 0
        ? encodeCursor({
            last_active_at: trimmed[trimmed.length - 1].last_active_at,
            id: trimmed[trimmed.length - 1].id,
          })
        : null;

    const response: AgentConversationsResponse = {
      data: items,
      meta: {
        has_more: hasMore,
        cursor: nextCursor,
        scope: visibilityScope,
      },
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('[AgentConversations] Error:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    });
  }
};

// ─── Router ─────────────────────────────────────────────────────────

export const agentConversationsRouter = Router();
agentConversationsRouter.get(
  '/api/agent/conversations',
  authenticateAgentMiddleware,
  validateQueryMiddleware,
  rateLimitMiddleware,
  handleAgentConversations
);
