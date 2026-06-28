# QRClaw 前后端协议完整规范 — 技术方案补充章节

> **目标读者**：AI Coding Agent（Claude Code / Cursor / Copilot）
> **编码约束**：Agent 必须严格按照本文档的 Schema 和错误码实现，不得自行发明
> **协议版本**：v1（所有 URL 前缀 `/api/v1/`）
> **数据格式**：JSON，UTF-8 编码
> **时间格式**：ISO-8601 UTC（`2026-03-12T03:30:24.973Z`）
> **ID 格式**：UUIDv7（时间有序）

---

## §P1 WebSocket 消息帧格式（JSON Schema）

所有 WebSocket 消息使用 JSON 格式，顶层结构统一：

```typescript
// 通用消息帧
interface WSFrame {
  type: string;              // 消息类型（见下方枚举）
  id?: string;               // 消息 ID（UUIDv7），用于幂等去重和 ACK 关联
  timestamp: string;         // ISO-8601 UTC
  payload: Record<string, unknown>;
}
```

### P1.1 客户端 → Gateway 消息类型

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ClientToGateway",
  "oneOf": [
    {
      "title": "visitor_message",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "visitor_message" },
        "id": { "type": "string", "format": "uuid", "description": "客户端生成的 UUIDv7，用于幂等去重" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["content", "content_type"],
          "properties": {
            "content": { "type": "string", "maxLength": 10000, "description": "消息正文" },
            "content_type": { "enum": ["text", "image_url", "file_url"], "description": "内容类型" },
            "metadata": { "type": "object", "description": "可选扩展字段" }
          }
        }
      }
    },
    {
      "title": "agent_message",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "agent_message" },
        "id": { "type": "string", "format": "uuid" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["content", "content_type", "conversation_id"],
          "properties": {
            "content": { "type": "string", "maxLength": 50000 },
            "content_type": { "enum": ["text", "markdown", "image_url", "file_url"] },
            "conversation_id": { "type": "string", "format": "uuid" },
            "is_final": { "type": "boolean", "default": true, "description": "false = 流式中间帧" },
            "metadata": { "type": "object" }
          }
        }
      }
    },
    {
      "title": "stream_chunk",
      "description": "Agent 流式输出分片",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "stream_chunk" },
        "id": { "type": "string", "format": "uuid", "description": "与最终完整消息共享同一 ID" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["conversation_id", "delta"],
          "properties": {
            "conversation_id": { "type": "string", "format": "uuid" },
            "delta": { "type": "string", "description": "本次增量文本" },
            "sequence": { "type": "integer", "minimum": 0, "description": "分片序号" },
            "is_final": { "type": "boolean", "default": false }
          }
        }
      }
    },
    {
      "title": "stream_end",
      "description": "Agent 流式输出结束标记",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "stream_end" },
        "id": { "type": "string", "format": "uuid" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["conversation_id", "total_chunks"],
          "properties": {
            "conversation_id": { "type": "string", "format": "uuid" },
            "total_chunks": { "type": "integer" },
            "total_length": { "type": "integer", "description": "完整消息字符数" }
          }
        }
      }
    },
    {
      "title": "ping",
      "type": "object",
      "required": ["type", "timestamp"],
      "properties": {
        "type": { "const": "ping" },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    },
    {
      "title": "read_receipt",
      "description": "已读回执",
      "type": "object",
      "required": ["type", "timestamp", "payload"],
      "properties": {
        "type": { "const": "read_receipt" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["message_ids"],
          "properties": {
            "message_ids": { "type": "array", "items": { "type": "string", "format": "uuid" }, "maxItems": 100 }
          }
        }
      }
    }
  ]
}
```

### P1.2 Gateway → 客户端消息类型

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GatewayToClient",
  "oneOf": [
    {
      "title": "connection_ack",
      "type": "object",
      "required": ["type", "timestamp", "payload"],
      "properties": {
        "type": { "const": "connection_ack" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["connection_id", "heartbeat_interval_ms"],
          "properties": {
            "connection_id": { "type": "string", "format": "uuid" },
            "heartbeat_interval_ms": { "type": "integer", "default": 25000 },
            "server_time": { "type": "string", "format": "date-time" }
          }
        }
      }
    },
    {
      "title": "ack",
      "description": "消息确认",
      "type": "object",
      "required": ["type", "timestamp", "payload"],
      "properties": {
        "type": { "const": "ack" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["message_id", "status"],
          "properties": {
            "message_id": { "type": "string", "format": "uuid" },
            "status": { "enum": ["sent", "delivered", "read", "failed"] },
            "error_code": { "type": "string", "description": "仅 status=failed 时存在" },
            "error_message": { "type": "string" }
          }
        }
      }
    },
    {
      "title": "message",
      "description": "收到新消息（对端发送）",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "message" },
        "id": { "type": "string", "format": "uuid" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["content", "content_type", "sender_type", "conversation_id"],
          "properties": {
            "content": { "type": "string" },
            "content_type": { "enum": ["text", "markdown", "image_url", "file_url"] },
            "sender_type": { "enum": ["visitor", "agent"] },
            "conversation_id": { "type": "string", "format": "uuid" },
            "security_envelope": {
              "type": "object",
              "properties": {
                "timestamp": { "type": "string", "format": "date-time" },
                "sender_type": { "type": "string" },
                "message_id": { "type": "string" },
                "policy_hash": { "type": "string" },
                "signature": { "type": "string" }
              }
            }
          }
        }
      }
    },
    {
      "title": "stream_chunk",
      "description": "流式输出分片（Gateway → Visitor）",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "stream_chunk" },
        "id": { "type": "string", "format": "uuid" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["conversation_id", "delta", "sequence"],
          "properties": {
            "conversation_id": { "type": "string", "format": "uuid" },
            "delta": { "type": "string" },
            "sequence": { "type": "integer" },
            "is_final": { "type": "boolean" }
          }
        }
      }
    },
    {
      "title": "stream_end",
      "type": "object",
      "required": ["type", "id", "timestamp", "payload"],
      "properties": {
        "type": { "const": "stream_end" },
        "id": { "type": "string", "format": "uuid" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["conversation_id"],
          "properties": {
            "conversation_id": { "type": "string", "format": "uuid" },
            "full_content": { "type": "string", "description": "完整消息（可选，方便客户端校验）" },
            "total_chunks": { "type": "integer" }
          }
        }
      }
    },
    {
      "title": "pong",
      "type": "object",
      "required": ["type", "timestamp"],
      "properties": {
        "type": { "const": "pong" },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    },
    {
      "title": "error",
      "type": "object",
      "required": ["type", "timestamp", "payload"],
      "properties": {
        "type": { "const": "error" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["code", "message"],
          "properties": {
            "code": { "type": "string" },
            "message": { "type": "string" },
            "details": { "type": "object" }
          }
        }
      }
    },
    {
      "title": "system",
      "description": "系统通知（QRCode 状态变更、Agent 上下线等）",
      "type": "object",
      "required": ["type", "timestamp", "payload"],
      "properties": {
        "type": { "const": "system" },
        "timestamp": { "type": "string", "format": "date-time" },
        "payload": {
          "type": "object",
          "required": ["event"],
          "properties": {
            "event": { "enum": ["agent_online", "agent_offline", "qrcode_paused", "qrcode_activated", "session_expired"] },
            "data": { "type": "object" }
          }
        }
      }
    }
  ]
}
```

