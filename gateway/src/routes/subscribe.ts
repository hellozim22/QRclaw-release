/**
 * POST /api/subscribe — Newsletter email subscription endpoint.
 *
 * Flow: Zod validation → IP rate limit → Supabase upsert → success
 * Duplicate emails are silently accepted (ON CONFLICT DO NOTHING).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';
import { getRedisClient, isRedisConnected } from '../redis/client.js';
import { subscribeRequestSchema } from '../../../shared/contracts/http/subscribers/protocol.js';

// ─── Constants ───────────────────────────────────────────────────────

const SUBSCRIBE_RATE_LIMIT = 10; // max subscriptions per IP
const SUBSCRIBE_WINDOW_SECONDS = 3600; // 1 hour window
const SUBSCRIBE_KEY_PREFIX = 'rl:sub:';

// ─── Validation ──────────────────────────────────────────────────────

interface ValidationResult {
  success: boolean;
  data?: { email: string };
  error?: string;
}

export const validateSubscribeInput = (input: unknown): ValidationResult => {
  const result = subscribeRequestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.issues[0]?.message ?? 'Validation failed' };
};

export const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

// ─── Subscribe-specific rate limiter ─────────────────────────────────

const checkSubscribeRateLimit = async (ip: string): Promise<boolean> => {
  if (!isRedisConnected()) return true; // fail-open

  const redis = getRedisClient();
  const key = `${SUBSCRIBE_KEY_PREFIX}${ip}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, SUBSCRIBE_WINDOW_SECONDS, 'NX');

  const results = await pipeline.exec();
  if (!results) return true;

  const count = (results[0]?.[1] as number) || 0;
  return count <= SUBSCRIBE_RATE_LIMIT;
};

// ─── Handler ─────────────────────────────────────────────────────────

export const handleSubscribe = async (req: Request, res: Response): Promise<void> => {
  // 1. Validate input
  const validation = validateSubscribeInput(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: validation.error ?? 'Invalid email',
    });
    return;
  }

  // 2. Subscribe-specific rate limit (10/hour per IP, fail-open)
  const ip = req.ip ?? '0.0.0.0';
  try {
    const allowed = await checkSubscribeRateLimit(ip);
    if (!allowed) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
      return;
    }
  } catch {
    // Rate limit check failure → fail-open
  }

  // 3. Check Supabase
  if (!isSupabaseConfigured()) {
    res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable',
    });
    return;
  }

  // 4. Upsert to subscribers table (duplicate = silent success)
  const email = normalizeEmail(validation.data!.email);

  const { error } = await supabase
    .from('subscribers')
    .upsert(
      { email, status: 'active', source: 'landing' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    .select('id')
    .single();

  if (error) {
    // If upsert with ignoreDuplicates returns no row, that's fine
    // Supabase returns PGRST116 (no rows returned) for ignored duplicates
    if (error.code === 'PGRST116') {
      res.status(200).json({
        success: true,
        message: 'Subscribed successfully',
      });
      return;
    }

    console.error('[Subscribe] DB error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Subscription failed. Please try again.',
    });
    return;
  }

  res.status(201).json({
    success: true,
    message: 'Subscribed successfully',
  });
};

// ─── Router ──────────────────────────────────────────────────────────

export const subscribeRouter = Router();

subscribeRouter.post('/api/subscribe', handleSubscribe);
