# Wave 10 全面架构蓝图（非 MVP · 一步到位）

> 2026-04-28 · R2 最终综合
> 输入: r1-arch-independent-review / r1-data-model / r1-onboarding-design / r1-sse-integration-spec / r1-wave10-test-cases / r2-c1-model-resolution / r2-c3-final-tech-stack / r2-c4-sse-spec-final / r2-c5-onboarding-final
> 性质: 10 维能力全量蓝图 + 9 Sprint 拆分 + 3 月后产品画像 + 每 Sprint E2E 用例数
> 铁律: C1 (Gateway 不推理) · C2 (加密双模: cloud 强加密 / local 文件权限) · C4 (rename-first migration) · C5 (resume 走加密读路径)

---

## 0. 指导思想

不做 MVP 心智:
- **完整形态**: 10 维能力全部在 Wave 10 内闭环, 不把"未来再说"写进文档
- **依赖序列**: 9 Sprint 按"不引入技术债就能落地的最早时刻"排序, 后一 sprint 不重写前一 sprint
- **每 sprint 可发布**: 每个 sprint 结束都是一个可演示给用户、可跑 E2E、可回滚的状态
- **铁律不让步**: C2 双模、C4 rename-first、C5 encrypted resume 不因进度压力妥协
- **Multica 范式 + QRClaw 资产**: 采纳"runtime 四槽位始终显示"的心智, 但保留三层模型、加密栈、Host WS 协议栈

---

## 1. 十维能力最终形态

### 1.1 Runtime 维 (本机 CLI 能力)

**最终形态**
- `agent_runtimes` 表: owner × host × runtime_type 唯一索引, `runtime_type` 用 text 不用 enum
- 四个内置 runtime: `openclaw / claude / cursor / codex`, 可扩展到 `gemini / aider / continue` 等
- Go Agent Host 每 5s detect 一次, 变化即上报; 首屏 ≤ 5s 亮槽位
- Runtime 状态机: `not_installed / installing / needs_login / online / updating / offline / error`
- 每个 runtime 暴露 `capabilities` JSONB: `{streaming: true, files: true, images: true, tools: [...], max_context: 200k}`
- 支持 runtime 版本检测 + 一键升级提示 ("claude 1.2.3 → 1.3.0 available")
- 多 host 场景: 同一 owner 可绑定 "公司 mac / 家里 mac / 远程服务器", runtime 列表按 host 分组

**验收**: cold start 打开 dashboard, 5 秒内四槽位全部显示真实状态且带版本号。

### 1.2 Agent 维 (人格/入口)

**最终形态**
- `agents` 表: `(owner_id, runtime_id, name, description, instructions text ≤ 8000, is_default, source)`
- 四个默认 agent 首次登录 auto-provision, `is_default=true, source='system_default'`
- 用户可创建 N 个自建 agent, 挂同一 runtime 不同 instructions (例: "笔笔省 workspace agent" 用 claude runtime + 项目定制 instructions)
- Agent 编辑: name / description / instructions / 关联 runtime 切换 / icon / color / shortcut hotkey
- Agent 导入导出: JSON 格式 `{name, instructions, runtime_type, capabilities_required}`
- Agent 市场 (M3 外置, Wave 10 内只做导入): 支持 `.qrclaw-agent` 文件双击导入
- Agent 权限 (为 B2B 留位): `agents.visibility = 'private' | 'shared' | 'public'`, 当前全部 private

**验收**: 用户可以"复制默认 Claude Code agent → 改 instructions → 命名为 '笔笔省专家' → 挂同 runtime → 在列表分行显示"。

### 1.3 Session 维 (话题会话)

**最终形态**
- `owner_agent_sessions` (rename from `owner_agent_conversations`): `(owner_id, agent_id, title, provider_session_id, provider_work_dir, status, last_active_at)`
- 删除 `UNIQUE(owner_id, agent_id)`, 支持同一 agent 多 session
- Session 生命周期: `active / archived / deleted (soft) / purged (hard, 30 天后)`
- Session 操作: 新建、重命名 (手动 + auto-title 基于首轮对话)、归档、置顶 (pinned 字段)、导出 (Markdown / JSON)、分享 (生成只读 snapshot URL)
- Session 分组: 用户可建 folder (`session_folders` 表), 拖拽 session 进 folder
- Session 搜索: 全文搜索 (明文在 cloud 模式下走 pg_trgm on decrypted content cache, local 模式直接 sqlite FTS5)
- Session 分叉 (fork): 在任意消息右键"从此处分叉", 复制到新 session 继续探索 (典型 AB 测试 prompt 用法)

