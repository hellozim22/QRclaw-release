# 🤖 QRClaw — 像聊天一样管理你的 AI Agent

**QRClaw** 是一个本地优先的多智能体协作平台。它把多个 AI Agent（比如写代码的、管产品的、做测试的）集中到一个聊天界面里，让你像用微信一样给不同 Agent"发消息、派任务、盯进度"——所有数据都存在你自己的电脑上。

---

<div align="center">

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2014%2B%20%7C%20Linux-lightgrey)](https://github.com/hellozim22/QRclaw-release)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![Go](https://img.shields.io/badge/go-1.22-00ADD8?logo=go)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)

</div>

---

## ✨ 它能做什么？

| 功能 | 说明 |
|------|------|
| 💬 **Chat 多 Agent 对话** | 像聊天软件一样，左边选 Agent，右边发消息。产品 Agent、开发 Agent、测试 Agent 各聊各的，互不干扰。 |
| 🤖 **Agent 管理** | 查看当前可用的 Agent 运行时（Codex、Cursor、Claude Code、OpenClaw、Pi 等），配置并连接你本机的 AI 工具。 |
| 📋 **Progress 任务看板** | 把长对话里的需求自动沉淀成任务卡片，用看板跟踪每件事的状态——谁在做、做到哪了、做完了没。 |
| ⚙️ **个人中心** | 管理头像和昵称，macOS 桌面应用支持一键更新到最新版本。 |

### 🎯 一句话总结

> 你有多个 AI Agent 要管？打开 QRClaw，聊天即协作，任务即看板。

---

## 📸 界面预览

> *（截图即将更新，敬请期待）*

```
┌──────────────────────────────────────────────────────┐
│  🏠 QRClaw                         ⚙️ 设置  👤 头像  │
├──────────┬───────────────────────┬───────────────────┤
│          │                       │                   │
│  💬 聊天  │   🗨️ 对话区域         │   📋 任务详情      │
│  🤖 Agent │                       │                   │
│  📋 进度  │   你好！帮我          │   待办             │
│          │   分析一下这个需求…     │   ☐ 需求分析      │
│          │                       │   ✓ 代码实现      │
│          │   已收到，我先          │   → 测试中        │
│          │   梳理一下…            │                   │
│          │                       │                   │
├──────────┴───────────────────────┴───────────────────┤
│  💬 输入你的消息…                        📎 发送 ➤   │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 快速上手

### 👤 给普通用户（macOS）

> 把 QRClaw 当成一个普通的 macOS 应用来用就行。

1. **下载安装包**
   从 [Releases 页面](https://github.com/hellozim22/QRclaw-release/releases) 下载最新的 `.dmg` 文件。

2. **拖入应用程序文件夹**
   双击 `.dmg`，把 QRClaw 拖到 Applications 里。

3. **打开并登录**
   首次打开会引导你登录/注册。登录后就能看到你的 Agent 列表了。

4. **开始聊天**
   选一个 Agent，直接打字发消息。Agent 会像真人一样回复你。

5. **查看任务进度**
   聊着聊着有了待办事项？切换到「进度」页面，所有任务一目了然。

> 💡 **提示：** 桌面应用会自动检测更新，有新版本时会有提示，点击即可一键升级。

---

### 👨‍💻 给开发者（本地开发）

> 如果你想自己跑起来改代码，按下面步骤操作。

#### 你需要先装好

- [Node.js](https://nodejs.org) >= 22
- [Go](https://go.dev) >= 1.22
- [pnpm](https://pnpm.io)（前端包管理）
- [Redis](https://redis.io)（本地跑 Gateway 需要）
- [Supabase CLI](https://supabase.com/docs/guides/cli)（数据库）

#### 一键启动

```bash
# 1. 克隆仓库
git clone https://github.com/hellozim22/QRclaw-release.git
cd QRclaw-release

# 2. 安装所有依赖（前端 + 后端）
pnpm install

# 3. 启动数据库（需要 Docker）
supabase start

# 4. 启动开发环境（一键启动前端、Gateway、Agent Host）
pnpm dev
```

启动后打开浏览器访问 `http://localhost:3000` 即可看到界面。

#### 各模块单独启动

```bash
# 只启动前端
pnpm --filter web dev

# 只启动 Gateway
pnpm --filter gateway dev

# 只启动 Agent Host（Go）
cd qrclaw-agent-host && go run ./cmd/server
```

#### 跑测试

```bash
# 单元测试
pnpm test

# E2E 测试（需要先启动开发环境）
pnpm test:e2e
```

---

## 🧱 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 🖥️ **前端** | Next.js 16 · React 19 · Tailwind CSS v4 · TypeScript | 聊天界面、Agent 管理、任务看板 |
| 🌐 **后端 Gateway** | Express 5 · WebSocket · Redis | API 网关、实时消息推送、会话管理 |
| ⚙️ **Agent Host** | Go 1.22 | 本机 Agent 运行时管理（启动、监控、通信） |
| 🗄️ **数据库** | Supabase (PostgreSQL) | 用户数据、会话记录、任务看板数据 |
| 🍎 **桌面端** | SwiftUI (macOS 14+) | macOS 原生桌面壳，自动更新 |
| 🧪 **测试** | Vitest · Playwright | 单元测试、E2E 自动化测试 |

---

## 📁 项目结构

```
QRclaw-release/
├── web/                          # 🖥️  Next.js 16 前端（聊天界面、Agent 管理、任务看板）
├── gateway/                      # 🌐  Express 5 Gateway + WebSocket（API 网关）
├── qrclaw-agent-host/            # ⚙️  Go 本机 Agent Host（Agent 运行时管理）
├── apps/macos/QRClaw/            # 🍎  SwiftUI macOS 桌面壳
├── scripts/                      # 🔧  本地启动、打包、更新发布脚本
├── tests/                        # 🧪  Vitest / Playwright / ECC 验证
├── docs/                         # 📖  产品文档、部署指南、桌面更新文档
├── design/                       # 🎨  设计资源
├── supabase/                     # 🗄️  数据库 Schema 与 Edge Functions
├── download/                     # 📦  macOS 桌面安装包
└── .claude/                      # 🤖  Claude Code Agent 配置
```

---

## 🤝 贡献指南

我们非常欢迎社区贡献！无论是提 Bug、改文档、还是加新功能，都非常感谢 🙏

### 参与方式

1. **🐛 报告问题**
   在 [Issues](https://github.com/hellozim22/QRclaw-release/issues) 里描述你遇到的问题，尽量附上截图和复现步骤。

2. **💡 功能建议**
   也去 Issues，用「Feature Request」标签，说说你想要什么功能、为什么需要它。

3. **🔧 提交代码**
   ```bash
   # Fork 仓库 → 创建分支 → 修改 → 提交 PR
   git checkout -b feat/my-awesome-feature
   git commit -m "feat: 加了超棒的功能"
   git push origin feat/my-awesome-feature
   # 然后在 GitHub 上发起 Pull Request
   ```

### ECC 开发规范

QRClaw 遵循 **ECC（高效协作规范）**：

- ✅ **先理解再动手** — 改之前确保理解现有设计和意图
- ✅ **Plan Before Execute** — 复杂改动先写方案再敲代码
- ✅ **文档即契约** — PRD、设计文档和代码要保持一致
- ✅ **测试即验收** — 每个功能要有对应的测试用例

更详细的规范请查看 `docs/` 目录下的开发文档。

---

## 📄 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

> 简单说：你可以自由使用、修改、分发这个项目，也可以用于商业用途，但需要保留版权声明和许可证。

---

## 🔗 相关链接

- 📦 **GitHub 仓库：** [github.com/hellozim22/QRclaw-release](https://github.com/hellozim22/QRclaw-release)
- 📖 **文档：** 见 `docs/` 目录
- 🐛 **问题反馈：** [Issues](https://github.com/hellozim22/QRclaw-release/issues)

---

<div align="center">

**QRClaw — 聊天即协作，任务即看板**

Made with ❤️ by the QRClaw Team

</div>
