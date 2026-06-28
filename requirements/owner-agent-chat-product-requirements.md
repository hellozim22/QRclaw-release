# QRClaw Owner Agent Chat 产品功能文档

> **版本**: V0.1  
> **日期**: 2026-04-27  
> **状态**: 产品方案草案  
> **修订记录**: 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 B1/B2/B4/B5/B6/B7/B9/B10/B12/M2/M3/M4/M9/M11，并补充 B13。  
> **来源**: Multica Chat / Agent 管理研究、OpenClaw Channel Plugin 现有接入能力、QRClaw M0-M4 已实现架构  
> **目标读者**: Product / Gateway / Web / Local Host / OpenClaw Plugin / QA

---

## 一、产品定位

### 1.1 一句话定义

Owner Agent Chat 是 QRClaw 面向 Agent Owner 的私有智能体工作台。用户可以创建和管理自己的 Agent，并在 `Chat` 入口里像微信一样与多个 Agent 私聊；Agent 可绑定本地或云端底层能力，例如 OpenClaw、Claude Code、Cursor Agent、Codex。

### 1.2 核心变化

本轮产品主线从“创建 QRCode”调整为“创建 Agent”：

```text
Agent 是主实体
Chat 是日常对话入口
QRCode 是未来将 Agent 发布给访客访问的分享入口
```

现有 QRCode 能力不删除，但从主心智中降级为后续 `Publish as QR` 能力。

### 1.3 产品价值

- **Owner 优先**：先做好用户自己和本地/云端 Agent 的私有沟通体验。
- **多 Agent 工作台**：统一管理 OpenClaw / Claude Code / Cursor Agent / Codex 等 Agent。
- **本地自动发现**：本地 Host 自动识别用户机器上已安装的 Agent CLI。
- **立即可聊**：创建 Agent 后，如果底层能力在线，Owner 可立刻进入 Chat 私聊。
- **安全收口**：本轮不开放访客直接触发本地高权限 Agent。

### 1.4 四条铁律约束

| 铁律 | 本功能中的体现 |
|------|----------------|
| C1 中立中继 | Gateway 不执行 AI 推理，不扫描本机，不解释消息语义；本地/云端 Host 是实际 Agent 执行端 |
| C2 加密存储 | Owner 私聊消息也必须密文落库；明文只存在于 Owner 客户端、Agent Host、授权解密读路径内存态 |
| C4 移动端零注册 | 本轮不新增访客能力；不影响现有 Visitor 零注册 |
| C5 消息可回放 | Owner 私聊历史需要支持断线、刷新、换设备后恢复 |

---

## 二、范围边界

### 2.1 本轮做什么

| 模块 | 功能 |
|------|------|
| Chat | 左侧一级入口，按 Agent 展示私聊列表，一个 Agent 一个主会话 |
| 智能体 | 左侧一级入口，展示已创建 Agent，支持创建、查看、进入 Chat |
| 创建 Agent | 标准版流程：名称、头像、描述、底层 Agent、Instructions、Suggested Prompts、Full Access 确认 |
| 本地 Host | 自动探测本机 OpenClaw / Claude Code / Cursor Agent / Codex |
| 云端 Agent | 继续支持已有云端 / OpenClaw worker 接入 |
| 私聊链路 | Owner 发消息，Agent 回复，支持实时/流式文本体验 |
| 离线策略 | Agent 离线时允许输入保存为草稿/待处理，不自动执行 |
| 并发策略 | 同一个 Agent 允许并发多条消息，必须保证 run 不串线 |
| 上下文 | 默认续聊，提供“重置上下文” |
| 测试 | 平台级测试 + 四个本地 CLI 的真实专项测试 |

### 2.2 本轮不做什么

| 不做项 | 原因 |
|--------|------|
| 访客公开触发本地 Agent | 安全边界复杂，后置到 Publish as QR |
| 多 Agent 群聊 | 第一版按 Agent 私聊组织 |
| 同一 Agent 多话题/thread | 第一版一个 Agent 一个主会话 |
| Run Timeline 展示工具细节 | QRClaw 当前聊天体验以简洁消息流为主，timeline 后置 |
| Skills / Env / Custom Args / MCP Config | 参考 Multica，但第一版不引入 |
| 大规模重命名数据库表 | 保持现有 `agents` / `qrcodes` 兼容 |

---

## 三、信息架构

### 3.1 左侧一级入口

本轮 Dashboard 左侧应形成三个主入口：

```text
Chat
智能体
公开入口 / 分享
Settings
```

说明：

