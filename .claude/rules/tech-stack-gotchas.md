# Tech Stack Gotchas

These behavioral notes prevent common mistakes. Read before touching the relevant layer.

## Frontend (`web/`)

- **Tailwind CSS v4**: 通过 `@tailwindcss/postcss` 配置，**没有 tailwind.config 文件**。不要创建或寻找它。
- **React 19**: 使用最新 API（use hook、Server Components）。不要用已废弃的 pattern。
- **Next.js 16**: App Router only。不要使用 Pages Router pattern（getServerSideProps 等）。
- **Zustand 5**: 状态管理。Store 在 `web/src/store/`。

## Backend Gateway (`gateway/`)

- **Express 5** (非 Express 4): 路由语法有变化，error handler 签名不同。不要套用 Express 4 教程。
- **Zod 4** (非 Zod 3): API 有 breaking changes。查看 `gateway/src/ws/schemas.ts` 获取实际用法。
- **JWT 认证**: 使用 ES256 算法（非 HS256）。之前因 HS256 导致 auth 全部失败，已修复。

## Database (Supabase)

- **RLS 必须开启**: 所有新表必须启用 Row Level Security。
- **Edge Functions**: 8 个已定义但目前由 Gateway 内置端点替代，部署优先级低。

## CSP 约束

- **CSP 需要 `script-src 'unsafe-inline'`** — Next.js hydration 依赖，勿删。
- WebSocket 开发环境需要 `ws://localhost:*`。

## 环境变量

| 文件 | 说明 |
|------|------|
| `.env` | 项目根级（Supabase credentials） |
| `web/.env.local` | 前端本地（Supabase URL/Key） |
| `gateway/.env` | Gateway 运行时 |

生产环境模板: `web/.env.production.example`, `gateway/.env.production.example`

## 路由结构

```
web/src/app/
├── page.tsx                     # / → Landing Page
├── not-found.tsx                # 404
├── (auth)/                      # 认证路由组 (login, signup, verify)
├── (dashboard)/                 # Dashboard 路由组 (messages, qrcodes, settings)
├── agent/[agentId]/page.tsx     # Agent Profile
├── chat/[agentId]/page.tsx      # 聊天页
├── claim/[token]/page.tsx       # Agent 认领
├── docs/page.tsx                # 文档
├── pricing/page.tsx             # 定价
├── auth/callback/route.ts       # OAuth 回调
└── m/                           # Mobile 路由 (me, messages, qrcodes, scan)
```

## 组件库

```
web/src/components/
├── ui/          ← Avatar, Badge, Button, Input, MessageBubble, QRCard, TabBar, TopBar
├── chat/        ← ChatInputBar, MessageList, RegisterBanner
├── landing/     ← LandingPage.tsx
├── pricing/     ← PricingPage.tsx
├── docs/        ← DocsPage.tsx
├── dashboard/   ← (待完善)
└── layout/      ← (待完善)
```

## Gateway 源码结构

```
gateway/src/
├── server.ts        ← 入口
├── ws/              ← WebSocket (handler, router, registry, auth, schemas, security-envelope)
├── crypto/          ← AES-256-GCM (envelope, key-manager)
├── redis/           ← Redis (client, dedup, rate-limiter, ip-rate-limiter, offline-queue, presence)
├── routes/          ← HTTP (health, seo)
└── middleware/      ← Express (auth, error-handler, i18n)
```