### P1.3 WebSocket 关闭码

| 码 | 名称 | 含义 | 客户端行为 |
|----|------|------|-----------|
| 1000 | normal_closure | 正常关闭 | 不重连 |
| 1001 | going_away | 服务端重启/维护 | 延迟 2s 后重连 |
| 4001 | missing_ticket | 建连缺少 ticket 参数 | 重新获取 ticket |
| 4003 | invalid_ticket | ticket 无效/已过期/已使用 | 重新获取 ticket |
| 4004 | qrcode_paused | 目标 QRCode 已暂停 | 展示"暂停服务"UI |
| 4005 | qrcode_not_found | QRCode 不存在 | 展示"无效链接"UI |
| 4008 | rate_limited | 建连频率超限 | 延迟 5s 后重试 |
| 4009 | session_expired | Session Token 已过期 | 重新获取 session |
| 4010 | duplicate_connection | 同一身份重复建连 | 不重连（旧连接已被替代） |
| 4429 | server_busy | 服务器负载过高 | 延迟 10s + 随机抖动后重试 |
| 4500 | internal_error | 服务器内部错误 | 延迟 5s 后重连 |

---

## §P2 REST API 完整规范

### P2.1 通用规约

```yaml
Base URL: https://gateway.qrclaw.ai/api/v1

Request Headers:
  Content-Type: application/json
  Accept: application/json
  X-Request-Id: <UUIDv7>              # 可选，用于链路追踪
  Authorization: Bearer <token>        # 按接口要求
  X-Session-Token: <session_token>     # Visitor 接口

Response Envelope:
  成功: { "data": { ... }, "meta": { ... } }
  失败: { "error": { "code": "...", "message": "...", "details": { ... } } }

Pagination:
  请求: ?cursor=<last_id>&limit=20
  响应: { "data": [...], "meta": { "cursor": "next_cursor", "has_more": true } }
```

### P2.2 Agent Ticket 接口

```yaml
POST /api/v1/agent/ws-ticket
Description: Agent 获取 WebSocket 建连凭证
Auth: Bearer <agent_api_key>
Rate Limit: 10 次/分钟/Agent

Request:
  Headers:
    Authorization: "Bearer sk_live_xxxxxx"

Response 201:
  {
    "data": {
      "ticket": "ws_a1b2c3d4e5f6",
      "expires_in": 30,
      "gateway_url": "wss://gateway.qrclaw.ai"
    }
  }

Response 401:
  { "error": { "code": "unauthorized", "message": "Missing or invalid Authorization header" } }

Response 403:
  { "error": { "code": "forbidden", "message": "API key is invalid or agent is deactivated" } }

Response 429:
  {
    "error": { "code": "rate_limited", "message": "Too many ticket requests" },
    "meta": { "retry_after_seconds": 60 }
  }
```

### P2.3 Visitor Ticket 接口

