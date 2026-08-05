/**
 * QRClaw Gateway — Entry point
 * Express HTTP server + WebSocket server
 *
 * Iron Rule C1: Gateway is a pure relay — no AI inference hosted here.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'http';
import { env } from './env.js';
import { healthRouter } from './routes/health.js';
import { seoRouter } from './routes/seo.js';
import { ticketRouter } from './routes/ticket.js';
// Legacy visitor/QR routers — unmounted in local v1 (Owner Agent Chat only).
// import { messagesRouter } from './routes/messages.js';
// import { subscribeRouter } from './routes/subscribe.js';
// import { createQrcodeRouter } from './routes/create-qrcode.js';
// import { agentCreateQrcodeRouter } from './routes/agent-create-qrcode.js';
// import { agentConversationsRouter } from './routes/agent-conversations.js';
import { ownerAgentsRouter } from './routes/owner-agents.js';
import { ownerAgentChatSseRouter } from './routes/owner-agent-chat-sse.js';
import { ownerAgentMessagesRouter } from './routes/owner-agent-messages.js';
import { ownerHostTokensRouter } from './routes/owner-host-tokens.js';
import { ownerRuntimesRouter } from './routes/owner-runtimes.js';
import { ownerSessionsRouter } from './routes/owner-sessions.js';
import { desktopBootstrapRouter } from './routes/desktop-bootstrap.js';
import { desktopLocalSessionRouter, loadDesktopSessionFromEnv } from './desktop/local-session.js';
import { desktopProxyRouter } from './desktop/proxy-router.js';
import { isDesktopLocalMode } from './desktop/mode.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { localeMiddleware } from './middleware/i18n.js';
import { setupWebSocketServer, getConnectionCount } from './ws/handler.js';
import { connectRedis, disconnectRedis } from './redis/client.js';

const PORT = parseInt(env.PORT || '3001', 10);
const HOST = env.HOST || '0.0.0.0';

// ─── Express app ────────────────────────────────────────────────────

const app = express();

// Trust first proxy (load balancer) for X-Forwarded-For
app.set('trust proxy', 1);

// Security middleware — hardened per Phase 6 OWASP Top 10
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        connectSrc: [
          "'self'",
          'https://gateway-test.qrclaw.ai',
          'wss://gateway-test.qrclaw.ai',
          'https://qrclaw-test.vercel.app',
          'http://localhost:3000',
          'ws://localhost:3001',
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'no-referrer' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
  })
);

// CORS — restrict to known origins in production
const ALLOWED_ORIGINS = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((o) => o.trim()) : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // In production CORS_ORIGIN must be set; reject all cross-origin if not configured
      if (!origin) {
        // Same-origin or non-browser request (e.g. health checks)
        callback(null, true);
      } else if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400, // cache preflight for 24h
  })
);

app.use(express.json({ limit: '64kb' }));

// Locale detection
app.use(localeMiddleware);

// Desktop local mode: proxy owner routes to cloud + expose local session
if (isDesktopLocalMode()) {
  loadDesktopSessionFromEnv();
  app.use(desktopLocalSessionRouter);
  app.use(desktopProxyRouter);
}

// Routes
app.use(healthRouter);
app.use(seoRouter);
app.use(ticketRouter);
// Cloud-only desktop bootstrap
if (!isDesktopLocalMode()) {
  app.use(desktopBootstrapRouter);
}
// Local v1: Owner Agent Chat only — legacy visitor/QR routes not mounted.
// Desktop local mode proxies owner HTTP routes to cloud; WS stays local for agent host.
if (!isDesktopLocalMode()) {
  app.use(ownerAgentsRouter);
  app.use(ownerAgentChatSseRouter);
  app.use(ownerAgentMessagesRouter);
  app.use(ownerHostTokensRouter);
  app.use(ownerRuntimesRouter);
  app.use(ownerSessionsRouter);
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// ─── HTTP + WebSocket server ────────────────────────────────────────

const server = createServer(app);
const wss = setupWebSocketServer(server);

// ─── Graceful shutdown ──────────────────────────────────────────────

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Close WebSocket server
  wss.close(() => {
    console.log('[Server] WebSocket server closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // Disconnect Redis
  await disconnectRedis();
  console.log('[Server] Redis disconnected');

  process.exit(0);
};

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});

// ─── Start ──────────────────────────────────────────────────────────

const validateRequiredEnv = (): void => {
  if (isDesktopLocalMode()) {
    if (!process.env.DESKTOP_LOCAL_TICKET_KEY?.trim() && process.env.WS_TICKET_SECRET?.trim()) {
      process.env.DESKTOP_LOCAL_TICKET_KEY = process.env.WS_TICKET_SECRET;
    }
    const desktopRequired = [
      'DESKTOP_LOCAL_TICKET_KEY',
      'DESKTOP_RUNTIME_TOKEN',
      'DESKTOP_CLOUD_GATEWAY_URL',
    ];
    const missingDesktop = desktopRequired.filter((key) => !process.env[key]?.trim());
    if (missingDesktop.length > 0) {
      console.error(`[Server] FATAL: Desktop mode missing env: ${missingDesktop.join(', ')}`);
      process.exit(1);
    }
    console.log('[Server] Desktop local mode — skipping cloud secret validation');
    return;
  }

  // M3-T6: the canonical KEK env var is QRCLAW_KEK_V1. ENCRYPTION_KEK still
  // satisfies the requirement so existing ops configs don't immediately fail
  // on deploy; env.ts emits a deprecation warning the first time the legacy
  // variable is read.
  // SUPABASE_JWT_SECRET was historically required for jwt.verify(HS256), but
  // Supabase now issues ES256 tokens and all gateway auth paths delegate to
  // `supabase.auth.getUser()` (which talks to the Supabase Auth API, no shared
  // secret needed). The env slot is kept in env.ts as a harmless no-op for
  // deploys that still set it; removing it from boot required-list eliminates
  // a misleading gate for local dev. See AGENTS.md > "JWT verification".
  const required: Array<keyof typeof env> = ['WS_TICKET_SECRET'];
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    console.error(`[Server] FATAL: Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const kek = env.QRCLAW_KEK_V1;
  if (!kek) {
    console.error(
      '[Server] FATAL: QRCLAW_KEK_V1 is not configured (ENCRYPTION_KEK accepted as deprecated fallback)'
    );
    process.exit(1);
  }
  if (kek.length !== 64) {
    console.error('[Server] FATAL: QRCLAW_KEK_V1 must be 64 hex characters (32 bytes)');
    process.exit(1);
  }
};

const start = async (): Promise<void> => {
  try {
    // Validate critical secrets before starting
    validateRequiredEnv();

    // Connect to Redis (non-blocking — server starts even if Redis is unavailable)
    try {
      await connectRedis();
    } catch (err) {
      console.warn(
        '[Server] Redis connection failed, starting in degraded mode:',
        (err as Error).message
      );
    }

    server.listen(PORT, HOST, () => {
      console.log(`[Server] QRClaw Gateway listening on ${HOST}:${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
      console.log(`[Server] WebSocket:    ws://localhost:${PORT}/ws`);
      console.log(`[Server] Active WS connections: ${getConnectionCount()}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
};

start();