- `Chat`：日常消息入口，类似微信。
- `智能体`：管理已创建 Agent 和创建新 Agent。
- `公开入口 / 分享`：由现有 `My QRcode` 降级/改名而来，后续承载 `Publish as QR`。
- `Settings`：账号、订阅、Agent token 等低频设置。

### 3.2 Chat

Chat 是 Owner 和 Agent 的私聊消息入口。

第一版左侧按 Agent 组织，而不是按多个 thread/session 组织：

```text
Chat
  ├─ 产品助手
  ├─ 代码审查助手
  ├─ OpenClaw 助手
  └─ 客服 Agent
```

点击某个 Agent，右侧展示该 Agent 的唯一主会话。

列表项展示：

- Agent 名称
- 最近一条消息摘要
- 底层 Agent 简短状态，例如 `Claude Code · 本地在线`
- 未读/待处理标记

### 3.3 智能体

智能体是管理入口，只展示已经被用户定义好的 Agent 角色，不展示未安装、版本过低、未连接等底层探测噪音。

列表项示例：

```text
产品助手
底层：Claude Code · 本地在线

代码审查助手
底层：Cursor Agent · 本地在线

客服 Agent
底层：OpenClaw · 云端在线
```

每个 Agent 支持：

- 进入 Chat
- 编辑基础信息
- 查看底层能力和在线状态
- 重置上下文
- 归档
- 后续 `Publish as QR`

---

## 四、核心概念

### 4.1 Agent

Agent 是 Owner 创建的业务角色，不等同于底层 CLI。

示例：

```text
产品助手
代码审查助手
客服 Agent
销售助手
```

Agent 绑定一个底层能力：

```text
Claude Code · 本地
OpenClaw · 云端
Cursor Agent · 本地
Codex · 本地
```

### 4.2 底层 Agent

底层 Agent 是实际执行能力：

- OpenClaw
- Claude Code
- Cursor Agent
- Codex

创建 Agent 时，先选择底层 Agent 类型，再选择本地/云端来源。

### 4.3 云端 Agent 来源

本轮“云端”来源不新造一套外部 agent 平台。云端 Agent 来源定义为 QRClaw 已有 OpenClaw plugin / cloud worker 通道在服务端注册出的能力：

- `local`：由 `qrclaw-agent-host` 在 Owner 本机探测和注册。
- `cloud`：由现有 OpenClaw plugin / cloud worker 使用既有 agent token 连接 Gateway 后，由 service role upsert 出云端能力记录。
- Host token 与既有 agent token 不互相替代：Host token 只用于本地 Host 注册；agent token 继续用于 OpenClaw plugin / cloud worker 认证。

未来 `Publish as QR` 不改变 Agent 的底层 binding，而是新建 `qrcodes` 指向同一个 `agent_id`。

### 4.4 本地 Host

`qrclaw-agent-host` 是运行在 Owner 本机的常驻进程：

1. 探测本机 Agent CLI。
2. 用 Dashboard token 连接 QRClaw。
3. 上报可用底层 Agent。
4. 接收 Owner 私聊消息。
5. 调用对应 provider adapter。
6. 将回复发回 Gateway。

### 4.5 公开入口 / QRCode

QRCode 不再是本轮主实体。后续某个 Agent 可以通过 `Publish as QR` 创建公开入口，让访客扫码访问。

本轮只保留现有 QR 功能，不新增访客触发本地 Agent 能力。

---

## 五、关键用户旅程

### 5.1 本地 Host 接入

```text
Owner 打开智能体页
→ 点击“连接本地 Agent”
→ Dashboard 生成接入 token
→ Owner 在终端运行 qrclaw-agent-host login --token xxx
→ Host 探测 OpenClaw / Claude / Cursor / Codex
→ Host 连接 Gateway 并上报能力
→ 创建 Agent 时可选择这些底层能力
```

### 5.2 创建 Agent

```text
Owner 打开智能体
→ 点击“创建 Agent”
→ 选择底层 Agent 类型：OpenClaw / Claude Code / Cursor Agent / Codex
→ 选择来源：本地 / 云端
→ 填写名称、头像、描述
→ 填写 Instructions 和 Suggested Prompts
→ 确认 Full Access
→ 创建成功
→ 可立即进入 Chat
```

### 5.3 与 Agent 私聊

```text
Owner 打开 Chat
→ 左侧选择 Agent
→ 输入消息
→ Gateway 写入 Owner 消息
→ Gateway 将消息转发给本地 Host 或云端 Worker
→ Agent 执行并回复
→ Chat 中显示回复
```

### 5.4 离线待处理