```yaml
POST /api/v1/visitor/ws-ticket
Description: Visitor 获取 WebSocket 建连凭证
Auth: X-Session-Token
Rate Limit: 10 次/分钟/Session

Request:
  Headers:
    X-Session-Token: "sess_xxxxxx"
  Body:
    {
      "qr_code_id": "uuid-of-qrcode"
    }

Response 201:
  {
    "data": {
      "ticket": "ws_f6e5d4c3b2a1",
      "expires_in": 30,
      "gateway_url": "wss://gateway.qrclaw.ai"
    }
  }

Response 400:
  { "error": { "code": "invalid_request", "message": "qr_code_id is required" } }

Response 403:
  { "error": { "code": "forbidden", "message": "Invalid session token" } }

Response 404:
  { "error": { "code": "qrcode_not_found", "message": "QR code does not exist" } }

Response 409:
  { "error": { "code": "qrcode_paused", "message": "This QR code is currently paused" } }
```

### P2.4 Visitor Session 接口

```yaml
POST /api/v1/visitor/session
Description: 创建或恢复 Visitor 会话
Auth: 无（匿名）或 Bearer <supabase_jwt>（桌面端绑定）
Rate Limit: 30 次/分钟/IP

Request:
  Body:
    {
      "qr_code_id": "uuid-of-qrcode",
      "fingerprint": "optional-device-fingerprint"
    }

Response 200 (已有会话):
  {
    "data": {
      "session_token": "sess_xxxxxx",
      "session_id": "uuid",
      "conversation_id": "uuid",
      "is_new": false,
      "expires_at": "2026-04-12T03:30:24.973Z"
    }
  }

Response 201 (新建会话):
  {
    "data": {
      "session_token": "sess_xxxxxx",
      "session_id": "uuid",
      "conversation_id": "uuid",
      "is_new": true,
      "expires_at": "2026-04-12T03:30:24.973Z"
    }
  }

Response 404:
  { "error": { "code": "qrcode_not_found", "message": "QR code does not exist" } }

Response 409:
  { "error": { "code": "qrcode_paused", "message": "This QR code is currently paused" } }
```

### P2.5 Visitor 消息接口（HTTP 降级）

```yaml
POST /api/v1/visitor/messages
Description: 通过 HTTP 发送消息（WS 不可用时的降级方案）
Auth: X-Session-Token
Rate Limit: 20 次/分钟/Session

Request:
  Headers:
    X-Session-Token: "sess_xxxxxx"
  Body:
    {
      "content": "Hello!",
      "content_type": "text",
      "message_id": "uuid-client-generated",
      "conversation_id": "uuid"
    }

Response 202:
  {
    "data": {
      "message_id": "uuid",
      "status": "sent",
      "sent_at": "2026-03-12T03:30:24.973Z"
    }
  }

Response 400:
  { "error": { "code": "invalid_request", "message": "content is required" } }

Response 413:
  { "error": { "code": "payload_too_large", "message": "Message exceeds 10000 characters" } }

Response 429:
  { "error": { "code": "rate_limited", "message": "Too many messages" } }

---

GET /api/v1/visitor/messages
Description: 拉取消息（轮询降级 / 离线消息恢复）
Auth: X-Session-Token
Rate Limit: 30 次/分钟/Session

Request:
  Headers:
    X-Session-Token: "sess_xxxxxx"
  Query:
    conversation_id: "uuid"
    cursor: "last-message-id"  (可选)
    limit: 20                   (默认 20，最大 100)
    after: "2026-03-12T00:00:00Z" (可选，时间过滤)

Response 200:
  {
    "data": [
      {
        "id": "uuid",
        "content": "decrypted plaintext",
        "content_type": "text",
        "sender_type": "agent",
        "sent_at": "2026-03-12T03:30:24.973Z",
        "status": "delivered"
      }
    ],
    "meta": {
      "cursor": "next-message-id",
      "has_more": true,
      "total": 42
    }
  }
```

### P2.6 Agent 注册接口

```yaml
POST /api/v1/agent/register
Description: Agent 首次注册（获取 API Key）
Auth: Bearer <supabase_jwt> (Owner)
Rate Limit: 5 次/小时/Owner

Request:
  Body:
    {
      "name": "My AI Agent",
      "description": "Customer support agent",
      "webhook_url": "https://my-agent.com/webhook",
      "capabilities": ["text", "markdown", "stream"]
    }

Response 201:
  {
    "data": {
      "agent_id": "uuid",
      "api_key": "sk_live_xxxxxx",
      "api_key_prefix": "sk_live_xxxx",
      "name": "My AI Agent",
      "status": "active",
      "created_at": "2026-03-12T03:30:24.973Z"
    }
  }

⚠️ api_key 仅在创建时返回一次，之后只能看到 prefix
```

### P2.7 QRCode 管理接口（Supabase Edge Functions）

```yaml
POST /api/v1/qrcodes
Description: 创建新 QRCode
Auth: Bearer <supabase_jwt> (Owner)

Request:
  Body:
    {
      "name": "Support Portal",
      "agent_id": "uuid",
      "greeting": "Hi! How can I help?",
      "language": "en",
      "theme": {
        "primary_color": "#6366f1",
        "avatar_url": "https://..."
      }
    }

Response 201:
  {
    "data": {
      "id": "uuid",
      "slug": "abc123",
      "status": "active",
      "profile_url": "https://qrclaw.ai/q/abc123",
      "qr_image_url": "https://qrclaw.ai/api/qr/abc123.png",
      "agent_id": "uuid",
      "config_version": 1,
      "created_at": "2026-03-12T03:30:24.973Z"
    }
  }

---

POST /api/v1/qrcodes/{id}/pause
POST /api/v1/qrcodes/{id}/activate
POST /api/v1/qrcodes/{id}/archive
Description: QRCode 状态变更
Auth: Bearer <supabase_jwt> (Owner)

Response 200:
  { "data": { "id": "uuid", "status": "paused", "updated_at": "..." } }

Response 404:
  { "error": { "code": "not_found", "message": "QR code not found" } }

Response 409:
  { "error": { "code": "invalid_transition", "message": "Cannot activate an archived QR code" } }
```

