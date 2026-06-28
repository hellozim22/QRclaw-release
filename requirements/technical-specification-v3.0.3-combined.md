# QRClaw V3.0.3 技术方案（含补充章节 — 四轮辩论优化版·终稿）

以下包含：
1. 原始技术方案 V3.0
2. 测试策略补充章节（§T1-T8，含四轮辩论修正）
3. 前后端协议完整规范（§P1-P7，含四轮辩论修正）

四轮辩论评分演进：7.0 → 7.5 → 8.5 → 9.0 → **9.2**（共识落地后预期 9.5+）
辩论总量：48 轮（10+15+8+5+报告生成），三模型共识 22+ 项

---

# QRClaw 技术方案文档 V3.0

> **版本**: V3.0
> **日期**: 2026-03-11
> **状态**: 开发基线版
> **配套文档**: 《QRClaw 产品需求文档 V3.0》(`product-requirements.md`)
> **目标读者**: Gateway Team / Frontend Team / Backend Team / SDK Team / QA Team

---

## 📚 目录

### [一、技术概述](#一技术概述)
- 1.1 产品技术架构总览
- 1.2 技术原则与约束
- 1.3 四条铁律的技术体现（v1.3）

### [二、系统架构](#二系统架构)
- 2.1 整体系统拓扑
- 2.2 组件职责
- 2.3 Gateway 职责边界

### [三、消息存储策略](#三消息存储策略)
- 3.1 存储字段与用途
- 3.2 加密保护（AES-256 信封加密）
- 3.3 留存期（套餐差异化）

### [四、WebSocket 连接设计](#四websocket-连接设计)
- 4.1 Agent → Gateway 连接
- 4.2 Visitor → Gateway 连接
- 4.3 心跳与重连

### [五、消息路由管线](#五消息路由管线)
- 5.1 Visitor → Agent 正向管线
- 5.2 消息格式
- 5.3 ACK 状态枚举

### [六、事件系统](#六事件系统)

### [七、流式输出协议](#七流式输出协议)
- 7.1 Agent → Gateway 分片消息
- 7.2 Gateway → Visitor 降级
- 7.3 超时保护
- 7.4 降级兼容
- 7.5 流式输出消息持久化

### [八、前后端通信协议](#八前后端通信协议)
- 8.1 通信架构总览
- 8.2 认证传递方案
- 8.3 API 路由边界表
- 8.4 CORS 配置
- 8.5 前端客户端配置

### [九、Gateway 容灾与高可用](#九gateway-容灾与高可用)
- 9.1 MVP 低成本容灾
- 9.2 前端优雅降级
- 9.3 Growth 阶段架构

### [十、安全与合规](#十安全与合规)
- 10.1 安全设计总纲
- 10.2 OWASP Top 10 分析
- 10.3 Security Envelope 协议
- 10.4 认证四层模型
- 10.5 三级限流
- 10.6 加密内容存储边界
- 10.7 用户隐私声明
- 10.8 安全事件与应急响应

### [十一、数据库 Schema](#十一数据库-schema)
- 11.1 表结构总览
- 11.2 关键设计决策
- 11.3 核心数据库函数
- 11.4 数据留存策略
- 11.5 数据安全架构

### [十二、API 合约](#十二api-合约)
- 12.1 接口总览
- 12.2 QRCode 创建 API
- 12.3 QRCode 状态变更 API

### [十三、技术选型](#十三技术选型)

### [十四、部署架构](#十四部署架构)
- 14.1 部署拓扑
- 14.2 前后端分离
- 14.3 服务器配置
- 14.4 域名与 DNS
- 14.5 CDN 配置
- 14.6 成本估算
- 14.7 扩展路径
- 14.8 部署阶段计划

### [十五、统一认证实现](#十五统一认证实现)
- 15.1 JWT 验证模块
- 15.2 Session 分配服务
- 15.3 POST /visitor/session 行为矩阵
- 15.4 前端 StartChatButton 组件
- 15.5 数据库索引补充

### [十六、i18n 技术实现](#十六i18n-技术实现)
- 16.1 Next.js App Router i18n 方案
- 16.2 middleware.ts 路由重写
- 16.3 组件使用示例
- 16.4 后端国际化
- 16.5 SEO 多语言

### [十七、OpenClaw 兼容性设计](#十七openclaw-兼容性设计)
- 17.1 架构定位
- 17.2 OpenClaw Agent 环境分析
- 17.3 Agent 接入兼容方案
- 17.4 WebSocket 兼容性保障
- 17.5 安全策略对齐
- 17.6 多 Agent 生态拓展性
- 17.7 实施计划
- 17.8 OpenClaw 版本兼容基线

---


## 一、技术概述

### 1.1 产品技术架构总览

> 以下三张架构图由 Python `diagrams` 库自动生成，源文件位于 `requirements/diagrams/`

**图 1：产品技术架构总览**

![QRClaw 产品技术架构](diagrams/product-architecture.png)

**图 2：消息路由流**

![QRClaw 消息路由流](diagrams/message-flow.png)

**图 3：Agent 接入流程（skill.md）**

![QRClaw Agent 接入流程](diagrams/agent-onboarding.png)

### 1.2 技术原则与约束

| 原则 | 说明 |
|------|------|
| **独立产品 + 生态兼容** | QRClaw 保持独立技术栈，通过 SKILL.md + API 协议层兼容 OpenClaw 等 Agent 生态（详见 §17） |
| **前端直连 Supabase** | Owner 侧操作（Dashboard CRUD）直连 Supabase，不经 Gateway |
| **Gateway 只负责实时通信** | WebSocket 路由、消息转发、Session 管理 |
| **JWT Bearer 认证** | 无跨域 Cookie，统一 Bearer Token |
| **信封加密** | 消息内容使用 AES-256-GCM 加密存储，KEK→DEK→Data 三层 |
| **V2 单实例 Gateway** | MVP 阶段使用单台 CVM，PM2 管理，日快照容灾 |
| **Agent 主动建连** | 参照 EvoMap 模式，Agent 通过 Skill.md 自主发现服务并建立 WebSocket 连接（独立于 Agent 平台的 WS） |

### 1.3 四条铁律的技术体现（v1.3 生效于 2026-04-20）

| 铁律 | 定义 | 技术实现 |
|------|------|---------|
| **C1 中立中继** | QRClaw 不执行任何 AI 推理 / 不解读消息语义 | Gateway 仅接收、加密、持久化、转发；不调用 LLM；不对 content 做任何基于内容的路由或改写 |
| **C2 加密存储** | 平台持久化的消息必须是密文；明文只存在于两处：(a) 端侧客户端（visitor / owner / agent-plugin）；(b) 已授权的 Edge Function `decrypted-messages` 内存态——不落盘、不写日志、函数结束即释放缓存 | `content_encrypted`（AES-256-GCM，DEK 由 KEK 包装）；Gateway **写路径**持 KEK 加密新消息，**读路径**不再解密（M3 起）；Supabase Edge Function 是唯一被授权的服务端解密点 |
| **C4 移动端零注册** | 移动端 Visitor 无需注册 | Session Token 标识；桌面端要求 auth.users 记录 |
| **C5 消息可回放** | 任一身份（visitor / owner / agent-plugin）在断线、换机、重启后重新连接时，都能拿回断线期间及历史上的消息 | (1) Visitor: `POST /api/messages` → Edge Function `decrypted-messages`；(2) Owner: JWT → `functions/v1/decrypted-messages`（M3 从 `get-decrypted-messages` 合并而来）；(3) Agent-Plugin: `POST /api/agent/history` → Edge Function `decrypted-messages`（M3 新增） |

> **历史说明**：v1.2 之前是"三条铁律（C1 纯转发 / C2 平台存储 / C4）"。C1 被重定义为"中立中继"（不再暗示"不持久化"）；C2 措辞在 v1.3 再次收紧——显式穷举明文允许存在的 2 个边界（客户端 + Edge Function 内存态），堵住 M3 Edge Function 解密造成的语义歧义；C5 为新增。迁移决策详见 `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §1.3。


## 二、系统架构

### 5.1 整体系统拓扑

```
用户浏览器
    │
    ├── HTTPS ──→ Vercel 全球 CDN ──→ Next.js SSR/SSG
    │              (qrclaw.ai)         前端：Landing + Dashboard + Auth
    │
    └── WSS ───→ 腾讯云 CDN ──→ 腾讯云 CVM（新加坡）
                 (gateway.qrclaw.ai)
                   ├── Gateway (Node.js + ws) — PM2 管理
                   ├── Redis Standalone — 去重/限流/Pub/Sub/心跳
                   └── Nginx — 反向代理 + SSL 终结
                         │
                         ▼ (<5ms 同区)
                   Supabase（新加坡）
                   ├── PostgreSQL — DB + RLS
                   ├── Auth — Owner 认证 + JWT
                   ├── Edge Functions — QRCode CRUD / Stats
                   ├── Storage — 头像 / QR 图片
                   └── 内置邮件服务 — 认证邮件 / Claim 通知

                   ┌────────────┐
                   │   Agent    │   WSS
                   │  (Owner)   │◀────────────────────────────────────┐
                   │ OpenClaw   │                                     │
                   │ 或其他框架  │   腾讯云 CVM (gateway.qrclaw.ai) ──┘
                   └────────────┘
```

**设计决策：前后端分离部署。前端 Vercel 托管（零运维 + 全球 CDN + Next.js 原生支持），后端腾讯云 CVM 新加坡（与 Supabase 同区，延迟 <5ms）。详见十一B。

### 5.2 组件职责

| 组件 | 职责 | 数据所有权 | 有状态/无状态 |
|------|------|-----------|-------------|
| **Vercel** | 前端托管（Next.js SSR/SSG）、全球 CDN、自动 SSL | 无 | 无状态 |
| **腾讯云 CDN** | WSS 回源、DDoS 防护、静态缓存 | 无 | 无状态 |
| **Gateway** | WS 管理、消息路由、security_envelope 注入、限流、去重、消息持久化 | 消息内容 | 有状态（连接） |
| **Redis Standalone** | ws_ticket 核销、幂等去重、三级限流、Pub/Sub 路由、Session 映射、心跳（故障策略：Fail-fast 熔断，返回 503） | 临时（TTL） | 有状态 |
| **Supabase PostgreSQL** | Owner/Agent/QRCode/Conversation/**消息**持久化 | 持久 | 有状态 |
| **Supabase Auth** | Owner 认证、JWT 发放刷新、邮箱验证 | 认证凭据 | 有状态 |
| **Supabase Edge Functions** | QRCode CRUD API、QR 生成、统计、Claim | 无 | 无状态 |
| **Supabase Storage** | 头像 / QR 图片 | 持久 | 有状态 |
| **Agent SDK** | WS 建连、消息收发、security_envelope 解析 | Agent 侧历史 | 有状态 |
| **Visitor Client** | 渐进式连接、消息收发、本地历史（IndexedDB） | 客户端缓存 | 有状态 |

### 5.3 Gateway 职责边界（四条铁律 v1.3）

#### C1 中立中继：转发 + 加密持久化，不做语义解读

✅ 持久化优先的尽力投递（先加密落库再异步转发）
✅ 跨设备同步（消息存储到 PostgreSQL）
✅ 降级可用（WebSocket → SSE → HTTP Poll）
✅ **不**调用任何 LLM；**不**对 content 做基于内容的路由或改写

#### C2 加密存储：纯消息路由，不干预对话

**Gateway 的唯一职责**：消息转发 + 元数据管理

✅ **允许的协议层注入**（不算"改写"）：
  - `security_envelope`（安全策略，协议层字段）
  - `context`（QRCode配置：system_prompt, visitor_identity, style_config）
  - `metadata`（conversation_id, message_index, timestamp）

❌ **禁止的内容层干预**（这才是"改写"）：
  - 修改 Visitor 发送的 `content` 字段
  - 删除或过滤 Visitor 消息中的词汇
  - 拦截或重写 Agent 回复内容
  - 基于消息内容做推荐/分析/审核

**危险Prompt过滤**：
  - 过滤时机：QRCode **创建时**检查 `system_prompt`
  - 拦截规则：禁止 "ignore all previous instructions"、SQL注入模式、越狱提示词
  - **运行时不修改** Visitor 的 `content`

**清晰边界**：
  - `system_prompt` 是 **QRCode配置**，不是 Visitor 消息的一部分
  - `security_envelope` 是 **协议层字段**，与 `content` 平级（不是嵌入content内部）
  - 传递格式：`{content: "...", context: {...}, security_envelope: {...}}`

**类比**：
  - HTTP Header（协议层）✅
  - 修改 HTTP Body（内容层）❌

#### C3: 零托管推理，Agent 自主

❌ 不托管 LLM 调用
❌ 不生成/下发 greeting 消息（Agent 自主决定）
❌ 不做离线留言缓存
✅ Agent 掉线 → Visitor 实时看到"连接中断"
✅ Agent 主权完整保留



## 三、消息存储策略

> ⚠️ QRClaw **不是纯管道**。消息内容使用信封加密（AES-256-GCM）存储，用于跨设备同步和历史记录。
> Gateway 存储加密后的消息，但不读取、不分析、不用于推荐或模型训练。
>
> ⚠️ **加解密在 Gateway Node.js 层执行**（非数据库层）：使用 `crypto.createCipheriv('aes-256-gcm', dek, iv)` 实现真正的 AES-256-GCM。
> 密文格式：`[IV 12B][AuthTag 16B][Ciphertext]`。明文永远不进入数据库层。
> 数据库 `messages.content_encrypted` 字段类型为 `bytea`，存储加密后的 Buffer。

### 5.4 消息存储策略

**存储内容**：
```sql
messages 表字段：
  - conversation_id (关联对话)
  - content_encrypted (加密的消息内容，bytea)
  - encryption_key_id (Per Conversation密钥)
  - role (visitor/agent)
  - message_id (幂等键)
  - sent_at (时间戳)
```

**用途**：
- ✅ 跨设备同步（手机/电脑/平板看到同一历史）
- ✅ Visitor 登录后合并历史
- ✅ GDPR 合规删除

**不用于**：
- ❌ 内容分析
- ❌ 推荐算法
- ❌ 模型训练

**加密保护**：
- 字段级 AES-256 加密（pgcrypto）
- Per Conversation 密钥隔离
- 用户删除 → 密钥销毁 → 永久无法恢复

**留存期**：1年自动清理（详见 9.4 数据留存策略）



## 四、WebSocket 连接设计

### 5.5 WebSocket 连接设计

**Agent → Gateway**：每个 Agent 1 条 WS 长连接，承载该Agent所有 QRCode 的消息。

| 参数 | 正常 Agent | 未 Claim Agent |
|------|-----------|---------------|
| 心跳间隔 | 60 秒 | 30 秒 |
| 心跳超时 | 90 秒 | 45 秒 |
| 最大连接数 | 1 连接/Agent | 1 连接/Agent |
| 最大帧大小 | 64 KB | 64 KB |
| 重连退避 | 1s→2s→4s→...→30s(max) | 同上 |

**Visitor → Gateway**：渐进式降级

```
检测 User-Agent
├── 微信内置浏览器 → SSE + POST（Level 2）
└── 其他现代浏览器
    ├── 尝试 WebSocket（3s 超时）
    │   ├── 成功 → Level 1: 全双工 WS
    │   └── 失败 → 尝试 SSE（3s 超时）
    │       ├── 成功 → Level 2: SSE + POST
    │       └── 失败 → Level 3: HTTP 轮询（2s 间隔）
```

**Visitor WS 连接认证（ws_ticket 阅后即焚机制）：

```
安全问题：长效 Token 放在 WS URL query 参数中会被 Nginx/CDN 日志记录，存在泄露风险。
解决方案：采用短效 ws_ticket 阅后即焚机制。

Step 1: Visitor 前端先通过 HTTP 换取短效 ticket
  POST /api/ws/ticket
  Header: Authorization: Bearer <JWT or Session Token>
  Response: { ticket: "uuid", expires_in: 30 }
  
  Gateway 将 ticket 存入 Redis: ws_ticket:{uuid} → {userId, sessionToken}, TTL=30s

Step 2: Visitor 用 ticket 建立 WS 连接
  连接 URL: wss://gateway.qrclaw.ai/ws?ticket=<uuid>

认证流程：
  1. Gateway 从 URL 参数提取 ticket
  2. 查 Redis: ws_ticket:{ticket}
  3. 命中 → 立即删除 Redis Key（阅后即焚）→ 建立连接
  4. 未命中（过期或已用）→ 关闭连接（code: 4002, "Invalid or expired ticket"）

安全特性：
  - Ticket 30 秒过期，严格单次使用
  - 即使 Nginx/CDN 记录了 URL，ticket 已被核销无法重放
  - Nginx access log 配置对 ?ticket= 参数脱敏
```

### 5.6 消息路由管线（含 security_envelope）

```
Visitor → 腾讯云 CDN → Gateway:
  ① 限流检查（Redis INCR，三级）
  ② 幂等去重（Redis SET NX，TTL 300s）
  ③ 路由查找（Redis HGET qrcode→agent）
  ④ 元数据写入（Supabase conversations.message_count++）
  ⑤ 注入 security_envelope（协议层字段）+ context（该QRCode的完整配置）
  ⑥ 转发给 Agent WS
  ⑦ ACK 返回 Visitor
