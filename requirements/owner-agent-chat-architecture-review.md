# QRClaw Owner Agent Chat 独立架构评审报告

> **版本**: V0.6（追加 Wave 1 启动指令）
> **首版日期**: 2026-04-27（第一轮）
> **最近修订**: 2026-04-27（§十一 Wave 1 启动指令）
> **状态**: 评审报告（活文档；第二 / 三 / 四 / 五轮 + 启动指令以增量章节追加，不覆盖原文）
> **当前判定**: **Wave 1 启动指令已下达**（详见 §十一）
> **评审角色**: 独立架构评审 agent（挑战式审查 / 非实施方）
> **配套文档**:
> - 产品需求 `requirements/owner-agent-chat-product-requirements.md`
> - 技术方案 `requirements/owner-agent-chat-technical-specification.md`
> - 设计方案 `design/owner-agent-chat-design-spec.md`
> - 测试方案 `requirements/owner-agent-chat-test-plan.md`
> - 实施计划 `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md`
> - 总控 prompt `docs/superpowers/plans/2026-04-27-multica-orchestration-prompt.md`
> - 研究笔记 `docs/research/multica-agent-collaboration-notes.md`
> **目标读者**: 产品 / 技术 / 设计 / QA / Multica 总控开发负责人

---

## 一、评审范围与方法

本评审对「笔笔省智能体协作」Owner Agent Chat 方案进行**挑战式独立审查**。评审目标不是复述方案，而是：

1. 寻找产品范围缺口与边界模糊。
2. 寻找技术架构对四条铁律（C1 中立中继 / C2 加密存储 / C4 移动端零注册 / C5 消息可回放）的违背或盲区。
3. 寻找 Supabase schema / RLS / Gateway / WS / Go Host / Web 之间的契约破洞。
4. 评估测试方案与 Wave 拆分对真实风险的覆盖度。
5. 在不直接改代码的前提下，给出可执行的文档补丁建议。

评审依据除上述方案文档外，还核查了以下既有代码 / 数据库 / 契约状态以做事实对齐：

- `supabase/migrations/20260312_init_schema.sql`（messages.role CHECK / encryption_keys.conversation_id FK）
- `supabase/functions/decrypted-messages/index.ts`（M3 owner 授权链 / actor 调度 / DEK 解包）
- `shared/contracts/ws/types.ts` + `shared/contracts/ws/outbound.ts`（INBOUND/OUTBOUND closed enum、命名风格、`validateOutboundFrame`）
- `shared/contracts/http/decrypted-messages/types.ts`（`DECRYPTED_ACTORS` / discriminated request union）
- `.claude/progress/session-overview.md`（M0–M4 + Wave 1/2/3 现状 + Known Bugs 历史）
- `CLAUDE.md` / `AGENTS.md`（铁律 v1.3 / 环境与部署约束）

---

## 二、总体评价

方案在**产品意图、铁律对齐、Wave 拆分框架**上是合格的。但**离可进入开发还有距离**。最核心的问题是：

- **Owner 私聊的加密链路（DEK 写、`encryption_keys` 表归属、`decrypted-messages` Edge Function 授权链与表切换）整套没设计**——技术方案只一句"扩展 actor"就跳过了，而现有 Edge Function 的 owner 授权硬编码在 `conversations → qrcodes → agents → owners` 链上，新表完全不在这条链上。
- **WS 协议缺 ack / resume / seq-gap / reconnect / backpressure 设计**，frame 命名风格还与现有 SSoT 不兼容。
- **Host token 校验算法、热撤销、scope 解析未规定**。
- **`agent_bindings` 与"云端 agent / 现有 OpenClaw plugin 通道"的关系未定义**，唯一约束直接和未来 `Publish as QR` 冲突。
- **现有 `agents` 表扩展字段（avatar / instructions / suggested_prompts / execution_mode 等）未列入 Wave 1 migration**。
- **Wave 集成顺序导致 host ↔ gateway 协议要到 Wave 8 才打通**，会重演 OpenClaw 重构期 BUG-1 / BUG-2 类晚期暴露事故。

这些都是**Wave 1 schema 一旦落库就难以无痛回退**的决策。建议先关闭后述 12 条阻塞问题（B1–B12）再进 Wave 1。

---

## 三、阻塞问题（Blockers）

### B1. Owner 私聊的 DEK / encryption_keys 链路完全缺失

**问题**

`encryption_keys.conversation_id REFERENCES conversations(id) ON DELETE CASCADE`（`supabase/migrations/20260312_init_schema.sql` §6）。新表 `owner_agent_conversations` **不属于** `conversations`，意味着 owner 私聊会话不能复用现有 `encryption_keys`。技术方案 §4 / §10 / 产品 §12.6 都没说 DEK 写在哪、谁包装、Edge Function 怎么取。

**风险**

- Wave 1 落库时只新建会话表 → Wave 3 gateway 写消息时发现没地方拿 DEK。
- 如果到时把 `encryption_keys` 改成 polymorphic（去掉 FK），既有 visitor 加密链路被弱化，且 RLS / GDPR `delete_conversation_with_keys` 函数全部失效。

**建议修正**

在技术方案 §10（或新增 §4.5「加密链路」章节）明确：

1. 新增 `owner_agent_conversation_keys` 表，schema 与 `encryption_keys` 同形（`key_data_encrypted bytea`、`kek_version`、`status`、active partial unique index），FK 指 `owner_agent_conversations(id) ON DELETE CASCADE`。
2. Gateway 在 `POST /api/owner/agents/:agentId/messages` 第一次落消息前，按 conversation 生成 DEK + KEK 包装并写入此表（参考现有 visitor 路径）。
3. Edge Function 读路径增加按 owner 私聊 `conversation_id` 查 `owner_agent_conversation_keys` 的分支。
4. 新增 `delete_owner_agent_conversation_with_keys(p_conversation_id)` SECURITY DEFINER 函数，对齐 GDPR。

**涉及文档**

技术方案 §4 / §10 / §13；产品 §12.6 / §12.10；plan Wave 1 Task 1.1。

---

### B2. `decrypted-messages` Edge Function 扩展方案过于模糊，授权链与表读取都需重写

**问题**

现 Edge Function 的 owner 路径硬编码 `conversations → qrcodes → agents → owners.user_id`（`supabase/functions/decrypted-messages/index.ts` L223–242）；`messages.role CHECK ('visitor','agent')`；DTO `MessageRole = 'visitor' | 'agent'`。

owner 私聊的差异：sender_type 含 `'owner' | 'agent' | 'system'`、表是 `owner_agent_messages`、授权链是 `owner_agent_conversations.owner_id ↔ owners.user_id == auth.uid()`、还要可选拉 `owner_agent_run_events`——这些都是不同代码路径。

技术方案 §10 一句"新增 actor 'owner-private-agent-chat'"完全低估了改动量。

**风险**

Edge Function 是**唯一被授权的服务端解密点**，Wave 4 临时改不出来 → Wave 5 web UI 历史回放（C5）拿不到数据 → Wave 8 才发现，回退要碰生产 Edge Function。

**建议修正**

1. 在技术方案 §10 写出新 actor 完整请求/响应 DTO（参照 `shared/contracts/http/decrypted-messages/types.ts` 现有 discriminated union，新增 `DecryptedOwnerAgentRequest` / `DecryptedOwnerAgentResponse`，含 `messages[]` + 可选 `events[]`）。
2. 显式写出新的授权 SQL 链（`owner_agent_conversations.owner_id ↔ owners.id ↔ owners.user_id == auth.uid()`），并明示多张表读取的事务边界。
3. 扩展 `MessageRole` 类型 / 新建 `OwnerAgentSenderType`，避免污染既有 visitor 链路。
4. 决定 owner 私聊读路径**合入 `decrypted-messages` 还是新建 `decrypted-owner-agent-messages`**——Wave 0 必须拍板，不可保留"如果过重再拆"。

**涉及文档**

技术方案 §10；`shared/contracts/http/decrypted-messages/types.ts`；plan Wave 4 Task 4.1。

---

### B3. WS frame 命名 / 注册与现有 SSoT 不兼容，且缺 ack / resume / seq-gap / backpressure 设计

**问题**