### P2.8 健康检查

```yaml
GET /api/v1/health
Description: Gateway 健康检查
Auth: 无

Response 200:
  {
    "data": {
      "status": "healthy",
      "version": "1.0.0",
      "uptime_seconds": 86400,
      "connections": {
        "websocket": 42,
        "agents": 5,
        "visitors": 37
      },
      "redis": "connected",
      "timestamp": "2026-03-12T03:30:24.973Z"
    }
  }

Response 503:
  {
    "data": {
      "status": "degraded",
      "redis": "disconnected",
      "message": "Redis circuit breaker OPEN"
    }
  }
```

---

## §P3 错误码全集

### P3.1 HTTP 错误码

| HTTP Status | Error Code | 含义 | 触发场景 |
|-------------|-----------|------|---------|
| 400 | `invalid_request` | 请求参数无效 | 缺少必填字段、格式错误 |
| 400 | `invalid_content_type` | content_type 不支持 | 非 text/markdown/image_url/file_url |
| 401 | `unauthorized` | 未提供认证信息 | 缺少 Authorization/X-Session-Token |
| 401 | `token_expired` | Token 已过期 | JWT 或 Session Token 过期 |
| 403 | `forbidden` | 无权限访问 | API Key 无效、RLS 拒绝 |
| 404 | `not_found` | 资源不存在 | QRCode/Agent/Conversation 不存在 |
| 404 | `qrcode_not_found` | QRCode 不存在 | slug 或 id 无效 |
| 409 | `qrcode_paused` | QRCode 已暂停 | 尝试访问已暂停的 QRCode |
| 409 | `invalid_transition` | 无效状态转换 | archived → active |
| 409 | `duplicate_message` | 消息 ID 重复 | 幂等去重 |
| 413 | `payload_too_large` | 请求体过大 | 消息超过 10000 字符 |
| 429 | `rate_limited` | 频率超限 | 超过接口限流阈值 |
| 500 | `internal_error` | 服务器内部错误 | 未预期异常 |
| 502 | `upstream_error` | 上游服务错误 | Supabase/Redis 不可用 |
| 503 | `service_unavailable` | 服务暂时不可用 | Redis 熔断、维护中 |

### P3.2 WebSocket 错误码（error 帧内）

| Error Code | 含义 | 触发场景 |
|-----------|------|---------|
| `message_too_large` | 消息超长 | content > 10000 chars |
| `invalid_message_format` | 消息格式错误 | JSON 解析失败或 Schema 不匹配 |
| `rate_limited` | 消息频率超限 | 超过 20 条/分钟/连接 |
| `agent_unreachable` | Agent 不在线 | 无活跃 Agent WS 连接 |
| `conversation_not_found` | 会话不存在 | conversation_id 无效 |
| `encryption_error` | 加密/解密失败 | DEK 不可用或密文损坏 |
| `persist_error` | 持久化失败 | DB 写入失败 |
| `stream_timeout` | 流式输出超时 | 30s 无新 chunk |
| `stream_aborted` | 流式输出中断 | Agent 断连或主动中断 |

---

## §P4 SDK 接入规范

### P4.1 Agent SDK TypeScript 接口

```typescript
// @qrclaw/agent-sdk — Agent 开发者使用的 SDK

interface QRClawAgentConfig {
  apiKey: string;           // sk_live_xxxxxx
  gatewayUrl?: string;      // 默认 wss://gateway.qrclaw.ai
  autoReconnect?: boolean;  // 默认 true
  maxReconnectAttempts?: number; // 默认 10
  heartbeatIntervalMs?: number;  // 默认 25000
}

interface QRClawAgent {
  // 生命周期
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // 消息处理
  onMessage(handler: (msg: IncomingMessage) => void): void;
  onStreamStart(handler: (stream: StreamSession) => void): void;
  send(conversationId: string, content: string, options?: SendOptions): Promise<SendResult>;
  sendStream(conversationId: string): StreamWriter;

  // 已读回执
  markAsRead(messageIds: string[]): void;

  // 事件
  on(event: 'connected' | 'disconnected' | 'error' | 'reconnecting', handler: Function): void;
}

interface IncomingMessage {
  id: string;               // UUIDv7
  conversationId: string;
  content: string;
  contentType: 'text' | 'image_url' | 'file_url';
  senderType: 'visitor';
  sentAt: string;            // ISO-8601
  securityEnvelope?: SecurityEnvelope;
}

interface SendOptions {
  contentType?: 'text' | 'markdown' | 'image_url' | 'file_url';
  metadata?: Record<string, unknown>;
}

interface SendResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: { code: string; message: string };
}

interface StreamWriter {
  write(delta: string): void;
  end(): Promise<SendResult>;
  abort(): void;
}

// 使用示例
import { createAgent } from '@qrclaw/agent-sdk';

const agent = createAgent({
  apiKey: process.env.QRCLAW_API_KEY!,
});

agent.onMessage(async (msg) => {
  console.log(`[${msg.conversationId}] Visitor: ${msg.content}`);

  // 简单回复
  await agent.send(msg.conversationId, 'Hello! How can I help?');

  // 或流式回复
  const stream = agent.sendStream(msg.conversationId);
  for await (const chunk of llmStream) {
    stream.write(chunk);
  }
  await stream.end();
});

await agent.connect();
```

