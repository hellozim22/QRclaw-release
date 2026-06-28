# Multica Agent Collaboration Notes

> 记录 Multica 研究中对“笔笔省智能体协作工具”和 QRClaw/OpenClaw 后续演进有参考价值的产品与架构想法。

## 背景

Multica 的核心启发是把本地已安装的 AI coding CLI 包装成可调度的 Agent Runtime。用户安装本地 daemon 后，系统可以自动发现本机有哪些可用 agent，并将这些能力注册到平台侧，供协作界面分配任务使用。

## 可借鉴机制：本地 Agent 自动识别

Multica 的识别方式是“固定 provider 清单 + PATH 探测 + 版本检查 + Runtime 注册”：

1. 本地 daemon 启动时维护一组已知 CLI 名称，例如 `claude`、`codex`、`cursor-agent`、`openclaw` 等。
2. 对每个 CLI 调用系统 PATH 探测，能找到二进制就认为该 agent 已安装。
3. 支持用环境变量覆盖路径和默认模型，例如 `MULTICA_OPENCLAW_PATH`、`MULTICA_OPENCLAW_MODEL`。
4. 注册 runtime 前调用 `--version` 做基本可用性与最低版本检查。
5. 将探测到的 provider、版本、设备名、daemon id 上报到服务端，成为 UI 可见的本地 runtime。

这个机制适合笔笔省智能体协作工具：如果用户选择本地安装，本地进程可以自动识别用户机器上的 Agent CLI，减少手动配置成本。

## 对 QRClaw 的适用边界

QRClaw 可以借鉴这一层能力，但应放在本地 Agent Host / Desktop / CLI 侧，而不是放在 Gateway 里。

推荐边界：

- Gateway 继续保持中立中继，不扫描用户机器，不执行 agent，不理解本地 CLI 细节。
- 本地 Agent Host 负责探测 `openclaw`、`claude`、`cursor-agent`、`codex` 等 CLI。
- 探测结果只作为“本地智能体能力”上报，必须经用户显式授权后才能绑定到 QRClaw 私有会话或未来公开入口。
- QRClaw 侧负责身份、授权、消息中继、历史回放与审计可见性。

## 产品决议：Agent 是主实体，QRCode 是未来分享入口

后续产品命名应从“创建 QRCode”改成“创建 Agent”：

- **Agent** 是用户创建、管理和聊天的主实体。
- **Chat** 是用户和 Agent 私聊的消息入口，类似微信/IM。
- **QRCode** 不再是本轮主入口，而是未来把某个 Agent 发布给访客访问的一种分享方式。

当前项目里已经存在 `agents` 表，`qrcodes` 也挂在 `agents.agent_id` 下。新的产品模型应顺势调整为：

```text
Agent
  ├─ 私有 Chat（本轮优先）
  └─ Public QR / Share Link（后续 Publish as QR）
```

短期不建议大规模重命名数据库表。可以先从 UI、路由和新功能文案上把 `Create QR Code` 改成 `Create Agent`，后续再把公开访客入口沉淀为 `Publish as QR`。

## 两个一级功能入口

本轮需要明确区分两个入口，避免把使用和管理混在一起：

### Chat（消息）

Chat 是日常使用入口，形态类似微信。

职责：

1. 展示 Owner 和各个 Agent 的私聊消息流。
2. 支持切换不同 Agent 会话。
3. 展示流式回复、工具调用、执行进度和最终回复。
4. 保留历史消息。

第一版 Chat 左侧按 Agent 组织，而不是按多个 thread / session 组织。也就是一个已创建 Agent 对应一个主对话流：

```text
Chat
  ├─ 产品助手
  ├─ 代码审查助手
  ├─ OpenClaw 助手
  └─ 客服 Agent
```

点击某个 Agent，右侧展示该 Agent 的唯一主会话。第一版不做同一 Agent 下多个话题 / 多个历史 thread。未来如果需要，再在单个 Agent 内部增加话题功能。

Chat 列表可以展示 Agent 副信息，例如：

```text
Claude Code
Zeze MacBook Pro · 在线 · Full Access
```

这里不做复杂管理，只负责“和谁聊、聊了什么、正在执行什么”。

### 智能体（Agents）

智能体是管理入口。

职责：

1. 查看已创建的 Agent。
2. 创建新的 Agent。
3. 查看 Agent 背后的底层能力：本地 / 云端、provider、在线状态、执行模式。
4. 进入对应 Agent 的 Chat。
5. 后续支持 `Publish as QR`。

这个页面只展示已经被用户定义好的 Agent 角色，不展示“未安装”“版本过低”“未连接”等底层探测噪音。底层能力发现只服务于创建 Agent 的选择过程；创建后，用户主要看到的是业务角色。

示例：

```text
智能体
  ├─ 客服 Agent
  │  └─ 底层：Claude Code · 本地在线
  ├─ 产品助手
  │  └─ 底层：OpenClaw · 云端 · 在线
  └─ 代码审查 Agent
     └─ 底层：Cursor Agent · 本地离线
```

UI 中不建议出现 `runtime` 这个词。可以用“底层能力”“运行位置”“本地/云端”“设备”等用户可理解的表达。代码和数据库内部可以继续使用 runtime 概念。