```text
Owner 打开 Chat
→ Agent 离线
→ 输入消息
→ 系统保存为待处理，不自动执行
→ UI 提示“Agent 离线，待上线后需手动处理或重新发送”
```

### 5.5 重置上下文

```text
Owner 在 Chat 或智能体详情点击“重置上下文”
→ 清空 provider_session_id / provider_work_dir
→ 保留历史消息
→ 后续消息以新上下文执行
```

---

## 六、功能需求

### 6.1 智能体列表

必须支持：

- 列出当前 Owner 创建的 Agent。
- 显示 Agent 名称、头像、描述、底层 Agent 类型、来源状态。
- 支持进入 Chat。
- 支持归档。

不展示：

- 未安装的底层 Agent。
- 版本过低的底层 Agent。
- 未连接的底层 Agent 噪音。

### 6.2 创建 Agent

字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| name | 是 | Agent 业务名称 |
| avatar | 否 | Agent 头像 |
| description | 否 | 一句话说明 |
| backend_provider | 是 | OpenClaw / Claude Code / Cursor Agent / Codex |
| backend_source | 是 | local / cloud |
| instructions | 否 | 行为设定 |
| suggested_prompts | 否 | 常用问题 |
| execution_mode_ack | 是 | Full Access 确认 |

### 6.3 Chat 列表

必须支持：

- 按 Agent 展示会话列表。
- 一个 Agent 一个主会话。
- 显示最近消息摘要。
- 显示待处理/执行中状态。
- 点击切换右侧消息流。

### 6.4 Chat 消息流

第一版采用简单聊天模式：

- 展示 Owner 消息。
- 展示 Agent 最终回复。
- 支持流式文本更新。
- 执行中展示简单状态：`正在回复...`。
- 失败时展示错误提示。

不展示：

- tool_use
- tool_result
- thinking
- run timeline

底层可以记录 run 信息，但 UI 不展开。

### 6.5 本地 Host 探测

必须支持：

- OpenClaw
- Claude Code
- Cursor Agent
- Codex

探测逻辑参考 Multica：

```text
固定 provider 清单
→ PATH 探测
→ --version
→ 最低版本检查
→ 上报可用能力
```

环境变量覆盖建议：

```text
QRCLAW_OPENCLAW_PATH
QRCLAW_CLAUDE_PATH
QRCLAW_CURSOR_PATH
QRCLAW_CODEX_PATH
```

### 6.6 Provider Adapter

第一版四个 provider 都要支持执行：

| Provider | 执行模式 | 备注 |
|----------|----------|------|
| OpenClaw | `--local` | 需处理 agent alias / actual model |
| Claude Code | `--permission-mode bypassPermissions` | stream-json |
| Cursor Agent | `--yolo` | stream-json 类协议 |
| Codex | 待核对自动执行参数 | app-server / JSON-RPC 复杂度较高 |

必须通过 adapter 层隔离差异，不能把 provider 分支散落在业务代码中。

### 6.7 并发

同一个 Agent 在产品层允许连续发送多条消息，但执行层必须避免上下文串线。

要求：

- 每条 Owner 消息生成独立 run。
- 每个 run 有唯一 `run_id`。
- 流式回复必须按 `run_id` 归属，不能串线。
- UI 要能同时处理多个执行中或待执行的回复。
- 如果 provider adapter 能为每个 run 分配独立 `provider_session_id` / `provider_work_dir`，则允许真正并发执行。
- 如果 provider 只能安全复用单一 session/workdir，则该 Agent 内部应串行排队执行，UI 显示排队状态。
- 后续需要支持取消单个 run。

### 6.8 上下文

默认永远续聊。

要求：

- 保存 provider session 指针，例如 `provider_session_id`。
- 保存 provider work dir 指针，例如 `provider_work_dir`。
- 并发 run 不能共享会被写入的临时上下文目录，除非 provider 明确支持并发会话隔离。
- 支持重置上下文。
- 重置上下文不删除历史消息。

---

## 七、数据模型建议

> 本节为产品功能视角，具体 SQL 由技术方案确认。

### 7.1 Agent 扩展

现有 `agents` 表继续作为主实体。建议补充或关联：

- description
- avatar/profile
- instructions
- suggested_prompts
- backend_provider
- backend_source
- execution_mode
- status

### 7.2 本地/云端能力

内部可继续使用 runtime 概念，但 UI 不展示 runtime 一词。

建议实体：

```text
agent_runtimes
- id
- owner_id
- source: local | cloud
- device_name
- status
- last_seen_at
```

```text
agent_runtime_providers
- id
- runtime_id
- provider
- version
- status
- capabilities
```

### 7.3 Owner 私聊

