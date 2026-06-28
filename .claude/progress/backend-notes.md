# Backend Teammate Progress Notes

> 自动创建于 Agent Teams 启动时。每个子任务完成后更新。
> /compact 前必须更新。失败时必须记录 Failed Attempts。

## Progress
- [x] Phase 0: Gateway Node.js 项目初始化 + TypeScript + ws + PM2
- [x] Phase 1: WS Ticket 验证 + JWT Bearer 认证中间件 + Rate Limiter
- [x] Phase 2: WebSocket message routing pipeline + streaming + dedup + encryption
- [x] Phase 4: Agent online status (Redis presence) + offline message queue
- [x] Phase 5: SEO helpers (robots.txt, sitemap.xml) + i18n foundation (locale detection, message keys)
- [x] Phase 6: Three-tier rate limiting + OWASP hardening + Security Envelope injection
- [x] Phase 7: Production deployment (PM2 cluster + Nginx + Docker + env template)

## Current Task
Phase 7: COMPLETE

## Completed Work

### Gateway Project (gateway/)
- Express 5 + HTTP server + WebSocket server
- TypeScript (ESM), tsx for dev, tsc for build
- Dependencies: ws, ioredis, express, helmet, cors, dotenv, jsonwebtoken, uuid
- PM2 ecosystem config (ecosystem.config.cjs)
- Graceful shutdown (SIGTERM/SIGINT)

### Source Structure (gateway/src/)
| File | Purpose |
|------|---------|
| server.ts | Entry point, Express + WS setup, locale middleware, graceful shutdown |
| routes/health.ts | GET /health with Redis status |
| routes/seo.ts | GET /robots.txt + GET /sitemap.xml |
| ws/handler.ts | WebSocket server setup, connection management, presence tracking, offline queue drain, IP rate limit, zod validation |
| ws/auth.ts | WS ticket verification (JWT via jsonwebtoken) |
| ws/router.ts | Full message routing pipeline with offline queue enqueue + Security Envelope injection |
| ws/registry.ts | Connection registry with multi-index lookups |
| ws/schemas.ts | Zod validation schemas for all inbound WS frame types |
| ws/security-envelope.ts | Security Envelope creation + injection per §10.2-10.6 |
| crypto/envelope.ts | AES-256-GCM envelope encryption/decryption |
| crypto/key-manager.ts | DEK management (KEK→DEK three-layer model) |
| redis/client.ts | Redis connection + disconnect |
| redis/dedup.ts | Message dedup via Redis SET NX (300s TTL) |
| redis/rate-limiter.ts | Sliding window rate limiter — per-connection tier (Redis sorted sets) |
| redis/ip-rate-limiter.ts | IP-level rate limiter — global tier (Redis INCR + EXPIRE) |
| redis/presence.ts | Agent online presence tracking (Redis key with 60s TTL) |
| redis/offline-queue.ts | Per-agent offline message queue (Redis List, max 200, 24h TTL) |
| middleware/error-handler.ts | 404 + error middleware |
| middleware/auth.ts | JWT Bearer auth middleware (Supabase JWT) |
| middleware/i18n.ts | Locale detection middleware + message key structure |
| types/index.ts | Full WS frame types + TicketPayload + AuthUser + RateLimitResult |

### Phase 4 Details

#### Agent Presence (redis/presence.ts)
- Redis key: `presence:agent:<agentId>`, value: ISO timestamp, TTL: 60s
- `setAgentOnline()` on agent connect, `setAgentOffline()` on disconnect
- `refreshPresence()` called on each heartbeat ping (25s interval)
- `isAgentOnline()` / `getAgentLastSeen()` for status checks

#### Offline Message Queue (redis/offline-queue.ts)
- Redis List: `offline:agent:<agentId>`, max 200 messages, 24h TTL
- `enqueueOfflineMessage()` — RPUSH + LTRIM + EXPIRE pipeline
- `drainOfflineQueue()` — atomic Lua script (LRANGE + DEL)
- Integration: handler.ts drains queue on agent reconnect (after connection_ack)
- Integration: router.ts enqueues visitor messages when agent has no live WS connections

#### Handler Integration (ws/handler.ts)
- On agent connect: `setAgentOnline()` + `drainOfflineQueue()` → deliver queued messages
- On heartbeat: `refreshPresence()` to keep TTL alive
- On disconnect: `setAgentOffline()`

#### Router Integration (ws/router.ts)
- When visitor sends message and no agent WS connections exist:
  - Enqueue message via `enqueueOfflineMessage()` instead of rejecting
  - ACK with `accepted` status (message will be delivered on reconnect)

### Phase 5 Details

