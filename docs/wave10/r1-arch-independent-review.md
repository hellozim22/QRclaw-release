# R1 独立架构综合审查 — 单人本地部署视角

> 2026-04-28 · 独立审查（不重复 cursor R1 文档工作）
> 视角：站在"一个人一台机器 + Multica 范式"的立场重评估 Wave 10 架构
> 不动代码；Read ≤ 10 次已用完

---

## 0. TL;DR

**当前架构（gateway + supabase + edge functions + go host + Wave 1 migration 379 行）对"单人本地"严重超配。** Multica 参考实现证明: Electron + JSON 文件 + subprocess stdio 就够了, **连数据库都不要**。

但 QRClaw 不是从零起步。Wave 5-9 的 75-80% 沉淀真实存在, 铁律 C2 已经成文。我的建议不是推倒, 而是:

1. **Runtime/Agent/Session 三层合并为两层**: `runtime` + `session`, 去掉 `agent`——对单人用户 agent 是冗余间接层。
2. **给 C2 设置"单人本地模式"逃生阀**: 当 `host_type=local` 且 owner 数 = 1 时, 降级为"sqlite + 本机文件系统权限", 不跑 KEK/DEK。
3. **可选 Supabase**: MVP 下"双击即用"路径用 sqlite + Node 单进程; Supabase 作为 "opt-in cloud sync" 后置到 M2+。
4. **Gateway 内联化**: 单人本地时, gateway 不是独立进程, 而是 web 应用的 API route (Next.js `/api/*`)。

---

## 1. 单人部署精简度评估

### 1.1 当前架构的组件清单

从 `gateway/package.json` + `supabase/migrations` + CLAUDE.md 归纳:

| 组件 | 角色 | 单人本地必要度 |
|---|---|:---:|
| `web` (Next.js 16) | UI + owner 面 | ✅ 必须 |
| `gateway` (Express 5 + ws + ioredis + pm2) | 中立中继 + 加密写路径 + Host WS + SSE | ⚠️ 可内联 |
| `supabase` (Postgres + RLS + Edge Functions) | 数据+加密读路径 | ❌ 过重 |
| `qrclaw-agent-host` (Go 长驻) | 本机 CLI detect + spawn | ✅ 必须 |
| `shared` crypto (KEK/DEK) | C2 合规 | ⚠️ 单人场景下降级 |
| PM2 / Docker Compose | 运维 | ❌ 不需要 |
| Redis (ioredis) | fanout / session | ❌ 单人不需要 |

**结论**: 对 zimzheng 一个人, **至少 4 个组件是"SaaS 残留"**——gateway 独立进程、Supabase、Redis、PM2。

### 1.2 Multica 对比基线

