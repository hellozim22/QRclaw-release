# QRClaw Owner Agent Chat 技术方案

> **版本**: V0.1  
> **日期**: 2026-04-27  
> **状态**: 技术方案草案  
> **修订记录**: 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 B1/B2/B3/B4/B5/B6/B7/B8/B9/B10/B11/B12/M1/M2/M3/M4/M5/M8，并补充 B13。  
> **配套产品文档**: `requirements/owner-agent-chat-product-requirements.md`  
> **配套设计文档**: `design/owner-agent-chat-design-spec.md`  
> **配套测试文档**: `requirements/owner-agent-chat-test-plan.md`  
> **目标读者**: Gateway / Web / Supabase / Local Host / OpenClaw Plugin / QA

---

## 一、目标与边界

Owner Agent Chat 在 QRClaw 现有 Gateway + Supabase + Web 架构上新增 Owner 私有智能体聊天能力。Owner 可以创建 Agent，绑定本地或云端底层 Agent 能力，并在 `Chat` 入口与 Agent 私聊。

本方案必须保持四条铁律：

| 铁律 | 技术落点 |
|------|----------|
| C1 中立中继 | Gateway 不执行 AI 推理，不扫描本机，只加密、持久化、路由 frame |
| C2 加密存储 | Owner 私聊 message / run event 全部密文落库，读路径由 Edge Function 解密 |
| C4 移动端零注册 | 不改 Visitor 现有匿名扫码链路 |
| C5 消息可回放 | Owner 私聊支持刷新、断线、换设备后恢复 |

---

## 二、系统拓扑

```text
Web Dashboard / Chat
  ├─ HTTP: Owner Agent CRUD / Host Token / Message Send
  └─ WSS: Chat realtime events

Gateway (Node.js + Express + ws)
  ├─ Auth: Supabase getUser / WS ticket
  ├─ Encrypt write path
  ├─ Persist owner private messages / runs / events
  ├─ Route owner_agent_run_request to Host / Cloud Worker
  └─ Fanout realtime frames to Owner UI

Supabase
  ├─ Postgres + RLS
  ├─ decrypted-messages Edge Function
  └─ generated types

qrclaw-agent-host (Go)
  ├─ Detect local CLIs
  ├─ Register capabilities
  ├─ Execute provider adapter
  └─ Stream run events back to Gateway
```

---

## 三、Runtime Surface

| Surface | 语言/运行时 | 职责 |
|---------|-------------|------|
| `web/` | Next.js 16 + React | Dashboard、Chat、智能体管理、Host token 接入 |
| `gateway/` | Node 20 + Express 5 + ws | HTTP API、WS 中继、加密写入、路由 |
| `supabase/` | Postgres + Deno Edge | RLS、密文存储、解密读路径 |
| `qrclaw-agent-host/` | Go | 本地 Host、CLI 探测、provider adapter |
| `shared/contracts/` | TypeScript + Zod | HTTP / WS SSoT |

新增 `qrclaw-agent-host/` 为独立工程，不能把本地探测逻辑放入 Gateway。

---

## 四、数据库方案

### 4.1 新增表

新增表以产品文档 §12 为准：

```text
agent_hosts
agent_host_tokens
agent_host_providers
agent_bindings
owner_agent_conversations
owner_agent_messages
owner_agent_runs
owner_agent_run_events
owner_agent_conversation_keys
```

同时扩展现有 `agents` 表：`description`、`avatar_url`、`instructions`、`suggested_prompts`、`execution_mode`，并让 `status` 支持 `archived`。

### 4.2 关键约束

```text
agent_bindings: unique(agent_id)
owner_agent_conversations: unique(owner_id, agent_id)
owner_agent_run_events: unique(run_id, seq)
owner_agent_conversation_keys: unique active key per conversation
```

### 4.3 RLS 原则

- 所有新增表启用 RLS。
- Owner 只能访问 `owner_id = auth.uid()` 对应资源，具体以现有 `owners` 映射关系实现。
- Host 不直接通过 Supabase 访问私聊数据，只通过 Gateway WS。
- Gateway / Edge Function 使用 service role 写入或读取密文。
- token 原文不落库，只存 `token_hash`。

### 4.4 Migration 顺序

1. 新增 Host / binding 表。
2. 新增 Owner 私聊表。
3. 新增 RLS policy。
4. 新增索引。
5. 扩展 `decrypted-messages`。
6. 生成 `supabase/types/database.types.ts`。