```text
owner_agent_conversations
- id
- owner_id
- agent_id
- provider_session_id
- provider_work_dir
- status
- last_active_at
```

约束：

```text
unique(owner_id, agent_id)
```

```text
owner_agent_messages
- id
- conversation_id
- sender_type: owner | agent | system
- content_encrypted
- content_type
- run_id
- status: sent | pending | failed
- created_at
```

```text
owner_agent_runs
- id
- conversation_id
- agent_id
- runtime_id
- provider
- status
- requested_model
- actual_model
- provider_session_id
- provider_work_dir
- error
- created_at
- completed_at
```

```text
owner_agent_run_events
- id
- run_id
- seq
- type: text | status | error | tool_use | tool_result | thinking
- content_encrypted
- metadata
- created_at
```

第一版 UI 不展示 tool / thinking / timeline 细节，但底层保留事件模型，便于流式回复、失败排查和后续执行过程展开。

---

## 八、状态规则

### 8.1 Agent 状态

| 状态 | 说明 |
|------|------|
| active | 可用 |
| archived | 已归档，不出现在默认列表 |
| suspended | 保留给安全/计费限制 |

### 8.2 底层能力状态

UI 只对已创建 Agent 展示最小状态：

| 状态 | 文案 |
|------|------|
| online | 本地在线 / 云端在线 |
| offline | 本地离线 / 云端离线 |

版本过低、未安装等只在创建流程或 Host 诊断中处理，不在智能体列表展示。

### 8.3 消息状态

| 状态 | 说明 |
|------|------|
| sent | 已发送并进入执行 |
| pending | Agent 离线，仅保存待处理 |
| queued | 已创建 run，等待 Host 接收 |
| running | Host 已接收并正在执行 |
| failed | 执行失败 |
| expired | 待处理消息超过保留期，已过期 |
| replaced | 用户手动重发后，旧 pending 消息被替代 |

### 8.4 待处理消息生命周期

Agent 离线时，Owner 可以发送消息，但系统不自动执行。生命周期规则：

- 单个 conversation 最多保留 50 条 pending 消息；超过后拒绝继续发送并提示用户先处理待处理消息。
- pending 消息 7 天未处理后变为 `expired`；密文正文可被清理，只保留最小审计元数据。
- Host 重新上线后不自动补跑 pending 消息，避免用户误以为离线期间的任务已经执行。
- 用户点击“重新发送”时创建新的 run；原 pending 消息标记为 `replaced`。
- 执行中的 run 30 分钟无 Host event 自动标记为 `failed(timeout)`。

---

## 九、测试要求

### 9.1 平台级测试

必须覆盖：

- 创建 Agent。
- 选择 OpenClaw / Claude / Cursor / Codex。
- 进入 Chat。
- 发送消息并收到回复。
- Agent 离线时消息保存为待处理，不自动执行。
- 多 Agent 切换不串消息。
- 同一个 Agent 并发多条消息不串 run。
- 重置上下文后新消息不复用旧 provider session。
- Owner 只能访问自己的 Agent 和私聊消息。
- QR/Visitor 消息不会出现在 Owner 私聊里。
- Full Access 确认未完成时不能创建本地高权限 Agent。
- Dashboard token 撤销后，本地 Host 不能继续连接。
- run events 写入后不包含明文 content。

### 9.2 Provider 专项测试

必须覆盖四个本地 CLI：

- CLI 探测成功。
- `--version` 解析成功。
- 最低版本检查。
- 一次真实执行。
- 流式输出或最终输出解析。
- 执行失败路径。
- CLI 不存在 / 权限不足 / 版本不兼容。

### 9.3 E2E 用户旅程

关键路径：

```text
启动本地 Host
→ Dashboard 显示可创建 Agent 的底层能力
→ 创建 Claude Code Agent
→ 打开 Chat
→ 发送消息
→ 本地 Host 执行
→ Chat 显示回复
```

---

## 十、本地 Host 技术决策

### 10.1 ADR-001：Local Agent Host 使用 Go 实现

本地 `qrclaw-agent-host` 本轮使用 Go 实现，不使用 Rust。

决策原因：

- Multica 已验证 Go 适合做本地 daemon：PATH 探测、版本检查、子进程管理、WebSocket、跨平台单二进制分发。
- 本地 Host 的核心是稳定调用外部 CLI 并转发流式事件，不是高性能计算或复杂内存管理。
- QRClaw 当前主工程是 TypeScript / Deno / Node，引入 Rust 会增加 toolchain、CI、交叉编译、签名发布和维护成本。
- Go 二进制对普通用户安装更简单，适合作为第一版 `qrclaw-agent-host`。
- 不直接复制 Multica 源码，只借鉴 daemon / provider adapter 设计并重新实现，规避 license 风险。

