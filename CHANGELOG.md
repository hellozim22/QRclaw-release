# Changelog

All notable changes to QRClaw are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.1] - 2026-04-21（未发布，工作进行中）

### Added
- **OpenClaw Channel Plugin**（`plugins/openclaw/`）：QRClaw 作为 OpenClaw 的通道插件全量落地（M0-M4）。
  - M0：插件 scaffold + OpenClaw SDK 对接
  - M1：架构预留（`conversations.kind` / `thread_id` / `reply_to_message_id` + `conversation_participants` 表）
  - M2：Dashboard 管 agent CRUD（全量实现）+ 前端 `M2-DASH` 创建 agent 流程
  - M3：Agent History API + `decrypted-messages` Supabase Edge Function（统一 owner / agent / visitor 三端读路径，在 Deno 内用 `crypto.subtle` 直接解密 DEK，淘汰 `decrypt_dek` RPC）
  - M4：Wave A scaffold → Wave B 消息双向管道 + `POST /api/create-qrcode` → Wave C Channel assembly + create-qrcode tool → Wave D 本地 e2e + indistinguishable spec + CI release workflow
- **Agents `visibility_scope`**（`self` / `owner`）：支持 cross-agent 对话可见性的显式 opt-in，默认严格隔离（migration `20260420_agent_visibility_scope.sql`，R1-R3）。
- **Cold-start History Replay**：插件冷启时通过 Edge Function 拉齐历史并与 live 流做去重（plugin `history.ts`）。
- **HTTP Contracts SSoT**（Phase 2 Wave 1）：`shared/contracts/http/` 全量集中化 + `scripts/sync-contracts.mjs` 跨项目同步。
- **Outbound WS Frame Validation**（Phase 2 Wave 2）：所有出站 WS frame 统一经 `sendFrame` + Zod 校验。
- **Iron Rule C5 消息可回放**：visitor / owner / agent-plugin 三身份重连均能拉回历史（见 `CLAUDE.md` 铁律表）。
- **Dev-log 交接体系**：`dev-log/2026-04-21.md`（今日工作细节）+ `.claude/progress/session-overview.md`（wave 级索引 + Known Bugs 三列表）。

### Fixed
- **BUG-1（P0）DEK cache keying**：`gateway/src/ws/router.ts` `persistMessage` 先 `resolveConversationId(qrCodeId, sessionToken)` 取真实 `dbConversationId` 再作 `getDEK` 缓存键，修复同 QR 码下第二个 visitor 会话因 cache miss 导致 `upsertEncryptionKey` 抛 `No encrypted DEK available for conversation` 错误、消息全部丢失。
- **BUG-2（P0）Edge Function 缺 KEK secret**：`decrypted-messages` Edge Function 运行时缺 `QRCLAW_KEK_V1`，对所有 actor 返回 `500 Encryption configuration error`。通过 `npx supabase secrets set` 注入后修复，三端（visitor×2 + agent）解密回读全部 200 且明文逐字节匹配。
- **decrypted-messages-client 测试 flaky**：`gateway/src/env.ts` 的 `dotenv.config({ override: true })` 会把 `gateway/.env` 灌进 vitest 进程、覆盖 `beforeEach` 注入的临时值。增加 `VITEST`/`NODE_ENV=test` 守卫，测试环境下不 override，生产行为不变。
- **M3-C1 security + database review findings**：已 address（`SUPABASE_SERVICE_ROLE_KEY` 绝不出现在 `apikey` header 等）。

### Changed
- **Gateway boot**：`server.ts validateRequiredEnv` 去掉 `SUPABASE_JWT_SECRET`。Gateway 不再本地 `jwt.verify(HS256)`，所有认证走 `supabase.auth.getUser()`（ES256）；env 槽在 `env.ts` 保留为兼容 shim，不强制设值。
- **KEK 统一**：`QRCLAW_KEK_V1` 成为规范环境变量名，`ENCRYPTION_KEK` 作为向后兼容 fallback + 一次性 deprecation 警告。
- **数据库 types 路径**：`v1.3` 起 `supabase gen types` 输出位置迁到 `supabase/types/`（2026-04-20 M1-DB-RESERVE 落地）。