### 4.5 Owner 私聊加密链路

Owner 私聊不复用现有 `encryption_keys` 表。现有 `encryption_keys.conversation_id` 外键绑定 `conversations(id)`，而 Owner 私聊使用 `owner_agent_conversations`。本轮新增：

```text
owner_agent_conversation_keys
- key_id
- conversation_id -> owner_agent_conversations(id)
- key_data_encrypted
- kek_version
- algorithm
- status
```

写路径：

```text
Gateway 收到 Owner message
→ 查 owner_agent_conversation_keys active key
→ 如不存在，生成 DEK，并用 QRCLAW_KEK_V1 包装
→ 写 owner_agent_conversation_keys
→ 加密 message / run event
→ 写 owner_agent_messages / owner_agent_run_events
```

读路径：

```text
decrypted-messages actor=owner-private-agent-chat
→ 校验 owner_agent_conversations.owner_id 属于当前 owner
→ 读取 owner_agent_conversation_keys active key
→ Edge Function 内存态解包 DEK
→ 解密 owner_agent_messages / owner_agent_run_events
```

删除路径：

```text
delete_owner_agent_conversation_with_keys(conversation_id)
→ 删除 run_events / runs / messages / keys / conversation
```

`provider_work_dir`、`binary_path` 本轮不写本机绝对路径，只写 Host 侧 opaque id 或脱敏诊断信息。

命令：

```bash
supabase migration new owner_agent_chat_schema
supabase migration list
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
```

---

## 五、HTTP Contract

所有 HTTP DTO 放入 `shared/contracts/http/owner-agent-chat/`。

建议文件：

```text
shared/contracts/http/owner-agent-chat/types.ts
shared/contracts/http/owner-agent-chat/protocol.ts
```

### 5.1 API 列表

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/api/owner/agents` | 列出 Owner Agent |
| `POST` | `/api/owner/agents` | 创建 Agent + binding |
| `PATCH` | `/api/owner/agents/:agentId` | 编辑 Agent 基础信息 |
| `GET` | `/api/owner/agents/:agentId/conversation` | 获取或创建主会话 |
| `POST` | `/api/owner/agents/:agentId/messages` | 发送 Owner 私聊消息 |
| `POST` | `/api/owner/agents/:agentId/conversation/reset` | 重置 provider 上下文 |
| `GET` | `/api/owner/agent-runs/:runId` | 查询 run 当前状态 |
| `POST` | `/api/owner/agent-runs/:runId/cancel` | 取消 run |
| `GET` | `/api/owner/hosts` | 查看已连接 Host |
| `POST` | `/api/owner/host-tokens` | 生成 Host token |
| `DELETE` | `/api/owner/host-tokens/:tokenId` | 撤销 Host token |

### 5.2 发送消息语义

`POST /api/owner/agents/:agentId/messages`：

1. 校验 Owner 对 Agent 的所有权。
2. 获取或创建 `owner_agent_conversations`。
3. 写入 encrypted `owner_agent_messages(sender_type='owner')`。
4. 创建 `owner_agent_runs(status='queued')`。
5. 如果绑定 Host 在线，Gateway 通过 WS 下发 run request。
6. 如果 Host 离线，message/run 保持 `pending` 或 `queued`，不自动执行。

### 5.3 重置上下文语义

`POST /api/owner/agents/:agentId/conversation/reset`：

1. 校验 Owner 拥有 Agent 和 conversation。
2. 取消该 conversation 上 in-flight run。
3. 清空 `provider_session_id` 和 `provider_work_dir`。
4. 写入加密 system message：`context_reset`。
5. 如果 Host 在线，发送 `owner_agent_session_reset` frame。

---

## 六、WebSocket Contract

新增 frame 必须从 `shared/contracts/ws/types.ts` 起步，并同步 Zod schema。

### 6.1 Host 连接

```text
host_register
host_heartbeat
host_capabilities_updated
```

`host_register` 携带：

```json
{
  "type": "host_register",
  "host_id": "uuid",
  "host_type": "local",
  "display_name": "Zeze MacBook Pro",
  "providers": [
    {
      "provider": "claude",
      "version": "x.y.z",
      "status": "available",
      "capabilities": {
        "streaming": true,
        "full_access": true
      }
    }
  ]
}
```

### 6.2 Run 执行

```text
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