- 命名风格冲突：现 `INBOUND_FRAME_TYPES` / `OUTBOUND_FRAME_TYPES`（`shared/contracts/ws/types.ts` L269–300）全为下划线小写（`visitor_message`、`stream_chunk`），新方案用点号（`host.register`、`owner_agent.run.event`）。`OUTBOUND_FRAME_TYPES` 是 closed enum，`validateOutboundFrame` 任何不在 map 里的都直接 reject。
- **缺 ack 设计**：现有 `AckFrame.payload.message_id` 是 visitor/agent 消息维度的；新 frame `owner_agent.run.request` 没有"已接受/已下发到 host"的 ack。HTTP `POST messages` 已经返回 201，是否再走 WS ack？语义重叠。
- **缺 sequence / idempotency**：`owner_agent.run.event.seq` 在 host 端如何编号？host 重连后已发的 seq 0..N，gateway 已落库到 seq M，host 怎么知道从哪重发？没有 resume 协议。
- **缺 reconnect**：host 短暂断网重连，正在跑的 run 状态怎么同步？是 host 主动 `host.run.resume(run_id, last_seq)` 还是 gateway 主动 `owner_agent.run.replay`？方案没说。
- **缺 backpressure**：host 大量 token，gateway 是否限流？outbound 单 frame 现有 16 KB content cap，host 一次发 200 KB 代码块怎么切？

**风险**

Wave 2 contract 落库 → Wave 3 gateway / Wave 6 go host 实现各自表达，发现协议不闭环；对外暴露过 Zod schema 后改命名要把 web / gateway / edge function generated mirror 全部改一遍。

**建议修正**

1. 命名统一为现有风格：`host_register` / `host_heartbeat` / `host_capabilities` / `owner_agent_run_request` / `_accepted` / `_event` / `_completed` / `_failed` / `_cancel` / `_resume`。
2. 在技术方案 §6 加子节「Run 协议状态机」：定义 host 端 seq 自增规则、gateway 检测 gap 后的行为（drop run + run_failed("seq_gap") 或 request resume）；host reconnect 必须发 `host_register(resume_token)`，gateway 回 `owner_agent_run_replay(runs[])` 列出"in-flight + last_seq"。
3. 新增 `owner_agent_run_ack` 或扩展 `ACK_STATUSES`（`'queued'`、`'host_dispatched'`、`'host_unreachable_persisted'`）。
4. `owner_agent_run_event.payload` 文本必须切片，单 frame 不超过 4 KB delta（与现有 `stream_chunk` 对齐）；run_event 入库时按 seq 拼接。
5. 同步更新 `INBOUND_FRAME_TYPES` / `OUTBOUND_FRAME_TYPES` 两个 const tuple 与 `outboundSchemaMap`。

**涉及文档**

技术方案 §6 / §7；plan Wave 2 Task 2.2；测试方案 §5.2。

---

### B4. agent_bindings 与"云端 agent / 现有 OpenClaw plugin 通道"边界完全没定义

**问题**

产品 §6.1 / §4.1 说创建 Agent 时可选"本地 / 云端"，schema `agent_hosts.host_type CHECK ('local','cloud')` 也允许 cloud；但**云端 host 是谁、什么时候 INSERT、谁连 WS**完全没写。

QRClaw 在 M4 后已经是 OpenClaw channel plugin（`plugins/openclaw/`），现有 agent token 走 `agents.api_key_hash`。新方案再造一套 `agent_host_tokens`——两套 token 是否互通？现有 plugins/openclaw 的"openclaw worker 接入"是不是新方案中的"cloud agent_host"？

**风险**

- 创建云端 agent 时 host 不存在 → `agent_bindings.host_id NOT NULL` 无法插入。
- `agent_bindings.unique(agent_id)` 让现有 plugin agent（已有 visitor QR conversation）和 owner 私聊 agent 互斥——同一个 agent 不能既被 visitor 扫码也被 owner 私聊？产品要求"Publish as QR"未来要让某个私聊 agent 公开发布，这条唯一约束直接冲突。
- 同一 owner 启动两个 host（家里 + 公司），`agent_bindings.host_id` 选哪个？

**建议修正**

1. 在技术方案 §3 / 产品 §4 加一节「云端 agent 来源」，明确：(a) 第一版"云端"= 现有 `plugins/openclaw` 通道复用，host_type='cloud' 的 `agent_hosts` 由 plugin 在 register 时由 service role 自动 upsert；(b) plugin token 与 host token 互不替代，但 plugin 注册时同时写一行 agent_hosts 记录。
2. `agent_bindings.host_id` 改 nullable + 增加 `binding_kind text CHECK ('local_host', 'cloud_plugin')`；或者改 `unique(agent_id, status='active')` 允许将来同 agent 多 binding 切换。
3. 设计"多 host 同时在线"的路由策略：在 `agent_bindings` 选择 `host_id` 时按 `last_seen_at desc` 取最近活跃，或允许 owner 在 UI 选默认 host。
4. Publish-as-QR 流：未来某 owner-private agent 公开为 QR 时，应是**新建一行 `qrcodes`** 指向同一 agent_id，而不是改 binding 唯一约束——把这条决策写进 §13 开放问题答复。

**涉及文档**

产品 §4 / §6.1 / §13.2；技术方案 §3 / §4.1；plan Wave 0。

---

### B5. Host token 校验算法、热撤销、scope 解析未规定

**问题**

- `agent_host_tokens.token_hash text` 没说算法（HMAC-SHA256 / bcrypt / argon2 / SHA-256+pepper）。SHA-256 够快但不防离线暴力；bcrypt 慢但 host 每次连接都要算。
- 没有 `UNIQUE` 约束在 `token_hash` 上（schema 草稿里），如果两个不同 token hash 撞库会有授权混乱。
- 撤销路径：owner 在 dashboard 撤销 token 时，已经在线的 host WS 连接如何被踢？技术方案没说"gateway 监听 token revoke 事件并主动 close 连接"或"host 每 N 秒重新 verify"。
- `scope jsonb default '{}'` 怎么解析？是不是必须有最小 scope schema（owner_id、allowed_agents[]、deny_visitor_routes）？现在等于"任意 jsonb"——RLS 完全不约束。

**风险**

撤销不及时 = 安全漏洞（产品 §11.2 / 技术方案 §11.1 都把"撤销后失效"列为强约束）。Wave 3 实现时各 agent 想当然写 SHA-256 单层 hash，过 review 后才发现没"重 hash + pepper"。

**建议修正**

1. 技术方案 §11.1 显式规定：token 原文格式 `qrclaw_host_<base64url(32 bytes random)>`；`token_hash = HMAC-SHA256(QRCLAW_HOST_TOKEN_PEPPER, token)`，DB 仅存 hash。新增 secret `QRCLAW_HOST_TOKEN_PEPPER`，`docs/local-dev-secrets.md` + `supabase/EDGE_FUNCTIONS_ENV.md` 同步。
2. `agent_host_tokens.token_hash UNIQUE NOT NULL`；查表用 hash 直接 lookup（O(1)）。
3. 热撤销：gateway 维护 `Set<token_hash>` 内存缓存 + Redis pubsub `host:token_revoked`；DB 撤销后通过 Edge Function 或 trigger 发布事件，gateway 收到立即关闭对应 WS 并取消 in-flight runs。
4. `scope` 定义 Zod schema：`{ allowed_provider_set: string[], owner_id: uuid, can_register_local: boolean }`。在 `shared/contracts/http/owner-agent-chat/types.ts` 落 `HostTokenScope` 类型。

**涉及文档**

技术方案 §11.1；产品 §11.2；plan Wave 3 Task 3.1；测试方案新增 HOST-AUTH 用例。

---

### B6. 现有 `agents` 表扩展字段未列入 Wave 1 migration

**问题**

产品 §7.1 / §6.2 写"agents 表扩展补充 description / avatar / instructions / suggested_prompts / backend_provider / backend_source / execution_mode / status"；技术方案 §4.1 说"以产品文档 §12 为准"，但 §12.3 只列 8 张新表，**没有 `ALTER TABLE agents ADD COLUMN`** 条目。plan Wave 1 Task 1.1 也只列新增表。

**风险**

Wave 5 web 创建 Agent UI 找不到地方存 instructions / suggested_prompts；Wave 3 gateway HTTP API DTO 与 DB 字段对不上。

**建议修正**

产品 §12 + 技术方案 §4 加 `agents` 表扩展 SQL：

```sql
ALTER TABLE agents
  ADD COLUMN description text,
  ADD COLUMN avatar_url  text,
  ADD COLUMN instructions text CHECK (length(instructions) <= 8000),
  ADD COLUMN suggested_prompts jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_array_length(suggested_prompts) <= 10),
  ADD COLUMN execution_mode text NOT NULL DEFAULT 'standard'
    CHECK (execution_mode IN ('standard','full_access'));

ALTER TABLE agents
  DROP CONSTRAINT agents_status_check,
  ADD  CONSTRAINT agents_status_check
       CHECK (status IN ('pending','active','suspended','archived'));
```

plan Wave 1 加 Task 1.1bis：`ALTER TABLE agents` migration。

**涉及文档**

产品 §7.1 / §12.3；技术方案 §4.1；plan Wave 1。

---

### B7. "重置上下文" HTTP API 缺失

**问题**