**验收**: 用户在"笔笔省专家" agent 下可以同时开"UI 讨论"/"架构讨论"/"debug 日志"三个 session, 独立历史, 互不污染上下文。

### 1.4 Chat 体验维

**最终形态**
- UI 栈: `@assistant-ui/react@0.12.26` + `@assistant-ui/react-ui@0.2.1` + `@assistant-ui/react-markdown@0.12.11`
- Markdown: `remark-gfm` (表格/checklist) + `rehype-highlight` (代码高亮) + 禁用 raw HTML
- 代码块: 语言标签、复制按钮、"在编辑器打开" (调用 host IPC 写临时文件 + open cmd)
- Mermaid 图表: M3 后置, 走 client-only dynamic import
- 数学公式: KaTeX, client-only
- 流式渲染: OpenAI SSE chunks, 支持未闭合代码块安全渲染
- 消息操作: 复制、重生成 (regenerate from this)、编辑重发 (edit and resubmit, fork 式)、删除、点赞/点踩 (for future RLHF)、引用 (quote into next message)
- Token 计数: 输入框实时显示 tokens estimate (使用 `@anthropic-ai/tokenizer` 或 tiktoken)
- Composer: 多行输入、粘贴图片自动附件、Slash command (`/clear /system /retry /export`)
- 快捷键: `⌘↵ 发送 / ⌘K 搜索 / ⌘N 新 session / ⌘⇧N 新 agent / ↑ 编辑上条`
- 主题: light / dark / system, 跟随 OS
- 字体大小: 3 档

**验收**: 流 10k tokens 回复不掉帧, 点"从此处重生成"能正确分叉并流式, 粘贴截图自动上传并在消息中以图片 card 显示。

### 1.5 语音维

**最终形态**
- 输入: Web Speech API (Chrome/Safari) + 回退 Whisper.cpp (通过 host 本地调用), 按住空格录音
- TTS 输出: macOS `say` 命令 (host IPC 调用) 或 ElevenLabs/OpenAI TTS (cloud 模式, 用户提供 key)
- 语音 session 标识: `sessions.input_modes jsonb = {voice: true, text: true}`
- Push-to-talk 模式 vs Always-on wake word ("Hey Claude"): 两种模式切换
- 语音 transcript 也走加密存储, 同 message pipeline
- 语音指令: "新建 session / 搜索笔记 / 归档当前" 走 local intent parser, 不走 LLM (节省)

**验收**: 用户按空格说话, 2 秒内 transcript 填入 composer, 发送后 reply 同步 TTS 朗读, 可中断。

### 1.6 Agent 协作维 (多 agent 协同)

**最终形态**
- 手动转交: 消息右键"转交给 Cursor Agent", 带当前上下文 summary 创建新 session
- @提及: 在 composer 中 `@CursorAgent 帮我实现这个` → 当前 session 暂停, fork 一个 sub-session 交给 @提及 agent, 结果回注主 session
- Workflow (M3 外置部分基础设施 Wave 10 内完成): `workflows` 表 + DSL `yaml` (`steps: [{agent: claude, prompt: ...}, {agent: cursor, prompt: {{prev.output}}}]`)
- Agent-to-agent stdio bridge: 已在 Go host, Wave 10 暴露到 UI "让 A 审查 B 的输出"
- 并行探索 (Parallel fan-out): "让 Claude 和 Codex 同时回答这个问题" → 左右分栏对比
- 共享记忆池 (optional, per-workspace): `workspace_memories` 表, 跨 session/跨 agent 可读写的 key-value

**验收**: 用户说"让 Claude 写代码, 让 Cursor review", 系统自动 fork 两个子 session, 结果回注并在主 session 形成带引用的合并消息。

### 1.7 Workspace 维 (笔笔省绑定)

