# Wave 10 R2 C6：E2E 测试用例最终版（真 CLI + 语义断言）

> 输入：`r1-wave10-test-cases.md` (claude 25+ 用例)、`r2-ux-design-full.md` (22 UX 场景)
> 用户要求：真 CLI / 语义断言 / 覆盖全功能

## 测试原则（从 Wave 9 教训）

| 原则 | 对比 Wave 9 |
|---|---|
| **禁用 fake binary** | Wave 9 happy-path 用 fake openclaw → Wave 10 用真 `claude` CLI（最易测） |
| **语义断言** | Wave 9 "element visible" → Wave 10 "reply 包含 42" |
| **可复现** | prompt 固定 "只输出数字 42"，reply 必然包含 "42" |
| **超时合理** | 首 token < 10s，完整 reply < 60s |
| **铁律映射** | 每用例标 C1/C2/C4/C5 |

## 铁律覆盖矩阵

| 铁律 | 用例数 |
|---|---|
| C1 中立中继 | 8 (gateway 不解读语义) |
| C2 加密存储 | 12 (DB 密文 / 日志无明文 / reload 走 Edge Function) |
| C4 零注册 | 3 (visitor 冷冻分支回归) |
| C5 可回放 | 10 (reload / session 切换 / 断线重连) |

---

## P0 核心可用性（18 用例）

### OAC-W10-E2E-01 runtime auto-detect on first open
- **用户步骤**：1) 登录 2) 等 3s 3) 查看左侧 runtime 列表
- **断言**：`openclaw / claude / cursor / codex` 4 个 runtime 状态为 online
- **真数据**：本机真实存在 4 个 CLI
- **铁律**：C4

### OAC-W10-E2E-02 default agent auto-provision
- 步骤：首次登录后查看 Agents 列表
- 断言：至少 4 个默认 agent（每 runtime 一个），名字包含 runtime 名（如 "Claude Assistant"）
- 铁律：C4

### OAC-W10-E2E-03 default agent click → session created
- 步骤：点默认 Claude Agent → 跳 chat → 新 session 自动创建
- 断言：URL 包含 session_id；左栏 session 列表出现新项 title 为"新会话"
- 铁律：C5

### OAC-W10-E2E-04 send message real claude reply semantic
- 步骤：在 claude agent session 发 "只输出数字 42，不要其他任何内容"
- 断言：reply 包含 "42"；DB `owner_agent_messages` 多 1 条 sender_type=agent
- 真 CLI：`claude` binary（不是 fake）
- 铁律：C1, C2

### OAC-W10-E2E-05 streaming output token by token
- 步骤：发 "请分 5 段回答，用 Markdown 标题格式"
- 断言：首个 DOM update 延迟 < 10s；流式过程中 innerText 持续增长（采样 5 次内容不同）
- 铁律：C1

### OAC-W10-E2E-06 markdown code block rendering
- prompt："用 python 写 hello world 代码块"
- 断言：页面出现 `<code class="language-python">`；"Copy" 按钮存在
- 铁律：C1

### OAC-W10-E2E-07 markdown table
- prompt："列出 Python Java Go 3 种语言优缺点，用 Markdown 表格"
- 断言：DOM 出现 `<table>`；至少 3 行数据
- 铁律：C1

### OAC-W10-E2E-08 send button disabled when empty
- 步骤：input 清空 → 看 Send 按钮
- 断言：`disabled` 属性存在
- 铁律：（UI）

### OAC-W10-E2E-09 reload session replay (encrypted history)
- 步骤：发完消息 reload → 回到同 session
- 断言：prompt + reply 都可见；网络请求 `/api/owner/agents/:id/messages` status=200
- 断言 DB：`content_encrypted` 非空，原文不在 response body 的 SSL 之外（手动用 mitmproxy 验证）
- 铁律：C2, C5

### OAC-W10-E2E-10 multiple sessions isolated
- 步骤：同 claude agent 建 2 个 session，各发不同消息
- 断言：session A 的消息不出现在 session B
- 铁律：C5

### OAC-W10-E2E-11 session switch
- 步骤：从 session A 切到 B
- 断言：左栏高亮切换；chat 区内容切换；URL 变化
- 铁律：C5

### OAC-W10-E2E-12 new session button
- 步骤：chat 页点击 "New Session"
- 断言：左栏多 1 项；URL 变化；chat 区为空
- 铁律：C5

### OAC-W10-E2E-13 session rename
- 步骤：右键 session → Rename → 输新名 → Enter
- 断言：左栏显示新名；DB sessions.title 更新
- 铁律：C5

### OAC-W10-E2E-14 session delete
- 步骤：右键 → Delete → 确认
- 断言：左栏该项消失；DB sessions.status = 'deleted' (soft delete)
- 铁律：C2

### OAC-W10-E2E-15 instructions injection works
- 步骤：创建 agent instructions = "永远以「喵喵」结尾"；发消息
- 断言：reply 包含 "喵"
- 铁律：C1

### OAC-W10-E2E-16 stop streaming button
- 步骤：发长文请求 → 流式中点 Stop
- 断言：流式中止；最后一条 reply 标记 "stopped"；后端 `owner_agent_runs.status = 'cancelled'`
- 铁律：C1

### OAC-W10-E2E-17 regenerate reply
- 步骤：reply 出完 → 点 Regenerate
- 断言：新产生一条 reply（内容可能不同）；旧 reply 保留
- 铁律：C1