产品 §6.8 / §5.5 + 设计 §4.3 都把"重置上下文"作为 Chat 头部按钮，但技术方案 §5.1 API 列表没有 reset endpoint。`owner_agent_conversations.provider_session_id / provider_work_dir` 也没说由谁清空。

**风险**

Wave 5 实现时只能临时塞进 `PATCH /api/owner/agents/:agentId/conversation` 之类的不规范路径；gateway / host / provider session 三层"清空"语义不一致。

**建议修正**

1. 技术方案 §5.1 增加 `POST /api/owner/agents/:agentId/conversation/reset`，行为：
   - 写入 `system` sender_type message：'context_reset'（加密落库）。
   - 清空 `owner_agent_conversations.provider_session_id` / `provider_work_dir`。
   - 取消该 conversation 上 in-flight run（如有）。
   - 通知绑定 host：`owner_agent_session_reset(conversation_id)`。
2. host 收到 reset 后必须释放 provider 内部 session（Claude `--resume id`、OpenClaw `session_id` 等）。

**涉及文档**

技术方案 §5.1 / §6.2；产品 §6.8；plan Wave 3 Task 3.3 / Wave 5 Task 5.2。

---

### B8. 现有 OpenClaw plugin agent token 与新 owner 私聊 RLS 冲突未处理

**问题**

现有 `plugins/openclaw/` 用 `agents.api_key_hash` + `authenticateAgent()` 在 `decrypted-messages` 拉 visitor history。如果"创建 OpenClaw 云端 agent"复用同一 agent，那 `owner_agent_messages` 应该允许"plugin agent 通过 agent token 拉 owner 私聊"还是"绝对禁止"？

**风险**

plugin agent 是云端运行的代码，**不属于 owner 客户端**，按 C2 定义 plugin 不能直接看 owner 私聊明文（除非通过 Edge Function 内存态返回给 owner）。但 owner 私聊里 agent 回复就是 plugin 生成的——那 plugin 必须能往里写。读 vs 写 不对称没规定。

**建议修正**

1. 技术方案 §11.3 加「plugin / host / agent 三类 actor 最小权限」表：

   | 操作 | service_role(Gateway) | host(WS) | plugin agent(API key) | owner(JWT) |
   |------|----------------------|----------|-----------------------|------------|
   | 写 `owner_agent_messages(sender='agent')` | ✅ 加密后写 | ❌ 通过 WS 给 gateway | ❌ 通过 WS 给 gateway | ❌ |
   | 读 `owner_agent_messages` | ✅ | ❌ | ❌ 必须 403 | ✅ 经 Edge Function |
   | 直连 supabase-js SELECT 私聊表 | ✅ | ❌ | ❌ | ✅ 受 RLS 限制 |

2. 测试方案 §4.2 加用例：plugin agent token 调 `decrypted-messages actor='owner-private-agent-chat'` 必须 403。

**涉及文档**

技术方案 §11；产品 §12.8；测试方案 §4.2。

---

### B9. C5 回放：流式回放与"reload during stream"未覆盖

**问题**

产品 §1.4 把 C5 列为铁律。当前设计：刷新页面 → web 拉 `decrypted-messages(actor=owner-private-agent-chat, conversation_id)` → 仅返回 `owner_agent_messages` 终态（owner / agent final）。

但如果 owner 刚发完消息正在等回复时刷新：

- `owner_agent_runs.status='running'` 还在跑。
- `owner_agent_run_events` 已经写了 N 条 stream chunk，但产品 §6.4 说 UI 不展开 timeline，技术方案 §10 说"可选支持 run_id"。
- 如果不读 run_events，刷新后 UI 看不到正在 streaming 的部分回复，必须等 run 完成。

**风险**

owner 体验断裂：第一次发完消息刷新看到"思考中"但拿不到中途文本；这与现有 visitor stream 体验（stream_chunk 重连后从 last sequence 续传）不一致。明显违背 C5。

**建议修正**

决定 owner 私聊是否支持"reload during stream resume"：

- **选项 A（推荐）**：Edge Function `actor='owner-private-agent-chat-stream'` 拉 `owner_agent_run_events WHERE type='text' ORDER BY seq` 给 web 拼接当前 streaming 状态。
- **选项 B**：放弃 stream resume，刷新后只看 final message。需要在产品 §6.4 / 设计 §4.4 显式说明"刷新可能丢失流式进度"。

不论选哪个，技术方案 §10 / 产品 §11.5 必须显式选定。

**涉及文档**

产品 §1.4 / §6.4；技术方案 §10；测试方案 §10.1 加"reload during stream"用例。

---

### B10. owner 注销 / 软删除路径没设计，违反 GDPR / 数据生命周期

**问题**

产品 §12.6 列出 owner_agent_* 8 张表的 schema 草稿都用 `owner_id uuid not null references owners(id)`，但**没标 `ON DELETE CASCADE`**。owner 注销账号时 trigger CASCADE 链失败 → 孤儿数据。

同时缺失 owner 私聊版的 `delete_owner_agent_conversation_with_keys()`。

`provider_work_dir` 未加密，可能含本机绝对路径——本身是否 PII？方案 §13.9 把这条留作开放问题但没拍板。

**风险**

上线后 owner 删账号 → 数据残留（C2 隐含的"owner 离开 = 平台不持有可解密内容"被违背）。

**建议修正**

1. 所有 owner_agent_* 表的 `owner_id` 加 `ON DELETE CASCADE`；`agent_id` / `host_id` / `conversation_id` / `run_id` 同步 CASCADE。
2. 新增 `delete_owner_agent_conversation_with_keys(p_conversation_id)` SECURITY DEFINER 函数，删除 messages + runs + run_events + conversation_keys。
3. 拍板 §13.9：`provider_work_dir` 第一版 **opaque host-side ID**（不存绝对路径），host 内部维护 `id ↔ /Users/...` 映射；DB 不持有任何本机路径。
4. `agent_host_tokens.token_hash` / `agent_host_providers.binary_path` 同样需要"是否敏感"决策，建议 `binary_path` 也仅存 opaque（host 端持有真实路径）。

**涉及文档**

产品 §12.6 / §13.9；技术方案 §11.3；测试方案 §4.1 加 DB-06 owner 注销 cascade 测试。

---

### B11. Wave 集成顺序导致 host ↔ gateway 协议要到 Wave 8 才打通

**问题**

plan 路径 Wave 3 gateway → Wave 6 go host → Wave 8 E2E。Wave 3-5 期间 gateway 实现的 WS 路由完全没有真实 host 客户端打过，靠单元测试 mock。Wave 6 才落地 go host，此时 contract drift（命名、ack 时机、seq 编号）才暴露 → 强制返工 Wave 2/3。

**风险**

高度类似 OpenClaw plugin 重构里 BUG-1（DEK cache key 错）和 BUG-2（Edge Function secret 缺）那类晚期暴露 bug。`.claude/progress/session-overview.md` 已经印证"集成探针越早越好"。

**建议修正**

1. 在 Wave 2 之后插入 **Wave 2.5: Mock Host Harness**：
   - 用 TypeScript 在 `tests/integration/gateway/` 写一个约 60 行的 mock host（连 ws、register、收 run.request、立即回 4-5 条 run.event）。
   - Wave 3 gateway 每个 PR 必须打通 mock host 的 happy + offline + cancel + reset 4 条路径。
2. Wave 6 go host 落地时直接拿 Wave 2.5 mock host 的协议截图当 contract baseline。
3. plan §Risks 加 "late integration risk: mitigate with Wave 2.5 mock harness"。

**涉及文档**

plan Wave 序；测试方案 §6.2 增加 mock host 测试矩阵。

---

### B12. 离线消息 / pending run 生命周期没规则

**问题**

产品 §6.7 / §8.3 / §5.4 让 owner 在 host 离线时发的消息进 `owner_agent_messages.status='pending'` + `owner_agent_runs.status='queued'`。但：

- pending 上限是多少？无限制 = DoS（owner 自己滥发 / web bug 重复发）。
- host 上线后是否自动重发？产品说"待上线后需手动处理或重新发送"，但 schema 没说"是改原行 status 还是新建 message + 新 run"。现有 `messages` 表设计是 immutable，新表如果沿用同样原则就必须新建——那旧 pending 行什么时候清？
- run timeout：host accepted 后跑了 30 分钟没回复，gateway 何时把 run 标 failed？

**风险**

上线后用户量上来 owner_agent_messages / runs 表无限增长 + UI 列出长 pending 队列 = 体验崩盘。

**建议修正**

1. 技术方案 §7 / 产品 §8.3 加「pending lifecycle」：
   - 单 conversation 待处理消息上限 50 条（超过返回 429 + UI 提示）。
   - pending 消息 7 天未发出自动 expire（status='expired'，加密内容删除，留元数据 audit）。
   - host 上线后 gateway **不自动重发**，UI 在每条 pending 消息上显示"重新发送"按钮，点击 = 新建 run（旧 message 标 'replaced'）。
