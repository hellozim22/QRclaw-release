# R1 — SSE Integration Spec (LobeChat / assistant-ui / ai-sdk 对接)

> 配套文件: `docs/wave10/q2-sse-protocol.md`（cursor 草稿）
> 目标: 在草稿基础上, 落地 **开源组件对接规约** + **Web store 改造影响面** + **协议层测试用例**。
> 约束: 不改代码, 不 clone, Read ≤ 10 (已用 ≤ 6)。

---

## 0. 执行摘要 (TL;DR)

1. **协议底座选 OpenAI Chat Completions SSE 子集**（与草稿一致）。LobeChat / Vercel ai-sdk / assistant-ui 都能原生消费, 不需要 server 侧针对每个 UI 组件分叉。
2. **UI 专属扩展（tool_call、attachment、thinking、annotation）走 "同 chunk, 独立字段"**, 不覆盖 `delta.content`。LobeChat 读 `delta.content` + `delta.tool_calls`;  assistant-ui 用同样字段但额外消费 `annotations`;  ai-sdk 则期望 `tool_calls` + `finish_reason=tool_calls`。
3. **一个 user turn = 一个 SSE 连接**（短连接, 请求作用域）。多 session 用 **N 个独立 fetch**, 不共享连接；每个连接由 `run_id` 与 `conversation_id` 自证身份。
4. **断线 / cancel / regenerate / retry** 全部走 **独立 HTTP route**, 不污染 SSE body；断线重连走 `decrypted-messages?include_events=1&after_seq=N`, 不模仿伪 `Last-Event-ID`。
5. **Attachment 双路径**: 上传走 `POST /api/owner/upload` → 拿 `file_id/url`；chat 请求只传 reference (`image_url` / `input_file` object), 禁止 base64 走 SSE body。
6. **Streaming Markdown edge case 放组件层** (LobeChat 已处理未闭合 fence / 半截 LaTeX / table jitter)。协议层只保证 **delta 字节流有序、不拆 UTF-8 中点**。

---

## 1. 统一 SSE 协议字典

### 1.1 Headers (Gateway → Browser)

| Header | Value | 原因 |
|---|---|---|
| `Content-Type` | `text/event-stream; charset=utf-8` | 所有组件必需 |
| `Cache-Control` | `no-cache, no-transform` | 禁止代理压缩/缓存 |
| `Connection` | `keep-alive` | HTTP/1.1 兼容 (HTTP/2 忽略) |
| `X-Accel-Buffering` | `no` | 关掉 nginx / CF 的 buffer, 否则首 token > 200ms |
| `X-QRClaw-Run-Id` | `<run_id>` | 供客户端 `cancel` 路由使用 (ai-sdk 的 `experimental_streamData` 也会读 response headers) |
| `X-QRClaw-Conversation-Id` | `<conversation_id>` | 同上 |

### 1.2 Event Types (全部走匿名 `data:` 行, 不用 SSE `event:` name)

> 选择理由: OpenAI 参考实现 / LobeChat / ai-sdk / assistant-ui 都按 **"每行 `data: json`, 不看 event name"** 解析。加 `event:` 反而破坏兼容。

