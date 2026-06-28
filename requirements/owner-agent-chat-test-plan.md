# QRClaw Owner Agent Chat 测试方案

> **版本**: V0.1  
> **日期**: 2026-04-27  
> **状态**: 测试方案草案  
> **修订记录**: 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 B1/B2/B3/B5/B8/B9/B10/B11/B12/M3/M6/M7/M8，并补充 B13。  
> **配套产品文档**: `requirements/owner-agent-chat-product-requirements.md`  
> **配套技术文档**: `requirements/owner-agent-chat-technical-specification.md`  
> **配套设计文档**: `design/owner-agent-chat-design-spec.md`  
> **覆盖率要求**: ≥ 80% branches / functions / lines / statements

---

## 一、测试目标

Owner Agent Chat 的测试目标是证明：

1. Owner 私聊数据隔离正确。
2. 消息和 run event 全程加密存储。
3. Gateway 只做中立中继，不执行 AI 推理。
4. 本地 Host 能可靠探测并调用 provider。
5. Chat UI 在在线、离线、并发、失败场景下行为清晰。
6. Visitor / QR 既有链路不被破坏。

---

## 二、测试分层

```text
tests/
├── unit/
│   ├── shared/contracts-owner-agent-chat.test.ts
│   ├── gateway/owner-agent-chat-service.test.ts
│   ├── gateway/host-token.test.ts
│   └── frontend/owner-agent-chat-store.test.ts
├── integration/
│   ├── database/owner-agent-chat-rls.test.ts
│   ├── gateway/owner-agent-chat-api.test.ts
│   ├── gateway/owner-agent-chat-ws.test.ts
│   └── edge-functions/decrypted-owner-agent-chat.test.ts
├── e2e/
│   └── web/owner-agent-chat.spec.ts
└── provider/
    ├── openclaw-real.test.ts
    ├── claude-real.test.ts
    ├── cursor-real.test.ts
    └── codex-real.test.ts
```

Go Host：

```text
qrclaw-agent-host/
├── internal/detect/*_test.go
├── internal/provider/*/*_test.go
├── internal/ws/*_test.go
└── internal/auth/*_test.go
```

---

## 三、TDD 要求

每个功能模块遵循：

```text
RED: 写失败测试
GREEN: 最小实现
REFACTOR: 保持测试通过
VERIFY: 运行相关 package 验证
```

不得先实现后补“快乐路径”测试。

---

## 四、数据库与 RLS 测试

### 4.1 Schema 测试

| ID | 场景 | 预期 |
|----|------|------|
| DB-01 | 新表存在 | 9 张新增表存在 |
| DB-02 | RLS 开启 | 新增 public 表全部 `rls_enabled = true` |
| DB-03 | token 原文 | `agent_host_tokens` 无 token 原文字段 |
| DB-04 | run event 序号 | 同一 `run_id, seq` 不能重复 |
| DB-05 | 主会话唯一 | 同一 `owner_id, agent_id` 只能一个 active conversation |
| DB-06 | conversation cascade | 删除 conversation 后 messages / runs / events / keys 级联消失 |
| DB-07 | token hash 唯一性 | `agent_host_tokens.token_hash` 重复插入失败 |
| DB-08 | Owner 私聊密钥 | `owner_agent_conversation_keys` active key 唯一 |
| DB-09 | agents 扩展字段 | `description` / `avatar_url` / `instructions` / `suggested_prompts` / `execution_mode` / `archived` 存在，且 instructions 长度、prompts 数量和单条长度 CHECK 生效 |

### 4.2 RLS 隔离

| ID | 场景 | 预期 |
|----|------|------|
| RLS-01 | Owner A 读自己的 Agent | 成功 |
| RLS-02 | Owner A 读 Owner B 的 Agent Host | 返回空 |
| RLS-03 | Owner A 读 Owner B 的 conversation | 返回空 |
| RLS-04 | Owner A 读 Owner B 的 messages | 返回空 |
| RLS-05 | Owner A 撤销自己的 token | 成功 |
| RLS-06 | Owner A 撤销 Owner B 的 token | 失败或 0 rows |
| RLS-07 | Owner A 伪造 `owner_id` 写 run | 被拒绝 |
| RLS-08 | Owner A 通过 provider 表跨 host 读取 | 返回空 |
| RLS-09 | invalid JWT / plugin-style Bearer 直接读 owner-private 表 | 降级验证：保持伪造字符串，PostgREST 以 `PGRST301` 拒绝 invalid JWT；anon baseline 直接表读返回空 |
| RLS-09b | plugin-scope JWT 调 owner-private actor | `.skip` 占位；Wave 3 签发真实 plugin-scope JWT 后启用并断言 403 |
| RLS-10 | owner 客户端无法取得 service role 能力 | 403 / 不可访问 |