### P4.2 Visitor 前端接入

```typescript
// 前端 GatewayClient — 给前端 Agent 使用

interface GatewayClientConfig {
  sessionToken: string;
  qrCodeId: string;
  gatewayUrl?: string;
  onMessage: (msg: GatewayMessage) => void;
  onStreamChunk: (chunk: StreamChunk) => void;
  onStreamEnd: (end: StreamEnd) => void;
  onAck: (ack: AckMessage) => void;
  onError: (error: ErrorMessage) => void;
  onSystemEvent: (event: SystemEvent) => void;
  onConnectionChange: (state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void;
}

class GatewayClient {
  constructor(config: GatewayClientConfig);

  // 生命周期
  async connect(): Promise<void>;  // 自动获取 ticket → WS 建连
  disconnect(): void;
  getState(): 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

  // 发送消息
  async send(content: string, options?: { contentType?: string }): Promise<string>; // returns message_id

  // 已读回执
  markAsRead(messageIds: string[]): void;

  // 降级策略（自动）
  // 1. WS 连接失败 → 自动尝试 SSE
  // 2. SSE 失败 → 自动降级到 HTTP 轮询
  // 3. 降级后自动尝试升级回 WS
}

// 使用示例（React）
function ChatWidget({ sessionToken, qrCodeId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const clientRef = useRef<GatewayClient>();

  useEffect(() => {
    const client = new GatewayClient({
      sessionToken,
      qrCodeId,
      onMessage: (msg) => setMessages(prev => [...prev, msg]),
      onStreamChunk: (chunk) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === chunk.id) {
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk.delta }];
          }
          return [...prev, { id: chunk.id, content: chunk.delta, sender: 'agent', streaming: true }];
        });
      },
      onStreamEnd: (end) => {
        setMessages(prev => prev.map(m => m.id === end.id ? { ...m, streaming: false } : m));
      },
      onAck: (ack) => { /* 更新消息状态 */ },
      onError: (err) => { /* 展示错误 */ },
      onSystemEvent: (evt) => { /* 处理系统事件 */ },
      onConnectionChange: (state) => { /* 更新 UI 连接状态 */ },
    });

    client.connect();
    clientRef.current = client;
    return () => client.disconnect();
  }, [sessionToken, qrCodeId]);

  const handleSend = async (text: string) => {
    const msgId = await clientRef.current!.send(text);
    setMessages(prev => [...prev, { id: msgId, content: text, sender: 'visitor', status: 'sending' }]);
  };

  return <ChatUI messages={messages} onSend={handleSend} />;
}
```

---

## §P5 协议版本管理

```yaml
版本策略:
  - URL 路径版本: /api/v1/, /api/v2/ ...
  - WebSocket 无版本路径，通过 connection_ack 的 protocol_version 字段协商
  - 向后兼容：新增字段不破坏旧客户端
  - 破坏性变更：启用新版本路径，旧版本至少维护 6 个月

当前版本:
  REST API: v1
  WebSocket Protocol: 1.0
  Agent SDK: @qrclaw/agent-sdk@1.x
```

---

## §P6 辩论修正补充（第三轮共识）

### P6.1 新增帧类型：stream_abort

```json
{
  "title": "stream_abort",
  "description": "流式输出中断通知（Gateway → Client）",
  "type": "object",
  "required": ["type", "id", "timestamp", "payload"],
  "properties": {
    "type": { "const": "stream_abort" },
    "id": { "type": "string", "format": "uuid", "description": "与原流共享的 message_id" },
    "timestamp": { "type": "string", "format": "date-time" },
    "payload": {
      "type": "object",
      "required": ["conversation_id", "reason"],
      "properties": {
        "conversation_id": { "type": "string", "format": "uuid" },
        "reason": { "enum": ["agent_disconnected", "timeout", "gateway_shutdown", "protocol_error"] },
        "partial_content": { "type": "string", "description": "可选，已发送的部分内容" },
        "chunks_sent": { "type": "integer", "description": "已发送的 chunk 数" }
      }
    }
  }
}
```

### P6.2 流式中断恢复策略（MVP）

```yaml
策略: 全量重发（Resend Whole Stream）

Gateway 行为:
  - Agent WS 断连 → 立即向 Visitor 发送 stream_abort
  - 不缓存未完成的流式分片
  - Agent 重连后不尝试恢复旧流

Agent SDK 行为:
  - 收到 stream_abort 后，必须生成全新 message_id
  - 重新发送完整流（stream_chunk* → stream_end）
  - 不得尝试续传旧流

前端行为:
  - 收到 stream_abort → 将原气泡标记为中断
  - 收到新流（新 message_id）→ 渲染新气泡
  - 不得将新流拼接到旧流

Growth 演进:
  - 可选支持断点续传（需 StreamBuffer checkpoint）
  - 协议版本升级至 v2.0.0
```

