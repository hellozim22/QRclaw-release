# Wave 10 R3 Code Changelist

> 输入：`r2-c1-model-resolution.md`、`r2-c3-final-tech-stack.md`、`r2-c4-sse-spec-final.md`、`r2-c5-onboarding-final.md`、R2 审查补充。  
> 口径：预计行数是本轮新增/修改净行数，不是文件总行数。Wave 10 继续保留 Supabase 云路径，不做 sqlite 迁移；UI token 落地必须用当前 `--color-*` SSOT。

## 总原则

1. Sprint 1 先做 rename-first 数据地基、runtime 四槽位、默认 4 agent、`/chat` 首屏可用。
2. Sprint 2 做 OpenAI SSE + assistant-ui，把旧 owner-agent 轮询/占位回复从主路径移走。
3. Sprint 3 做附件/图片、session 管理补齐、E2E harness 和 C2 护栏。
4. 不删除历史 visitor/QRCode 主链路；`/messages` 只 redirect 到 `/chat`，公开入口移到“公开入口 / 分享”。
5. `agent_bindings`、`owner_agent_conversations` 进入兼容期，不在 Sprint 1 物理删除。

## Sprint 1（今晚）Foundation / Runtime / 首屏

目标：今晚形成小闭环：DB migration 可预写，Gateway 能暴露 runtimes/default agents，Web `/chat` 不再空白，4 个默认 agent 槽位可见。

### 新建文件

| Path | 用途 | 预计行数 |
|---|---|---:|
| `supabase/migrations/20260428_wave10_runtime_session.sql` | Runtime/Agent/Session rename-first migration：`agent_runtimes`、`agents.runtime_id/is_default/source`、`owner_agent_conversations` rename、兼容 view、RLS、索引 | 180 |
| `gateway/src/db/owner-runtimes.ts` | `agent_runtimes` 读写、host provider 回填、runtime status 查询、默认 runtime upsert | 180 |
| `gateway/src/services/default-owner-agents.ts` | `ensureDefaultAgents(owner_id)` 幂等创建 `openclaw/claude/cursor/codex` 4 个默认 agent | 120 |
| `gateway/src/routes/owner-runtimes.ts` | `GET /api/owner/runtimes`、`POST /api/owner/runtimes/rescan`、安装提示查询 | 120 |
| `shared/contracts/http/owner-runtimes/types.ts` | Runtime DTO：`runtime_type/status/capabilities/version/install_hint` | 90 |
| `shared/contracts/http/owner-runtimes/protocol.ts` | Runtime HTTP zod schema | 90 |
| `web/src/lib/api/owner-runtimes.ts` | Web 端 runtime list/rescan API client | 70 |
| `web/src/components/owner-chat/AgentRuntimeRail.tsx` | `/chat` 左栏 4 默认 agent + runtime 状态槽位 | 180 |
| `web/src/components/owner-chat/OnboardingEmptyState.tsx` | Host 未连接、半连、未安装、需登录三态首屏 | 160 |
| `web/src/components/owner-chat/RuntimeInstallHint.tsx` | 未安装 runtime 的安装命令/文档/重新扫描 UI | 90 |
| `web/src/app/pair/page.tsx` | pairing 授权页：设备名 + pairing code + 授权/拒绝，不展示 host token | 130 |
| `tests/unit/backend/default-owner-agents.test.ts` | 默认 4 agent 幂等创建、用户改名/改 instructions 不覆盖 | 120 |
| `tests/integration/database/wave10-runtime-session-schema.test.ts` | migration 结构、RLS、兼容 view、唯一索引检查 | 160 |

### 修改文件

