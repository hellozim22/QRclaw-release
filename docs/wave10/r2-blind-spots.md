# R2 产品战略盲点挖掘 (第一阶段)

> 2026-04-28 · 独立审校员视角 · 不与 cursor R2 并行
> 范围: 用户没说但 Wave 10 落地必须答的 5 个盲点
> 输入: SUMMARY.md, r1-data-model.md, r1-onboarding-design.md, r1-arch-independent-review.md

---

## 0. 摘要

R1 三份文档把"runtime 自动发现 + agent 预建 + session 可建"的骨架搭住了, **但有 5 个产品决定尚未形成闭环**, 直接影响 M2/M3 能否落地:

| # | 盲点 | 未决程度 | 影响 milestone |
|---|---|:---:|:---:|
| 1 | "笔笔省项目"如何被 agent 感知 | 🔴 完全没说 | M3 核心 |
| 2 | Agent 间协作的交互协议 | 🔴 只有一句"A 说交给 B" | M2 核心 |
| 3 | Instructions 物理存储 + 加载时机 | 🟡 有 schema 没协议 | M1 后半 |
| 4 | 4 runtime UI 差异化呈现 | 🟡 默认统一 chat, 但没验证 openclaw 特殊性 | M1 |
| 5 | 开箱即用的摩擦点 (daemon 缺失/版本不匹配/崩溃) | 🟡 只说 install, 没说 recover | M1 acceptance |

每个盲点下面给 3 个候选解 + 推荐解 + Wave 10 分期落地。

---

## 1. 盲点 A — 笔笔省项目感知

### 1.1 具体问题

用户定位说"target project: 笔笔省", 但当前 schema 和 onboarding 都没有**"project/workspace"**概念。实际场景:

- zimzheng 在 chat 里对 Claude Code 说"帮我改笔笔省的记账页"——Claude Code 不知道笔笔省代码在哪
- 要手动每次粘 path? 每次粘 context? 每次切 `cwd`?
- 笔笔省有自己的 CLAUDE.md / .cursorrules / codebase 惯例——怎么被 agent 加载?

**未决**: session 和"工作目录 / project 上下文"是什么关系?

### 1.2 候选解

**A1. Session-level workspace binding (隐式 cwd)**
- `sessions` 表加 `workspace_path text`
- Host spawn 子进程时 `cwd=workspace_path`
- CLI 自身 (Claude Code / Cursor) 会读该目录的 CLAUDE.md / .cursorrules
- 用户建 session 时选一次 path

**A2. Workspace 作为独立表**
- 新表 `workspaces(id, owner_id, name, root_path, default_instructions)`
- `sessions.workspace_id` FK
- 一个 workspace 可被多 session 共用 (跨 runtime 同一项目)
- 支持"笔笔省" workspace 下同时开 Claude Code + Cursor + Codex session

**A3. 无 workspace 概念, 全靠 instructions 注入**
- 在 session.instructions 里让用户自己写 `cd /Users/zeze/bibisheng && ...`
- CLI 子进程用 user home 作为 cwd, 业务 context 纯靠 instructions 文本
- 最简, 但用户体验差, CLAUDE.md 机制用不上

**A4. Git-aware workspace**
- 建 session 时自动探测附近 git repo root
- 存 `workspace_path` + `git_remote_url` + `git_branch`
- UI 显示 "📁 bibisheng · main" 标签

### 1.3 推荐

**A2 + A4 的组合**: workspace 独立表 + git-aware 自动探测。

理由:
- M3 明确"笔笔省 workspace 绑定 + 多 agent 协作"——已经预设 workspace 是一级概念
- 一个项目多 agent 场景非常自然 (同一 repo 开三个 CLI 分工), sessions.workspace_id 比 workspace_path 直接挂 session 更合理
- git-aware 自动探测把"配置摩擦"压到 0: 在 `~/bibisheng` 下建 session, 系统自动识别
- Workspace 表可携带 "项目默认 instructions"——比如"笔笔省用 pnpm 不用 npm", 所有该 workspace 下 session 共享, 这是 Claude CLAUDE.md 机制 + QRClaw 的自然结合

### 1.4 Wave 10 分期

- **M1 不做**: 只落 schema 字段 `sessions.workspace_path (nullable)`, UI 不露出
- **M2**: 建 session 时选 path (UI folder picker), Host spawn 用 cwd, **不建 workspaces 表**
- **M3**: 提升到 `workspaces` 表, 做 git-aware, 支持跨 session 共享

