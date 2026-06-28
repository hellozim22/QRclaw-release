# QRClaw — Claude Code Agent Teams 开发指南

> 从零开始，用 Claude Code Agent Teams 组建 AI 开发团队
> 适合 macOS · 腾讯内部 Claude Code

---

## 概览：什么是 Agent Teams？

**Agent Teams = 你是 CEO，Claude 是 CTO（Team Lead），它帮你招聘和管理一整个 AI 开发团队。**

每个"队友"（Teammate）是一个独立的 Claude Code 实例，有自己的上下文窗口，负责独立的开发任务，队友之间可以直接沟通协作。

| 维度 | 传统（单个 Claude） | Agent Teams |
|------|------|------|
| 并行度 | 一次只能做一件事 | 前端、后端、测试同时进行 |
| 上下文 | 所有代码共享一个窗口（容易溢出） | 每个队友独立窗口，互不干扰 |
| 沟通 | 只有你和 Claude 对话 | 队友之间可以直接对话 |
| 效率 | 1x | 3-5x |
| 成本 | 低 | 高（每个队友都消耗 token） |

---

## 环境准备

### 必备工具

| 工具 | 检查命令 | 期望输出 |
|------|---------|---------|
| Node.js 18+ | `node -v` | v18.x 或更高 |
| Git | `git --version` | git version 2.x |
| tmux | `tmux -V` | tmux 3.x |
| Claude Code | `claude-internal --version` | 版本号 |

### 安装

```bash
# tmux（Agent Teams 分屏必需）
brew install tmux

# iTerm2（推荐终端）
brew install --cask iterm2
```

---

## 启用 Agent Teams

### 方式一：修改 settings.json（永久生效，推荐）

```bash
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'EOF'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "permissions": {
    "allow": ["Read", "Write", "Execute"]
  },
  "teammateMode": "tmux"
}
EOF
```

### 方式二：环境变量（临时生效）

```bash
echo 'export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1' >> ~/.zshrc
source ~/.zshrc
```

### 验证

```bash
cd /Users/zeze/qrclaw
claude-internal
# 输入：请创建一个简单的 agent team 来测试功能是否正常
```

---

## QRClaw 推荐团队结构

```
                ┌─────────────┐
        ┌────── │  Team Lead   │ ──────┐
        │       │  (编排协调)   │       │
        │       └──────┬──────┘       │
        │              │              │
┌───────▼──────┐ ┌────▼────────┐ ┌───▼────────────┐
│ 前端 Teammate │ │ 后端 Teammate│ │ 数据库 Teammate │
│              │ │             │ │               │
│ Next.js 15   │ │ Gateway     │ │ Supabase      │
│ Dashboard    │ │ WebSocket   │ │ Schema + RLS  │
│ Visitor Chat │ │ 消息路由     │ │ Edge Funcs    │
└──────────────┘ └─────────────┘ └───────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
               ┌───────▼──────┐
               │ 测试 Teammate │
               │              │
               │ Unit Tests   │
               │ E2E Tests    │
               └──────────────┘
```

| 角色 | 负责内容 | ECC Agent | 模型 |
|------|---------|-----------|------|
| Team Lead | 任务分配、进度协调、冲突解决 | architect + planner | Opus |
| 前端 | Dashboard UI、Visitor Chat、i18n | — | Sonnet |
| 后端 | Gateway、WebSocket、加密、Redis | — | Sonnet |
| 数据库 | Schema、RLS、Edge Functions、迁移 | — | Sonnet |
| 测试 | 单元测试、E2E、覆盖率门禁 | tdd-guide + e2e-runner | Sonnet |

---

## 启动开发

### 启动 Prompt（复制到 Claude 对话）

```
我要开发 QRClaw 项目。请创建一个 Agent Team：

团队结构：
1. 前端 Teammate（frontend）：负责 Next.js 15 前端开发，包括 Owner Dashboard 和 Visitor Chat 页面。
   请阅读 requirements/product-requirements.md 了解需求，参考 design/ 目录的设计稿。使用 Sonnet 模型。

2. 后端 Teammate（backend）：负责 Node.js Gateway 开发，包括 WebSocket 实时通信、消息路由、AES-256-GCM 加密。
   请阅读 requirements/technical-specification-v3.0.3-combined.md 的技术方案。使用 Sonnet 模型。

3. 数据库 Teammate（database）：负责 Supabase 数据库，包括 Schema 设计、RLS 策略、Edge Functions。
   请阅读技术方案的 §11 数据库章节和补充协议的 §P7 章节。使用 Sonnet 模型。

工作要求：
- 所有 Teammate 必须阅读 CLAUDE.md 了解项目约束
- 遵循 TDD（先写测试再实现）
- 每个 Teammate 先提交计划，获得批准后再开始编码
- 使用 tmux 分屏模式
```

---

## tmux 分屏操作

所有 tmux 快捷键以 `Ctrl+B` 开头（先按，松开，再按后面的键）：

| 操作 | 按键序列 |
|------|---------|
| 切换窗格 | `Ctrl+B` → `O` |
| 跳到指定窗格 | `Ctrl+B` → `Q` → 数字 |
| 全屏/恢复窗格 | `Ctrl+B` → `Z` |
| 翻页模式 | `Ctrl+B` → `[`（`Q` 退出） |
| 关闭当前窗格 | `Ctrl+B` → `X` |
| 显示所有会话 | `Ctrl+B` → `S` |

---

## 日常管理命令

| 你想做的事 | 在 Lead 窗口中说 |
|---------|-------------|
| 查看所有任务状态 | "请显示当前所有任务的状态" |
| 给某个队友新任务 | "请让前端队友去实现 i18n 功能" |
| 让队友暂停 | "请让后端队友暂停当前工作" |
| 查看某队友进度 | "后端队友目前在做什么？" |
| 解决队友冲突 | "前端和后端对 API 格式有分歧，请协调" |
| 结束整个团队 | "请清理整个团队" |

---

## 常见问题

**Q: 队友做错了怎么办？**
在 Lead 窗口说："前端队友的实现不对，请让它回滚并重新按照协议格式实现"。也可以切换到队友窗格直接沟通。

**Q: 队友之间有代码冲突？**
规划任务时确保每个队友负责的文件不重叠。前端只碰 `web/`，后端只碰 `gateway/`。

**Q: Token 成本？**
4 个队友 ≈ 4 倍 token。队友用 Sonnet（便宜），只有 Lead 用 Opus。不需要的队友及时关闭。

**Q: 中途退出后怎么恢复？**
重要代码及时 `git commit`，退出前让 Lead 总结进度。重新启动后告诉 Claude 之前的进度。

**Q: 版本不支持 Agent Teams？**
升级：`npm update -g @tencent/claude-internal`。备选：手动开 3-4 个终端窗口独立运行。