| Path | 改什么 | 预计行数 |
|---|---|---:|
| `supabase/types/database.types.ts` | 重新生成 Supabase types，加入 `agent_runtimes`、`owner_agent_sessions`、新增 columns/view | 250 |
| `gateway/src/db/owner-agent-chat.ts` | conversation 命名兼容为 session；agents 读写加入 `runtime_id/is_default/source`；旧 binding 只读回填 | 220 |
| `gateway/src/services/owner-agent-chat.ts` | list/create/send 改为基于 `runtime_id` 选 host/runtime；创建时不再强依赖 `agent_bindings` 新写入 | 180 |
| `gateway/src/services/agent-host-registry.ts` | host register/heartbeat 后同步 `agent_runtimes` 在线状态、版本和 capabilities | 120 |
| `gateway/src/ws/host-router.ts` | `host_register` / `host_capabilities_updated` 写入 runtime 投影；日志只记 provider/status，不记 secret/content | 120 |
| `gateway/src/routes/owner-agents.ts` | `GET /api/owner/agents` 前调用 `ensureDefaultAgents`；返回默认 agent 和 runtime 状态 | 80 |
| `gateway/src/routes/owner-agent-messages.ts` | `conversation_id` 入参/出参兼容为 `session_id`；reset route 保持旧路径但内部 session 化 | 100 |
| `gateway/src/server.ts` | 注册 `owner-runtimes` route | 10 |
| `shared/contracts/http/owner-agent-chat/types.ts` | Agent DTO 加 `runtime_id/is_default/source/runtime_status`；response 增加 `session_id` 兼容字段 | 100 |
| `shared/contracts/http/owner-agent-chat/protocol.ts` | 同步 zod schema；保留 `conversation_id` deprecated alias | 100 |
| `shared/contracts/http/index.ts` | 导出 owner-runtimes contract | 10 |
| `supabase/functions/decrypted-messages/index.ts` | owner-private-agent-chat 支持 `session_id` alias，内部仍兼容 `conversation_id` | 70 |
| `supabase/functions/_shared/contracts/http/decrypted-messages/types.ts` | mirror 合同字段：`session_id/include_events/run_id/after_seq` | 50 |
| `web/src/stores/owner-agent-chat-store.ts` | 状态模型从 agent-only 改成 `agents + runtimes + selectedSessionId`；首屏加载默认 agent/历史 | 220 |
| `web/src/app/(dashboard)/chat/page.tsx` | 拆出左栏/空态组件；显示 4 槽位，移除硬编码颜色，改用现有 `--color-*` token | 220 |
| `web/src/app/(dashboard)/messages/page.tsx` | 旧 dashboard messages 入口 redirect 到 `/chat`，保留 query/session 参数 | 40 |
| `web/src/app/(dashboard)/layout.tsx` | 导航文案去重：`Messages` 合并为 `Chat`；QRCode 放到公开入口 | 40 |
| `web/src/app/(dashboard)/agents/page.tsx` | Agent 列表展示 runtime 绑定、默认 agent、未安装/需登录状态 | 120 |
| `qrclaw-agent-host/internal/detect/detect.go` | runtime status 扩展为 `not_installed/needs_login/online/offline/error`；返回 install hint 基础信息 | 120 |
| `qrclaw-agent-host/internal/provider/provider.go` | capability/status DTO 对齐 Gateway runtime 投影 | 80 |
| `qrclaw-agent-host/cmd/qrclaw-agent-host/run.go` | detect loop 5s tick + rescan 命令/heartbeat active runtime 同步 | 120 |
| `tests/unit/shared/http-owner-agent-chat-contracts.test.ts` | 更新 Agent/session DTO contract 测试 | 80 |
| `tests/unit/frontend/owner-agent-chat-store.test.ts` | 默认 agent、runtime 三态、旧 history merge 回归 | 120 |
| `tests/e2e/wave10/onboarding/auto-detect-runtimes.spec.ts` | 从 skeleton 补到 Sprint 1 可跑/可 skip 的真实 runtime preflight | 80 |
| `tests/e2e/wave10/onboarding/default-agents-provision.spec.ts` | 验证 4 默认 agent 幂等创建 | 80 |
| `tests/e2e/wave10/onboarding/first-login-flow.spec.ts` | 覆盖空态/半连/全连首屏 | 100 |

### 删除文件

| Path | 废弃原因 | 处理 |
|---|---|---|
| 无 | Sprint 1 采用 rename/view/redirect 兼容策略，避免破坏 Wave 1-9 visitor/owner 历史链路 | 不删除 |

## Sprint 2 OpenAI SSE / assistant-ui / Chat 核心

目标：用 OpenAI Chat Completions SSE 替代 owner-agent 主路径的 `POST /messages + waitForRunReply()` 占位轮询，Web 右栏接入 assistant-ui，完成流式、Markdown、Cancel/Regenerate。

### 新建文件