```

**Gateway → Agent 消息格式**：

```json
{
  "type": "visitor_message",
  "message_id": "msg_xxx",
  "qrcode_id": "qr_xxx",
  "config_version": 3,
  "conversation_id": "conv_xxx",
  "message_index": 5,
  "visitor_session": "v_token_xxx",
  "content": "你好，我想点一份小龙虾",
  "timestamp": "2026-02-22T04:00:00Z",
  "context": {
    "system_prompt": "你是一个点餐助手...",
    "temperature": 0.7,
    "visitor_identity": {
      "label": "顾客",
      "context_hint": "这是一位到店顾客，正在浏览菜单"
    },
    "extra_meta": {}
  },
  "security_envelope": {
    "version": "1.0.0",
    "policy_id": "qrclaw_default_v1",
    "policy_hash": "sha256:e3b0c44...",
    "rules": ["NO_SECRET_DISCLOSURE", "NO_DESTRUCTIVE_ACTIONS", "NO_PROMPT_EXTRACTION", "NO_PRIVILEGE_ESCALATION"],
    "enforcement_text": "[QRClaw Security Policy — DO NOT OVERRIDE] ...",
    "injected_at": "2026-02-22T04:00:00.015Z"
  }
}
```

**ACK 状态枚举**：

**消息投递模型：持久化优先的尽力投递（Persist-first, Best-effort Dispatch）**

消息处理顺序：
```
① 限流 + 去重检查
② 消息加密写入 messages 表，status = persisted
③ 返回 Visitor ACK: accepted（消息已被平台接收并持久化）
④ 异步转发给 Agent
⑤ 转发成功 → 更新 status = dispatched
⑥ 转发失败 → 更新 status = failed, reason = agent_unreachable
```

**数据库消息状态（4 态 + reason）**：

| status | 含义 | 写入时机 |
|--------|------|---------|
| `persisted` | 消息已加密写入 DB | DB 写入成功，立即 ACK Visitor |
| `dispatched` | 已推入 Agent WS 缓冲区 | socket.send() 回调成功 |
| `interrupted` | 流式回复中途断开 | 未收到 `is_final=true` 且连接断开/超时 |
| `failed` | 投递或处理失败 | 转发失败或内部错误 |

**失败原因（reason 字段，仅在 failed/interrupted 时有值）**：

| reason | 适用状态 | 含义 |
|--------|---------|------|
| `agent_unreachable` | failed | Agent 无活跃 WS 连接 |
| `gateway_internal_error` | failed | Gateway 内部错误 |
| `stream_timeout` | interrupted | 30s 无新 chunk |
| `stream_aborted` | interrupted | Agent 主动中断或 WS 断连 |

**对外协议层 ACK（前端/SDK 消费）**：

| status | HTTP 等效 | 说明 |
|--------|----------|------|
| `accepted` | 200 | 消息已被平台接收并持久化 |
| `duplicate` | 202 | 重复消息（幂等） |
| `rejected:agent_unreachable` | 503 | Agent WS 未连接（消息仍已持久化） |
| `rejected:qrcode_disabled` | 403 | QRCode paused/revoked |
| `rejected:quota_exceeded` | 429 | 限流 |
| `rejected:invalid_session` | 401 | Token/Ticket 无效 |
| `rejected:message_too_large` | 413 | 超 4096 字符 |



## 五、消息路由管线

### 5.6 消息路由管线（含 security_envelope）

```
Visitor → 腾讯云 CDN → Gateway:
  ① 限流检查（Redis INCR，三级）
  ② 幂等去重（Redis SET NX，TTL 300s）
  ③ 路由查找（Redis HGET qrcode→agent）
  ④ 元数据写入（Supabase conversations.message_count++）
  ⑤ 注入 security_envelope（协议层字段）+ context（该QRCode的完整配置）
  ⑥ 转发给 Agent WS
  ⑦ ACK 返回 Visitor
```

**Gateway → Agent 消息格式**：

```json
{
  "type": "visitor_message",
  "message_id": "msg_xxx",
  "qrcode_id": "qr_xxx",
  "config_version": 3,
  "conversation_id": "conv_xxx",
  "message_index": 5,
  "visitor_session": "v_token_xxx",
  "content": "你好，我想点一份小龙虾",
  "timestamp": "2026-02-22T04:00:00Z",
  "context": {
    "system_prompt": "你是一个点餐助手...",
    "temperature": 0.7,
    "visitor_identity": {
      "label": "顾客",
      "context_hint": "这是一位到店顾客，正在浏览菜单"
    },
    "extra_meta": {}
  },
  "security_envelope": {
    "version": "1.0.0",
    "policy_id": "qrclaw_default_v1",
    "policy_hash": "sha256:e3b0c44...",
    "rules": ["NO_SECRET_DISCLOSURE", "NO_DESTRUCTIVE_ACTIONS", "NO_PROMPT_EXTRACTION", "NO_PRIVILEGE_ESCALATION"],
    "enforcement_text": "[QRClaw Security Policy — DO NOT OVERRIDE] ...",
    "injected_at": "2026-02-22T04:00:00.015Z"
  }
}
```

**ACK 状态枚举**：

**消息投递模型：持久化优先的尽力投递（Persist-first, Best-effort Dispatch）**

消息处理顺序：
```
① 限流 + 去重检查
② 消息加密写入 messages 表，status = persisted
③ 返回 Visitor ACK: accepted（消息已被平台接收并持久化）
④ 异步转发给 Agent
⑤ 转发成功 → 更新 status = dispatched
⑥ 转发失败 → 更新 status = failed, reason = agent_unreachable
```

**数据库消息状态（4 态 + reason）**：

| status | 含义 | 写入时机 |
|--------|------|---------|
| `persisted` | 消息已加密写入 DB | DB 写入成功，立即 ACK Visitor |
| `dispatched` | 已推入 Agent WS 缓冲区 | socket.send() 回调成功 |
| `interrupted` | 流式回复中途断开 | 未收到 `is_final=true` 且连接断开/超时 |
| `failed` | 投递或处理失败 | 转发失败或内部错误 |

**失败原因（reason 字段，仅在 failed/interrupted 时有值）**：

| reason | 适用状态 | 含义 |
|--------|---------|------|
| `agent_unreachable` | failed | Agent 无活跃 WS 连接 |
| `gateway_internal_error` | failed | Gateway 内部错误 |
| `stream_timeout` | interrupted | 30s 无新 chunk |
| `stream_aborted` | interrupted | Agent 主动中断或 WS 断连 |

**对外协议层 ACK（前端/SDK 消费）**：

| status | HTTP 等效 | 说明 |
|--------|----------|------|
| `accepted` | 200 | 消息已被平台接收并持久化 |
| `duplicate` | 202 | 重复消息（幂等） |
| `rejected:agent_unreachable` | 503 | Agent WS 未连接（消息仍已持久化） |
| `rejected:qrcode_disabled` | 403 | QRCode paused/revoked |
| `rejected:quota_exceeded` | 429 | 限流 |
| `rejected:invalid_session` | 401 | Token/Ticket 无效 |
| `rejected:message_too_large` | 413 | 超 4096 字符 |


### 5.7 事件系统

| 事件 | 方向 | 触发条件 | 说明 |
|------|------|---------|------|
| `visitor_joined` | G→A | Visitor 进入 Chat 页 | 含 is_returning, previous_message_count |
| `visitor_left` | G→A | Visitor 断开/60s 无活动 | 清理 |
| `processing_status` | A→G→V | Agent 发送 | status: processing/searching/generating/idle |
| `conversation_created` | G→A | 24h 超时或 Visitor 新开 | 新 conversation_id |



## 六、事件系统

### 5.7 事件系统

| 事件 | 方向 | 触发条件 | 说明 |
|------|------|---------|------|
| `visitor_joined` | G→A | Visitor 进入 Chat 页 | 含 is_returning, previous_message_count |
| `visitor_left` | G→A | Visitor 断开/60s 无活动 | 清理 |
| `processing_status` | A→G→V | Agent 发送 | status: processing/searching/generating/idle |
| `conversation_created` | G→A | 24h 超时或 Visitor 新开 | 新 conversation_id |

### 5.8 流式输出协议

**设计原则**：真流式输出，从 Agent 直接透传，不是前端模拟打字机效果。



## 七、流式输出协议

### 5.8 流式输出协议

**设计原则**：真流式输出，从 Agent 直接透传，不是前端模拟打字机效果。

#### 5.7.1 Agent → Gateway（分片消息）

```json
{
  "type": "reply_chunk",
  "message_id": "msg_xxx",
  "conversation_id": "conv_xxx",
  "qrcode_id": "qr_xxx",
  "chunk": "你好",
  "chunk_index": 0,
  "is_final": false,
  "timestamp": "2026-03-06T09:42:00Z"
}
```

**最后一片**（标记结束）：
```json
{
  "type": "reply_chunk",
  "message_id": "msg_xxx",
  "chunk": "",
  "is_final": true
}
```

#### 5.7.2 Gateway → Visitor（渐进式降级）

| 连接类型 | 实现方式 | 延迟 |
|---------|---------|------|
| **WebSocket** | 原样转发 chunk，无缓冲 | <50ms |
| **SSE** | `event: chunk\ndata: {...}\n\n` | <100ms |
| **HTTP Poll** | 返回累积内容 + `{"streaming": true, "complete": false}` | 2s 轮询间隔 |

#### 5.7.3 Visitor 体验流程

```
0秒：消息上墙 → ✓ 已发送
0.5秒：Gateway 确认 → ✓✓ 已送达
1秒：AI气泡出现，显示 ● ● ● (波浪动画，无文字)
1.5秒：第一个 chunk 到达 → 立即开始逐字显示
持续：chunk 实时追加，字字浮现
完成：收到 is_final=true → 显示完成状态 + 时间戳
```

**波浪动画样式**（三个点上下浮动）：
```css
@keyframes wave {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}

.dot {
  animation: wave 1.4s infinite;
  opacity: 0.6;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
```

#### 5.7.4 超时保护

| 时间点 | Gateway 行为 | Visitor 看到 |
|--------|-------------|-------------|
| 30秒无新chunk | 发送超时事件 | "回复中断，[重试] 或 [查看备用信息]" |
| Agent WS断连 | 立即通知Visitor | "连接中断，正在重连..." |
| 60秒仍无响应 | 标记消息失败 | 红色 ⚠️ 标识 + "发送失败，[点击重试]" |

#### 5.7.5 降级兼容

**不支持流式的Agent**：
- Agent 发送完整 `reply` 消息（非 `reply_chunk`）
- Gateway 识别后整条返回给 Visitor
- Visitor 看到的是：1秒波浪动画 → 整条消息一次性出现
- 体验略逊于流式，但功能正常

---

### 5.9 三层破冰方案

```
第1层（即时 — Profile 页面）：
  suggested_questions 区域（Portal 配置，≤3条）
  "Try asking: 今日有什么推荐？"

第2层（即时 — Chat 页面）：
  灰色系统提示：Send a message to start the conversation
  纯 UI 引导，不经过 Gateway

第3层（异步 — Agent 欢迎语）：
  Gateway 发送 visitor_joined 事件 → Agent 自主决定是否发 greeting
  0~3 秒内 Agent 回复，用户体验自然
```

### 5.10 可扩展性方案

| 阶段 | 并发 | 架构 | 月成本 |
|------|------|------|--------|
| **MVP (<10K)** | 腾讯云 CVM 2核4G（新加坡）+ Redis Standalone + Vercel + Supabase Free/Pro | 垂直扩展 | ¥200-400 |
| **Growth (10K-100K)** | CVM 升配 4核8G → 多台 Gateway + Redis Cluster + Vercel Pro | 水平扩展 | ¥2,000-5,000 |
| **Scale (100K-1M)** | Gateway 集群 + Kafka 消息总线 + Router Service 解耦 + 读写分离 + Supabase 自建 | 微服务 | ¥15,000-30,000 |

---


### 7.5 流式输出消息持久化

## 五D、流式输出消息持久化

> 补充 §5.8 流式输出协议的存储层设计，以及 §5.6 缺失的 Agent→Visitor 反向存储管线。

### 5D.1 架构概览

```
Agent (LLM) ──reply_chunk──→ Gateway ──ws.send──→ Visitor（实时转发）
                                │
                          StreamBuffer
                          (内存拼接 by message_id)
                                │
                          is_final / 超时 / 断连
                                │
                                ▼
                     store_encrypted_message()
                          → messages 表（加密存储）
```

### 5D.2 Gateway 缓冲拼接策略

```typescript
class StreamBuffer {
  private buffers = new Map<string, {
    chunks: string[];
    totalBytes: number;
    conversationId: string;
    qrcodeId: string;
    visitorWs: WebSocket;
    lastChunkAt: number;
    createdAt: number;
  }>();

  private readonly MAX_BUFFER_SIZE = 256 * 1024;  // 256KB
  private readonly CHUNK_TIMEOUT_MS = 30_000;       // 30s
  private readonly MAX_ACTIVE_BUFFERS = 500;

  constructor() {
    // 每 5s 检查超时
    setInterval(() => this.checkTimeouts(), 5000);
  }

  /** 收到 Agent reply_chunk */
  handleChunk(messageId: string, chunk: string, isFinal: boolean, meta: ChunkMeta) {
    let buffer = this.buffers.get(messageId);

    if (!buffer) {
      if (this.buffers.size >= this.MAX_ACTIVE_BUFFERS) {
        this.flushOldest('partial');
      }
      buffer = {
        chunks: [], totalBytes: 0,
        conversationId: meta.conversationId,
        qrcodeId: meta.qrcodeId,
        visitorWs: meta.visitorWs,
        lastChunkAt: Date.now(),
        createdAt: Date.now(),
      };
      this.buffers.set(messageId, buffer);
    }

    // 追加内容
    const chunkBytes = Buffer.byteLength(chunk, 'utf8');
    if (buffer.totalBytes + chunkBytes > this.MAX_BUFFER_SIZE) {
      // 超限：截断并存储
      this.flush(messageId, 'partial');
      return;
    }

    buffer.chunks.push(chunk);
    buffer.totalBytes += chunkBytes;
    buffer.lastChunkAt = Date.now();

    // 实时转发给 Visitor（零延迟）
    buffer.visitorWs.send(JSON.stringify({
      type: 'reply_chunk', message_id: messageId,
      chunk, is_final: isFinal
    }));

    // 最终片段 → 持久化
    if (isFinal) {
      this.flush(messageId, 'complete');
    }
  }

  /** Agent WS 断连 → 持久化所有该 Agent 的活跃 buffer */
  handleAgentDisconnect(agentId: string) {
    for (const [msgId, buf] of this.buffers) {
      if (this.getAgentId(buf) === agentId) {
        this.flush(msgId, 'interrupted');
        buf.visitorWs.send(JSON.stringify({
          type: 'stream_interrupted', message_id: msgId
        }));
      }
    }
  }

  /** 超时检查 */
  private checkTimeouts() {
    const now = Date.now();
    for (const [msgId, buf] of this.buffers) {
      if (now - buf.lastChunkAt > this.CHUNK_TIMEOUT_MS) {
        this.flush(msgId, 'partial');
        buf.visitorWs.send(JSON.stringify({
          type: 'stream_timeout', message_id: msgId
        }));
      }
    }
  }

  /** 持久化并清理 */
  private async flush(messageId: string, status: MessageStatus) {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return;

    const fullText = buffer.chunks.join('');
    await storeEncryptedMessage({
      conversationId: buffer.conversationId,
      content: fullText,
      role: 'agent',
      messageId,
      status,
    });

    this.buffers.delete(messageId);
  }
}

type MessageStatus = 'complete' | 'partial' | 'interrupted';
```

### 5D.3 messages 表 Schema 变更

```sql
-- 新增 status 字段（向后兼容，默认 'complete'）
ALTER TABLE messages
  ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'
  CHECK (status IN ('complete', 'partial', 'interrupted'));

-- 索引：查询不完整消息（排查/重试）
CREATE INDEX idx_messages_incomplete ON messages(status)
  WHERE status != 'complete';
```

### 5D.4 Agent→Visitor 反向存储管线（补充 §5.6）

```
Agent → Gateway:
  ① Agent WS 收到 reply_chunk
  ② StreamBuffer.handleChunk() — 追加到内存缓冲区
  ③ 实时转发 chunk 给 Visitor WS（零延迟）
  ④ 判断是否终结：
     ├─ is_final=true  ──→ flush('complete') → store_encrypted_message()
     ├─ 30s 超时 ───────→ flush('partial')   → store_encrypted_message()
     ├─ Agent 断连 ────→ flush('interrupted') → store_encrypted_message()
     └─ 超 256KB ──────→ flush('partial')     → store_encrypted_message() + 截断通知

Agent 发送完整 reply（非流式兼容）:
  ① Agent WS 收到 reply（完整消息）
  ② 直接 store_encrypted_message(status='complete')
  ③ 转发给 Visitor WS
```

### 5D.5 超时与异常参数

| 参数 | 值 | 说明 |
|---|---|---|
| `CHUNK_TIMEOUT_MS` | 30,000 (30s) | 上一个 chunk 后 30s 无新 chunk |
| `MAX_BUFFER_SIZE` | 262,144 (256KB) | 单条消息最大缓冲 |
| `MAX_ACTIVE_BUFFERS` | 500 | 全局活跃缓冲区上限 |
| 检查频率 | 每 5s | `setInterval` 扫描所有活跃 buffer |

---



## 八、前后端通信协议

## 五B、前后端通信协议

> **决策结论**：采用方案 A — 前端直连 Supabase + Gateway，不做 API 代理层。JWT Bearer Token 认证，无跨域 Cookie 依赖。

### 5B.1 通信架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端 (qrclaw.ai / Vercel)                     │
│                                                                     │
│  Next.js App  ──┬──  supabase-js  ──→  Supabase (新加坡)            │
│                 │                       • Auth (登录/注册)           │
│                 │                       • Edge Functions (QR CRUD)   │
│                 │                       • Storage (QR图片/头像)       │
│                 │                                                    │
│                 └──  fetch / WS  ──→  Gateway (gateway.qrclaw.ai)   │
│                                       • REST: 访客会话/消息          │
│                                       • WSS: 实时消息+流式输出       │
└─────────────────────────────────────────────────────────────────────┘
```

**路由原则**：

| 流量类型 | 走向 | 原因 |
|---------|------|------|
| Owner 侧（已认证用户操作） | **Supabase 直连** | RLS 保护 + 零后端代码 + 全球 CDN |
| Visitor 侧（匿名扫码用户） | **Gateway REST/WS** | 无需 Supabase 账号、需实时路由、需流式输出 |
| 文件上传/下载 | **Supabase Storage** | 签名 URL + CDN 加速 |

### 5B.2 认证传递方案

#### Owner 侧 — Supabase JWT

```
前端 supabase.auth.getSession() → access_token (JWT)
                                    │
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
        Supabase API                            Gateway API（如需）
   (自动附带 Bearer Header)              (手动附带 Authorization Header)
        RLS 自动校验                      Gateway 用 JWKS 公钥验证
```

**关键：不依赖 Cookie，全程 Bearer Token，无跨域 Cookie 问题。**

#### Visitor 侧 — Session Token

```
访客扫码 → POST /visitor/session { qrcode_id }
         ← { session_token, user_id }

后续请求：
  Header:  X-Session-Token: <session_token>
  WS:      wss://gateway.qrclaw.ai/ws?session_token=<session_token>
```

### 5B.3 API 路由边界表

#### Supabase 直连（Owner 侧）

| 功能 | 方式 | 认证 |
|------|------|------|
| 注册/登录 | `supabase.auth` | — |
| QRCode 列表/详情 | `supabase.from('qrcodes').select()` | JWT + RLS |
| 创建 QRCode | Edge Function `create-qrcode` | JWT |
| 更新 QRCode 配置 | `supabase.from('qrcodes').update()` | JWT + RLS |
| 上传头像 | `supabase.storage.from('assets').upload()` | JWT |
| 统计面板 | `supabase.rpc('get_dashboard_stats')` | JWT + RLS |
| 获取历史消息 | `supabase.rpc('get_conversation_messages')` | JWT + RLS |

#### Gateway REST（Visitor 侧）

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/v1/visitor/session` | `POST` | 创建/获取 Session Token | 无（匿名）或 JWT（桌面端） |
| `/api/v1/visitor/messages` | `POST` | 发送消息 | `X-Session-Token` |
| `/api/v1/visitor/messages` | `GET` | 获取历史消息（轮询回退） | `X-Session-Token` |
| `/api/v1/health` | `GET` | 健康检查 | 无 |

#### Gateway WebSocket（实时对话）

| 端点 | 描述 |
|------|------|
| `wss://gateway.qrclaw.ai/ws?session_token=<token>` | Visitor 实时消息收发 + AI 流式输出 |

### 5B.4 CORS 配置

#### Gateway CORS 策略

| Header | 值 |
|--------|---|
| `Access-Control-Allow-Origin` | `https://qrclaw.ai` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Authorization, Content-Type, X-Session-Token, X-Request-Id` |
| `Access-Control-Allow-Credentials` | `false`（不用 Cookie） |
| `Access-Control-Max-Age` | `86400` |

#### Nginx 配置示例

```nginx
# /etc/nginx/conf.d/gateway.qrclaw.ai.conf
server {
    listen 443 ssl http2;
    server_name gateway.qrclaw.ai;

    ssl_certificate     /etc/letsencrypt/live/gateway.qrclaw.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.qrclaw.ai/privkey.pem;

    # CORS 预检
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' 'https://qrclaw.ai';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Session-Token, X-Request-Id';
        add_header 'Access-Control-Max-Age' 86400;
        return 204;
    }

    add_header 'Access-Control-Allow-Origin' 'https://qrclaw.ai' always;

    # REST API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
}
```

### 5B.5 前端客户端配置

```typescript
// lib/supabase/client.ts — Supabase 直连
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

