# Wave 10 Q3: LobeChat Session vs QRClaw Conversation

## 结论

**不要把 QRClaw `owner_agent_conversations` 迁成 LobeChat Session。** 两者是相邻但不等价的概念：

- LobeChat Session 是“一个可聊天的 AI 助手/群组空间”，自身持有 agent/model config、分组、置顶、搜索、复制等 UI 产品能力。
- QRClaw Conversation 是“owner 与一个 QRClaw agent 的加密私聊执行上下文”，核心职责是绑定 owner/agent、承接 provider runtime session、保存加密消息与 run。

推荐方案：**保留 QRClaw Conversation 作为后端 SSoT，fork LobeChat 时只复用 Session UI/交互层，用 adapter 把 QRClaw agents/conversations 映射成 LobeChat session list。**

## 依据

### QRClaw Conversation

`owner_agent_conversations` 当前 schema：

| 字段 | 语义 |
|---|---|
| `id` | QRClaw conversation id，后端加密与 run 的主锚点 |
| `owner_id` | owner 私聊归属 |
| `agent_id` | 被私聊的 QRClaw agent |
| `provider_session_id` | provider 内部 session/resume id |
| `provider_work_dir` | provider 工作目录或 opaque runtime id |
| `status` | 当前只有 `active` 为主路径 |
| `last_active_at` | 会话排序锚点 |
| `created_at` / `updated_at` | 审计字段 |

关键约束：

- `UNIQUE(owner_id, agent_id)`：当前设计下 **一个 owner 对同一个 agent 只有一个 active 主 conversation**，甚至 archived 后也会被唯一约束挡住新建，除非未来改 partial unique。
- provider 不直接在 conversation 表里出现；provider 在 `agent_bindings.provider` 和 `owner_agent_runs.provider` 中。conversation 只缓存 provider runtime 的 `provider_session_id/provider_work_dir`。
- 消息与事件使用 `owner_agent_messages`、`owner_agent_run_events`，内容密文字段为 `content_encrypted`，DEK 在 `owner_agent_conversation_keys`。
- 读路径遵守 C2：明文只在 owner 客户端或 `decrypted-messages` Edge Function 内存态出现。

### QRClaw 前端 store

`web/src/stores/owner-agent-chat-store.ts` 目前按 agent 组织 UI 状态：

| 状态/API | 当前含义 |
|---|---|
| `agents` | owner 的 agent 列表 |
| `selectedAgentId` | 当前打开的“会话”其实是 agent id |
| `messagesByAgent` | 前端缓存按 agent id 分桶，而不是 conversation id |
| `listMessages(agentId)` | 通过 Gateway 拉该 agent 的 owner-agent history |
| `sendMessage(agentId, ...)` | Gateway 内部 get-or-create conversation，再创建 run |
| `resetContext(agentId)` | 清空 provider runtime context |

这说明 QRClaw UI 目前把“选择 agent”当成打开 conversation；后端 conversation 是透明创建/复用的执行容器。

### LobeChat Session

本轮核对了 LobeChat 当前包源码 `@lobehub/chat@1.143.3` 的 session store/service，以及 deprecated IndexedDB schema：

- `src/store/session/slices/session/initialState.ts`：Session store 维护 `activeId`、`sessions`、`defaultSessions`、`pinnedSessions`、`searchKeywords`、`sessionRenamingId`、`sessionUpdatingId`。
- `src/store/session/slices/session/action.ts`：支持 `createSession`、`duplicateSession`、`removeSession`、`pinSession`、`updateSessionGroupId`、`useFetchSessions`、`useSearchSessions`。
- `src/database/_deprecated/schemas/session.ts`：`DB_SessionSchema` 含 `config`、`group`、`meta`、`pinned`、`type`。
- `AgentSchema` 含 `model`、`provider`、`params`、`systemRole`、`plugins`、`tts`、`openingMessage`、`openingQuestions`。
- `src/services/session/type.ts`：Session service 暴露 count/rank/search/group/update/delete/config 等完整列表能力。

因此 LobeChat Session **绑定特定 agent/model config**。它不是单纯聊天 transcript id，而是“配置 + 消息 + UI 元信息”的组合。

