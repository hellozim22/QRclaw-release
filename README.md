# QRClaw

> 本地优先的多智能体协作平台 — 像聊天一样管理你的 AI Agent

<p>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS%2014%2B-brightgreen" alt="Platform">
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-1.22%2B-00ADD8?logo=go" alt="Go">
</p>

---

## 📖 简介

QRClaw 是一个本地优先的多智能体协作平台，让个人或团队高效管理多个 AI Agent：

- 💬 **Chat** — 像聊天软件一样和不同 Agent 分别对话
- 🤖 **Agents** — 查看、配置和连接本机 Agent 运行时（Codex、Cursor、Claude Code、OpenClaw、Pi 等）
- 📋 **Progress** — 把长对话沉淀成任务，看板化跟踪进度
- ⚙️ **个人中心** — 管理头像、名称，macOS 桌面更新检测

## 🖥️ 快速体验

macOS 用户可直接安装桌面版：

1. 从 [`download/`](./download/) 获取最新 `QRClaw-0.1.1.dmg`
2. 安装并启动，App 会自动启动本机 Web、Gateway 和 Agent Host
3. 进入左侧 Chat / Agents / Progress 开始试用

> ⚠️ 当前 DMG 是内部测试构建，尚未 Developer ID 签名和公证。
> 首次启动如提示来源未知，请在系统设置中允许打开，或右键选择"打开"。

## 🛠️ 本地开发

### 环境要求

- macOS 14+
- Node.js 20+
- Go 1.22+
- Redis
- 至少一个 Agent CLI（Codex、Cursor、Claude Code、OpenClaw 或 Pi）

### 快速启动

```bash
# 1. 配置密钥（联系维护者获取 ~/.config/qrclaw/secrets.env）
source ~/.config/qrclaw/secrets.env

# 2. 生成本地环境变量
bash scripts/setup-local-env.sh

# 3. 一键启动 Redis + Gateway + Web + Agent Host
bash scripts/dev-up.sh

# 4. 打开产品
open http://localhost:3000/chat
```

### 验证

```bash
cd gateway && npm run typecheck
cd ../web && npm run build
cd ../qrclaw-agent-host && go test ./...
node ../tests/ecc-local-verify-macos-desktop.mjs
```

## 📁 项目结构

```
.
├── web/                          # Next.js 16 前端
├── gateway/                      # Express Gateway + WebSocket
├── qrclaw-agent-host/            # Go 本机 Agent Host
├── apps/macos/QRClaw/            # SwiftUI macOS 桌面壳
├── scripts/                      # 本地启动、打包、更新发布脚本
├── tests/                        # Vitest / Playwright / ECC 验证
├── docs/                         # 产品、部署、桌面更新文档
├── design/                       # 设计资源
├── supabase/                     # 数据库 Schema 与 Edge Functions
├── download/                     # macOS 桌面安装包
└── .claude/                      # Claude Code Agent 配置
```

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 16 · React 19 · Tailwind v4 · TypeScript |
| **后端** | Express 5 Gateway · WebSocket · Redis |
| **Agent Host** | Go 1.22 |
| **数据库** | Supabase (PostgreSQL) |
| **桌面端** | SwiftUI (macOS 14+) |
| **测试** | Vitest · Playwright |

## 🧪 测试

```bash
# 前端测试
cd web && npx vitest run

# E2E 测试
cd tests && npx playwright test

# 本地全套验证
cd source && node tests/ecc-local-verify-macos-desktop.mjs
```

## 🤝 贡献

欢迎贡献！请先阅读以下文档：

- [COLLEAGUE-QUICKSTART.md](./COLLEAGUE-QUICKSTART.md) — 开发环境快速上手
- [docs/desktop-updates.md](./docs/desktop-updates.md) — 桌面更新发布流程
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更记录

## 📄 开源协议

本项目基于 [Apache License 2.0](./LICENSE) 开源。

Copyright [2026] [hellozim22]