```typescript
// lib/gateway.ts — Gateway 客户端
const GATEWAY_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL!;

export class GatewayClient {
  private sessionToken: string | null = null;

  async createSession(qrcodeId: string, jwt?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    const res = await fetch(`${GATEWAY_BASE}/api/v1/visitor/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ qrcode_id: qrcodeId }),
    });
    const data = await res.json();
    this.sessionToken = data.session_token;
    return data;
  }

  connectWS(): WebSocket {
    return new WebSocket(
      `wss://gateway.qrclaw.ai/ws?session_token=${this.sessionToken}`
    );
  }

  async sendMessage(sessionId: string, content: string) {
    return fetch(`${GATEWAY_BASE}/api/v1/visitor/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': this.sessionToken!,
      },
      body: JSON.stringify({ session_id: sessionId, content }),
    });
  }
}
```

---



## 九、Gateway 容灾与高可用

## 五C、Gateway 容灾与高可用

### 5C.1 MVP 低成本容灾（单实例，目标 99.5%）

#### 腾讯云定时快照

| 配置项 | 值 |
|---|---|
| 快照策略 | 每日 03:00 GMT+8 自动快照 |
| 保留份数 | 最近 7 份（滚动覆盖） |
| 覆盖范围 | 系统盘 50GB |
| 恢复 RTO | < 10 min（从快照回滚创建新 CVM） |

> 成本：腾讯云快照按容量计费，50GB 约 ¥15/月。

#### 云监控告警

| 告警规则 | 阈值 | 持续时间 | 通知渠道 |
|---|---|---|---|
| CPU 使用率 | > 85% | 5 min | 企业微信 + 邮件 |
| 内存使用率 | > 90% | 3 min | 企业微信 + 邮件 |
| PM2 进程消失 | < 1 | 1 min | 企业微信 + 短信 |
| 磁盘使用 > 90% | — | 1 min | 企业微信 + 短信 |
| TCP 连接数 | > 5000 | 3 min | 企业微信 |

#### UptimeRobot 外部拨测

```
Monitor: HTTPS
URL: https://gateway.qrclaw.ai/health
Interval: 60s
Keyword: "ok"
Alert: 企业微信群 Webhook + 邮件
```

Gateway `/health` 端点：

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memoryMB: Math.floor(process.memoryUsage().rss / 1024 / 1024),
    wsConnections: wss.clients.size,
    redisConnected: redis.isReady,
    timestamp: Date.now()
  });
});
```

#### PM2 自启动

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'qrclaw-gateway',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '3G',
    error_file: '/var/log/qrclaw/gateway-error.log',
    out_file: '/var/log/qrclaw/gateway-out.log',
  }]
};

// 开机自启：pm2 startup systemd && pm2 save
```

#### 15-min 恢复 Runbook

```
T+0min   收到告警（UptimeRobot / 云监控）
  │
  ▼
T+1min   SSH 登录 CVM → pm2 status → pm2 logs --lines 50
  │
  ├── 进程崩溃 → pm2 restart              ──→ T+2min 恢复
  ├── OOM → sudo reboot（PM2 自启动恢复）   ──→ T+5min 恢复
  ├── SSH 不可达 → 腾讯云控制台回滚快照      ──→ T+12min 恢复
  └── 代码 Bug → git revert + rebuild      ──→ T+10min 恢复

恢复后检查：
  □ /health 返回 ok
  □ WebSocket 连接数恢复
  □ Redis PING 成功
  □ #ops 频道发送恢复通告
```

### 5C.2 前端优雅降级

```typescript
class ChatConnection {
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 5;
  private readonly DELAYS = [1000, 2000, 4000, 8000, 15000];

  connect(url: string) {
    const ws = new WebSocket(url);

    ws.onclose = () => {
      if (this.reconnectAttempts < this.MAX_RECONNECT) {
        const delay = this.DELAYS[this.reconnectAttempts] ?? 15000;
        this.showReconnecting(delay);
        setTimeout(() => { this.reconnectAttempts++; this.connect(url); }, delay);
      } else {
        this.showMaintenanceBanner();
      }
    };

    ws.onopen = () => { this.reconnectAttempts = 0; this.hideAllBanners(); };
  }

  private showMaintenanceBanner() {
    // 渲染: "🔧 服务暂时维护中，请稍后刷新页面重试" + [刷新页面] 按钮
    // 禁用消息输入框
  }
}
```

**降级状态机**：`Connected ──ws.close──→ Reconnecting(1..5) ──全部失败──→ Maintenance`

### 5C.3 Growth 阶段架构（日活 >1000 时升级）

```
                        ┌──────────────────┐
                        │  腾讯云 CLB       │
                        │  WebSocket        │
                        │  sticky session   │
                        └────┬────────┬─────┘
                             │        │
                    ┌────────▼──┐  ┌──▼────────┐
                    │  CVM-A    │  │  CVM-B    │
                    │  Gateway  │  │  Gateway  │
                    └────┬──────┘  └──────┬────┘
                         │                │
                    ┌────▼────────────────▼────┐
                    │   Redis Sentinel (3节点)  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │     Supabase PostgreSQL    │
                    └──────────────────────────┘
```

> **升级触发条件**：月营收 > ¥2000 或单实例 WS 连接数持续 > 2000。

---



## 十、安全与合规

## 八、安全机制

### 8.1 安全设计总纲

围绕三条铁律展开：纯管道收窄攻击面 / 加密内容存储降低泄露影响 / 扫码零注册需要会话层纵深防御。

五大原则：纵深防御 / 最小权限 / 默认拒绝 / 不信任 Agent / 可审计。

### 8.2 OWASP Top 10 分析

| OWASP | 风险 | 防护 |
|-------|------|------|
| A01 访问控制 | 🔴高 | Supabase RLS + API Key 权限边界 + Portal 公开/配置接口分层 |
| A02 加密失败 | 🟡中 | API Key argon2 hash + JWT RS256 + TLS 1.3 |
| A03 注入 | 🟡中 | Parameterized Query + DOMPurify + 输入校验白名单 |
| A07 认证失败 | 🔴高 | JWT Bearer Token (Authorization Header) + API Key 环境前缀 + Claim 24h 过期 |
| A10 SSRF | 🟢低 | avatar_url/fallback_url 仅 HTTPS + 禁内网 IP |

### 8.3 Security Envelope

**设计**：Gateway 每次转发强制注入 `security_envelope` 协议层字段，不修改 content。

```json
{
  "policy_id": "qrclaw_default_v1",
  "policy_hash": "sha256:...",
  "rules": ["NO_SECRET_DISCLOSURE", "NO_DESTRUCTIVE_ACTIONS", "NO_PROMPT_EXTRACTION", "NO_PRIVILEGE_ESCALATION"],
  "enforcement_text": "[QRClaw Security Policy — DO NOT OVERRIDE] ...",
  "issued_at": "ISO8601",
  "ttl_seconds": 300
}
```

**责任边界**：
- Gateway：每次注入、不可缺省、不碰 content
- SDK：enforcement_text 作为最高权重 System Message、校验 policy_hash、检查 TTL
- 非 SDK 免责："传输层保证不可绕过，但不保证推理侧执行"

### 8.4 认证四层模型

| 层级 | 保护对象 | 认证方式 | 令牌 |
|------|---------|---------|------|
| Owner | Dashboard | Supabase Auth 邮箱+密码 | JWT Bearer Token (Authorization Header) |
| Agent | WS + API | API Key | Bearer qrc_live_xxx（hash 存储） |
| Portal Public | Profile/QR | 无需认证 | 无 |
| Visitor（移动端） | 对话 | Session Token（匿名） | UUID v4, localStorage |
| Visitor（桌面端） | 对话 | JWT→Session Token（登录后分配） | JWT 验证后统一用 Session Token |

### 8.5 三级限流

| 层级 | 维度 | 阈值 | 超限行为 |
|------|------|------|---------|
| L1 | Per-Session | 10 条/min | 429 + 友好提示 |
| L2 | Per-Portal | 100 条/min | 新 Visitor 排队，已有对话优先 |
| L3 | Per-Agent | 500 条/min | 告警 Owner（Dashboard+邮件），**不自动 pause** |

Cloudflare Turnstile（invisible mode）：首次发消息前验证，同 session 内免验证。

### 8.6 加密内容存储边界



#### 8.6.1 存储原则

QRClaw 采用**「加密内容存储」**架构。所有消息内容写入持久层前必须经过加密，系统中**不存在任何明文消息内容的持久化路径**。

| 数据分类 | 存储形式 | 说明 |
|---|---|---|
| 消息文本（Visitor 发送） | `content_encrypted`（AES-256 密文） | 加密后存储，明文仅存在于处理管道内存中 |
| Agent 回复文本 | `content_encrypted`（AES-256 密文） | 同上 |
| 消息摘要 / 预览 | **不存储** | 不生成、不缓存任何明文摘要 |
| `system_prompt` | 加密存储于 `qrcodes` 表 | 按需解密加载 |
| 结构化元数据 | 明文存储 | `message_id`, `conversation_id`, `role`, `sent_at`, `status` 等 |
| 加密密钥（DEK） | 信封加密（被 KEK 加密后存储） | 详见 §9.5 |

#### 8.6.2 明文生存期约束

```
消息到达 ──→ [内存] 路由处理 ──→ [内存] 加密 ──→ [磁盘] 密文
                    │                        │
                    └── 明文最大生存期 ≤ 单次请求周期（通常 < 30s）──┘
```

**硬性约束**：
- 明文消息**不写入**任何磁盘、日志文件、临时文件
- Gateway 日志中**禁止**记录 `content` 和 `system_prompt`
- Redis 去重键 value="1"，不含消息体
- 崩溃转储在生产环境必须禁用或自动加密

#### 8.6.3 安全声明

- ✅ 数据库中不包含任何可直接用于解密消息的明文密钥（信封加密）
- ✅ 解密需同时具备 KEK 访问权限（由独立于数据库的密钥管理系统控制）
- ⚠️ **MVP 阶段已知限制**：KEK 以环境变量方式注入应用进程，具备服务器 root 权限的攻击者理论上可从进程内存中提取 KEK（此风险将在 GA 版本通过外部 KMS 集成消除，记录于安全风险登记簿 Risk-SEC-003）

### 8.7 用户隐私声明

> **面向终端用户的消息数据保护声明模板**

1. **加密存储**：所有消息内容使用 AES-256 算法加密后存储。明文仅在处理期间短暂存在于服务器内存中。
2. **密钥隔离**：加密密钥与加密数据分离存储（信封加密），数据库中不包含可直接解密消息的明文密钥。
3. **不存储的内容**：不生成、不存储消息明文摘要或预览。应用日志中不记录消息内容。
4. **数据保留**：加密消息根据套餐保留策略（Free 60 天 / Pro 1 年 / Max 永久）自动清理。密钥销毁后永久不可恢复。
5. **访问控制**：仅授权 AI Agent 可解密关联消息。QRClaw 运维人员的数据库访问权限不包含消息解密能力。
6. **第三方说明**：QRClaw 不控制第三方 LLM 提供商（如 OpenAI、Anthropic）对消息内容的处理方式，请参阅其隐私政策。

### 8.8 安全事件与应急响应

- CRITICAL 事件（API Key 泄露/policy_hash 不匹配）：15 分钟内响应
- HIGH 事件（DDoS/批量注册/L3 限流持续触发）：30 分钟内响应
- 安全日志不含密码/api_key 全文/消息内容

---



## 十一、数据库 Schema

> ⚠️ QRCode 状态枚举已更新：`active / paused / revoked / draft`（详见《产品需求文档》§三）

## 九、数据库 Schema

> 完整 SQL 详见：`requirements/database-schema-v2.md`

### 9.1 表结构总览

| 表 | 用途 | 关键字段 |
|---|---|---|
| **owners** | Owner 业务属性（与 auth.users 分离） | user_id, display_name, email |
| **agents** | AI Agent 实例 | owner_id, api_key_hash, status(pending/active/suspended), ws_connected |
| **qrcodes** | 二维码配置（独立配置单元） | agent_id, slug(≥12), status(active/paused/revoked), profile, system_prompt, visitor_identity, style_config, suggested_questions, security_policy_id, config_version |
| **sessions** | Visitor Session Token（支持 Silent Merge） | session_token, user_id(nullable), bound_at, expires_at |
| **conversations** | 对话元数据 | qrcode_id, session_token, message_count, last_active_at |
| **messages** | 消息内容（跨设备同步） | conversation_id, content, role(visitor/agent), message_id, sent_at |
| **usage_logs** | 事件日志（按月分区） | agent_id, event_type, counted_at |

### 9.2 关键设计决策

- **UUIDv7** 替代 UUIDv4（时间有序，B-tree 友好）
- **bigint** 所有计数器（防溢出）
- **text** 替代 varchar（无 255 陷阱）
- **timestamptz** 替代 timestamp（带时区）
- **RLS 全覆盖**：7 表均 `ENABLE + FORCE ROW LEVEL SECURITY`
- **部分索引**：`WHERE status != 'revoked'`
- **usage_logs 按月分区**：12 个初始分区 + default 兜底

### 9.3 核心数据库函数

| 函数 | 用途 |
|------|------|
| `silent_merge_session()` | 登录静默合并（幂等 + 冲突 409） |
| `create_conversation_if_expired()` | 24h 超时新建对话 |
| `record_message()` | 消息内容 + 元数据记录 |
| `cleanup_expired_sessions()` | 过期 Session 清理 |
| `cleanup_unclaimed_agents()` | 未认领 Agent 24h 回收 |
| `cleanup_old_messages()` | 1 年过期消息自动删除 |
| `delete_conversation_messages()` | 用户删除整个对话（GDPR 合规） |
| `create_usage_log_partition()` | 自动创建月分区 |

### 9.4 数据留存策略