来自 [gccrpm/multica](https://github.com/gccrpm/multica) 实际 repo:

- **Electron + Vite + React + TypeScript**, 单一进程
- Sessions 存 `~/.multica/sessions/*.json`, 无数据库
- Agents 通过 **ACP (Agent Client Protocol) subprocess stdio** 通信
- No daemon, no gateway, no cloud backend
- "Client-side storage: your data never leaves your machine"

Multica 交付"单人可用"的组件数 = **1**（Electron binary）。QRClaw 现在组件数 ≥ 5。

### 1.3 每组件的"单人本地必要性"论证

**Gateway 独立进程是否必要?**
- Wave 5-9 的 gateway 承担: ① encrypt 写入 ② host WS hub ③ owner fanout ④ SSE
- 单人本地: ①~~加密~~(本机不需要), ② host WS 直连 web 的 Next.js API route, ③ ~~fanout~~(就一个 owner), ④ SSE 可用 Next.js App Router streaming
- **结论**: 独立 gateway 进程可以消失, 语义迁移到 `web/app/api/host/ws/route.ts` + `web/app/api/chat/[id]/stream/route.ts`

**Supabase 是否必要?**
- 提供: Postgres schema + RLS + `decrypted-messages` Edge Function + auth
- 单人本地: Postgres RLS ~~无意义~~(就一个 owner), Edge Function 是"受信边界"概念, 对本机用户没有威胁模型, auth 可用本机 pairing code
- **结论**: sqlite + 文件系统权限 + 本机 pairing 即可替代。Supabase 只在"想把 chat 记录跨机同步"时 opt-in。

**Redis 是否必要?**
- ioredis 在 gateway deps 里——看 package.json 是真实依赖
- 用途推测: run event fanout、session 缓存
- 单人本地: 单进程, Node 进程内 EventEmitter 就够
- **结论**: 废弃。

### 1.4 数字化结论

| 场景 | 组件数 | 磁盘占用(估) | 首次启动步骤 |
|---|---|---|---|
| 当前 Wave 5-9 | 5+ (web, gateway, supabase-stack, host, redis) | ~500MB | docker compose up + supabase start + pm2 start + host register |
| Multica 参考 | 1 (Electron) | ~150MB | 双击 .app |
| **建议 MVP** | 2 (web-with-embedded-api, host) | ~80MB | 双击 QRClaw.app (内嵌 Next standalone + sqlite) |

---

## 2. Runtime / Agent / Session 三层能否合并?

### 2.1 cursor 在 r1-data-model.md 提出的三层

```
agent_runtimes (owner_id, host_id, runtime_type, binary_path, ...)
  ↓ powers
agents (owner_id, runtime_id, name, instructions, is_default)
  ↓ has
owner_agent_sessions (owner_id, agent_id, title, ...)
```

这是一个**清楚**的三层: runtime 是"能力", agent 是"绑能力的人格", session 是"对话"。

### 2.2 语义复杂度对单人用户

想象 zimzheng 的 mental model:
- "我有 4 个 CLI" ← runtime
- "我想开一个新对话跟 claude 聊 笔笔省" ← 需要他先创建 agent, 再创建 session?
- "我还想跟同一个 claude 聊个别的话题" ← 又开一个 session? 还是又开一个 agent?

**对单人用户, agent 层是 SaaS 心智的残留**——SaaS 需要 agent 因为要 publish、要绑 QR、要给不同 visitor 看不同人格。**单人用本地 CLI, "agent"="这个 CLI 本人"**。

### 2.3 Multica 怎么做?

查了 repo: Multica CLI 有 `/agents` 和 `/sessions` 两个命令, **两者都是 client 概念**, 但 "agent" 实际上 ≈ "runtime type"——指的是 ACP subprocess 种类（claude-code-acp / opencode / ...）, **不是 QRClaw 意义上的"带 instructions 的可配置实体"**。

也就是说 Multica 的 `agent` ≈ QRClaw 的 `runtime`。**Multica 没有 QRClaw 意义的 agent 层**。

### 2.4 推荐: 二层模型

```
runtimes (owner_id, host_id, runtime_type, binary_path, status, ...)
  ↓ has
sessions (owner_id, runtime_id, title, instructions, status, ...)
```

关键变化:
- 删除 `agents` 表, `instructions` 下沉到 `sessions.instructions`
- 默认 instructions 存在 `runtimes.default_instructions` (类似 CLAUDE.md per-runtime)
- 新开 session 时从 runtime 拷贝默认 instructions, 可编辑 per-session
- "agent = 默认 instructions template" 的语义由 `runtimes.default_instructions` + UI 初始值表达

**代价**:
- 丢掉"把同一个 agent 应用到多个 session"的能力——但单人场景不需要
- 未来做"跨 session shared agent persona"时再加一个 `personas` 表, 按需扩展, 不前置建模

**收益**:
- migration 大幅简化 (agents 表 + agent_bindings 表 + UNIQUE 约束全部去掉)
- UI 心智: 左栏 = runtimes (带在线状态), 右栏展开 = 该 runtime 的所有 sessions, 点击进入 chat——**跟 Multica 范式完全对齐**
- cursor r1-data-model.md 的 rename-first migration 变成**三步删除**: drop `agent_bindings`, drop `agents` 表, rename `owner_agent_conversations` → `sessions` 并加 `runtime_id` FK

### 2.5 反对意见（自我辩驳）

> "agents/page.tsx 创建向导 85% 保留是说过的, 删 agents 表不是打脸吗?"

不冲突。那个创建向导在 Multica 范式下变成**"创建 session 时选 runtime + 填名字/instructions"**, 组件逻辑 80% 复用, 只是绑定的实体从 `agent` 改为 `session`。

> "visitor/QR 分支冷冻保留, 那边需要 agent 表吧?"

visitor 路径原 schema (`owner_agent_conversations`, `agent_bindings`) 继续冻结在 Wave 5-9 状态。新路径建 `sessions` 表, 老表不迁不删, 作为"废弃但仍有数据"保留。Path C 的 route group 分层思路刚好允许这种并存。

---

## 3. Multica 真实范式（查实际 repo）

### 3.1 核心事实

来源: [gccrpm/multica GitHub](https://github.com/gccrpm/multica), [vampireachao blog](https://vampireachao.github.io/2026/04/13/multica/), [CSDN](https://blog.csdn.net/TechChasee/article/details/160259389)

| 维度 | Multica 实现 |
|---|---|
| 部署形态 | Electron desktop app (macOS / Linux / Windows build) |
| 进程数 | 1 (Electron main + renderer), 加 spawn 的 agent subprocesses |
| 存储 | `~/.multica/sessions/index.json` + `data/{session-id}.json` |
| 协议 | Agent Client Protocol (ACP) 标准, subprocess stdio |
| Tech | Electron + Vite + React + TS + Vitest + pnpm |
| 跨机同步 | ❌ 无 (local-first 是卖点) |
| Auth | ❌ 无 (本机用户) |
| 加密 | ❌ 无 (文件系统权限即护栏) |

### 3.2 对 QRClaw 的冲击

**Multica 的"local-first"不是营销词, 是架构骨干**。如果 QRClaw pivot 到 Multica-style 却保留 gateway + supabase + RLS + 加密协议, **那不是 Multica, 是"穿 Multica 皮的 SaaS"**。

两个选择:
- **A. 真 Multica**: 放弃 gateway/supabase, 走 Electron/Next.js standalone + sqlite
- **B. 企业版 Multica**: 保留当前架构, 把 Multica 定位为"UI 范式参考", 未来 B2B 卖给团队

cursor 的 R1 文档和 SUMMARY.md 目前隐含在走 **B 的一半**: 保留 gateway/supabase, 但产品定位是 A (zimzheng 一人用)。**这个撕裂是最大的架构 debt**。

### 3.3 我的判断

走 **A', 但保留 Wave 5-9 可演进到 B 的钩子**:

- MVP: sqlite + Next.js standalone, 无 gateway, 无 supabase
- 保留 `shared/crypto` 模块和加密 schema 设计文档, 不激活
- `host_type` 字段保留, 为未来 cloud host 留位
- 当 zimzheng 说"我想把笔记从公司 mac 同步到家里 mac"时, **加一个可选 sync 后端**（可以是 Supabase, 也可以是 rclone + sqlite 文件）

---

## 4. MVP 最低可用架构

### 4.1 组件图（能跑起来的最小子集）

```
┌────────────────────────────────────────────┐
│  QRClaw Desktop (Tauri or Electron shell)  │
│  ┌──────────────────────────────────────┐  │
│  │  Next.js (standalone build)          │  │
│  │  - UI (React 19, Markdown, SSE)      │  │
│  │  - /api/chat/[sid]/stream (SSE)      │  │
│  │  - /api/runtimes/detect              │  │
│  │  - sqlite (better-sqlite3)           │  │
│  └──────────────┬───────────────────────┘  │
│                 │ IPC / local loopback      │
│  ┌──────────────▼───────────────────────┐  │
│  │  Go Agent Host (qrclaw-agent-host)   │  │
│  │  - CLI detect loop (5s tick)         │  │
│  │  - spawn claude/cursor/codex         │  │
│  │  - ACP stdio bridge                  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
         │
         ▼ (optional)
   ~/.qrclaw/qrclaw.db  +  ~/.qrclaw/sessions/
```

### 4.2 启动步骤（目标）

```
$ open QRClaw.app   # or: ./qrclaw
# → 浏览器自动打开 http://127.0.0.1:7823
# → 5 秒内 detect 完成, 4 个 runtime 槽位就绪
# → 点 "Claude Code" → 新建 session → 开聊
```

零外部依赖, 零 docker, 零 pm2, 零 supabase init。

### 4.3 砍掉的东西

| 砍掉 | 理由 | 回收路径 |
|---|---|---|
| Gateway 独立进程 | 单进程 IPC 即可 | 如果做 cloud host, 重新拉起 |
| Supabase / Postgres / RLS | 单 owner 不需 | Cloud sync 时换回 |
| Redis | 单进程 EventEmitter | 多 host 时加 |
| PM2 / Docker Compose | 桌面 app 自带进程管理 | 服务器部署时拉起 |
| KEK/DEK 加密 | 本机文件权限即护栏 | 见 §5 |
| `decrypted-messages` Edge Function | 直接 sqlite select | 云端时再上 |
| Wrapped token 协议 | 本地 pairing 是文件系统级 | 多设备时再上 |

### 4.4 保留的东西

| 保留 | 理由 |
|---|---|
| Go agent host | CLI spawn + stdio bridge 是纯增值, 切 sqlite 不影响 |
| Host WS 协议 frames | 即使变成 IPC, 消息 schema 不变 (accepted/event/completed/failed) |
| LobeChat UI 组件抽取决策 | UI 层与存储无关 |
| OpenAI SSE 作为 owner 面协议 | Next.js App Router streaming 原生支持 |
| Path C route group | visitor 冷冻保留的结构不动 |

### 4.5 M1 → M2 → M3 演进锚点

- M1: 上述 MVP, 单人本地, 4 runtime, 2 层模型 (runtime + session)
- M2: 文件/图片上传 (本地文件系统即可), agent 间手动转交 (IPC message 跨 session)
- M3: 笔笔省 workspace 绑定 + **opt-in cloud sync**——这时再评估要不要重启 Supabase

---

## 5. 铁律 C2 重评估（单人本地场景）

### 5.1 C2 v1.3 原文核心主张

> "明文只存在于两处: (a) 端侧客户端; (b) 已授权的 Edge Function 内存态"

这个规则的**威胁模型**是什么? 回到 wave10-strategic-arch-review.md §3.3: 防止 **cloud operator (Supabase / 托管方) 看到明文**。

### 5.2 单人本地威胁模型

当 owner 就是 zimzheng, 运行在他自己的 Mac 上:
- "cloud operator" 是谁? → 没有。或者说, **zimzheng 就是 operator**。
- 攻击面: ① 本机恶意软件 ② mac 被偷/被入侵 ③ 备份泄漏 (Time Machine / iCloud Drive)
- KEK/DEK 能防 ①②③ 吗?
  - ① 本机恶意软件能读 Node 进程内存 → **KEK 无效**
  - ② mac 被偷 → macOS FileVault + sqlite 在 `~/Library` 下文件权限 0700 已够
  - ③ 备份泄漏 → sqlite 文件被备份, 如果 FileVault 开着, Time Machine 也加密; iCloud Drive 默认不扫 `~/Library`

**单人本地场景下, C2 的 KEK/DEK 对真实威胁模型几乎没增值, 反而带来**:
- ~~decrypted-messages Edge Function 必要性~~
- ~~Gateway 写路径加密的强制~~
- migration 体量 (379 行里至少一半是 `owner_agent_session_keys` / wrapped DEK 相关)

### 5.3 建议: C2 双模

```
C2-cloud (原 v1.3):    威胁=cloud operator,    启用加密, 跑 Edge Function
C2-local (v2.0 新):    威胁=本机文件系统,       sqlite 文件 perm 0600, OS 负责
```

判定条件: `deploy_mode = 'local' | 'cloud'`, 由安装时决定, 运行时不切换。

**Wave 10 acceptance 红线调整**:
- 原"Gateway SSE 路由禁止日志明文"——local 模式下依然成立 (防调试日志泄漏), **继承**
- 原"禁止 `Last-Event-ID` 触发 DB 解密"——local 模式无 DB 解密概念, **N/A**
- 原"resume 一律走 Edge Function"——local 模式下 resume 走直接 sqlite select, **不适用**

C2-local 仍然保留 3 条本地护栏:
1. sqlite 文件 `chmod 600`
2. 日志不落 message content, 只落 `session_id, run_id, bytes`
3. 备份策略文档化: "如果你的 Time Machine 未加密, 请不要指望 QRClaw 保密 transcript"

### 5.4 升级路径

zimzheng 哪一天决定"我要把 QRClaw 卖给公司"或"我要多机同步":
- local → cloud 迁移 = 启用 supabase 后端 + 写一次性 sqlite → supabase migration
- 这时 C2-cloud 重新激活, KEK/DEK 入场

这个升级成本 **现在不必前置偿付**。

---

## 6. 对 cursor 3 份 R1 文档的反馈

### 6.1 r1-opensource-research.md

尚未读到 (文件不在当前目录)。预留章节, 主要关注点:
- 是否评估了 better-sqlite3 / Drizzle SQLite 作为 Supabase 替代?
- 是否评估了 Tauri vs Electron 作为桌面外壳?
- ACP (Agent Client Protocol) 是否被识别为现有标准? 相比 QRClaw 自研的 host WS 协议, ACP 的抽象等级更高, 可以考虑向它靠拢

### 6.2 r1-data-model.md

读了 150 行 (到 §SQL migration 草案 line 150)。

**同意**:
- `runtime_type` 用 text 不用 enum ✅
- `runtime_status` 用 text + CHECK ✅
- instructions 保 text + 8000 约束 ✅

**分歧**:
- **三层 vs 二层**: 如 §2, 建议去掉 `agents` 表, `runtime_id` 直接挂在 `sessions` 上
- **rename-first migration 的风险**: `owner_agent_conversations` → `owner_agent_sessions` 会同时牵动 gateway/edge function/web/tests, migration 的 **blast radius 大**。如果走 MVP sqlite 路径, **直接新 schema 重起, Wave 5-9 数据作废或离线导出**可能更快
- `agents.is_default` + `source` 两字段编码"系统默认 vs 用户创建": 二层模型下这两字段不需要, 只需 `sessions.title IS NULL OR sessions.title = 'Default'` 判定

**建议**: cursor 提交一份 "假设放弃 agents 表" 的 alt migration 草案, 对比两份的行数和 blast radius。

### 6.3 r1-onboarding-design.md

读了 150 行 (到 §3.4 自动检测流程图 line 150)。

**强同意**:
- "runtime 四槽位始终显示, 不隐藏" ✅ 符合"打开即可见"心智
- `needs_login / not_installed / online` 状态机清晰 ✅
- macOS LaunchAgent + menu bar 长驻 ✅

**分歧**:
- **owner 首次登录预建 4 个默认 agent**: 二层模型下改为"首次 host register 完成时, 为每个 online runtime 创建一个 welcome session + 默认 instructions"。agent 预建是多此一举的间接。
- **"不主推 curl | bash"**: 实际上对 Mac dev 用户, `brew install + brew services start qrclaw-host` 已经 OK。但对 Linux 服务器用户, `curl | bash` 仍然是 fastest path——不必过度 ban, 加警告即可
- **Gateway auto-provision**: 在无 gateway 的 MVP 下, auto-provision 由 Next.js API route 在 owner 首次 session 完成

---

## 7. 给 Wave 10 执行层的三问

这三个问题不是我能单独答的, 需要用户拍板:

1. **"双击即用"是不是 M1 的硬 KPI?**
   - 是 → 砍 gateway/supabase/redis, 走 sqlite + Next standalone + Go host, §4 MVP 架构
   - 否 → 保留 Wave 5-9 架构, Wave 10 只做 UI 重写 + 三层 schema rename

2. **单人本地的加密威胁模型是否还是"cloud operator"?**
   - 是 → C2 v1.3 全量保留 (但 gateway + supabase 必须留, 不能砍)
   - 否 → C2 双模 (§5.3), KEK/DEK 仅 cloud 模式激活

3. **Runtime / Agent / Session 是三层还是两层?**
   - 三层 → cursor 当前方向成立, SUMMARY.md 已 lock
   - 两层 → agents 表作废, 回收 migration 成本 50%+

**我的强烈建议**: (1) 是, (2) 否, (3) 两层。

理由: 单人本地 + Multica 范式这两个约束一旦接受, 当前架构的**一半复杂度是 dead weight**——为一个不存在的客户（SaaS 多租户）付的税。

---

## 8. 红线与护栏（维持不变的部分）

即使走 MVP 简化路径, 以下仍然成立:

- **Host WS (或 IPC) 协议字段冻结**: accepted/event/completed/failed frames 不动
- **gateway 内部顺序**: encrypt(if cloud) → persist → publish → ack——顺序不变, 只是 encrypt 在 local 模式空转
- **LobeChat 只抽 UI 层**: 这条与存储栈无关, 继承
- **SSE 单向下行**: owner 面统一走 SSE, OpenAI 兼容协议

---

## 9. 参考

- [gccrpm/multica GitHub repo](https://github.com/gccrpm/multica)
- [Multica 介绍 (vampireachao blog)](https://vampireachao.github.io/2026/04/13/multica/)
- [Multica 把 AI Agent 变成队友 (CSDN)](https://blog.csdn.net/TechChasee/article/details/160259389)
- `docs/wave10/SUMMARY.md` (已读 127 行)
- `docs/wave10/wave10-strategic-arch-review.md` (已读 147 行)
- `docs/wave10/r1-data-model.md` (已读 150 行)
- `docs/wave10/r1-onboarding-design.md` (已读 150 行)
- `supabase/migrations/20260427124708_owner_agent_chat_schema.sql` (已读 150 行, 总 379 行)
- `gateway/package.json` (全读)

— End —