---

## 2. 盲点 B — Agent 间协作协议

### 2.1 具体问题

SUMMARY.md M2: "A 说'交给 B' → UI 一键转发到 B 的私聊"。这句话有四种可能实现:

- A 的 reply 里 markdown `@cursor 帮我做 X` → UI 识别 → 显示 "转发到 Cursor" 按钮
- A 主动调 B (跨 session RPC): A 的输出是 tool_call, Host 接收后 spawn B
- "Team session": 一个 session 多 runtime 参与, messages 有 `from_runtime_id`
- A 作为 "orchestrator", 把 B 当工具 (MCP server 模式)

这四条路径的数据模型和 UI 完全不同。**未决**: 协作粒度是人工转发还是自动 RPC?

### 2.2 候选解

**B1. Markdown @mention + 人工转发 (最浅)**
- A 输出 `@cursor ...`
- UI 高亮该段, 显示按钮 "转发到 Cursor"
- 点击后新建或复用一个 Cursor session, 把该段作为 user message 发进去
- 零后端协议, 纯 UI 约定

**B2. 跨 session forward with context snapshot**
- UI 提供"Forward to agent X"菜单 (右键 message 或整段 run)
- 后端建条 forward_link: `from_session_id, to_session_id, message_ids[], created_at`
- 目标 session 第一条 user message 自动带"Previously @ Claude Code said: ..." 上下文
- 支持回看"这个对话是怎么从 A 接到 B 的"

**B3. Tool-call protocol (agent 主动调)**
- A 的 runtime 支持发 `tool_call: { name: "handoff", target: "cursor", prompt: "..." }` 事件
- Host 识别 tool_call, spawn B, 结果返回给 A
- A 可以 chain 调用多个 B
- 类似 OpenAI Assistants API / MCP

**B4. Team session (multi-participant)**
- 一个 session.runtime_ids = [claude, cursor]
- Host 轮流 spawn 两个 CLI, messages 表增加 `runtime_id` 区分发言方
- 用户主动切"这条问 A 还是 B"
- 类似 Discord channel 多 bot

### 2.3 推荐

**B2 做 M2, B3 留给 M3 (但 schema 预留)**。

理由:
- B1 太浅, @mention 解析脆弱, 没有持久化, 回看断链
- B2 保留"每个 session 仍是单 runtime"的 C5 回放性 (run event 归属明确), 只是加一层 link 元数据
- B3 需要 runtime 侧 hook, Claude Code / Cursor 当前 CLI 不原生支持发 `handoff` tool_call——强行注入会引入自研协议, M2 不该背
- B4 心智复杂, 单人场景用不到 "多 agent 同屏抢话"

Schema 建议:
```sql
CREATE TABLE session_forwards (
  id uuid PK,
  from_session_id uuid FK sessions,
  to_session_id uuid FK sessions,
  source_message_ids uuid[],   -- 被转发的 A 侧消息 ids
  context_prefix text,          -- "Claude Code 先前说..." 自动生成
  created_at timestamptz
);
```

UI:
- message 右键菜单: "Forward to → [Cursor / Codex / OpenClaw]"
- 目标 session 自动创建或复用 (按 workspace + target runtime 寻址)
- 目标 session 首屏显示 "From: Claude Code · 笔笔省"

### 2.4 Wave 10 分期

- **M1**: 不做, schema 不加
- **M2**: session_forwards 表 + UI 右键菜单 + context_prefix 生成 (LLM 自动 summarize 或直接复制 last N 条)
- **M3**: B3 tool-call, 当 runtime 侧开始支持 `handoff` 时启用

---

## 3. 盲点 C — Instructions 物理存储 + 加载时机

### 3.1 具体问题

r1-data-model.md 说 `agents.instructions text` (8000 字上限)。r1-onboarding-design.md 给了 4 个 runtime 默认 instructions 文本。但**加载机制完全没说**:

- 每次请求都拼到 system message? (每次 8KB × N 条对话 = 成本放大)
- 只在 session 初始化时注入一次?
- Claude CLI 自身有 CLAUDE.md 机制 (会自动读 cwd 的 CLAUDE.md), QRClaw 的 instructions 和它冲突?
- 长 instructions 应该走 Anthropic prompt caching? (claude CLI 不一定支持)
- 文件系统写法 (.qrclaw/instructions.md) 还是纯 DB?