| 数据类型 | 留存期 | 删除方式 |
|---------|--------|---------|
| **消息内容** | 1 年 | 自动清理（`cleanup_old_messages()` cron job） |
| **对话元数据** | 1 年 | 随最后一条消息删除 |
| **Session Token** | 30 天未活跃 | `cleanup_expired_sessions()` |
| **用户主动删除** | 立即 | `delete_conversation_messages()` 级联删除 |

**付费扩展:
- Free 60 天 / Pro 1 年 / Max 永久存储（详见 §6D.2）
- 导出对话记录 JSON/CSV（Max 套餐，P2）

### 9.5 数据安全架构

**安全目标**：传输层 + 存储层双重加密，防止数据泄露，保障用户隐私。

#### 9.5.1 传输层安全

```
┌─────────────┐  WSS/TLS 1.3   ┌─────────────┐  WSS/TLS 1.3   ┌─────────────┐
│  Visitor    │ ═════════════> │   Gateway   │ ═════════════> │   Agent     │
│  (浏览器)    │ <═════════════ │ (腾讯云CVM) │ <═════════════ │ (OpenClaw)  │
└─────────────┘                └─────────────┘                └─────────────┘
     HTTPS                     腾讯云CDN回源                       WSS
```

**实现细节：
- **腾讯云 CDN**：WSS 回源 + DDoS 防护
- **Nginx + Let's Encrypt**：TLS 1.3、自动续期证书、HSTS、强制 HTTPS 重定向
- **WebSocket Secure (WSS)**：`wss://gateway.qrclaw.ai/ws`
- **防中间人攻击**：Certificate Pinning（移动端可选）
- **成本**：腾讯云 CDN 按流量计费（初期极少）+ Let's Encrypt 免费

#### 9.5.2 存储层加密（双重防护）

**第一层：PostgreSQL TDE（Supabase 自带）**
- 整个数据库磁盘加密（AES-256）
- 防止物理访问（磁盘被盗、备份泄露、服务器入侵）
- 对应用透明（无需修改代码）

**第二层：字段级加密（pgcrypto）**

**加密字段**：
```sql
messages.content            -- 消息内容
qrcodes.system_prompt       -- Agent提示词
qrcodes.visitor_identity    -- 访客身份配置
```

**实现方案**（Supabase 内置 pgcrypto）：

```sql
-- 1. 启用扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. 密钥表（Per Conversation 隔离 + 信封加密）
CREATE TABLE encryption_keys (
  key_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  key_data_encrypted bytea NOT NULL,  -- DEK 被 KEK 加密后的密文（非明文！）
  kek_version integer NOT NULL DEFAULT 1,  -- 对应 KEK 版本号，支持轮换
  algorithm text NOT NULL DEFAULT 'aes-256-gcm',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotating','revoked','destroyed')),
  created_at timestamptz DEFAULT now(),
  rotated_at timestamptz
);

-- RLS 策略：Owner只能访问自己Agent的对话密钥
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON encryption_keys
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      WHERE a.owner_id = auth.uid()
    )
  );

-- 3. 消息表（加密字段）
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  content_encrypted bytea NOT NULL,  -- 加密内容
  encryption_key_id uuid REFERENCES encryption_keys(key_id) ON DELETE CASCADE,
  role text CHECK (role IN ('visitor', 'agent')),
  sent_at timestamptz DEFAULT now(),
  message_id text UNIQUE NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX idx_messages_key ON messages(encryption_key_id);

-- 4. 存储函数（信封加密）
CREATE OR REPLACE FUNCTION store_encrypted_message(
  p_conversation_id uuid,
  p_content text,
  p_role text,
  p_message_id text,
  p_status text DEFAULT 'complete'  -- 'complete'|'partial'|'interrupted'
) RETURNS uuid 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id uuid;
  v_key_encrypted bytea;
  v_key text;
  v_message_id uuid;
  v_kek text;
BEGIN
  -- 获取 KEK（从 GUC 变量，应用启动时通过 SET qrclaw.kek = '...' 注入）
  v_kek := current_setting('qrclaw.kek');

  -- 获取或创建对话密钥（DEK）
  SELECT key_id, key_data_encrypted INTO v_key_id, v_key_encrypted
  FROM encryption_keys 
  WHERE conversation_id = p_conversation_id AND status = 'active'
  FOR UPDATE;
  
  IF v_key_id IS NULL THEN
    -- 生成新 DEK（256-bit AES），用 KEK 加密后存储
    v_key := encode(gen_random_bytes(32), 'hex');
    INSERT INTO encryption_keys (conversation_id, key_data_encrypted, kek_version)
    VALUES (p_conversation_id, pgp_sym_encrypt(v_key, v_kek)::bytea, 1)
    RETURNING key_id INTO v_key_id;
  ELSE
    -- 用 KEK 解密已有 DEK
    v_key := pgp_sym_decrypt(v_key_encrypted, v_kek);
  END IF;
  
  -- 用 DEK 加密消息并存储
  INSERT INTO messages (
    conversation_id, content_encrypted, encryption_key_id, 
    role, message_id, status
  )
  VALUES (
    p_conversation_id,
    pgp_sym_encrypt(p_content, v_key),
    v_key_id,
    p_role,
    p_message_id,
    p_status
  )
  RETURNING id INTO v_message_id;
  
  -- 更新对话元数据
  UPDATE conversations
  SET message_count = message_count + 1,
      last_active_at = now()
  WHERE id = p_conversation_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- 5. 读取函数（信封解密）
CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  message_id text,
  content text,
  role text,
  sent_at timestamptz,
  status text
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kek text;
BEGIN
  v_kek := current_setting('qrclaw.kek');

  RETURN QUERY
  SELECT 
    m.message_id,
    pgp_sym_decrypt(
      m.content_encrypted, 
      pgp_sym_decrypt(k.key_data_encrypted, v_kek)  -- KEK 解密 DEK，DEK 解密消息
    )::text,
    m.role,
    m.sent_at,
    m.status
  FROM messages m
  JOIN encryption_keys k ON m.encryption_key_id = k.key_id
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.sent_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 6. 安全删除（GDPR合规）
CREATE OR REPLACE FUNCTION delete_conversation_with_keys(
  p_conversation_id uuid
) RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. 删除加密密钥（ON DELETE CASCADE会自动删除messages）
  DELETE FROM encryption_keys 
  WHERE conversation_id = p_conversation_id;
  
  -- 2. 删除对话元数据
  DELETE FROM conversations 
  WHERE id = p_conversation_id;
  
  -- 即使数据库备份中有密文，也永久无法解密
END;
$$ LANGUAGE plpgsql;
```

#### 9.5.3 密钥管理策略

| 隔离级别 | 密钥粒度 | 优点 | 缺点 |
|---------|---------|------|------|
| **Per Conversation** ✅ | 每个对话独立密钥 | 最高安全，用户删除=密钥销毁=永久不可恢复 | 密钥数量多 |
| Per QRCode | 每个QRCode独立密钥 | 平衡安全与性能 | 删除单个对话无法销毁密钥 |
| Per Agent | 每个Agent独立密钥 | 管理简单 | 隔离性弱 |

**采用**：Per Conversation（最高隔离级别）

#### 9.5.3b 信封加密架构

采用两层密钥架构（Envelope Encryption），消除「密文与密钥同库存储」风险：

```
KEK (Key Encryption Key) ── 主密钥，加密 DEK
 │   存储位置：环境变量(MVP) → 外部 KMS(GA)
 │
 └──→ DEK (Data Encryption Key) ── 数据密钥
       │   生成：每 Conversation 独立
       │   存储：encryption_keys.key_data_encrypted（被 KEK 加密）
       │
       └──→ content_encrypted ── 消息密文
```

**核心安全属性：数据库中不存在任何明文密钥。**

| 阶段 | KEK 存储 | 安全水平 | 已知风险 |
|---|---|---|---|
| **MVP** | 环境变量注入（`QRCLAW_KEK_V1`），启动后从 env 删除 | 中 | Root 权限可从进程内存提取 |
| **GA** | 外部 KMS（AWS/GCP/腾讯云） | 高 | KEK 从未离开 KMS 硬件边界 |

```python
# MVP: KEK 加载策略
def _load_kek_on_startup():
    """启动时加载 KEK 到内存，然后从环境变量中删除"""
    for key, value in list(os.environ.items()):
        if key.startswith("QRCLAW_KEK_V"):
            version = int(key.split("_V")[1])
            _KEK_CACHE[version] = bytes.fromhex(value)
            del os.environ[key]  # 从环境变量中移除
```

**密钥轮换**（可选，V2+）：
- 每24小时自动轮换
- 或每1000条消息轮换
- 旧密钥保留用于解密历史消息
- 密钥生命周期：`active → rotating → revoked → destroyed`

#### 9.5.4 应用层调用

**Gateway 存储消息**：
```typescript
// 明文传入，函数内自动加密
const { data } = await supabase.rpc('store_encrypted_message', {
  p_conversation_id: 'conv_xxx',
  p_content: '你好，我想点一份小龙虾',  // 明文
  p_role: 'visitor',
  p_message_id: 'msg_xxx'
});
// → 数据库存储的是加密密文
```

**Gateway 读取消息**：
```typescript
// 自动解密返回明文
const { data: messages } = await supabase.rpc('get_conversation_messages', {
  p_conversation_id: 'conv_xxx',
  p_limit: 50
});
// → 返回解密后的明文数组
```

**用户删除对话**：
```typescript
// 密钥销毁 + 密文删除
await supabase.rpc('delete_conversation_with_keys', {
  p_conversation_id: 'conv_xxx'
});
// → 即使备份中有密文，也永久无法恢复
```

#### 9.5.5 性能影响

**加解密开销**：
- pgcrypto AES-256：~0.1ms/消息（PostgreSQL C原生实现）
- 1000 TPS → +100ms 总延迟（可接受）

**优化策略**：
- 密钥缓存（Redis）：避免每次查表
- 批量解密：`get_conversation_messages()` 一次返回多条
- 连接池：复用数据库连接

#### 9.5.6 GDPR 合规

**用户删除权利**：
```sql
-- 用户点击"删除对话"
SELECT delete_conversation_with_keys('conv_xxx');

-- 级联效果：
-- 1. encryption_keys 表中密钥被删除
-- 2. messages 表中所有密文被删除 (ON DELETE CASCADE)
-- 3. conversations 表中元数据被删除
-- 结果：即使数据库管理员也无法恢复内容
```

**自动清理**（Cron Job）：
```sql
-- 每天凌晨2点执行
CREATE OR REPLACE FUNCTION cleanup_old_encrypted_messages()
RETURNS void AS $$
BEGIN
  -- 删除1年前的消息（自动触发密钥级联删除）
  DELETE FROM messages 
  WHERE sent_at < now() - interval '1 year';
  
  -- 清理孤儿密钥（无关联消息）
  DELETE FROM encryption_keys 
  WHERE key_id NOT IN (
    SELECT DISTINCT encryption_key_id FROM messages
  );
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
  'cleanup-old-messages',
  '0 2 * * *',
  'SELECT cleanup_old_encrypted_messages()'
);
```

#### 9.5.7 安全清单

| 层级 | 威胁 | 防护措施 | 状态 |
|------|------|---------|------|
| **传输** | 中间人窃听 | HTTPS + WSS (TLS 1.3) | ✅ 腾讯云 CDN + Nginx |
| **传输** | 重放攻击 | 消息幂等去重（Redis 5min TTL） | ✅ 已有 |
| **存储** | 磁盘泄露 | PostgreSQL TDE | ✅ Supabase |
| **存储** | 数据库入侵 | pgcrypto字段加密 | ✅ |
| **存储** | 备份泄露 | Per Conversation密钥隔离 | ✅ |
| **应用** | SQL注入 | RLS + 参数化查询 | ✅ 已有 |
| **应用** | XSS攻击 | CSP Header + React自动转义 | ✅ Next.js |
| **应用** | CSRF | SameSite Cookie + Token | ✅ Supabase |
| **密钥** | 密钥明文存储 | 信封加密（KEK→DEK→Data） | ✅ |
| **合规** | GDPR删除 | CASCADE删除 + 密钥销毁 | ✅ |
| **合规** | 数据留存 | 1年自动清理 | ✅ Cron Job |
| **合规** | 用户隐私声明 | §8.7 隐私声明模板 | ✅ |

---



## 十二、API 合约

## 十、API 合约

### 10.1 接口总览

```
公开（无鉴权）：
  GET  /qrcodes/{slug}/public        — Visitor Profile
  GET  /qrcodes/{slug}/qr-card       — QR 名片图片
  POST /visitor/session               — 获取 Session Token（支持可选 JWT 绑定）
  GET  /health                        — Gateway 健康检查

桌面端认证（Supabase JWT，仅用于 Session 分配）：
  POST /visitor/session               — 桌面端登录后获取已绑定的 Session Token

Agent 鉴权（Bearer api_key）：
  POST /register                      — Agent 注册
  GET  /qrcodes/{id}/config           — 完整配置

Owner 鉴权（Supabase JWT，通过 Supabase 直连）：
  CRUD /qrcodes/*                     — QRCode 管理（Supabase Edge Functions / PostgREST）
  POST /qrcodes/{id}/pause|activate|archive — 状态变更
  GET  /stats/overview                — 聚合统计

Session 鉴权（X-Session-Token）：
  POST /visitor/messages              — 发消息
  GET  /visitor/messages/poll         — 轮询接收
  WSS  /ws?session_token=<token>      — WebSocket 连接
```

### 10.2 QRCode 创建

```
POST /api/v1/qrcodes
→ 201: { qrcode_id, slug, status, config_version, profile_url, qr_image_url }
```

### 10.3 QRCode 状态变更

```
POST /api/v1/qrcodes/{id}/pause     — active ↔ paused
POST /api/v1/qrcodes/{id}/activate  — paused → active
POST /api/v1/qrcodes/{id}/archive   — → revoked（不可逆）
```

---



## 十三、技术选型

## 十一、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 15 + React + TailwindCSS | SSR + CSR 混合，Vercel 托管，i18n 子路径路由 |
| **状态管理** | TanStack Query | query key: [domain, action, params] |
| **后端 API** | Supabase Edge Functions (Deno) | QRCode CRUD / Stats |
| **Gateway** | Node.js + ws 库 | 腾讯云 CVM 新加坡，PM2 管理 |
| **数据库** | Supabase PostgreSQL 15+（新加坡） | RLS + UUIDv7 + 分区表 |
| **Auth / 邮件** | Supabase Auth | 邮箱验证 / JWT / Claim 通知 |
| **对象存储** | Supabase Storage | 头像 / QR 图片 |
| **缓存/消息** | Redis Standalone | 与 Gateway 同机，Pub/Sub + 去重 + 限流 + 心跳 |
| **CDN** | 腾讯云 CDN | WSS 回源 + DDoS 防护 |
| **DNS** | 腾讯云 DNSPod | 域名解析 |
| **支付** | Stripe Billing (API `2026-02-25.clover`) | Checkout Sessions + Customer Portal + Webhook + Dynamic Payment Methods |
| **Agent SDK** | TypeScript (`@qrclaw/agent-sdk`) | npm 发布 |
| **监控** | Sentry + PostHog | 错误监控 + 事件分析 |
| **CI/CD** | GitHub Actions | 测试 + 构建 + 部署 |

---



## 十四、部署架构

## 十一B、部署架构

> **设计原则**：前后端分离部署，最大化利用托管服务（Vercel + Supabase），自有服务器仅承担 Gateway 长连接职责。

### 11B.1 部署拓扑

```
用户浏览器
    │
    ├── HTTPS ──→ Vercel 全球 CDN
    │              (qrclaw.ai)
    │              Next.js SSR/SSG
    │              Landing + Dashboard + Auth
    │
    └── WSS ───→ 腾讯云 CDN ──→ CVM（后端，新加坡）
                 (gateway.qrclaw.ai)
                   ├── Gateway (Node.js + ws)  — PM2 进程管理
                   ├── Redis (Standalone)      — 去重/限流/Pub/Sub
                   └── Nginx                   — 反向代理 + SSL 终结
                         │
                         ▼  (<5ms 同区延迟)
                   Supabase（新加坡）
                   ├── PostgreSQL  — 数据持久化
                   ├── Auth        — Owner 认证 + JWT + 邮件
                   ├── Edge Fn     — QRCode CRUD / Stats API
                   └── Storage     — 头像 / QR 图片
```

### 11B.2 为什么前后端分离

| 维度 | 合在一台 CVM | 前后端分离（✅ 采用） |
|------|------------|-------------------|
| **稳定性** | Gateway 挂了前端也挂 | 互不影响 |
| **扩展性** | 升配要一起升 | 各自独立扩展 |
| **部署** | 互相干扰，回滚复杂 | 各自独立发布（git push 即部署） |
| **成本** | 省一台机器 | Vercel 免费额度足够 MVP |
| **CDN** | 需额外配置 | Vercel 自带全球 CDN |
| **运维** | Nginx 配前端+后端 | 前端零运维 |

### 11B.3 服务器配置

**腾讯云 CVM（后端 — 1台）**

| 配置项 | 选择 | 理由 |
|--------|------|------|
| **云厂商** | 腾讯云 | — |
| **机型** | 标准型 S5 / S6 | 性价比高 |
| **地域** | 新加坡 | 与 Supabase 同区，延迟 <5ms；海外用户为主 |
| **CPU / 内存** | 2核4G | Gateway + Redis 足够 MVP（10K 并发），后期可垂直升配 |
| **系统盘** | 50G SSD 云硬盘 | 系统 + 日志 + Redis 持久化 |
| **带宽** | 按流量计费，上限 10Mbps | WebSocket 长连接流量不大，按量更划算 |
| **操作系统** | Ubuntu 22.04 LTS | Node.js 生态友好，LTS 长期支持 |