**最终形态**
- `workspaces` 表: `(id, owner_id, name, root_path, type: 'repo'|'folder'|'notion', config jsonb)`
- Workspace binding: agent / session 可绑定 workspace, 绑定后 host spawn CLI 时自动 `cwd = workspace.root_path`
- Workspace file tree: 左侧 panel 可看 workspace 文件树, 点击打开, 拖入 composer 变 attachment
- Workspace context auto-inject: session 开始时把 `workspace/AGENTS.md` / `CLAUDE.md` / `.cursorrules` 自动注入 system prompt
- 笔笔省 (Notion-like) 集成: `workspaces.type='notion'` 时, workspace root 是 Notion workspace, file tree 是 page tree, attachment 自动转 Notion block reference
- Git 集成: 显示当前 branch / uncommitted files, 支持"让 agent 在新 branch 工作" (host 自动 worktree)
- 多 workspace: 一个 owner 可绑 N 个 workspace, session 切换 workspace 是显式动作

**验收**: 用户在"笔笔省" workspace 下新建 session, agent 自动读到项目规范, 改文件后能在 UI 看 diff 并 one-click commit。

### 1.8 工具可视化维

**最终形态**
- Tool call 渲染: CLI emit 的 tool_use block 在 UI 展示成可展开卡片
- 内置工具类型渲染: `file_read / file_write / bash / web_search / mcp_*` 各自定制 UI
- File diff: 当 tool_use 是 file_edit 时, 渲染 monaco diff viewer
- Bash output: 带 ANSI 色彩解析 + 可折叠 + 可复制
- Web search: 结果以 card 列表, 点击打开新 tab
- MCP server 状态面板: 展示 host 上已注册 MCP server, 可启停
- Tool approval (for sensitive ops): `agents.tool_policy jsonb`, 指定哪些工具需人工确认 (例: bash rm 需审批弹窗)
- Tool 统计: 每 session 显示 "本 session 调用 bash 23 次 / web_search 5 次 / tokens 45k"

**验收**: agent 运行 `rm -rf tmp/` 触发审批弹窗, 用户 Approve/Deny, Gateway 对应 ack/reject, Host 正确执行或中止。

### 1.9 数据存储维 (C2 双模)

**最终形态**
- **双模架构**:
  - `deploy_mode='cloud'`: Supabase Postgres + KEK/DEK + `decrypted-messages` Edge Function (继承 Wave 5-9)
  - `deploy_mode='local'`: sqlite (`~/.qrclaw/qrclaw.db`) + chmod 600 + FileVault 依赖
- 数据 schema 两模一致, 通过 Drizzle ORM 统一 (Postgres + SQLite dialect)
- Migration 工具: cloud 走 Supabase migration, local 走 Drizzle migrator, 共享 schema DSL
- 备份: local 模式每日 auto-backup 到 `~/.qrclaw/backups/YYYY-MM-DD.db.gz`
- Export: 一键导出所有 session 为 `.qrclaw-archive.zip` (messages Markdown + attachments + manifest)
- Cloud sync (M3 opt-in): local → cloud 一次性迁移脚本 + 持续增量同步 (基于 `updated_at` watermark)
- Audit log: 所有 DB 写操作记入 `audit_events` 表 (谁/何时/改了什么/IP)

**验收**: 用户可以在 Settings 切换 local/cloud 模式, 迁移向导逐表显示进度, 切完所有历史 session 可读, E2E 跑一轮 runs-replay 通过。

### 1.10 质量维 (测试/可观测/护栏)

**最终形态**
- **E2E**: Playwright, 真 runtime (P0/P1), fake provider 仅 P2 fault-injection, 总 30 用例 (来自 r1-wave10-test-cases)
- **Unit**: web/gateway/host/shared 四层, 覆盖 ≥ 80%
- **Integration**: Gateway ↔ Host WS frames / Gateway ↔ SSE / Edge Function decrypt 独立 suite
- **Load**: k6 场景, 单 owner 并发 5 session / 10 runs / 100 tokens/s, 无 OOM 无数据错乱
- **可观测**: OTel traces 覆盖 SSE stream 生命周期, metrics: `sse_stream_duration / tokens_per_second / runtime_detect_latency / cli_spawn_latency`
- **日志**: Gateway 结构化日志, 强制 redact regex 覆盖 prompt/delta/jwt/kek/dek
- **护栏自动检查**: CI 跑 `scripts/check-c2-violations.ts` 扫 Gateway 源码, 任何 `console.log(req.body)` 拒绝合入
- **Chaos**: Wave 10 结束前跑一轮 chaos: 杀 host / 断网 / 磁盘满 / OOM, E2E P2 全部通过
- **Canary**: cloud 模式 feature flag, 每 sprint 新功能先 10% 流量再 100%