**未决**: instructions 是"LLM prompt 内容"还是"CLI 的 runtime config"?

### 3.2 候选解

**C1. 纯 DB + 每次请求注入 (简单)**
- instructions 存 DB, Host spawn CLI 子进程时写入 stdin: `System: {instructions}\n\nUser: {message}`
- 每个 turn 重复, 没 caching
- 简单但消耗 token

**C2. DB 为 SSoT, 写临时文件 + CLI 原生机制**
- session 创建/更新时把 instructions 写到 `~/.qrclaw/sessions/{sid}/CLAUDE.md` (Claude Code 自动读) 或 `.cursorrules` (Cursor)
- spawn 时 cwd 设为该目录 (或目录的 parent)
- CLI 自己负责注入, QRClaw 只管写文件
- 省掉每次注入, 利用 CLI 原生 caching

**C3. DB + prompt caching (Anthropic 原生)**
- 走 Anthropic API 而非 claude CLI, instructions 作为 `system` 字段, 开 `cache_control: ephemeral`
- 5 min cache hit 降 90% 成本
- **但这绕过了"本机 CLI"定位**, 退化成"QRClaw 是另一个 ChatGPT UI"

**C4. 分层 instructions: 全局 + runtime + session**
- `owner.global_instructions` (所有 session 共享, 如"我用 TypeScript + pnpm")
- `runtime.default_instructions` (per runtime, r1-onboarding §6 的 4 段)
- `session.instructions` (overrides)
- 合成时按优先级叠加, 存 DB, 注入方式仍走 C1 或 C2

### 3.3 推荐

**C2 + C4 组合**: 分层 instructions, 物理落在临时文件走 CLI 原生机制。

理由:
- Claude Code 有成熟 CLAUDE.md 机制 (递归向上搜索目录), **重复造轮子没意义**
- workspace 已经有 user 手写的 CLAUDE.md——QRClaw 的 session.instructions 应该和它**叠加**, 不覆盖
- 做法: session cwd = workspace_path, QRClaw 额外在 `workspace_path/.qrclaw/session-{sid}/CLAUDE.md` 写 overlay; claude CLI 自动读取 (向上搜索会命中)
- 对 Cursor / Codex 同理, 写各自原生规则文件
- OpenClaw 不通过 CLAUDE.md, 直接走 stdin system message

分层:
- L0 **runtime 默认** (4 段 best-practice, 用户可关)
- L1 **workspace** (用户自己的 CLAUDE.md, QRClaw 不动)
- L2 **session overlay** (UI 可编辑, 存 DB, 写临时文件)

### 3.4 Wave 10 分期

- **M1**: 只存 `session.instructions text`, 启动 CLI 时写 stdin 为 system message——C1 路径, 简单先跑通
- **M2**: 切换到"写文件给 CLI" (C2), 对 Claude Code 生效, 其他 runtime 按 CLI 能力逐个接
- **M3**: 引入 L0 (runtime 默认) + workspace-level (笔笔省特定规则) 的分层合成, UI 展示三层合成结果预览

---

## 4. 盲点 D — 多 runtime UX 差异化

### 4.1 具体问题

r1-onboarding-design.md §7 画的 UI 默认"所有 runtime 统一 chat 界面"。但四个 runtime **本质不同**:

- **Claude Code / Cursor / Codex**: 纯代码 agent, 输入=自然语言 + 代码, 输出=diff/file edit/command 执行
- **OpenClaw**: QRClaw 自研 channel, 带业务 context (笔笔省记账、客户沟通?), 已有 M0-M4 插件
- Claude Code 有 tool_use (Read/Edit/Bash/WebFetch...) 的可视化需求
- OpenClaw 是不是也需要 tool_use? 还是纯聊天?

**未决**: UI 是一套还是多套?

### 4.2 候选解

**D1. 完全统一 UI**
- 所有 runtime 走 OpenAI SSE 协议抽象
- `tool_use` 统一渲染成折叠卡片 (文件名 + diff 预览)
- 每个 runtime 只有 avatar 和名字不同
- 最省开发成本

**D2. Tab 化的一致 UI + 渲染 adapter**
- 外壳统一 (chat 气泡, markdown, streaming), 但 `tool_use` 渲染交给 per-runtime adapter
- Claude Code 的 `Edit` tool 渲染成 diff 组件; Cursor 的 `apply` 渲染成 patch; Codex 的 code 块直接高亮
- 每个 runtime 一个 React 组件 `<RuntimeToolUse runtime="claude" event={e} />`

