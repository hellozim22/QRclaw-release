import { Router, type Request, type Response, type NextFunction } from 'express';
import { isDesktopLocalMode } from './mode.js';
import { proxyToCloud } from './cloud-client.js';

const PROXY_PREFIXES = [
  '/api/owner-agents',
  '/api/owner-agent-messages',
  '/api/owner-agent-chat',
  '/api/owner-host-tokens',
  '/api/owner-runtimes',
  '/api/owner-sessions',
];

export const desktopProxyRouter = Router();

desktopProxyRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  if (!isDesktopLocalMode()) {
    next();
    return;
  }

  const shouldProxy = PROXY_PREFIXES.some((prefix) => req.path.startsWith(prefix));
  if (!shouldProxy) {
    next();
    return;
  }

  try {
    const upstream = await proxyToCloud({
      method: req.method,
      path: req.originalUrl,
      headers: {
        ...(req.headers.authorization ? { Authorization: req.headers.authorization as string } : {}),
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.send(text);
  } catch (err) {
    console.error('[DesktopProxy] upstream error:', (err as Error).message);
    res.status(502).json({
      error: { code: 'cloud_unreachable', message: 'Could not reach cloud gateway' },
    });
  }
});