### Removed
- **Visual-audit-20260327 归档**：`tests/test-results/visual-audit-20260327/`（90 张 png + HANDOFF + report）删除，基线已被后续工作替代。

### Baseline Test Results（2026-04-21 收尾）
- Root vitest: **975 / 975 pass**（88 files）
- Plugin vitest: **113 / 113 pass**（19 files）
- Gateway tsc: clean / Web build: 25 routes / Playwright chromium sample: 2 / 2 pass
- 实链路 E2E 探针: **3 / 3 pass**（visitor session1 + visitor session2 + agent actor，Gateway→Supabase 持久化→Edge Function 解密明文逐字节匹配）

### Pending（不阻塞）
- 4 个 commit（`01a4bd1` / `8ed75dc` / `0ee2960` / `159c82c`）已落本地 `main`，未 push 远端
- `0ee2960` 早期版本含敏感值，已由后续 commit 前向 scrub；如需 push 公开 remote 必须先重写 history + revoke token（详见 `dev-log/2026-04-21.md` 末"安全事件"段）
- Supabase 新版 API Key（`sb_publishable_...` / `sb_secret_...`）平滑迁移：等当前链路稳定后单开小迭代
- KEK 旋转（低优，防御性）：下一个维护窗口重新生成 `QRCLAW_KEK_V1` + re-wrap 现存 DEK
- M5+ / Phase 3 主题：等 product 决定

---

## [0.5.0] - 2026-03-26

### Fixed
- **Schema Alignment**: 修复前端字段名与数据库 schema 不匹配导致 Supabase 返回 400 错误（13+ 处字段名修正）
  - agents: `display_name` → `name`, 移除不存在的 `avatar_url`
  - qrcodes: `label` → `slug`, 移除不存在的 `scan_count`
  - conversations: `qr_code_id` → `qrcode_id`, `last_message_at` → `last_active_at`
  - 表名 `qr_codes` → `qrcodes`

---

## [0.4.9] - 2026-03-26

### Fixed
- **Login Redirect 404**: 登录后重定向从不存在的 `/dashboard` 改为 `/qrcodes`（CRITICAL）

### Changed
- **Pricing Page**: 更新定价页面内容
- **Landing Page**: 导航栏更新
- **Auth Callback**: 新增 callback route 处理 Supabase OAuth 回调

---

## [0.4.8] - 2026-03-26

### Added
- **Legal Pages**: Terms of Service 和 Privacy Policy 页面（LegalPageLayout 组件 + 路由）

### Fixed
- **Sticky Navigation**: 首页导航栏滚动时固定在顶部
- **Auth & Docs Visual**: 登录/注册页面、Docs 页面视觉还原优化

---

## [0.4.7] - 2026-03-26

### Added
- **System Prompt Injection**: Gateway 转发 visitor→agent 消息时附带 QR Code 人设 prompt（5 分钟缓存）
- **Message History**: Gateway 新增 /api/messages 端点，前端 WS 连接后自动加载解密历史消息
- **Email Subscribe**: 首页订阅完整功能（DB + API + 前端 + 测试），Zod 校验 + 限流 10/hour

### Fixed
- **Registry Index Bug**: 只对 role=agent 索引 agentId，修复 Visitor 被误认为 Agent
- **Conversation Auto-create**: 首条消息时自动创建 conversation 记录
- **Verify Flow**: 注册验证页从 OTP 改为确认链接提示 + Resend 按钮

---

## [0.4.6] - 2026-03-25

### Fixed
- **Visual Restoration**: 代码块暗色主题、导航栏高度修正、CSS 变量清理

---

## [0.4.5] - 2026-03-25

### Fixed
- **Agent Reply Persistence**: Agent 回复消息现在正确写入 Supabase messages 表（之前只有 visitor 消息落库，agent 消息丢失）

---

## [0.4.4] - 2026-03-25

### Fixed
- **Empty Bubble**: 流式回复过程中不再显示空白气泡，未开始流的消息不渲染

---

## [0.4.3] - 2026-03-25