2. run 执行 timeout：30 分钟无 host event 自动 `run_failed(timeout)`；host 真实事件晚到 = ignore。
3. 后台任务（cron）每天清扫 expired pending。

**涉及文档**

产品 §6.7 / §8.3 / §13.4；技术方案 §7；测试方案 §6.3 / §10.2。

---

## 四、重大建议（强烈建议但不阻塞）

### M1. WS frame 命名风格统一为下划线

如 B3 所述。如果坚持点号，需要改 `OUTBOUND_FRAME_TYPES` 枚举语义、修改 `validateOutboundFrame` 调度逻辑、所有现有命名风格全部迁移——成本与收益不匹配。

### M2. 多 host 路由 / 并发选择策略写进文档

owner 在 macOS + Linux 各开一个 host，agent_bindings 选哪个？建议第一版：UI 显式列出在线 host 让 owner 选定 default host；schema 加 `agent_bindings.preferred_host_id nullable`，gateway 路由时优先 preferred、降级 last_seen_at。把这条写进产品 §6.1 + 技术方案 §7.3。

### M3. provider 探测应有"低权限健康自检"

go host 的 detect 仅靠 `--version`，但 Codex 有 sandbox / app-server，Claude 的 `bypassPermissions` 在新版可能被拒绝。建议加 `provider.HealthCheck()` 接口（除 `--version` 外跑一次最小 echo 任务）；存到 `agent_host_providers.capabilities.health_check_passed_at`，UI 仅在通过后才把该 provider 列入"创建 Agent"选项。

### M4. Suggested prompts / instructions 长度上限 + DB CHECK

`instructions text` 没上限 → owner 复制 50 KB 文档进去 → run.request payload 爆炸 / Claude API 报错。产品 §6.2 / 技术方案 §4 加 CHECK：`length(instructions) <= 8000`、`jsonb_array_length(suggested_prompts) <= 10` + 单条 prompt `length <= 200`。

### M5. Gateway 单实例 vs Redis pubsub 路由真相

技术方案 §7.3 说"内存 registry 是真相"。明确写"本期限定 Gateway 单实例部署"，并在 plan §Risks 加"水平扩展前置条件：host registry 迁 Redis pubsub"。否则未来扩容到第二台 gateway 时 host_register 路由直接错乱。

### M6. 测试方案对 RLS 隔离覆盖深度不足

§4.2 仅 6 条。建议补：

- **RLS-07** owner A 用伪造 `owner_id` 的 INSERT 攻击 `owner_agent_runs`（应被拒）。
- **RLS-08** owner A 通过 `agent_host_providers` 跨 host_id 读取（按 host.owner_id 链应被拒）。
- **RLS-09** plugin agent token 调 `decrypted-messages actor='owner-private-agent-chat'` 必须 403（B8 衍生）。
- **RLS-10** service_role 不能被 owner 客户端获取（基础 sanity）。

### M7. host 日志脱敏可机器化

技术方案 §6.3 / §11 / 产品 §11.1 都说"日志不许出现 token / KEK / DEK / 消息正文"。建议加一条 grep CI gate（`tests/lint/host-log-redaction.test.ts`）扫 go host 与 gateway 源码的 log 调用，确保只记 frame type / run_id / connection_id。参照现有 verification step 5 的 grep 守卫风格。

### M8. provider adapter timeout / cancel 协议统一

每个 provider 子进程的 cancel 行为不一：Claude 接 SIGINT 优雅退出、Codex 可能要 JSON-RPC `cancel`、OpenClaw `--local` 用 SIGTERM。技术方案 §8 / 测试方案 §8.3 应统一定义 `provider.CancelRun(ctx, runID)` 的实现要求：先发 graceful → 5 秒后 SIGKILL → 任何情况 host 端 channel close 必须发出 final `run_failed(cancelled)` frame。

### M9. UI 文案术语决议提前到 Wave 0

设计 §10 用"智能体 / 底层 Agent / 本地 / 云端"。但产品 §6.6 / 技术方案 §9 又出现"provider"、"runtime"。如果 product 决议"绝不在 UI 出现 runtime"（确实写了），那 i18n key、组件名、错误码 message 都要审查。Wave 0 product gate 加一条："术语 freeze + glossary 表落地"。

### M10. CHANGELOG / dev-log 入口未写进 plan

CLAUDE.md 把"入口文档（CLAUDE.md / AGENTS.md / CHANGELOG.md）的更新是交接义务"列为铁律。但 plan Wave 8.3 Final Verification 没列 CHANGELOG / `.claude/progress/session-overview.md` / `dev-log/2026-04-XX.md` 更新。建议加入。

---

## 五、可接受风险（短期可接受，记录归档）

| ID | 风险 | 接受条件 |
|----|------|----------|
| A1 | Codex P3 真实接入留到后续 | Wave 0 拍板"探测 yes / 执行 no"；UI 创建 Agent 时把 Codex 选项标"即将上线" |
| A2 | Windows 二进制后置 | 在 product §11 标"Windows 用户暂时只能选云端 agent" |
| A3 | Stream resume 第一版仅"重连后从最近 N 条 event 拉取" | B9 选项 A 落地，最多取最近 50 条 run_event 拼接近似快照 |
| A4 | 一个 agent 一个主会话（不支持多 thread） | schema 预留 `topic_key text default 'main'` + `unique(owner_id, agent_id, topic_key)`，将来加 thread 不动 schema |

---

## 六、建议修改清单（按优先级）

### 必改（阻塞 Wave 1）

#### 1. `requirements/owner-agent-chat-technical-specification.md`

- §4 后加 **§4.5「Owner 私聊加密链路」**：DEK 表设计 / 写路径 / 读路径（B1）。
- §5.1 表格补：
  - `POST /api/owner/agents/:agentId/conversation/reset`（B7）
  - `GET /api/owner/agent-runs/:runId`
  - `GET /api/owner/hosts`
- §6 加子节 **「Run 状态机 + Resume / Seq-gap / Backpressure / Reconnect」**（B3）。
- §10 改写为完整 Edge Function actor 扩展规约：DTO、授权链、表读取、stream resume 决策（B2、B9）。
- §11.1 显式定义 token 算法 + pepper + 热撤销 + scope schema（B5）。
- §11.3 加「plugin / host / agent 三类 actor 最小权限矩阵」（B8）。
- §12 / §13 增加 owner 注销 cascade 链 + GDPR 销毁函数（B10）。

#### 2. `requirements/owner-agent-chat-product-requirements.md`

- §4.1 / §6.1 加「云端 agent 来源」子节，澄清与 plugins/openclaw 关系（B4）。
- §6.7 加 pending lifecycle 明确上限 / 过期 / 重发规则（B12）。
- §7.1 + §12.3 把 `agents` 表扩展字段 SQL 列出（B6）。
- §13.9 拍板：`provider_work_dir` 第一版仅 opaque id（B10）。

#### 3. `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md`

- Wave 0 加 4 条产品决议：术语 freeze、Codex P3 范围、云端 agent 来源、Edge Function 合并 vs 拆分（B2、B4、A1、M9）。
- Wave 1 Task 1.1 加 `ALTER TABLE agents` + `owner_agent_conversation_keys` 表 + GDPR 销毁函数（B1、B6、B10）。
- 新增 **Wave 2.5: Mock Host Integration Harness**（B11）。
- Wave 8.3 加 CHANGELOG / session-overview / dev-log 更新条（M10）。

#### 4. `shared/contracts/ws/types.ts` 命名规划

- 在技术方案 §6 列出最终 frame 名（下划线风格）+ `INBOUND_FRAME_TYPES` / `OUTBOUND_FRAME_TYPES` 增量列表（B3、M1）。

#### 5. `requirements/owner-agent-chat-test-plan.md`

- §4.1 加 DB-06 owner 注销 cascade、DB-07 token_hash 唯一性。
- §4.2 加 RLS-07..10（M6）。
- §5.2 frame 列表补 `_resume` / `_replay` + seq gap 测试（B3）。
- §6.2 加 WS-08 host token 热撤销断连、WS-09 多 host 路由仲裁、WS-10 stream resume（B5、M2、B9）。
- §6.3 加 CON-05 run timeout、CON-06 pending lifecycle（B12）。
- §10 加"reload during stream"、"owner 注销 cascade"、"plugin agent forbidden actor" 三条 E2E（B8、B9、B10）。
- §11 验证命令补 `cd web && npm run lint` + log 脱敏 grep gate（M7）。

### 强烈建议（不阻塞但 Wave 3 前必做）

#### 6. `design/owner-agent-chat-design-spec.md`