**CVM 上运行的服务**：

```
腾讯云 CVM（新加坡，2核4G）
├── Nginx                — 反向代理，WSS 终结，SSL（Let's Encrypt + certbot 自动续期）
├── Gateway (Node.js)    — PM2 管理，cluster 模式（2 worker）
├── Redis 7 (Standalone) — 去重/限流/Pub/Sub/心跳/Session 映射
└── 安全加固
    ├── ufw 防火墙（仅开放 22/80/443）
    ├── fail2ban（SSH 防暴力破解）
    └── 安全组（腾讯云控制台配置）
```

**前端 — Vercel**

| 配置项 | 说明 |
|--------|------|
| **框架** | Next.js 15（Vercel 原生支持，SSR/ISR/SSG 最优） |
| **部署方式** | GitHub 仓库连接，git push 自动部署 |
| **CDN** | Vercel 全球边缘节点，自动就近分发 |
| **SSL** | 自动配置 + 续期（自定义域名 qrclaw.ai） |
| **预览** | 每个 PR 自动生成预览链接 |
| **套餐** | Hobby（免费），足够 MVP |

### 11B.4 域名与 DNS

| 域名 | 用途 | DNS 记录类型 | 值 |
|------|------|------------|-----|
| `qrclaw.ai` | 前端（Landing + Dashboard） | CNAME | `cname.vercel-dns.com` |
| `www.qrclaw.ai` | 重定向到主域名 | CNAME | `cname.vercel-dns.com` |
| `gateway.qrclaw.ai` | Gateway WebSocket 入口 | A | CVM 公网 IP |

**DNS 服务商**：腾讯云 DNSPod

### 11B.5 CDN 配置（腾讯云 CDN）

| 加速域名 | 回源地址 | 协议 | 缓存策略 |
|---------|---------|------|---------|
| `gateway.qrclaw.ai` | CVM 公网 IP | WSS 回源 | 不缓存（实时通信） |

前端 CDN 由 Vercel 自带，无需额外配置。

**SSL 证书**：
- `qrclaw.ai` — Vercel 自动管理
- `gateway.qrclaw.ai` — Let's Encrypt（certbot 自动续期）或腾讯云免费 SSL

### 11B.6 成本估算（MVP 阶段）

| 组件 | 服务商 | 套餐 | 月费 |
|------|--------|------|------|
| **前端托管** | Vercel | Hobby（免费） | $0 |
| **Gateway + Redis** | 腾讯云 CVM 2核4G 新加坡 | 按量 / 包年 | ¥200-300 |
| **CDN（WSS）** | 腾讯云 CDN | 按流量 | ¥10-50（初期极少） |
| **数据库 + Auth + 邮件 + Storage** | Supabase | Free → Pro ($25) | $0-25 |
| **DNS** | 腾讯云 DNSPod | 免费版 | $0 |
| **域名** | qrclaw.ai | 年费 | ~$15/年 |
| **月总计** | | | **¥200-400/月**（约 $30-55） |

### 11B.7 扩展路径

| 阶段 | 并发 | 架构变化 | 月成本 |
|------|------|---------|--------|
| **MVP** | <10K | 单 CVM + Redis Standalone + Vercel + Supabase | ¥200-400 |
| **Growth** | 10K-100K | CVM 升配 4核8G → 多台 Gateway + Redis Cluster + Vercel Pro | ¥2,000-5,000 |
| **Scale** | 100K-1M | Gateway 集群 + Kafka 消息总线 + 读写分离 + Supabase 自建 | ¥15,000-30,000 |

### 11B.8 部署阶段计划

**Phase 0：基础设施搭建（第1周）**

- [ ] 购买腾讯云 CVM（新加坡，2核4G）
- [ ] 安全组配置：开放 22/80/443 端口
- [ ] 服务器初始化：Ubuntu 22.04 + Node.js 20 LTS + PM2 + Redis 7 + Nginx
- [ ] 防火墙加固：ufw + fail2ban
- [ ] DNSPod 域名解析配置
- [ ] SSL 证书：gateway.qrclaw.ai（Let's Encrypt）
- [ ] 腾讯云 CDN 接入（gateway.qrclaw.ai WSS 回源）
- [ ] Vercel 项目创建 + 绑定 qrclaw.ai 域名
- [ ] Supabase 项目确认（新加坡区）

**Phase 1：后端先行（第2-3周）**

- [ ] Gateway 骨架部署 → WebSocket 能连通
- [ ] Redis 部署 → 去重/限流跑通
- [ ] Supabase Schema 建表 → DB 联调（同区 <5ms）
- [ ] Agent SDK 骨架 → 注册 + WS 建连

**Phase 2：前端搭建（第3-4周）**

- [ ] Next.js 项目初始化 → Vercel 部署
- [ ] Landing Page
- [ ] Dashboard 骨架（三栏布局）
- [ ] Auth 页面（Supabase Auth 对接）

**Phase 3：全链路打通（第5-6周）**

- [ ] Visitor 扫码 → Profile → Chat → 消息收发
- [ ] 流式输出（reply_chunk 协议）
- [ ] 消息加密存储（pgcrypto AES-256）
- [ ] 基础限流 + Security Envelope

**Phase 4：打磨发布（第7-8周）**

- [ ] QRCode 管理（CRUD + 状态流转）
- [ ] 统计面板
- [ ] Dogfooding（官方客服 QRCode）
- [ ] E2E 测试 + 安全审计
- [ ] GA 发布 🚀

---



## 十五、统一认证实现

### 7.4 Gateway 统一认证实现

#### 7.4.1 JWT 验证模块

Gateway 新增 JWT 验证能力，**仅用于** `POST /visitor/session` 端点。WS 连接和消息路由仍只认 Session Token。

```typescript
// gateway/src/auth/jwt-verifier.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

export class SupabaseJWTVerifier {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private issuer: string;

  constructor(supabaseUrl: string) {
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    );
    this.issuer = `${supabaseUrl}/auth/v1`;
  }

  async verify(token: string): Promise<{ userId: string; email: string }> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: 'authenticated',
    });
    if (!payload.sub) throw new AuthError('JWT_MISSING_SUB', 'JWT missing sub');
    return { userId: payload.sub, email: (payload as any).email ?? '' };
  }
}
```

#### 7.4.2 Session 分配服务

```typescript
// gateway/src/services/session-service.ts
export class SessionService {
  constructor(private supabase: SupabaseClient, private redis: RedisClient) {}

  /**
   * 核心逻辑：
   * 1. 有 JWT + existingToken → 静默合并（silent_merge）
   * 2. 有 JWT（桌面端）→ 查找该 user_id 的已有 session → 复用或新建（已绑定）
   * 3. 无 JWT（移动端）→ 新建匿名 session（user_id = NULL）
   */
  async createOrGetSession(params: {
    userId: string | null;
    existingToken?: string;
    ipAddress: string;
  }): Promise<{ sessionToken: string; userId: string | null; isNew: boolean }> {
    const { userId, existingToken, ipAddress } = params;

    // Case 1: 匿名→登录绑定
    if (userId && existingToken) {
      await this.supabase.rpc('silent_merge_session', {
        p_session_token: existingToken, p_user_id: userId
      });
      await this.redis.setex(`session:${existingToken}`, 86400, JSON.stringify({ userId }));
      return { sessionToken: existingToken, userId, isNew: false };
    }

    // Case 2: 已登录用户，查找复用
    if (userId) {
      const cached = await this.redis.get(`user_session:${userId}`);
      if (cached) return { sessionToken: cached, userId, isNew: false };

      const { data: existing } = await this.supabase
        .from('sessions').select('session_token')
        .eq('user_id', userId).gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).single();

      if (existing) {
        await this.redis.setex(`user_session:${userId}`, 86400, existing.session_token);
        return { sessionToken: existing.session_token, userId, isNew: false };
      }

      // 新建已绑定 Session
      const token = `vs_${crypto.randomUUID().replace(/-/g, '')}`;
      await this.supabase.from('sessions').insert({
        session_token: token, user_id: userId, bound_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      await this.redis.setex(`user_session:${userId}`, 86400, token);
      return { sessionToken: token, userId, isNew: true };
    }

    // Case 3: 匿名
    const token = `vs_${crypto.randomUUID().replace(/-/g, '')}`;
    await this.supabase.from('sessions').insert({
      session_token: token, user_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    return { sessionToken: token, userId: null, isNew: true };
  }

  async validateSession(token: string): Promise<{ valid: boolean; userId: string | null }> {
    const cached = await this.redis.get(`session:${token}`);
    if (cached) return { valid: true, userId: JSON.parse(cached).userId };

    const { data } = await this.supabase
      .from('sessions').select('user_id, expires_at')
      .eq('session_token', token).single();
    if (!data || new Date(data.expires_at) < new Date()) return { valid: false, userId: null };

    await this.redis.setex(`session:${token}`, 86400, JSON.stringify({ userId: data.user_id }));
    return { valid: true, userId: data.user_id };
  }
}
```

#### 7.4.3 POST /visitor/session API 行为矩阵

| Authorization | X-Session-Token | 行为 | 结果 |
|---------------|-----------------|------|------|
| 无 | 无 | 新建匿名 Session | session_token (user_id=NULL) |
| 无 | 有 | 验证 token 有效性，返回已有 session | 已有 session_token |
| Bearer JWT | 无 | 验证 JWT → 查找/新建已绑定 Session | session_token (user_id=jwt.sub) |
| Bearer JWT | 有 | 验证 JWT → 静默合并 → 返回绑定后 session | 已绑定 session_token |

#### 7.4.4 前端 Start Chat 组件

```typescript
// web/src/components/StartChatButton.tsx
export function StartChatButton({ qrcodeId, slug }: Props) {
  const { isDesktop } = useDevice();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleStartChat = async () => {
    if (isDesktop) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setShowAuthModal(true); return; }
    }
    const sessionToken = await getSessionToken(qrcodeId);
    window.location.href = `/q/${slug}/chat`;
  };

  return (
    <>
      <button onClick={handleStartChat}
        className="w-full bg-coral-red text-white py-3 rounded-xl font-medium">
        Start Chat
      </button>
      {showAuthModal && (
        <AuthModal onSuccess={async () => {
          setShowAuthModal(false);
          await getSessionToken(qrcodeId);
          window.location.href = `/q/${slug}/chat`;
        }} onClose={() => setShowAuthModal(false)} />
      )}
    </>
  );
}
```

#### 7.4.5 数据库索引补充

```sql
-- 通过 user_id 查找活跃 session（桌面端复用）
CREATE INDEX idx_sessions_user_id_active ON sessions (user_id, expires_at DESC)
  WHERE user_id IS NOT NULL AND expires_at > now();
```

#### 7.4.6 方案自检

| 检查项 | 结果 |
|--------|------|
| Gateway 消息路由管线需要改动？ | ❌ **零改动** — 统一用 session_token |
| 移动端匿名流程受影响？ | ❌ **零影响** |
| 数据库 schema 有 breaking change？ | ❌ **仅追加索引** |
| 铁律 C4（移动端零注册）保持？ | ✅ |

---



## 十六、i18n 技术实现

> 多语言策略详见《产品需求文档》§十。以下为技术实现细节。

### 6E.3 技术架构

#### Next.js i18n 方案（App Router）

```
app/
├── [locale]/               ← 动态语言路由
│   ├── layout.tsx          ← 读取 locale, 设置 html lang
│   ├── page.tsx            ← Landing Page
│   ├── dashboard/
│   │   └── page.tsx
│   └── auth/
│       └── page.tsx
├── i18n/
│   ├── config.ts           ← 语言配置
│   ├── request.ts          ← 服务端 i18n
│   └── client.ts           ← 客户端 i18n hook
└── messages/
    ├── en.json             ← English（默认/基准）
    └── zh.json             ← 简体中文
```

#### 语言配置

```typescript
// i18n/config.ts
export const i18nConfig = {
  defaultLocale: 'en',
  locales: ['en', 'zh'],       // V2: 英文 + 中文
  // V3 扩展: ['en', 'zh', 'ja', 'ko']
  localeNames: {
    en: 'English',
    zh: '简体中文',
  },
} as const;
```

#### URL 路由策略

| 策略 | URL 示例 | 选择 |
|------|---------|------|
| **子路径（推荐）** | `qrclaw.ai/zh/dashboard` | ✅ 采用 |
| 子域名 | `zh.qrclaw.ai/dashboard` | ❌ CDN/SSL 复杂 |
| Cookie/Header | `qrclaw.ai/dashboard` + Accept-Language | ❌ 对 SEO 不友好 |

- 默认语言（en）省略前缀：`qrclaw.ai/dashboard`（不是 `qrclaw.ai/en/dashboard`）
- 非默认语言带前缀：`qrclaw.ai/zh/dashboard`
- Landing Page：`qrclaw.ai`（英文）、`qrclaw.ai/zh`（中文）

#### 翻译文件结构

```json
// messages/en.json
{
  "common": {
    "appName": "QRClaw",
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Confirm",
    "back": "Back",
    "next": "Next",
    "upgrade": "Upgrade",
    "poweredBy": "Powered by QRClaw"
  },
  "landing": {
    "hero": {
      "title": "Give Your AI Agent a QR Code",
      "subtitle": "Anyone scans it, starts chatting — no app, no login.",
      "cta": "curl -s https://qrclaw.ai/skill.md"
    },
    "connect": {
      "title": "Connect Your Agent",
      "description": "One command. Your agent gets a QR code."
    }
  },
  "dashboard": {
    "nav": {
      "qrcodes": "QR Codes",
      "conversations": "Conversations",
      "stats": "Statistics",
      "settings": "Settings"
    },
    "qrcode": {
      "create": "Create QR Code",
      "publish": "Publish",
      "pause": "Pause",
      "archive": "Archive",
      "status": {
        "active": "Active",
        "paused": "Paused",
        "draft": "Draft",
        "revoked": "Revoked"
      }
    }
  },
  "chat": {
    "inputPlaceholder": "Type a message…",
    "connecting": "Connecting...",
    "connected": "Connected",
    "reconnecting": "Reconnecting...",
    "agentOffline": "Agent is currently offline",
    "newConversation": "New Conversation"
  },
  "auth": {
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot password?",
    "verifyEmail": "Check your email for a 6-digit verification code"
  },
  "errors": {
    "quota_exceeded": "You've reached your monthly message limit. Upgrade to Pro for 50,000 messages/month.",
    "agent_not_claimed": "This agent hasn't been claimed yet. Check your email for the claim link.",
    "rate_limited": "Too many messages. Please wait a moment.",
    "qrcode_not_active": "This QR code is not active. The owner needs to publish it."
  },
  "pricing": {
    "free": "Free",
    "pro": "Pro",
    "max": "Max",
    "monthly": "/month",
    "annually": "/year",
    "currentPlan": "Current Plan",
    "upgradeTo": "Upgrade to {plan}"
  }
}
```

```json
// messages/zh.json
{
  "common": {
    "appName": "QRClaw",
    "loading": "加载中...",
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "confirm": "确认",
    "back": "返回",
    "next": "下一步",
    "upgrade": "升级",
    "poweredBy": "由 QRClaw 提供支持"
  },
  "landing": {
    "hero": {
      "title": "给你的 AI Agent 一个二维码",
      "subtitle": "扫一扫，直接对话 — 无需下载，无需登录",
      "cta": "curl -s https://qrclaw.ai/skill.md"
    },
    "connect": {
      "title": "连接你的 Agent",
      "description": "一条命令，你的 Agent 就有了二维码入口"
    }
  },
  "dashboard": {
    "nav": {
      "qrcodes": "二维码",
      "conversations": "对话",
      "stats": "统计",
      "settings": "设置"
    },
    "qrcode": {
      "create": "创建二维码",
      "publish": "发布",
      "pause": "暂停",
      "archive": "归档",
      "status": {
        "active": "已发布",
        "paused": "已暂停",
        "draft": "草稿",
        "revoked": "已撤销"
      }
    }
  },
  "chat": {
    "inputPlaceholder": "输入消息…",
    "connecting": "连接中...",
    "connected": "已连接",
    "reconnecting": "重新连接中...",
    "agentOffline": "Agent 当前离线",
    "newConversation": "新对话"
  },
  "auth": {
    "signIn": "登录",
    "signUp": "注册",
    "email": "邮箱",
    "password": "密码",
    "forgotPassword": "忘记密码？",
    "verifyEmail": "请查收邮件中的 6 位验证码"
  },
  "errors": {
    "quota_exceeded": "本月消息额度已用完，升级到 Pro 可享受每月 50,000 条消息",
    "agent_not_claimed": "此 Agent 尚未认领，请检查邮箱中的认领链接",
    "rate_limited": "消息发送过于频繁，请稍后再试",
    "qrcode_not_active": "此二维码未激活，需要 Owner 在 Dashboard 中发布"
  },
  "pricing": {
    "free": "免费版",
    "pro": "专业版",
    "max": "旗舰版",
    "monthly": "/月",
    "annually": "/年",
    "currentPlan": "当前套餐",
    "upgradeTo": "升级到{plan}"
  }
}
```

#### 组件使用示例

```tsx
// 服务端组件
import { getTranslations } from '@/i18n/request';

export default async function LandingPage({ params: { locale } }) {
  const t = await getTranslations(locale, 'landing');
  return (
    <section>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle')}</p>
    </section>
  );
}

// 客户端组件
'use client';
import { useTranslation } from '@/i18n/client';

export function ChatInput() {
  const { t } = useTranslation('chat');
  return <input placeholder={t('inputPlaceholder')} />;
}
```

### 6E.4 语言检测与切换