**验收**: CI 绿, E2E 30 用例全部真 runtime + 语义断言通过, 无任何用例 skipped 或 disabled。

---

## 2. 9 Sprint 拆分 (依赖顺序)

> 每 sprint 默认 2 周 (10 工作日) / 2 人月。估工列给"全力投入人日"。

### Sprint 1 · Foundation (地基)

**目标**: rename-first migration + 双模存储抽象 + Go Host runtime detect 闭环

**交付物**
- S1.1 Drizzle schema DSL (shared), Postgres + SQLite 两套 migrator
- S1.2 Migration: `agent_runtimes` 新增、`agents` 加 `runtime_id/is_default/source`、`owner_agent_conversations` rename → `owner_agent_sessions` + 兼容 view
- S1.3 Go Host `detect-loop` 5s tick 上报 runtime 状态; `agent_hosts` + `agent_host_providers` → `agent_runtimes` 回填
- S1.4 `/api/owner/runtimes/list` + `/api/owner/runtimes/:id/install-hints`
- S1.5 双模开关: `QRCLAW_DEPLOY_MODE=cloud|local` 环境变量, 路由到不同 DB driver
- S1.6 C2-local 护栏: sqlite chmod 600 + 日志 redact 中间件

**估工**: 18 人日
**依赖**: 无 (起点)
**E2E**: 4 用例 (P0-01 runtime 5s 亮灯 / P0-08 migration 回滚 / P2-01 sqlite 文件权限 / P2-02 cloud→local 切换 smoke)

### Sprint 2 · Chat 核心 (SSE + assistant-ui)

**目标**: OpenAI SSE Gateway 路由 + assistant-ui 接入 + 单轮对话流式跑通

**交付物**
- S2.1 `POST /api/owner/agents/:agentId/chat` + `/v1/chat/completions` alias (spec: r2-c4)
- S2.2 Gateway Host WS bridge: 收 host event → 翻译 OpenAI chunk → `data: {...}` + `[DONE]`
- S2.3 Web `owner-agent-sse-runtime.ts`: 自实现 assistant-ui runtime adapter 解析 OpenAI chunks
- S2.4 Dashboard `/chat` 右栏换成 `<AssistantRuntimeProvider>` + Thread + Composer
- S2.5 Markdown 渲染 (gfm + highlight + 禁 raw HTML), 流式未闭合代码块安全
- S2.6 Cancel / Regenerate / Edit-and-resubmit 三个操作
- S2.7 Gateway 日志 redact + `scripts/check-c2-violations.ts` CI 接入

**估工**: 22 人日
**依赖**: S1 (runtime 数据层)
**E2E**: 5 用例 (P0-02~P0-06 默认 agent 点击 / 回答 42 / 流式 / Markdown / cancel)

### Sprint 3 · Attachments (文件/图片)

**目标**: 文件上传 + 图片 + 工具可视化 P0

**交付物**
- S3.1 `attachments` 表 + 对象存储 (cloud: Supabase Storage; local: `~/.qrclaw/attachments/`)
- S3.2 `/api/owner/attachments/upload` 预签名 URL (cloud) 或直传 (local)
- S3.3 react-dropzone 集成 + MIME/size 白名单 (50MB / 常见格式)
- S3.4 composer 粘贴图片 / 拖拽文件自动上传
- S3.5 Message content: `[{type:'text'},{type:'image_url'},{type:'input_file'}]` schema
- S3.6 react-photo-view 图片 lightbox
- S3.7 Tool call 渲染基础版 (file_read / file_write / bash), Monaco diff viewer 展示 file_edit
- S3.8 ANSI 解析器 for bash output

**估工**: 20 人日
**依赖**: S2 (SSE pipeline)
**E2E**: 4 用例 (P1-01 PNG 上传 + 识别 / P1-02 PDF 上传 + 摘要 / P1-03 file_edit diff 渲染 / P1-04 bash ANSI 输出)

### Sprint 4 · Session 管理

**目标**: Session 生命周期完整 + 多 session 切换 + 分叉 + 搜索 + 导出