| Path | 用途 | 预计行数 |
|---|---|---:|
| `gateway/src/services/openai-chat-sse.ts` | OpenAI chunk builder、`[DONE]`、finish_reason、tool_call delta 转换 | 180 |
| `gateway/src/services/owner-agent-stream-hub.ts` | process-local SSE sink registry：run_id -> stream response，支持 disconnect 不 cancel | 180 |
| `gateway/src/routes/owner-agent-chat-stream.ts` | `POST /api/owner/agents/:agentId/chat` + `/v1/chat/completions` alias | 220 |
| `shared/contracts/http/owner-agent-chat/openai-types.ts` | OpenAI request/content parts/chunk DTO，含 `image_url/input_file` | 150 |
| `shared/contracts/http/owner-agent-chat/openai-protocol.ts` | OpenAI request zod schema、MIME/content validation | 160 |
| `web/src/lib/owner-agent-sse-runtime.ts` | assistant-ui custom runtime adapter：fetch POST、parse SSE、fold delta | 220 |
| `web/src/lib/sse/openai-parser.ts` | 浏览器端 OpenAI SSE parser，忽略 comment，处理 `[DONE]` | 120 |
| `web/src/components/owner-chat/AssistantChatPane.tsx` | `<AssistantRuntimeProvider>` + Thread/Composer 容器 | 180 |
| `web/src/components/owner-chat/OwnerMarkdown.tsx` | `@assistant-ui/react-markdown` + `remark-gfm` + `rehype-highlight`，禁 raw HTML | 120 |
| `web/src/components/owner-chat/StreamErrorBanner.tsx` | 首 chunk 前失败、中途断线、恢复历史提示 | 90 |
| `tests/integration/gateway/owner-agent-openai-sse.test.ts` | SSE text/final-only/tool_call/pre-byte error/mid-stream error/idempotency | 260 |
| `tests/unit/frontend/openai-sse-parser.test.ts` | parser 单测：chunk split、comment、DONE、invalid JSON | 120 |
| `scripts/check-c2-violations.ts` | 静态扫描 Gateway 明文日志危险模式，如 `console.log(req.body)` | 140 |

### 修改文件

| Path | 改什么 | 预计行数 |
|---|---|---:|
| `web/package.json` | 加 `@assistant-ui/react`、`@assistant-ui/react-ui`、`@assistant-ui/react-markdown`、`remark-gfm`、`rehype-highlight` | 10 |
| `web/package-lock.json` | npm lockfile 更新 | 900 |
| `gateway/src/server.ts` | 注册 SSE route；`/v1/chat/completions` alias 在 CORS/helmet 下允许 SSE headers | 30 |
| `gateway/src/routes/owner-agent-messages.ts` | `POST /messages` 保留为兼容/非流式 fallback；主 UI 不再调用 | 60 |
| `gateway/src/services/owner-agent-chat.ts` | 拆出 create-run/dispatch-run；支持 SSE route 先注册 sink 再 dispatch host | 220 |
| `gateway/src/ws/host-router.ts` | Host run accepted/event/completed/failed 持久化后 publish 到 stream hub | 200 |
| `gateway/src/services/decrypted-messages-client.ts` | recovery 支持 `include_events/run_id/after_seq` | 80 |
| `shared/contracts/ws/types.ts` | Host event metadata 对齐 SSE tool_call/error/status；保留旧字段兼容 | 80 |
| `shared/contracts/ws/protocol.ts` | Zod schema 同步 content parts/tool metadata | 80 |
| `supabase/functions/decrypted-messages/index.ts` | `include_events=true` 时按 run/seq 返回加密 run events 解密结果 | 180 |
| `web/src/stores/owner-agent-chat-store.ts` | 移除 live path 的 `waitForRunReply()`；只保留历史/session state | 180 |
| `web/src/app/(dashboard)/chat/page.tsx` | 右栏替换为 `AssistantChatPane`，保留 agent/session chrome | 140 |
| `web/src/components/chat/MarkdownRenderer.tsx` | visitor chat 继续可用；owner chat 迁到新 renderer，避免破坏旧链路 | 40 |
| `tests/integration/gateway/owner-agent-chat-api.test.ts` | 标注旧 `/messages` fallback 行为，新增 session_id alias 断言 | 100 |
| `tests/integration/gateway/owner-agent-chat-ws.test.ts` | Host WS -> SSE publish 后仍 ack，事件持久化不回归 | 100 |
| `tests/e2e/wave10/chat-core/streaming-output.spec.ts` | 解 skip：真实流式增量、首 token < 10s | 100 |
| `tests/e2e/wave10/chat-core/markdown-rendering.spec.ts` | GFM table、code block、高亮、raw HTML 禁止 | 100 |
| `tests/e2e/wave10/chat-core/claude-code-semantic-42.spec.ts` | 真 CLI 语义断言，reply 正则更严格 | 80 |
| `tests/e2e/wave10/session-mgmt/reload-history-replay.spec.ts` | reload 后走 encrypted history + include_events 恢复 | 100 |