### P6.3 §P0 协议权威声明

```yaml
协议权威层级:

  Level 1（唯一真相源）:
    - §P1-P6 为帧结构、错误码、状态机的唯一真相源
    - protocol_version: "1.0.0"
    - 所有 SDK、Gateway、前端必须以此为准

  Level 2（实现章节）:
    - §5/§7/§12 降级为实现说明，只允许引用 §P
    - 示例代码必须标注"参见 §P1.x 完整定义"

  Level 3（示例代码）:
    - 仅作为帮助理解的"报文快照"
    - 冲突时以 Level 1 为准

  版本管理: Semver（breaking change = 主版本升级）
```

### P6.4 消息状态模型拆层（辩论修正）

```yaml
DB 层（messages 表）:
  persistence_status: "buffered" | "persisted" | "failed"
  # 仅反映持久化状态

投递层（message_deliveries 表，新增）:
  CREATE TABLE message_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid REFERENCES messages(id),
    target_type text CHECK (target_type IN ('agent', 'visitor')),
    target_id text NOT NULL,
    status text CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    error_code text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  # 对外 ACK 状态从此表读取

MVP 实现范围:
  - sent + delivered: 必须实现
  - read: 表结构预留，代码不实现
  - failed + error_code: 必须实现
```

### P6.5 限流 429 帧增强

```json
{
  "title": "error_429",
  "description": "限流错误帧（含 retry_after）",
  "type": "object",
  "required": ["type", "timestamp", "payload"],
  "properties": {
    "type": { "const": "error" },
    "timestamp": { "type": "string", "format": "date-time" },
    "payload": {
      "type": "object",
      "required": ["code", "message", "retry_after_ms"],
      "properties": {
        "code": { "const": "rate_limited" },
        "message": { "type": "string" },
        "retry_after_ms": { "type": "integer", "minimum": 1000, "description": "客户端应等待的毫秒数" }
      }
    }
  }
}
```

前端退避策略:
```typescript
// 写入 §9 实现章节
const backoff = {
  base: retryAfterMs,  // 服务端建议值
  max: 30000,          // 最大 30 秒
  jitter: 0.2,         // ±20% 随机抖动
  maxAttempts: 3,      // 连续 3 次失败展示排队 UI
};
```

---

## §P7 第四轮辩论修正（R4, 5 轮三模型辩论, 2026-03-12）

> 以下内容基于第四轮三模型辩论（Claude Opus 4.6 + GPT 5.4 + Gemini 3.1 Pro）的 11 项共识。

### P7.1 消息状态双表模型（替代 P6.4 简化版）

P6.4 的 `message_deliveries` 定义过于简化。以下为 R4 共识的完整 DDL：

```sql
-- ============================================
-- messages 表重定义：不可变的摄入事实（写入即终态）
-- ============================================
-- 注意：移除原有的 status/reason 字段，持久化后即为终态
ALTER TABLE messages DROP COLUMN IF EXISTS status;
ALTER TABLE messages DROP COLUMN IF EXISTS reason;

-- 新增字段
ALTER TABLE messages ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_meta JSONB NOT NULL DEFAULT '{}';
-- encryption_meta 格式: {"alg":"aes-256-gcm","iv":"base64...","tag":"base64...","dek_id":"uuid"}

COMMENT ON TABLE messages IS 
  '不可变的消息摄入记录。写入成功 = 持久化完成（终态）。
   不包含投递状态，投递状态在 message_deliveries 表。';

-- ============================================
-- message_deliveries 表（R4 完整版，替代 P6.4）
-- ============================================
CREATE TABLE message_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('visitor', 'agent')),
  target_id     TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'dispatched', 'acked', 'failed', 'expired'))
                DEFAULT 'pending',
  attempt_no    INTEGER NOT NULL DEFAULT 1,
  fail_reason   TEXT,
  dispatched_at TIMESTAMPTZ,
  acked_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_message ON message_deliveries(message_id);
CREATE INDEX idx_deliveries_pending ON message_deliveries(status) WHERE status = 'pending';

COMMENT ON TABLE message_deliveries IS
  'MVP: 每条 message 仅 1 条 delivery（单目标单端）。
   重试时更新同一行的 attempt_no 和 status。
   Growth: 同一 message 可多条 delivery（多端投递），改为追加新行。';
```

### P7.2 ACK 双层分离模型（替代原 ack 定义）

```yaml
消息生命周期（两层分离）:

  Layer 1 — 摄入确认（Gateway → 发送方，同步响应）:
    触发时机: Gateway 收到消息后的即时响应
    载体: WS ack 帧 或 HTTP 202
    状态值:
      - persisted:     消息已加密写入 messages 表 → 前端 ✓ 单灰勾
      - duplicate:     幂等去重命中（idempotency_key 冲突）
      - rejected:      拒绝接收，附 error_code:
          - qrcode_disabled (403)
          - quota_exceeded (429)
          - invalid_session (401)
          - message_too_large (413)

  Layer 2 — 投递状态（Gateway → 发送方，异步推送）:
    触发时机: Gateway 尝试将消息投递给目标后的异步通知
    载体: WS ack 帧（type: "ack"）
    状态值:
      - dispatched:    消息已推入目标 WS 缓冲区 → 前端 ✓✓ 双灰勾
      - acked:         目标已确认接收（MVP 不实现，预留）
      - failed:        投递失败，附 fail_reason:
          - agent_unreachable: Agent 无活跃 WS 连接
          - target_disconnected: 投递过程中目标断连
```

