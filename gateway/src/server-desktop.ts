/**
 * QRClaw Desktop Local Gateway — minimal entry (no cloud secrets, no Supabase service role).
 * Bundled in QRClaw.app; runs with DESKTOP_LOCAL_MODE=1.
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { desktopLocalSessionRouter, loadDesktopSessionFromEnv } from './desktop/local-session.js';
import { desktopProxyRouter } from './desktop/proxy-router.js';
import { isDesktopLocalMode } from './desktop/mode.js';
import { connectRedis, disconnectRedis } from './redis/client.js';
import { setupWebSocketServer } from './ws/handler.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '127.0.0.1';

process.env.DESKTOP_LOCAL_MODE = '1';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '64kb' }));

loadDesktopSessionFromEnv();
app.use(desktopLocalSessionRouter);
app.use(desktopProxyRouter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: 'desktop-local',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    redis: 'desktop-in-memory',
    qrclawBundle: process.env.QRCLAW_BUNDLE_MARKER === 'ai.qrclaw.desktop',
    bundleMarker: process.env.QRCLAW_BUNDLE_MARKER ?? null,
  });
});

const server = createServer(app);
setupWebSocketServer(server);

const validateDesktopEnv = (): void => {
  if (!process.env.DESKTOP_LOCAL_TICKET_KEY?.trim() && process.env.WS_TICKET_SECRET?.trim()) {
    process.env.DESKTOP_LOCAL_TICKET_KEY = process.env.WS_TICKET_SECRET;
  }
  for (const key of ['DESKTOP_LOCAL_TICKET_KEY', 'DESKTOP_RUNTIME_TOKEN', 'DESKTOP_CLOUD_GATEWAY_URL']) {
    if (!process.env[key]?.trim()) {
      console.error(`[DesktopGateway] FATAL: missing ${key}`);
      process.exit(1);
    }
  }
};

const start = async (): Promise<void> => {
  validateDesktopEnv();
  await connectRedis().catch(() => undefined);
  server.listen(PORT, HOST, () => {
    console.log(`[DesktopGateway] listening on ${HOST}:${PORT}`);
  });
};

const shutdown = async (): Promise<void> => {
  await disconnectRedis().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