- §4.5 / §9 补：刷新页面时 stream replay 行为说明（B9 决议后落地）。
- §7.3 补：多 host 时 owner 选 default host 的 UI（M2）。
- §10 术语表 freeze（M9）。

#### 7. `docs/superpowers/plans/2026-04-27-multica-orchestration-prompt.md`

- §7 加"每个 agent 提交前必须更新 CHANGELOG / dev-log / session-overview"（M10）。
- §4 文档审查阶段加"必须先解决本审查报告 12 条阻塞问题"。

### 建议补但可推迟到 Wave 5/8

#### 8. `docs/local-dev-secrets.md` + `supabase/EDGE_FUNCTIONS_ENV.md`

- 补 `QRCLAW_HOST_TOKEN_PEPPER` 字段（B5 落地后）。

#### 9. `.claude/rules/tech-stack-gotchas.md`

- 增加"go host 子进程信号 + work_dir 隔离 + log 脱敏"踩坑条（M7、M8）。

---

## 七、阻塞问题速查表

| ID | 主题 | 主要文档 | 影响 Wave |
|----|------|----------|-----------|
| B1 | owner 私聊 DEK / encryption_keys 链路缺失 | 技术方案 §10 / 产品 §12.6 | Wave 1 / 3 / 4 |
| B2 | `decrypted-messages` actor 扩展规约不清 | 技术方案 §10 | Wave 4 / 5 |
| B3 | WS frame 命名 + ack/resume/seq/backpressure 缺失 | 技术方案 §6 | Wave 2 / 3 / 6 |
| B4 | 云端 agent / plugin 通道边界未定义 | 产品 §4 / 技术方案 §3 | Wave 1 / 3 |
| B5 | host token 算法 / 热撤销 / scope 未规定 | 技术方案 §11.1 | Wave 1 / 3 / 6 |
| B6 | `agents` 表扩展字段未列入 migration | 产品 §12 / plan Wave 1 | Wave 1 / 3 / 5 |
| B7 | "重置上下文" HTTP API 缺失 | 技术方案 §5.1 | Wave 3 / 5 |
| B8 | plugin agent token 与 owner 私聊 RLS 冲突 | 技术方案 §11 | Wave 4 |
| B9 | reload during stream / C5 流式回放未覆盖 | 产品 §1.4 / 技术方案 §10 | Wave 4 / 5 |
| B10 | owner 注销 cascade / GDPR 链路未设计 | 产品 §12.6 / §13.9 | Wave 1 |
| B11 | Wave 集成顺序导致协议晚期暴露 | plan Wave 序 | Wave 3-8 |
| B12 | pending / queued run 生命周期无规则 | 产品 §6.7 / §8.3 | Wave 3 / 5 |

---

## 八、结论

方案的产品定位清楚、Wave 框架合理；但**加密链路、WS 协议、token 校验、多通道路由、cascade / pending 生命周期** 五个核心技术决策**都被搁在"扩展 / 后续 / 待定"上**。在 Wave 1-3 真正开发时这些会被打回——这就是这份评审报告的价值所在。

**建议**：先把 12 条阻塞问题（B1–B12）的文档补丁打上，再让 Multica agent team 进入 Wave 1。

---

## 附录 A：评审依据的代码 / 数据库 / 契约引用

| 引用 | 路径 / 章节 | 关键观察 |
|------|-------------|----------|
| messages 表 role CHECK | `supabase/migrations/20260312_init_schema.sql` §7 L266 | `CHECK (role IN ('visitor','agent'))` —— owner 私聊 sender_type 需新增 'owner'/'system' |
| encryption_keys FK 链 | `supabase/migrations/20260312_init_schema.sql` §6 L222–232 | 1:1 绑定 conversations，owner 私聊会话不在该链上 |
| Edge Function owner 授权链 | `supabase/functions/decrypted-messages/index.ts` L223–242 | 硬编码 `conversations → qrcodes → agents → owners.user_id`，需为新表重写 |
| WS inbound/outbound enum | `shared/contracts/ws/types.ts` L269–300 | closed enum + `validateOutboundFrame` 拒绝未知 type，命名风格全下划线 |
| outbound Zod schema | `shared/contracts/ws/outbound.ts` L295–353 | `outboundSchemaMap` 是新增 frame 必须同步的位置 |
| 已有 ack status 集合 | `shared/contracts/ws/types.ts` L131–141 | `ACK_STATUSES` 不包含 host run lifecycle 状态 |
| decrypted-messages 请求 DTO | `shared/contracts/http/decrypted-messages/types.ts` | discriminated union 模式，新 actor 需对齐 |
| 既有进度与 known bug 历史 | `.claude/progress/session-overview.md` | BUG-1 / BUG-2 印证晚期集成风险 |
| KEK / Edge Function secret 同步约定 | `AGENTS.md` 环境章节 | `QRCLAW_KEK_V1` 必须 gateway + Edge Function 双写，新增 host pepper 须遵循同样规范 |

---

## 附录 B：评审者立场

本评审由独立架构评审 agent 完成。评审者：

- **不参与本轮实施**，不为任何 Wave 负责。
- 仅基于"Wave 1 落库前必须澄清的决策"维度写挑战意见。
- 所有"建议修正"措辞都是文档补丁，**未直接修改代码**。
- 所有事实判断（schema 字段、WS enum、Edge Function 授权链、known bug 历史）都附附录 A 路径以供二次核查。

---

## 九、第三轮评审更新（2026-04-27）

> 第二轮已根据本报告 B1–B12 + 二次评审做了文档修订；第三轮独立评审重新核查这些修订是否真正关闭了阻塞，并扫出新引入的不一致。

### 9.1 总体结论

**可以进入 Wave 1**（条件性）。

第二轮把 B1–B12 中 9 条彻底关闭、3 条部分关闭，并且补充了 B13（四 provider 完整交付目标）。剩下 B3 / B7 / B10 各遗留 1–2 个未同步细节，**都不是 Wave 1 schema migration 的前置条件**，但应在动 Wave 2/3 前 30 分钟内一次性修完。

### 9.2 B1–B13 状态

| ID | 状态 | 证据 | 备注 |
|----|------|------|------|
| B1 | CLOSED | 产品 §12.3 + §12.6 L981–990 完整 schema；技术 §4.5 L117–158 写出 DEK 写/读/删除路径；plan Wave 1 Task 1.1 L98；测试 DB-08 验证 active key 唯一 | DEK 加密链路已端到端完整规约 |
| B2 | CLOSED | 技术 §10 L458–471 列 actor/DTO/授权链/key 表/stream resume；产品 §12.10；plan Wave 0 L75 拍板「stays in `decrypted-messages` for this release」 | 合入/拆分决策已落地 |
| B3 | PARTIAL | 技术 §6.1–§6.3 L226–305 完整 Run 状态机 + seq-gap + resume + backpressure；测试 §5.2 frame 列表对齐；**但** 产品 §11.3 L709–717 仍用点号风格 `host.register / owner_agent.run.request`，技术 §6.1 L233 散落一处 `host.register` 携带：与同节 `host_register` 自相矛盾 | 协议本身完整；命名一致性 2 处零碎遗漏 |
| B4 | CLOSED | 产品 §4.3 L185–193 显式定义云端 agent 来源；§12.5 L883–901 加 `binding_kind` + `preferred_host_id`；plan Wave 0 L74 拍板 cloud_plugin 复用 OpenClaw 通道 | Host token 与 agent token 双轨明确 |
| B5 | CLOSED | 技术 §11.1 L477–486 完整规定 token 原文格式 / HMAC-SHA256+pepper / unique / 撤销 / scope schema；产品 §12.4 L856–857 scope 固定结构；测试 DB-07；plan Wave 3 Task 3.1 | 仅遗留 secret 同步清单（见 N3） |
| B6 | CLOSED | 产品 §7.1 L412–420 + §12.3 L805–815 列出全部扩展字段 + length/array 上限 + status archived；plan Wave 1 Task 1.1 L99 显式扩展 | DDL 形态足够清楚 |
| B7 | PARTIAL | 技术 §5.1 L191 + §5.3 L209–217 完整 5 步行为；产品 §6.8；plan Wave 3 Task 3.4 L241；**但** 测试 §6.1 API-01..06 表无 reset endpoint 测试用例 | 文档定义齐全，测试覆盖缺口 |
| B8 | CLOSED | 技术 §11.3 L504–511 「Actor 最小权限」表四列对比；测试 §4.2 RLS-09 plugin agent token 调 owner-private actor → 403；§10.4 Regression Path 也带这条 | 跨链路最小权限、读写不对称已显式表达 |
| B9 | CLOSED | 产品 §1.4 / §11.5 L744–753；技术 §10 L463–468 「支持刷新期间恢复 active run text event」；设计 §4.4 L132；测试 §10.1b Reload During Stream | C5「reload during stream」边界覆盖完整 |
| B10 | PARTIAL | 产品 §12.6 全部新表 owner_id / agent_id / conversation_id / run_id 加 `on delete cascade`；§12.6 L998 `provider_work_dir` 仅 opaque；§12.4 L876 `binary_path` 不存绝对路径；测试 DB-06 + §10.3b；plan Wave 1 Task 1.1 L100；**但** 技术 §4.5 L153–157 关于 `delete_owner_agent_conversation_with_keys()` 既没标 SECURITY DEFINER、也没写函数签名 / 调用者，且 plan「cascade vs RPC」二选一不清晰 | cascade 路径已通；GDPR 主动销毁函数仍空白 |
| B11 | CLOSED | plan Wave 2.5 完整一节 L167–187 含 register / run.request / 4-5 event / completed / offline / cancel / reset / seq-gap；测试 WS-11 mock host harness；plan Risks「Late integration」 | 协议提前打通 |
| B12 | CLOSED | 产品 §8.4 L546–552 完整规则（50 条上限 / 7 天 expire / 不自动补跑 / replaced / 30 分钟 timeout）；技术 §7.4 L370–375；设计 §9；测试 CON-05/06/07 | pending 生命周期闭环 |
| B13 | CLOSED | 产品 §10.3 P0–P3 保留四 provider 为完整目标；技术 §九 + §13；测试 §12 P2/P3；plan Wave 0 L77 「any provider deferral requires Owner sign-off」+ Done Definition L484；总控 prompt §10 第 8 条 | 四 provider 完整交付 + 降级开关已四份文档同步表达 |

