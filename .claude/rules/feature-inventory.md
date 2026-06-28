# Feature Inventory

已实现功能清单。开发前先查此表，避免重复实现或引用不存在的功能。

## 已完成功能

| 功能 | 代码位置 | 说明 |
|------|---------|------|
| 25 页面路由 | `web/src/app/` | Landing, Auth(3), Dashboard(4+settings子页4), Agent, Chat, Claim, Docs, Pricing, Terms, Privacy, Q/[slug], Mobile(5) |
| 8 UI 组件 | `web/src/components/ui/` | Avatar, Badge, Button, Input, MessageBubble, QRCard, TabBar, TopBar |
| Gateway WS | `gateway/src/ws/` | WebSocket 连接、消息路由、认证、安全信封 |
| 消息加密 | `gateway/src/crypto/` | AES-256-GCM 端到端加密 |
| Redis 服务 | `gateway/src/redis/` | 缓存、去重、限流、离线队列、在线状态 |
| 消息持久化 | `gateway/src/ws/handler.ts` | persistMessage() 加密写入 Supabase |
| 消息历史 | `gateway/src/routes/` + `web/` | `/api/messages` + 前端 `loadHistory()` |
| system_prompt | `gateway/src/ws/router.ts` | 转发消息附带 system_prompt（5 分钟缓存） |
| Markdown 渲染 | `web/src/components/chat/` | Agent 回复支持加粗/代码块/链接/列表 |
| 邮箱订阅 | `gateway/src/routes/` + `web/` | CTA Subscribe + `/api/subscribe` + Supabase subscribers |
| 安全加固 | `gateway/src/` | Dual-auth + CSP + ticket refresh |
| 法律页面 | `web/src/app/` | Terms of Service + Privacy Policy |
| 视觉还原 | `web/src/` | Landing/Login/Signup/Docs/Footer 对齐设计稿 |
| Schema + RLS | `supabase/migrations/` | 2 个迁移文件（init + security hardening） |
| 8 Edge Functions | `supabase/functions/` | 已定义，Gateway 内置端点替代中 |
| 测试框架 | `tests/` | Vitest(15) + Playwright(4) + Mocks(3) |
| 生产部署 | Vercel + 腾讯云 Docker | 30/30 PASS 验证完成 |

## 进行中

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Edge Functions 部署 | 目前由 Gateway 内置端点替代 | 低 |

## 待修复

详见 `test-results/fix-list.md`（12 项 MEDIUM + LOW）