**D3. 完全分裂 UI**
- Claude Code 走"IDE-like 界面" (左栏文件树, 右栏 chat)
- OpenClaw 走"业务 console" (保留 Wave 5-9 现有样式)
- 心智严重分裂, 用户切 runtime 等于换产品

**D4. Per-runtime capability flag**
- 每个 `runtime.capabilities jsonb` (已经在 schema 里!)
- capabilities 包含 `supports_tool_use, supports_file_edit, supports_web_search`
- UI 按 flag 动态启用组件
- 新增 runtime (比如 Ollama / LM Studio) 时只加 flag, 不改 UI 代码

### 4.3 推荐

**D2 + D4**: 统一外壳 + adapter 分发 + capability flag 驱动。

理由:
- D1 忽视 tool_use 结构差异, Claude Code 的 `Edit` 事件强行塞成 markdown 会丢 diff 可视化
- D3 碎片化严重, 违反"Multica 范式: 左栏列表, 右栏统一"的心智
- capabilities jsonb 已经在 schema 里, 是对现有设计的**合理延伸**
- 新 runtime 上线路径清晰: 声明能力 → 写渲染组件 → 注册到 adapter map

OpenClaw 特殊性处理:
- 如果 OpenClaw 带业务 widget (客户列表、订单卡片等), 走 capabilities.widgets = [...] 声明, UI 按需加载

### 4.4 Wave 10 分期

- **M1**: D1 统一 UI + markdown + tool_use 折叠为纯文本 JSON dump (临时)
- **M2**: 引入 adapter, Claude Code 的 `Edit` / `Bash` 事件先做可视化 (diff / terminal 输出), 其他 runtime 继续走 fallback
- **M3**: capabilities jsonb 完整化, OpenClaw 业务 widget 接入 (如果用得上)

---

## 5. 盲点 E — 开箱即用的具体摩擦点

### 5.1 具体问题

r1-onboarding-design.md §4 说了"brew install + pair + daemon install"三步。但真实用户旅程里还有四个坑没答:

1. 用户第一次访问 `/chat`, 但本机没 daemon → 如何引导? 浏览器怎么知道?
2. 用户装了 daemon, 但 CLI 还没装 → UI 显示 "Claude Code 未安装", 怎么引导一键装?
3. daemon 崩溃 → 如何自动重启? 如何告诉用户?
4. daemon 版本 < web 版本 (用户 web 自动升级了但 daemon 没跟) → 如何检测 + 提示升级?

**未决**: runtime lifecycle 管理的具体剧本。

### 5.2 候选解

**E1. 浏览器主动探测**
- 首屏 JS 向 `http://127.0.0.1:7823/health` 发请求
- 200 → 已装; 连接失败 → 显示"未检测到 Host"空态 + 安装按钮
- 每 10s 重试, 检测到后自动刷新
- 简单直接, 不依赖服务端

**E2. 服务端 push (via Supabase realtime / SSE heartbeat)**
- Web 不主动探测本机, 而是看"gateway 上是否有此 owner 的 host 正在 heartbeat"
- daemon 离线 → 30s 无 heartbeat → 服务端标记 offline → 前端订阅刷新
- 能跨机检测 (zimzheng 在公司看家里 daemon 状态)
- **单人本地 MVP 不太需要跨机**

**E3. 全自动安装链路 (nuclear option)**
- 首次访问 `/chat` 且无 daemon → 弹窗"QRClaw 需要本机 Host, 一键下载?"
- 点击 → 下载 DMG → 引导用户拖到 Applications → 启动 → 自动 pair
- pair 通过浏览器 postMessage + custom URL scheme (`qrclaw://pair?code=...`)
- 用户体验最顺, 开发成本最高

**E4. 进程监护 (daemon 自身)**
- LaunchAgent / systemd 自带 restart-on-failure
- daemon 崩溃 5s 内自动拉起
- daemon 自检: 启动时发 `POST /gateway/handshake { daemon_version, web_min_version }`
- 版本不匹配 → daemon 日志报错 + web 首屏横幅"请升级 QRClaw Host"

### 5.3 推荐

**E1 (探测) + E3 (安装引导) + E4 (监护) 组合**, E2 延后。

