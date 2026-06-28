---
name: agent-connectivity-test
description: External test agent connectivity workflow for QRClaw. Covers Agent SDK usage, echo/openclaw test agents, full lifecycle verification (create → claim → QR → scan → chat), and troubleshooting.
origin: session-extracted-2026-03-16
---

# Agent Connectivity Test Skill

> 用于验证 QRClaw 平台与外部 AI Agent 的端到端联通性。
> 本 Skill 沉淀了完整的 Agent 连接测试流程，可作为后续所有 Agent 联通性测试的标准参考。

---

## 1. 前置条件

### 1.1 服务依赖

| 服务 | 地址 | 用途 |
|------|------|------|
| Gateway | `ws://localhost:3001` | WebSocket 实时通信 |
| Next.js Dev | `http://localhost:3000` | 前端页面 |
| Supabase | `https://zyxqadubhwrnsoujiyir.supabase.co` | Auth + DB + Edge Functions |
| Redis | `localhost:6379` | 消息队列 + 限流 |

### 1.2 启动顺序

```bash
# 1. Redis (如果未运行)
redis-server &

# 2. Gateway
cd gateway && npm run dev

# 3. Next.js 前端
cd web && npm run dev

# 4. Test Agent (按需选择)
cd scripts/agent-sdk && npm run echo-agent
# 或
cd scripts/agent-sdk && npm run openclaw-agent
```

### 1.3 环境变量

Agent SDK 的 `.env` 位于 `scripts/agent-sdk/.env`：

```env
# 必填 — Supabase 连接
SUPABASE_URL=https://zyxqadubhwrnsoujiyir.supabase.co
AGENT_API_KEY=qrc_<your_agent_api_key>

# 必填 — Gateway WebSocket
GATEWAY_WS_URL=ws://localhost:3001

# 可选 — Supabase Service Role (用于直接数据库操作)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# 可选 — OpenClaw AI 集成 (仅 openclaw-agent 需要)
OPENCLAW_API_URL=http://<host>:<port>
OPENCLAW_API_KEY=<key>
OPENCLAW_MODEL=glmcode/glm-5-turbo
OPENCLAW_STREAM=false
```

**关键说明**：
- `AGENT_API_KEY` 是 Agent 在 Supabase `agents` 表中的 `api_key` 字段
- 本地开发时 `GATEWAY_WS_URL` 使用 `ws://localhost:3001`
- 生产环境使用 `wss://<gateway-domain>`

---

## 2. AgentConnector SDK 参考

### 2.1 核心类

文件位置：`scripts/agent-sdk/agent-connector.ts`

```typescript
import { AgentConnector, AgentConnectorConfig, IncomingMessage } from './agent-connector';
```

### 2.2 连接配置 (`AgentConnectorConfig`)

```typescript
interface AgentConnectorConfig {
  supabaseUrl: string;           // Supabase 项目 URL
  agentApiKey: string;           // Agent API Key (qrc_ 前缀)
  gatewayWsUrl: string;          // Gateway WebSocket URL
  onMessage: (message: IncomingMessage, connector: AgentConnector) => void | Promise<void>;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;       // 默认 true
  reconnectDelayMs?: number;     // 默认 3000ms
  maxReconnectAttempts?: number; // 默认 10
  ticketUrl?: string;            // 本地开发时覆盖 ticket 端点
}
```

### 2.3 消息类型 (`IncomingMessage`)

```typescript
interface IncomingMessage {
  id: string;              // 消息唯一 ID
  content: string;         // 消息内容
  contentType: string;     // 内容类型 (text/plain 等)
  senderType: string;      // 发送者类型 (visitor)
  conversationId: string;  // 对话 ID (回复时必须使用)
  queuedAt?: string;       // 离线队列时间戳
  raw: Record<string, unknown>; // 原始消息帧
}
```

### 2.4 连接状态

```
disconnected → requesting_ticket → connecting → connected
                                                    ↓
                                              reconnecting (自动)
```

### 2.5 公开方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `connect()` | `connect(): Promise<void>` | 请求 Ticket → 建立 WS 连接 |
| `disconnect()` | `disconnect(): void` | 断开连接，停止心跳和重连 |
| `getState()` | `getState(): ConnectionState` | 获取当前连接状态 |
| `sendReply()` | `sendReply(conversationId, content, contentType?)` | 发送完整回复 |
| `sendStreamChunk()` | `sendStreamChunk(conversationId, delta, sequence, messageId?)` | 发送流式分片 |
| `sendStreamEnd()` | `sendStreamEnd(conversationId, messageId, totalChunks)` | 结束流式回复 |
| `sendStreamReply()` | `sendStreamReply(conversationId, chunks[])` | 便捷方法：批量发送分片 + 自动结束 |