### 删除文件

| Path | 废弃原因 | 处理 |
|---|---|---|
| 无 | `waitForRunReply()` 只从 live path 移除，旧 API fallback 和测试仍保留一轮 | 不删除 |

## Sprint 3 Attachments / Session 管理 / E2E 护栏

目标：补齐文件/图片、session CRUD、附件安全、E2E helper 和 C2 release gate。语音、workflow、Notion/Workspace 高级能力不进前三个 Sprint。

### 新建文件

| Path | 用途 | 预计行数 |
|---|---|---:|
| `supabase/migrations/20260428_wave10_attachments_session_ops.sql` | `attachments`、session title/pin/archive fields、必要索引/RLS | 180 |
| `gateway/src/db/owner-attachments.ts` | attachment metadata、storage key、owner/session 授权读写 | 160 |
| `gateway/src/routes/owner-attachments.ts` | `POST /api/owner/attachments/upload`、MIME/size whitelist、签名 URL/本地引用 | 220 |
| `shared/contracts/http/owner-attachments/types.ts` | attachment DTO：file_id、mime、size、image preview metadata | 100 |
| `shared/contracts/http/owner-attachments/protocol.ts` | zod schema + MIME whitelist | 110 |
| `web/src/lib/api/owner-attachments.ts` | upload/remove/list API client | 90 |
| `web/src/components/owner-chat/AttachmentComposer.tsx` | react-dropzone、粘贴图片、上传队列、失败阻塞发送 | 220 |
| `web/src/components/owner-chat/AttachmentCard.tsx` | 文件卡片、图片缩略图、失败/重试/移除状态 | 140 |
| `web/src/components/owner-chat/ImagePreviewLightbox.tsx` | `react-photo-view` 包装；若 license 不通过则替换 native dialog | 80 |
| `web/src/components/owner-chat/SessionList.tsx` | session 新建、切换、重命名、归档、搜索入口 | 220 |
| `web/src/components/owner-chat/SessionActionsMenu.tsx` | 右键/键盘菜单，支持 Rename/Archive/Export 后续入口 | 120 |
| `web/src/components/owner-chat/FullAccessConfirm.tsx` | 高权限 agent/tool 使用前确认，不把 tool 权限藏在后台 | 110 |
| `tests/helpers/wave10-harness.ts` | Playwright 用户级 harness：openChat/createSession/send/wait/assertNoLeak | 220 |
| `tests/helpers/db-query.ts` | 只读 DB 查询 + encrypted-at-rest 断言 | 160 |
| `tests/helpers/gateway-log.ts` | 本次 worker gateway/go-host/browser log 捕获与 leak scan | 160 |
| `tests/helpers/runtime-control.ts` | 真 runtime preflight、版本读取、故障注入、skip reason | 180 |
| `tests/e2e/wave10/README.md` | OAC-W10-E2E 编号、旧 R1/R2 映射、目录规则、real-runtime lane 说明 | 180 |
| `.github/workflows/wave10-e2e.yml` | skeleton discovery/browser smoke/self-hosted real-runtime 三条 lane | 160 |

### 修改文件