**前端 UI 状态机映射**:

| 内部状态 | 触发条件 | UI 表现 | 业务含义 |
|---------|---------|---------|---------|
| `0_sending` | 消息刚发出 | ⏳ 透明单勾 | 本地已发出，网络传输中 |
| `1_persisted` | 收到 ack.persisted | ✓ 实心单灰勾 | 平台已安全存储 |
| `2_dispatched` | 收到 ack.dispatched | ✓✓ 双灰勾 | 已推入 Agent 连接 |
| `3_failed` | 收到 ack.failed | ⚠️ 红色感叹号 + [重试] | 投递失败 |
| `rejected` | 收到 ack.rejected | 🚫 + 错误文案 | 被拒绝，不可重试 |

### P7.3 Owner 历史消息解密路径（Edge Function）

```yaml
POST /functions/v1/get-decrypted-messages:
  Description: Owner 拉取解密后的历史消息
  Auth: Bearer <supabase_jwt> (Owner, 经 RLS 验证)
  Rate Limit: 30 次/分钟/Owner

  Request Body:
    conversation_id: uuid (required)
    cursor: string (last-message-id, optional)
    limit: integer (default 50, max 100)

  Response 200:
    data:
      - id: uuid
        content: string  # 解密后明文
        sender_type: visitor | agent
        persisted_at: ISO-8601
    meta:
      cursor: string | null
      has_more: boolean

  实现流程:
    1. 验证 JWT → 确认 Owner 身份
    2. RLS 确认 Owner 有权访问该 conversation
    3. 从 Supabase Vault 读取 KEK
    4. 内存中: KEK 解密 DEK → DEK 解密 content_encrypted
    5. 返回明文
    6. 函数执行完毕, 明文/DEK 随内存释放

  架构原则修订:
    原文: "Owner 侧操作直连 Supabase，不经 Gateway"
    修订: "Owner 侧操作直连 Supabase，不经 Gateway。
           唯一例外: 加密内容解密通过 Supabase Edge Function，
           Edge Function 属于 Supabase 生态，不经过 Gateway。"
```

### P7.4 Redis 故障 Fail-fast 行为矩阵

```yaml
Redis 故障行为矩阵（MVP, Redis 为强依赖）:

  新 HTTP 请求:
    → HTTP 503 Service Unavailable
    → Header: Retry-After: 30
    → Body: { "error": { "code": "service_unavailable" } }

  新 WS 建连:
    → 拒绝握手, 返回 HTTP 503

  已有 WS 连接:
    → 发送 error 帧: { type: "error", payload: { code: "service_degraded" } }
    → 30 秒内发送 close(1013, "try again later")
    → 绝不将限流/去重/路由压力穿透至 Supabase DB

  前端行为:
    → 收到 503/close(1013) → 显示"服务暂时不可用"横幅
    → 禁用消息输入框
    → 指数退避重试（1s → 2s → 4s → ... → 30s max）

  熔断器参数:
    FAILURE_THRESHOLD: 5 (连续失败次数)
    RECOVERY_TIMEOUT_MS: 30000 (半开探测间隔)
    PING_INTERVAL_MS: 2000 (探测频率)
    连续 3 次 PING 成功 → HALF_OPEN → CLOSED
```

### P7.5 Gateway 数据库访问白名单

```yaml
Gateway 可访问表（白名单, 应用层强制）:
  messages:             INSERT（写入密文）
  message_deliveries:   INSERT / UPDATE（记录投递状态）
  conversations:        SELECT / UPDATE（查询和更新对话元数据）
  encryption_keys:      SELECT / INSERT（获取或创建 DEK）
  sessions:             SELECT（验证 session_token）
  qrcodes:              SELECT（查询 QRCode 配置和路由）

Gateway 禁止访问表:
  owners:               完全禁止
  agents:               通过 Redis 缓存验证, 不直接查表
  usage_logs:           通过 Edge Function 写入

实现: GatewaySupabaseClient 仓储类 + CI grep 门禁
CI 规则: gateway/src/ 下禁止直接使用 createClient, 必须经过 GatewaySupabaseClient
```

### P7.6 ws_ticket 完整生命周期

```yaml
首次建连:
  1. POST /api/v1/visitor/ws-ticket (X-Session-Token) → { ticket, expires_in: 30 }
  2. wss://gateway.qrclaw.ai/ws?ticket=<ticket>
  3. Gateway: Redis GETDEL ws_ticket:<ticket> (原子核销)
     ├─ 命中 → connection_ack
     └─ 未命中 → close(4003, "invalid_ticket")

重连场景:
  1. 用 session_token 重新调用 POST /api/v1/visitor/ws-ticket → 新 ticket
  2. 用新 ticket 建连
  3. 建连后调用 GET /api/v1/visitor/messages?after=<last_seen_id> 补拉消息

安全约束:
  - ticket 严格单次使用（GETDEL 原子操作）
  - ticket TTL 30 秒
  - 同一 session 同时只允许 1 个活跃 WS 连接
  - 重复建连 → close(4010, "duplicate_connection"), 旧连接被替代
```

### P7.7 字段迁移对照表（主文档 → §P）