## 初步实现方向

本地 Agent 接入采用 QRClaw-native 轻量实现，借鉴 Multica 的探测模式，但不直接复制 Multica 源码，也不引入其 Issue / Task / Workspace / daemon polling 模型。

第一版本地探测层应同时覆盖用户本机常见 Agent CLI：

1. `openclaw`
2. `claude`
3. `cursor-agent`
4. `codex`

创建 Agent 时不自动生成多个平台资源，而是展示可用的底层 Agent 类型，例如 `OpenClaw`、`Claude Code`、`Cursor Agent`、`Codex`。用户手动选择一个本地或云端底层 Agent 作为该业务 Agent 的执行能力。后续是否生成 QR 公开分享，放到 `Publish as QR` 阶段。

探测结果应包含 provider、binary path、version、device name、capability flags。执行层通过 provider adapter 把不同 CLI 的输出统一成 QRClaw 的 private chat message / run event / stream chunk。

## 兼容性待讨论

- 不同 Agent CLI 的输出协议不一致：stream-json、普通 JSON、文本流、ACP 等需要 adapter 层。
- “模型”字段语义不一致：有些 provider 的 model 是真实 LLM，有些可能是 agent alias，需要记录 requested model 与 actual model。
- macOS / Linux / Windows 的 PATH、登录 shell、GUI app 环境变量加载方式不同，本地探测要有补偿策略。
- Desktop 启动的 daemon 可能拿不到用户 shell PATH，需要类似 `fix-path` 或显式路径配置。
- 版本检查需要 provider-specific 最低版本表，避免新旧 CLI 协议漂移导致任务失败。
- 安全边界必须比 Multica 更清晰：本轮只允许 Owner 私聊触发本地高权限 Agent，不允许公开访客直接触发本机执行。

## 方案决议：常驻本地 Host + 创建 Agent 时手动选择

本地接入不应是“创建 Agent 时临时探测并启动 agent”，而应是一个常驻在线 Host：

1. 用户启动 `qrclaw-agent-host`。
2. Host 自动探测本机 `openclaw`、`claude`、`cursor-agent`、`codex`。
3. Host 用 QRClaw agent/owner 凭证连接 Gateway，并保持 WebSocket 在线。
4. Host 注册本机能力：设备名、本地/云端类型、provider 列表、版本、执行模式、在线状态。
5. Dashboard 创建 Agent 时展示当前在线的本地能力和已接入的云端 worker。
6. 用户手动选择一个底层能力绑定到该 Agent。
7. 创建成功后，Owner 可以立刻在 Chat 里和该 Agent 私聊。

一个 Host 建议保持一条 WebSocket 连接，并在连接内声明多个 provider，而不是每个 provider 建一条连接：

```json
{
  "runtime_id": "rt_local_macbook",
  "runtime_type": "local",
  "device_name": "Zeze MacBook Pro",
  "providers": ["openclaw", "claude", "cursor", "codex"]
}
```

单个 Agent 的底层绑定关系：

```json
{
  "agent_id": "ag_xxx",
  "runtime_id": "rt_local_macbook",
  "provider": "claude"
}
```

如果 Host 在线，创建 Agent 后可以马上对话；如果 Host 离线，则 UI 应提示“Agent 当前离线”。本轮建议先禁用发送，后续再考虑离线排队和重连补跑。

## 执行模式决议

本地 Agent 的默认执行模式可以保留 Multica 类似的高权限体验，以保证 Owner 私聊中能自动完成任务：

- Claude Code 默认使用 `--permission-mode bypassPermissions`。
- Cursor Agent 默认使用 `--yolo`。
- OpenClaw 默认使用 `--local`。
- Codex 默认采用最接近自动执行的模式，但需单独核对其 sandbox / app-server 参数。

这属于本地 Host 的产品能力，但必须在创建 Agent / 绑定底层能力时明确展示：

> Full Access: this local agent may read/write files and run commands on this device.

创建时做一次显式确认即可，不需要每条访客消息都弹权限确认。

本轮高权限执行只面向 Owner 私聊；访客公开触发本地高权限 Agent 的能力后置。

## Owner 私有 Chat 方案

结合 Multica Chat 和 OpenClaw Chat，QRClaw 应新增 Owner 私有 Agent Chat，而不是用隐藏 QR 模拟私聊。

### 借鉴 Multica

Multica 的 `chat_session / chat_message / task_message` 模型值得借鉴：

1. Chat Session 是一等实体，不伪装成 Issue 或 QR。
2. 用户消息先落库。
3. Agent 执行过程单独记录为 timeline。
4. 执行完成后写入 assistant message。
5. 会话保存 resume 指针，例如 provider session id / work dir。
6. 前端用 pending run/task 状态驱动实时 UI。

QRClaw 不应照搬 Multica 的 `agent_task_queue` 和 daemon polling，因为 QRClaw 已经有 Gateway WebSocket 和 agent 连接模型。

### 借鉴 OpenClaw

OpenClaw 的 chat/channel 思路值得借鉴：

