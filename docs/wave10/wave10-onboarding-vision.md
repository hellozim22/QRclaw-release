# Wave 10 Onboarding Vision

> 2026-04-28 · 针对 Q8 "开箱即用，打开就看到本机 CLI 连上了"
> 配套 Path C（wave10-recommended-path.md §推荐）

---

## 1. 核心愿景

**zimzheng 打开 QRClaw dashboard 的第一眼，应该看到 4 个 agent 已经在线，可以立刻点进去对话。**

不是：
- ❌ 看到空列表 + "创建你的第一个 Agent" 按钮
- ❌ 看到"请先下载并启动 QRClaw Host"
- ❌ 看到 host token 贴板 + curl 命令
- ❌ 看到 "openclaw login" 引导

而是：
- ✅ 左栏 Chat 里已经有 `Claude Code · 本地在线`、`Cursor Agent · 本地在线`、`Codex · 本地在线`、`OpenClaw · 本地在线`
- ✅ 每个 agent 都是可点击可对话的
- ✅ 第一次发消息就能收到流式回复

---

## 2. 第一次打开的页面流

### Step 0：未登录

标准 Supabase magic link 登录（已实现，不动）。

### Step 1：登录后首屏

**默认路由**：`/chat`（而不是 `/agents`）

初始状态：

```
┌──────────────────────────────────────────────────┐
│ QRClaw                                  zimzheng │
├────────┬─────────────────────────────────────────┤
│ Chat   │                                         │
│  (4)   │   欢迎回来，zimzheng                    │
│ 智能体 │                                         │
│ 公开   │   我检测到你的机器上有 4 个可用的 CLI： │
│ 设置   │                                         │
│        │   ✅ Claude Code    (~/.local/bin/claude)│
│        │   ✅ Cursor Agent  (/usr/local/bin/cursor-agent)
│        │   ✅ Codex         (~/.bun/bin/codex)   │
│        │   ✅ OpenClaw      (npm -g openclaw)    │
│        │                                         │
│        │   它们已经被注册为 agent，可以直接聊。  │
│        │                                         │
│        │   [ 进入 Chat ]                         │
│        │                                         │
└────────┴─────────────────────────────────────────┘
```

如果检测到 0 个 CLI：

```
  没有检测到本机 agent CLI。
  [ 安装 claude-code ] [ 安装 cursor-agent ] [ 安装 codex ]
  或者: [ 用云端 OpenClaw worker ]
```

---

## 3. 本机 CLI 自动检测（核心技术方案）

### 3.1 为什么不能靠 host token UI

现有流程：用户 → 创建 agent → 生成 host token → 粘贴到命令行 → `qrclaw-host --token xxx` 启动 → agent 上线。

这个流程 **zimzheng 自己用也嫌烦**。每次换机器都要来一遍。违背"开箱即用"。

### 3.2 替代方案：本机守护进程 + 自动 pair

核心思路：**QRClaw 在安装时顺便装一个本机守护进程**，守护进程自动和 Supabase user 绑定，自动扫描 CLI。

#### 3.2.1 守护进程架构

```
┌──────────────────┐
│ qrclaw-host 守护 │  启动时：
│ 监听 127.0.0.1   │   1. 读 ~/.qrclaw/config.json 拿到 supabase refresh token
│ :27890 (本机 only)│   2. 和 gateway 建 WS（用 refresh token 换 host JWT）
│                  │   3. 扫描 PATH 找 claude / cursor-agent / codex / openclaw
└──────────────────┘   4. 每找到一个 → POST /api/owner/agents (auto-upsert by binary_path)
         │             5. 订阅 gateway 推来的 run_request 分发到对应 CLI
         ↓
   本机 CLI 进程 (on-demand spawn)
```

#### 3.2.2 首次 pairing

用户第一次装完 `brew install qrclaw` 或 `npm i -g qrclaw-host`：

```bash
$ qrclaw-host pair
Open this URL in your browser to pair this machine:
  https://qrclaw.ai/pair?code=ABC-123-XYZ

[等待用户点击…]
✓ Paired with zimzheng@gmail.com
✓ Config saved to ~/.qrclaw/config.json
$ qrclaw-host start &
✓ Daemon started on 127.0.0.1:27890
✓ Discovered: claude-code, cursor-agent, codex
✓ Registered 3 agents
```

Web 端 `/pair` 页面：

```
  machine pairing
  来自: MacBook-Pro-of-zimzheng (192.168.1.x)
  CLI 识别码: ABC-123-XYZ

  [ 授权这台机器 ]
```

授权后 web 端生成 long-lived refresh token 写回 daemon，从此不用再手动 token。

#### 3.2.3 CLI 探测逻辑

```javascript
// qrclaw-host/src/discovery.ts
const DETECTORS = [
  { provider: 'claude',  probe: () => which('claude')       && version('claude --version') },
  { provider: 'cursor',  probe: () => which('cursor-agent') && version('cursor-agent --version') },
  { provider: 'codex',   probe: () => which('codex')        && version('codex --version') },
  { provider: 'openclaw',probe: () => which('openclaw')     && version('openclaw --version') },
];

for (const d of DETECTORS) {
  const info = await d.probe();
  if (info) {
    await gateway.upsertAgent({
      name: defaultAgentName(d.provider),    // "Claude Code 助手"
      provider: d.provider,
      binary_path: info.path,
      version: info.version,
      execution_mode: 'standard',  // full_access 只在用户显式勾选时
    });
  }
}
```