| 语义 | Chunk JSON (核心字段) | 何时发送 |
|---|---|---|
| **start / role** | `{choices:[{delta:{role:"assistant"},index:0,finish_reason:null}]}` | 收到 `owner_agent_run_accepted` 后立即发。为首 token 延迟 < 200ms 买保险。 |
| **text delta** | `{choices:[{delta:{content:"..."},index:0,finish_reason:null}]}` | 收到 `owner_agent_run_event(event_type=text)` |
| **thinking** | `{choices:[{delta:{reasoning_content:"..."}}]}` ⚠️ 非 OpenAI 标准, 见 §2 | 仅 `X-QRClaw-Debug: 1` 或产品开关开启。默认只持久化不 emit。 |
| **tool_call start** | `{choices:[{delta:{tool_calls:[{index:0,id:"call_...",type:"function",function:{name:"..."}}]}}]}` | 收到 `tool_use` 且具备 `tool_call_id + name` |
| **tool_call args delta** | `{choices:[{delta:{tool_calls:[{index:0,function:{arguments:"{\"foo\":"}}]}}]}` | `tool_use` 流式 args (可空) |
| **tool_result** | 见 §2.2 — **不存在于 OpenAI chunk schema**, 走 annotations 或独立 chunk | 收到 `tool_result` |
| **status / progress** | 走 `data: : comment`（SSE 注释, 不进 chunk schema, 不会污染组件 parse）例如 `: status=running seq=12` | heartbeat / 可观测性 |
| **error (mid-stream)** | `{error:{code:"...",message:"..."},choices:[{delta:{},index:0,finish_reason:"error"}]}` | 首字节已发出后发生 `owner_agent_run_failed` |
| **finish (stop)** | `{choices:[{delta:{},index:0,finish_reason:"stop"}]}` | 收到 `owner_agent_run_completed` |
| **finish (tool_calls)** | `{choices:[{delta:{},index:0,finish_reason:"tool_calls"}]}` | 完成态是 pending tool call (LobeChat / ai-sdk 判此值后进入 tool loop) |
| **终结信号** | `data: [DONE]\n\n` 裸字符串 | 永远最后一条, **仅** 表示"流关闭", 无语义 |

**不变式**:
- `[DONE]` 永远只出现一次, 且必出现 (含 error 路径)。
- `chatcmpl_<run_id>` 作为 `id`, 让客户端能 re-correlate 到 cancel / regenerate。
- `created` 用 Gateway 侧 Unix 秒 (UTC), 不透传 Host 时钟。

### 1.3 Payload 字段规约

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | `chatcmpl_<run_id>`；所有 chunk 相同。 |
| `object` | ✅ | 固定 `"chat.completion.chunk"` |
| `created` | ✅ | Gateway UTC 秒 |
| `model` | ✅ | `actual_model` 优先, 没有则回退 `requested_model`, 再无则 `"qrclaw-owner-agent"` |
| `choices[0].index` | ✅ | 始终 `0` (QRClaw 不用 n>1) |
| `choices[0].delta` | ✅ | 至少 `{}` |
| `choices[0].finish_reason` | 末尾 | `"stop"` / `"tool_calls"` / `"length"` / `"error"` / `"cancelled"` |
| `choices[0].delta.content` | 文本流 | 禁止 `null`（LobeChat 的 `createSSEDataStream` 对 null content 抛 hydrate error） |

---

## 2. 兼容性矩阵

### 2.1 核心文本流

| 组件 | 期望 endpoint | 期望 chunk 形态 | 文本字段 | `[DONE]` | 备注 |
|---|---|---|---|---|---|
| **LobeChat** (`src/libs/agent-runtime/utils/streams/openai.ts`) | 任意 URL, 但请求 body 固定 `/v1/chat/completions` 形状 | OpenAI chunk | `choices[0].delta.content` | ✅ 必需 | 会按 SSE 空行切, 忽略 `event:` name |
| **Vercel ai-sdk** (`ai/openai`, `streamText`) | `/v1/chat/completions` (可通过 `baseURL` 改写) | OpenAI chunk | `choices[0].delta.content` | ✅ | `finish_reason` 必须正确, 否则 `finishReason` 永远是 `"unknown"` |
| **assistant-ui** (`@assistant-ui/react`, `useChatRuntime`) | 任意, 默认走 ai-sdk runtime | OpenAI chunk **or** ai-sdk data-stream-protocol v2 (双支持) | `delta.content` | ✅ (OpenAI mode) | 如果走 data-stream 模式, 用 `0:"text"\n` 行协议, 完全不同 (**不推荐混用**) |
| **QRClaw 自有 Web** (`owner-agent-chat-store.ts`) | `/api/owner/agents/:id/chat` | OpenAI chunk | `delta.content` | ✅ | 现在根本没有 SSE parse, 需新增 |
| **OpenAI SDK (curl)** | `/v1/chat/completions` | OpenAI chunk | 同上 | ✅ | 调试用, 不生产 |

