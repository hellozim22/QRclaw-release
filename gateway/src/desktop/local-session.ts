import { Router, type Request, type Response } from 'express';
import { isDesktopLocalMode } from './mode.js';

let cachedSession: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  ownerId: string;
} | null = null;

export function setDesktopLocalSession(session: typeof cachedSession): void {
  cachedSession = session;
}

export function loadDesktopSessionFromEnv(): void {
  const access = process.env.DESKTOP_SUPABASE_ACCESS_TOKEN?.trim();
  const refresh = process.env.DESKTOP_SUPABASE_REFRESH_TOKEN?.trim();
  const expires = process.env.DESKTOP_SUPABASE_EXPIRES_AT?.trim();
  const ownerId = process.env.DESKTOP_OWNER_ID?.trim();
  if (access && refresh) {
    cachedSession = {
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expires ? parseInt(expires, 10) : 0,
      ownerId: ownerId ?? '',
    };
  }
}

const router = Router();

function isLocalhost(req: Request): boolean {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

router.get('/api/desktop/local-session', (req: Request, res: Response) => {
  if (!isDesktopLocalMode()) {
    res
      .status(404)
      .json({ error: { code: 'not_desktop_mode', message: 'Not in desktop local mode' } });
    return;
  }

  if (!isLocalhost(req)) {
    res
      .status(403)
      .json({ error: { code: 'forbidden', message: 'Local session only available on localhost' } });
    return;
  }

  if (!cachedSession) {
    res
      .status(401)
      .json({ error: { code: 'no_session', message: 'No desktop session configured' } });
    return;
  }

  res.json({
    ownerId: cachedSession.ownerId,
    supabaseSession: {
      access_token: cachedSession.accessToken,
      refresh_token: cachedSession.refreshToken,
      expires_at: cachedSession.expiresAt,
    },
  });
});

export { router as desktopLocalSessionRouter };