### 2.6 Ticket 获取机制

```
本地开发:  POST ${gatewayWsUrl}/api/agent-ws-ticket
生产环境:  POST ${supabaseUrl}/functions/v1/agent-ws-ticket
Header:    Authorization: Bearer ${agentApiKey}
Response:  { "ticket": "<JWT>" }
```

**本地开发 ticketUrl 覆盖模式**（必须用于本地测试）：

```typescript
const ticketUrl = GATEWAY_WS_URL
  .replace('ws://', 'http://')
  .replace('wss://', 'https://')
  + '/api/agent-ws-ticket';
```

### 2.7 WebSocket 连接 URL

```
${gatewayWsUrl}/ws?ticket=${ticket}&role=agent
```

### 2.8 心跳机制

- 收到 `connection_ack` 后启动心跳
- 按 `heartbeat_interval_ms`（服务端下发）间隔发送 `ping`
- 期望收到 `pong` 回复

---

## 3. 测试 Agent 模板

### 3.1 Echo Agent（最小验证）

文件：`scripts/agent-sdk/example-echo-agent.ts`
运行：`cd scripts/agent-sdk && npm run echo-agent`

**功能**：收到任何 visitor 消息后，原样回显 `Echo: ${message.content}`。

**核心代码模式**：

```typescript
const agent = new AgentConnector({
  supabaseUrl: SUPABASE_URL,
  agentApiKey: AGENT_API_KEY,
  gatewayWsUrl: GATEWAY_WS_URL,
  ticketUrl: localTicketUrl, // 本地开发必须
  onMessage: async (message, connector) => {
    await connector.sendReply(
      message.conversationId,
      `Echo: ${message.content}`
    );
  },
  onStateChange: (state) => console.log(`State: ${state}`),
  onError: (error) => console.error('Error:', error),
});

await agent.connect();
```

**验证点**：
- [x] Agent 状态变为 `connected`
- [x] 收到 visitor 消息
- [x] Visitor 端收到 echo 回复

### 3.2 OpenClaw Agent（AI 集成验证）

文件：`scripts/agent-sdk/example-openclaw-agent.ts`
运行：`cd scripts/agent-sdk && npm run openclaw-agent`

**功能**：将 visitor 消息转发到 OpenClaw API，支持非流式和流式两种模式。

**非流式模式** (`OPENCLAW_STREAM=false`)：
```typescript
// POST /v1/chat/completions → 完整响应
const reply = await callOpenClaw(message.content);
await agent.sendReply(message.conversationId, reply);
```

**流式模式** (`OPENCLAW_STREAM=true`)：
```typescript
// POST /v1/chat/completions (stream: true) → SSE
// 逐 chunk 解析 → sendStreamChunk → sendStreamEnd
const messageId = crypto.randomUUID();
let sequence = 0;

for await (const delta of streamOpenClaw(message.content)) {
  await agent.sendStreamChunk(
    message.conversationId,
    delta,
    sequence++,
    messageId
  );
}

await agent.sendStreamEnd(
  message.conversationId,
  messageId,
  sequence
);
```

**验证点**：
- [x] Agent 状态变为 `connected`
- [x] 非流式：收到完整 AI 回复
- [x] 流式：Visitor 端实时显示打字效果
- [x] 流式：收到 `stream_end` 后消息完整

---

## 4. 完整生命周期测试流程

### 4.1 流程概览

```
创建 Agent → 认领 Agent → 创建 QR Code → 扫码访问 → 开始聊天
    ↓           ↓            ↓             ↓          ↓
  POST       PATCH         POST        GET /q/     WebSocket
claim-agent  claim-agent  create-qrcode  [slug]     双向通信
```

### 4.2 Step 1: 创建 Agent

**方式 A**：通过 Supabase Dashboard 直接插入 `agents` 表
**方式 B**：通过 Edge Function

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/claim-agent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "name": "Test Echo Agent",
    "description": "Automated connectivity test agent"
  }'
```

**返回**：`{ "data": { "id": "<agent_uuid>", "api_key": "qrc_...", "status": "unclaimed" } }`

记录 `agent_id` 和 `api_key`。

### 4.3 Step 2: 认领 Agent

**方式 A**：浏览器访问 `/claim/<agent_uuid>`（需登录或注册）
**方式 B**：API 调用

```bash
curl -X PATCH "${SUPABASE_URL}/functions/v1/claim-agent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
  -d '{ "agent_id": "<agent_uuid>" }'