**结论**: OpenAI chunk 是**最大公约数**。路径上 `POST /api/owner/agents/:agentId/chat` 同时加 alias `POST /v1/chat/completions?agent_id=<id>` (也接受 `model` 字段里塞 agent id, 格式 `qrclaw:<agent_id>`), 就能让 LobeChat / ai-sdk **零改造** 接入。

### 2.2 Tool Call / Tool Result

| 组件 | tool_call 形态 | tool_result 形态 | 约束 |
|---|---|---|---|
| **OpenAI** | `delta.tool_calls[]` 带 `id/function/arguments(累积字符串)` | **不在 chunk 里**, 而是**下一轮**请求 body 里 `role:"tool", tool_call_id, content` | 严格分回合 |
| **LobeChat** | 同 OpenAI | 同 OpenAI (自动帮你 push 回 server) | `finish_reason:"tool_calls"` 是入口信号 |
| **ai-sdk** | 同 OpenAI, 但也支持 `tool_calls` 在顶层 | 同 OpenAI | `streamText` 会自动 `onToolCall` |
| **assistant-ui** | 同 OpenAI + `annotations:[{type:"tool-call",...}]` 可选 | annotations `type:"tool-result"` | 更宽松 |
| **QRClaw 自有** | **当前 WS** `owner_agent_run_event(event_type=tool_use)` 带 `metadata.tool_call_id` + `metadata.arguments` | `tool_result` 事件 | 需要映射层 |

**QRClaw Gateway 映射 (§4 of 草稿第 108 行已留口, 这里细化)**:

```text
ws.owner_agent_run_event{event_type=tool_use,  metadata:{tool_call_id,name,arguments_delta}}
  → sse.delta.tool_calls[0]={index, id:tool_call_id, type:"function",
                              function:{name, arguments: arguments_delta}}

ws.owner_agent_run_event{event_type=tool_result, metadata:{tool_call_id, output}}
  → 不 emit 到 delta (OpenAI 不支持); 改成 emit SSE 注释行
    `: tool_result id=tool_call_id bytes=N`
    持久化到 owner_agent_run_events, 下一轮 owner message 里以 role="tool" 带出
```

> 若产品希望 **同一轮内 tool + text 交替显示**, 必须走 assistant-ui 的 `annotations` 路线;
> 推荐 Wave 10 **不做**这个 —— 保持 OpenAI 纯净, 把 tool loop 压到下一轮 POST。

### 2.3 Attachment / 文件 / 图片

| 场景 | OpenAI 兼容做法 | QRClaw Wave 10 推荐 |
|---|---|---|
| 上传图片 (小, <5MB) | messages[].content 数组 `[{type:"image_url",image_url:{url:"data:image/..."}}]`, base64 | ❌ 禁止。base64 塞进 SSE 前的 HTTP body 也会让 gateway 内存爆。 |
| 上传图片 (大) | messages[].content 数组 `[{type:"image_url",image_url:{url:"https://..."}}]` | ✅ 用 `POST /api/owner/files` 拿 `{file_id, url}`, chat body 里只传 `image_url.url` (签名 URL) |
| 上传文件 | OpenAI `/v1/files` + messages `[{type:"input_file",file_id:"..."}]` | ✅ 同上路径, QRClaw file_id 直接复用 |
| 回传流里带图片 | 不常见; OpenAI 视觉模型只返 text | QRClaw 如要返图: 把 URL 当 markdown `![](url)` 嵌 `delta.content`, 不新增字段 |

**MIME whitelist** (gateway 拒收其他): `image/png,jpeg,webp,gif`, `application/pdf`, `text/*`。

### 2.4 Annotations / Citation (为未来 RAG 预留)

assistant-ui 有 `annotations:[{type:"citation", url, title, start, end}]`。OpenAI 本体没有。
**Wave 10 策略**: 预留 `delta.annotations` 字段, 但 gateway 默认**不发**。后续 RAG 上线时用 assistant-ui 可见, LobeChat 会忽略(无破坏)。

---

## 3. 推荐协议 (最终稿)

**OpenAI Chat Completions chunk subset + QRClaw 受控扩展**。

理由 (按重要性排序):