## 语义差异

| 问题 | LobeChat Session | QRClaw Conversation |
|---|---|---|
| 核心身份 | chat session / agent session / group session | owner-agent private conversation |
| 是否绑定 model config | 是。`config.model/provider/params/systemRole/plugins/tts` 在 session/agent config 内 | 否。conversation 不存 model；run 可存 `requested_model/actual_model`，provider 由 binding/run 决定 |
| 是否绑定 agent | 可视为 session 自身就是一个 agent 配置实例 | 是。`agent_id` 是强 FK |
| 是否绑定 provider | 是，config 里有 provider/model | 间接绑定。agent binding/run 有 provider；conversation 只保存 provider runtime session |
| 同一用户对同一 agent 多会话 | 可以复制/新建多个类似 session，模型上没有 owner-agent 唯一约束 | 当前不可以，`UNIQUE(owner_id, agent_id)` 锁定一对一 |
| reset 语义 | 更像清空/切换聊天上下文或复制新 session | 明确清空 `provider_session_id/provider_work_dir` 并通知 host |
| 消息安全 | 普通 chat app 语义，默认不是 C2 加密存储模型 | C2 铁律：平台持久化消息必须密文 |

## 成熟度比较

| 维度 | LobeChat | QRClaw |
|---|---|---|
| history | 成熟。Session/Topic/Message 模型完整，UI 已有会话列表、当前会话、分组、置顶 | 可用但较新。owner history 已经通过 Gateway + `decrypted-messages` 回放，store eager load 当前 agent |
| pagination | 旧模型有 `query({ pageSize, current })`；服务层具备 count/rank/list 能力 | DB 有 `idx_owner_agent_messages_conversation_created_at`，但 owner UI/API 当前没有明确 cursor/page contract |
| search | 成熟。`searchSessions(keyword)` 会查 session meta、message content、topic title | 暂缺 owner-agent 搜索；加密存储下不能直接 SQL 搜明文，需要客户端索引或受控 Edge Function |
| archive / soft delete | UI 有 pinned/group；源码中看到 remove/duplicate，没有看到等价 `archived_at` 软删字段 | `status` 可表达 archived，但唯一约束和 UI/API 还没形成 archive 语义 |
| multi-device sync | 数据库模式和 service abstraction 成熟，LobeChat 面向多端同步演进 | Supabase/RLS 天然多端读写，但 owner chat store 是前端内存缓存，列表/搜索/分页产品层仍薄 |
| encryption | 默认不是 QRClaw C2 模型 | 强项。conversation key、密文消息、Edge Function 内存态解密路径已经成体系 |
| provider runtime | LLM provider 抽象成熟，但假设 provider 是模型服务 | QRClaw 更适合本地/云端 agent host、provider session/workdir、run event |

## 推荐取舍

### 1. 保留 QRClaw schema

原因：

- `owner_agent_conversations` 承担 C2 加密边界、RLS 授权链、provider runtime 续接，不能被 LobeChat 的 UI session schema 替代。
- QRClaw 的 agent/host/run 是执行系统，LobeChat 的 session 更偏 LLM chat product。直接迁移会丢失 host binding、encrypted DEK、run event、provider workdir 等关键语义。
- 当前 `UNIQUE(owner_id, agent_id)` 是产品选择：一个 owner 对一个 agent 一个主私聊。LobeChat 的“多 session”能力可作为未来 UI 增强，不应倒逼后端契约。

### 2. 只迁 UI 能力

应从 LobeChat 引入：

- 会话列表 UI：分组、置顶、重命名、搜索入口。
- Conversation 主体：Markdown、代码块、表格、LaTeX、Mermaid、文件/图片、语音。
- Session service/store 的交互模式：`fetch grouped sessions`、`search sessions`、`pin/update group`。

不应迁入：

- LobeChat provider/model config 作为 QRClaw 后端 SSoT。
- LobeChat 原生 message/session 数据表替代 `owner_agent_*` 表。
- 未加密的 message persistence。

## 映射规则