### Fixed
- **Vercel Build Config**: 新增根目录 `vercel.json`，指定构建/安装命令指向 `web/` 子目录，修复 monorepo 结构下 Vercel 部署失败的问题

---

## [0.4.2] - 2026-03-25

### Added
- **MarkdownRenderer component** (`web/src/components/chat/MarkdownRenderer.tsx`) — 渲染 AI Agent 返回的 Markdown 格式消息（加粗、列表、代码块、链接等）

### Fixed
- **Content type passthrough**: `useWebSocket` 不再将 `content_type: 'markdown'` 强制转为 `'text'`，保留原始类型信息
- **Chat store endStream**: 不再硬编码 `contentType: 'text'`，使用消息原始 content type
- **MessageList**: 根据消息 content type 选择 Markdown 或纯文本渲染

---

## [0.4.2] - 2026-03-25

### Fixed
- **MessageId Unification**: `useWebSocket.sendMessage` generates messageId once and passes it to `WSClient.sendMessage`, fixing duplicate messages on screen caused by mismatched IDs between optimistic insert and WS frame

---

## [0.4.1] - 2026-03-25

### Fixed
- **WS Ping Schema**: Gateway `pingFrameSchema.strict()` now allows optional empty `payload` — fixes `invalid_frame` rejection of client heartbeat ping frames
- **Chat Message Dedup**: `chatStore.addMessage` deduplicates by messageId — prevents duplicate messages on screen during WS reconnection cycles
- **Ping Frame Cleanup**: WSClient ping frame no longer sends unnecessary `payload: {}` field
- **No-op Re-render Guard**: Duplicate messages with identical status return same state reference, avoiding unnecessary Zustand re-renders

### Changed
- `web/src/types/ws.ts` — `WSFrame.payload` changed from required to optional to support payload-free frame types (ping/pong)

### Added
- **TDD tests**: 9 new unit tests for ping schema validation, message deduplication, and ping frame format

---

## [0.4.0] - 2026-03-24

### Fixed
- **Gateway 双认证支持** — 修复前端 CRITICAL-1 安全修复后 WebSocket 连接全面阻塞的问题
  - Method A（旧客户端）：ticket 在 URL query params 中，立即验证
  - Method B（新客户端，OWASP 合规）：连接建立后 3 秒内发送 auth frame
  - 两条路径汇聚到同一个 `completeAuth()` 函数，后续行为一致

### Changed
- `gateway/src/ws/handler.ts` — 双认证主逻辑重构（+125/-3）
- `gateway/src/ws/schemas.ts` — 新增 authFrameSchema Zod 验证
- `gateway/src/types/index.ts` — 新增 AuthFrame 接口 + ClientMessageType 联合类型

### Added
- `tests/unit/backend/auth-frame.test.ts` — 12 个单元测试覆盖双认证场景
- `REVIEW.md` — 本次变更的 Code Review 文档

### Security
- auth frame 通过 WebSocket 帧传输 ticket（不再暴露在 URL 中）
- Zod `.strict()` 确保不接受额外字段
- 3 秒超时保护防止资源泄漏
- 向后兼容旧客户端（Method A）

---

## [0.3.1] - 2026-03-15

### Added
- **SuggestedQuestions component** (`web/src/components/chat/SuggestedQuestions.tsx`)
  - Clickable question chip buttons displayed in chat
  - Clicking a chip sends it as a visitor message
- **ChatMenu component** (`web/src/components/chat/ChatMenu.tsx`)
  - ••• dropdown menu in TopBar with "Reset Session" option
  - Click-outside-to-close behavior
- **"Powered by QRClaw" watermark** in chat page footer
- **Acceptance tests V4**: 151 passed / 1 skipped / 0 failed (from 146/6/0 in V3)

### Changed
- `web/src/app/chat/[agentId]/page.tsx` — Integrated SuggestedQuestions, ChatMenu, Powered by QRClaw footer
- `web/src/components/chat/index.ts` — Added ChatMenu and SuggestedQuestions exports
- 5 test cases redefined and activated from `test.fixme()`: F-10, F-12, L-07, L-08, P-05