### 4.3 加密存储

| ID | 场景 | 预期 |
|----|------|------|
| ENC-01 | Owner message 落库 | 只有 `content_encrypted`，无明文字段 |
| ENC-02 | Agent message 落库 | 只有密文 |
| ENC-03 | run event 落库 | `content_encrypted` 不含原文 |
| ENC-04 | Edge Function 读历史 | 返回解密后的历史消息 |
| ENC-05 | Gateway 日志 | 不出现明文消息、DEK、KEK、token |

---

## 五、Contracts 测试

### 5.1 HTTP Contracts

测试文件：

```text
tests/unit/shared/http-owner-agent-chat-contracts.test.ts
```

覆盖：

- `CreateOwnerAgentRequest`
- `CreateOwnerAgentResponse`
- `SendOwnerAgentMessageRequest`
- `SendOwnerAgentMessageResponse`
- `CreateHostTokenRequest`
- `CreateHostTokenResponse`
- `CancelOwnerAgentRunRequest`

要求：

- TypeScript interface 与 Zod schema parity。
- 非法 provider 被拒绝。
- 缺少 Full Access 确认时创建本地 Agent 被拒绝。
- 消息空字符串被拒绝。

### 5.2 WS Contracts

测试文件：

```text
tests/unit/shared/contracts-ws-owner-agent-chat.test.ts
```

覆盖 frame：

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

要求：

- inbound / outbound schema 验证。
- 所有 run frame 必须有 `run_id`。
- event frame 必须有递增 `seq`。
- seq gap 必须触发 `run_failed(seq_gap)`。
- event delta 单帧不超过 4 KB。
- frame body 不允许超出 Gateway 限制。

---

## 六、Gateway 测试

### 6.1 HTTP API

| ID | API | 场景 | 预期 |
|----|-----|------|------|
| API-01 | `POST /api/owner/host-tokens` | 已登录 Owner 创建 token | 返回 token 原文一次 |
| API-02 | `DELETE /api/owner/host-tokens/:id` | 撤销 token | 后续 Host 连接失败 |
| API-03 | `POST /api/owner/agents` | 创建本地 Agent 未确认 Full Access | 400 |
| API-04 | `POST /api/owner/agents` | 创建云端 Agent | 成功 |
| API-05 | `POST /api/owner/agents/:id/messages` | Host 在线 | 写 message + run + 下发 WS |
| API-06 | 同上 | Host 离线 | 保存 pending，不执行 |
| API-07 | `POST /api/owner/agents/:id/conversation/reset` | 重置上下文 | 写 system message、取消 in-flight run、清空 provider session/workdir、通知 Host |

### 6.2 WS 路由

| ID | 场景 | 预期 |
|----|------|------|
| WS-01 | Host register | registry 记录连接，DB 更新 last_seen |
| WS-02 | capabilities updated | DB upsert provider 能力 |
| WS-03 | run request | 只发给绑定 Host |
| WS-04 | run event | 加密写入 event，fanout 给 Owner |
| WS-05 | run completed | 写 Agent final message |
| WS-06 | run failed | run 标记 failed，UI 收到错误 |
| WS-07 | revoked token reconnect | 连接被拒绝 |
| WS-08 | token 热撤销 | 已在线 Host 被断开 |
| WS-09 | 多 Host 路由 | run 发给 binding 指定 Host |
| WS-10 | stream resume | 刷新后从 run events 恢复进行中回复 |
| WS-11 | mock host harness | mock Host register/run/event/cancel/reset 全链路通过 |

### 6.3 并发

| ID | 场景 | 预期 |
|----|------|------|
| CON-01 | 同 Agent 连续发送 2 条 | 生成两个 run_id |
| CON-02 | Host 并发支持 | 两个 run stream 不串线 |
| CON-03 | Host 仅支持串行 | 第二个 run 显示 queued |
| CON-04 | 取消一个 run | 另一个 run 不受影响 |
| CON-05 | run timeout | 30 分钟无 event 自动 failed(timeout) |
| CON-06 | pending 上限 | 单会话超过 50 条 pending 返回 429 |
| CON-07 | pending 过期 | 7 天后标 expired，不自动执行 |

---

## 七、Web 测试

### 7.1 Unit

覆盖：

- Chat store 按 `run_id` 合并 stream chunk。
- Agent 列表只显示已创建 Agent。
- 离线状态发送后进入 pending。
- 重置上下文不删除历史消息。

### 7.2 Component

覆盖：

- Chat 空态。
- Agent 列表卡片。
- 创建 Agent Full Access 确认。
- Host token 弹窗。
- 离线/待处理/失败 badge。

### 7.3 Visual / Accessibility

检查：