| Path | 改什么 | 预计行数 |
|---|---|---:|
| `web/package.json` | 加 `react-dropzone`、`react-photo-view`；若 license 不通过则不加 `react-photo-view` | 4 |
| `web/package-lock.json` | npm lockfile 更新 | 500 |
| `gateway/src/server.ts` | 注册 attachments route | 10 |
| `gateway/src/services/owner-agent-chat.ts` | chat request 支持 content parts：text/image_url/input_file；禁止 base64 data URL | 160 |
| `gateway/src/routes/owner-agent-chat-stream.ts` | request validation 接入 attachment references；pre-byte error 返回 JSON | 100 |
| `shared/contracts/http/owner-agent-chat/openai-types.ts` | content parts 增加附件引用类型与限制 | 80 |
| `web/src/lib/owner-agent-sse-runtime.ts` | 发送 multipart 前置上传后的 file_id/image_url 引用 | 80 |
| `web/src/components/owner-chat/AssistantChatPane.tsx` | composer 接入附件队列、send disabled reason、stop/regenerate/edit-resubmit | 180 |
| `web/src/components/owner-chat/OwnerMarkdown.tsx` | 图片链接安全渲染、代码块 copy、未闭合 code fence 防崩 | 120 |
| `web/src/components/owner-chat/AgentRuntimeRail.tsx` | agent 展开 session list；online/needs_login/not_installed 的可点击规则 | 120 |
| `web/src/stores/owner-agent-chat-store.ts` | session CRUD、archive、selectedSessionId、附件上传状态 | 240 |
| `gateway/src/db/owner-agent-chat.ts` | session CRUD：create/rename/archive/list by agent；soft delete 不物理删除 | 180 |
| `gateway/src/routes/owner-agents.ts` | Agent edit/delete/template 基础接口补齐，默认 agent 删除保护 | 160 |
| `web/src/app/(dashboard)/agents/page.tsx` | Agent edit instructions、模板、Full Access 确认 | 180 |
| `supabase/functions/decrypted-messages/index.ts` | session archive/deleted 权限与历史读取边界验证 | 80 |
| `tests/e2e/wave10/attachments/drag-file-upload.spec.ts` | PDF/TXT/PNG 上传、失败重试、禁止未上传发送 | 120 |
| `tests/e2e/wave10/attachments/image-preview.spec.ts` | 图片缩略图、lightbox、Esc focus return | 100 |
| `tests/e2e/wave10/session-mgmt/multi-session.spec.ts` | 同 agent 多 session 隔离 | 100 |
| `tests/e2e/wave10/session-mgmt/session-activity-unread.spec.ts` | 切换时 in-flight run 不 cancel，回切恢复 | 120 |
| `tests/e2e/wave10/resilience/network-reconnect.spec.ts` | SSE 中断、刷新历史、include_events 恢复 | 120 |
| `tests/e2e/wave10/security/decrypted-history-permission.spec.ts` | cross-owner isolation、C2 DB/log leak scan | 140 |
| `tests/integration/edge-functions/decrypted-owner-agent-chat.test.ts` | include_events、run_id/after_seq、session_id alias 回归 | 120 |
| `tests/integration/database/owner-agent-chat-rls.test.ts` | attachments/session/agent_runtimes RLS 覆盖 | 120 |

### 删除文件

| Path | 废弃原因 | 处理 |
|---|---|---|
| 无 | `web/src/app/(dashboard)/messages/page.tsx`、`agent_bindings`、兼容 view 都继续保留；真实删除放 Wave 11 清理任务 | 不删除 |

## 明确不进 Sprint 1-3

| 项 | 原因 |
|---|---|
| sqlite / PGlite / Turso 本地模式 | R2-C2 定版：Wave 10 保 Supabase；本地存储只进 Wave 11 spike |
| 语音输入/TTS | 蓝图列为后续能力，依赖 chat 核心稳定后做 |
| Workspace/Git/Notion/Workflow/Agent 协作 | 范围过大，依赖 session/attachments/tool call 基础 |
| Mermaid/KaTeX 完整渲染 | P1/P2；Sprint 2 只保证 markdown/table/code block |
| 物理删除 session/message | C2/C5/audit 边界未定；前三 sprint 只做 archive/soft delete |

## 风险点

1. `shared/contracts/` 是契约面，实施前需要 openclaw-dev 拍板一次字段命名：`session_id` 是否替换 `conversation_id`，还是双字段一轮。
2. `react-photo-view` 是 Apache-2.0；若 license 要求严格 MIT，Sprint 3 改用 native dialog，不影响其余文件清单。
3. Gateway SSE stream hub 是 process-local；多实例部署需要 Redis pub/sub 或 sticky session，前三 sprint 按单 Gateway 进程交付。
4. 真 CLI E2E 不应在普通 GitHub-hosted PR lane 强跑；release gate 需要 self-hosted macOS/受控机器。
