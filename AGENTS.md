# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

QRClaw is a QR-code-based AI agent chat platform. Since 2026-04-20 it is also an **OpenClaw channel plugin**:
- **web/** — Next.js 16 frontend (port 3000)
- **gateway/** — Express 5 + WebSocket backend (port 3001)
- **supabase/** — DB migrations + 8 Edge Functions (含 `decrypted-messages` 统一解密读路径)
- **plugins/openclaw/** — OpenClaw channel plugin (M4 起) — QRClaw 作为 OpenClaw 内部通道，承载真实 agent 接入
- **shared/contracts/** — HTTP + WS 协议 SSoT
- **tests/** — Vitest unit/integration + Playwright E2E

Standard dev commands are documented in `CLAUDE.md` under "常用命令". **New agents should read `.claude/progress/session-overview.md` first** to align with wave-level progress before touching code.

### Environment setup caveats

- **本地密钥**: 所有 secret 集中在仓库外的 `~/.config/qrclaw/secrets.env`（chmod 600），`~/.zshrc` 里 `source` 一次，之后每个 terminal / Cursor agent 自动继承。`gateway/.env` / `web/.env.local` / GitHub Actions / Supabase Edge Function secrets 的字段清单 + 同步命令见 `docs/local-dev-secrets.md`。Supabase 开发入口、CLI/MCP 连接检查、migration/types/Edge Function 注意事项见 `docs/supabase-dev-guide.md`。
- **Redis required**: Gateway depends on Redis (port 6379). Install via `sudo apt-get install -y redis-server` and start with `redis-server --daemonize yes`. Without Redis, Gateway runs in degraded mode and real-time features break.
- **Gateway env secrets（2026-04-21 更新）**: Gateway 启动只强制要求 `WS_TICKET_SECRET`（缺即 `process.exit(1)`）。其余业务相关变量不会 hard-fail，但相应路由会报错直到补齐：
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`
  - `QRCLAW_KEK_V1`（64 hex；规范 KEK 名，`ENCRYPTION_KEK` 作为向后兼容 fallback，读取时一次性发出 deprecation 警告）
  - `QRCLAW_HOST_TOKEN_PEPPER`：Owner Agent Chat Host token HMAC hash pepper。Wave 3 Host token API 起需要；当前不应注入 Edge Function，除非后续把 Host token 校验移入 Edge Function。
  - `SUPABASE_JWT_SECRET`：**自 2026-04-21 起不再必需**。Gateway 所有认证走 `supabase.auth.getUser()`（ES256），不再本地 `jwt.verify(HS256)`；env slot 在 `env.ts` 保留为兼容 shim，不设值也能启动。旧文档说"required"或"process.exit(1)"的地方请忽略。
- **Edge Function runtime secret**: `decrypted-messages` Edge Function 需独立的 `QRCLAW_KEK_V1` secret（和 gateway 端同值）。**MCP `deploy_edge_function` 不自动同步 secret**，必须用 CLI 写一次：
  ```bash
  SUPABASE_ACCESS_TOKEN=sbp_... npx supabase secrets set \
    --project-ref your-project-ref \
    QRCLAW_KEK_V1=<64-hex>
  ```
  否则 Edge Function 对所有 actor 返回 `500 Encryption configuration error`（2026-04-21 BUG-2）。
- **Web env**: `web/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001`, and `NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:3001/ws` (**note the `/ws` path suffix**). The WS URL defaults to `ws://localhost:8080` if unset (wrong port).
- **CORS**: Set `CORS_ORIGIN=http://localhost:3000` in `gateway/.env` so the Gateway accepts requests from the frontend.

### Running services

```bash
# Start Redis (if not already running)
redis-server --daemonize yes

# Gateway (hot-reload)
cd gateway && npm run dev

# Frontend (Turbopack)
cd web && npm run dev
```

### Lint / typecheck / test

```bash
cd web && npm run lint               # ESLint (pre-existing warnings/errors in codebase)
cd gateway && npm run typecheck       # TypeScript strict check (clean as of 2026-04-21)
cd gateway && npm run build           # tsc compile
cd web && npm run build               # Next.js production build (25 routes as of 2026-04-21)
cd tests && npx vitest run            # Root unit + integration suite (975 / 975 pass as of 2026-04-21)
cd plugins/openclaw && npx vitest run # OpenClaw plugin suite (113 / 113 pass)
```

### Notes

- The four workspace directories (`web/`, `gateway/`, `tests/`, `plugins/openclaw/`) each carry an independent `package.json` + `package-lock.json`; each needs its own `npm install`.
- The `gateway/.env` and `web/.env.local` files are gitignored — you must create them on each fresh VM.
- Gateway health check: `curl http://localhost:3001/health` returns `{"status":"ok",...,"redis":"connected"}`.
- Supabase is cloud-hosted (`your-project-ref.supabase.co`); no local Supabase setup needed. Auth/data features require real Supabase keys (provided as secrets).
- **Without Supabase secrets**: The UI renders fully and Gateway starts + connects to Redis. Features that hit Supabase (login, signup, subscribe, message persistence) will return errors — this is expected. UI development, styling, and routing work fine with placeholder keys.
- **`QRCLAW_KEK_V1` generation**: Use `openssl rand -hex 32` to produce a valid 64-char hex key for `gateway/.env`. Mirror the same value into the Supabase Edge Function secrets (`decrypted-messages`) so the read path can unwrap DEKs written by the gateway.
- **WS URL must include `/ws`**: `NEXT_PUBLIC_GATEWAY_WS_URL` must be `ws://localhost:3001/ws` (not just `ws://localhost:3001`). The Gateway WS endpoint is at `/ws` path. Agent SDK also expects the full path.
- **JWT verification**: Gateway uses `supabase.auth.getUser(token)` for JWT verification (Supabase now issues ES256 tokens, not HS256). The old `jwt.verify()` approach no longer works.
- **CORS multi-port dev**: If Next.js starts on a non-default port (3002/3003/3004), add it to `CORS_ORIGIN` in `gateway/.env` as a comma-separated list.
- **Edge Functions deployed**: All 8 Edge Functions are deployed to Supabase. Use `SUPABASE_ACCESS_TOKEN` env var + `npx supabase functions deploy <name> --project-ref your-project-ref` to redeploy.
- **Create QR Code**: The wizard calls Gateway `POST /api/create-qrcode` first (JWT in `Authorization`). If the request fails (network/TLS/unreachable Gateway), it **falls back** to inserting the row via the Supabase client (`qrcodes_insert_own` RLS). Avatar upload to Storage still requires Gateway/service role; see `web/src/lib/create-qrcode-direct.ts`. TLS for public Gateway hosts is documented in `gateway/TLS.md`.
- **OpenClaw plugin（M4 起）**: `plugins/openclaw/` 是 QRClaw 作为 OpenClaw 通道的插件实现。本地开发 `cd plugins/openclaw && npm install && npm run dev`；单测 `npx vitest run`（113 tests）；对 OpenClaw 主仓的依赖以 `file:../../openclaw-main` 形式引入。消息回放、cross-agent 可见性（`agents.visibility_scope`）、cold-start history sync 均由该目录承担。

### Agent handoff / progress tracking

- **`.claude/progress/session-overview.md`** — wave 级进度索引（M0-M4、R1-R3、Wave 1/2/3、Known Bugs 三列表）。接手时先读这份。
- **`dev-log/YYYY-MM-DD.md`** — 每日改动的意图/根因/测试基线。搜索关键词如 `BUG-1`、`DEK`、`env guard` 能快速定位。
- **`docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md`** — OpenClaw 插件化方案 v1.3（锁定），含 §12 Task Cards 的任务分工。
- **`docs/local-dev-secrets.md`** — 本地密钥怎么存、怎么同步到 Gateway/Web/CI/Edge Function。新机器第一件事走一遍。
- **`docs/supabase-dev-guide.md`** — Supabase 开发入口：本地 secret 路径、CLI/MCP 连接检查、migration、RLS、types、Edge Function secret 注意事项。Cursor CLI agent 做数据库任务前先读。
- **`CHANGELOG.md`** — 版本切面，了解"哪一版加了什么功能/修了什么 bug"。

### Production deployment

| Service | How to deploy |
|---------|--------------|
| Frontend (Vercel) | `vercel deploy --prod --yes --token $DEPLOY_TOKEN` or push to main |
| Gateway (Tencent Cloud) | SCP files → `sudo docker-compose build && sudo docker-compose up -d` on `user@your-gateway-host` |
| Edge Functions | `npx supabase functions deploy <name> --project-ref your-project-ref` |

### Agent SDK (scripts/agent-sdk/)

- Echo Agent: `npm run echo-agent` — echoes visitor messages
- OpenClaw Agent: `npm run openclaw-agent` — forwards to OpenClaw AI (Luckygg)
- Config: `.env` needs `AGENT_API_KEY`, `GATEWAY_WS_URL=ws://localhost:3001/ws`, `OPENCLAW_API_URL=http://your-gateway-host:33476`
