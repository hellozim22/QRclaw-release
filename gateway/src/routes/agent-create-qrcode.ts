/**
 * POST /api/agent/create-qrcode — Agent-authenticated QR code creation.
 *
 * §10 D3: agent_token (Bearer) authentication, NOT Supabase JWT.
 * §12.6.3: owner isolation enforced — owner_id is taken from the
 * authenticated agent context, never from the request body.
 *
 * Rate limit: 100 creations / agent / rolling 24h (Redis sorted set).
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { validateRequest } from '../middleware/validate-request.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { getRedisClient, isRedisConnected } from '../redis/client.js';
import { agentCreateQrcodeSchema } from '../../../shared/contracts/http/agent/protocol.js';
import type {
  AgentCreateQrcodeRequest,
  AgentCreateQrcodeResponse,
} from '../../../shared/contracts/http/agent/types.js';
import { AGENT_CREATE_QRCODE_LIMIT_PER_DAY } from '../../../shared/contracts/http/agent/types.js';

// ─── Constants ──────────────────────────────────────────────────────

const SLUG_LENGTH = 12;
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_KEY_PREFIX = 'rl:agent-create-qr:';
const PUBLIC_SITE_URL = 'https://qrclaw.ai';

// ─── Agent Auth Context ─────────────────────────────────────────────

interface AgentAuthContext {
  agentId: string;
  ownerId: string;
}

// ─── Slug Generation ────────────────────────────────────────────────

function generateSlug(length: number = SLUG_LENGTH): string {
  const bytes = randomBytes(length * 2);
  const result: string[] = [];
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    if (bytes[i] < 252) {
      result.push(SLUG_CHARS[bytes[i] % SLUG_CHARS.length]);
    }
  }
  return result.join('');
}

// ─── Agent Authentication Middleware ────────────────────────────────

/**
 * SHA-256 hash a plaintext API key → lowercase hex.
 * Mirrors supabase/functions/_shared/auth.ts:sha256Hex and
 * supabase/functions/agent-ws-ticket/index.ts:hashApiKey.
 */
function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Express middleware: extracts Bearer <agent_token>, SHA-256 hashes it,
 * looks up agents.api_key_hash, verifies status === 'active'.
 *
 * Sets req.agentAuth = { agentId, ownerId } on success.
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
    .select('id, owner_id, status')
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

  (req as Request & { agentAuth: AgentAuthContext }).agentAuth = {
    agentId: agent.id,
    ownerId: agent.owner_id,
  };
  next();
};

// ─── Rate Limiter (per agent, rolling 24h) ──────────────────────────

interface AgentRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function checkAgentCreateQrRateLimit(agentId: string): Promise<AgentRateLimitResult> {
  const limit = AGENT_CREATE_QRCODE_LIMIT_PER_DAY;

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

// ─── Rate Limit Middleware ──────────────────────────────────────────

const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const agentAuth = (req as Request & { agentAuth: AgentAuthContext }).agentAuth;
  if (!agentAuth) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Auth context missing' } });
    return;
  }

  const rl = await checkAgentCreateQrRateLimit(agentAuth.agentId);

  res.setHeader('X-RateLimit-Limit', AGENT_CREATE_QRCODE_LIMIT_PER_DAY);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rl.resetAt / 1000));

  if (!rl.allowed) {
    res.status(429).json({
      error: { code: 'rate_limited', message: 'Rate limit exceeded: 100 creations per day' },
    });
    return;
  }

  next();
};

// ─── Handler ────────────────────────────────────────────────────────

const handleAgentCreateQrcode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId } = (req as Request & { agentAuth: AgentAuthContext }).agentAuth;
    const body = req.body as AgentCreateQrcodeRequest;

    let slug = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      slug = generateSlug();
      const { data: existing } = await supabase
        .from('qrcodes')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
    }

    if (!slug) {
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to generate unique slug' },
      });
      return;
    }

    const profile: Record<string, unknown> = { name: body.label };
    if (body.system_prompt && body.system_prompt.trim().length > 0) {
      profile.system_prompt = body.system_prompt.trim();
    }

    const agentMetadata: Record<string, unknown> = { created_by: 'agent', agent_id: agentId };
    if (body.callback_hint) {
      agentMetadata.callback_hint = body.callback_hint;
    }
    if (body.agent_account_label) {
      agentMetadata.account_label = body.agent_account_label;
    }
    profile.agent_metadata = agentMetadata;

    const insertPayload: Record<string, unknown> = {
      agent_id: agentId,
      slug,
      status: 'active',
      profile,
      locale: 'en',
    };

    const { data: qrCode, error: insertError } = await supabase
      .from('qrcodes')
      .insert(insertPayload)
      .select('id, slug')
      .single();

    if (insertError) {
      console.error('[AgentCreateQR] Insert failed:', insertError.message);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to create QR code' },
      });
      return;
    }

    const publicUrl = `${PUBLIC_SITE_URL}/q/${qrCode.slug}`;
    const qrImageUrl = `${PUBLIC_SITE_URL}/api/qr/${qrCode.slug}`;

    const response: AgentCreateQrcodeResponse = {
      qr_code_id: qrCode.id,
      slug: qrCode.slug,
      qr_image_url: qrImageUrl,
      public_url: publicUrl,
      expires_at: null,
    };

    res.status(201).json({ data: response });
  } catch (err) {
    console.error('[AgentCreateQR] Error:', (err as Error).message);
    res.status(500).json({
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    });
  }
};

// ─── Router ─────────────────────────────────────────────────────────

export const agentCreateQrcodeRouter = Router();
agentCreateQrcodeRouter.post(
  '/api/agent/create-qrcode',
  authenticateAgentMiddleware,
  validateRequest(agentCreateQrcodeSchema),
  rateLimitMiddleware,
  handleAgentCreateQrcode
);