Rust 暂不作为本轮选择，但保留为后续桌面端或强 sandbox 场景的候选。

### 10.2 本地 Host 边界

`qrclaw-agent-host` 是独立 runtime surface，不放进 Gateway：

```text
web/                 Next.js Dashboard / Chat UI
gateway/             Node.js WebSocket 中立中继
supabase/functions/  解密读路径与后台函数
qrclaw-agent-host/   Go 本地常驻进程
```

Host 只做三件事：

1. 探测本机已安装 Agent CLI。
2. 通过 QRClaw 协议接收 Owner 私聊 run。
3. 调用 provider adapter 并把事件回传 Gateway。

Host 不做：

- 平台级用户鉴权决策。
- 消息持久化。
- 消息历史解密。
- Visitor 公开访问授权。

### 10.3 Provider 支持分阶段

探测层第一版同时覆盖四个 provider：

- OpenClaw
- Claude Code
- Cursor Agent
- Codex

执行层建议按风险分阶段验收：

| 阶段 | Provider | 原因 |
|------|----------|------|
| P0 | OpenClaw | QRClaw 已有插件经验，协议认知成本最低 |
| P1 | Claude Code | Multica 有成熟参考，stream-json 路径清晰 |
| P2 | Cursor Agent | 与 Claude 类似但参数/输出需单独验收 |
| P3 | Codex | app-server / JSON-RPC / sandbox 细节更复杂 |

产品文档保留“四个都支持”的目标，但实施计划应允许按 P0-P3 逐步打通。

---

## 十一、安全与协议补充

### 11.1 Full Access 安全模型

本地 Agent 默认高权限执行，只允许 Owner 私聊触发。

必须补齐以下安全边界：

- 创建本地高权限 Agent 时必须展示 Full Access 确认。
- Full Access 文案必须说明：该 Agent 可能读取/写入本机文件并执行命令。
- Host token 必须可撤销。
- Host token 应有过期时间或轮换机制。
- Dashboard 必须展示已连接 Host，并允许解绑设备。
- Host 本地保存 token 时应使用系统安全存储；本轮如使用文件，必须要求最小权限。
- Host 日志禁止记录消息明文、token、KEK、DEK、完整环境变量。
- 后续建议增加 workspace allowlist，限制本地 Agent 默认可操作目录。

### 11.2 Dashboard Token 本轮方案

本轮采用 Dashboard 复制 token 到终端的方式：

```text
Dashboard 生成一次性 Host token
→ Owner 在终端执行 qrclaw-agent-host login --token xxx
→ Host 换取长期连接凭证或保存 scoped token
→ Host 通过 WS 连接 Gateway
```

Token 最小权限：

- 只能注册当前 Owner 的本地 Host。
- 只能接收绑定到该 Owner Agent 的 private run。
- 不能读取 Visitor 消息。
- 不能创建公开 QR。
- 撤销后连接必须失效。

### 11.3 WebSocket 协议方向

Owner 私聊和 Host 接入应通过 `shared/contracts/ws` 增加语言无关 JSON frame。

建议 frame 类别：

```text
host_register
host_heartbeat
host_capabilities_updated
owner_agent_run_request
owner_agent_run_accepted
owner_agent_run_event
owner_agent_run_completed
owner_agent_run_failed
owner_agent_run_cancel
owner_agent_run_resume
owner_agent_run_replay
owner_agent_session_reset
```

协议要求：

- 所有 frame 必须携带 `run_id` 或可追溯的 correlation id。
- Gateway outbound frame 必须经过 `sendFrame()` 校验。
- 新增 WS 类型必须从 `shared/contracts/ws/types.ts` 起步。
- Supabase mirror 只能由 `scripts/sync-contracts.mjs` 生成。
- 任何日志只能记录 frame type、run id、connection id、状态，不记录消息正文。

### 11.4 HTTP API 方向

建议新增 Owner 私聊 HTTP API：

```text
GET  /api/owner/agents
POST /api/owner/agents
GET  /api/owner/agents/:agentId/conversation
POST /api/owner/agents/:agentId/messages
POST /api/owner/agent-runs/:runId/cancel
POST /api/owner/host-tokens
DELETE /api/owner/host-tokens/:tokenId
```

HTTP contract 应进入 `shared/contracts/http/`，Gateway 路由使用 Zod 校验，Web 侧只消费类型。

### 11.5 加密读路径

Owner 私聊消息和 run events 都必须加密存储。