#### SEO (routes/seo.ts)
- GET /robots.txt — Disallow /ws, /health, /api/ (gateway is not a content server)
- GET /sitemap.xml — Empty sitemap (no indexable pages on gateway)

#### i18n Foundation (middleware/i18n.ts)
- Supported locales: en (default), zh-CN, zh-TW, ja
- Detection priority: ?lang= → cookie(lang) → Accept-Language → default
- Accept-Language parsing with quality factor sorting + prefix matching
- Message key structure: dot notation (error.*, ws.*, http.*)
- `getMessage(key)` returns English default (translations in future phase)

### Build Verification
- `npx tsc --noEmit` passes without errors (Phase 6)

### Phase 6 Details

#### Three-Tier Rate Limiting
1. **IP-level** (redis/ip-rate-limiter.ts): Redis INCR + EXPIRE, 300 req/IP/min, fail-open
2. **Per-connection** (redis/rate-limiter.ts): Existing sliding window, 60/120 msg/min visitor/agent
3. **Per-message**: Dedup via Redis SET NX in the routing pipeline (existing)
- IP rate limit checked at WS connection time in handler.ts (before ticket verification)
- Per-connection rate limit checked per message in router.ts (existing)

#### OWASP Top 10 Hardening
- **Zod validation** (ws/schemas.ts): All 6 inbound frame types validated with strict schemas
  - Field length constraints: content 16KB, IDs 64 chars, delta 4KB, metadata max 10 keys
  - Two-step validation: type discriminator → type-specific schema
  - Replaces manual `JSON.parse` + `as` casts in handler.ts
- **Helmet hardened** (server.ts): Full CSP (default-src 'none'), HSTS 1yr + preload, X-Frame deny, no-referrer
- **CORS tightened** (server.ts): Comma-separated CORS_ORIGIN env → whitelist, credentials=true, 24h preflight cache
- **Trust proxy** enabled (single hop) for correct X-Forwarded-For IP extraction
- **Error handler** already masks 500 errors (no stack/detail leakage)

#### Security Envelope (ws/security-envelope.ts)
- Per §10.2-10.6: Every agent→visitor message carries a SecurityEnvelope
- Policy: ai_generated_disclosure, no_medical_legal_financial_advice, content_source_attribution, user_data_handling_notice
- Injected at: handleAgentMessage forward + handleStreamEnd forward
- Immutable injection via spread operator (original payload not mutated)
- Policy hash: SHA-256 of version+rules+text, truncated to 16 hex chars

## Blocked
无

## Next Steps
- Phase 3: Redis-backed conversation→session mapping for findVisitorForConversation
- Phase 3: Supabase REST API persistence (replace console.log stub in persistMessage)
- Phase 3: Full read_receipt forwarding implementation

## Failed Attempts
无

## Dependencies
- Redis: 已安装并运行 (localhost:6379)
- 数据库 Teammate: Schema + Edge Functions 完成后对齐接口

## Last Checkpoint
- Phase: 7 (COMPLETE)
- Timestamp: 2026-03-13

### Phase 7 Details

#### PM2 Cluster Config (ecosystem.config.cjs)
- Production: cluster mode with `instances: 'max'` (all CPU cores)
- Development: fork mode with single instance
- Memory limit: 512MB per instance, exponential backoff restart
- Kill timeout: 8s for WebSocket drain, log rotation comments included
- Fixed script reference bug: was `.js`, corrected to `.cjs`

#### Nginx Template (nginx/gateway.conf)
- Reverse proxy to Node.js on port 3001 with ip_hash sticky sessions
- WebSocket upgrade support (`/ws` location block)
- SSL termination (TLSv1.2/1.3, OCSP stapling, session tickets off)
- Three rate limit zones: ws_conn (10r/s), api_req (30r/s), ws_active (100 conn)
- Health check endpoint bypasses rate limiting
- HTTP→HTTPS redirect + Let's Encrypt ACME challenge support

#### Docker (Dockerfile + docker-compose.yml)
- Multi-stage build: builder (node:22-alpine + tsc) → runtime (prod deps only)
- Non-root user (qrclaw:qrclaw) for container security
- Health check via wget to /health
- docker-compose: gateway + redis:7-alpine with health checks
- Redis: 256MB maxmemory, allkeys-lru eviction, AOF persistence
- Resource limits: 512MB / 1 CPU for gateway, 300MB for Redis
- Log rotation: json-file driver, 50MB × 5 files

#### .env.production.example
- All 9 env vars documented with descriptions
- KEK generation command included
- REDIS_URL defaults to `redis://redis:6379` (docker-compose service name)
