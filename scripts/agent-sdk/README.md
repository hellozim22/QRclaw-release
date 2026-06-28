# QRClaw Agent SDK

> **Recommended Migration (2026-04) — for new projects, use
> [`@qrclaw/openclaw-plugin`](../../plugins/openclaw/README.md) instead.** The plugin is the
> official OpenClaw-native integration: it bridges an OpenClaw agent to the QRClaw gateway with
> multi-account support, proper reconnect/dedup semantics, and the same on-the-wire behaviour as
> this SDK (see the indistinguishable acceptance spec at
> `tests/acceptance/plugin-indistinguishable.spec.ts`). The legacy SDK documented below still
> works and is not being removed in the MVP window, but all new agents should start on the
> plugin. Rationale and release cadence live in
> [§5.4 of the refactor plan](../../docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md).

---

Connect your AI Agent to QRClaw Gateway via WebSocket.

将你的 AI Agent 连接到 QRClaw Gateway（通过 WebSocket）。

---

## Quick Start / 快速开始

### Prerequisites / 前提条件

- **Node.js** v18+ installed ([download](https://nodejs.org/))
- A **QRClaw account** with an active Agent
- (Optional) An **OpenClaw** instance on Tencent Cloud

### 1. Install dependencies / 安装依赖

```bash
cd scripts/agent-sdk
npm install
```

### 2. Configure / 配置

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

编辑 `.env` 文件，填入你的配置：

| Variable | Description | 说明 |
|----------|-------------|------|
| `SUPABASE_URL` | QRClaw Supabase URL (pre-filled) | QRClaw Supabase 地址（已预填） |
| `AGENT_API_KEY` | Your Agent's API key | 你的 Agent API 密钥 |
| `GATEWAY_WS_URL` | Gateway WebSocket URL | Gateway WebSocket 地址 |
| `OPENCLAW_API_URL` | Your OpenClaw API endpoint | 你的 OpenClaw API 地址 |
| `OPENCLAW_API_KEY` | OpenClaw authentication key | OpenClaw 认证密钥 |

### 3. Create an Agent (if you don't have one) / 创建 Agent（如果还没有）

Run the setup script to create an Agent and get an API key:

运行创建脚本来创建 Agent 并获取 API 密钥：

```bash
# First, add SUPABASE_SERVICE_ROLE_KEY to your .env
# 首先，在 .env 中添加 SUPABASE_SERVICE_ROLE_KEY

npm run setup-agent
```

The script will:
1. Ask for your Agent's name and description
2. Create the Agent in the database
3. Generate an API key
4. Optionally create a QR code for the Agent

脚本会：
1. 询问你的 Agent 名称和描述
2. 在数据库中创建 Agent
3. 生成 API 密钥
4. 可选地为 Agent 创建 QR Code

> **Important**: Save the API key! It will only be shown once.
>
> **重要**：请保存 API 密钥！它只会显示一次。

### 4. Test with Echo Agent / 用 Echo Agent 测试

```bash
npm run echo-agent
```

This starts a simple bot that echoes back whatever visitors say. Use it to verify your connection is working.

这会启动一个简单的回声机器人，访客说什么就回复什么。用它来验证连接是否正常。

Expected output / 预期输出：

```
🤖 QRClaw Echo Agent starting...
🔄 Connection state: requesting_ticket
[...] Requesting WebSocket ticket...
[...] Ticket obtained (expires in 30s)
🔄 Connection state: connecting
[...] Connecting to ws://localhost:8080/ws ...
🔄 Connection state: connected
[...] Connected! ID: abc-123-...

📨 Visitor says: "Hello!"
📤 Replied: "Echo: Hello!"
```

### 5. Connect OpenClaw / 连接 OpenClaw

Once the echo agent works, switch to the OpenClaw agent:

Echo Agent 正常运行后，切换到 OpenClaw Agent：

```bash
# Make sure OPENCLAW_API_URL and OPENCLAW_API_KEY are set in .env
# 确保 .env 中设置了 OPENCLAW_API_URL 和 OPENCLAW_API_KEY

npm run openclaw-agent
```

For streaming mode (if your OpenClaw supports SSE):

如果你的 OpenClaw 支持 SSE 流式输出：

```bash
# Add to .env:
OPENCLAW_STREAM=true
```

---

## How It Works / 工作原理

```
┌─────────┐     scan QR      ┌──────────┐
│ Visitor  │ ──────────────▶  │  QRClaw  │
│ (phone)  │ ◀── messages ──  │ Gateway  │
└─────────┘                   └────┬─────┘
                                   │ WebSocket
                                   ▼
                              ┌──────────┐     HTTP      ┌──────────┐
                              │  Agent   │ ──────────▶   │ OpenClaw │
                              │   SDK    │ ◀── reply ──  │   (AI)   │
                              └──────────┘               └──────────┘
```

1. **Visitor scans QR code** → opens chat in browser
2. **Visitor sends message** → QRClaw Gateway receives it
3. **Gateway forwards** to your Agent via WebSocket
4. **Agent SDK receives** the message and calls your handler
5. **Your handler** (e.g., OpenClaw) generates a reply
6. **Agent SDK sends** the reply back through Gateway
7. **Visitor sees** the AI response in their browser

---

## API Reference / API 参考

### `AgentConnector`

```typescript
import { AgentConnector } from './agent-connector.js';

const agent = new AgentConnector({
  supabaseUrl: 'https://xxx.supabase.co',
  agentApiKey: 'qrc_...',
  gatewayWsUrl: 'ws://localhost:8080',
  onMessage: (message, connector) => {
    // Handle visitor message / 处理访客消息
    connector.sendReply(message.conversationId, 'Hello!');
  },
});

await agent.connect();
```

### Methods / 方法

| Method | Description | 说明 |
|--------|-------------|------|
| `connect()` | Start connection flow | 开始连接 |
| `disconnect()` | Gracefully disconnect | 优雅断开 |
| `getState()` | Get current state | 获取当前状态 |
| `sendReply(conversationId, content, contentType?)` | Send a full reply | 发送完整回复 |
| `sendStreamReply(conversationId, chunks[])` | Send chunked reply | 发送分块回复 |
| `sendStreamChunk(conversationId, delta, sequence, messageId?)` | Send one stream chunk | 发送单个分块 |
| `sendStreamEnd(conversationId, messageId, totalChunks)` | End a stream | 结束流式输出 |

### Config Options / 配置选项

| Option | Type | Default | Description | 说明 |
|--------|------|---------|-------------|------|
| `supabaseUrl` | string | required | Supabase URL | Supabase 地址 |
| `agentApiKey` | string | required | API key | API 密钥 |
| `gatewayWsUrl` | string | required | Gateway WS URL | Gateway 地址 |
| `onMessage` | function | required | Message handler | 消息处理函数 |
| `onStateChange` | function | optional | State change callback | 状态变化回调 |
| `onError` | function | optional | Error callback | 错误回调 |
| `autoReconnect` | boolean | `true` | Auto-reconnect | 自动重连 |
| `reconnectDelayMs` | number | `3000` | Reconnect delay | 重连延迟(ms) |
| `maxReconnectAttempts` | number | `10` | Max retries | 最大重试次数 |

### IncomingMessage / 收到的消息

| Field | Type | Description | 说明 |
|-------|------|-------------|------|
| `id` | string | Message ID | 消息 ID |
| `content` | string | Message text | 消息内容 |
| `contentType` | string | "text", "image_url", etc. | 内容类型 |
| `senderType` | string | "visitor" | 发送者类型 |
| `conversationId` | string | QR code ID (use for replies) | 会话 ID（回复时使用） |
| `queuedAt` | string? | If message was queued offline | 离线排队时间 |

---

## Troubleshooting / 常见问题

### "Ticket request failed (HTTP 403)"

**Cause**: Invalid API key or agent is deactivated.

**原因**：API 密钥无效或 Agent 已停用。

**Fix**:
- Check `AGENT_API_KEY` in your `.env`
- Run `npm run setup-agent` to create a new agent
- 检查 `.env` 中的 `AGENT_API_KEY`
- 运行 `npm run setup-agent` 创建新的 Agent

### "WebSocket closed before ack (code: 4002)"

**Cause**: Ticket expired (tickets are valid for 30 seconds only).

**原因**：Ticket 已过期（有效期只有 30 秒）。

**Fix**: This usually means the Gateway took too long to respond. Check:
- Is the Gateway running? (`cd gateway && npm run dev`)
- Is `GATEWAY_WS_URL` correct?

**修复**：通常是 Gateway 响应太慢。检查：
- Gateway 是否在运行？（`cd gateway && npm run dev`）
- `GATEWAY_WS_URL` 是否正确？

### "connect ECONNREFUSED 127.0.0.1:8080"

**Cause**: Gateway is not running.

**原因**：Gateway 没有运行。

**Fix**: Start the Gateway first:
```bash
cd gateway
npm run dev
```

### "OpenClaw API error (HTTP 500)"

**Cause**: Your OpenClaw service returned an error.

**原因**：你的 OpenClaw 服务返回了错误。

**Fix**:
- Check `OPENCLAW_API_URL` is correct
- Test your OpenClaw API directly: `curl -X POST http://your-url/api/chat -d '{"message":"hello"}'`
- Check OpenClaw logs on your Tencent Cloud server

**修复**：
- 检查 `OPENCLAW_API_URL` 是否正确
- 直接测试 OpenClaw API：`curl -X POST http://your-url/api/chat -d '{"message":"hello"}'`
- 检查腾讯云服务器上的 OpenClaw 日志

### Agent receives no messages

**Cause**: No QR code is linked to this agent, or no visitors have scanned it.

**原因**：没有 QR Code 关联到此 Agent，或没有访客扫描。

**Fix**:
1. Check that a QR code exists for your agent (run `setup-agent` if not)
2. Open the QR code URL in a browser to simulate a visitor
3. Send a message from the visitor chat page

**修复**：
1. 确认有 QR Code 关联到你的 Agent（没有的话运行 `setup-agent`）
2. 在浏览器中打开 QR Code URL 模拟访客
3. 从访客聊天页面发送消息

---

## Customizing for Your AI / 自定义你的 AI

The `example-openclaw-agent.ts` is a template. You can adapt it for any AI service:

`example-openclaw-agent.ts` 是一个模板，你可以适配任何 AI 服务：

```typescript
// Your custom handler / 你的自定义处理器
const handleMessage = async (message, agent) => {
  // Call your AI service / 调用你的 AI 服务
  const reply = await yourAIService.chat(message.content);

  // Send reply / 发送回复
  agent.sendReply(message.conversationId, reply);
};
```

For streaming AI responses / 流式 AI 回复：

```typescript
const handleMessage = async (message, agent) => {
  const stream = await yourAIService.chatStream(message.content);
  let msgId;
  let seq = 0;

  for await (const chunk of stream) {
    seq++;
    msgId = agent.sendStreamChunk(
      message.conversationId, chunk, seq, msgId
    );
  }

  if (msgId) {
    agent.sendStreamEnd(message.conversationId, msgId, seq);
  }
};
```

---

## File Structure / 文件结构

```
scripts/agent-sdk/
├── agent-connector.ts          # Core SDK / 核心 SDK
├── example-echo-agent.ts       # Echo bot example / 回声机器人示例
├── example-openclaw-agent.ts   # OpenClaw integration / OpenClaw 集成
├── setup-agent.ts              # Agent creation script / Agent 创建脚本
├── package.json                # Dependencies / 依赖
├── tsconfig.json               # TypeScript config / TS 配置
├── .env.example                # Config template / 配置模板
└── README.md                   # This file / 本文件
```