建议优先扩展现有 `decrypted-messages` Edge Function：

- 增加 actor: `owner-private-agent-chat`。
- 支持按 `conversation_id` 拉取 Owner 私聊消息。
- 可选支持按 `run_id` 拉取 run events。
- 保持 Gateway 写路径加密、Edge Function 读路径解密的现有 C2 模型。

如果后续发现 `decrypted-messages` 逻辑过重，再拆出专用 Edge Function，但不要把读路径解密放回 Gateway。

---

## 十二、Supabase 数据库开发方案

### 12.1 当前数据库状态

当前云端 Supabase 已连接，项目为 `zyxqadubhwrnsoujiyir`。现有 `public` schema 已有以下核心表：

```text
owners
agents
qrcodes
sessions
conversations
conversation_participants
messages
message_deliveries
encryption_keys
usage_logs
subscribers
visitor_sessions
```

现有表均已开启 RLS。当前还没有 Owner 私聊和本地 Host 所需的新表，因此本功能需要数据库开发。

### 12.2 数据库开发原则

本功能的数据库开发必须遵守：

- 所有新增 `public` 表必须启用 RLS。
- 所有 Owner 可访问数据必须通过 `owner_id` 或可追溯关系限定归属。
- 消息正文、run event 正文必须加密存储。
- Gateway 负责写路径加密；读路径继续走 `decrypted-messages` Edge Function。
- 不把本地 Host token、DEK、明文消息写入日志。
- Migration 一旦部署不可修改，后续修正使用新的 forward migration。
- `supabase/types/database.types.ts` 必须在 schema 变更后重新生成。

### 12.3 新增表分组

本轮建议新增四组表，并扩展现有 `agents` 表：

| 分组 | 表 | 用途 |
|------|----|------|
| Host 接入 | `agent_hosts` / `agent_host_tokens` / `agent_host_providers` | 管理本地/云端 Host、token、provider 能力 |
| Agent 绑定 | `agent_bindings` | 记录业务 Agent 绑定哪个 Host/provider |
| Owner 私聊 | `owner_agent_conversations` / `owner_agent_messages` / `owner_agent_runs` / `owner_agent_run_events` | 私聊会话、消息、执行 run、流式事件 |
| 加密密钥 | `owner_agent_conversation_keys` | Owner 私聊专用 DEK 包装存储 |

`agents` 表需要补充：

```text
agents
- description text
- avatar_url text
- instructions text, length <= 8000
- suggested_prompts jsonb, default [], max 10 items
- execution_mode: standard | full_access
- status 增加 archived
```

### 12.4 Host 接入表

```text
agent_hosts
- id uuid primary key
- owner_id uuid not null references owners(id)
- host_type text not null check in ('local', 'cloud')
- display_name text
- device_fingerprint text
- status text not null default 'offline'
- last_seen_at timestamptz
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

说明：

- `display_name` 可存设备昵称，但 UI 默认不以设备为主心智展示。
- `device_fingerprint` 用于识别同一台机器重复接入，不应包含隐私敏感原文。
- `status` 只用于在线/离线等最小状态。

```text
agent_host_tokens
- id uuid primary key
- owner_id uuid not null references owners(id)
- host_id uuid references agent_hosts(id)
- token_hash text not null unique
- label text
- scope jsonb not null default '{}'
- expires_at timestamptz
- revoked_at timestamptz
- last_used_at timestamptz
- created_at timestamptz not null default now()
```

说明：

- 只存 token hash，不存 token 原文。
- Dashboard 只在生成时展示一次 token 原文。
- `scope` 用于限制 local host、provider、private chat 等能力。
- `scope` 必须符合固定结构：`owner_id`、`allowed_provider_set`、`can_register_local`、`can_receive_private_runs`。

```text
agent_host_providers
- id uuid primary key
- host_id uuid not null references agent_hosts(id)
- provider text not null check in ('openclaw', 'claude', 'cursor', 'codex')
- binary_path text
- version text
- status text not null default 'available'
- capabilities jsonb not null default '{}'
- health_check_passed_at timestamptz
- last_checked_at timestamptz
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

说明：

- `binary_path` 本轮不存本机绝对路径；如需展示诊断信息，Host 上报 opaque path id 或脱敏后的 basename。
- 版本过低、不可用等状态只出现在 Host 诊断或创建流程，不出现在智能体主列表。
- Provider 只有通过低权限 health check 后，才进入创建 Agent 的可选列表。

### 12.5 Agent 绑定表