**交付物**
- S4.1 Session CRUD: 新建 / 重命名 / 归档 / 删除 (soft + purge job)
- S4.2 Auto-title: 首轮对话后 Gateway 调用默认 runtime 生成 3-8 字 title
- S4.3 Session folders + 拖拽分组 + pin 置顶
- S4.4 Session fork: "从此处分叉" 复制历史到新 session
- S4.5 全文搜索: cloud pg_trgm / local sqlite FTS5, 基于解密后 content cache (cloud 模式在 Edge Function 内生成搜索 token)
- S4.6 Session export: Markdown / JSON 导出 + attachments bundle
- S4.7 Share snapshot: 生成只读 URL (不泄漏 instructions), 24h 过期可配置

**估工**: 20 人日
**依赖**: S2, S3
**E2E**: 4 用例 (P1-05 多 session 切换 / P1-06 fork 从 msg 5 / P1-07 搜索命中 / P1-08 reload replay)

### Sprint 5 · Agent 编辑 + Workspace

**目标**: Agent 管理完整 + Workspace 绑定 + Git 集成

**交付物**
- S5.1 Agent 创建向导 (复用 Wave 5-9 组件 85%) + 编辑器 + 删除保护
- S5.2 Agent 导入导出 `.qrclaw-agent` JSON
- S5.3 `workspaces` 表 + `/api/owner/workspaces` CRUD
- S5.4 Workspace file tree panel (virtual list)
- S5.5 Agent/Session ↔ workspace binding, host spawn 注入 `cwd`
- S5.6 Context auto-inject: `AGENTS.md` / `CLAUDE.md` / `.cursorrules` 读取合并进 system prompt
- S5.7 Git 状态显示 + "在新 branch 工作" (host 自动 worktree)
- S5.8 Tool approval policy + 审批弹窗

**估工**: 24 人日
**依赖**: S4
**E2E**: 4 用例 (P1-09 agent 编辑 instructions 生效 / P1-10 workspace 绑定 cwd / P1-11 自动读 AGENTS.md / P1-12 tool approval deny 中断)

### Sprint 6 · Voice

**目标**: 语音输入输出闭环

**交付物**
- S6.1 Web Speech API input, 按空格 push-to-talk
- S6.2 Whisper.cpp host fallback (空格长按 2s 切换到本地转录)
- S6.3 TTS output: macOS `say` + 可选 OpenAI TTS (cloud mode)
- S6.4 Session `input_modes` / `output_modes` 字段 + UI toggle
- S6.5 Local intent parser (正则 + fuzzy match): "新建 session / 归档 / 切换到 X"
- S6.6 语音 transcript 走同 message pipeline + 加密

**估工**: 14 人日
**依赖**: S2
**E2E**: 3 用例 (P1-13 语音输入 2s 内填 composer / P1-14 TTS 朗读回复 / P1-15 "新建 session" 本地 intent 不走 LLM)

### Sprint 7 · Agent 协作

**目标**: 手动转交 + @提及 + 并行 fan-out + workflow DSL 基础

**交付物**
- S7.1 消息右键"转交给 X agent", 带 context summary
- S7.2 @提及 解析: composer `@AgentName` 触发 sub-session
- S7.3 Parallel fan-out UI: 双栏对比两 agent 回答
- S7.4 `workflows` 表 + YAML DSL parser + executor
- S7.5 `workspace_memories` 表 + `workspace.getMemory/setMemory` tool 注入
- S7.6 Agent-to-agent stdio bridge UI 暴露 ("让 A review B")

**估工**: 22 人日
**依赖**: S5
**E2E**: 3 用例 (P1-16 转交上下文不丢 / P1-17 并行 fan-out 双结果 / P1-18 workflow 跑两步)

### Sprint 8 · Workspace 高级 + 协作扩展

**目标**: Notion 集成 + 多 workspace + 共享 session + B2B 预埋

**交付物**
- S8.1 Notion workspace adapter (OAuth + page tree + block operations)
- S8.2 多 workspace 管理 UI + 快速切换
- S8.3 Session sharing 进阶: 可编辑 share link (collaborator 可追问, 结果回注)
- S8.4 `agents.visibility` 语义激活 (private/shared), shared agent 可被其他 owner 克隆
- S8.5 Audit log UI + 筛选 + 导出
- S8.6 Cloud sync opt-in: local → cloud 迁移向导, 增量同步 job