| LobeChat 概念 | QRClaw 映射 | 说明 |
|---|---|---|
| `session.id` | 优先用 `owner_agent_conversations.id`；conversation 尚未创建时可临时用 `agent_id` | 发消息前应确保拿到 conversation id，避免 UI key 变动 |
| `session.meta.title` | `agents.name` | 会话标题就是 agent 名 |
| `session.meta.avatar` | `agents.avatar_url` | 直接复用 |
| `session.meta.description` | `agents.description` | 用于列表副标题 |
| `session.config.provider` | `agent_bindings.provider` | UI 展示只读，不作为可自由切换项 |
| `session.config.model` | `owner_agent_runs.requested_model/actual_model` 或 agent 默认配置 | conversation 不应持久化固定 model |
| `session.group` | 新增 UI metadata，或先本地持久化 | 不应塞进 conversation 核心表，除非确认是产品级多端需求 |
| `session.pinned` | 新增 UI metadata，或先本地持久化 | 同上 |
| `session.updatedAt` | `owner_agent_conversations.last_active_at` fallback `updated_at` | 用于排序 |
| `messages` | `owner_agent_messages` 经 Edge Function 解密后的 DTO | 保留 C2 |
| `topics` | 暂不映射 | QRClaw 尚无 topic/thread 产品语义 |
| `removeSession` | 不建议物理删除；先做 archive/status | 需要修 unique partial 后才能支持重新创建 |
| `duplicateSession` | 暂不支持，或创建“new conversation per agent”前先改 schema | 当前唯一约束不允许 |

## Fork LobeChat 后对接方式

建议新增 QRClaw adapter 层，而不是大改 LobeChat UI：

```text
LobeChat Session UI
→ qrclawSessionService.getGroupedSessions()
→ GET /api/owner/agents + GET/POST /api/owner/agents/:agentId/conversation
→ map OwnerAgentSummary + ConversationRecord to LobeSession-like DTO
```

消息流：

```text
LobeChat Conversation UI
→ qrclawChatService.sendMessage(sessionId/conversationId, content, files?)
→ POST /api/owner/agents/:agentId/messages
→ Gateway creates run + host WS
→ owner WS / history API returns encrypted-at-rest decrypted DTO
```

搜索：

- P0：搜索 agent title/description，本地过滤即可。
- P1：新增 owner-agent message search，需要设计 C2 兼容方案：客户端本地索引，或 Edge Function 内存态解密后搜索并返回最小结果。

分组/置顶：

- P0：保存在 fork UI 的本地 store。
- P1：新增 `owner_agent_conversation_ui_meta(owner_id, conversation_id, group_id, pinned, archived_at)`，避免污染执行语义。

## 改造量估计

| 项目 | 估计 | 备注 |
|---|---:|---|
| LobeChat Session list adapter | 2-3 天 | 映射 agent/conversation 到 session DTO，禁用 model/provider 自由切换 |
| Conversation UI 接 QRClaw Gateway | 3-5 天 | 发送、WS reply、history replay、错误态 |
| Markdown/file/voice 裁剪接入 | 4-7 天 | 文件上传需独立 QRClaw 加密/存储方案 |
| 分组/置顶 UI metadata | 1-3 天 | 本地版快；多端同步需新表/API |
| 搜索 | 1 天 P0 / 5-8 天 P1 | P1 受 C2 约束，需要安全设计 |
| archive/delete 语义 | 2-4 天 | 建议先改 partial unique，再做 archive API |

总评：**UI fork 对接约 2 周可出 P0；若做 C2 兼容全文搜索、文件加密、多端 UI meta，同步会到 3-4 周。**

## 最终建议

短期：QRClaw 保留 `owner_agent_conversations`，LobeChat Session 只作为 UI 适配对象。  
中期：补齐 conversation list/search/pagination/archive 这些产品能力，但以 QRClaw schema 扩展实现。  
长期：如果产品需要“同一 owner 对同一 agent 多个独立上下文”，再把唯一约束改为 `UNIQUE(owner_id, agent_id) WHERE status='active'` 或引入 `conversation_title/thread_purpose`，不要用 LobeChat session schema 直接替换。