```text
agent_bindings
- id uuid primary key
- agent_id uuid not null references agents(id)
- owner_id uuid not null references owners(id)
- binding_kind: local_host | cloud_plugin
- host_id uuid references agent_hosts(id)
- preferred_host_id uuid references agent_hosts(id)
- provider text not null
- execution_mode text not null default 'full_access'
- status text not null default 'active'
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

约束：

```text
unique(agent_id)
```

第一版一个业务 Agent 只保留一个 active binding。`unique(agent_id)` 不阻塞未来 `Publish as QR`，因为公开入口通过新增 `qrcodes` 指向同一 `agent_id` 实现；如果未来允许同一 Agent 在多个底层能力间热切换，再扩展为 active binding 选择模型。

### 12.6 Owner 私聊表

```text
owner_agent_conversations
- id uuid primary key
- owner_id uuid not null references owners(id) on delete cascade
- agent_id uuid not null references agents(id) on delete cascade
- provider_session_id text
- provider_work_dir text
- status text not null default 'active'
- last_active_at timestamptz
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
```

约束：

```text
unique(owner_id, agent_id)
```

```text
owner_agent_messages
- id uuid primary key
- conversation_id uuid not null references owner_agent_conversations(id) on delete cascade
- owner_id uuid not null references owners(id) on delete cascade
- agent_id uuid not null references agents(id) on delete cascade
- run_id uuid
- sender_type text not null check in ('owner', 'agent', 'system')
- content_encrypted text not null
- content_type text not null default 'text'
- encryption_meta jsonb not null
- status text not null default 'sent'
- created_at timestamptz not null default now()
```

```text
owner_agent_runs
- id uuid primary key
- conversation_id uuid not null references owner_agent_conversations(id) on delete cascade
- owner_id uuid not null references owners(id) on delete cascade
- agent_id uuid not null references agents(id) on delete cascade
- host_id uuid references agent_hosts(id)
- provider text not null
- status text not null default 'queued'
- requested_model text
- actual_model text
- provider_session_id text
- provider_work_dir text
- error_code text
- error_message text
- created_at timestamptz not null default now()
- started_at timestamptz
- completed_at timestamptz
```

```text
owner_agent_run_events
- id uuid primary key
- run_id uuid not null references owner_agent_runs(id) on delete cascade
- owner_id uuid not null references owners(id) on delete cascade
- seq integer not null
- type text not null
- content_encrypted text
- encryption_meta jsonb
- metadata jsonb not null default '{}'
- created_at timestamptz not null default now()
```

约束：

```text
unique(run_id, seq)
```

```text
owner_agent_conversation_keys
- key_id uuid primary key
- conversation_id uuid not null references owner_agent_conversations(id) on delete cascade
- key_data_encrypted bytea not null
- kek_version integer not null default 1
- algorithm text not null default 'aes-256-gcm'
- status text not null default 'active'
- created_at timestamptz not null default now()
- rotated_at timestamptz
```

约束：

```text
unique active key per conversation
```

`provider_work_dir` 本轮只允许存 Host 侧 opaque id，不存 `/Users/...` 这类本机绝对路径。

### 12.7 推荐索引

建议索引：

```text
agent_hosts(owner_id, status)
agent_host_tokens(owner_id, revoked_at, expires_at)
agent_host_providers(host_id, provider)
agent_bindings(agent_id)
agent_bindings(owner_id, status)
owner_agent_conversations(owner_id, last_active_at desc)
owner_agent_messages(conversation_id, created_at)
owner_agent_runs(conversation_id, created_at desc)
owner_agent_runs(owner_id, status, created_at)
owner_agent_run_events(run_id, seq)
owner_agent_conversation_keys(conversation_id, status)
```

大表上线后新增索引应使用 `CREATE INDEX CONCURRENTLY`，避免阻塞写入。

### 12.8 RLS 策略

RLS 目标：

- Owner 只能读写自己的 Agent、Host、私聊会话、消息和 run。
- Host 不能通过 Supabase 直接读写私聊数据，Host 只通过 Gateway WS 交互。
- Service role / Gateway 写路径可写加密消息和 run events。
- Edge Function `decrypted-messages` 使用 service role 读取密文并在内存态解密。

建议策略：

```text
agent_hosts
- owner SELECT: owner_id = current owner
- owner UPDATE: 仅允许改 display_name / 解绑类字段
- INSERT/DELETE: 由 service role 或受控 RPC/API 完成

agent_host_tokens
- owner SELECT: 可看 token 元数据，不可看 token 原文
- owner INSERT: 通过 Gateway/Edge Function 创建
- owner UPDATE: 只能撤销 revoked_at

agent_host_providers
- owner SELECT: 通过 host.owner_id 限定
- owner 不能直接 INSERT/UPDATE，由 Host 经 Gateway 上报