#### 3.2.4 在线状态

Daemon 每 30s 发 `host_heartbeat`。Gateway 端把 `agents.host_online = (now - last_heartbeat < 90s)`。UI 实时订阅变更。

这和当前 wave 8-9 的 host WS 协议**完全兼容**——只是增加了"auto-registration"一条路径，host WS frame 本身不动。

---

## 4. openclaw / claude / cursor / codex 的自动注册

### 4.1 默认 agent 命名约定

| CLI | 默认 agent 名 | 默认头像 | 默认 instructions |
|-----|---------------|---------|------------------|
| claude | "Claude Code 助手" | Anthropic 橙 | "你是 Claude Code，专注写代码和回答技术问题" |
| cursor-agent | "Cursor 助手" | Cursor 黑 | "你是 Cursor Agent，擅长代码编辑和重构" |
| codex | "Codex 助手" | OpenAI 绿 | "你是 Codex，专注快速代码补全" |
| openclaw | "OpenClaw 通用" | QRClaw 红 | "你是 OpenClaw 通用 agent" |

用户可以随时改名、改 instructions、改头像——这些是 per-agent 的 soft 属性，**不影响自动检测结果**。

### 4.2 避免重复注册

Agent upsert 的**唯一键**：`(owner_id, binary_path)`。
- 同一个 claude binary 不会被注册两次。
- 用户手动改过的 agent 名字不会被 daemon 重启时覆盖（只 upsert `binary_path` / `version` / `host_online`，不 upsert `name` / `instructions`）。

### 4.3 Full Access 模式

默认 `execution_mode = 'standard'`（受限沙盒）。Full Access 需要用户在 UI 显式勾选 + 确认。daemon **永远不**把一个 agent 自动升级为 full_access。

---

## 5. 和 Multica 做法的异同

| 维度 | Multica | QRClaw (Path C + 本方案) |
|------|---------|--------------------------|
| 本机 CLI 绑定 | ❌ 主要是 web agent + 云端 provider | ✅ 以本机为主 |
| Agent 创建流程 | 手动填表 + 选 provider | ✅ 打开就在（自动发现） |
| 多租户 | ✅ team/workspace | ❌ 单人（zimzheng 一人） |
| Agent market | ✅ | ❌ 不做 |
| 开箱即用程度 | 中（需要配 provider key） | **高**（daemon pair 一次，永久） |
| 访客 QR 触达 | ❌ | ✅ 通过 `Publish as QR` 副分支保留 |

QRClaw 相对 Multica 的**差异化定位**：**本机优先、zero-config、私有**。

这个差异化在 pivot 战略里是关键——不是"做一个小号 Multica"，是"做一个 Multica 不做的 niche：本机 personal agent workbench"。

---

## 6. 对应 Path C 的实现安排

### Wave 10 范围内（2 周）

- ✅ `/chat` 成为登录后默认路由
- ✅ daemon pair 流程 + `127.0.0.1:27890` 监听 + refresh token 持久化
- ✅ 本机 4 个 CLI 探测 + 自动 upsert agent
- ✅ host_heartbeat → agents.host_online 链路
- ✅ UI 首屏展示 auto-discovered agents
- ⏳ daemon 打包成 brew/npm 安装包（可以先用 dev mode 手动 `bun run qrclaw-host/index.ts`）

### Wave 10 之外（后续）

- daemon 自动升级 / 自动启动（launchd / systemd）
- Windows 支持（WSL）
- agent 绑定 笔笔省 workspace path（M3）
- agent 间转交消息（M2）

---

## 7. 对 C2 铁律的额外影响检查

Daemon 的加入引入一个新的明文边界：**本机 daemon RAM**。

按 C2 v1.3 原文："明文只存在于两处：(a) 端侧客户端；(b) 已授权的 Edge Function 内存态"。

**daemon 是否算 (a) 端侧客户端？**

我的判断：**算**。理由：
- daemon 运行在 zimzheng 的本机
- 它和 Gateway 的关系，**等同于** OpenClaw plugin host 和 Gateway 的关系
- Wave 5-9 已默认承认 host plaintext 合规（`owner_agent_run_events` 的 plaintext payload 在 host 端天然存在）
- Gateway 只持 KEK 加密，从不解密读路径——这个规则 daemon 场景不变

**建议**：把 "qrclaw-host daemon" 明确写进 C2 v1.4 的"端侧客户端"定义里，避免未来有人把 daemon 理解成"服务端"。这是一个 CLAUDE.md 文案更新任务，Wave 10 acceptance 时提交。

---

## 8. 验收脚本（给 Wave 10 E2E）

```
1. 清理环境：卸载 qrclaw-host，清 ~/.qrclaw
2. 全新登录 qrclaw.ai
3. 断言：/chat 首屏显示 "检测到 0 个本机 agent"
4. 命令行：bun install qrclaw-host && qrclaw-host pair
5. 浏览器自动弹 /pair?code=... → 点 "授权"
6. 断言：CLI 输出 "Paired with zimzheng@..." 和 "Discovered: claude, cursor, codex"
7. 回到 /chat：断言 3 个 agent 在左栏在线（绿点）
8. 点 "Claude Code 助手" → 发消息 "hello" → 3 秒内看到流式回复
9. 杀掉 daemon → 断言 agent 在 90s 内变 "离线"
10. 启动 daemon → 断言 agent 90s 内自动回到 "在线"
```

**全部 pass** 才算 Wave 10 onboarding 部分交付。