所有 run frame 必须携带：

- `run_id`
- `conversation_id`
- `agent_id`
- `provider`
- `correlation_id`
- `seq`（事件帧）

### 6.3 Run 协议状态机

```text
queued
→ host_dispatched
→ accepted
→ running
→ completed | failed | cancelled | timeout
```

Ack 语义：

- HTTP `POST messages` 返回“已持久化并创建 run”。
- WS `owner_agent_run_accepted` 表示 Host 已接收 run。
- `owner_agent_run_event.seq` 由 Host 对每个 run 从 1 开始递增。
- Gateway 检测到 seq gap 时标记 run failed，错误码 `seq_gap`，并停止接收该 run 后续 event。

重连语义：

- Host 重连后发送 `host_register`，附带本地 in-flight run 列表和 last_seq。
- Gateway 返回 `owner_agent_run_replay`，列出需要继续、取消或忽略的 run。
- 页面刷新时，Web 从 `decrypted-messages` 拉取 final messages，并拉取 active run 的 text events 恢复正在流式输出的内容。

Backpressure：

- Host event delta 单帧文本不超过 4 KB。
- 大文本由 Host 切片成多条 `owner_agent_run_event`。
- Gateway 对单 connection 维护 in-flight event 上限，超过后返回 `owner_agent_run_failed(backpressure)`.

### 6.4 日志要求

日志只能记录：

- frame type
- connection id
- run id
- status
- error code

禁止记录：

- message content
- decrypted payload
- token
- KEK / DEK
- 本机完整环境变量

---

## 七、Gateway 设计

### 7.1 新增模块

建议新增：

```text
gateway/src/routes/owner-agents.ts
gateway/src/routes/owner-agent-messages.ts
gateway/src/routes/owner-host-tokens.ts
gateway/src/services/owner-agent-chat.ts
gateway/src/services/agent-host-registry.ts
gateway/src/db/owner-agent-chat.ts
gateway/src/ws/owner-agent-router.ts
```

### 7.2 写路径

Gateway 继续作为加密写路径：

```text
Owner message plaintext
→ Gateway encrypt(content)
→ owner_agent_messages.content_encrypted
→ run request to Host
```

Host 回传事件：

```text
Host event plaintext
→ Gateway encrypt(event content)
→ owner_agent_run_events.content_encrypted
→ fanout redacted realtime frame to Owner UI
```

实时 UI 可以收到当前连接内的 plaintext chunk，但历史读取必须走 Edge Function 解密。

### 7.3 在线状态

Gateway 内存 registry 维护 Host WS 连接。数据库 `agent_hosts.last_seen_at/status` 用作 Dashboard 展示与重连恢复，不作为强一致路由真相。本轮按单 Gateway 实例部署设计；水平扩展前必须把 Host registry 和 run dispatch 状态迁移到 Redis/pubsub 或等价共享层。

### 7.4 Pending 生命周期

- 单 conversation 最多 50 条 pending 消息。
- pending 消息 7 天未处理后变为 `expired`。
- Host 重新上线后不自动执行 pending。
- 用户点击重新发送时创建新 run，旧 pending 标记为 `replaced`。
- running run 30 分钟无 event 自动失败，错误码 `timeout`。

---

## 八、Go Host 设计

### 8.1 工程结构

```text
qrclaw-agent-host/
├── go.mod
├── cmd/qrclaw-agent-host/main.go
├── internal/config/
├── internal/auth/
├── internal/detect/
├── internal/provider/
│   ├── provider.go
│   ├── openclaw/
│   ├── claude/
│   ├── cursor/
│   └── codex/
├── internal/ws/
├── internal/logging/
└── internal/store/
```

### 8.2 Provider 接口

```go
type Provider interface {
    Name() string
    Detect(ctx context.Context) (Capability, error)
    HealthCheck(ctx context.Context) (HealthResult, error)
    StartRun(ctx context.Context, req RunRequest) (<-chan RunEvent, error)
    CancelRun(ctx context.Context, runID string) error
}
```

### 8.3 探测顺序

```text
env override path
→ PATH LookPath
→ --version
→ minimum version check
→ low-privilege health check
→ capability registration
```

环境变量：

```text
QRCLAW_OPENCLAW_PATH
QRCLAW_CLAUDE_PATH
QRCLAW_CURSOR_PATH
QRCLAW_CODEX_PATH
```

