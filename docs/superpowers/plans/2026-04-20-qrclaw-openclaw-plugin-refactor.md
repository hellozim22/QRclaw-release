# QRClaw × OpenClaw Plugin Refactor — 设计方案

> **文档类型**：长周期战略设计文档（RFC），不是单波 TDD 任务清单。  
> **受众**：QRClaw 主项目维护者 + 未来组建的 agent team（不同 agent 执行不同 Task Card，参见 §12）。  
> **日期**：2026-04-20（v1.3 于同日根据评审反馈修订）  
> **版本**：**v1.3 · MVP 聚焦版 + Agent Team Ready + Review Response**  
> **v1.3 变更摘要**（相对 v1.2）：
> - §1.3 C2 措辞重写（A2 版本）：显式穷举明文允许存在的 2 个边界（客户端 + Edge Function 内存态），堵住 M3 Edge Function 解密导致的铁律语义歧义
> - §1.3 Owner 历史路径统一为 `decrypted-messages`（M3 起）
> - §5.1 L1.7 + §12.4.3 加"仅抽象不改行为"约束，明确 M2 不引入任何群聊/话题行为
> - §12.1 Task Card 协作公约加 **Owner** 字段 + **Conflict Resolution** 字段 + 共享目录 Owner 分配表
> - §8.3 M4 出口标准从 4 条扩到 7 条（新增长会话保活 / 双 agent 并发隔离 / 插件冷启回放）
> - §10 新增 **D-REV-02**：显式拒绝给 M3 加灰度/双读/feature flag（审查建议 #2 未采纳）
>
> **作者交接**：接续 `docs/release/github-publish-guide.md` v2 与 `2026-04-19-qrclaw-phase2-{index,wave1,wave2}.md`。  
> **读者入口**：
> - 只想看结论 → §10 决议记录 + §2.4 MVP 范围  
> - 执行某一具体任务 → §12 Agent Team Task Cards  
> - 系统理解 → 按目录顺序全读

---

## 目录