### OAC-W10-E2E-18 copy message
- 步骤：reply 出完 → 点 Copy
- 断言：clipboard 包含 reply 文本
- 铁律：（UI）

---

## P1 完整体验（15 用例）

### OAC-W10-E2E-19 drag file upload
- 步骤：拖 PDF 到 chat → 发消息
- 断言：attachment 卡片显示文件名；后端 `attachments` 表新增；reply 提到文件内容（如含"42"的 PDF）
- 铁律：C1, C2

### OAC-W10-E2E-20 paste screenshot
- 步骤：cmd+v 图片
- 断言：输入区出现预览缩略图；发送后 reply 理解图片

### OAC-W10-E2E-21 image preview zoom
- 步骤：reply 含图片 → 点图片
- 断言：全屏 overlay 打开；滚轮缩放生效

### OAC-W10-E2E-22 Mermaid diagram
- prompt："用 Mermaid 画流程图"
- 断言：DOM 包含 `<svg class="mermaid">`，不是原始代码块

### OAC-W10-E2E-23 LaTeX math
- prompt："用 LaTeX 写欧拉公式"
- 断言：DOM 含 `<span class="katex">`

### OAC-W10-E2E-24 agent instructions edit
- 步骤：Agents 页编辑 instructions → 保存
- 断言：DB agents.instructions 更新；下次新 session reply 体现新 prompt

### OAC-W10-E2E-25 agent template apply
- 步骤：创建 agent 选模板 "代码审查助手"
- 断言：instructions 预填代码审查相关内容

### OAC-W10-E2E-26 agent delete
- 断言：DB agents.status='deleted'；session list 过滤掉

### OAC-W10-E2E-27 session search
- 步骤：搜索框输关键词
- 断言：只列出 content 匹配的 session

### OAC-W10-E2E-28 session archive
- 断言：archived session 不在主列表，在 "Archived" tab 可见

### OAC-W10-E2E-29 session export markdown
- 步骤：右键 → Export MD
- 断言：下载文件；内容包含所有消息 + agent 名 + 时间戳

### OAC-W10-E2E-30 runtime version shown
- 断言：Runtime 列表每项显示版本号（真实 CLI `--version` 输出）

### OAC-W10-E2E-31 runtime offline → agent unavailable
- 步骤：kill claude 进程 → 等 30s
- 断言：左栏 Claude runtime 标 "offline"；发消息失败 toast "runtime 不可用"

### OAC-W10-E2E-32 runtime recovery
- 步骤：重启 claude → 等 30s
- 断言：自动 online

### OAC-W10-E2E-33 owner agent logout
- 断言：cookie 清空；返回 login 页

---

## P2 边界（10 用例）

### OAC-W10-E2E-34 very long reply (10k tokens)
- 断言：UI 不卡死；scrollable 正常

### OAC-W10-E2E-35 concurrent sessions
- 步骤：2 个 session 同时发消息
- 断言：reply 不串线

### OAC-W10-E2E-36 network interruption mid-stream
- 步骤：kill gateway 进程
- 断言：前端 toast 显示断线；重连后 resume 可见

### OAC-W10-E2E-37 invalid JWT
- 步骤：手动改 cookie → 发消息
- 断言：401 → 自动登出

### OAC-W10-E2E-38 C2 guard: server logs no plaintext
- 步骤：发消息 → 用 `grep` 查 gateway stdout
- 断言：无 prompt 内容 / 无 reply 内容；只有 run_id / seq / bytes
- 铁律：**C2（核心）**

### OAC-W10-E2E-39 C2 guard: DB encrypted at rest
- 步骤：发消息 → 直连 postgres 查
- 断言：`owner_agent_messages.content_encrypted` 非空；`content` 列不存在（或为 null）
- 铁律：**C2（核心）**

### OAC-W10-E2E-40 C2 guard: Last-Event-ID 不触发 DB 解密
- 步骤：SSE 重连时故意带 Last-Event-ID
- 断言：gateway 响应忽略该 header（观察 gateway log）
- 铁律：**C2（护栏）**

### OAC-W10-E2E-41 cross-owner isolation
- 步骤：2 个 owner 账号，owner2 尝试访问 owner1 session URL
- 断言：403
- 铁律：C2

### OAC-W10-E2E-42 visitor QR regression
- 步骤：使用 Wave 1-4 的 visitor QR 流程
- 断言：仍能正常聊（未被 Wave 10 pivot 破坏）
- 铁律：C4, C5

### OAC-W10-E2E-43 runtime binary path env override
- 步骤：设 `QRCLAW_PROVIDER_CLAUDE_PATH=/custom/path`
- 断言：runtime 用自定义 path 启动

---

## 自动化工具链

- **Playwright**：主要工具，真浏览器
- **Real CLIs**：测试机要装真 `claude` / `openclaw` / `cursor-agent` / `codex`
- **Seed owner**：`scripts/seed-e2e-owner.mjs` (Wave 9 已写)
- **DB 直查**：`supabase rest API` + service_role（CI 独立 DB）

## 覆盖度目标

- P0 18/18 PASS（核心不可退让）
- P1 ≥ 13/15 PASS（2 可跳）
- P2 ≥ 6/10 PASS（网络 / 异常类可接受）
- 任何 C2 用例失败 = 阻塞发布

## 验收报告模板

按 Wave 9 模式产出 `docs/wave10-acceptance.md`，每个用例标 ✅ / ❌ / ⏸。