```

**验证**：Agent 状态从 `unclaimed` → `active`，`owner_id` 被设置。

### 4.4 Step 3: 创建 QR Code

**方式 A**：前端页面 `/qrcodes/create`（4 步向导）
**方式 B**：API 调用

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/create-qrcode" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
  -d '{
    "agent_id": "<agent_uuid>",
    "name": "Test QR",
    "greeting": "Hello! How can I help?"
  }'
```

**返回**：
```json
{
  "data": {
    "id": "<qrcode_uuid>",
    "slug": "aB3cD4eF5gH6",
    "status": "active",
    "profile_url": "https://qrclaw.ai/q/aB3cD4eF5gH6",
    "qr_image_url": "https://...",
    "agent_id": "<agent_uuid>"
  }
}
```

记录 `slug` 和 `profile_url`。

### 4.5 Step 4: Slug 解析验证

访问 `http://localhost:3000/q/<slug>`

**预期行为**：
1. 服务端验证 slug 格式（12 位字母数字）
2. 查询 `qrcodes` 表找到对应记录
3. 检查状态为 `active`
4. 302 重定向到 `/agent/<agent_id>`

### 4.6 Step 5: WebSocket 聊天验证

1. Visitor 端访问 `/chat/<agent_id>`
2. 前端获取 visitor-ws-ticket
3. 建立 WebSocket 连接
4. 发送消息
5. Agent 收到消息 → 处理 → 回复
6. Visitor 端显示回复

---

## 5. 自动化联通性检查脚本

以下是快速验证联通性的检查清单（可用 bash 或 TypeScript 脚本自动化）：

### 5.1 Gateway 健康检查

```bash
curl -s http://localhost:3001/health | jq .
# 预期: { "status": "ok", ... }
```

### 5.2 Ticket 获取检查

```bash
curl -s -X POST http://localhost:3001/api/agent-ws-ticket \
  -H "Authorization: Bearer ${AGENT_API_KEY}" \
  -H "Content-Type: application/json" | jq .
# 预期: { "ticket": "eyJ..." }
```

### 5.3 WebSocket 连接检查

```bash
# 使用 websocat 工具
TICKET=$(curl -s -X POST http://localhost:3001/api/agent-ws-ticket \
  -H "Authorization: Bearer ${AGENT_API_KEY}" | jq -r .ticket)

websocat "ws://localhost:3001/ws?ticket=${TICKET}&role=agent"
# 预期: 收到 connection_ack JSON 帧
```

### 5.4 Echo Agent 端到端验证

```bash
# 终端 1: 启动 echo agent
cd scripts/agent-sdk && npm run echo-agent

# 终端 2: 浏览器访问 /chat/<agent_id> 发送消息
# 预期: 收到 "Echo: <your message>" 回复
```

---

## 6. 故障排查

### 6.1 常见问题

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| Ticket 请求 401 | API Key 无效或过期 | 检查 `agents` 表 `api_key` 字段 |
| Ticket 请求 404 | 端点路径错误 | 本地用 `/api/agent-ws-ticket`，生产用 Edge Function |
| WS 连接立即断开 | Ticket 过期（60s 有效期） | 获取 ticket 后立即连接 |
| WS 连接后无消息 | Agent 未绑定 QR Code | 确认已创建 QR Code 并绑定到该 Agent |
| 收到消息但回复失败 | `conversationId` 不匹配 | 使用 `message.conversationId` 原值回复 |
| 多个 Agent 收到同一消息 | 同一 `agent_id` 有多个连接 | 确保每个 agent_id 只运行一个进程 (OPT-001) |
| 流式消息不完整 | 未发送 `stream_end` | 确保调用 `sendStreamEnd()` |
| 重连失败 | 超过 `maxReconnectAttempts` | 检查 Gateway 是否在运行 |

### 6.2 CSP 相关

如果前端页面按钮无法点击（CR-001），检查 `web/next.config.ts` 中 CSP 配置：
- `script-src` 必须包含 `'unsafe-inline'`（开发环境）
- `connect-src` 必须包含 `ws://localhost:*`

### 6.3 调试日志

Agent SDK 内置日志前缀 `[AgentConnector]`，关注以下关键日志：