**估工**: 22 人日
**依赖**: S5, S7
**E2E**: 3 用例 (P2-03 Notion page 拖入 session / P2-04 local→cloud 迁移 smoke / P2-05 shared session 并发 follow-up)

### Sprint 9 · Polish (打磨 + 质量)

**目标**: 性能 / 可观测 / Chaos / 文档 / 发布

**交付物**
- S9.1 OTel traces + Grafana dashboard 部署
- S9.2 Load test: k6 单 owner 5×10×100 场景达标
- S9.3 Chaos: 杀 host / 断网 / 磁盘满 / OOM suite
- S9.4 主题 / 字体 / 快捷键 / i18n (中英)
- S9.5 Onboarding 三态 (空/半连/全连) 最终打磨 + 安装包 (Tauri shell, `QRClaw.app`)
- S9.6 文档: 用户手册 + developer guide + migration guide
- S9.7 发布 v1.0: brew tap + Mac .app + Linux appimage + Docker compose (cloud mode)

**估工**: 20 人日
**依赖**: S1-S8 全部
**E2E**: 5 用例 (P2-06 chaos kill host / P2-07 磁盘满降级 / P1-19 i18n 切换 / P1-20 Tauri cold start 5s 亮灯 / P2-08 load test 5×10×100)

---

## 3. 总览表

| # | Sprint | 估工 | 依赖 | E2E 用例 | 累计用例 |
|---|---|---:|---|---:|---:|
| 1 | Foundation | 18 | - | 4 | 4 |
| 2 | Chat 核心 | 22 | S1 | 5 | 9 |
| 3 | Attachments | 20 | S2 | 4 | 13 |
| 4 | Session 管理 | 20 | S2,S3 | 4 | 17 |
| 5 | Agent + Workspace | 24 | S4 | 4 | 21 |
| 6 | Voice | 14 | S2 | 3 | 24 |
| 7 | Agent 协作 | 22 | S5 | 3 | 27 |
| 8 | Workspace 高级 | 22 | S5,S7 | 3 | 30 |
| 9 | Polish | 20 | All | 5 | **35** |

**总估工**: 182 人日 ≈ 18 人月 (单人 9 个月, 两人并行 4.5 个月, 双 sprint 并行可压至 3.5 月)
**总 E2E**: 35 用例 (覆盖 r1-wave10-test-cases 30 用例 + Polish 新增 5)

---

## 4. 3 月后最终产品画像

### 4.1 用户旅程 (zimzheng 的一天)

```
08:00  双击 QRClaw.app (Tauri shell, 80MB)
       → 3s 冷启动, 四槽位全绿 (claude/cursor/codex/openclaw)
       → 左栏看到 12 个自建 agent, 4 个默认, 按 folder 分组:
          📁 笔笔省  (2 agent: UI专家 / 架构师)
          📁 qrclaw  (3 agent: Go 专家 / Next.js 专家 / E2E 编写者)
          📁 写作     (3 agent: 英文润色 / 技术博客 / 投资人材料)
          🏠 默认     (4 agent)

08:02  点"架构师" → 看到 3 个 session:
          📌 Wave 11 规划   (pinned)
          💬 ErgodicAI 独立   (昨天 22 条消息)
          📦 Wave 10 归档    (archived, hidden)

08:05  进入"Wave 11 规划", 输入: "@UI专家 给个图"
       → 系统自动 fork sub-session 给"UI专家"
       → 回注当前 session 一张 Mermaid 架构图 (KaTeX 渲染)

08:30  按空格语音: "新建 session 叫 笔笔省 SSR 性能"
       → 本地 intent parser 识别, 不走 LLM, 50ms 完成
       → 进入新 session, workspace 自动绑"笔笔省 repo"
       → Git branch 显示 main, "在新 branch 工作" 按钮
       → 点击, host worktree 到 /tmp/qrclaw-worktrees/ssr-perf-xxx
       → agent 开始工作, 运行 bash 命令触发 tool approval 弹窗
       → 用户 approve, bash 在 worktree 内执行
       → file_edit 实时 monaco diff, 用户逐文件 "accept / revise"

11:00  切到"英文润色" agent, 打开 3 个 session 并行润色三封投资人邮件

14:00  Parallel fan-out: "让 claude 和 codex 同时看这段代码"
       → 双栏结果对比, 右键"合并两者观点" → 第三轮合成
       → 结果 export Markdown 给团队

17:00  "分享本 session 只读给合伙人" → 生成 24h 过期 URL
       → 合伙人浏览器访问, 看到全部 message, 无法看 instructions

23:00  Settings → 一键备份到 iCloud
       → 8 小时后在家里 mac 安装 QRClaw → 切 cloud 模式 → 所有 12 agent / 47 session 同步可见
```