- [§0 本文档是什么 / 不是什么](#0-本文档是什么--不是什么)
- [§1 三条铁律的更新](#1-三条铁律的更新)
- [§2 愿景与非目标](#2-愿景与非目标)
- [§3 架构概览](#3-架构概览)
- [§4 与现有 GitHub / Phase 2 路线图的合并](#4-与现有-github--phase-2-路线图的合并)
- [§5 工作线拆解（4 条）](#5-工作线拆解4-条)
- [§6 协议映射表（OpenClaw ↔ QRClaw）](#6-协议映射表openclaw--qrclaw)
- [§7 持久化与回放规格](#7-持久化与回放规格)
- [§8 里程碑与时间线](#8-里程碑与时间线)
- [§9 风险与缓解](#9-风险与缓解)
- [§10 决议记录（2026-04-20 全部锁定）](#10-决议记录2026-04-20-全部锁定)
- [§11 方案自审清单](#11-方案自审清单)
- [§12 Agent Team Task Cards（任务分工卡）](#12-agent-team-task-cards任务分工卡)

---

## §0 本文档是什么 / 不是什么

### 0.1 是什么

一份跨多个季度、跨两个代码仓（`qrclaw/` 与 `openclaw-main/`）的**战略级方案**，回答四个问题：

1. 为什么要做 QRClaw 接入 OpenClaw 的插件？
2. 这件事如何与**已经在执行中的** GitHub 发布、Phase 2 Wave 1、Wave 2 共存？
3. QRClaw 主仓自身需要做哪些协议与产品演进来支撑 Telegram 化？
4. OpenClaw 端的插件包（`@qrclaw/openclaw-plugin`）应该长什么样、归属哪里、如何发布？

### 0.2 不是什么

- **不是一份"读完就能动手"的 TDD 执行剧本**。本文档写完后，每一波落地都会另起一个 `docs/superpowers/plans/YYYY-MM-DD-qrclaw-<milestone>.md` 文件，那一份才是可被 `executing-plans` / `subagent-driven-development` skill 消费的 bite-sized 计划。
- **不是对 OpenClaw 本身的改造**。OpenClaw 插件 API 视为**外部依赖**，我们对它零改动；若发现插件 API 有缺口，记到 §9 / §10，不要自行补丁 OpenClaw 源码。
- **不替代** `requirements/technical-specification-*.md`。那些是产品与协议的真相源，本文档只引用它们，不复述。

### 0.3 上下文关系

```
                 ┌─ github-publish-guide.md (Task A/B/C，正在进行) ─┐
                 │                                                    │
docs/release/ ───┤                                                    │
                 │                                                    │
                 └─ 本文档 (MVP = M0-M4 里程碑，M5+ 由 agent team 另立) ┤
                                                                      │
                         ┌─ phase2-wave1-http-contracts.md (Task B) ─┤
docs/superpowers/plans/──┤                                            │
                         └─ phase2-wave2-outbound-ws.md (Task C) ─────┘
                                                                      │
                         本方案后续拆出的 milestone 计划 ──────────────┤
                         (M1 / M2 / M3 ... 每个独立 plan) ──────────────┘
```

本文档与 github-publish-guide 是**同级别**的导航文档；具体波次仍在 `docs/superpowers/plans/`。

---

## §1 三条铁律的更新

### 1.1 旧铁律（`CLAUDE.md` §三条铁律）


| 铁律        | 旧定义              | 旧技术实现                             |
| --------- | ---------------- | --------------------------------- |
| C1 纯转发    | QRClaw 不托管 AI 推理 | Gateway 只转发，**不生成 / 不改写**消息       |
| C2 平台存储   | 存储消息用于同步，不分析内容   | `content_encrypted`，Gateway 不读取内容 |
| C4 移动端零注册 | 移动端 Visitor 无需注册 | Session Token 标识                  |


### 1.2 问题

- **C1 的 "纯转发" 字面上让人误以为 Gateway 不持久化**。zeze 的需求"用户重新登陆信息还在"要求 **持久化 + 可回放**必须是一等产品能力，而不是 C2 的脚注。
- **C1 与 C2 职责边界模糊**：C1 说"不改写"，C2 说"不分析"，但对于"持久化 + 回放"这个能力本身没有任何一条铁律正面承认。
- 下一阶段 OpenClaw 插件场景里，Agent 端也会断线 / 重启 / 换机，也需要回放——这不是"visitor 专属"需求。

### 1.3 新铁律（从本方案落地开始生效）


| 铁律              | 新定义                                                                 | 技术实现                                                                                                                                                                                                   | 与旧版差异                                                |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **C1 中立中继**     | QRClaw 不执行任何 AI 推理 / 不解读消息语义                                        | Gateway 仅接收、加密、持久化、转发；不调用 LLM；不对 content 做任何基于内容的路由或改写                                                                                                                                                 | **"纯转发" → "中立中继"**：明确"不推理 / 不解读"是核心承诺，**不再暗示"不持久化"** |
| **C2 加密存储**     | 平台持久化的消息必须是密文；明文只存在于两处：(a) 端侧客户端（visitor / owner / agent-plugin）；(b) 已授权的 Edge Function 内存态（`decrypted-messages`）——不落盘、不写日志、函数结束即释放 KEK/DEK 缓存                                             | `content_encrypted`（AES-256-GCM，DEK 由 KEK 包装）；Gateway **写路径**持 KEK 用于加密新消息，**读路径**不再解密（M3 起）；Supabase 的 Edge Function 是唯一被授权的服务端解密点，函数结束所有密钥/明文释放                                                                                                                         | **措辞收紧**：从"存储消息用于同步"升级到"必须端到端加密且落盘零明文"；显式穷举明文允许存在的 2 个边界，堵住 M3 Edge Function 解密造成的铁律语义歧义（v1.3 review-A2 落地） |
| **C4 移动端零注册**   | 未变                                                                  | 未变                                                                                                                                                                                                     | 不动                                                   |
| **C5（新增）消息可回放** | 任一身份（visitor / owner / agent-plugin）在断线、换机、重启后重新连接时，都能拿回断线期间及历史上的消息 | (1) Visitor 通过 `qr_code_id + session_token` 读 `POST /api/messages`（M3 起走 `decrypted-messages` Edge Function）；(2) Owner 通过 JWT 读 `functions/v1/decrypted-messages`（M3 从现有 `get-decrypted-messages` 合并而来）；(3) Agent-Plugin 通过 agent token 读**新增** `POST /api/agent/history` → `decrypted-messages` Edge Function（§7.2 规范） | **本方案新加**，为回应 zeze "用户重新登陆信息还在"                      |


### 1.4 落地动作

1. 在 M0 里同步修改 `CLAUDE.md`、`.claude/skills/qrclaw-map/map.md`、`requirements/technical-specification-*.md` 三处铁律表述。
2. **测试护栏**：新增 acceptance test `tests/acceptance/iron-rules.spec.ts`，断言：
  - Gateway 源码无 `openai|anthropic|llm|completion` 字样（C1）
  - 所有 `INSERT INTO messages` 走 `persistEncryptedMessage`（C2）
  - 三个 history endpoint 都有对应路由与测试（C5）
3. **执行日志**：在 `docs/refactor/execution-log.md` 顶部加一条 Decision Reversal：C1 已重定义、C5 已新增。

---

## §2 愿景与非目标

### 2.1 产品愿景（一句话）

> QRClaw 保持为**独立的二维码对话 SaaS**；在此基础上，我们发布一个 **OpenClaw channel 插件**，让用户用 OpenClaw 搭的 Agent 通过 QRClaw 对外分发（类似 "OpenClaw + Telegram" 的关系），并把 QRClaw 的 Visitor 体验向 Telegram 的消息表达力（按钮 / 引用 / 富媒体 / 多 agent）靠齐。

### 2.2 Must-have（必须做到）


| #   | 能力                                                                                                                                                  | 为什么                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| G1  | OpenClaw 用户配置 `@qrclaw/openclaw-plugin` 的 agent token，就能让该 OpenClaw Agent 在 QRClaw 上"上线"（取代当前 `scripts/agent-sdk/example-openclaw-agent.ts` 这种手写脚本） | 降低接入门槛，这是整个改造的起点           |
| G2  | Visitor 发消息 → OpenClaw 的 `message` 工具收到、推理、回复 → Visitor 看到回复                                                                                        | 基本的往返闭环                    |
| G3  | Visitor 流式消息支持（`stream_chunk` / `stream_end`）                                                                                                       | 与 OpenClaw 自身流式推理的自然对齐     |
| G4  | 单个 OpenClaw 实例可以管理**多个 QRClaw agent token**（一个账户一个 Agent）                                                                                           | zeze 明确要求                  |
| G5  | Agent-plugin 断线重连后可以**回放错过的消息**（与新 C5 铁律一致）                                                                                                         | zeze 明确要求：消息不能丢            |
| G6  | Agent 可以在对话内主动让 OpenClaw 调用一个 tool，生成一张**新的 QR 码分享链接**                                                                                              | zeze 明确提到的场景               |
| G7  | 整个 QRClaw 后端（gateway / web / supabase）对"接入方是不是 OpenClaw 插件"**零感知**；plugin 只能使用 QRClaw 现有协议（或协议的向后兼容扩展）                                              | 协议驱动是 QRClaw 自己的治理原则；不反向约束 |


### 2.3 MVP 必达（Must-have）

即 §2.2 的 G1–G7，不再复述。MVP 完成的定义：**OpenClaw 用户在 `openclaw.json` 里配置一个 agent token，就能让自己的 Agent 在 QRClaw 上"上线"，visitor 扫码可以文本双向对话、流式输出、断线回放、多 agent 并存、并能 tool-call 生成新 QR 码**。

### 2.4 范围控制：MVP 非目标 vs 架构预留 vs 永不做

本方案范围经过 2026-04-20 D8/D9 决议瘦身。MVP 只交付**文本通道 + 流式 + 持久化回放 + 多 agent + QR 工具**；其他 Telegram 对齐能力要么"架构预留、后续迭代"，要么"永不做、也不预留"。

#### 2.4.1 T1 MVP 必做（M0–M4）

| #   | 能力                                                       | 对应 Must-have |
| --- | -------------------------------------------------------- | ----------- |
| T1.1 | 文本双向消息（visitor ↔ agent）                                  | G1 / G2     |
| T1.2 | 流式输出（`stream_chunk` / `stream_end`）                      | G3          |
| T1.3 | 多 agent per OpenClaw 实例（accounts map）                    | G4          |
| T1.4 | Agent-plugin 断线回放（`POST /api/agent/history`）             | G5 / C5     |
| T1.5 | `qrclaw.create-qrcode` agent tool                        | G6          |
| T1.6 | Visitor 端基础 UI（已存在）+ dashboard 多 agent 切换器（L2.1 简版）      | G7          |

#### 2.4.2 T2 MVP 不做，但架构上预留（M5 / 后续迭代）

这类能力**不写实现**，但 **DB schema / WS 协议 optional 字段 / Gateway fanout 抽象**要在 M1/M2 就做好，保证后续迭代不必改底层。

| #   | 能力          | 架构预留动作（M1/M2 要做）                                                         | 何时实现 |
| --- | ----------- | ------------------------------------------------------------------------- | ---- |
| T2.1 | 群聊（group）   | `conversations.kind ∈ {'direct','group','topic'}` 字段 + `conversation_participants` 多参与者表 | 后续   |
| T2.2 | 话题 / threading | `conversations.parent_conversation_id` + `messages.thread_id` 字段          | 后续   |
| T2.3 | 消息回复 / 引用   | `messages.reply_to_message_id` 字段 + `MessageFrame.reply_to_message_id?` 可选字段（**协议可选字段在 M2 一次性落地，避免后续拆包破坏向后兼容**） | 后续（UI 到 M5+） |
| T2.4 | Inline buttons | Gateway fanout 抽象（不再假定"conversation = 1-visitor + 1-agent"）               | M5+  |
| T2.5 | Reactions    | 同 T2.4                                                                    | M5+  |
| T2.6 | 富媒体（image/file/voice） | 同 T2.4 + 确认 `MessageFrame.content_type` 已是 string（可扩展）                    | M6+  |
| T2.7 | Agent 主动 typing / status | `ClientFrame.agent_status` 协议位预留                                         | M5+  |
| T2.8 | 消息编辑 / 删除   | `messages.edited_at` / `messages.deleted_at` 字段（D4 MVP 不做，字段层面也**不预留**，因为会影响 RLS 与审计复杂度 — 见 §10 D4） | 不预留 |

#### 2.4.3 T3 永不做，也不预留（Won't-do）

| #   | 不做                                                       | 理由                                  |
| --- | -------------------------------------------------------- | ----------------------------------- |
| N1  | QRClaw gateway / web / supabase 的架构性重写                   | 零感知原则；现有 700+ 测试是财富                 |
| N2  | 把 QRClaw 整个 fork 进 OpenClaw 变 bundled                    | 破坏 SaaS 独立性                         |
| N3  | OpenClaw core 修改                                         | 我们是它的下游                             |
| N4  | 移除 `scripts/agent-sdk/`                                  | 存量第三方 agent 继续可用                    |
| N5  | QRClaw Visitor 端变成"用 OpenClaw UI 登录"                     | 保持 C4 零注册                           |
| N6  | Execution approvals / voice-call / native approvals     | D8 决议：MVP 全砍，暂不保留 UI 和协议骨架，未来确有需要再补 |
| N7  | Polls / stickers                                         | D9 决议：QRClaw 扫码 1-on-1 场景用不到；不做也不预留 |
| N8  | 斜杠命令（`/cmd` 菜单） / 命令回传协议                                 | D8 决议：不做也不保留 UI；若未来 agent team 有意见再起草 |


---

## §3 架构概览

### 3.1 顶层视图

```
┌──────────────────── OpenClaw 用户侧（自己的机器 / VPS）────────────────────┐
│                                                                           │
│   openclaw.json                                                           │
│   {                                                                       │
│     "plugins": {                                                          │
│       "entries": {                                                        │
│         "qrclaw": {                                                       │
│           "package": "@qrclaw/openclaw-plugin",                           │
│           "config": {                                                     │
│             "channels": {                                                 │
│               "qrclaw": {                                                 │
│                 "accounts": {                                             │
│                   "default":    { "agentToken": "qak_xxx", "label": ... },│
│                   "my-2nd-bot": { "agentToken": "qak_yyy" }               │
│                 }                                                         │
│               }                                                           │
│             }                                                             │
│           }                                                               │
│         }                                                                 │
│       }                                                                   │
│     }                                                                     │
│   }                                                                       │
│                                                                           │
│   OpenClaw core ─► registerChannel("qrclaw", qrclawChannelPlugin) ──┐     │
│   + registerTool("qrclaw.create-qrcode", …) ────────────────────────┤     │
│                                                                     ▼     │
│                                     ┌───────────────────────────────────┐ │
│                                     │ @qrclaw/openclaw-plugin  (本方案) │ │
│                                     │  src/channel.ts                   │ │
│                                     │  src/client.ts  ← WS 长连接客户端 │ │
│                                     │  src/inbound.ts ← 入站分发        │ │
│                                     │  src/outbound/{text,media,btn}.ts │ │
│                                     │  src/tools/create-qrcode.ts       │ │
│                                     │  src/history.ts ← C5 回放         │ │
│                                     │  src/accounts.ts ← 多 agent       │ │
│                                     │  src/setup-entry.ts               │ │
│                                     │  index.ts (defineChannelPluginEntry)│ │
│                                     └─────────────┬─────────────────────┘ │
└──────────────────────────────────────────────────────┼─────────────────────┘
                                                       │ WSS (现有 agent WS 协议 + 扩展)
                                                       │ HTTPS (ticket / create-qrcode / history)
                                                       ▼
┌──────────────────── qrclaw.ai 主体 ─────────────────────────────────────┐
│                                                                         │
│  gateway/  ← 中立中继 (新 C1) + 加密存储 (新 C2)                        │
│  web/      ← owner dashboard + visitor PWA（多 agent 管理在此）         │
│  supabase/ ← 账号、QR、消息、RLS + Edge Functions                       │
│                                                                         │
│  本方案需要的增量（以 shared/contracts/ 为 SSoT）：                     │
│   E1  shared/contracts/http/agent/        新增 agent history 契约 (M3) │
│   E2  shared/contracts/ws/outbound.ts     已在 Phase 2 Wave 2 建立      │
│   E3  shared/contracts/ws/types.ts        扩展：button/reaction/edit 等 │
│   E4  supabase: agent_connections, button_payloads, reactions 表       │
│   E5  web/ dashboard: 多 agent 切换器 + 每个 agent 的独立 token 视图    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 三条不变量（插件设计必须满足）


| 不变量                 | 含义                                                                                                    | 验证方式                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **I1 对后端零感知**       | QRClaw gateway 不能通过 WS 帧 / HTTP header 区分"对端是 OpenClaw 插件还是手写 Node 脚本"                                | `tests/acceptance/plugin-indistinguishable.spec.ts`：同一条对话用 `example-openclaw-agent.ts` 跑一遍、用插件跑一遍，gateway log 与 DB 入库结果 diff 必须仅在时间戳维度上不同 |
| **I2 协议驱动**（而非反向约束） | 插件只能消费 QRClaw 已发布的协议；如果插件需要一个新能力，先在 `shared/contracts/ws/` 或 `shared/contracts/http/` 里加，同步到两端后再在插件里用 | CI 中新增一条 `plugin-contract-gate.yml`：`@qrclaw/openclaw-plugin` 不允许 import 任何未在 `shared/contracts/` 公开的类型                                   |
| **I3 全链路加密守恒**      | 消息内容在插件侧即加密，Gateway 收到时已是 `content_encrypted`（或在 Gateway 侧加密后立即持久化），**任何中间层不落明文盘**                    | 合规 e2e：把 VPS 上 `/opt/qrclaw/logs/`* 按 grep 扫 `"content":"[a-z]` 超过 16 字符的字符串，应为零 hit                                                      |


### 3.3 插件的三种角色


| 角色                  | 面向谁                                   | 承担什么                                             | 实现子模块                                                                 |
| ------------------- | ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| **Channel 适配器**（主线） | OpenClaw agent turn（调 `message` 工具）   | WS 入/出站消息的协议翻译                                   | `src/channel.ts` + `src/inbound.ts` + `src/outbound/`*                |
| **Agent Tool**      | OpenClaw agent（通过 `api.registerTool`） | `qrclaw.create-qrcode` 生成新 QR + 分享链接             | `src/tools/create-qrcode.ts`                                          |
| **Account / 运维管理**  | OpenClaw 用户（操作者）                      | CLI / setup wizard：粘贴 agent token、查看在线状态、切换/重发帐号 | `src/accounts.ts` + `src/setup-entry.ts` + `registerCliMetadata(...)` |


---

## §4 与现有 GitHub / Phase 2 路线图的合并

### 4.1 当前进行中 / 已排期的事（来自 github-publish-guide.md）


| 标识     | 范围                                 | 状态                 | 为什么先于本方案                                                                                                                         |
| ------ | ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Task A | GitHub 首次发布 + CI/CD 生效             | **阻塞中**（等 zeze 建仓） | 没有 CI gate，本方案的所有后续 PR 都会变成本地绿 → 盲 push，风险不对称                                                                                    |
| Task B | Phase 2 Wave 1 — HTTP 请求体 Zod SSoT | 已完整 plan，未开工       | 本方案的 M3（agent history API）要**复用** Wave 1 建立的 `validateRequest` 中间件 + `shared/contracts/http/` 目录模式；先 Wave 1 再 M3 避免 pattern 重复设计 |
| Task C | Phase 2 Wave 2 — 出站 WS 帧 Zod       | 已完整 plan，未开工       | 本方案的 M4（plugin 消费 outbound）要**消费** Wave 2 完成后导出的 `ServerFrame` Zod schemas；先 Wave 2 让插件立即受益                                      |


### 4.2 合并后的执行顺序

```
Task A  (GitHub 发布 + CI 生效)        —— 必须最先，无法并行
   │
   ▼
Task B  (Wave 1 / HTTP Zod)            —— 本方案的 M0 可以并行启动，因为 M0 只改 doc
   │                                       (M0 的 PR 走 Task A 建立的 CI gate)
   ▼
Task C  (Wave 2 / outbound WS Zod)     —— 本方案的 M1 / M2 可以并行启动
   │                                       (协议扩展 + 数据库迁移)
   ▼
   ┌─────────────────────┐
   │ 本方案 M3-M4         │  —— 严格在 Task B、Task C T4 落地后才开始
   │ (依赖 HTTP + WS SSoT) │
   └─────────────────────┘
```

### 4.3 对 github-publish-guide 的必要补丁

github-publish-guide v2 目前的 §2 / §3 是"A → B → C 三件事"叙事。本方案落地时，需要在 guide 里做三处微调（本方案 M0 包含这些改动）：

1. **guide §2 的依赖图**添加本方案作为分支：`Task A → Task B → {本方案 M0 并行 + M1/M2 在 B 期间并行 + M3+ 在 B/C 后}`
2. **guide §3.1 决策日志**追加一行：`"QRClaw 将演化出 OpenClaw channel 插件"`
3. **guide §3.1 决策日志**追加一行：`"C1 已从 '纯转发' 重定义为 '中立中继'，新增 C5 '消息可回放'（详见本方案 §1.3）"`

### 4.4 对 Phase 2 plan 的必要补丁

**Wave 1**（`phase2-wave1-http-contracts.md`）：

- Wave 1 §2.1 endpoint 清单：**不加**新 endpoint，本方案 M3 会在 Wave 1 之后独立加
- Wave 1 §5 T5 recipe 更新：更新后的 "如何加 HTTP endpoint" recipe，就是我们 M3 的施工模板

**Wave 2**（`phase2-wave2-outbound-ws.md`）：

- Wave 2 §2.1 outbound frame 清单：**不加**新 frame，本方案 M2 会在 Wave 2 落地后独立扩展
- 但 Wave 2 T1 写 `shared/contracts/ws/outbound.ts` 时，**barrel 导出必须写成允许未来追加**，而不是 `export const ALL_OUTBOUND_FRAMES = [...] as const`（封闭联合）——T1 实现时已经这样做，确认即可，无需额外改动

---

## §5 工作线拆解（4 条）

每条工作线都是**可独立 PR、独立验收**的垂直切片。里程碑编号 M0–M4 给每条工作线贴上（MVP 范围），执行顺序见 §8。

### 5.1 L1 — QRClaw 协议与持久化演进（主仓）

**承担**：按协议驱动原则，为插件的 MVP 能力在 `shared/contracts/` 里开一个坑；同时把**群聊/话题的架构预留字段一次性落地**（D9 决议），避免后续迭代破坏向后兼容。

**状态图例**：✅ MVP 必做 · 🟡 架构预留（DB/协议 optional 字段，无实现）· ⬜ MVP 不做也不预留（已删除）


| #    | 状态 | 改动                                                                                                                                           | 位置                                                                                                                                                                  | 大小  | 依赖                                                         | 关联里程碑  |
| ---- | -- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------- | ------ |
| L1.1 | ✅  | 重写铁律（C1 / C2 → 新 C1 / C2 / C5）                                                                                                               | `CLAUDE.md`, `qrclaw-map/map.md`, 补 `tests/acceptance/iron-rules.spec.ts`                                                                                           | S   | 无                                                          | **M0** |
| L1.2 | ✅  | 新增 Edge Function `decrypted-messages`（合并 agent 历史 + visitor 历史两路），同时在 Gateway 保留 `POST /api/agent/history` + 迁移 `POST /api/messages` 为薄转发层      | `supabase/functions/decrypted-messages/` + `gateway/src/routes/agent-history.ts`（转发）+ `shared/contracts/http/agent/` + **迁移 `gateway/src/routes/messages.ts` 为转发层** | L   | **依赖 Phase 2 Wave 1 完成**（复用 `validateRequest`）+ Deno 版解密模块 | **M3** |
| L1.3 | ✅  | 为"多 agent per owner"补 DB 迁移（若当前 `agents` 表已支持则跳过）                                                                                             | `supabase/migrations/<date>_multi_agent_per_owner.sql`                                                                                                              | S-M | 无                                                          | **M1** |
| L1.4 | ✅  | 新增 `agent_connections` 表（记录 plugin 在线状态、last_seen、account_id label）                                                                          | `supabase/migrations/<date>_agent_connections.sql`                                                                                                                  | S   | L1.3                                                       | **M1** |
| L1.5 | 🟡 | **群聊/话题 DB 预留**（一次性落地）：`conversations.kind ∈ {'direct','group','topic'} default 'direct'` + `conversations.parent_conversation_id nullable` + `messages.thread_id nullable` + `messages.reply_to_message_id nullable` + 新表 `conversation_participants(conversation_id, participant_kind, participant_id, joined_at)` + 对应 RLS | `supabase/migrations/<date>_future_group_topic_reserve.sql`                                                                                                         | M   | L1.4                                                       | **M1** |
| L1.6 | 🟡 | **协议 optional 字段一次性落地**：`MessageFrame.reply_to_message_id?: string` + `MessageFrame.thread_id?: string`（Zod `.optional()`；gateway 透传；消费方可忽略） | `shared/contracts/ws/types.ts` + `shared/contracts/ws/outbound.ts` + sync 脚本 + parity test                                                                         | S   | **依赖 Phase 2 Wave 2 完成**（保留未来追加能力已在 Wave 2 T1 落地）          | **M2** |
| L1.7 | 🟡 | **Gateway fanout 抽象**（不再假设 conversation = 1-visitor + 1-agent）：把 `router.ts:deliverToConversation` 从"给固定两端发"抽象成"查 participants 表 → 遍历发送"；direct 场景走 fast-path 保证零回归。**⚠️ 仅抽象，行为不变**——本里程碑不引入任何群聊/话题行为（不 emit 额外 frame、不新增 participant、不改变路由语义）；更换 fanout 内部实现不应让 direct 场景的对话行为发生任何变化（M2 回归测试门槛） | `gateway/src/ws/router.ts` + `gateway/src/ws/fanout.ts`（新）                                                                                                        | M   | L1.5                                                       | **M2** |
| L1.8 | ⬜  | ~~inline buttons / reactions / 富媒体 协议扩展~~（D8 瘦身 A：全部移到 M5+，本方案不再跟踪；由 agent team 在 M5 起草独立 plan）                                              | —                                                                                                                                                                   | —   | —                                                          | **M5+（未来 plan）** |
| L1.9 | ⬜  | ~~message edit / delete~~（D4 不做也不预留）                                                                                                         | —                                                                                                                                                                   | —   | —                                                          | 永不做    |
| L1.10| ⬜  | ~~exec approvals / 斜杠命令协议~~（D8 全砍，不预留）                                                                                                       | —                                                                                                                                                                   | —   | —                                                          | 永不做    |


### 5.2 L2 — QRClaw 产品演进（前端 + dashboard）

**承担**：MVP 阶段只做"让插件能上线 + 管理多 agent"这一件事；其余 Telegram 对齐的 UI 全部后推（D8 瘦身 A）。

**状态图例**：✅ MVP 必做 · ⬜ MVP 不做（后续迭代独立 plan）


| #    | 状态 | 改动                                                                              | 位置                                                               | 大小  | 依赖   | 关联里程碑  |
| ---- | -- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --- | ---- | ------ |
| L2.1 | ✅  | Dashboard 多 agent 管理页（列表 + 切换 + token 查看 + token 重生成 + `account_id` 标签）        | `web/src/app/(dashboard)/agents/`                                | M-L | L1.3 | **M2** |
| L2.2 | ✅  | Visitor 端在 message 渲染层识别并忽略 `reply_to_message_id` / `thread_id`（确保未来字段不破坏 UI） | `web/src/components/chat/MessageBubble.tsx` 增加 forward-compat 分支 | S   | L1.6 | **M2** |
| L2.3 | ⬜  | ~~inline buttons UI / Reactions UI / 富媒体气泡 UI / 编辑删除 UI / 审批 UI / 斜杠命令 UI~~     | —                                                                | —   | —    | M5+ 独立 plan |


### 5.3 L3 — OpenClaw 插件包 `@qrclaw/openclaw-plugin`

**承担**：本方案的核心交付物。**归属 qrclaw 主仓子目录 `plugins/openclaw/`**（见 §10 决议 D1 = A1）。

**目标文件结构**（遵循 OpenClaw `sdk-channel-plugins.md` 的惯例）：

```
plugins/openclaw/             ← qrclaw 主仓内子目录（D1 决议 A1）
├── package.json              ← 独立 package.json，workspaces = false；npm pack 发 @qrclaw/openclaw-plugin
├── openclaw.plugin.json      ← manifest；configSchema 声明 accounts map
├── README.md                 ← 面向 OpenClaw 用户：如何获取 agent token、粘到配置文件
├── index.ts                  ← defineChannelPluginEntry(...)
├── setup-entry.ts            ← defineSetupPluginEntry(qrclawChannelPlugin)
├── src/
│   ├── channel.ts            ← createChatChannelPlugin<ResolvedQRClawAccount>(...)
│   ├── accounts.ts           ← resolveAccount / inspectAccount / 多 token 管理
│   ├── client.ts             ← 基于 scripts/agent-sdk/agent-connector.ts fork 简化；WS 客户端 + 心跳 + 自动重连 + ticket 刷新
│   ├── inbound.ts            ← WS → OpenClaw 的 dispatch 桥；处理 visitor_message / read_receipt / system
│   ├── outbound/
│   │   ├── text.ts           ← sendText：wrap 成 agent_message 帧
│   │   └── stream.ts         ← 把 OpenClaw 流式 token → stream_chunk + stream_end
│   ├── history.ts            ← 连接 / 重连时调 POST /api/agent/history 回放 (C5)
│   ├── tools/
│   │   └── create-qrcode.ts  ← api.registerTool("qrclaw.create-qrcode", ...)
│   └── runtime.ts            ← 多 token 并发 WS 连接池
├── tests/
│   ├── channel.test.ts       ← 契约测试（复用 OpenClaw plugin-sdk/channel-test-utils）
│   ├── inbound.test.ts
│   ├── outbound.test.ts
│   ├── history.test.ts
│   └── e2e/
│       └── round-trip.spec.ts  ← 起一个 mock qrclaw gateway + 跑完整循环
└── tsconfig.json
```

> **MVP 不含的目录**：`outbound/buttons.ts` / `outbound/media.ts` / `outbound/reactions.ts` / `approvals.ts` 全部不创建（D8 瘦身 A）。未来 M5+ 再新增。

**关键实现要点**：


| 要点                     | 说明                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **复用 agent-connector** | `src/client.ts` 直接从 `scripts/agent-sdk/agent-connector.ts` fork → 剪成纯 WS 层；保留 ticket 刷新、自动重连、心跳                                                                              |
| **ticket 刷新**          | 插件初始化时拿 `AGENT_API_KEY` → Edge Function 换 `ticket` → WS 握手；TTL 到了走 refresh（不是 reconnect）                                                                                     |
| **多 agent 并发连接**       | `runtime.ts` 维护 `Map<accountId, QRClawConnection>`；每个 OpenClaw 账户一个独立 WS 连接（不做 WS 多路复用）                                                                                      |
| **流式翻译**               | OpenClaw 生成时往 `outbound.sendStreamChunk(...)` 发，插件把每个 chunk 变成一个 `stream_chunk` 帧，最后发 `stream_end`                                                                           |
| **断线回放（C5）**           | 每次 WS 成功握手后调 `POST /api/agent/history { agent_id, since }`，把收到的每条消息用 `api.dispatchInbound(...)` 推进 OpenClaw；`message_id` dedup，保证 OpenClaw 侧 memory 不重                        |
| **create-qrcode tool** | `api.registerTool({ name: "qrclaw.create-qrcode", schema: {...}, handler: ... })`；handler 调 `POST /api/agent/create-qrcode`（D3 决议 A：用 agent_token 鉴权的新端点）→ 返回 `{ url, qrImageUrl }` |
| **setup wizard**       | 按 OpenClaw `defineSetupPluginEntry` 的惯例：接受 agent token、可选 label、可选 allowFrom；inspectAccount 只返回"有/无 token"不返回 token 本身                                                       |
| **Opt-out approvals**  | D8 决议：`approvalCapability` 不声明、不实现、**不留文件**；OpenClaw core 走默认                                                                                                                |
| **未来字段转发**             | inbound 分支在解析 MessageFrame 时，若 `reply_to_message_id` / `thread_id` 存在，原样放进 `api.dispatchInbound` 的 `extra` 字段，允许未来 agent 读取（零成本向前兼容）                                         |


### 5.4 L4 — 运维与发布


| #    | 改动                                                                                                            | 位置                            | 关联里程碑                 |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------- |
| L4.1 | ✅ 确定包归属 → **A1 qrclaw 主仓 `plugins/openclaw/` 子目录**（D1 决议锁定）                                                   | 决策项 D1                        | **M0 决策完成**           |
| L4.2 | ✅ 插件的 CI：`.github/workflows/plugin-openclaw.yml` → lint + typecheck + `vitest` + OpenClaw SDK contract tests；**路径过滤 `plugins/openclaw/**`，只在改动插件时触发** | 独立 workflow                   | **M4**                |
| L4.3 | ✅ 插件发布流水线：semver + changesets + `npm publish --access public`；**发布节奏跟 OpenClaw SDK 版本走**（D6 决议）            | `plugins/openclaw/.changeset/` | **M4**                |
| L4.4 | ✅ 插件文档站：`plugins/openclaw/docs/` + 链到 qrclaw.ai                                                              | 新增                            | **M4**                |
| L4.5 | ✅ 升级 `scripts/agent-sdk/example-openclaw-agent.ts` README：添加 "新用户推荐用 `@qrclaw/openclaw-plugin`" 指引；保留脚本为 legacy | `scripts/agent-sdk/README.md` | **M4**                |


---

## §6 协议映射表（OpenClaw ↔ QRClaw）

本表是插件实现的真相源。列序：**OpenClaw 侧 API（插件实现的适配点）→ QRClaw WS / HTTP 协议**。

**状态图例**：✅ MVP 必做 · 🟡 架构预留（optional 字段已开坑，不消费）· ⬜ MVP 不做也不预留

### 6.1 入站（visitor → OpenClaw agent）

| 状态 | OpenClaw 端到达                                                               | 来源：QRClaw 侧帧                                                                                    | 插件实现位置                         | 需要的 QRClaw 协议                                      | 里程碑    |
| -- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------- | ------ |
| ✅  | `api.dispatchInbound({ channel:"qrclaw", accountId, chatId, user, text })` | `message` (ServerFrame) 且 sender_type=visitor                                                   | `src/inbound.ts`               | ✅ 已存在（`shared/contracts/ws/types.ts#MessageFrame`） | **M4** |
| ✅  | visitor 上线 / 下线                                                            | `system { event:"agent_online" \| "agent_offline" }`                                            | `src/inbound.ts` presence 分支   | ✅ 已存在                                              | **M4** |
| ✅  | 已读回执                                                                       | `read_receipt` (ClientFrame) — visitor 已读方向 visitor → gateway → agent                           | 丢弃或上报 OpenClaw observability   | ✅ 已存在                                              | **M4** |
| ✅  | 断线后回放                                                                      | `POST /api/agent/history` → Gateway 转发至 Edge Function `decrypted-messages`（D2 决议）；插件逐条 dispatch | `src/history.ts`               | ❌ **L1.2 新增**                                      | **M3** |
| 🟡 | reply / thread 上下文                                                         | `MessageFrame.reply_to_message_id?` / `MessageFrame.thread_id?`（optional 字段已开，消费方透传即可）          | `src/inbound.ts` 原样进 extra 字段  | ✅ L1.6 字段已落地                                      | **M2** 字段，**M5+** 消费 |
| ⬜  | ~~button press~~                                                           | —                                                                                               | —                              | D8 不做也不预留                                          | —      |
| ⬜  | ~~reaction add / remove~~                                                  | —                                                                                               | —                              | D8 不做也不预留                                          | —      |
| ⬜  | ~~visitor message edit / delete~~                                          | —                                                                                               | —                              | D4 不做                                              | —      |
| ⬜  | ~~媒体 URL~~                                                                 | —                                                                                               | —                              | D8 不做                                              | —      |

### 6.2 出站（OpenClaw agent → visitor）

| 状态 | OpenClaw 侧触发                          | 插件转成的 QRClaw 侧帧                                                                                                      | 插件实现位置                 | QRClaw 协议状态         | 里程碑    |
| -- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------- | ------ |
| ✅  | `outbound.sendText({ to, text })`     | `agent_message { content, content_type:"markdown", conversation_id }`                                                | `src/outbound/text.ts` | ✅ 已存在               | **M4** |
| ✅  | 流式 token（OpenClaw AI SDK）              | `stream_chunk { delta, sequence }` × N，最后 `stream_end`                                                               | `src/outbound/stream.ts` | ✅ 已存在（Phase 1 修过 drift） | **M4** |
| ✅  | 基础 typing 自动合成                         | **无需插件驱动** — gateway `ws/router.ts:188` 收到 `visitor_message` 后自动给 visitor 发 `agent_typing`                          | —                      | ✅ 已由 gateway 合成     | **M4**（零工作量） |
| ⬜  | ~~buttons / reactions / media / 主动 typing / polls / stickers / 编辑删除~~ | —                                                                                                                    | —                      | D8/D9 全砍，不预留        | —      |

### 6.3 Agent tool（Channel 插件额外暴露给 OpenClaw agent runtime）

| 状态 | OpenClaw tool call                                                | 插件实现                         | QRClaw 协议 / HTTP                                         | 里程碑    |
| -- | ----------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- | ------ |
| ✅  | `qrclaw.create-qrcode({ label, system_prompt?, callback_hint? })` | `src/tools/create-qrcode.ts` | **`POST /api/agent/create-qrcode`**（新，D3 决议 A：用 `agent_token` 鉴权） | **M4** |
| ⬜  | ~~`qrclaw.list-conversations`~~                                   | —                            | MVP 不做（history 已覆盖 90% 场景）                                | —      |


### 6.4 映射表维护协议

- 本表**随 L1 协议演进同步更新**。
- 每次 `shared/contracts/ws/types.ts` 或 `shared/contracts/http/` 增删，都需要往本表追加一行。
- 如表中某一行的"QRClaw 协议状态"从 ❌ 变 ✅，请在同一 PR 里更新本表。

---

## §7 持久化与回放规格（C5 铁律的技术实现）

### 7.1 三种身份的回放矩阵（按 D2 决议：Edge Function 统一解密）


| 身份               | 识别方式                                 | 回放来源（最终形态）                                                                       | 限制                             | 当前状态                           |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| Visitor          | `qr_code_id + session_token`（cookie） | Gateway `POST /api/messages` **转发至** Edge Function `decrypted-messages`（M3 迁移）   | 同一浏览器会话；清 cookie 等于失联（设计如此，C4） | ⚠️ **现有走 Gateway，M3 迁移到 Edge** |
| Owner            | Supabase JWT                         | Edge Function `decrypted-messages`（从现有 `get-decrypted-messages` 合并）              | 仅对自己名下 QR                      | ✅ **已存在**，M3 可能合并路径            |
| **Agent-plugin** | `agent_token`（Authorization: Bearer） | Gateway `POST /api/agent/history` **转发至** Edge Function `decrypted-messages`（新增） | 仅对该 agent 关联的 conversations    | ❌ **M3 新增**                    |


> 所有"解密读"统一经 Edge Function；Gateway 只做身份校验 + 透传。Gateway 的 `ENCRYPTION_KEK` 仅保留在**写路径**（加密新消息持久化到 DB），**读路径**不再解密。

### 7.2 `POST /api/agent/history` 契约（规格预案）

> 正式 schema 在 L1.2 的 `shared/contracts/http/agent/history.ts` 里落地；这里先写占位规格。Gateway 层做薄转发（身份校验 + rate limit），解密统一在 Edge Function。

**Request**：

```jsonc
{
  "agent_id": "uuid",
  "since": "2026-04-20T00:00:00Z",    // ISO 8601；可选，默认最近 24h
  "limit": 50,                         // 1–200，默认 50
  "cursor": "uuid-of-last-message"     // 可选，用于翻页
}
```

**Response**：

```jsonc
{
  "data": {
    "messages": [
      {
        "message_id": "uuid",
        "conversation_id": "uuid",
        "qr_code_id": "uuid",
        "role": "visitor",            // 仅 visitor，因为 agent 侧不需要回放自己发过的
        "content": "hello",           // **已解密**；agent 自己就是消息合法观察者
        "content_type": "text",
        "sent_at": "2026-04-20T01:02:03Z",
        "metadata": { }
      }
    ]
  },
  "meta": {
    "cursor": "uuid-of-last-or-null",
    "has_more": false,
    "server_time": "2026-04-20T12:00:00Z"
  }
}
```

**鉴权（两层）**：

- **Gateway 层**：`Authorization: Bearer <agent_token>` → 查 `agents.api_key_hash`（现有表）匹配 → 解析 `owner_id` + `agent_id` → rate limit → 附加签名内部 header 转发至 Edge Function
- **Edge Function 层**：验证 Gateway 签名（防止直接跨过 Gateway 攻击 Edge Function）→ 按 `owner_id` 查 conversation 列表 → 解密 → 响应

**加解密（D2 决议落点）**：

- 解密代码从 Node.js `gateway/src/crypto/` 移植到 Deno，落在 `supabase/functions/_shared/decrypt.ts`
- KEK 仅在 Supabase Edge Function secrets 中（Gateway 读路径不再持）
- **不违反 C1 中立中继**：解密依然是"按合法身份取自己的信"，不是"分析内容"
- Cold start 优化：Edge Function 做 `--no-verify-jwt` 绕过 Supabase 默认 JWT 校验（因为我们用自定义 Gateway 签名），减少启动耗时

**速率限制**：

- Gateway 已有 `rate-limiter.ts`
- 配额：10 req/min per agent_token（Gateway 层拦截，Edge Function 只承担真实解密负载）

**测试覆盖（TDD）**：

1. 合法 agent token 查自己名下 conversation → 200 + 返回解密消息
2. 合法 agent token 查别人名下 conversation → 404（不是 403，避免枚举）
3. 空 token → 401
4. 错误 token → 401
5. `since` 过滤生效
6. `cursor` 翻页幂等
7. `limit` 上界生效
8. 并发 11 次 → 第 11 次 429
9. 回放的内容明文 ≠ DB 里的密文（加解密链完整）

### 7.3 与 Redis offline queue 的关系

现有 `gateway/src/redis/offline-queue.ts`：

- Agent 掉线时，Gateway 把消息 push 到 Redis List；agent 重连时 Lua 原子 drain → deliver
- 上限 200 条 / 24h TTL

**本方案的定位**：

- Redis offline queue → **"实时热缓存"**（agent 短暂掉线的毫秒级恢复）
- `GET /api/agent/history` → **"冷恢复"**（agent 重启、换机、长期离线后）
- 两者**都保留**；插件启动时先查 history（冷），然后 WS 握手自动 drain queue（热）；用 `message_id` 做 dedup（这已经是 `persistEncryptedMessage` 的 idempotency_key）

---

## §8 里程碑与时间线

### 8.1 里程碑表（v1.2 瘦身版）

**范围收敛**：MVP 终点 = M4。M5/M6 不在本方案跟踪，交由未来 agent team 起草独立 plan（D8）。

| ID     | 状态 | 名称                                                       | 交付物                                                                          | 依赖                                    | 估时（专人）        | 推荐主责 agent                      |
| ------ | -- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- | ------------- | -------------------------------- |
| **M0** | ✅  | 铁律重定义 + 文档基础                                             | L1.1 + 本方案合并 + guide 补丁（§4.3）                                                | 无                                     | 1 人日          | `doc-updater`                    |
| **M1** | ✅  | 多 agent 数据层 + 群聊/话题 DB 预留                                 | L1.3 + L1.4 + L1.5                                                           | M0                                    | 2-3 人日        | `database-reviewer` + `postgres` |
| **M2** | ✅  | Dashboard 多 agent 管理 + 协议 optional 字段落地 + fanout 抽象       | L2.1 + L2.2（forward-compat） + L1.6 + L1.7                                    | M1                                    | 3-4 人日        | `frontend` + `backend-patterns`  |
| **M3** | ✅  | Agent history API + visitor 历史迁 Edge Function（C5 核心 + D2 宽） | L1.2（Edge Function `decrypted-messages` + Gateway 转发 + visitor 迁移）           | **Phase 2 Wave 1 完成** + M0            | **5-6 人日**    | `security-reviewer` + `database` |
| **M4** | ✅  | **MVP 插件发布**（Channel + stream + history + create-qrcode） | L3 文件结构（仅 MVP 子集） + `POST /api/agent/create-qrcode` + L4.2–L4.5              | **Phase 2 Wave 2 T1–T4 完成** + M1–M3   | **4-5 人日**    | `architect` + `tdd-guide` + `e2e-runner` |
| ~~M5~~ | ⬜  | ~~富交互 (reactions, buttons)~~                              | D8 全砍；不在本方案                                                                  | —                                     | —             | —                                |
| ~~M6~~ | ⬜  | ~~富媒体~~                                                    | D8 全砍；不在本方案                                                                  | —                                     | —             | —                                |

**MVP 总工时**：15-19 人日（未含 Task A/B/C 前置工作）。

### 8.2 与 Phase 2 的甘特叠加（v1.2 瘦身版）

```
MVP 终点 = M4，周 6-7 交付。M5/M6 不在本方案。

周 1     周 2     周 3     周 4     周 5     周 6     周 7
│        │        │        │        │        │        │
[Task A ]                                                │
├─ M0 ──┤                                                │
         [Task B Wave 1 ─────────]                       │
         [M1 ──────]                                     │
                    [M2 ──────]                          │
                              [M3 ────────]              │
                                       [Task C Wave 2 T1-T4]
                                                    [M4 ─────]
```

Wave 2 的 T5 flip（strict 切换，7 天观测期）在 M4 交付后并行进行。

### 8.3 每个里程碑的出口标准

| 里程碑 | 出口标准                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | 六栏验证绿 + `iron-rules.spec.ts` 绿 + `CLAUDE.md` / `qrclaw-map/map.md` / `technical-specification-*.md` 三处铁律同步更新 + guide 补丁合并                                                                    |
| M1  | 数据库迁移在 staging / prod 都跑过 + `conversations.kind/parent_conversation_id` + `messages.thread_id/reply_to_message_id` + `conversation_participants` 表已创建 + RLS 已补 + 现有 700+ 测试不红                  |
| M2  | Dashboard 能看到多 agent 列表、token 重生成可用 + `MessageFrame.reply_to_message_id?` / `thread_id?` optional 字段的 Zod schema 已发布 + `web/` 在收到带新字段的帧时不报错（forward-compat 分支） + Gateway fanout 抽象合入，direct 场景零回归 |
| M3  | `POST /api/agent/history` 9 个测试全绿 + Edge Function `decrypted-messages` 部署 + **visitor 历史端到端走 Edge Function（`/api/messages` 现有测试不红）** + Gateway KEK 读路径移除 + Phase 2 Wave 1 `validateRequest` 被复用 |
| M4  | 在一个**真实的 OpenClaw 测试实例**上加载插件、配置 2 个 agent token，并通过以下 7 条生态最小可用验收：<br/>**核心闭环**：<br/>1. visitor 消息 → OpenClaw agent 推理 → visitor 看到流式回复（至少 1 次完整对话）<br/>2. agent 进程重启后 history 回放无丢失（断线期间发的消息能补齐）<br/>3. `qrclaw.create-qrcode` 通过 `agent_token` 成功创建 QR 并返回扫码链接<br/>4. `plugin-indistinguishable.spec.ts` 绿（行为与现有 Echo/OpenClaw Agent SDK 等价）<br/>**生态最小可用**（v1.3 review-#6 追加）：<br/>5. **长会话保活**：单一 agent token 保持连接 ≥ 30 min 不掉线、心跳不丢，期间发 3 条以上消息全部送达<br/>6. **双 agent token 并发对话互不串扰**：同一 OpenClaw owner 配置两个 QRClaw agent，各自对话的消息/历史/QR 严格隔离（跨 agent 不可见）<br/>7. **插件冷启回放**：插件进程首次启动或升级后，能通过 `POST /api/agent/history` 把运行前累积的 visitor 消息完整拿回（dedup by `message_id`） |


---

## §9 风险与缓解


| #   | 风险                                                                                                                             | 严重度   | 缓解                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| R1  | OpenClaw plugin SDK 迭代速度快，我们引用的 subpath 被弃用                                                                                    | 中     | 钉 `peerDependencies: { "openclaw": ">=X.Y <Z"}` + CI 每周跑 `openclaw@latest` smoke（不阻塞主线，但报警）                                      |
| R2  | Wave 1 / Wave 2 落地偏慢，M3 / M4 开工时依赖尚未完成                                                                                         | 中     | M3 / M4 的 ready 检查（类似 Wave 2 §6.2）在计划第一天就跑；若红就 halt，不要 forward-port pattern                                                      |
| R3  | 新 `POST /api/agent/history` 暴露解密 API，若 token 泄露，攻击面 = 历史消息                                                                     | **高** | 速率限制（10/min）+ audit log（每次调用记录 agent_id + IP）+ agent token 轮换文档                                                                  |
| R4  | 插件持 **owner JWT** 才能调 `POST /api/create-qrcode` — **已按 D3 决议规避**：插件仅接受 agent_token，走新 endpoint `POST /api/agent/create-qrcode` | 低     | D3 决议落地；新 endpoint 加 agent_id 维度限流（每天 100 次 create）                                                                              |
| R5  | 协议扩展（button / reaction / edit）破坏旧 visitor 客户端                                                                                  | 中     | 加 `protocol_version` 字段在 `connection_ack`，新帧在旧客户端上被 router fallback 成 `system { event:"unsupported_frame" }`（gateway 侧 graceful） |
| R6  | 插件做流式回复时 `stream_chunk` 的 `sequence` 断号（agent 自己的流式 token 中断了）                                                                 | 低     | 插件内部 buffer & resequence；超过 5s 无新 chunk 直接 `stream_end(is_partial:true)`                                                         |
| R7  | OpenClaw `configSchema` 在 manifest 里放明文 agent token，被 op 误提交仓库                                                                 | 中     | `src/setup-entry.ts` 使用 `inspectAccount` 只返回 `tokenStatus`；README 强调 `.gitignore` + env var 注入模式                                 |
| R8  | "零感知" 不变量被无意破坏（如 gateway 日志里记了 User-Agent=`openclaw-plugin/x.y`）                                                               | 低     | `tests/acceptance/plugin-indistinguishable.spec.ts` 在 M4 写进 CI                                                                   |
| R9  | 多 agent 场景下 OpenClaw 一次发布所有 agent token 到一个 KV，被截获后损失放大                                                                        | 中     | configSchema 建议每个 account 单独 env var：`QRCLAW_AGENT_TOKEN__default`, `QRCLAW_AGENT_TOKEN__my_2nd_bot`；文档强调                        |
| R10 | `@qrclaw/openclaw-plugin` 发布后旧 `scripts/agent-sdk/` 用户分叉不跟进                                                                    | 低     | 保留 `scripts/agent-sdk/` 为 legacy；README 加"推荐迁移"；6 个月后再讨论弃用                                                                       |
| R11 | Agent team 并行执行 Task Card 时，§6 协议映射表 / §5 L1 表出现冲突版本（多 agent 同时编辑）                                                             | 中     | 每个 Task Card（§12）声明 "read-only files" + "write-allowed files"；L1 / §6 表的 PR 必须串行合并（一次只能有一个 M1/M2 期 PR 在评审）；`plankton-code-quality` skill 在 pre-commit 做 markdown schema check |
| R12 | 群聊/话题 DB 字段预留之后被**永远不用**，变成死代码                                                                                                  | 低     | M1 的 migration 包含**为未来使用的 comment**；若 2027Q1 仍未引用，由 `refactor-cleaner` agent 在那时判断回滚                                              |
| R13 | Agent team 里的 reviewer agent 漏掉 "D8 全砍" 范围，误合并 buttons/reactions 实现                                                              | 中     | §10 D8 + §2.4 T3 清晰列出"永不做"；CI 添加一条 `grep -r "button_pressed\\|agent_reaction" plugins/openclaw/src/` 的绿色校验（空结果才通过）               |


---

## §10 决议记录（2026-04-20 全部锁定）

> 本节是本方案的**单一真相源**（Source of Truth）；所有其他章节的冲突均以本节为准。
> 最初 D1 讨论稿保留在附录；最终落点详见每条决议的"变更记录"。

### D1 ✅ — 插件包归属：**A1 qrclaw 主仓子目录 `plugins/openclaw/`**（v1.2 修订）

- **初始讨论稿**：B 独立仓 `qrclaw/openclaw-plugin`
- **最终决议（v1.2 覆盖）**：在 qrclaw 主仓内新建子目录 `plugins/openclaw/`，不用 Turborepo / workspaces；子目录有独立 `package.json`，用 `npm pack` 发布为 `@qrclaw/openclaw-plugin`
- **理由**：
  1. 启动成本低（不用新建仓 / CI / 访问控制）
  2. 协议与插件同仓 = 协议演进时单 PR 即完成（不必跨仓同步）
  3. 符合 qrclaw 现有约定（`scripts/agent-sdk/` 已是类似的独立子项目）
  4. 未来若插件规模增长需要独立，再 `git subtree split` 拆分，代价可控
- **影响**：
  - §5.3 所有路径改为 `plugins/openclaw/`
  - `.github/workflows/plugin-openclaw.yml` 加路径过滤 `plugins/openclaw/**`，不触发主项目 CI
  - `scripts/agent-sdk/` 与 `plugins/openclaw/` 共存

### D2 ✅ — Agent 历史解密路径：**Edge Function（宽范围）**

（内容不变，略）

- **决议**：
  1. 新建 Edge Function `decrypted-messages`（统一函数，内部按 role 分支），负责 agent + visitor 两种身份的历史解密查询
  2. Gateway 不再持有 KEK 读路径——`ENCRYPTION_KEK` 仅保留在 Supabase Edge Function secrets
  3. Gateway `/api/messages` 与新 `/api/agent/history` 均为**薄转发层**（身份校验 + rate limit + 签名转发）
- **理由**：安全治理优先，消除 Gateway 侧 KEK 读路径泄露面
- **影响**：M3 范围含 "visitor 历史迁 Edge Function" + Deno 解密移植

### D3 ✅ — `qrclaw.create-qrcode` 鉴权：**新 endpoint `POST /api/agent/create-qrcode` + agent_token**

- **决议**：扩展 agent_token 权限范围，在 Gateway 新增 `POST /api/agent/create-qrcode`，接受 agent_token，在 owner 范围内创建 QR 码
- **影响**：
  - §6.3 tool 对应的 HTTP endpoint 已更新为 `/api/agent/create-qrcode`
  - M4 包含此 endpoint 的 TDD
  - 限流：每 agent 每天 100 次

### D4 ✅ — 消息编辑/删除：**MVP 不做，且不预留字段**

- **决议**：MVP 阶段不支持编辑/删除；**`messages.edited_at` / `deleted_at` 字段不预留**（理由：会污染 RLS 与审计逻辑；若未来要做，拆独立 migration 更干净）
- **影响**：§5.1 L1 不含相关字段；§6 协议映射表不含相关帧

### D5 ⏳ — 长生命周期 WS 连接：**M4 Day-1 实测**

- **决议**：保持原方案（M4 第一天做 "hello world" 插件做可行性实测）
- **兜底**：若 OpenClaw 运行时不允许长连接，停 M4 → 召开应急讨论

### D6 ✅ — 插件发版节奏：**跟 OpenClaw SDK 同步**

- **决议**：`@qrclaw/openclaw-plugin` 的主版本跟随 OpenClaw plugin-sdk major bump；QRClaw 协议向后兼容扩展走 minor / patch
- **影响**：`peerDependencies` 固定 OpenClaw SDK major 范围

### D7 ✅ — MVP 范围瘦身：**瘦身 A（buttons / reactions / media / approvals / 斜杠命令 全部移到 M5+）**（v1.2 新增）

- **决议**：MVP 只交付 §2.4 T1；其余 Telegram 对齐能力全部移到"未来 agent team 独立 plan"
- **理由**：
  1. zeze 确认"先打通 channel，其他后续再迭代"
  2. L1/L2 瘦身后，M4 从 5-7 人日压到 4-5 人日，MVP 可在周 6-7 交付
  3. 避免"Agentic features"半成品（approvals / 斜杠命令一旦做一半，UX 很难收敛）
- **影响**：
  - §5.1 L1.8/L1.9/L1.10 标记⬜
  - §5.2 L2.3 合并为 ⬜
  - §6.1/§6.2 超出 MVP 的行全部标记⬜
  - §8 M5/M6 从本方案移除
  - §9 R13 新增"CI 防止误合并 buttons/reactions 实现"

### D8 ✅ — exec approvals / 斜杠命令：**全砍，不预留协议也不预留 UI**（v1.2 新增，D7 的细化）

- **决议**：
  - 不写 `exec_approval_*` 帧
  - 不写 `slash_command` 帧
  - 不写 `approvals.ts` 空文件
  - 未来有需要时由 agent team 重新起草 RFC
- **理由**：这类 Agentic 特性对 QRClaw 的"扫码 1-on-1"场景不是基础设施，且 UX 定义需独立的产品决策

### D9 ✅ — 群聊 / 话题：**MVP 不做，但 DB + 协议 optional 字段一次性预留**（v1.2 新增）

- **决议**：
  - **预留**：`conversations.kind` + `conversations.parent_conversation_id` + `messages.thread_id` + `messages.reply_to_message_id` + `conversation_participants` 表 + `MessageFrame.reply_to_message_id?` / `thread_id?` optional 字段 + Gateway fanout 抽象
  - **不做**：任何群聊 / 话题 / 回复引用的 UI
  - **永不做**：polls / stickers（N7）
- **理由**：群聊 / 话题涉及 Gateway fanout 基础架构，后加风险高；UI 层面可后补；polls/stickers 在 QRClaw 场景用不到
- **影响**：
  - L1.5 / L1.6 / L1.7 标记🟡（MVP 必做，但只是字段/抽象，不含实现）
  - L2.2 要求 `web/` 对未来字段 forward-compat

### D-REV-02 ✅ — **M3 不做灰度/回滚剧本**（v1.3 新增，对 review 阻塞 #2 的显式拒绝）

- **审查 reviewer 建议**：把 M3 拆成 M3a（新增 + 影子比对）+ M3b（visitor 正式切流），并加 `HISTORY_READ_BACKEND=edge|legacy` feature flag、指标阈值、路由级回滚开关。
- **zeze 决议（2026-04-20）**：**不采纳**。当前 QRClaw 处于 MVP 阶段（v0.4.8），流量规模不足以撑起灰度基础设施的复杂度；真出问题直接 `git revert` Gateway 部署代码即可，成本低于引入 flag + 双读路径。
- **理由**：
  1. MVP 阶段过度工程 > 过度保守 —— 现在加 flag / 双读，M5 可能整个推倒
  2. M3 唯一一个"写变动"（KEK 从 Gateway 移到 Edge Function）有很强的幂等性：Edge Function 只做读，回滚只需把 Gateway 读路径切回旧逻辑并 re-deploy，≤ 15 min
  3. Visitor 的 `/api/messages` 现有测试（tests 目录下 501+ 用例）是回归网
  4. QRClaw 当前没有 prod 流量指标基线，加再多 p95 / error_rate 阈值也是凭空拍板
- **接受的代价**：
  - M3 上线后若 Edge Function 冷启过长 / Deno 解密模块存在 bug，会有 **~15 min 的服务降级窗口**（users 看到"无法加载历史"错误）。这个风险**明确接受**。
  - 若 Edge Function 误配置 RLS 导致数据泄露，影响面等同 Gateway 当年误配。M3 TDD 9 条测试（§7.2 测试覆盖段）是主要防线。
- **补救条件（什么时候要回过头来加灰度）**：
  - QRClaw 进入真实付费用户阶段
  - 出现第一例因 M3 变更导致的 P0 事故
  - 任一情况发生后，由当时的 agent team 另起独立 plan 补灰度基建
- **影响**：M3 Task Card（§12.5.1 M3-EDGE）保持单卡交付，不拆 M3a/M3b；§8.3 M3 出口标准保持"部署 + 测试绿 + KEK 读路径移除"三条，不加指标阈值

---

**附录：讨论稿原选项（归档）**

- **D1 三选项**：A1 qrclaw 子目录 / A2 monorepo workspaces / B 独立仓（v1.1 采用 B，v1.2 改为 A1）
- **D2 两选项**：A Gateway 解密 / B Edge Function（采用 B 并扩大到 visitor 历史）
- **D3 两选项**：A owner JWT / B 新 endpoint + agent_token（采用 B）
- **D4**：MVP 不做 + 不预留字段（v1.2 强化）
- **D5**：可行性实测，M4 Day-1 验证
- **D6 三选项**：A 随 OpenClaw SDK / B 随 QRClaw 协议 / C 取两者 major 最大（采用 A）
- **D7**（v1.2 新）：MVP 范围瘦身 A
- **D8**（v1.2 新）：exec approvals / 斜杠命令 全砍
- **D9**（v1.2 新）：群聊 / 话题 架构预留不实现；polls / stickers 永不做
- **D-REV-02**（v1.3 新）：显式拒给 M3 加灰度 / 双读 / feature flag —— MVP 阶段回滚靠 `git revert` 足够

---

## §11 方案自审清单

> 写完本方案后执行的自我审查；与 `writing-plans` 的 "Self-Review" 段对齐。

### 11.1 完整性检查（Spec Coverage）

对照 zeze 的全部明确要求（本方案前两轮会话摘录），一一匹配：


| zeze 要求                              | 落位                                    | ✅/❌ |
| ------------------------------------ | ------------------------------------- | --- |
| "qrclaw 是独立项目，可让用户 agent 接入"         | §2.1、§2.4 T3 N2                       | ✅   |
| "接入方式变成通过 openclaw 插件"               | §5.3 L3 完整工作线                         | ✅   |
| "qrclaw 是 telegram 渠道的角色 / 对话连接渠道"   | §2.1、§3.1 架构图                         | ✅   |
| "agent 可生成二维码分享出去"                   | §5.3 L3 tools/、§6.3、G6                | ✅   |
| "先做 mvp 打通 channel，群聊/话题后续做"         | §2.4 + D7/D8/D9 + §8 M4 即终点            | ✅   |
| "群聊/话题架构上做好提前设计"                      | §5.1 L1.5/L1.6/L1.7 架构预留、§2.4 T2      | ✅   |
| "斜杠命令 / 审批 UI 先不做，不是关键基础设施"          | §10 D8 + §2.4 T3 N6/N8                | ✅   |
| "支持多个 agent 接入在 qrclaw 管理"           | §5.1 L1.3 + §5.2 L2.1（dashboard） + G4 | ✅   |
| "先不要写代码，做方案讨论"                       | 本文档是方案，**不含实现**，每个任务另立 Task Card（§12）  | ✅   |
| "铁律 C1 可以变，消息要存下来"                    | §1.3 新铁律（C1 改、C5 新增）、§7 持久化规格、G5      | ✅   |
| "改造方案要把 github-publish-guide 一起考虑进去" | §4 合并说明、§8.2 甘特叠加、§4.3/§4.4 必要补丁      | ✅   |
| "后续会组建 agent team 分配不同 agent 完成"     | **§12 Agent Team Task Cards**（v1.2 新增） | ✅   |


### 11.2 Placeholder / 红旗扫描

搜了全文，没有出现以下：

- "TBD" / "TODO later" / "fill in"
- "add proper validation" 类占位
- 未定义的类型 / 函数被 §5 / §6 引用
- 与 §1 铁律自相矛盾的后续段落

（§10 的 D1–D9 已于 2026-04-20 全部决议；D5 为实测项，M4 Day-1 验证）

### 11.3 类型与术语一致性


| 术语              | 本方案统一用法                                         | 避免混用                                                  |
| --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| "QRClaw agent"  | 指 **QRClaw 侧 `agents` 表的一行**（即 owner 旗下的一个对话主体） | ≠ "OpenClaw agent"（指 OpenClaw core 里跑 LLM turn 的那个对象） |
| "plugin" / "插件" | 本方案核心交付物：`@qrclaw/openclaw-plugin`              | ≠ QRClaw 协议的扩展（称"协议扩展"）                               |
| "agent_token"   | QRClaw 侧，`agents.api_key_hash` 对应的明文 token      | ≠ OpenClaw 的任何 token                                  |
| "账户 / account"  | OpenClaw 里对一组凭据的命名（如 `default`, `my-2nd-bot`）   | 其他语境用"用户 / user"或"owner"                              |
| "history"       | 冷回放（跨会话 / 跨重启）                                  | ≠ "offline queue"（热缓存）                                |


### 11.4 与既有文档的一致性


| 核对点                                           | 结论                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `github-publish-guide.md §2` 的依赖图             | §4.3 列出必要补丁（M0 改动）                                                                   |
| `github-publish-guide.md §3.1` 决策锁定表          | §4.3 列出新增两行（本方案 M0 改动）                                                               |
| `phase2-wave1-http-contracts.md §5 T5` recipe | §5.1 L1.2 明确复用                                                                       |
| `phase2-wave2-outbound-ws.md` outbound barrel | §4.4 要求保持开放；本方案不冲突                                                                   |
| `CLAUDE.md 三条铁律`                              | §1.3 明确重定义（M0 改动）                                                                    |
| `.claude/skills/qrclaw-map/map.md`            | §1.4 点名更新（M0 改动）                                                                     |
| `tests/acceptance/` 新增用例                      | §1.4 + §3.2 I1 + §9 R8 均点名 `iron-rules.spec.ts` 和 `plugin-indistinguishable.spec.ts` |


### 11.5 反向追问（防止盲点）

- **问**：如果 OpenClaw 插件无法做长连接 WS（只接受 webhook 入站），本方案还成立吗？  
**答**：不成立。但 `sdk-channel-plugins.md` §"Handle inbound messages" 明确允许 `registerFull(api)` 启动长生命周期进程（见 Microsoft Teams / Google Chat 例子）。M4 开工前需要实测确认——已列为 §10 **D5**。
- **问**：插件里解密消息（用 agent token 对应的对话的 DEK）违反 C1 中立中继吗？  
**答**：不违反。解密发生在**端侧**（OpenClaw 用户自己的机器），不是 QRClaw 基础设施。C1 说的是 qrclaw.ai 侧不解读，插件在他家解密是合法身份读自己的信。
- **问**：C5 回放与现有 `gateway/src/redis/offline-queue.ts` 冗余吗？  
**答**：不冗余。§7.3 已说明职责分离（热 vs 冷）；且 offline queue 有 200 条 / 24h 上限，不足以承担"换机 / 长期重启"场景。

### 11.6 通过标准

- 所有 zeze 明确提出的要求有明确落点（§11.1）
- 无 placeholder（§11.2）
- 与现有 guide / plan 的合并路径清晰（§4 / §11.4）
- 三种身份的持久化都有正面规格（§7）
- 插件文件结构与 OpenClaw SDK 惯例对齐（§5.3）
- 风险写了（§9）；未决项全部锁定（§10 决议记录）
- 第一个可验证的里程碑（M0）只改文档，不动代码——降低启动风险

---

## 文档修改历史

- **2026-04-20 v1.0**：初版。回应 zeze 在 `github-publish-guide.md` 推进过程中提出的"QRClaw 接入 OpenClaw 成插件 + 体验往 Telegram 对齐 + 铁律 C1 改动 + 消息可回放"四条需求。
- **2026-04-20 v1.1**：§10 D1–D6 决议锁定（D1 = 独立仓 B / D2 = Edge Function 宽 / D3 = agent_token + 新 endpoint / D4 = 不做编辑删除 / D5 实测 / D6 = 随 OpenClaw SDK）。同步更新 §5.3、§7、M3 范围、M5 瘦身。
- **2026-04-20 v1.2 · MVP 聚焦版 + Agent Team Ready**（**本版**）：
  - **D1 修订**：B（独立仓）→ **A1（qrclaw 主仓子目录 `plugins/openclaw/`）**；理由见 §10 D1
  - **D7 新增**：MVP 范围瘦身 A（buttons / reactions / media / approvals / 斜杠命令 全部移到 M5+；本方案终点 = M4）
  - **D8 新增**：exec approvals / 斜杠命令 全砍，不预留协议也不预留 UI
  - **D9 新增**：群聊 / 话题 MVP 不做但 DB + 协议 optional 字段一次性预留；polls / stickers 永不做也不预留
  - **D4 强化**：除 MVP 不做外，`messages.edited_at/deleted_at` 字段**也不预留**
  - §2.4 重构：分 T1 MVP 必做 / T2 架构预留 / T3 永不做三档
  - §5.1 L1 瘦身：L1.5–L1.7 改为群聊 DB/协议/fanout 预留；L1.8–L1.10 标记⬜
  - §5.2 L2 瘦身：只保留 L2.1 dashboard 多 agent + L2.2 forward-compat
  - §5.3 插件路径改为 `plugins/openclaw/`；删除 MVP 不含的 `outbound/buttons.ts` / `media.ts` / `reactions.ts` / `approvals.ts`
  - §6 协议映射表用 ✅/🟡/⬜ 标记 MVP 状态
  - §8 里程碑：M5/M6 从本方案移除；MVP 总工时 15-19 人日，周 6-7 交付；每个里程碑注明推荐主责 agent 类型
  - §9 新增 R11（多 agent 并行 PR 冲突）/ R12（预留字段死代码风险）/ R13（reviewer agent 漏掉 D8 范围）
  - **§12 新章节**：Agent Team Task Cards — 为每个任务提供自包含 context brief，未来可分配给不同 agent 并行执行

---

**STATUS：方案已全部锁定，下一步组建 agent team 并按 §12 Task Cards 分派 M0–M4（MVP 终点）。每个 Task Card 会衍生一份 `docs/superpowers/plans/<milestone>-<task-id>.md` 独立 bite-sized TDD plan。**

---

## §12 Agent Team Task Cards（任务分工卡）

> **设计约束**：每张 Task Card 是**自包含**的——一个新 agent 在**零上下文**的情况下读这张卡，应该能独立执行任务；不需要把本方案全文塞给它。
> **读取协议**：agent 被分派任务时，只需被喂 "本方案 §10 决议记录 + §2.4 范围表 + 对应的 §12.X Task Card 全文 + 任务卡声明的关键 codebase pointer"。

### 12.1 Task Card 公共规范

每张卡都包含以下字段：

| 字段 | 说明 |
| --- | --- |
| **ID** | 对应 §5 / §8 的 L 编号 + 里程碑 |
| **Mission**（一句话）| 这张卡要产出什么明确的交付物 |
| **Recommended Agent Type** | 从 `.claude/agents/` 或 subagent 系统选合适类型 |
| **Required Skills** | 必须 `Read` 并遵循的 `.claude/skills/*/SKILL.md` |
| **Owner**（v1.3 新增）| 该卡对某个"共享目录"的**唯一写权限**声明（例如"本卡是 `shared/contracts/ws/**` 的 Owner"）。其他卡即使 Write-allowed 范围覆盖到该目录，也应走 Owner 卡 PR；没有声明 Owner 的卡不对共享目录负主责 |
| **Read-only Files** | 任务期间不得修改的文件 |
| **Write-allowed Files** | 任务期间可修改 / 新建的文件范围（path glob） |
| **Inputs** | 从哪里获取输入（配置 / 上游决议 / 环境变量） |
| **Outputs / Acceptance** | 完成的客观标准（CI 命令 / 文件存在性 / 测试绿） |
| **Dependencies** | 哪几张卡必须先完成 |
| **Forbidden** | 明确"不做什么"（来自 §10 决议的范围边界） |
| **Conflict Resolution**（v1.3 新增）| 当多张卡的 Write-allowed 在同一文件出现冲突时，由哪张卡仲裁（默认：先合并的走，后来者做 merge；但若涉及 shared/contracts/ 或 gateway/src/ws/，必须由对应 Owner 卡决定） |
| **Estimated Effort** | 人日估计 |

**共享目录 Owner 分配表（v1.3 引入，避免 M2 / M3 / M4 的隐性交叉）**

| 共享目录 | Owner 卡 | 其他卡的权限 |
| --- | --- | --- |
| `shared/contracts/ws/**` | **M2-WS-OPT**（§12.4.2） | M3/M4 只读；需要新增字段走 M2 PR |
| `shared/contracts/http/**` | **M3-EDGE**（§12.5.1） | M2/M4 只读；需要新增 HTTP schema 走 M3 PR |
| `gateway/src/ws/**` | **M2-GW-FANOUT**（§12.4.3） | M3 只读；修改 router 必须由 M2 合并 |
| `gateway/src/routes/**` | **M3-EDGE**（§12.5.1） | M4 只读；新增路由走 M3 PR |
| `supabase/migrations/**` | **M1-DB-RESERVE**（§12.3.2） | 后续里程碑新增 migration 自带新文件名，不 conflict |
| `supabase/functions/**` | **M3-EDGE**（§12.5.1） | M4 只读 |
| `plugins/openclaw/**` | **M4-PLUGIN**（§12.6.2） | 其他卡完全禁止写入 |

### 12.2 M0 — 铁律重定义与文档基础

#### 12.2.1 Card M0-DOC — 铁律与文档同步

- **Mission**：把新铁律 C1/C2/C5 同步到 `CLAUDE.md`、`qrclaw-map/map.md`、`requirements/technical-specification-*.md`，并对 `github-publish-guide.md` 加 §4.3 的三处补丁
- **Recommended Agent**：`doc-updater` subagent
- **Required Skills**：`continuous-learning-v2`（可选）、`qrclaw-map`
- **Read-only Files**：`gateway/**`、`web/**`、`supabase/**`、`plugins/**`
- **Write-allowed Files**：`CLAUDE.md`、`.claude/skills/qrclaw-map/map.md`、`requirements/technical-specification-*.md`、`docs/release/github-publish-guide.md`、`docs/refactor/execution-log.md`
- **Inputs**：本方案 §1.3、§4.3
- **Outputs / Acceptance**：
  - CLAUDE.md 中"三条铁律"表 → 替换为新版四条（C1/C2/C4/C5）
  - guide §2 依赖图追加本方案分支；§3.1 决策日志追加两行
  - execution-log.md 顶部加一条 Decision Reversal 记录
- **Dependencies**：无
- **Forbidden**：不改代码；不修改 `tests/**`
- **Effort**：0.5 人日

#### 12.2.2 Card M0-IRON-TEST — iron-rules acceptance 测试

- **Mission**：新增 `tests/acceptance/iron-rules.spec.ts`，断言 C1/C2/C5 的代码级红线（grep gateway 源码无 LLM 关键词；所有 `INSERT INTO messages` 走 `persistEncryptedMessage`；三个 history endpoint 存在）
- **Recommended Agent**：`tdd-guide`
- **Required Skills**：`tdd-workflow`、`e2e-testing`
- **Read-only Files**：`gateway/src/**`、`supabase/functions/**`
- **Write-allowed Files**：`tests/acceptance/iron-rules.spec.ts`（新建）、`tests/**` 内的 fixtures
- **Outputs / Acceptance**：
  - `cd tests && npx vitest run acceptance/iron-rules.spec.ts` 绿
  - 覆盖 C1（6 个关键词 grep）、C2（persist 路径唯一）、C5（3 个 endpoint 存在）
- **Dependencies**：M0-DOC（bland 铁律定义已更新）
- **Effort**：0.5 人日

### 12.3 M1 — 多 Agent 数据层 + 群聊/话题预留

#### 12.3.1 Card M1-DB-AGENTS — 多 agent 数据迁移

> **v1.3 执行落点（2026-04-20）**：按 **B 方案零 migration** 交付，现状备忘录见 [`docs/refactor/m1-agents-state.md`](../../refactor/m1-agents-state.md)。关键结论：`agents.owner_id` 无 UNIQUE 约束，多 agent per owner 已原生支持；`agents.ws_connected + last_seen_at` 已覆盖在线态需求；独立 `agent_connections` 表推迟到 M5+（触发条件见备忘录 §2.3）。以下原卡内容作为 A 方案的参考实现保留。

- **Mission**：确认 / 补全 `agents` 表支持 "one owner → many agents"；新增 `agent_connections` 表追踪插件在线状态
- **Recommended Agent**：`database-reviewer`
- **Required Skills**：`supabase`、`supabase-postgres-best-practices`、`postgres-patterns`、`database-migrations`
- **Read-only Files**：所有 `gateway/**`、`web/**`、`plugins/**`
- **Write-allowed Files**：
  - `supabase/migrations/<YYYYMMDD>_multi_agent_per_owner.sql`（新建 / 可能为空 if already supports）
  - `supabase/migrations/<YYYYMMDD>_agent_connections.sql`（新建）
  - `src/types/database.types.ts`（regenerate）
- **Inputs**：本方案 §5.1 L1.3/L1.4
- **Outputs / Acceptance**：
  - staging 上 `supabase db push` 无错
  - `agents` 表可以容纳多行/owner_id
  - `agent_connections (agent_id uuid PK, last_seen_at timestamptz, account_label text, is_online bool)` 存在，RLS 启用
  - TypeScript 类型已重新生成
- **Dependencies**：M0
- **Forbidden**：不加 `edited_at` / `deleted_at`（D4）；不加 RLS bypass
- **Effort**：1 人日（**B 方案实际 0.25 人日 = 调研 + 备忘录**）

#### 12.3.2 Card M1-DB-RESERVE — 群聊/话题 DB 字段预留

- **Mission**：一次性给 `conversations` / `messages` 加上未来群聊/话题所需的 optional 字段；新增 `conversation_participants` 表
- **Recommended Agent**：`database-reviewer`
- **Required Skills**：`supabase-postgres-best-practices`、`database-migrations`
- **Read-only Files**：`gateway/**`、`web/**`
- **Write-allowed Files**：
  - `supabase/migrations/<YYYYMMDD>_future_group_topic_reserve.sql`（新建）
  - `src/types/database.types.ts`（regenerate）
- **Inputs**：本方案 §2.4 T2、§5.1 L1.5、§10 D9
- **Outputs / Acceptance**：
  - `conversations.kind text not null default 'direct' check (kind in ('direct','group','topic'))`
  - `conversations.parent_conversation_id uuid references conversations(id)`（nullable）
  - `messages.thread_id uuid`（nullable）
  - `messages.reply_to_message_id uuid references messages(id)`（nullable）
  - 新表 `conversation_participants(conversation_id, participant_kind, participant_id, joined_at, PRIMARY KEY(conversation_id, participant_kind, participant_id))` + RLS
  - migration 文件**首行注释**写明"未来使用字段；MVP 零引用"
  - 现有 700+ 测试全绿
- **Dependencies**：M1-DB-AGENTS
- **Forbidden**：不加 `edited_at` / `deleted_at`（D4）；不加 `poll_id` / `sticker_id`（D9 N7）
- **Effort**：1-1.5 人日

### 12.4 M2 — Dashboard 多 Agent 管理 + 协议 optional + fanout 抽象

#### 12.4.1 Card M2-DASH — Dashboard 多 agent 页

- **Mission**：实现 `web/src/app/(dashboard)/agents/` 的列表 / 新增 / token 查看 / token 重生成 / account_label
- **Recommended Agent**：`frontend` subagent（React / Next.js 16）
- **Required Skills**：`frontend-patterns`、`pencil-to-code`（若有新设计稿）、`react-best-practices`
- **Read-only Files**：`gateway/**`、`supabase/migrations/**`、设计 token
- **Write-allowed Files**：
  - `web/src/app/(dashboard)/agents/**`（新建）
  - `web/src/components/agents/**`（新建）
  - `web/src/lib/api/agents.ts`（新建或补全）
- **Inputs**：本方案 §5.2 L2.1、现有 design tokens
- **Outputs / Acceptance**：
  - `/agents` 路由登录可访问，列表展示所有 agents 的 account_label + online 状态
  - "重生成 token" 操作调 Gateway endpoint；UI 显示新 token 一次后隐藏
  - 六栏验证绿（build + typecheck + playwright smoke）
- **Dependencies**：M1-DB-AGENTS
- **Forbidden**：不在 dashboard 加 buttons/reactions/approvals UI（D8）
- **Effort**：1.5-2 人日

#### 12.4.2 Card M2-WS-OPT — 协议 optional 字段落地

- **Mission**：在 `shared/contracts/ws/types.ts` 和 outbound Zod schema 里加 `reply_to_message_id?` / `thread_id?` optional 字段；`web/` 在收到带这些字段的 `message` 帧时 forward-compat 忽略
- **Recommended Agent**：`architect` + `tdd-guide` 双人
- **Required Skills**：`api-design`、`tdd-workflow`
- **Read-only Files**：`gateway/src/ws/**`（仅检查不动）
- **Write-allowed Files**：
  - `shared/contracts/ws/types.ts`
  - `shared/contracts/ws/outbound.ts`
  - `shared/contracts/ws/protocol.ts` 如需 bump
  - `web/src/components/chat/MessageBubble.tsx`（forward-compat 分支）
  - `tests/contracts/**`
- **Inputs**：本方案 §5.1 L1.6、Phase 2 Wave 2 已落地的 outbound barrel
- **Outputs / Acceptance**：
  - `MessageFrame` 新增两个 optional 字段，Zod schema 使用 `.optional()`
  - `npm run build --workspace=web` 零 error
  - parity test 绿（outbound + inbound 两端类型一致）
  - Playwright smoke：`web/` 收到带 `reply_to_message_id` 的 mock 帧不 crash
- **Dependencies**：Phase 2 Wave 2 T1–T4、M1-DB-RESERVE
- **Forbidden**：不加 inline buttons / reactions / media 字段（D8）；不加 required 字段（必须 optional）
- **Effort**：1 人日

#### 12.4.3 Card M2-GW-FANOUT — Gateway fanout 抽象

- **Mission**：把 gateway `ws/router.ts:deliverToConversation` 从硬编码 "1 visitor + 1 agent" 抽象成"查 conversation_participants → 遍历发送"；direct 场景保留 fast-path 零回归。**⚠️ 仅抽象、不改行为**——本卡不引入群聊/话题实际分发语义，也不 emit 任何新 frame；更换 fanout 内部实现不应让 direct 场景可观测行为（消息顺序、typing、ack 时机）发生任何变化
- **Recommended Agent**：`architect`
- **Required Skills**：`backend-patterns`、`tdd-workflow`
- **Read-only Files**：`web/**`、`supabase/migrations/**`（已由 M1 落地）
- **Write-allowed Files**：`gateway/src/ws/router.ts`、`gateway/src/ws/fanout.ts`（新）、对应 tests
- **Inputs**：本方案 §5.1 L1.7、§10 D9
- **Outputs / Acceptance**：
  - 新 `fanout.ts` 暴露 `fanoutToConversation(conversationId, frame)` 函数
  - `router.ts` direct 场景走 fast-path（不查 participants 表），性能零回归
  - gateway 单测覆盖 direct / group / topic 三种 kind 的 fanout 行为（group/topic 走通用路径，direct 走 fast-path）
  - `cd gateway && npm run typecheck` 清洁
- **Dependencies**：M1-DB-RESERVE
- **Forbidden**：不实际 emit 群聊/话题 frame 到 visitor（只抽象 fanout 层）
- **Effort**：1-1.5 人日

### 12.5 M3 — Agent History API（C5 核心 + D2 宽）

#### 12.5.1 Card M3-EDGE — 解密 Edge Function + Deno 解密移植

- **Mission**：新建 Supabase Edge Function `decrypted-messages`（单函数内部分支 agent / visitor），移植 Node 解密模块到 Deno；Gateway 建立薄转发层给 `POST /api/agent/history` 和 `POST /api/messages`
- **Recommended Agent**：`security-reviewer` + `database-reviewer`
- **Required Skills**：`security-review`、`supabase`、`supabase-postgres-best-practices`、`tdd-workflow`
- **Read-only Files**：`gateway/src/crypto/**`（作为移植参考）、`web/**`
- **Write-allowed Files**：
  - `supabase/functions/decrypted-messages/**`（新）
  - `supabase/functions/_shared/decrypt.ts`（新）
  - `gateway/src/routes/agent-history.ts`（新，薄转发）
  - `gateway/src/routes/messages.ts`（改为薄转发，**不再解密**）
  - `shared/contracts/http/agent/history.ts`（新，Zod schema）
  - 对应 tests
- **Inputs**：本方案 §5.1 L1.2、§7、§10 D2
- **Outputs / Acceptance**：
  - Edge Function 部署到 staging，能对合法 agent_token / session_token 返回解密消息
  - Gateway 两个 endpoint 都走薄转发，**不再持有 KEK 读路径**（grep 确认 `gateway/src/` 中读路径无 KEK 引用）
  - `POST /api/agent/history` 9 个测试全绿（合法 / 跨 owner 404 / 无 token 401 / 错 token 401 / since / cursor / limit / 429 / 明文 ≠ 密文）
  - `POST /api/messages` 现有测试不红
  - Phase 2 Wave 1 的 `validateRequest` 被复用在新路由
- **Dependencies**：Phase 2 Wave 1 完成、M0、M1
- **Forbidden**：不把 KEK 放在 gateway 读路径；不 bypass RLS；不暴露 `poll` / `sticker` 字段
- **Effort**：4-5 人日（最重的卡）

### 12.6 M4 — MVP 插件发布

#### 12.6.1 Card M4-FEAS — D5 Day-1 可行性实测

- **Mission**：用 OpenClaw plugin SDK 的 `registerFull(api)` 起一个 hello-world 插件，进程保活 ≥ 10 min + 能响应 inbound message；验证 "长生命周期 WS 连接" 在 OpenClaw 运行时可行
- **Recommended Agent**：`architect`（独立做 spike）
- **Required Skills**：`agent-connectivity-test`（qrclaw 自己的 skill）
- **Read-only Files**：OpenClaw 插件 SDK 文档（只读外部）
- **Write-allowed Files**：`plugins/openclaw/hello/*`（临时目录，M4 结束后删）
- **Outputs / Acceptance**：
  - 运行测试 OpenClaw 实例 + 加载 hello 插件 ≥ 10 min，进程不退；能打印 inbound 事件
  - 若失败 → 产生 "D5 失败备忘录"，halt M4
- **Dependencies**：无（M4 第一件事）
- **Effort**：0.5 人日

#### 12.6.2 Card M4-PLUGIN — 插件 MVP 实现

- **Mission**：按 §5.3 结构在 `plugins/openclaw/` 实现 MVP 子集（channel + accounts + client + inbound + outbound/{text,stream} + history + tools/create-qrcode + runtime + setup-entry + index）
- **Recommended Agent**：`tdd-guide` 主责 + `architect` review
- **Required Skills**：`tdd-workflow`、`typescript-standards`、`coding-standards`
- **Read-only Files**：`gateway/**`、`web/**`、`supabase/functions/**`、`shared/contracts/**`、`scripts/agent-sdk/agent-connector.ts`（作为 fork 参考）
- **Write-allowed Files**：`plugins/openclaw/**`
- **Inputs**：本方案 §5.3、§6、§10 D1 / D6、M4-FEAS 结论
- **Outputs / Acceptance**：
  - 所有 §5.3 目录结构存在（不含 buttons / media / reactions / approvals，D8 禁止）
  - `channel.test.ts` / `inbound.test.ts` / `outbound.test.ts` / `history.test.ts` 全绿
  - `tests/e2e/round-trip.spec.ts` 能跑通 visitor→agent→visitor 文本 + 流式
  - 在一个真实 OpenClaw 测试实例上加载、配置 2 个 agent token、各完成 1 次完整对话
  - agent 重启后 history 回放无丢失（message_id dedup 生效）
- **Dependencies**：M2, M3, M4-FEAS, Phase 2 Wave 2 T1–T4
- **Forbidden**：不 import OpenClaw private 包；不创建 `outbound/buttons.ts` / `media.ts` / `reactions.ts` / `approvals.ts`（D7/D8）；不向 gateway 发除 §6.2 ✅ 之外的任何帧
- **Effort**：3 人日

#### 12.6.3 Card M4-CREATE-QR — `POST /api/agent/create-qrcode` + tool

- **Mission**：在 gateway 新增 `POST /api/agent/create-qrcode`（agent_token 鉴权、rate limit、owner 范围断言）；插件侧 `tools/create-qrcode.ts` 实现
- **Recommended Agent**：`security-reviewer` 主 + `backend` 辅
- **Required Skills**：`security-review`、`api-design`、`tdd-workflow`
- **Read-only Files**：`web/**`、`supabase/functions/**`
- **Write-allowed Files**：
  - `gateway/src/routes/agent-create-qrcode.ts`（新）
  - `shared/contracts/http/agent/create-qrcode.ts`（新 Zod）
  - `plugins/openclaw/src/tools/create-qrcode.ts`（新）
  - 对应 tests
- **Inputs**：本方案 §10 D3、§6.3
- **Outputs / Acceptance**：
  - agent_token 请求返回新 QR slug + image URL；owner_id 被正确绑定
  - 跨 owner 攻击返回 404
  - 每 agent/day 限 100 次，第 101 次 429
  - security-review skill 通过
- **Dependencies**：M4-PLUGIN（先有插件骨架）
- **Effort**：1-1.5 人日

#### 12.6.4 Card M4-CI-RELEASE — 插件 CI + 发布流水线

- **Mission**：新建 `.github/workflows/plugin-openclaw.yml`（路径过滤 `plugins/openclaw/**`）+ changesets 配置 + README；完成一次 dry-run 发布
- **Recommended Agent**：`deployment-expert`
- **Required Skills**：`deployments-cicd`、`deployment-patterns`
- **Read-only Files**：`gateway/**`、`web/**`
- **Write-allowed Files**：
  - `.github/workflows/plugin-openclaw.yml`（新）
  - `plugins/openclaw/.changeset/**`（新）
  - `plugins/openclaw/README.md`（新）
  - `scripts/agent-sdk/README.md`（加 "推荐迁移" 指引）
- **Inputs**：本方案 §5.4、§10 D6
- **Outputs / Acceptance**：
  - PR 触发 workflow 只在改动 `plugins/openclaw/**` 时跑
  - `npm publish --dry-run` 成功
  - `peerDependencies` 固定 OpenClaw SDK major 范围
- **Dependencies**：M4-PLUGIN
- **Effort**：0.5-1 人日

#### 12.6.5 Card M4-VERIFY — 全链路 MVP 验收

- **Mission**：跑 `plugin-indistinguishable.spec.ts`（同一对话分别用 `example-openclaw-agent.ts` 和 plugin 跑，DB 记录 diff 仅时间戳不同）
- **Recommended Agent**：`e2e-runner`
- **Required Skills**：`e2e-testing`、`verification-loop`、`verification-before-completion`
- **Read-only Files**：全仓
- **Write-allowed Files**：`tests/acceptance/plugin-indistinguishable.spec.ts`（新）
- **Inputs**：本方案 §3.2 I1、§9 R8
- **Outputs / Acceptance**：spec 绿；CI 加入 required check
- **Dependencies**：M4-PLUGIN、M4-CREATE-QR
- **Effort**：0.5 人日

### 12.7 Agent Team 协同规范

以下几条防止 agent 之间协作时的典型翻车：

1. **串行 PR 原则**：同一里程碑内的 cards 可并行开发，但**合并到 main 必须串行**（一次 merge 一个）；特别是修改 `shared/contracts/` 的 cards 不可并行 merge。
2. **read-only 配置是硬红线**：每张 Task Card 声明的 `Read-only Files` 范围，agent 必须在 `.cursor/rules/` 或自己的 system prompt 里强制约束；若任务需要跨越范围，必须起草**独立子任务并走 review**。
3. **Forbidden 列表优先于 Mission**：如果 Mission 和 Forbidden 冲突，Agent 必须 halt 并上报给 `planner` / 人类。
4. **交叉 review**：实现类 card 合并前，至少经过一个 review-类 agent（`code-reviewer` / `security-reviewer` / `go-reviewer` 等）过一遍；文档类 card 必须经 `doc-updater` review。
5. **Test-First**：所有标 ✅ 的 card 都走 TDD（红→绿→重构）；Task Card 本身要求 "测试先于实现存在"。
6. **Context brief 完整性**：Agent 开始执行前必须 verbatim 粘贴自己拿到的 Task Card，并在输出的 PR description 里引用，方便人类/下游 reviewer 追溯。