### 9.3 新发现的问题

#### N1. 产品文档与技术文档 WS frame 命名风格冲突

- **问题**：产品 §11.3 L709–717 列出 frame 名仍用点号；技术 §6.1/§6.2/测试 §5.2 已全部下划线；技术 §6.1 L233 自身有一处 `host.register` 散落与列表 `host_register` 自相矛盾。
- **风险**：Wave 2 Contracts agent 面对"以哪份为准"不确定性；按点号风格落 frame 会触发 `OUTBOUND_FRAME_TYPES` closed enum reject、`validateOutboundFrame` 拒绝，回滚改名。
- **建议修正**：产品 §11.3 L709–717 的 9 条 frame 改下划线对齐技术 §6.1/§6.2；技术 §6.1 L233 「`host.register` 携带：」改 `host_register`。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 2**：是。

#### N2. Reset API 端到端测试用例缺失

- **问题**：技术 §5.1/§5.3 把 `POST /api/owner/agents/:agentId/conversation/reset` 定义为新 API，行为含 5 步；测试 §6.1 API-01..06 无 reset 测试，§10 E2E 也无 reset 用户旅程。
- **风险**：Wave 3 实现后没有专项测试，B7 的「context_reset 必须落 system message + run cancel + provider session 释放」无法在 CI 上保证。
- **建议修正**：测试 §6.1 加 API-07 reset endpoint（覆盖 system message 写入 / cancel in-flight run / provider_session_id 与 work_dir 清空 / Host 收到 `owner_agent_session_reset` frame）；§10 加 reset E2E 用户旅程。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 3 release gate**：是。

#### N3. `QRCLAW_HOST_TOKEN_PEPPER` secret 同步清单未落地

- **问题**：技术 §11.1 L481 已规定 `token_hash = HMAC-SHA256(QRCLAW_HOST_TOKEN_PEPPER, token)`；plan Wave 3 Task 3.1 L197 也要求落地；但 `docs/local-dev-secrets.md` / `AGENTS.md` Gateway env / `supabase/EDGE_FUNCTIONS_ENV.md` 全部 0 hits；产品 §13.2 仍把这条列为开放问题，与技术 §11.1 已落规约的现状不一致。
- **风险**：Wave 3 Gateway agent 本地补 secret 时无文档可循；新机器/CI 启 gateway 时 `POST /api/owner/host-tokens` 运行时报错。
- **建议修正**：`AGENTS.md`「Gateway env secrets」段加 `QRCLAW_HOST_TOKEN_PEPPER`（64 hex，`openssl rand -hex 32`）；`docs/local-dev-secrets.md` 字段清单同步；`supabase/EDGE_FUNCTIONS_ENV.md` 加一条决议是否在 `decrypted-messages` 注入；产品 §13.2 把这条从开放问题清单去掉。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 3 Task 3.1**：是。

#### N4. GDPR 主动销毁路径与 cascade 路径二选一未拍板

- **问题**：技术 §4.5 L153–157 给出 `delete_owner_agent_conversation_with_keys(conversation_id)` 一行，未标 SECURITY DEFINER、未写签名、未说调用者；产品 §12.6 全部新表已 `on delete cascade`；plan Wave 1 Task 1.1 L100「Add cascade / GDPR deletion path」未拆。
- **风险**：cascade 足以满足 owner 注销；但若产品 / 合规需要"单删某条 conversation 的密钥 + 密文 + run events"（不删整个 owner），cascade 不能做。Wave 4 才发现需要 RPC = 返工。
- **建议修正**：plan Wave 1 Task 1.1 L100 拆 2 条 ——「Add `ON DELETE CASCADE`（必做）」「Decide `delete_owner_agent_conversation_with_keys` SECURITY DEFINER RPC（默认延迟，除非产品要 per-conversation forget-me）」；技术 §4.5 注一句「本轮如未引入 RPC，单 conversation 销毁通过 owner 客户端 DELETE 路由由 service role 触发 cascade」。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 4 / Compliance review**：低。

#### N5. agents 表扩展字段缺独立 schema 测试

- **问题**：测试 §4.1 DB-01 描述「8 张新增表存在」但产品 §7.1/§12.3/技术 §4.1 列出 `agents` 表必须扩展 5 字段 + 新 status archived + 长度 CHECK + 数组数量 CHECK 全部不在 DB-01 验证范围。
- **风险**：Wave 5 web 创建 Agent UI 写 50 KB instructions 时，CHECK 约束如未真正落 schema，会静默通过。
- **建议修正**：测试 §4.1 加 DB-09「agents 表扩展字段：description / avatar_url / instructions(<=8000) / suggested_prompts(jsonb<=10 items, each<=200) / execution_mode / status archived 全部存在并按 CHECK 拒绝越界值」。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 1 verify gate**：是。

#### N6. `HostTokenScope` Zod schema 落地点未在 plan 标注

- **问题**：技术 §11.1 L485 写 scope 通过 `HostTokenScope` schema 校验；但 plan Wave 2 Task 2.1（HTTP Contracts）L138–148 没把 `HostTokenScope` 列为新增类型。
- **风险**：Wave 3 Task 3.1 实现 `POST /api/owner/host-tokens` 时如果走"自由 jsonb scope"捷径，回退到 B5 评审里"等于不约束"的状态。
- **建议修正**：plan Wave 2 Task 2.1 加一项「Define `HostTokenScope` Zod schema in `shared/contracts/http/owner-agent-chat/types.ts`（owner_id, allowed_provider_set, can_register_local, can_receive_private_runs）」。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 2**：是。

#### N7. C2 边界中"实时 plaintext fanout"语义需在文档中重申

- **问题**：技术 §7.2 L362–363「Host event plaintext → Gateway encrypt(event content) → owner_agent_run_events.content_encrypted → fanout redacted realtime frame to Owner UI / 实时 UI 可以收到当前连接内的 plaintext chunk」。这一段隐含 Gateway WS 进程在转发期间持有明文，与 C2 v1.3「明文只存在于 (a) 客户端 (b) Edge Function 内存态」字面冲突 —— Gateway WS fanout 是第 (c) 个明文边界。
- **风险**：C2 是项目铁律，将来 security review 在审 Gateway WS 路径时会重启讨论；本次方案没显式列入 C2 边界扩展。
- **建议修正**：技术 §1 「目标与边界」或 §11 「安全」加一条：「Owner 私聊场景下，Gateway WS 进程在转发 host event → owner UI 期间会**短暂持有**实时事件明文用于 fanout。该明文不落盘、不写日志、frame 转发完成即从内存释放，与 Edge Function 内存态等同视为 C2 v1.3 允许的"端侧 + 内存态"边界扩展」。如不接受此扩展，则 fanout 必须改为「先加密落库 → owner 客户端从 Edge Function 拉解密」，但这与 B9 决议矛盾。
- **是否阻塞 Wave 1**：否。**是否阻塞 Wave 3 security review**：是。

### 9.4 Wave 1 准入门槛（30 分钟内可完成的文档同步）

Wave 1 的实际依赖是产品 §12 + 技术 §4 的 SQL 形态，这两份已自洽。准入只需 7 条字符串级修订（**全部不动 schema**）：