#### 自动检测（首次访问）

```
1. URL 路径是否带 locale 前缀？ → 有则直接使用
2. 检查 localStorage 中 'preferred-locale' → 有则使用
3. 检查 Accept-Language header → 匹配支持的语言
4. 默认 fallback → 'en'
```

#### 手动切换

- **位置**：Nav Bar 右上角，语言切换按钮（🌐 图标 + 当前语言名称）
- **行为**：切换后跳转到对应 locale 路径，同时写入 `localStorage`
- **示例**：`qrclaw.ai/dashboard` → 点击"简体中文" → `qrclaw.ai/zh/dashboard`

#### middleware.ts（路由重写）

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { i18nConfig } from './i18n/config';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // 跳过 API / static / skill.md
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/skill.md') {
    return;
  }
  
  // 检查路径是否已有 locale
  const hasLocale = i18nConfig.locales.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
  if (hasLocale) return;
  
  // 检测用户首选语言
  const acceptLang = request.headers.get('accept-language') || '';
  const preferred = acceptLang.includes('zh') ? 'zh' : 'en';
  
  // 默认语言(en)不重定向，非默认语言重写路径
  if (preferred !== 'en') {
    return NextResponse.rewrite(
      new URL(`/${preferred}${pathname}`, request.url)
    );
  }
}
```

### 6E.5 后端国际化

#### API 错误消息

```typescript
// Gateway 错误消息国际化
const errorMessages = {
  quota_exceeded: {
    en: 'Monthly message quota exceeded. Upgrade to Pro for more.',
    zh: '本月消息额度已用完，请升级到 Pro',
  },
  rate_limited: {
    en: 'Too many requests. Please slow down.',
    zh: '请求过于频繁，请稍后再试',
  },
  // ... 其他错误码
};

// 根据请求 Accept-Language header 返回对应语言
function getErrorMessage(code: string, locale: string): string {
  return errorMessages[code]?.[locale] || errorMessages[code]?.['en'] || code;
}
```

#### 邮件模板

| 邮件类型 | 触发场景 | 国际化方式 |
|---------|---------|-----------|
| Claim 通知 | Agent 注册后发给 Owner | 根据 Owner 注册时的 locale |
| 邮箱验证 | Owner 注册 | Supabase Auth 内置多语言模板 |
| 配额提醒 | Free 用户接近 1,000 条 | 根据 Owner 的 locale 偏好 |
| 消息清理通知 | Free 60 天清理前 | 根据 Owner 的 locale 偏好 |

```sql
-- owners 表新增 locale 字段
ALTER TABLE owners ADD COLUMN locale text DEFAULT 'en' 
  CHECK (locale IN ('en', 'zh'));
```

### 6E.6 Visitor Chat 页面语言

Visitor Chat 页面的语言**跟随 QRCode 的配置**（不是跟随 Visitor 的浏览器语言）：

```sql
-- qrcodes 表新增 locale 字段
ALTER TABLE qrcodes ADD COLUMN locale text DEFAULT 'en'
  CHECK (locale IN ('en', 'zh'));
```

| 场景 | 语言来源 | 说明 |
|------|---------|------|
| Profile 页面固定文案 | `qrcodes.locale` | Owner 创建时指定 |
| Chat 输入框 placeholder | `qrcodes.locale` | 跟随 QRCode |
| 系统提示（连接中/离线等） | `qrcodes.locale` | 跟随 QRCode |
| Agent 回复内容 | Agent 自决 | 取决于 system_prompt |
| Visitor 输入内容 | Visitor 自决 | 自由输入 |

> **为什么跟随 QRCode 而非浏览器语言？** 因为一个中国餐厅的 QRCode 就应该显示中文界面，无论访客的浏览器语言是什么。Owner 最清楚自己的目标受众。

### 6E.7 SEO 多语言

```html
<!-- Landing Page head -->
<link rel="alternate" hreflang="en" href="https://qrclaw.ai/" />
<link rel="alternate" hreflang="zh" href="https://qrclaw.ai/zh/" />
<link rel="alternate" hreflang="x-default" href="https://qrclaw.ai/" />
```

- `x-default` 指向英文版（默认）
- `sitemap.xml` 包含所有语言版本的 URL
- OG tags / meta description 按语言输出

### 6E.8 翻译工作流

| 步骤 | 工具 | 说明 |
|------|------|------|
| 1. 开发时 | 直接编辑 `en.json` | 英文为基准语言 |
| 2. 翻译 | 人工翻译（团队内部） | V2 只有中文，量不大 |
| 3. 校验 | CI 脚本检查 key 一致性 | 确保 zh.json 不遗漏 key |
| 4. 后续扩展 | 接入翻译平台（Crowdin / Lokalise） | V3+ 多语言时启用 |

```bash
# CI 检查脚本（确保翻译 key 完整）
node scripts/check-i18n.js
# → ✅ en.json: 87 keys
# → ✅ zh.json: 87 keys (0 missing)
```

### 6E.9 Sprint 排期

| Sprint | 多语言任务 | 工作量 |
|--------|-----------|--------|
| **S1（基础设施）** | 前端项目 i18n 脚手架、middleware、翻译文件结构 | 0.5 天 |
| **S3（QRCode + Chat）** | Chat 页面翻译、QRCode locale 字段 | 0.5 天 |
| **S4（Dashboard）** | Dashboard 全部翻译、语言切换组件 | 1 天 |
| **S5（Landing + 打磨）** | Landing Page 翻译、SEO hreflang、邮件模板翻译 | 1 天 |
| **合计** | | **3 天** |

> 多语言在 V2 的工作量约 3 人天，因为只有 en + zh 两种语言，且架构设计好后新增语言只需加翻译文件。

---



---

## 附录


## 十七、OpenClaw 兼容性设计

> **核心立场**：QRClaw 是**独立产品**，拥有自己的技术栈和产品体系。
> QRClaw 面向所有 Agent 生态（OpenClaw / Claude Code / GPT / Gemini / Cursor / 自建 Agent），
> 但以 OpenClaw 作为**首要兼容目标**（First-Class Compatibility）。
> 
> **参考模型**：EvoMap — 同样建立独立 WebSocket 服务，Agent 主动建连，已验证可行。

### 17.1 架构定位

```
QRClaw 的定位（独立 + 兼容）：

┌─────────────────────────────────────────────────────────┐
│                    Agent 生态系统                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ OpenClaw │ │Claude Code│ │  Cursor  │ │ 自建Agent│   │
│  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │            │            │            │          │
│       └────────────┴─────┬──────┴────────────┘          │
│                          │                              │
│                    SKILL.md / API                        │
│                  (统一接入协议)                           │
└──────────────────────────┬──────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   QRClaw    │  ← 独立产品
                    │   Gateway   │  ← 独立 WebSocket
                    │   (Node.js) │  ← 独立部署
                    ├─────────────┤
                    │  Supabase   │
                    └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Visitor   │  ← 扫码用户
                    │   (H5/Web)  │
                    └─────────────┘
```

**与 EvoMap 的架构对比**：

| 维度 | EvoMap | QRClaw | 说明 |
|------|--------|--------|------|
| 接入方式 | `curl skill.md` → REST API | `curl skill.md` → REST + WebSocket | QRClaw 多一层 WS 长连接 |
| 通信协议 | HTTP REST（无状态） | WebSocket（有状态实时通信） | QRClaw 需要实时消息推送 |
| Agent 注册 | `POST /a2a/hello` | `POST /api/v1/register` | 相同模式：延迟认证 |
| 用户绑定 | `claim_code` → 浏览器确认 | `claim_code` → qrclaw.ai 确认 | 相同模式：Owner Claim |
| Skill 格式 | YAML frontmatter + Markdown | YAML frontmatter + Markdown | 完全一致 |
| 独立部署 | ✅ 独立服务 | ✅ 独立服务 | EvoMap 已验证此模式可行 |

### 17.2 OpenClaw Agent 环境分析

> 基于 OpenClaw v2026.3.9 源码分析（`/projects/openclaw-official/`）

#### 17.2.1 Agent 可用工具

OpenClaw Agent 在对话中可调用以下工具（与 QRClaw 接入相关）：

| 工具 | 说明 | QRClaw 使用场景 | 可用性 |
|------|------|----------------|--------|
| `exec` | 执行 shell 命令 | `curl` 调用 QRClaw API、建立 WS | ✅ 默认可用（coding profile） |
| `web_fetch` | 抓取 URL 内容 | 读取 `skill.md`、调用 REST API | ✅ 默认可用（openclaw group） |
| `sessions_spawn` | 启动子 Agent | 可用于后台 WS 维护 | ⚠️ 需要 operator 权限 |
| `cron` | 定时任务 | 心跳保活、定时重连 | ⚠️ owner-only 工具 |

#### 17.2.2 安全策略约束

```typescript
// OpenClaw 的 exec 工具安全策略（源自 src/agents/pi-tools.policy.ts）
// Agent 在 sandbox 中执行时：
// 1. exec 有 allowlist — 需要配置允许出站连接
// 2. web_fetch 默认可用 — 可直接 GET/POST
// 3. 长连接（WebSocket）需要在后台进程中维护
```

**关键发现**：
- `exec` 工具在 `coding` profile 下默认可用
- `web_fetch` 工具在 `openclaw` group 下默认可用（`includeInOpenClawGroup: true`）
- 长时间 WebSocket 连接可通过 `exec` 的 `background: true` 模式维护
- 工具可通过 `allow/deny` glob 模式精细控制

#### 17.2.3 OpenClaw Skill 系统兼容

```yaml
# QRClaw SKILL.md 需遵循的 OpenClaw Skill 规范
# 来源：skills/skill-creator/SKILL.md (openclaw v2026.3.9)

name: qrclaw                         # ✅ 已符合
description: >                       # ✅ 已符合（11 个触发场景）
  Connect your AI Agent to...

# 需要添加的 metadata 字段：
metadata:
  openclaw:
    emoji: "📱"
    requires:
      bins: ["curl"]                  # 声明依赖 curl
```

**Skill 目录规范对照**：

| 规范要求 | QRClaw 现状 | 状态 |
|---------|-------------|------|
| `SKILL.md` + YAML frontmatter | ✅ 已有 | 合规 |
| `name` + `description` 必需 | ✅ 已有 | 合规 |
| `references/` 目录 | ✅ 已有 | 合规 |
| `scripts/` 目录 | ❌ 未使用 | 可选，不影响 |
| `metadata.openclaw.emoji` | ❌ 缺少 | 需补充 |
| `metadata.openclaw.requires` | ❌ 缺少 | 需补充（声明 curl 依赖） |
| 通过 `openclaw skill install` 安装 | ❌ 未验证 | 需测试 |

### 17.3 Agent 接入兼容方案

#### 17.3.1 接入方式矩阵

| Agent 环境 | 读取 SKILL.md | 注册 API | WebSocket 连接 | 适配说明 |
|-----------|---------------|----------|---------------|---------|
| **OpenClaw** (sandbox) | `web_fetch` 工具 | `exec` curl 或 `web_fetch` POST | `exec` background WebSocket | 需在 SKILL.md 中提供 OpenClaw 专用指引 |
| **OpenClaw** (local) | `exec` curl | `exec` curl | `exec` background WebSocket | 完整能力，无限制 |
| **Claude Code** | `exec` curl | `exec` curl | `exec` background WebSocket | 与 OpenClaw local 类似 |
| **Cursor / Windsurf** | `exec` curl | `exec` curl | `exec` background WebSocket | IDE Agent，网络通常无限制 |
| **自建 Agent** | HTTP 请求 | HTTP 请求 | 标准 WebSocket | 最灵活 |

#### 17.3.2 OpenClaw 环境专用指引（SKILL.md 补充）

```markdown
## OpenClaw Environment Notes

If you are running inside OpenClaw:

### Reading this skill
OpenClaw loads SKILL.md automatically when triggered by keywords.
You can also manually fetch: use the web_fetch tool with url https://qrclaw.ai/skill.md

### Registering
Option A (recommended): Use exec tool with curl:
  exec: curl -X POST https://gateway.qrclaw.ai/api/v1/register \
    -H "Content-Type: application/json" \
    -d '{"name":"my-agent","description":"...","owner_email":"..."}'

Option B: If exec is restricted, describe the POST request and the human operator
can run it manually, then provide you with the api_key.

### WebSocket Connection
Use exec tool with background mode to maintain the WebSocket connection:
  exec(background: true): npx wscat -c wss://gateway.qrclaw.ai/ws?api_key=YOUR_KEY

Alternative: Use a lightweight Node.js script (see Level 1 Step 2 in main guide).

### Important
- Save your api_key — it persists across sessions
- The WebSocket connection runs in background; use exec to check its status
- If connection drops, the reconnect logic in your client script handles it
```

#### 17.3.3 环境自动检测（Gateway 端）

```typescript
// POST /api/v1/register 增加可选字段
interface RegisterRequest {
  name: string;
  description: string;
  owner_email: string;
  // === 新增：环境声明 ===
  agent_env?: {
    platform: string;    // "openclaw" | "claude-code" | "cursor" | "custom"
    version?: string;    // "2026.3.9"
    capabilities?: {
      websocket: boolean;  // Agent 是否能建 WS
      background: boolean; // Agent 是否能跑后台进程
      exec: boolean;       // Agent 是否有 exec 工具
    };
  };
}

// Gateway 根据 agent_env 返回针对性连接指引
interface RegisterResponse {
  api_key: string;
  claim_code: string;
  claim_url: string;
  ws_url: string;
  // === 新增：环境适配建议 ===
  connect_hint?: {
    method: "websocket" | "long-polling" | "webhook";
    instructions: string;  // 针对该环境的连接建议
  };
}
```

### 17.4 WebSocket 兼容性保障

#### 17.4.1 EvoMap 验证的关键结论

> 来源：`/projects/qrclaw/research/evomap-skill/`

EvoMap 已在 OpenClaw 生态中验证了以下模式的可行性：

1. **Agent 通过 Skill.md 自主发现服务** — `curl skill.md` → 获取接入指引
2. **Agent 通过 exec 调用外部 API** — `POST /a2a/hello` 注册成功
3. **独立 WebSocket 不冲突** — Agent 可同时保持 OpenClaw WS + 外部 WS
4. **延迟认证（claim_code）可行** — Agent 先注册，Owner 后确认

**QRClaw 与 EvoMap 的区别**：QRClaw 需要**持续 WebSocket 连接**（实时消息推送），
而 EvoMap 仅需**间歇性 HTTP 调用**（4小时周期）。

这意味着 QRClaw 的 WebSocket 需要额外的保活机制：

| 挑战 | 解决方案 |
|------|---------|
| Agent sandbox 进程超时 | 心跳机制（60s）+ 自动重连 |
| OpenClaw session 结束 | 将 WS 客户端运行为独立后台进程 |
| 多 QRCode 共享连接 | 单连接多路复用（已设计） |

#### 17.4.2 Agent 侧连接实现建议

```javascript
// agent-connect.js — 适用于所有 Agent 环境
// Agent 在 exec 中运行此脚本，建立与 QRClaw Gateway 的 WS 连接

const WebSocket = require('ws');

const API_KEY = process.env.QRCLAW_API_KEY; // 注册时获得
const WS_URL = `wss://gateway.qrclaw.ai/ws?api_key=${API_KEY}`;

let ws;
let reconnectDelay = 1000;