理由:
- E1 解决"我来了但你没装"——零依赖, 必须有
- E3 解决"那我怎么装"——降到"一次点击下 DMG + 拖动 + 起"
- E4 解决"装完了会不会崩"——LaunchAgent 自带重启能力, 版本握手成本低 (一个 POST)
- E2 在 gateway 内联化 (R1 §4.1 结论) 场景下退化为"进程内 EventEmitter", MVP 不单独做

具体协议建议:
```
// 浏览器探测
GET http://127.0.0.1:7823/v1/health
→ 200 { daemon_version, web_min_version, runtimes: [...] }
→ 连接失败 → 显示安装空态

// 版本握手
if (daemon_version < web_min_version) show banner
if (daemon_version > web_max_version) show "Please upgrade web"

// 崩溃恢复
LaunchAgent KeepAlive=true + ThrottleInterval=10s
浏览器探测失败 10s 后显示 "Host 离线, 正在重启..."
```

### 5.4 Wave 10 分期

- **M1**: E1 + E4, 浏览器轮询 + LaunchAgent 自起, 版本握手只做字段留空
- **M2**: E3 下载引导 (DMG pipeline + postMessage pair)
- **M3**: E2 跨机 realtime (若产品需要 cloud 同步则做)

---

## 6. 综合 Wave 10 分期建议

整合五个盲点的落地, 给执行 agent 的最小交付切片:

### M1 (Wave 10 核心, 第 1-3 周)

加到 SUMMARY.md Sprint 1-3 的任务:

- **Sprint 1**: 
  - `sessions.workspace_path text NULL` 字段落库 (盲点 A M1)
  - 浏览器 `/chat` 首屏探测 `127.0.0.1:7823/health` (盲点 E E1)
  - LaunchAgent KeepAlive + daemon `/health` endpoint (盲点 E E4)
- **Sprint 2**: 
  - session.instructions 存 DB + stdin 注入 (盲点 C C1)
  - 统一 chat UI, tool_use 先 JSON dump (盲点 D D1)
- **Sprint 3**: 
  - daemon 版本握手字段启用, 不匹配显示 banner (盲点 E E4)
  - E2E 覆盖: daemon 崩溃自动重启 + 浏览器探测刷新

### M2 (第 4-7 周)

- `session_forwards` 表 + 右键菜单 (盲点 B B2)
- session UI 加 workspace folder picker, Host spawn 用 cwd (盲点 A M2)
- instructions 切换到写 CLAUDE.md 临时文件 (盲点 C C2)
- tool_use adapter, Claude Code 的 Edit/Bash 可视化 (盲点 D D2)
- DMG 下载引导 + custom URL scheme pair (盲点 E E3)

### M3 (第 8-12 周)

- `workspaces` 表 + git-aware 自动探测 (盲点 A M3)
- B3 tool-call protocol 预研 (盲点 B)
- 分层 instructions 合成 (L0/L1/L2) (盲点 C M3)
- capabilities jsonb 完整化, OpenClaw 业务 widget (盲点 D M3)
- (可选) 跨机 realtime (盲点 E E2)

---

## 7. 对 cursor R2 的"等审校清单"

等 cursor R2 C1-C6 出完后, 我会检查:

- [ ] R2 是否回答了盲点 A~E 中的任何一个? (预期: R2 偏技术约束, 可能不覆盖 A/B 产品问题)
- [ ] schema 是否和本文 §2.3 `session_forwards` / §1.3 workspace 规划冲突?
- [ ] instructions 注入机制是否被 R2 定义? (落在 C1 protocol 还是 C5 lifecycle?)
- [ ] version handshake 是否被 R2 纳入 Host WS frame?
- [ ] 是否有"daemon = 端侧客户端"的 C2 边界重申? (避免后面被误改成加密节点)

---

## 8. 红线 (与 R1 铁律一致)

本文提出的任何方案都不得破坏:

1. **C2 单人本地模式下降级**仍应成立 (R1 §5.3): workspace 文件、CLAUDE.md overlay、session forward context 都写本机用户目录, 不上云
2. **Host WS 协议冻结** (SUMMARY §57 红线 3): B3 tool-call 新 frame 只在 M3 启用, M1/M2 不改 wire format
3. **C5 回放正确性**: session_forwards 表**只加链接**, 不修改 message / run 主表; 回放仍按 session_id 单向

— End —