1. Session 是上下文边界。
2. Channel/Runtime 负责连接外部消息入口和 Agent Runtime。
3. 流式输出应保留为 chunk / end 事件。
4. 多账号、多连接要隔离，不能串消息。

QRClaw 现有 `plugins/openclaw` 已经具备多 account connection、`sendText`、`createStream`、history replay 等结构。Owner 私聊可以复用这些设计思想，但协议应改成 Owner private chat，而不是 visitor QR conversation。

### 建议数据模型

```text
owner_agent_conversations
- id
- owner_id
- agent_id
- provider_session_id
- provider_work_dir
- status: active | archived
- last_active_at
- created_at
- updated_at
```

第一版建议加唯一约束：每个 Owner 对每个 Agent 只有一个主会话。

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
- created_at
```

```text
owner_agent_runs
- id
- conversation_id
- agent_id
- runtime_id
- provider
- status: queued | running | completed | failed | cancelled
- requested_model
- actual_model
- provider_session_id
- provider_work_dir
- created_at
- completed_at
```

```text
owner_agent_run_events
- id
- run_id
- seq
- type: text | thinking | tool_use | tool_result | status | error
- content_encrypted
- metadata
- created_at
```

第一版建议新建私聊消息表，不直接改造现有 visitor `messages` 表。稳定后再评估是否统一。

### 私聊消息流

```text
Owner Web / Desktop
→ Gateway
→ 写 owner_agent_messages(sender=owner)
→ 创建 owner_agent_runs
→ Gateway 通过 WS 推给本地 Host 或云端 Worker
→ Host 调 provider adapter
→ stream events 回 Gateway
→ Gateway 写 owner_agent_run_events 并实时推给 Owner UI
→ 完成后写 owner_agent_messages(sender=agent)
```

## 待进一步讨论

1. **Host 授权方式**：本地 Host 首次接入是浏览器授权、Dashboard 复制 token，还是先复用现有 agent token。
2. **Agent 与底层能力绑定**：Agent 创建后是否允许切换底层 provider / 设备，以及切换后旧会话如何处理。
3. **并发策略**：同一个 Agent 是否串行执行；同一台 Host 的不同 provider 是否允许并发。
4. **离线策略**：本轮禁用发送，还是允许排队并在 Host 重连后自动执行。
5. **模型选择**：本轮是否暴露模型选择；OpenClaw 的 agent alias 与真实 LLM model 需要区分 `requested_model` 和 `actual_model`。
6. **消息加密读路径**：Owner 私聊消息是否复用 `decrypted-messages` Edge Function，还是新增私聊专用 read endpoint。
7. **现有 QR UI 迁移**：`Create QR Code` 如何改名/降级为 `Publish as QR`，以及旧 QR 入口如何保留。

## 当前产品决策（2026-04-27）

以下为对齐 Multica 创建 Agent / Chat 工作流后的本轮决策：

1. **Agent 创建流程采用标准版**：名称、头像、描述、底层 Agent、Instructions、Suggested Prompts、Full Access 确认。参考现有 `Create QR Code` 的配置能力，但产品语义改为 `Create Agent`。
2. **底层 Agent 选择顺序**：先选 Agent 类型（`OpenClaw` / `Claude Code` / `Cursor Agent` / `Codex`），再选本地 / 云端来源。UI 优先展示 provider，不突出设备名。
3. **本地 Host 授权本轮方案**：先用 Dashboard 复制 token 到终端的方式接入；后续再升级为浏览器登录授权设备。
4. **离线策略**：Agent 离线时允许发送，但只保存为草稿 / 待处理消息，不自动执行。UI 必须明确提示“Agent 离线，待上线后需手动处理或重新发送”，避免用户误以为已经运行。
5. **并发策略**：允许同一个 Agent 并发多条消息。实现层需要为每个 run 分配独立 `run_id`，并保证流式回复不会串线。
6. **上下文策略**：默认永远续聊，并提供“重置上下文”按钮。重置会清空 provider session 指针（例如 `provider_session_id` / `provider_work_dir`），但保留历史消息。
7. **现有 QRCode 功能**：左侧入口从 `My QRcode` 降级 / 改名为 `公开入口` 或 `分享`，作为未来 `Publish as QR` 的位置。不要破坏已有 QR 功能，但不再作为新主线。
8. **Provider 支持范围**：探测和执行第一版都同时支持 `OpenClaw`、`Claude Code`、`Cursor Agent`、`Codex`。执行层用 provider adapter 隔离差异，不能写成一坨分支。
9. **测试范围**：平台级测试和真实 CLI 专项测试都要做。
   - 平台级：happy path、离线、权限、多 Agent 切换、并发消息不串线。
   - Provider 专项：四个本地 CLI 的真实执行 / 流式输出 / 失败路径 / 版本不兼容路径。

仍未完全定案但需要在实施计划中展开：

- Dashboard token 的生成、撤销和本地保存策略。
- 并发执行时的资源限制和 UI 排队 / 取消能力。
- 待处理离线消息的生命周期：草稿、待处理、手动重发、删除。
- `decrypted-messages` 是否扩展支持 Owner 私聊消息读路径。