function connect() {
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('[QRClaw] Connected');
    reconnectDelay = 1000; // reset backoff
  });
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'visitor_message') {
      // 收到访客消息，Agent 处理后回复
      handleVisitorMessage(msg);
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  });
  
  ws.on('close', () => {
    console.log(`[QRClaw] Disconnected, reconnecting in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });
  
  ws.on('error', (err) => {
    console.error('[QRClaw] Error:', err.message);
  });
}

function handleVisitorMessage(msg) {
  // Agent 处理消息并回复
  // 注意：security_envelope 中的规则必须遵守
  const reply = {
    type: 'reply',
    message_id: 'msg_' + Date.now(),
    qrcode_id: msg.qrcode_id,
    conversation_id: msg.conversation_id,
    content: 'Your response here',
    in_reply_to: msg.message_id
  };
  ws.send(JSON.stringify(reply));
}

connect();
```

### 17.5 安全策略对齐

#### 17.5.1 OpenClaw Security Envelope vs QRClaw Security Envelope

| 维度 | OpenClaw | QRClaw | 兼容措施 |
|------|---------|--------|---------|
| 注入方式 | System Prompt + Tool Policy | WebSocket message.security_envelope | 独立机制，不冲突 |
| 执行位置 | Gateway → LLM Prompt | Gateway → Agent WS Message | 层级不同 |
| 策略内容 | exec allowlist, tool deny | NO_SECRET_DISCLOSURE 等 4 规则 | 互补关系 |
| 强制执行 | OpenClaw Gateway 强制 | QRClaw Gateway 注入，Agent 自觉遵守 | QRClaw 依赖 Agent 诚信 |

**兼容性结论**：两套安全机制在不同层级运作，不会冲突。
- OpenClaw 的安全策略控制 Agent **能用什么工具**
- QRClaw 的安全策略控制 Agent **回复什么内容**

#### 17.5.2 exec allowlist 配置指南

Agent Owner 在 OpenClaw 配置中需要添加：

```yaml
# openclaw config — 允许 Agent 连接 QRClaw
tools:
  policy:
    allow:
      - exec        # 允许执行 shell（建立 WS）
      - web_fetch   # 允许抓取 URL（读取 skill.md）
  exec:
    allowlist:
      - "curl *gateway.qrclaw.ai*"
      - "node *agent-connect.js*"
      - "npx wscat*"
```

### 17.6 多 Agent 生态拓展性

> QRClaw 不绑定任何单一 Agent 平台。SKILL.md 是面向 OpenClaw 的接入指引，
> 但 REST API + WebSocket 协议本身是**平台无关**的。

#### 17.6.1 未来生态拓展矩阵

| 生态 | 接入方式 | Skill 格式 | 优先级 |
|------|---------|-----------|--------|
| **OpenClaw** | SKILL.md + exec/web_fetch | OpenClaw Skill 规范 | P0（首发） |
| **Claude Code** | CLAUDE.md + exec | Claude 指令格式 | P1 |
| **Cursor** | .cursorrules + exec | Cursor 规则格式 | P1 |
| **Windsurf** | .windsurfrules + exec | Windsurf 规则格式 | P2 |
| **GPT Actions** | OpenAPI Schema | JSON Schema | P2 |
| **自建 Agent** | REST API + WS SDK | npm/pip 包 | P0（首发） |

#### 17.6.2 SDK 抽象层

```
qrclaw-sdk/
├── core/                    # 平台无关核心
│   ├── ws-client.ts         # WebSocket 客户端
│   ├── api-client.ts        # REST API 客户端
│   └── types.ts             # 类型定义
├── adapters/                # 平台适配器
│   ├── openclaw.ts          # OpenClaw Agent 适配
│   ├── claude-code.ts       # Claude Code 适配
│   └── generic.ts           # 通用 Node.js 适配
└── package.json
```

### 17.7 实施计划

#### Phase 1: OpenClaw First-Class 兼容（V3.0 发布）

| 任务 | 工作量 | Sprint | 说明 |
|------|--------|--------|------|
| SKILL.md 添加 OpenClaw metadata | 0.5d | S1 | `metadata.openclaw.emoji` + `requires` |
| SKILL.md 添加 OpenClaw 环境指引 | 1d | S1 | exec/web_fetch 使用示例 |
| Gateway 注册 API 支持 `agent_env` | 0.5d | S2 | 可选字段，返回环境适配建议 |
| agent-connect.js 参考实现 | 1d | S2 | OpenClaw 环境验证通过的连接脚本 |
| OpenClaw v2026.3.8+ 集成测试 | 1d | S3 | 端到端：install skill → register → connect → chat |
| exec allowlist 配置文档 | 0.5d | S1 | Owner 配置指南 |
| **小计** | **4.5d** | | |

#### Phase 2: 多生态适配（V3.1+）

| 任务 | 工作量 | 说明 |
|------|--------|------|
| Claude Code CLAUDE.md 适配 | 1d | |
| Cursor .cursorrules 适配 | 1d | |
| qrclaw-sdk npm 包发布 | 3d | 含 core + adapters |
| GPT Actions OpenAPI Schema | 1d | |
| 集成测试矩阵（4 平台） | 2d | |

### 17.8 OpenClaw 版本兼容基线

| OpenClaw 版本 | 兼容状态 | 说明 |
|--------------|---------|------|
| v2026.3.x | ✅ 目标版本 | web_fetch 工具可用，exec background 可用 |
| v2026.2.x | ✅ 兼容 | 核心工具链相同 |
| < v2026.2.0 | ⚠️ 未验证 | web_fetch 可能不可用，需回退到 exec curl |

---

> **本章核心结论**：QRClaw 保持独立技术栈，通过 SKILL.md 和 API 协议层兼容 OpenClaw。
> 参照 EvoMap 已验证的模式，Agent 通过 exec 工具主动建立 WebSocket 连接是可行的。
> 未来通过 SDK 抽象层拓展到更多 Agent 生态。



### A. 架构图索引

| 图名 | 文件路径 |
|------|---------|
| 产品技术架构总览 | `diagrams/product-architecture.png` |
| 消息路由流 | `diagrams/message-flow.png` |
| Agent 接入流程 | `diagrams/agent-onboarding.png` |

### B. 环境变量清单

| 变量名 | 用途 | 示例 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase 匿名 Key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJhbGci...` |
| `GATEWAY_PORT` | Gateway 监听端口 | `3100` |
| `GATEWAY_WS_PORT` | Gateway WebSocket 端口 | `3101` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret` |
| `ENCRYPTION_MASTER_KEY` | 信封加密主密钥 (KEK) | `base64...` |
| `REDIS_URL` | Redis 连接 URL | `redis://localhost:6379` |
| `CDN_DOMAIN` | CDN 域名 | `cdn.qrclaw.ai` |
| `STRIPE_SECRET_KEY` | Stripe 密钥（V3） | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 密钥（V3） | `whsec_...` |

### C. 更新记录

| 日期 | 版本 | 内容 |
|------|------|------|
| 2026-03-11 | V3.0 | 从 V2.6 产品方案中拆分技术方案，独立为技术方案文档。更新 QRCode 状态枚举（archived→revoked，新增 draft）。确认消息加密存储方案（非零存储）。 |
| 2026-03-11 | V3.0.2 | 三模型辩论审查（10轮，Claude Opus 4.6 + GPT 5.4 + Gemini 3.1 Pro）。修正 P0：加密实现声明统一（Gateway 层 AES-256-GCM）、可靠性承诺修正（持久化优先尽力投递）、WS 认证改为 ws_ticket 阅后即焚、认证方案统一 Bearer Token、消息状态机三层解耦（4态+reason+协议层）、Redis Fail-fast 熔断。 |
| 2026-03-11 | V3.0.1 | 新增 §17 OpenClaw 兼容性设计。基于 OpenClaw v2026.3.9 源码分析 + EvoMap 模式验证。确认 QRClaw 独立产品定位 + OpenClaw First-Class 兼容方案。更新 §1.2 技术原则。 |

---

> **交叉引用**: 产品需求、用户流程、页面设计、埋点分析等内容详见《QRClaw 产品需求文档 V3.0》(`product-requirements.md`)


---

# 补充章节 A：测试策略与质量保障

# QRClaw 测试策略与质量保障 — 技术方案补充章节

> **目标读者**：AI Coding Agent（Claude Code / Cursor / Copilot）
> **编码约束**：Agent 必须严格按照本文档的测试矩阵和 TDD 流程编写代码
> **覆盖率要求**：≥ 80% branches + functions + lines + statements
> **框架**：Vitest（Unit/Integration） + Playwright（E2E） + Supertest（HTTP）

---

## §T1 测试架构总览

```
tests/
├── unit/                    # 纯函数、工具类、加密模块
│   ├── crypto/
│   │   ├── envelope-encryption.test.ts
│   │   ├── dek-lifecycle.test.ts
│   │   └── key-rotation.test.ts
│   ├── auth/
│   │   ├── ticket-verifier.test.ts
│   │   └── session-validator.test.ts
│   ├── routing/
│   │   ├── route-cache.test.ts
│   │   └── circuit-breaker.test.ts
│   └── protocol/
│       ├── message-validator.test.ts
│       ├── ack-state-machine.test.ts
│       └── security-envelope.test.ts
├── integration/             # API 端点、数据库操作、Redis 交互
│   ├── gateway/
│   │   ├── ws-connection.test.ts
│   │   ├── ws-ticket-flow.test.ts
│   │   ├── message-routing.test.ts
│   │   └── stream-output.test.ts
│   ├── edge-functions/
│   │   ├── create-qrcode.test.ts
│   │   ├── agent-ws-ticket.test.ts
│   │   └── visitor-ws-ticket.test.ts
│   └── database/
│       ├── rls-policies.test.ts
│       ├── encryption-keys.test.ts
│       └── message-persistence.test.ts
├── e2e/                     # 端到端关键用户流
│   ├── visitor-chat-flow.spec.ts
│   ├── agent-connection-flow.spec.ts
│   ├── owner-qrcode-management.spec.ts
│   ├── ws-reconnection.spec.ts
│   └── stream-output-degradation.spec.ts
├── fixtures/                # 测试数据
│   ├── messages.ts
│   ├── qrcodes.ts
│   ├── agents.ts
│   └── visitors.ts
├── mocks/                   # 外部依赖 Mock
│   ├── supabase.ts
│   ├── redis.ts
│   └── ws-client.ts
└── helpers/                 # 测试工具
    ├── setup.ts
    ├── teardown.ts
    ├── ws-test-client.ts
    └── crypto-test-utils.ts
```

---

## §T2 TDD 工作流（强制执行）

Agent 编写任何新功能时，**必须**遵循以下流程：

```yaml
TDD Cycle (Red → Green → Refactor):

  Step 1 — RED（写失败测试）:
    action: 先写测试描述预期行为
    command: npx vitest run --reporter=verbose
    expected: 测试 FAIL（红色）
    rule: 不写实现代码，只写测试

  Step 2 — GREEN（最小实现）:
    action: 写刚好让测试通过的代码
    command: npx vitest run --reporter=verbose
    expected: 测试 PASS（绿色）
    rule: 不写多余代码，不提前优化

  Step 3 — REFACTOR（重构）:
    action: 消除重复、改善命名、优化结构
    command: npx vitest run --reporter=verbose
    expected: 测试仍然 PASS
    rule: 每次重构后必须跑测试

  Step 4 — COVERAGE（验证覆盖率）:
    command: npx vitest run --coverage
    expected: ≥ 80% 全维度
    rule: 低于 80% 必须补测试，不准跳过
```

---

## §T3 测试用例矩阵

### T3.1 加密模块测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| C1 | AES-256-GCM 加密/解密 round-trip | Unit | P0 | `decrypt(encrypt(plaintext, dek), dek) === plaintext` |
| C2 | 不同 DEK 不可互相解密 | Unit | P0 | 用 DEK-A 加密，DEK-B 解密抛 `AuthenticationError` |
| C3 | 篡改密文导致 AuthTag 校验失败 | Unit | P0 | 修改密文任意字节，解密抛 `ERR_OSSL_BAD_DECRYPT` |
| C4 | 篡改 IV 导致解密失败 | Unit | P0 | 修改 IV，解密出错或抛异常 |
| C5 | KEK 加密/解密 DEK round-trip | Unit | P0 | `decryptDEK(encryptDEK(dek, kek), kek) === dek` |
| C6 | DEK 缓存命中（5分钟内） | Unit | P1 | 第二次调用 `getOrCreateDEK` 不查数据库 |
| C7 | DEK 缓存过期（5分钟后） | Unit | P1 | TTL 过期后重新查数据库加载 DEK |
| C8 | DEK 缓存 LRU 淘汰 | Unit | P1 | 缓存满时淘汰最久未用的 DEK |
| C9 | SIGTERM 清空所有 DEK 缓存 | Unit | P0 | 进程退出信号后 `dekCache.size === 0` |
| C10 | 并发请求同一 conversation DEK | Integration | P1 | 不产生重复 DEK 记录（singleflight） |
| C11 | 空字符串加密 | Unit | P1 | 正常加密，解密回空字符串 |
| C12 | Unicode/Emoji 消息加密 | Unit | P1 | `decrypt(encrypt("你好🎉"), dek) === "你好🎉"` |
| C13 | 大消息加密（1MB） | Unit | P2 | 正常完成，耗时 < 100ms |
| C14 | KEK 版本不存在 | Unit | P0 | 抛出 `KEKVersionNotFoundError` |

```typescript
// 示例：Agent 直接可用的测试代码
// tests/unit/crypto/envelope-encryption.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvelopeEncryptionService } from '@/crypto/envelope-encryption';
import { randomBytes } from 'crypto';

describe('EnvelopeEncryptionService', () => {
  let service: EnvelopeEncryptionService;
  const testDEK = randomBytes(32);

  beforeEach(() => {
    service = new EnvelopeEncryptionService(mockSupabase, mockRedis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('encrypt/decrypt round-trip', () => {
    it('C1: should encrypt and decrypt plaintext correctly', () => {
      const plaintext = 'Hello, World!';
      const cipherBundle = service.encrypt(plaintext, testDEK);
      const decrypted = service.decrypt(cipherBundle, testDEK);
      expect(decrypted).toBe(plaintext);
    });

    it('C2: should fail decryption with wrong DEK', () => {
      const plaintext = 'secret message';
      const wrongDEK = randomBytes(32);
      const cipherBundle = service.encrypt(plaintext, testDEK);
      expect(() => service.decrypt(cipherBundle, wrongDEK)).toThrow();
    });

    it('C3: should fail on tampered ciphertext', () => {
      const cipherBundle = service.encrypt('test', testDEK);
      // Tamper with ciphertext (after IV + AuthTag)
      cipherBundle[30] ^= 0xff;
      expect(() => service.decrypt(cipherBundle, testDEK)).toThrow();
    });

    it('C12: should handle Unicode and emoji', () => {
      const plaintext = '你好世界🎉🔥';
      const cipherBundle = service.encrypt(plaintext, testDEK);
      expect(service.decrypt(cipherBundle, testDEK)).toBe(plaintext);
    });
  });

  describe('DEK cache', () => {
    it('C6: should return cached DEK within TTL', async () => {
      const spy = vi.spyOn(mockSupabase.from('encryption_keys'), 'select');
      await service.getOrCreateDEK('conv-1');
      await service.getOrCreateDEK('conv-1'); // second call
      expect(spy).toHaveBeenCalledTimes(1); // only one DB call
    });

    it('C9: should clear all caches on SIGTERM', () => {
      process.emit('SIGTERM');
      // Verify caches are empty
      expect(service['dekCache'].size).toBe(0);
      expect(service['kekCache'].size).toBe(0);
    });
  });
});
```

### T3.2 Ticket 鉴权测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| A1 | 有效 ticket 首次使用 | Unit | P0 | 返回 payload，Redis 删除 ticket |
| A2 | ticket 二次使用（重放攻击） | Unit | P0 | 返回 null（已被核销） |
| A3 | 过期 ticket（>30s） | Unit | P0 | 返回 null（Redis TTL 已过期） |
| A4 | 无效格式 ticket | Unit | P0 | 返回 null |
| A5 | ticket 前缀不是 `ws_` | Unit | P1 | 返回 null |
| A6 | 并发核销同一 ticket | Integration | P0 | 仅一个成功（Lua CAS 原子性） |
| A7 | Redis 不可用时 ticket 验证 | Integration | P0 | 抛出 ServiceUnavailableError |
| A8 | Agent ws-ticket 接口 — 有效 API Key | Integration | P0 | 201 + { ticket, expires_in: 30 } |
| A9 | Agent ws-ticket 接口 — 无效 API Key | Integration | P0 | 403 forbidden |
| A10 | Agent ws-ticket 接口 — 无 Authorization Header | Integration | P0 | 401 unauthorized |
| A11 | Visitor ws-ticket 接口 — 有效 session | Integration | P0 | 201 + { ticket, expires_in: 30 } |
| A12 | Visitor ws-ticket 接口 — 无效 session_token | Integration | P0 | 403 forbidden |
| A13 | ws-ticket 接口 — 频率限制 | Integration | P1 | 429 rate_limited |

```typescript
// tests/unit/auth/ticket-verifier.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TicketVerifier } from '@/auth/ticket-verifier';
import { createMockRedis } from '../../mocks/redis';

describe('TicketVerifier', () => {
  let verifier: TicketVerifier;
  let redis: MockRedis;

  beforeEach(() => {
    redis = createMockRedis();
    verifier = new TicketVerifier(redis);
  });

  it('A1: should verify and consume valid ticket', async () => {
    const payload = { agent_id: 'agent-1', owner_id: 'owner-1', scope: 'ws:connect' };
    await redis.setex('ws_ticket:ws_abc123', 30, JSON.stringify(payload));

    const result = await verifier.verifyAndConsume('ws_abc123');
    expect(result).toEqual({ valid: true, ...payload });

    // Ticket consumed — second use should fail
    const result2 = await verifier.verifyAndConsume('ws_abc123');
    expect(result2).toEqual({ valid: false });
  });

  it('A4: should reject invalid format', async () => {
    const result = await verifier.verifyAndConsume('invalid_ticket');
    expect(result).toEqual({ valid: false });
  });

  it('A6: concurrent ticket consumption — only one succeeds', async () => {
    await redis.setex('ws_ticket:ws_race', 30, JSON.stringify({ agent_id: 'a1' }));
    const results = await Promise.all([
      verifier.verifyAndConsume('ws_race'),
      verifier.verifyAndConsume('ws_race'),
      verifier.verifyAndConsume('ws_race'),
    ]);
    const successes = results.filter(r => r.valid);
    expect(successes).toHaveLength(1);
  });
});
```

### T3.3 WebSocket 连接与消息路由测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| W1 | Visitor 通过 ticket 建连成功 | Integration | P0 | WS open, 收到 `connection_ack` |
| W2 | Agent 通过 ticket 建连成功 | Integration | P0 | WS open, 收到 `connection_ack` |
| W3 | 无 ticket 建连 | Integration | P0 | WS close 4001 `missing_ticket` |
| W4 | 无效 ticket 建连 | Integration | P0 | WS close 4003 `invalid_ticket` |
| W5 | Visitor 发消息 → Agent 收到 | Integration | P0 | Agent WS 收到消息 + Visitor 收到 `ack:sent` |
| W6 | Agent 回复 → Visitor 收到 | Integration | P0 | Visitor WS 收到回复 |
| W7 | Agent 流式回复 → Visitor 逐 chunk 收到 | Integration | P0 | Visitor 收到多个 `stream_chunk` + 最终 `stream_end` |
| W8 | Agent 离线 → 消息标记 failed | Integration | P0 | Visitor 收到 `ack:failed` + reason=agent_unreachable |
| W9 | 心跳超时 → 连接关闭 | Integration | P1 | 30s 无 pong → WS close |
| W10 | 重连后消息恢复 | Integration | P1 | 重连后可从 Edge Function 拉取离线消息 |
| W11 | 消息幂等去重 | Integration | P0 | 相同 message_id 只处理一次 |
| W12 | 限流触发 | Integration | P1 | 超过频率返回 `rate_limited` 错误帧 |
| W13 | QRCode 已暂停 → 拒绝建连 | Integration | P1 | WS close 4004 `qrcode_paused` |
| W14 | 消息写入 DB 后才 ACK | Integration | P0 | persist 成功后才发 `ack:sent` |
| W15 | 1000 并发连接压力测试 | E2E | P2 | 全部成功建连，内存 < 512MB |

```typescript
// tests/integration/gateway/ws-connection.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createTestGateway, createTestRedis } from '../../helpers/setup';

describe('WebSocket Connection', () => {
  let gateway: TestGateway;
  let redis: TestRedis;

  beforeAll(async () => {
    redis = await createTestRedis();
    gateway = await createTestGateway({ redis });
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
    await redis.disconnect();
  });

  it('W1: visitor connects with valid ticket', async () => {
    // Arrange: create ticket in Redis
    const ticket = 'ws_test_visitor_1';
    await redis.setex(`ws_ticket:${ticket}`, 30, JSON.stringify({
      visitor_session_id: 'sess-1',
      owner_id: 'owner-1',
      scope: 'ws:connect',
    }));

    // Act: connect
    const ws = new WebSocket(`${gateway.wsUrl}?ticket=${ticket}`);
    const msg = await waitForMessage(ws);

    // Assert
    expect(msg.type).toBe('connection_ack');
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('W3: connection without ticket is rejected', async () => {
    const ws = new WebSocket(gateway.wsUrl);
    const closeEvent = await waitForClose(ws);
    expect(closeEvent.code).toBe(4001);
    expect(closeEvent.reason).toBe('missing_ticket');
  });

  it('W4: connection with invalid ticket is rejected', async () => {
    const ws = new WebSocket(`${gateway.wsUrl}?ticket=ws_invalid`);
    const closeEvent = await waitForClose(ws);
    expect(closeEvent.code).toBe(4003);
    expect(closeEvent.reason).toBe('invalid_ticket');
  });
});
```

### T3.4 Redis 熔断器测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| R1 | 正常状态（CLOSED）操作成功 | Unit | P0 | 返回结果，failureCount = 0 |
| R2 | 连续 5 次失败 → 熔断（OPEN） | Unit | P0 | 第 6 次立即抛 ServiceUnavailableError |
| R3 | 熔断 30s 后 → 半开（HALF_OPEN） | Unit | P0 | 允许一次尝试 |
| R4 | 半开状态成功 → 闭合（CLOSED） | Unit | P0 | 恢复正常 |
| R5 | 半开状态失败 → 重新打开（OPEN） | Unit | P0 | 重置计时器 |
| R6 | 熔断时降级行为：Ticket 验证 | Integration | P0 | 拒绝新连接 |
| R7 | 熔断时降级行为：路由缓存 | Integration | P1 | 直连 Supabase |
| R8 | 熔断时降级行为：限流 | Integration | P1 | 宽放通过 + 告警日志 |

### T3.5 E2E 测试场景

| # | 用户流程 | 覆盖场景 | 优先级 |
|---|---------|---------|--------|
| E1 | Visitor 完整聊天流 | 扫码→建连→发消息→收回复→关闭 | P0 |
| E2 | Agent 建连与接收 | 获取 ticket→建连→收到消息→回复 | P0 |
| E3 | Owner QRCode 管理 | 登录→创建 QR→配置→暂停→激活 | P0 |
| E4 | WS 断线重连 | 建连→断网→重连→消息恢复 | P1 |
| E5 | 流式输出降级 | WS→SSE→Polling 自动降级 | P1 |
| E6 | 多 Visitor 同时聊天 | 3 个 Visitor 同时与 1 个 Agent 对话 | P1 |

---

## §T4 Mock 策略

```typescript
// tests/mocks/supabase.ts — Agent 直接可用
import { vi } from 'vitest';

export function createMockSupabase() {
  const mockFrom = (table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    from: vi.fn(mockFrom),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// tests/mocks/redis.ts
export function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item || item.expiresAt < Date.now()) { store.delete(key); return null; }
      return item.value;
    }),
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    eval: vi.fn(async (script: string, numKeys: number, ...keys: string[]) => {
      // Simulate Lua CAS for ticket consumption
      const key = keys[0];
      const item = store.get(key);
      if (item && item.expiresAt > Date.now()) {
        store.delete(key);
        return item.value;
      }
      return null;
    }),
    _store: store, // for test assertions
  };
}

// tests/helpers/ws-test-client.ts
export class WSTestClient {
  private ws: WebSocket;
  private messages: any[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()));
    });
  }

  async waitForMessage(type?: string, timeoutMs = 5000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = type
        ? this.messages.findIndex(m => m.type === type)
        : 0;
      if (idx >= 0) return this.messages.splice(idx, 1)[0];
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for message ${type || 'any'}`);
  }

  send(payload: any) { this.ws.send(JSON.stringify(payload)); }
  close() { this.ws.close(); }
  get readyState() { return this.ws.readyState; }
}
```

---

## §T5 CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --coverage --reporter=json --outputFile=coverage.json
      - name: Check coverage threshold
        run: |
          node -e "
            const c = require('./coverage.json');
            const { branches, functions, lines, statements } = c.total;
            const pass = [branches, functions, lines, statements].every(m => m.pct >= 80);
            if (!pass) { console.error('Coverage below 80%'); process.exit(1); }
          "

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## §T6 覆盖率目标分解

| 模块 | 目标覆盖率 | 测试类型重心 | 理由 |
|------|-----------|------------|------|
| `crypto/` | 95% | Unit | 加密模块零容忍，任何路径都必须测试 |
| `auth/` | 90% | Unit + Integration | 安全关键路径 |
| `routing/` | 85% | Unit + Integration | 路由正确性直接影响消息投递 |
| `protocol/` | 85% | Unit | 消息格式校验必须严格 |
| `ws/` | 80% | Integration + E2E | WebSocket 需真实连接测试 |
| `edge-functions/` | 80% | Integration | 涉及 DB 操作 |
| **Overall** | **≥ 80%** | 混合 | CI 门禁 |

---

## §T7 辩论修正补充（第三轮共识）

### T7.1 测试治理与准入矩阵（覆盖六类测试）

| 测试类型 | 范围 | 工具 | Owner | 准入条件 | 通过标准 |
|---------|------|------|-------|---------|---------|
| 单元测试 | Gateway 核心模块 | Vitest | Backend | PR 合并前 | 覆盖率 ≥ 85% |
| 协议契约 | §P 所有帧类型 | JSON Schema + fixtures | SDK/Backend/QA | 每次协议变更 | 100% 通过 |
| 集成测试 | Gateway + Redis + DB | Docker Compose + Vitest | Backend | 提测前 | 主路径 100% |
| E2E | Browser ↔ Gateway ↔ Agent | Playwright | QA | 提测前 | 主链路 100% |
| 混沌测试 | Redis/断网/重连/流中断 | k6 + 故障注入 | Backend/QA | 预发前 | 关键场景 100% |
| 安全测试 | 鉴权/重放/注入/限流 | OWASP ZAP + 自研 | Security | 上线前 | 高危 0, 严重 0 |

### T7.2 协议合规 Fixtures 目录规范

```
fixtures/
  protocol/
    visitor.chat_message.valid.json
    visitor.chat_message.invalid_type.json
    visitor.chat_message.missing_id.json
    visitor.chat_message.too_large.json
    agent.stream_chunk.valid.json
    agent.stream_end.valid.json
    agent.stream_abort.agent_disconnected.json
    agent.stream_abort.timeout.json
    gateway.connection_ack.valid.json
    gateway.ack.sent.json
    gateway.ack.delivered.json
    gateway.ack.failed.json
    gateway.error.429.json
    gateway.error.503.json
    gateway.system.agent_online.json
    gateway.system.qrcode_paused.json
