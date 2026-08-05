<p align="center">
  <img src="./docs/assets/qrclaw-logo.jpg" width="80" alt="QRClaw logo">
</p>

<h1 align="center">QRClaw</h1>

<p align="center">
  统一管理多个 AI 智能体、对话与任务的 macOS 桌面工作台。
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-black.svg">
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-green.svg">
  <img alt="Go" src="https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8.svg">
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

---

## 目录

- [产品简介](#产品简介)
- [功能特性](#功能特性)
  - [智能对话](#1-智能对话)
  - [任务看板](#2-任务看板)
  - [智能体管理](#3-智能体管理)
  - [对话与任务联动](#4-对话与任务联动)
  - [历史回放](#5-历史回放)
  - [模型选择](#6-模型选择)
  - [个人中心](#7-个人中心)
- [下载与安装](#下载与安装)
- [开发指南](#开发指南)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 产品简介

QRClaw 将本地运行的多个 AI 智能体——Codex、Cursor、Claude Code、OpenClaw、Pi 等——汇聚到一个 macOS 桌面应用中。像切换联系人一样切换智能体，进行多轮私聊，自动跟踪任务，并在会话之间保留完整上下文。

## 功能特性

### 1. 智能对话

- **按智能体组织的侧边栏：** 左侧列表按智能体组织会话，右侧为多轮私聊面板。
- **像切换联系人一样切换智能体：** 在不同智能体之间切换并多轮私聊，集中处理不同任务。
- **流式输出与执行时间线：** 回复流式输出，同时展示执行过程时间线。
- **新建会话：** 点击「新对话」，清空上下文，开启新会话。
- **历史搜索：** 在搜索框输入关键词，按会话与消息匹配并定位。
- **异常处理：** 运行时离线时提示；网络中断重连后回放断线消息；执行失败标记时间线。

![Chat 对话界面](./docs/assets/screenshots/01-chat-openclaw.png)

### 2. 任务看板

- 将对话中产生的任务按列整理在看板上。
- 支持拖拽排序与状态变更。
- 任务卡片展示标题、关联智能体、更新时间、所属会话快速跳转。
- 支持按智能体过滤和关键词搜索。
- 任务状态流转：待处理 → 进行中 → 待验证 → 已完成。
- 遇到阻塞可以标记「阻塞」并填写原因。

![任务看板](./docs/assets/screenshots/02-progress-board.png)

### 3. 智能体管理

- 查看本机已安装的 Agent 运行时（Codex、Cursor、Claude Code、OpenClaw、Pi 等）。
- 在界面上管理其展示名称与角色，明确分工。
- 查看运行时在线状态。

### 4. 对话与任务联动

- 在对话中直接创建任务卡片进入看板。
- 在任务详情页快速进入关联会话续聊，保持上下文。
- 让对话自动建任务并在续聊前回写进度，目标不丢失。

### 5. 历史回放

- 刷新或重新登录后，能看见所有历史消息。
- 包括关联会话、关联任务状态等。
- 消息持久化不丢失。

### 6. 模型选择

- 为单次对话指定模型，按需取舍速度与质量。

### 7. 个人中心

- 管理头像、名称等个人资料。
- macOS 桌面端支持自动更新检测。

---

## 下载与安装

### macOS

1. 下载安装包：[`QRClaw-0.1.3.dmg`](https://github.com/hellozim22/QRclaw_release/releases/latest/download/QRClaw-0.1.3.dmg)
2. 打开 `.dmg` 文件，将 **QRClaw** 拖入「应用程序」文件夹。
3. 首次启动时，如果 macOS 提示来自未知开发者而阻止运行：
   - 打开「系统设置 → 隐私与安全性」。
   - 向下滚动，在「QRClaw 已被阻止」提示旁点击「仍要打开」。
   - 确认并启动 QRClaw。

---

## 开发指南

### 环境要求

- **Node.js** >= 20
- **pnpm** >= 9
- **Go** >= 1.22
- **Redis**
- **Supabase**（本地或云端）

### 快速启动

```bash
# 克隆仓库
git clone https://github.com/hellozim22/QRclaw-release.git
cd QRclaw-release

# 安装依赖
pnpm install

# 启动前端（Next.js）
pnpm dev:web

# 启动网关（Express + WebSocket）
pnpm dev:gateway

# 启动 Agent 运行时（Go）
cd qrclaw-agent-host && go run .
```

---

## 技术栈

| 层级        | 技术栈                              |
|-------------|-------------------------------------|
| 前端        | Next.js 16, React 19, Tailwind CSS  |
| 网关        | Express 5, WebSocket                |
| Agent 运行时 | Go                                  |
| 后端 / 认证 | Supabase                            |
| 缓存 / 消息  | Redis                               |
| 桌面端      | SwiftUI (macOS)                     |
| 共享类型    | shared/contracts                    |
| 测试        | Vitest, Playwright                  |

---

## 项目结构

```
QRclaw-release/
├── web/                    # Next.js 16 前端
├── gateway/                # Express 5 Gateway + WebSocket
├── qrclaw-agent-host/      # Go Agent 运行时
├── apps/macos/QRClaw/      # SwiftUI macOS 桌面端
├── supabase/               # 数据库 Schema 与 Edge Functions
├── shared/contracts/       # 共享类型契约
├── tests/                  # Vitest / Playwright / E2E 验证
├── docs/                   # 产品、部署、桌面更新文档
├── design/                 # 设计资源
├── scripts/                # 构建与发布脚本
├── download/               # macOS 桌面安装包
├── plugins/openclaw/       # OpenClaw 通道插件
└── .claude/                # Claude Code Agent 配置
```

---

## 贡献指南

欢迎贡献，请遵循以下步骤：

1. Fork 本仓库。
2. 创建功能分支：`git checkout -b feat/your-feature`。
3. 提交更改，撰写清晰的提交信息。
4. 推送到你的 Fork 并发起 Pull Request。

提交 PR 前请确保测试通过。

---

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。