1. **零改造对接三大 UI** (LobeChat / ai-sdk / assistant-ui 都支持), 不锁定 fork 策略;
2. **避免二次序列化** —— Host WS 里的 `owner_agent_run_event` 字段名保持不变, Gateway 只做 **字段重命名 + packaging**, 无业务逻辑搬家;
3. **可以 curl 调试** —— 用 `curl -N /v1/chat/completions` 即可 smoke test, 不用写 WS client;
4. **与草稿 §4 一致, 不引入新协议** —— 只是在 cursor 的骨架上把 tool_call / attachment / annotation / reasoning 几个点钉死。

**明确拒绝的备选**:
- ❌ 自研 `event: qrclaw_*` 多事件类型 —— LobeChat 不认, 失去原生支持。
- ❌ Vercel ai-sdk 的 "data stream protocol v2" (`0:"text"`, `9:"tool"`…) —— 只有 ai-sdk 自己和 assistant-ui 认, LobeChat 完全不支持。
- ❌ JSON-RPC over SSE (Anthropic MCP 风格) —— 又得给每个 UI 写 adapter。

---

## 4. 迁移影响: `web/src/stores/owner-agent-chat-store.ts`

现状 (读后摘要, `wc -l = 684`, 涉及方法见 grep):

| 现有方法 | Wave 10 操作 | 说明 |
|---|---|---|
| `OwnerAgentChatClient.sendMessage(agentId, content, clientId)` | **改签名**: 返回 `{ runId, stream: ReadableStream<OpenAIChunk> }` 而非 `{message_id, conversation_id, run_id, status}` | 由 HTTP JSON 改为 `fetch(..., {headers:{Accept:'text/event-stream'}})`, 读 `response.body.getReader()` |
| `OwnerAgentChatClient.waitForRunReply(conversationId, runId)` | **删除** (L57, L245, L299) | 现行只返 `"Reply received."` 占位, SSE 接管后不再需要 |
| store 里 `sendMessage` (L453) | **重写 inner loop** | 替换掉 L474-477 的 `await sendMessage` + `await waitForRunReply`, 改为 for-await-of SSE parser, 每个 chunk `append delta.content` 到 message buffer; 维护 `assistantMessageId = runId`-derived |
| `ensureOwnerWsSubscription()` (L552+) | **Phase B 移除调用**, Phase C 删掉整块 WS holder (L527–L684 大部分) | HEL-57 subscription |
| 新增 `cancelRun(agentId, runId)` | **新方法** | `POST /api/owner/agents/:id/runs/:runId/cancel`; store 本地把 message 标为 `cancelled`, 不等 SSE close |
| 新增 `regenerate(agentId, messageId)` | **新方法** | 本地截断到该 message 之前 + 重发 `sendMessage`, 带 `client_message_id = original + ":regen:" + n` |
| 新增 `retry(agentId, messageId)` | **新方法** | 对 `status=failed` 的 optimistic message 复用同 `client_message_id`, 让 gateway 幂等匹配回同一 run |
| 新增 `attachFiles(agentId, files[])` | **新方法** | 先 `POST /api/owner/files` 得 `{file_id,url}[]`, 放 `pendingAttachments[agentId]`; `sendMessage` 拼成 `content: [{type:"text",...}, {type:"image_url",...}]` 数组模式 |
| `resetContext(agentId)` (L509) | **增强**: 调用前若 `statusByAgent[agentId]==='running'`, 先 `cancelRun` | 避免旧 run 结束后还往前端投 delta |
| `loadMessagesForAgent` (L443, L447) | **保留**, 但断线恢复时新增走 `decrypted-messages?include_events=1&after_seq=N&run_id` 路径 | §8 草稿 |
| 全局 `HISTORY_REPLAY_RETRY_DELAYS_MS` (L444) | 保留但缩短 | SSE 已覆盖 live, 只防极端抖动 |
| `setStatus` (L516) | 扩 `statusByAgent` 枚举 | 新增 `'streaming'` (首 chunk 到达 → `[DONE]` 之间), `'cancelling'` |

**接口边界示意** (伪代码, 不入库):

