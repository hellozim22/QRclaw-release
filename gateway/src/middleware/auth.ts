/**
 * JWT Bearer authentication middleware for HTTP endpoints.
 * Verifies Supabase-issued JWTs using Supabase SDK (supports ES256 + HS256).
 */
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from '../types/index.js';
import { supabase, isSupabaseConfigured } from '../db/supabase.js';

/**
 * Express middleware: extracts Bearer token and verifies via Supabase getUser().
 * Sets req.user = { id, role } on success.
 * Returns 401 for missing/invalid tokens.
 */
export const jwtAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'missing_token',
        message: 'Authorization header with Bearer token is required',
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  if (!isSupabaseConfigured()) {
    res.status(500).json({
      error: {
        code: 'auth_config_error',
        message: 'Authentication service is misconfigured',
      },
    });
    return;
  }

  try {
    const {
      data: { user: supaUser },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !supaUser) {
      res.status(401).json({
        error: {
          code: 'invalid_token',
          message: error?.message || 'Invalid or expired token',
        },
      });
      return;
    }

    const user: AuthUser = {
      id: supaUser.id,
      role: supaUser.role || 'authenticated',
    };

    (req as Request & { user: AuthUser }).user = user;
    next();
  } catch (err) {
    res.status(401).json({
      error: {
        code: 'invalid_token',
        message: 'Invalid or malformed token',
      },
    });
  }
};