| 主文档旧字段/端点 | §P 正确字段/端点 | CI 阻断规则 |
|------------------|----------------|------------|
| `wss://...?session_token=` | `wss://...?ticket=` | grep `session_token.*ws` |
| `/api/ws/ticket` | `/api/v1/visitor/ws-ticket` | grep `api/ws/ticket` |
| `reply_chunk` | `stream_chunk` | grep `reply_chunk` |
| `reply` (帧类型) | `agent_message` | grep context-aware |
| `is_final` | `stream_end` (独立帧) | grep `is_final` |
| `accepted/rejected` | `persisted/rejected` (L1) | grep `accepted.*ack` |
| `messages.status` | 已移除(拆到双表) | grep `messages\.status` |
| `messages.reason` | `message_deliveries.fail_reason` | grep `messages\.reason` |

### P7.8 RLS 审计矩阵

| 表 | 角色 | SELECT | INSERT | UPDATE | DELETE | 策略条件 |
|---|---|---|---|---|---|---|
| messages | Owner | ✅ | ❌ | ❌ | ❌ | `conversation.qrcode.agent.owner_id = auth.uid()` |
| messages | Gateway (service_role) | ✅ | ✅ | ❌ | ❌ | 应用层白名单控制 |
| message_deliveries | Owner | ✅ | ❌ | ❌ | ❌ | 同 messages |
| message_deliveries | Gateway | ✅ | ✅ | ✅ | ❌ | 应用层白名单控制 |
| conversations | Owner | ✅ | ❌ | ❌ | ✅ | `qrcode.agent.owner_id = auth.uid()` |
| conversations | Gateway | ✅ | ✅ | ✅ | ❌ | 应用层白名单控制 |
| qrcodes | Owner | ✅ | ✅ | ✅ | ❌ | `agent.owner_id = auth.uid()` |
| qrcodes | Gateway | ✅ | ❌ | ❌ | ❌ | 只读配置 |
| encryption_keys | Owner | ❌ | ❌ | ❌ | ✅ | 仅通过 Edge Function 间接操作 |
| encryption_keys | Gateway | ✅ | ✅ | ❌ | ❌ | 应用层白名单控制 |
| owners | Owner | ✅ | ❌ | ✅ | ❌ | `user_id = auth.uid()` |
| owners | Gateway | ❌ | ❌ | ❌ | ❌ | **完全禁止** |
| agents | Owner | ✅ | ✅ | ✅ | ✅ | `owner_id = auth.uid()` |
| agents | Gateway | ❌ | ❌ | ❌ | ❌ | 通过 Redis 缓存验证 |
| sessions | Owner | ❌ | ❌ | ❌ | ❌ | 无需访问 |
| sessions | Gateway | ✅ | ✅ | ✅ | ❌ | 应用层白名单控制 |

### P7.9 StreamBuffer 背压与快速失败

```typescript
// StreamBuffer 核心修正（R4 共识 C7+C8）
class StreamBuffer {
  private readonly MAX_ACTIVE_BUFFERS = 500;
  private readonly BACKPRESSURE_THRESHOLD = 0.8; // 80% 触发背压

  // C7: 快速失败 — 落库失败立即丢弃，不在内存重试
  private async flush(messageId: string, status: MessageStatus) {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return;
    try {
      await storeEncryptedMessage({ /* ... */ });
    } catch (err) {
      logger.error(`[StreamBuffer] Persist failed: ${messageId}`, err);
      // 通知 Visitor: stream_abort
      buffer.visitorWs.send(JSON.stringify({
        type: 'stream_abort', id: messageId,
        payload: { reason: 'persist_error', conversation_id: buffer.conversationId }
      }));
      // 通知 Agent: 请用新 message_id 重新生成
      this.notifyAgentResend(buffer.conversationId, messageId);
    } finally {
      this.buffers.delete(messageId); // 无论成功失败都释放内存
    }
  }

  // C8: 背压 — 活跃 buffer 达 80% 上限时暂停 Agent WS 读取
  private checkBackpressure() {
    if (this.buffers.size > this.MAX_ACTIVE_BUFFERS * this.BACKPRESSURE_THRESHOLD) {
      for (const agentWs of this.activeAgentConnections) {
        agentWs.pause(); // Node.js ws 库原生支持
      }
      logger.warn(`[StreamBuffer] Backpressure ON: ${this.buffers.size} buffers`);
    }
  }
}
```

### P7.10 CI 门禁规则汇总

```yaml
# 所有门禁规则集中声明，写入 .github/workflows/lint.yml

门禁 1 — 阻断 DB 层加密残留:
  grep -rn 'pgp_sym_encrypt|pgp_sym_decrypt|pgcrypto' --include='*.sql' --include='*.ts'

门禁 2 — 阻断旧字段名:
  grep -rn 'reply_chunk|is_final|session_token.*ws|api/ws/ticket|messages\.status|messages\.reason'
    --include='*.ts' --include='*.tsx' gateway/src/ web/src/

门禁 3 — 阻断 Gateway 直接使用 Supabase Client:
  grep -rn 'createClient|supabase\.from(' gateway/src/ --include='*.ts'
    | grep -v 'gateway-supabase-client'

门禁 4 — 阻断日志中的敏感字段:
  grep -rn 'content.*log|session_token.*log|api_key.*log|\.dek.*log'
    --include='*.ts' gateway/src/
```