```ts
interface OpenAIChunkStream extends AsyncIterable<{
  runId: string;
  deltaText?: string;
  toolCall?: { id: string; name: string; argsDelta: string };
  finishReason?: 'stop' | 'tool_calls' | 'error' | 'cancelled' | 'length';
  errorCode?: string;
}> {}

interface OwnerAgentChatClientV2 {
  sendMessage(agentId, content, clientId, attachments?): Promise<{runId: string; stream: OpenAIChunkStream}>;
  cancelRun(agentId, runId): Promise<void>;
  uploadFile(agentId, file): Promise<{file_id: string; url: string}>;
  resetContext(agentId): Promise<void>;
}
```

---

## 5. 协议层测试用例 (10 条)

> 全部是 **gateway ← host WS / browser ← gateway SSE** 的集成断言, 不依赖真实 provider。
> 现有 `gateway/src/host-router.ts` 的 run pipeline 可用 mock host 驱动。

| # | 名称 | 输入 (WS 侧 / HTTP 侧) | 期望输出 (SSE 侧) | 断言重点 |
|---|---|---|---|---|
| **T1** | 正常文本流 | WS: accepted → event(text "Hel") → event(text "lo") → completed | `{role}` chunk → `{content:"Hel"}` → `{content:"lo"}` → `{finish_reason:"stop"}` → `[DONE]` | 字节序完整、无重复、`id` 全 `chatcmpl_<run_id>` |
| **T2** | 首字节前 host 失败 | WS: run_failed(seq=0, error_code=host_offline) | HTTP 502 JSON `{error:{code:"host_offline"}}`, **不进 SSE** | 未 commit headers 就能切回 HTTP error |
| **T3** | 首字节后 host 失败 | 已发 role+content, 再收 run_failed | 发 error chunk `{error:{...},choices:[{finish_reason:"error"}]}` → `[DONE]` | `[DONE]` 恰好一次 |
| **T4** | 客户端断连 (default) | 客户端 abort fetch, host 继续 | SSE 关闭; Host run 不 cancel; DB 最终 `completed`; 后续 `GET /messages` 能拉到 | §5 草稿 L139-141 默认不 cancel |
| **T5** | 客户端断连 + `metadata.qrclaw_cancel_on_disconnect=true` | 同上 + 请求 body 带 flag | Gateway 发 `owner_agent_run_cancel` 到 host; DB `cancelled` | 可选 cancel 语义 |
| **T6** | 显式 `POST /runs/:id/cancel` | 流 mid-stream 时调 cancel | SSE 继续写, 直到 host 发 failed/completed; 或 gateway 收 cancel ack 后主动 emit `{finish_reason:"cancelled"}` + `[DONE]` | 两段语义: "我想 cancel" vs "已 cancel" |
| **T7** | Tool call 单回合 | WS: tool_use(id=c1, name=run_sh, args `{"cmd":"ls"}`) → completed(no final text) | `delta.tool_calls[0]={id:"c1",function:{name:"run_sh",arguments:"{\"cmd\":\"ls\"}"}}` → `{finish_reason:"tool_calls"}` → `[DONE]` | `finish_reason="tool_calls"`, LobeChat/ai-sdk 能接住进入 tool loop |
| **T8** | Attachment 传入 (image_url) | HTTP body `messages:[{content:[{type:"text"},{type:"image_url",image_url:{url:"https://.../sig=..."}}]}]` | 正常文本流 T1; 且 Gateway 拒收 `image_url.url` 为 `data:` 前缀 (返 400 invalid_request) | base64 禁用 |
| **T9** | 幂等重发 (retry) | 同 `client_message_id` 30s 内二次 POST, 第一次尚未 completed | 第二次连接绑定**同一** `run_id`, 从当前 seq **继续**推 chunk (不从 0 重发) | 用 `owner_agent_messages.metadata.client_message_id` dedupe; 第二次 response 首条 chunk 应带截至当前的**聚合 text** 或从 `after_seq+1` 开始 |
| **T10** | 断线恢复 via `decrypted-messages` | 流中断后客户端调 `GET /functions/v1/decrypted-messages?actor=owner-private-agent-chat&run_id=R&after_seq=12&include_events=1` | JSON 数组, `events[]` 含 seq>12 的 text/tool_use/tool_result; 客户端本地 fold 出完整 assistant message | 验证 C2 plaintext 仅在**已授权 read-path decryptor** 产生, Gateway SSE 不做密文 → 明文转换 |