- 不新增硬编码 hex。
- 不使用不存在 token。
- 按钮、输入框、列表项可键盘访问。
- Full Access 确认可被屏幕阅读器识别。

---

## 八、Go Host 测试

### 8.1 Detect

| ID | 场景 | 预期 |
|----|------|------|
| HOST-DET-01 | PATH 有 `claude` | provider available |
| HOST-DET-02 | env override path | 使用 override |
| HOST-DET-03 | CLI 不存在 | provider 不上报 |
| HOST-DET-04 | `--version` 失败 | provider status unavailable |
| HOST-DET-05 | 版本过低 | provider status incompatible |
| HOST-DET-06 | health check 失败 | provider 不进入创建 Agent 可选列表 |

### 8.2 Auth

| ID | 场景 | 预期 |
|----|------|------|
| HOST-AUTH-01 | login token 成功 | 保存 scoped token |
| HOST-AUTH-02 | token 文件权限 | chmod 600 |
| HOST-AUTH-03 | logout | 删除本地 token |
| HOST-AUTH-04 | revoked token | WS 连接失败 |

### 8.3 Provider Adapter

统一 adapter 测试：

- `Detect`
- `StartRun`
- `RunEvent` channel closes
- cancel
- timeout
- stderr error
- graceful cancel → 5 秒后强制 kill
- channel close 前必须发最终 completed/failed 事件

---

## 九、Provider 真实 CLI 专项

这些测试默认不在普通 CI 跑，使用环境变量显式开启：

```text
QRCLAW_PROVIDER_E2E=1
```

| Provider | 必测 |
|----------|------|
| OpenClaw | `--local` 执行、最终文本、失败路径 |
| Claude Code | `--permission-mode bypassPermissions`、stream-json、取消 |
| Cursor Agent | `--yolo`、流式输出、失败路径 |
| Codex | app-server / JSON-RPC 参数确认后补齐 |

如果本机缺少对应 CLI，测试应 skip 并报告原因。

---

## 十、E2E 用户流程

### 10.1 Happy Path

```text
登录 Dashboard
→ 生成 Host token
→ 启动 qrclaw-agent-host
→ Host 上报 OpenClaw
→ 创建 OpenClaw Agent
→ 进入 Chat
→ 发送消息
→ 收到 Agent 回复
→ 刷新页面
→ 历史消息可回放
```

### 10.1b Reload During Stream

```text
发送消息
→ Agent 正在流式回复
→ 刷新页面
→ UI 恢复 final messages 和 active run 文本 event
→ run 完成后写最终 Agent message
```

### 10.1c Reset Context

```text
打开已有 Agent Chat
→ 点击重置上下文
→ 确认后保留历史消息
→ provider_session_id / provider_work_dir 清空
→ 下一条消息以新上下文执行
```

### 10.2 Offline Path

```text
Host 断开
→ Chat 显示离线
→ 发送消息
→ 消息保存为待处理
→ 不自动执行
```

### 10.3 Security Path

```text
Owner A 创建 Agent 和消息
→ Owner B 登录
→ Owner B 看不到 Owner A 的 Agent / Chat / Host
```

### 10.3b Owner Deletion

```text
Owner 删除账号或触发 GDPR 删除
→ owner_agent_* / owner_agent_conversation_keys / host token 级联清理
→ 无孤儿密文或 token hash
```

### 10.4 Regression Path

```text
现有 Visitor 扫码聊天
→ Agent plugin history replay
→ decrypted-messages 三 actor 旧路径
→ plugin agent token 不能读取 owner-private actor
```

---

## 十一、验证命令

按变更范围运行：

```bash
cd gateway && npm run typecheck
cd web && npm run build
cd tests && npx vitest run
cd tests && npx playwright test
cd qrclaw-agent-host && go test ./...
cd web && npm run lint
```

Supabase：

```bash
supabase migration list
supabase db advisors
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
```

日志脱敏检查：

```bash
rg "console\\.(log|warn|error)|log\\." gateway/src qrclaw-agent-host
```

检查输出中不能记录 message content、token、KEK、DEK、完整环境变量。

---

## 十二、完成标准

P0 完成标准：

- OpenClaw provider happy path 跑通。
- Owner 私聊可发送、回复、刷新回放。
- RLS 隔离通过。
- message / event 密文落库。
- Host token 可创建、使用、撤销。
- Visitor 既有 E2E 不回归。

P1 完成标准：

- Claude Code provider 跑通。
- 并发/排队策略通过。
- 取消 run 可用。

P2/P3 完成标准：

- Cursor Agent / Codex provider 真实 CLI 专项通过；如 Codex 协议验证失败，必须由 Owner 明确签署延期决策，不能静默降级。
- 公开入口 `Publish as QR` 进入下一轮方案。