### 4.2 技术画像

- **进程数 (local mode)**: 2 (Tauri shell + Go host), 或 3 (cloud mode 追加 gateway proxy)
- **冷启动**: ≤ 3s 到首屏可交互, ≤ 5s 到四槽位全绿
- **单 session 并发**: 5 session × 10 runs × 100 tokens/s 无抖动
- **数据规模**: 单 owner 年度 ~ 100 agent / 1000 session / 100k messages / 10GB attachments 无性能退化
- **合规**: C2 cloud 模式下 Gateway 源码通过静态扫无明文泄漏; local 模式下 sqlite perm 0600 + FileVault 推荐
- **可扩展**: 新增 runtime_type (e.g. gemini) 只需 host detector + UI 图标, 无 schema migration
- **可演进**: 保留 `host_type / deploy_mode / visibility` 三个字段, 支持"未来给 3 个人团队卖 cloud 版"无重写

### 4.3 能力矩阵对比

| 能力 | Wave 9 | Wave 10 最终 | Multica 参考 |
|---|:---:|:---:|:---:|
| 4 runtime 自动检测 | ❌ | ✅ | ✅ |
| 一 agent 多 session | ❌ | ✅ | ✅ |
| 文件/图片/diff 渲染 | ⚠️ | ✅ | ⚠️ |
| 语音 I/O | ❌ | ✅ | ❌ |
| Agent 协作 / workflow | ❌ | ✅ | ❌ |
| Workspace / Git 集成 | ❌ | ✅ | ⚠️ |
| 加密双模 (cloud/local) | 仅 cloud | ✅ | 仅 local |
| Notion 集成 | ❌ | ✅ | ❌ |
| Share snapshot | ❌ | ✅ | ❌ |
| E2E 真 runtime + 语义断言 | fake | 30+5 | ⚠️ |

---

## 5. 风险与应对

| 风险 | 应对 |
|---|---|
| assistant-ui 0.12.x API 变动 | 封 QRClaw runtime adapter 隔离, 版本锁 patch |
| SQLite / Postgres schema drift | Drizzle DSL 统一源, CI 双模 migration dry-run |
| C2-local 威胁模型用户误解 | 文档 + 安装向导弹窗明示"FileVault 未开不保证保密" |
| Go host 跨平台差异 (Win) | Wave 10 只保证 Mac + Linux, Windows 标 beta |
| Agent 协作 fork 失控 / token 烧 | 并行 fan-out 默认 max=3, workflow DSL 强制 step budget |
| 语音 privacy | 本地 Whisper 默认; 云 TTS 需用户提供自己的 key |
| 35 E2E 真 runtime 成本 | CI matrix 按 sprint 分组, 只跑改动相关; nightly 全量 |
| Wave 5-9 visitor 分支冷冻漂移 | Path C route group 物理隔离, CI 冒烟保证不 regress |

---

## 6. 结论

Wave 10 在 3 个月内交付的不是 MVP 而是 **1.0 完整版**:

- **10 维能力全部一次到位**: runtime/agent/session/chat/voice/collab/workspace/tools/storage/quality
- **9 Sprint 依赖清晰**: 前 sprint 不被后 sprint 重写, 每 sprint 结束都可发布
- **35 E2E 真 runtime + 语义断言**: 消灭 Wave 9 "fake + DOM visibility" 的测试造假
- **双模架构从第一天嵌入**: cloud/local 不是"后期分叉"而是"S1 就抽象好"
- **Multica 范式 + QRClaw 资产双保留**: 采纳 Multica 的心智 (runtime 四槽位、session 多开), 保留 QRClaw 的资产 (三层模型、加密栈、Host WS)
- **为 B2B / Notion / 语音 / 协作 留足钩子**: M3+ 扩展不需要打翻 Wave 10

执行建议: S1-S2 串行 (地基不能并行), S3/S4/S6 可两人并行, S5/S7/S8 再并行, S9 收口串行。单人 9 月, 两人 4.5 月, 三人 3.5 月。

— End —