**补充 invariants (非独立 case, 每个 case 都应 assert)**:
- `[DONE]` exactly once.
- 无任何 chunk 含明文 KEK/DEK / raw Supabase JWT。
- UTF-8 多字节字符不在 chunk 中点切断 (gateway 按 char-boundary 切分 host 的 byte delta)。
- `X-Accel-Buffering: no` 在响应头出现 (否则 CF Workers 会聚合)。

---

## 6. 未决 & 建议 (产品 / 架构需拍板)

1. **`/v1/chat/completions` alias 是否要提供?**
   推荐: **要**。能让 LobeChat/assistant-ui/ai-sdk 配 `baseURL=https://gateway.qrclaw/v1` 零改造接入。`model` 字段用 `qrclaw:<agent_id>` 承载 agent 路由。
2. **`reasoning_content` 是否 emit?**
   推荐: **默认关**, Web 里加 debug 开关。LobeChat 0.x 对未知 `delta` 字段静默忽略, 安全。
3. **`regenerate` 是否复用 `run_id`?**
   推荐: **新 run_id**, 但关联 `parent_run_id` (DB field 已有) 用于分析。`client_message_id = <orig>:regen:N` 保证审计链。
4. **Tool loop 是否同回合渲染?**
   推荐: Wave 10 **单回合不混显**, 按 OpenAI "一个 `finish_reason=tool_calls` → 下一轮带 `role=tool` 消息" 的分回合模型。Wave 11 再评估 assistant-ui `annotations`。

---

## 7. 对 cursor 草稿 q2-sse-protocol.md 的补丁点 (不改 cursor 文档, 供评审合并)

- §3 Request Contract: 补 `messages[i].content` 允许 **string | Part[]** 两种, 其中 Part = `{type:"text"}` | `{type:"image_url"}` | `{type:"input_file"}`; 第二种仅当请求里带 attachment 时使用。
- §4 SSE Response Contract / Mapping 表: 把 `tool_use/tool_result/status` 这一行拆成 3 行 (`tool_use`→tool_calls chunk; `tool_result`→SSE comment; `status`→SSE comment); 见本文 §1.2 / §2.2。
- §10 Control Signals: 追加 `regenerate` 行 — route `POST /runs/:runId/regenerate`, 语义: 以父 run input 启新 run, 不改父 message。
- §12 Phase 2: 新增 "实现 SSE chunk parser 与 cancelRun / regenerate / attachFiles" 作为 Web 端 explicit 子项 (见本文 §4)。
- §13 Open Questions 追加:
  - 是否提供 `/v1/chat/completions` 兼容路由?
  - Tool loop 是否单回合混显 (assistant-ui annotations)?

---

## 附录 A — 为什么不做 `Last-Event-ID` 重连

1. OpenAI chunk 没有 monotonic id, 只有共享 `chatcmpl_<run_id>`。要塞 event id 就违反草稿 §4 的"不加 QRClaw-only 字段"。
2. SSE 规范的 `Last-Event-ID` 依赖 client 自动发, LobeChat 的 `fetch + getReader` 实现**不走 EventSource**, 根本不会发。
3. 已有 `decrypted-messages include_events=1 after_seq=N` 能做精准 resume, 且 C2 合规 (read-path decryptor)。

## 附录 B — 为什么不让多 session 共享一个 SSE 连接

- SSE 是 **request-scoped**, HTTP/1.1 每连接单方向, 要多路复用只能堆层 (multiplex over one WS / HTTP/2 push)。
- LobeChat / ai-sdk 都假设 "一个 POST = 一个 turn"。共享连接需自建 dispatcher, 丢了原生兼容。
- 每个 agent chat 页面同时最多 1-2 个活跃 run (UX 上也不会并行 N 个), 成本可忽略。
- 真需要跨 session 观察 (e.g. 仪表盘): 用 `decrypted-messages` polling 或未来的 `GET /runs/:id/events` SSE recovery route, 而非复用 chat 流。

---

(End — 296 lines)