---

## [0.3.0] - 2026-03-15

### Added
- **Gateway `persistMessage()`** — Full encryption-to-DB pipeline for WebSocket messages
  - AES-256-GCM envelope encryption via crypto module
  - Upserts `encryption_keys` record per conversation (with in-memory caching)
  - Inserts encrypted message to `messages` table via Supabase REST API
  - Conversation ID resolution: maps WS `qrCodeId` to DB `conversations.id`
  - Handles duplicate message IDs via PostgreSQL unique constraint (code 23505)
  - Stream messages: chunks buffered in memory, concatenated on `stream_end`, then persisted
- **New files**: `gateway/src/db/supabase.ts`, `gateway/src/db/persist.ts`
- **DB Schema migration**: `supabase/migrations/20260315_schema_additions.sql`
  - `agents.description TEXT`, `qrcodes.name VARCHAR(255)`, `conversations.status VARCHAR(20)`
  - `visitor_sessions` table with RLS
- **Acceptance tests V3**: 146 passed / 6 skipped / 0 failed (from 142/10/0 in V2)
- **Dev log system**: `dev-log/` directory with daily entries, CHANGELOG.md

### Changed
- `gateway/src/ws/router.ts` — `persistMessage()` now calls real DB writes instead of console.log stub
- `gateway/package.json` — Added `@supabase/supabase-js` dependency
- `tests/acceptance/k-conversation.spec.ts` — K-01/K-02/K-03 activated from `test.fixme()` to real tests
- `tests/acceptance/f-visitor-chat.spec.ts` — F-09 activated from `test.fixme()` to real test

### Fixed
- K-01 test failure: `resolveConversationId()` now correctly maps `qrCodeId` to DB `conversations.id` UUID
- K-01 test: Added agent connection in test so messages route (not just get queued to offline queue)

---

## [0.2.0] - 2026-03-14

### Added
- **Acceptance test suite V2**: 142 passed / 10 skipped / 0 failed (from 86/102/0 in V1)
- 16 test spec files covering modules A through P
- Mock WebSocket infrastructure (`mock-agent.ts`, `seed-data.ts`)
- Test helpers for DB seeding, auth setup, API calls

### Fixed
- CSP blocking Next.js hydration (`script-src 'unsafe-inline'` + `ws://localhost:*`)
- Logo 404 errors — created SVG logo, updated 11 files
- `button+onClick` navigation replaced with `<Link>` components
- Footer placeholder links replaced with real routes
- TabBar active state SVG stroke vs CSS color mismatch
- TabBar conditional visibility on scan/qrcodes routes

---

## [0.1.0] - 2026-03-13

### Added
- **Frontend MVP** (Next.js 16 + React 19 + Tailwind CSS v4)
  - 18 page routes + 8 UI components + mobile routes
  - Landing page, auth pages, dashboard, chat, agent profile
- **Gateway backend** (Express 5 + WebSocket + Redis)
  - Full WS message routing pipeline with streaming
  - AES-256-GCM encryption, rate limiting, dedup, offline queue
  - Agent presence tracking, Security Envelope injection
  - OWASP Top 10 hardening, Helmet, CORS
- **Supabase**
  - 9-table schema with RLS, security hardening migration
  - 8 Edge Functions (tickets, CRUD, stats, decryption)
- **Test infrastructure**
  - Vitest unit + integration tests
  - Playwright E2E tests
  - Redis/Supabase/WS mocks
- **Production deployment config**
  - PM2 cluster, Nginx template, Docker multi-stage build
  - SEO helpers (robots.txt, sitemap.xml)
  - i18n foundation (en, zh-CN, zh-TW, ja)

---

## [0.0.1] - 2026-03-12

### Added
- Project initialization with design assets, requirements, and ECC config
- Product requirements document (PRD)
- Technical specification v3.0.3
- WebSocket protocol supplement
- Testing strategy document
- Agent Teams guide
- Project plan (7 phases)
- ECC v1.8.0 integration (17 agents, 43 commands, 25 skills)
- Design assets: 39 screens, 76 layer screenshots, design tokens, interaction design doc