```

每个 fixture 必须附带 `*.schema.json`，CI 自动校验。

### T7.3 新增流式中断测试用例

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| W16 | Agent 发 3 chunk 后断连 | Integration | P0 | Visitor 收到 stream_abort(agent_disconnected) |
| W17 | stream_abort 后 Agent 重发完整流 | Integration | P0 | 新 message_id，前端渲染新气泡 |
| W18 | 30s 无 chunk → 超时中断 | Integration | P0 | Visitor 收到 stream_abort(timeout) |
| W19 | Gateway 重启 → 所有进行中流中断 | Integration | P1 | 所有 Visitor 收到 stream_abort(gateway_shutdown) |

### T7.4 混沌工程四场景

```yaml
场景 A（断网重连去重）:
  步骤: TCP 断开 → 重连 → 重发同 client_msg_id
  断言: Redis 防重放拦截，不二次入库

场景 B（流式中断终止）:
  步骤: stream_chunk 序号 3 后断开 Agent WS
  断言: Gateway → Visitor stream_abort + 前端标记失败

场景 C（Redis 不可用）:
  步骤: kill Redis 进程
  断言: Gateway 500ms 内返回 503 + Redis 恢复后自动解除

场景 D（Gateway 重启）:
  步骤: PM2 restart
  断言: 前端自动重连 + Session 恢复 + 历史消息可拉取
```

### T7.5 发版门禁硬指标

| 指标 | 阈值 | 阻断级别 |
|------|------|---------|
| 协议契约测试 | 100% 通过 | 🔴 硬阻断 |
| 核心单测覆盖率 | ≥ 85% | 🔴 硬阻断 |
| E2E 主路径 | 100% 通过 | 🔴 硬阻断 |
| 高危漏洞 | 0 | 🔴 硬阻断 |
| 严重缺陷 | 0 | 🔴 硬阻断 |
| 并发 WS 压测 | ≥ 200 连接 | 🟡 软阻断（需审批） |
| 消息转发 p99 | < 300ms | 🟡 软阻断 |
| 流式首 token 开销 | < 500ms | 🟡 软阻断 |
| 历史解密 API p99 | < 800ms | 🟡 软阻断 |
| 压测轮次 | 连续 3 轮达标 | 🟡 软阻断 |

---

## §T8 第四轮辩论修正（R4, 2026-03-12）

### T8.1 数据安全不变量测试（CI 硬门禁）

> R4 共识: 以下测试在每次 CI 运行中强制执行，失败即阻断合并。

```typescript
// tests/security-invariants.test.ts
describe('数据安全不变量', () => {
  test('日志中不得出现明文内容', async () => {
    // 执行一组标准操作（发消息、建连、断连）
    const logs = await captureLogsDuring(async () => {
      await sendTestMessage('Hello secret content');
      await createWsConnection();
      await disconnectWs();
    });
    const logText = logs.join('\n');
    expect(logText).not.toContain('Hello secret content');
    expect(logText).not.toMatch(/session_token\s*[:=]\s*sess_/);
    expect(logText).not.toMatch(/api_key\s*[:=]\s*sk_/);
  });

  test('数据库中不得存在明文消息', async () => {
    await sendTestMessage('Sensitive plaintext 12345');
    const row = await db.from('messages').select('content_encrypted').single();
    // content_encrypted 是 bytea，不应包含明文片段
    const hexStr = Buffer.from(row.content_encrypted).toString('utf-8');
    expect(hexStr).not.toContain('Sensitive plaintext');
    expect(hexStr).not.toContain('12345');
  });

  test('ws_ticket 必须单次核销', async () => {
    const { ticket } = await getWsTicket();
    const conn1 = await connectWithTicket(ticket);
    expect(conn1.readyState).toBe(WebSocket.OPEN);
    // 二次使用必须失败
    const conn2Result = await connectWithTicket(ticket).catch(e => e);
    expect(conn2Result.closeCode).toBe(4003);
  });

  test('encryption_keys 表不存在明文 DEK', async () => {
    const keys = await db.from('encryption_keys').select('key_data_encrypted');
    for (const k of keys) {
      // key_data_encrypted 应该是 KEK 加密后的密文
      expect(Buffer.from(k.key_data_encrypted).length).toBeGreaterThan(32);
      // 不应以明文 AES key 的特征开头
      expect(Buffer.from(k.key_data_encrypted).toString('hex').startsWith('0000')).toBe(false);
    }
  });
});
```

### T8.2 StreamBuffer 背压与快速失败测试

```typescript
// tests/stream-buffer.test.ts
describe('StreamBuffer R4 共识', () => {
  test('C7: 落库失败时立即丢弃 buffer 并通知双端', async () => {
    // Mock DB 写入失败
    vi.spyOn(db, 'storeEncryptedMessage').mockRejectedValueOnce(new Error('DB timeout'));
    
    const visitorWsSpy = vi.fn();
    const buffer = new StreamBuffer();
    buffer.handleChunk('msg-1', 'Hello ', false, { visitorWs: { send: visitorWsSpy } });
    buffer.handleChunk('msg-1', 'World', true, {});
    
    await buffer.flush('msg-1', 'complete');
    
    // 验证: buffer 已释放
    expect(buffer.buffers.has('msg-1')).toBe(false);
    // 验证: Visitor 收到 stream_abort
    expect(visitorWsSpy).toHaveBeenCalledWith(expect.stringContaining('stream_abort'));
  });

  test('C8: 活跃 buffer 达 80% 时触发 Agent WS 背压', async () => {
    const buffer = new StreamBuffer(); // MAX = 500
    const agentWs = { pause: vi.fn(), resume: vi.fn() };
    buffer.registerAgent(agentWs);
    
    // 填充到 400 个 buffer (80%)
    for (let i = 0; i < 400; i++) {
      buffer.handleChunk(`msg-${i}`, 'chunk', false, {});
    }
    
    buffer.checkBackpressure();
    expect(agentWs.pause).toHaveBeenCalled();
  });
});
```

### T8.3 ACK 双层状态机测试

```typescript
// tests/ack-state-machine.test.ts
describe('ACK 双层分离 (R4 共识 C10)', () => {
  test('Layer 1: 摄入成功返回 persisted', async () => {
    const ack = await sendVisitorMessage('test');
    expect(ack.payload.status).toBe('persisted');
    expect(ack.payload.message_id).toBeDefined();
  });

  test('Layer 1: 幂等去重返回 duplicate', async () => {
    const msgId = crypto.randomUUID();
    await sendVisitorMessage('test', { idempotency_key: msgId });
    const ack2 = await sendVisitorMessage('test', { idempotency_key: msgId });
    expect(ack2.payload.status).toBe('duplicate');
  });

  test('Layer 2: 投递成功异步推送 dispatched', async () => {
    const dispatched = await waitForAck('dispatched', async () => {
      await sendVisitorMessage('hello agent');
    });
    expect(dispatched.payload.status).toBe('dispatched');
  });

  test('Layer 2: Agent 离线时投递返回 failed', async () => {
    await disconnectAgent();
    const ack = await sendVisitorMessage('hello offline agent');
    // Layer 1 仍然成功
    expect(ack.payload.status).toBe('persisted');
    // Layer 2 异步返回 failed
    const delivery = await waitForAck('failed');
    expect(delivery.payload.fail_reason).toBe('agent_unreachable');
  });
});
```

### T8.4 Owner Edge Function 解密测试

```typescript
// tests/owner-decrypt.test.ts
describe('Owner 历史消息解密 (R4 共识 C5)', () => {
  test('Owner 可通过 Edge Function 解密自己的消息', async () => {
    // 先通过 Gateway 发送一条加密消息
    await sendVisitorMessage('Secret message for owner');
    
    // Owner 通过 Edge Function 拉取
    const res = await supabase.functions.invoke('get-decrypted-messages', {
      body: { conversation_id: testConversationId, limit: 10 }
    });
    
    expect(res.data.data[0].content).toBe('Secret message for owner');
  });

  test('Owner 不能解密其他 Owner 的消息', async () => {
    const res = await otherOwnerClient.functions.invoke('get-decrypted-messages', {
      body: { conversation_id: testConversationId, limit: 10 }
    });
    expect(res.error.status).toBe(403);
  });

  test('Gateway 不暴露解密 HTTP 接口', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/messages/decrypt`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerJwt}` }
    });
    expect(res.status).toBe(404); // Gateway 根本没有这个路由
  });
});
```

### T8.5 Redis 熔断器测试

```typescript
// tests/redis-circuit-breaker.test.ts
describe('Redis Fail-fast (R4 共识 C2)', () => {
  test('Redis 宕机时新连接返回 503', async () => {
    await killRedis();
    // 等待熔断器打开
    await triggerRedisFailures(5);
    
    const res = await fetch(`${GATEWAY_URL}/api/v1/visitor/ws-ticket`, {
      method: 'POST',
      headers: { 'X-Session-Token': validToken }
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  test('Redis 宕机时已有连接 30s 内优雅断开', async () => {
    const ws = await createWsConnection();
    await killRedis();
    await triggerRedisFailures(5);
    
    // 应收到 service_degraded 错误帧
    const errorFrame = await waitForWsMessage(ws, 'error');
    expect(errorFrame.payload.code).toBe('service_degraded');
    
    // 30s 内应收到 close
    const closeEvent = await waitForWsClose(ws, 35000);
    expect(closeEvent.code).toBe(1013);
  });

  test('Redis 恢复后自动接受新连接', async () => {
    await killRedis();
    await triggerRedisFailures(5);
    await restartRedis();
    
    // 等待熔断器恢复 (3 次 PING 成功)
    await sleep(8000);
    
    const res = await fetch(`${GATEWAY_URL}/api/v1/visitor/ws-ticket`, {
      method: 'POST',
      headers: { 'X-Session-Token': validToken }
    });
    expect(res.status).toBe(200);
  });
});
```


---

# 补充章节 B：前后端协议完整规范

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