1. 产品 §11.3 L709–717 的 9 条 frame 名从点号改下划线，对齐技术 §6.1/§6.2（解决 N1）。
2. 技术 §6.1 L233「`host.register` 携带：」改「`host_register` 携带：」（解决 N1 残留）。
3. plan Wave 1 Task 1.1 L100「Add cascade / GDPR deletion path」拆成两条：cascade 必做 + RPC 函数列入待决（解决 N4）。
4. plan Wave 2 Task 2.1 加一项「Define `HostTokenScope` Zod schema」（解决 N6）。
5. 测试 §4.1 加 DB-09「agents 表扩展字段 + CHECK 约束验证」（解决 N5）。
6. 测试 §6.1 加 API-07「reset endpoint 端到端」+ §10 加 reset E2E 用户旅程（解决 N2）。
7. `AGENTS.md` Gateway env secrets / `docs/local-dev-secrets.md` / `supabase/EDGE_FUNCTIONS_ENV.md` 加 `QRCLAW_HOST_TOKEN_PEPPER` 字段；产品 §13.2 把这条从开放问题降级（解决 N3）。

第 8 条（可选，security reviewer 决定是否前置）：技术 §1 或 §11 加一段对 C2 边界扩展的显式注释（解决 N7）。

### 9.5 第三轮建议

**可以进入 Wave 1**，按以下顺序执行：

1. 30 分钟内合入 9.4 节的 7 条文档同步项；N3 / N7 由 security reviewer / Wave 3 起步前补。
2. 确认 plan Wave 0 L69–77 全部 8 条产品决议（特别是 cloud_plugin 来源 / opaque work_dir / 四 provider 完整交付 + Owner sign-off 降级开关）。
3. 执行 Wave 1 schema migration（plan Task 1.1 / 1.2 / 1.3）；收尾验证增加一步 `supabase db advisors` + Owner A 不能读 Owner B 的 8 张新表 + agents 扩展字段（参照 BUG-1 风格 P0 集成探针）。
4. Wave 2 起步前完成 N3 / N6；Wave 2.5 Mock Host Harness 最终代码 review（B11 真正生效的关口）。
5. Wave 3 起步前补 N2 / N7。
6. 持续监控按总控 prompt §8 30 分钟轮询节奏；每 Wave 收尾必须更新 `CHANGELOG.md` / `dev-log/2026-04-XX.md` / `.claude/progress/session-overview.md`。

**不可静默压缩的硬约束**：
- 四 provider 必须完整交付，任何 provider 延期需 Owner 签字（plan Wave 0 L77 + Done Definition L484）。
- C2 v1.3 边界：`decrypted-messages` 是唯一服务端解密点（B2 已对齐）；Gateway WS plaintext fanout 是否纳入 C2 例外需在 N7 中拍板。
- B11 Wave 2.5 Mock Host Harness 必须在 Wave 3 之前跑通，否则等 Wave 6 Go Host 落地再发现协议 drift 就是另一次 BUG-1/2 级返工。

### 9.6 第三轮 grep 证据

```text
点号 frame 名残留：
  requirements/owner-agent-chat-product-requirements.md:709–717 (host.register / owner_agent.run.*)
  requirements/owner-agent-chat-technical-specification.md:233 (`host.register` 携带：)

下划线 frame 名（正式定义）：
  requirements/owner-agent-chat-technical-specification.md:228–231 / 258–266
  requirements/owner-agent-chat-test-plan.md:158–168

QRCLAW_HOST_TOKEN_PEPPER 出现位置：
  technical-specification.md:481 (规约)
  product-requirements.md:1120 (开放问题，未关闭)
  implementation-plan.md:197 (Wave 3 Task 3.1)
  → docs/local-dev-secrets.md / AGENTS.md / supabase/EDGE_FUNCTIONS_ENV.md 0 hits

cascade / GDPR 函数：
  technical-specification.md:155 (delete_owner_agent_conversation_with_keys，未标 SECURITY DEFINER)
  product-requirements.md:910/929/930/944/945/964/965/983 (cascade 已落)
  test-plan.md:88 (DB-06) / 361 (E2E §10.3b)

reset endpoint 测试：
  test-plan.md:168 (frame 列表) / 209 (WS-11 mock host) — API 表 0 hits
```

### 9.7 第四轮处置记录（2026-04-27）

> 第四轮目标不是扩大审查面，而是校准第三轮 N1–N7 的修复尺度，避免过度设计，同时清理会阻碍 Wave 1 / Wave 2 起步的文档不一致。

#### 9.7.1 决议表

| ID | 决议 | 修复人 | 涉及文档 | 一句话理由 |
|----|------|--------|----------|------------|
| N1 | ACCEPT | 本轮 | `requirements/owner-agent-chat-product-requirements.md`；`requirements/owner-agent-chat-technical-specification.md` | frame 命名不一致会直接影响 Wave 2 contracts，已统一为下划线风格。 |
| N2 | ACCEPT | 本轮 | `requirements/owner-agent-chat-test-plan.md` | reset API 已在技术方案定义，测试缺口明确且补丁很小。 |
| N3 | DEFER | Wave 3 Gateway / Security agent | `AGENTS.md`；`docs/local-dev-secrets.md`；`supabase/EDGE_FUNCTIONS_ENV.md` | secret 同步重要，但不影响 Wave 1 schema；不在本轮提级为启动 hard-fail。 |
| N4 | ACCEPT_WITH_REVISION | 本轮 + Wave 1 DB agent | `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md` | cascade 必做，RPC 不提前实装；拆成必做 cascade + 待决 RPC。 |
| N5 | ACCEPT | 本轮 | `requirements/owner-agent-chat-test-plan.md` | `agents` 扩展字段进入 Wave 1，必须有独立 schema/CHECK 测试。 |
| N6 | ACCEPT | 本轮 | `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md` | `HostTokenScope` 是 B5 的落点，必须在 Wave 2 contracts 中明确。 |
| N7 | DEFER | Security reviewer / Wave 3 前 | `requirements/owner-agent-chat-technical-specification.md` | C2 明文边界扩展不能由本轮私自改铁律语义；交给 security review 决策。 |

#### 9.7.2 本轮实际修订

- `requirements/owner-agent-chat-product-requirements.md` §11.3：将 `host.register` / `owner_agent.run.*` 统一改为 `host_register` / `owner_agent_run_*`，覆盖 N1。
- `requirements/owner-agent-chat-technical-specification.md` §6.1：将残留的 `host.register 携带` 改为 `host_register 携带`，覆盖 N1。
- `requirements/owner-agent-chat-test-plan.md` §4.1：新增 DB-09，验证 `agents` 扩展字段和 CHECK 约束，覆盖 N5。
- `requirements/owner-agent-chat-test-plan.md` §6.1：新增 API-07 reset endpoint 测试，覆盖 N2。
- `requirements/owner-agent-chat-test-plan.md` §10.1c：新增 Reset Context E2E 旅程，覆盖 N2。
- `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md` Wave 1：把“cascade / GDPR deletion path”拆成必做 `ON DELETE CASCADE` 与待决 `SECURITY DEFINER RPC`，覆盖 N4。
- `docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md` Wave 2：新增 `HostTokenScope` Zod schema 任务，覆盖 N6。

#### 9.7.3 未在本轮处理的条目

- **N3 / DEFER**：Wave 3 Host token API 开始前，Gateway / Security agent 必须补 `QRCLAW_HOST_TOKEN_PEPPER` 到 `AGENTS.md`、`docs/local-dev-secrets.md`、`supabase/EDGE_FUNCTIONS_ENV.md`。本轮不把它提级为当前启动 hard-fail。
- **N4 / ACCEPT_WITH_REVISION 的 RPC 部分**：如果产品明确需要“单 conversation forget-me”，Wave 1 DB agent 再设计 `delete_owner_agent_conversation_with_keys`。默认先依赖 service-role 路由 + cascade。
- **N7 / DEFER**：Wave 3 Gateway realtime fanout 实现前，由 security reviewer 决定是否把 Gateway WS 短暂持有实时明文列为 C2 允许边界扩展。

#### 9.7.4 第四轮新增观察

无新增观察。

#### 9.7.5 Wave 1 准入判定

**Wave 1 可启动但留 3 条未决**：N3 留到 Wave 3 前、N7 留到 security review、N4 的 RPC 部分留给 Database agent 按产品需要决定。

最小前置已经完成：N1、N2、N5、N6 已同步到对应文档，N4 已拆出 Wave 1 必做与待决部分。当前不需要再阻塞 Wave 1 schema 草案。

---

## 十、第五轮最终准入审查（2026-04-27）

> 第五轮目标：在不发散、不过度设计的前提下，确认第四轮处置后的文档是否已经足够进入 Wave 1。

### 10.1 总体结论

**Wave 1 可立即启动。**