### 8.4 Token 存储

本轮可先使用本地文件，但必须：

- chmod 600
- 不写日志
- 支持 logout 删除

后续升级系统 keychain。

---

## 九、Provider Adapter 分期

| Phase | Provider | 验收 |
|-------|----------|------|
| P0 | OpenClaw | 能执行一次本地对话并返回最终文本 |
| P1 | Claude Code | 支持 `--permission-mode bypassPermissions` 和 stream-json |
| P2 | Cursor Agent | 支持 `--yolo` 和流式输出 |
| P3 | Codex | 明确 app-server / JSON-RPC / sandbox 参数后接入 |

探测层可四个同时完成，执行层允许按 P0-P3 分期交付。

---

## 十、Edge Function

本轮扩展 `supabase/functions/decrypted-messages`，不新建独立解密函数：

- 新增 actor：`owner-private-agent-chat`
- 请求 DTO：`conversation_id`、可选 `run_id`、`include_events`、`cursor`、`limit`
- 响应 DTO：`messages[]`、可选 `events[]`、`active_runs[]`
- 返回 owner 私聊 message 和 run event
- 授权链：`owner_agent_conversations.owner_id -> owners.id -> owners.user_id == auth.uid()`
- 密钥表：`owner_agent_conversation_keys`
- 支持刷新期间恢复 active run 的 text event
- 禁止明文日志

保持既有原则：Gateway 不做历史读解密。

---

## 十一、安全

### 11.1 Host Token

- token 原文只展示一次。
- token 原文格式：`qrclaw_host_<base64url(32 bytes random)>`。
- DB 只存 `token_hash = HMAC-SHA256(QRCLAW_HOST_TOKEN_PEPPER, token)`。
- `agent_host_tokens.token_hash` 必须唯一。
- 支持撤销。
- 支持过期。
- scope 限定 owner/private-chat/local-host，并通过 `HostTokenScope` schema 校验。
- 撤销后 Gateway 必须主动关闭对应 Host WS；单实例内存缓存即可，本轮水平扩展前再迁 Redis/pubsub。

### 11.2 Full Access

创建本地高权限 Agent 时必须确认：

```text
Full Access: this local agent may read/write files and run commands on this device.
```

第一版仅 Owner 私聊允许触发 Full Access；访客公开触发后置。

### 11.3 隔离

- Owner A 不能读取 Owner B 的 Host、Agent、会话、消息。
- Host 不能接收非同 Owner 或未绑定 Agent 的 run。
- run events 按 `run_id` 隔离，禁止串线。

Actor 最小权限：

| 操作 | Gateway service role | Host WS | Plugin agent token | Owner JWT |
|------|----------------------|---------|--------------------|-----------|
| 写 owner message | ✅ 加密后写 | ❌ | ❌ | 经 Gateway API |
| 写 agent message / run event | ✅ 加密后写 | 只能经 WS 交给 Gateway | 只能经 Gateway/plugin 通道 | ❌ |
| 读 owner private messages | ✅ Edge Function service role | ❌ | ❌ | ✅ 经 Edge Function |
| 直连 Supabase SELECT 私聊表 | ✅ | ❌ | ❌ | 受 RLS 限制 |

---

## 十二、部署与运维

### 12.1 Web / Gateway / Supabase

沿用现有部署模式：

- Web：Vercel
- Gateway：Tencent Cloud Docker / PM2
- Supabase：cloud project `zyxqadubhwrnsoujiyir`

### 12.2 Go Host 发布

本轮发布目标：

```text
darwin/arm64
darwin/amd64
linux/amd64
```

Windows 可后置。

### 12.3 观测指标

新增指标：

- host connected count
- provider detected count
- owner agent run queued/running/completed/failed
- run event validation failure
- host token revoked usage attempt

---

## 十三、验收标准

技术方案完成后必须满足：

- Supabase 新表、RLS、types 完成。
- HTTP / WS contracts 有类型和 Zod schema。
- Gateway 新增 API 和 run routing。
- Go Host 能注册并上报 provider。
- OpenClaw / Claude Code / Cursor Agent / Codex 四个 provider 能跑通 Owner 私聊；如某个 provider 因上游协议不可控需要延期，必须由 Owner 单独签署延期决策。
- Owner 历史消息可通过 `decrypted-messages` 读回。
- 测试方案中的 P0 用例全部通过。