agent_bindings
- owner SELECT: owner_id = current owner
- owner INSERT/UPDATE: 通过 Gateway/Edge Function 校验 provider 可用后写入

owner_agent_conversations
- owner SELECT: owner_id = current owner
- owner INSERT: owner_id = current owner
- owner UPDATE: 仅允许自己的会话

owner_agent_messages / runs / run_events
- owner SELECT: owner_id = current owner
- owner INSERT: Owner 消息可通过 Gateway/API 写入
- agent/run events 写入只能由 service role 路径完成
```

具体 SQL 里应使用 `(select auth.uid())` 优化 RLS 表达式，并避免 `user_metadata` 参与授权。

### 12.9 Migration 工作流

建议 DB 开发顺序：

```text
1. 用 Supabase MCP execute_sql 在开发分支/本地验证草案 SQL
2. 创建 migration 文件
3. 写 schema + RLS + indexes
4. 运行 migration
5. 运行 advisors
6. 重新生成 TypeScript types
7. 更新 Gateway/Web 类型引用
8. 补 DB/RLS 测试
```

命令参考：

```bash
supabase migration new owner_agent_chat_schema
supabase migration list
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
```

当前机器已安装 `supabase` CLI，可直接使用 `supabase --version` 验证。

### 12.10 Edge Function 开发

`decrypted-messages` 本轮继续作为统一解密读路径，不拆新函数。需要扩展：

- 支持 Owner 私聊 actor：`owner-private-agent-chat`。
- 支持 `owner_agent_conversation_id` 查询。
- 支持 `run_id` 查询 text run events，用于刷新页面时恢复进行中的流式回复。
- 输出结构区分 message 和 run event。
- 授权链使用 `owner_agent_conversations.owner_id -> owners.id -> owners.user_id == auth.uid()`。
- 使用 `owner_agent_conversation_keys` 解包 DEK。
- 保持不记录明文日志。

如未来函数复杂度过高，再拆 `decrypted-owner-agent-messages`，但本轮不把“拆分”作为待定项。

### 12.11 数据库验收标准

DB 层完成标准：

- 新表全部启用 RLS。
- Owner A 不能读取 Owner B 的 host、agent binding、conversation、message、run。
- Host token 原文不落库。
- 消息和 run event 正文没有明文字段。
- `decrypted-messages` 能读回 Owner 私聊历史。
- Gateway 使用 service role 能写入 encrypted message / run event。
- `supabase/types/database.types.ts` 已更新。
- Supabase advisors 无新的 critical / security finding。

---

## 十三、开放问题

1. Dashboard token 的 refresh / rotation 细节。
2. `QRCLAW_HOST_TOKEN_PEPPER` 的本地、CI、生产 secret 同步清单。
3. 并发执行的资源上限与取消能力。
4. 离线待处理消息的重发、删除和过期策略。
5. `actual_model` 如何在四个 provider 中统一采集。
6. 现有 `My QRcode` 入口最终命名为 `公开入口` 还是 `分享`。
7. `Publish as QR` 的权限提示和访客安全策略。
8. 本地 Host token 是否需要一次性 token + refresh token 双层模型。
9. Codex 如因上游协议限制无法按期完整执行，是否允许由 Owner 单独签署延期决策。

---

## 十四、里程碑建议

### M1：产品入口调整

- 左侧 `Messages` 改为 `Chat`。
- 新增/提升 `智能体` 一级入口。
- `My QRcode` 降级为 `公开入口` / `分享`。

### M2：Supabase 数据模型

- 新增 Host / binding / Owner 私聊表。
- 增加 RLS policy 和索引。
- 扩展 `decrypted-messages` 读路径。
- 重新生成 `supabase/types/database.types.ts`。

### M3：Owner 私聊模型

- 新增 Owner 私聊数据模型。
- 新增 Chat 列表和消息流。
- 一个 Agent 一个主会话。

### M4：本地 Host 完整接入

- 新建 Go `qrclaw-agent-host` 工程。
- Dashboard token 接入。
- 探测 OpenClaw / Claude / Cursor / Codex。
- 上报底层能力。

### M5：Provider Adapter

- 四个 provider 执行链路。
- 流式文本 / 最终回复回传。
- 并发 run 隔离。

### M6：测试与稳定

- 平台 E2E。
- Provider 真实 CLI 专项测试。
- 离线、并发、权限、上下文重置验证。

### M7：Publish as QR（后续）

- 将某个私有 Agent 发布为公开 QR。
- 访客安全策略。
- 公开入口管理。