第四轮把 N1–N7 在 30 分钟内合理处置：4 条直接 ACCEPT 落文档，1 条 ACCEPT_WITH_REVISION（N4 cascade vs RPC 拆分），2 条 DEFER（N3 / N7）—— 全部符合第三轮 §9.5 第 1 条「N3 / N7 由 security reviewer / Wave 3 起步前补」的预期延期路径。

剩下唯一一处遗留是技术方案 §二 L40 架构图描述性文字 `Route owner_agent.run.request to Host / Cloud Worker`，属于流程示意而非协议定义，不进 `shared/contracts` SSoT，不影响 Wave 1 schema migration，不会让 Wave 2 contracts agent 走错（§6.1/§6.2 协议定义已全部下划线）。按"不要过度设计"原则，**不升级为阻塞**，列入 Wave 2 contracts 起步前顺手修。

### 10.2 第四轮处置核查表

| ID | 状态 | 证据 | 阻塞 Wave 1 |
|----|------|------|------------|
| N1 | PARTIAL | 产品文档点号 0 hits（grep `host\.register\|owner_agent\.run\.` 无命中）；技术 §6.1 L228–230 / L233 / §6.2 L257–266 已下划线；**仅** 技术 §二 L40 架构图描述文字仍写 `owner_agent.run.request`（非协议定义） | no |
| N2 | CLOSED | 测试 §6.1 L195 新增 API-07（写 system message / cancel run / 清空 provider session+workdir / 通知 Host）；§10.1c L342–350 新增 Reset Context E2E 旅程 | no |
| N3 | DEFER（合理） | 评审文档 §9.7.1 标 DEFER；§9.7.3 注「Wave 3 Host token API 开始前必须补」；与 §9.5 第 1 条建议一致 | no |
| N4 | CLOSED | plan Wave 1 Task 1.1 L100「Add `ON DELETE CASCADE`（必做）」；L101「Decide `delete_owner_agent_conversation_with_keys` SECURITY DEFINER RPC（默认 defer）」 | no |
| N5 | CLOSED | 测试 §4.1 L91 新增 DB-09，覆盖 `description / avatar_url / instructions / suggested_prompts / execution_mode / archived` 字段 + length / array / item-length CHECK | no |
| N6 | CLOSED | plan Wave 2 Task 2.1 L143「Define `HostTokenScope` Zod schema with owner_id, allowed_provider_set, can_register_local, can_receive_private_runs」 | no |
| N7 | DEFER（合理） | 评审文档 §9.7.1 标 DEFER 给 security reviewer；§9.7.3 注「Wave 3 Gateway realtime fanout 实现前」；C2 是项目铁律，本轮不私自改 CLAUDE.md 是正确尺度 | no |

### 10.3 第五轮新发现的不一致

仅 1 处描述性文字残留，**不阻塞 Wave 1**：

- **位置**：`requirements/owner-agent-chat-technical-specification.md` §二 L40
- **现状**：架构图 ASCII 文本「`Route owner_agent.run.request to Host / Cloud Worker`」使用点号风格
- **影响范围**：仅是流程示意，非 §6 协议定义、非 `shared/contracts/ws/types.ts` 入口、不会被 Wave 2 contracts agent 当 SSoT 引用
- **修法**：单字符级替换为 `owner_agent_run_request`
- **建议处置**：列入 Wave 2 contracts 起步前的"顺手修"清单，零成本搭车，不强制 Wave 1 前置

### 10.4 Wave 1 启动前的 4 条确认项

Wave 1 schema migration 现在没有真正的文档级阻塞。启动前只需要确认 4 件事（**全部可在 5 分钟内核查完毕**）：

1. **Plan Wave 0 八条产品决议确认到位**（plan L69–77）：cloud_plugin 来源 / opaque work_dir / opaque binary_path / 四 provider 完整交付 + Owner sign-off / `decrypted-messages` stays merged / 术语 freeze 等。
2. **Wave 1 Task 1.1 三类操作清晰**：建 9 张新表 + 扩展 `agents` + `ON DELETE CASCADE` 必做。`SECURITY DEFINER RPC` 默认 defer（plan L98–101）。
3. **Wave 1 收尾验证加 P0 探针**：`supabase db advisors` + Owner A 不能读 Owner B 的 9 张新表 + `agents` 扩展字段（参照 BUG-1 风格）。已记入 §9.5 第 3 条建议，不需要再改文档，DB agent 收尾时执行即可。
4. **三条 DEFER 提级条件已记录**（§9.7.3）：N3 在 Wave 3 Task 3.1 前补 / N4 RPC 部分由产品决定 / N7 在 Wave 3 Gateway realtime fanout 前由 security reviewer 决定。

### 10.5 第五轮处置建议

**直接进入 Wave 1。** Wave 1 DB agent 按 plan Task 1.1 → 1.2 → 1.3 顺序执行；如愿意，在第一个 PR 中顺手修 §10.3 那一处架构图文字（一行 patch）。

后续 Wave 节奏由总控 agent 按 `docs/superpowers/plans/2026-04-27-multica-orchestration-prompt.md` 调度。

---

## 十一、Wave 1 启动指令（2026-04-27）

> 第五轮已确认 Wave 1 可立即启动。本节将"修最后一处遗留 + 启动 Wave 1"合并为一次性指令下达给 Wave 1 启动 agent，避免再起一轮独立审查。

### 11.1 启动前置（10 分钟内可完成）

启动 agent 在动 schema 之前必须先清掉 §10.3 列出的唯一遗留：

- `requirements/owner-agent-chat-technical-specification.md` §二 L40：把架构图描述文字
  `Route owner_agent.run.request to Host / Cloud Worker`
  改为
  `Route owner_agent_run_request to Host / Cloud Worker`。

完成后顺手 grep 确认 `requirements/` + `docs/superpowers/plans/` 下不再有 `host\.register|host\.heartbeat|host\.capabilities|host\.run\.|owner_agent\.run\.` 命中（评审报告自身的引用除外，可忽略）。

不需要再追加任何方案文档章节，N3 / N4 RPC / N7 仍按 §9.7.3 DEFER 路径走。

### 11.2 启动后 Wave 1 范围（plan Wave 1 Task 1.1–1.3）

启动 agent 完成 §11.1 后直接进入 Wave 1：

1. **Task 1.1（schema）**：建 9 张新表 + 扩展 `agents` + `ON DELETE CASCADE` 必做；`SECURITY DEFINER RPC` 默认 defer。
2. **Task 1.2（RLS）**：按技术 §11.3 + 测试 §4.2 RLS-01 ~ RLS-10 落策略。
3. **Task 1.3（types + verify）**：`supabase gen types` 重新生成 → `supabase/types/database.types.ts`；跑测试 §4.1 DB-01 ~ DB-09 + RLS 套件 + `supabase db advisors` + 双 owner P0 集成探针。

### 11.3 启动后必更新的入口文档（CLAUDE.md 交接义务）

Wave 1 收尾时一次性更新：

- `CHANGELOG.md`（Unreleased 段加 Wave 1 schema migration 条目）。
- `dev-log/2026-04-27.md`（按 `dev-log/README.md` 模板新建或追加；记录 schema 改动 / 测试基线 / advisors 处置）。
- `.claude/progress/session-overview.md`（把 Wave 1 标记为完成 + 列 next wave 入口）。

### 11.4 红线

启动 agent 不得：

- 触碰 visitor 链路（`messages` / `encryption_keys` / 现有 `decrypted-messages` Edge Function）。
- 实装 `delete_owner_agent_conversation_with_keys` SECURITY DEFINER RPC（默认 defer，除非产品明确要 per-conversation forget-me 才停下来问 owner）。
- 写 gateway / web / go host 代码（Wave 3 / 5 / 6 范围）。
- 改产品 / 设计 / 测试 / plan / 总控 prompt 之外的方案文档结构性章节。
- 在 migration 或代码里写"AI / Generated by / Claude / Cursor"等 AI 来源标记。
- 修改 CLAUDE.md / AGENTS.md 的铁律语义（C1 / C2 / C4 / C5）。

### 11.5 完成判定

Wave 1 启动 agent 在以下条件全部满足时才能宣称"Wave 1 完成"：

- §11.1 唯一遗留已清。
- §11.2 三条 task 全部 pass，含 P0 双 owner 集成探针。
- `cd web && npm run build` + `cd gateway && npm run typecheck` 通过（types 不破现有编译）。
- §11.3 三份入口文档已更新。
- PR 描述列出 schema 字段 / RLS 策略 / advisors 输出 / types diff 摘要。

后续 Wave 节奏由总控 agent 按 `docs/superpowers/plans/2026-04-27-multica-orchestration-prompt.md` 调度；本评审报告至此进入归档状态，仅在 Wave 1 出现新阻塞时再追加 §十二。