```
[AgentConnector] Requesting ticket...
[AgentConnector] Ticket acquired, connecting WebSocket...
[AgentConnector] connection_ack received, heartbeat started
[AgentConnector] Received message: { id, conversationId, content }
[AgentConnector] Sent reply to conversation <id>
```

---

## 7. 协议帧参考

### 7.1 Agent 接收的帧类型

| 类型 | 说明 | 关键字段 |
|------|------|---------|
| `connection_ack` | 连接确认 | `heartbeat_interval_ms`, `agent_id` |
| `ping` | 心跳请求 | - |
| `pong` | 心跳响应 | - |
| `message` | Visitor 消息 | `id`, `content`, `content_type`, `sender_type`, `conversation_id` |
| `error` | 错误通知 | `code`, `message` |

### 7.2 Agent 发送的帧类型

| 类型 | 说明 | 关键字段 |
|------|------|---------|
| `pong` | 心跳响应 | - |
| `agent_message` | 完整回复 | `conversation_id`, `content`, `content_type` |
| `stream_chunk` | 流式分片 | `conversation_id`, `delta`, `sequence`, `message_id` |
| `stream_end` | 流式结束 | `conversation_id`, `message_id`, `total_chunks` |

---

## 8. 测试矩阵

在进行联通性测试时，按以下矩阵逐项验证：

| # | 测试项 | Agent | 验证方法 | 预期结果 |
|---|--------|-------|---------|---------|
| 1 | Gateway 健康 | - | `GET /health` | `200 { status: "ok" }` |
| 2 | Ticket 获取 | Echo | `POST /api/agent-ws-ticket` | `200 { ticket: "..." }` |
| 3 | WS 连接 | Echo | Agent 日志 | `State: connected` |
| 4 | 心跳 | Echo | 30s 后仍连接 | 无断开 |
| 5 | 消息接收 | Echo | Visitor 发消息 | Agent 日志显示消息 |
| 6 | 消息回复 | Echo | Visitor 端 | 显示 "Echo: ..." |
| 7 | 断线重连 | Echo | 重启 Gateway | 自动重连成功 |
| 8 | AI 非流式 | OpenClaw | Visitor 发消息 | 收到 AI 完整回复 |
| 9 | AI 流式 | OpenClaw | Visitor 发消息 | 逐字显示 + stream_end |
| 10 | Claim 流程 | - | 浏览器 /claim/ | Agent 状态变 active |
| 11 | QR 创建 | - | 浏览器 /qrcodes/create | 返回 slug + QR 图片 |
| 12 | Slug 解析 | - | 浏览器 /q/<slug> | 重定向到 /agent/<id> |

---

## 9. 扩展：自定义测试 Agent

基于 `AgentConnector` 创建新的测试 Agent：

```typescript
import { AgentConnector } from './agent-connector';

const agent = new AgentConnector({
  supabaseUrl: process.env.SUPABASE_URL!,
  agentApiKey: process.env.AGENT_API_KEY!,
  gatewayWsUrl: process.env.GATEWAY_WS_URL!,
  ticketUrl: process.env.GATEWAY_WS_URL!
    .replace('ws://', 'http://')
    .replace('wss://', 'https://')
    + '/api/agent-ws-ticket',

  onMessage: async (message, connector) => {
    // 自定义消息处理逻辑
    console.log(`Received: ${message.content}`);

    // 示例：关键词触发不同回复
    if (message.content.includes('help')) {
      await connector.sendReply(message.conversationId, 'How can I assist you?');
    } else {
      await connector.sendReply(message.conversationId, `Processed: ${message.content}`);
    }
  },

  onStateChange: (state) => {
    console.log(`[CustomAgent] State: ${state}`);
  },

  onError: (error) => {
    console.error(`[CustomAgent] Error:`, error.message);
  },
});

await agent.connect();
console.log('[CustomAgent] Running... Press Ctrl+C to stop.');

process.on('SIGINT', () => {
  agent.disconnect();
  process.exit(0);
});
```

---

## 10. 已知限制

1. **OPT-001**: 同一 `agent_id` 多个 WS 连接时，Visitor 消息会广播给所有连接（非定向投递）。临时规避：每个 agent_id 只运行一个 Agent 进程。
2. **Ticket 有效期**: 60 秒，获取后需立即使用。
3. **Claim 有效期**: Agent 创建后 24 小时内需认领（前端已有倒计时 UI，后端校验待实现 — H3）。
4. **流式消息**: `sequence` 必须从 0 开始递增，Visitor 端按 sequence 排序显示。
