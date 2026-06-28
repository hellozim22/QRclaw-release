# Wave 10 E2E 测试用例清单（R1 · 诚实可用性版）

> 产出人：R1（架构师）
> 日期：2026-04-28
> 输入：`docs/wave10/SUMMARY.md`、`tests/e2e/OWNER_AGENT_CHAT_E2E_CASES.md`、`requirements/owner-agent-chat-test-plan.md §10`、`CLAUDE.md`（四条铁律 / Step 4）
> 性质：**用例设计清单**，不含实现代码、不跑 build。

---

## 1. 测试目标与与 Wave 9 的对比

### 1.1 Wave 9 的诚实回顾（失败面）

| 项 | Wave 9 happy-path | 被用户反馈点名的问题 |
|---|---|---|
| 第 4 点 | 用 `tests/fakes/openclaw-fake.sh` 当 provider | 不是真 CLI，等于"测我自己写的 stub" |
| 第 5 点 | 只断言 DOM `element.isVisible()` 或 "bubble text length > 0" | 不断言 reply 语义，测试对错误 reply 麻木 |
| 第 9 点 | 流式/文件/图片/session 切换整体缺覆盖，却自称 "E2E 通过" | 覆盖面造假 |

### 1.2 Wave 10 E2E 设计铁律（基于用户反馈重写）

1. **真 runtime**：所有 P0/P1 必须在宿主机上跑真实 openclaw / claude / cursor / codex 二进制；fake provider 只允许在 P2 的"网络失联 / 崩溃"注入场景出现，且用例标题必须显式标注 `[fault-injection]`。
2. **语义断言**：prompt 必须是**确定性可验证**（"回答数字 42"、"用 JSON 输出 {"ok":true}"、"复述这段文本"），断言必须检查 reply 文本内容、格式、或特定 token，而不是 "element visible / length > 0"。
3. **全功能覆盖**：流式、Markdown、文件、图片、session 切换、instructions 注入、reload replay 各自独立用例，不得打包进 "happy path" 一个用例糊过去。
4. **Verification Step 4 挂钩**：每个用例都显式声明覆盖的 CLAUDE.md 铁律 C1/C2/C4/C5，并在"验证点"一节给出 Gateway 日志 / DB 密文 / Edge Function 解密边界的独立断言。

### 1.3 诚实性声明模板

本清单每个用例都标注：

```
诚实性：真 runtime | fake provider[仅 fault-injection]
断言层级：语义 ✅ / DOM-only ❌
Wave 9 状态：未覆盖 | happy-path 覆盖但无语义断言 | 有实现但用 fake
```

**Wave 10 清单中 P0 / P1 全部为"真 runtime + 语义断言"。**

---

## 2. 覆盖矩阵

| 层级 | 用例数 | 目标 | fake provider? |
|---|---|---|---|
| **P0 核心可用性** | 12 | dashboard 打开 5 秒内可聊，reply 语义正确 | 全部否 |
| **P1 完整体验** | 12 | 流式 / Markdown / 文件 / 图片 / 多 session / instructions / reload replay | 全部否 |
| **P2 边界与故障** | 6 | 网络失联 / 超长消息 / 并发 / runtime 崩溃 | 仅 P2-04 / P2-05 允许 fault-injection |

总计 **30** 用例。

---

## 3. P0 核心可用性（真 runtime + 语义断言）

> 全部 P0 用例的通用前置：宿主机 PATH 中存在 `claude`、`cursor-agent`、`codex`、`openclaw` 四个真 CLI 二进制；本地 Host 守护进程已启动；Owner 已通过邮箱登录 Web。

### P0-01 本机 CLI auto-detect 在 5 秒内亮起 4 个 provider

- **覆盖**：Sprint 1 auto-detect、Onboarding 愿景
- **铁律**：C1（不推理，只探测）
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. Owner 以 cold start 打开 `/chat`（清 cookie，dashboard 首屏）。
  2. 等待左栏 Chat 分类展开。
  3. 读取 4 个默认 agent 的在线状态。
- **输入数据**：无 prompt；仅观察初始状态。
- **语义断言**：
  - 左栏 `Chat(N)` 的 `N >= 4`。
  - 列表文本必须同时包含字符串 `Claude Code`、`Cursor Agent`、`Codex`、`OpenClaw`（顺序不强制）。
  - 每个 agent 旁边显式渲染 `✅ 在线` 或等价字符串（不是 "已加载" / "初始化中"）。
  - 从 navigate 到状态稳定耗时 ≤ 5000 ms（performance.now 测量）。
- **铁律映射**：C1（Gateway 只收探测上报，不调用 LLM）。

### P0-02 默认 agent 在 Chat 左栏直接可点开，无需 "创建第一个 agent" 向导

- **覆盖**：Onboarding 愿景 "不要空列表" 要求
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：happy path 用假 agent 绕过
- **步骤**：
  1. Owner 点击左栏 `Claude Code`。
  2. 右侧 Chat 视图切换。
  3. 检查是否出现 "创建 agent" 引导。
- **输入数据**：点击事件。
- **语义断言**：
  - 右侧视图 `header` 文本包含 `Claude Code`。
  - DOM 中 **不存在** 文本 "创建你的第一个 Agent" / "生成 Host Token" / "下载 QRClaw Host"。
  - Input 框 `disabled === false` 且 placeholder 为 "输入消息..."（非 "请先注册 host"）。
- **铁律映射**：C1。

### P0-03 对 Claude Code 发 "回答数字 42"，reply 必须包含 "42"

- **覆盖**：Sprint 2 SSE 核心链路
- **铁律**：C1、C2、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：有用例但断言 `length > 0`
- **步骤**：
  1. Owner 打开 `Claude Code` 的 chat。
  2. 在输入框输入 prompt：`请只回复数字 42，不要加任何其他字符。`
  3. 发送，等待 `completed` 事件。
- **输入数据**：确定性 prompt（verbatim 上一行）。
- **语义断言**：
  - 最终 message 节点 `textContent.trim()` 匹配正则 `/^42\.?$/`。
  - 在收到 `completed` 前，UI 已经至少触发过 1 次 partial text 渲染（流式至少 2 帧以上）。
  - 刷新后 messages 列表仍有这条 reply，内容不变。
- **铁律映射**：C1（gateway log 不含 "42" 原文）、C2（DB `content_encrypted` 不含 "42" 明文）、C5（reload 可回放）。

### P0-04 对 OpenClaw 发 JSON 结构化 prompt，reply 必须是合法 JSON 且 `ok=true`

- **覆盖**：真 CLI 的结构化输出能力
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 切到 `OpenClaw` agent。
  2. 输入 prompt：`请只用 JSON 回复：{"ok": true, "echo": "ping"}，不要额外解释。`
  3. 等待完成。
- **输入数据**：上述 prompt；不使用外部工具 / 文件。
- **语义断言**：
  - `JSON.parse(replyText)` 不抛异常。
  - 解析后 `obj.ok === true` 且 `obj.echo === "ping"`。
  - reply 不含 Markdown 代码块围栏（`\`\`\`json`）—— OpenClaw prompt 要求 "只用 JSON"。
- **铁律映射**：C1。

### P0-05 Cursor Agent 发 "用一句中文回答：'今天星期几' 是哪个语言的问句"，reply 必须包含 "中文" 或 "汉语"

- **覆盖**：跨 provider 能用
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 切到 `Cursor Agent`。
  2. 发送上述 prompt。
  3. 等待完成。
- **语义断言**：
  - reply 文本匹配 `/中文|汉语/`。
  - reply 长度 `> 4` 个字符且 `< 300`（防止 runaway）。
- **铁律映射**：C1。

### P0-06 Codex 发 "给我一个返回 2 的 Python 单行表达式"，reply 必须含 `1+1` 或 `2`

- **覆盖**：跨 provider code task
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 切到 `Codex`。
  2. prompt：`给我一个返回 2 的 Python 单行表达式，仅一行，不加解释。`
- **语义断言**：
  - reply 去空白后匹配 `/^(1\s*\+\s*1|2)$/` 或能 `eval` 出 2（在测试 runner 沙箱 eval）。
- **铁律映射**：C1。

### P0-07 发消息过程中流式 token 至少出现 3 次增量渲染

- **覆盖**：Sprint 2 OpenAI SSE 流式
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：有实现但未断言流式
- **步骤**：
  1. 切到 `Claude Code`。
  2. prompt：`从 1 数到 10，每个数字一行。`
  3. 订阅 DOM mutationObserver 监听目标 bubble。
- **语义断言**：
  - mutationObserver 在 final `completed` 前捕获到 ≥ 3 次 `characterData` 或 `childList` 变更。
  - 最终 reply 按行拆分后 ≥ 10 行且每行可解析为 `1`..`10` 中的一个数字（顺序一致或至少包含全集）。
- **铁律映射**：C1（SSE 转发）。

### P0-08 Markdown 粗体 / 代码块正确渲染（不是纯文本）

- **覆盖**：Sprint 2 LobeChat Markdown renderer
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 对 `OpenClaw` 发 prompt：`请输出：**bold word** 以及代码块 \`\`\`js\nconsole.log(1)\n\`\`\``。
  2. 等待完成。
- **语义断言**：
  - reply DOM 中存在 `<strong>` 元素且 `textContent === "bold word"`。
  - 存在 `<pre><code>` 元素且文本 `console.log(1)`；不得整段以纯文本 `**bold word**` 呈现。
- **铁律映射**：C1（渲染仅前端，不改写内容）。

### P0-09 刷新后历史消息完整回放（真 CLI 的 reply 跨 session 稳定）

- **覆盖**：Sprint 2 decrypted-messages Edge Function
- **铁律**：C2、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：有用例但用 fake reply 比对
- **步骤**：
  1. 对 `Claude Code` 发 `回复只含字符 A`。
  2. 等 reply 完成，断言 reply === "A"。
  3. 浏览器 reload。
  4. 重新读取 messages。
- **语义断言**：
  - reload 后 messages 数组最后一条 `content === "A"`（与 reload 前完全相等）。
  - reload 过程中 DB `messages.content` 列的该行二进制值与 reload 前一致（密文稳定，不被二次加密）。
- **铁律映射**：C2（密文落库）、C5（Edge Function 授权解密回放）。

### P0-10 连续两轮对话保持同一 conversation（第二轮 reply 引用第一轮内容）

- **覆盖**：Sprint 1 conversation SSoT
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 对 `Claude Code` 发：`请记住数字 77，只回答"收到"。`
  2. 等 reply。
  3. 再发：`刚才我让你记住的数字是多少？只回答数字。`
- **语义断言**：
  - 第二轮 reply `textContent.trim() === "77"`。
  - 两轮消息共享同一 `conversation_id`（通过 network 请求 body 或 URL path 检查）。
- **铁律映射**：C1（上下文由 provider 自己维护，Gateway 只转发）、C5。

### P0-11 Agent 离线时 UI 明确标红，发送按钮不虚假"发送成功"

- **覆盖**：Sprint 1 健康探针
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 通过 `pkill -STOP` 暂停 openclaw 真 CLI。
  2. 观察 UI `OpenClaw` 状态 ≤ 5 秒内变为 `离线`。
  3. 尝试在 OpenClaw chat 输入并发送。
- **语义断言**：
  - 左栏 OpenClaw 旁边文本包含 `离线` 或 `offline`。
  - 点击发送后，消息气泡状态为 `待处理`/`pending`，**不**出现 `执行中`/`Agent 正在回复`。
  - 没有任何 Gateway SSE `message` 事件被消费（network tab 断言）。
- **铁律映射**：C1（离线不代答）。
- **收尾**：`pkill -CONT` 恢复。

### P0-12 首屏渲染 P95 ≤ 1500ms，4 个默认 agent JSON 预取不重复 fetch

- **覆盖**：Onboarding 愿景 "登录后第一眼就 work"
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 记录 `navigate → /chat` 的 `paintTime`。
  2. 截取 network 请求日志。
- **语义断言**：
  - 首次可交互（发送框 enabled 且 agent 列表渲染完成）时间 P95 ≤ 1500 ms。
  - `/api/owner/agents` 请求在 load 期间只出现 1 次。
- **铁律映射**：C1。

---

## 4. P1 完整体验（真 runtime + 语义断言）

### P1-01 上传 .txt 文件，agent 能 echo 文件第一行内容

- **覆盖**：Sprint 3 文件上传
- **铁律**：C1、C2
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 在本地生成 `sample.txt`，内容 `hello-wave10\nline2`。
  2. 在 Chat 输入框附加该文件。
  3. prompt：`读取附带文件的第一行并原样返回。`
- **语义断言**：
  - reply `textContent.trim() === "hello-wave10"`。
  - 网络请求里 file 通过 multipart，DB 的 attachments 列不含明文（有 `cipher_blob_ref`）。
- **铁律映射**：C1、C2。

### P1-02 上传 PNG 截图，agent 能识别并回答图里的文字

- **覆盖**：Sprint 3 图片上传
- **铁律**：C1、C2
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 准备 `ocr-test.png`（一张写 "WAVE10" 的白底黑字图片）。
  2. 上传到 `Claude Code` chat。
  3. prompt：`图中有一个英文单词，只回复该单词大写形式。`
- **语义断言**：
  - reply `textContent.trim().toUpperCase() === "WAVE10"`。
- **铁律映射**：C1、C2。

### P1-03 一个会话里切换到另一个 agent 后，上下文不串

- **覆盖**：Sprint 2 session 隔离
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 在 `Claude Code` 发 `记住数字 111`。
  2. 切到 `Codex`。
  3. 发 `我之前让你记住的数字是多少？只回答数字或 "不知道"。`
- **语义断言**：
  - Codex reply 不是 `111`（应为 `不知道` 或类似 "我没有上下文" 等表述；不得命中 `/111/`）。
  - 切回 `Claude Code` 再问同问题，reply 命中 `/111/`。
- **铁律映射**：C1、C5。

### P1-04 Instructions 注入：给 agent 设置 "永远用中文回答"，英文 prompt 仍收到中文 reply

- **覆盖**：Sprint 3 agent instructions
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 在 `Cursor Agent` 设置里填 instructions：`Always reply in Simplified Chinese.`
  2. 发 prompt：`What is the capital of France? One word answer.`
- **语义断言**：
  - reply 包含中文字符（`/[\u4e00-\u9fa5]/` 命中）。
  - reply 内容包含 `巴黎`。
  - network 请求 body 里 `system` / `instructions` 字段非空且含上述英文串。
- **铁律映射**：C1。

### P1-05 多 agent 并发发消息，reply 不串线

- **覆盖**：Sprint 1/2 并发
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 同时对 4 个 agent 依次发 prompt `请回复你自己的产品名（Claude / Cursor / Codex / OpenClaw）之一`。
  2. 等所有 reply 完成。
- **语义断言**：
  - Claude Code 的 reply 含 `Claude`；Cursor Agent 的 reply 含 `Cursor`；Codex 的 reply 含 `Codex`；OpenClaw 的 reply 含 `OpenClaw`。
  - reply 不交叉（例如 Codex 的 bubble 不出现 `Cursor` 字样）。
- **铁律映射**：C1。

### P1-06 流式回复中途 reload，fragments 能从断点继续，不重复

- **覆盖**：§10.1b Reload During Stream
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：有 OAC-E2E-07 但用 fake reply
- **步骤**：
  1. 对 `Claude Code` 发 `写一首 8 行的唐诗`。
  2. 在第 3 行渲染出现时 reload 页面。
- **语义断言**：
  - reload 后最终 reply 行数 ≥ 8。
  - 同一行不出现超过 1 次（文本去重后 set.size === 行数）。
  - `run_events` 表按 `run_id` 分组后 final message 只有 1 条。
- **铁律映射**：C1、C5。

### P1-07 重置上下文后，旧历史仍可翻回并逐字匹配

- **覆盖**：§10.1c Reset Context
- **铁律**：C2、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：有 OAC-E2E-09 但未做逐字比对
- **步骤**：
  1. 对 `OpenClaw` 发两轮 prompt：`A123`、`B456`。
  2. 点击 reset context 并确认。
  3. 滚动历史。
- **语义断言**：
  - 历史区仍含两条 Owner 消息 `A123`、`B456` 和对应 reply。
  - reset 后再问 `我刚才发的第一条消息是什么？` reply 不含 `A123`（provider session 已清）。
- **铁律映射**：C2、C5。

### P1-08 长 prompt（~8 KB）能发出并完整到达 provider

- **覆盖**：Sprint 3 大消息
- **铁律**：C1、C2
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 构造 prompt：`请忽略以下所有文字，只回答"OK"：` + 7800 字节随机 ASCII。
  2. 发送到 `Claude Code`。
- **语义断言**：
  - reply `textContent.trim() === "OK"`。
  - 网络 payload 大小 ≥ 8000 bytes 但 ≤ 12000 bytes（验证未被截断）。
- **铁律映射**：C1、C2。

### P1-09 图文混合：文件 + 图片 + 文本三合一发送

- **覆盖**：Sprint 3 多模态
- **铁律**：C1、C2
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 附加 `sample.txt`（"foo"）和 `bar.png`（写 "BAR"）。
  2. prompt：`请回复 <txt的内容>-<图里的英文>，全部大写。`
- **语义断言**：
  - reply `textContent.trim() === "FOO-BAR"`。
- **铁律映射**：C1、C2。

### P1-10 Session 列表按最近活动排序且 unread 徽标正确

- **覆盖**：LobeChat session UI 抽取
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 向 `Codex` 发一条。
  2. 切到 `OpenClaw`，向 OpenClaw 发一条。
  3. 切回 `Claude Code` 并让 `Codex` 主动 push（通过写入 run event）。
- **语义断言**：
  - 左栏 agent 顺序为 `Codex` > `OpenClaw` > 其它（最新活动在上）。
  - `Codex` 行出现红点 / unread 徽标，数值 === 1。
  - 点击后徽标消失。
- **铁律映射**：C1、C5。

### P1-11 Instructions 持久化：刷新后 agent 仍按旧 instructions 行为

- **覆盖**：Sprint 3
- **铁律**：C2、C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 延用 P1-04 的 agent。
  2. 刷新浏览器。
  3. 再发英文 prompt。
- **语义断言**：
  - reply 仍是中文（同 P1-04 断言）。
  - agent 配置 DB 行 `instructions_encrypted` 非空且非 null。
- **铁律映射**：C2、C5。

### P1-12 reload 期间正在跑的 run 不会被误终止

- **覆盖**：Sprint 2 run 生命周期
- **铁律**：C5
- **诚实性**：真 runtime / 语义 ✅ / Wave 9：未覆盖
- **步骤**：
  1. 发 `请用 30 秒慢慢输出从 1 到 5 的数字`（强制慢输出 prompt）。
  2. 在第 2 个数字出现时 reload。
  3. 等完成。
- **语义断言**：
  - 最终 reply 含全部 5 个数字 `1 2 3 4 5`。
  - `run_status` 终态为 `completed`，不是 `cancelled` / `failed`。
- **铁律映射**：C5。

---

## 5. P2 边界与故障（仅此层允许 fault-injection）

### P2-01 网络断开 3 秒：UI 显示 "连接中断" 且自动重连后流继续

- **覆盖**：Sprint 3 连接韧性
- **铁律**：C1、C5
- **诚实性**：真 runtime + 网络 chaos（`tc qdisc` 或 playwright 模拟 offline）/ 语义 ✅
- **步骤**：
  1. 开始长回复 prompt。
  2. 3 秒后 `page.context.setOffline(true)` 持续 3 秒。
  3. 恢复 online。
- **语义断言**：
  - 离线期间 UI 顶部出现 "连接中断" banner。
  - 恢复后 banner 消失，reply 在 30 秒内完成。
  - 最终 reply 的换行数与非故障 baseline 相同（内容连续）。
- **铁律映射**：C1、C5。

### P2-02 Runtime 崩溃（真 CLI `pkill -9`）：UI 明确报错且不伪装完成

- **覆盖**：Sprint 3 错误语义
- **铁律**：C1
- **诚实性**：真 runtime + 进程 kill / 语义 ✅
- **步骤**：
  1. 对 `OpenClaw` 发 prompt。
  2. 在 run 进行中对 openclaw 进程执行 `pkill -9`。
- **语义断言**：
  - 最终 bubble 状态文本包含 `失败` 或 `runtime 异常`。
  - `run_status === "failed"`，不是 `completed`。
  - DOM 中不出现 `✅ 完成` 字样。
- **铁律映射**：C1。

### P2-03 超长 prompt 64 KB：UI 给出明确长度上限错误而不是截断

- **覆盖**：输入限流
- **铁律**：C1
- **诚实性**：真 runtime / 语义 ✅
- **步骤**：
  1. 粘贴 64 KB 文本。
  2. 点击发送。
- **语义断言**：
  - 要么显示 `消息过长，最大 32 KB` 类提示并阻止发送，要么发送成功且 network payload 完整无截断。
  - 不允许"悄悄截断后发送成功"状态（通过对比发送前 hash 与 DB 存的 ciphertext 解密后 hash 判断）。
- **铁律映射**：C1。

### P2-04 [fault-injection] Gateway SSE 路由刻意返回 500，UI 明确重试

- **覆盖**：Sprint 2 错误语义
- **铁律**：C1
- **诚实性**：fake provider 不涉及，但 fault injection 由测试夹具在 Gateway 前加反代注入 500 / 语义 ✅
- **步骤**：
  1. 开启注入：前 2 个 SSE 请求返回 500，第 3 个通过。
  2. 发 prompt。
- **语义断言**：
  - 最终 reply 正常完成且内容正确（与无故障 baseline 一致）。
  - network tab 有 2 次 500 + 1 次 200。
  - UI 没有出现 "未定义错误" / "undefined"。
- **铁律映射**：C1。

### P2-05 [fault-injection] Edge Function `decrypted-messages` 返回 403，UI 显式提示 "权限不足"

- **覆盖**：§10.3 Security
- **铁律**：C2
- **诚实性**：fault injection / 语义 ✅
- **步骤**：
  1. 注入 Owner JWT 失效。
  2. reload 历史页。
- **语义断言**：
  - 页面显示 `请重新登录` 或 `权限不足`，不显示空白列表。
  - 不出现任何历史消息明文片段。
- **铁律映射**：C2。

### P2-06 并发 10 条消息打到同一 agent，顺序与落库顺序一致

- **覆盖**：Sprint 1/2 并发
- **铁律**：C1、C5
- **诚实性**：真 runtime / 语义 ✅
- **步骤**：
  1. 用 playwright 在 2 秒内对 `OpenClaw` 连发 10 条，内容分别 `msg-01`..`msg-10`。
  2. 等全部 reply。
- **语义断言**：
  - DOM 里 10 条 owner 气泡的顺序从上到下等于 `msg-01..msg-10`。
  - DB `messages` 表按 `created_at asc` 排序后 owner 消息也同序。
  - agent reply 与 owner 消息的 `reply_to` 关系 1:1，没有串线。
- **铁律映射**：C1、C5。

---

## 6. CLAUDE.md 铁律交叉验证矩阵

| 用例 | C1 | C2 | C4 | C5 |
|---|---|---|---|---|
| P0-01 | ✅ | | | |
| P0-02 | ✅ | | | |
| P0-03 | ✅ | ✅ | | ✅ |
| P0-04 | ✅ | | | |
| P0-05 | ✅ | | | |
| P0-06 | ✅ | | | |
| P0-07 | ✅ | | | |
| P0-08 | ✅ | | | |
| P0-09 | | ✅ | | ✅ |
| P0-10 | ✅ | | | ✅ |
| P0-11 | ✅ | | | |
| P0-12 | ✅ | | | |
| P1-01 | ✅ | ✅ | | |
| P1-02 | ✅ | ✅ | | |
| P1-03 | ✅ | | | ✅ |
| P1-04 | ✅ | | | |
| P1-05 | ✅ | | | ✅ |
| P1-06 | ✅ | | | ✅ |
| P1-07 | | ✅ | | ✅ |
| P1-08 | ✅ | ✅ | | |
| P1-09 | ✅ | ✅ | | |
| P1-10 | ✅ | | | ✅ |
| P1-11 | | ✅ | | ✅ |
| P1-12 | | | | ✅ |
| P2-01 | ✅ | | | ✅ |
| P2-02 | ✅ | | | |
| P2-03 | ✅ | | | |
| P2-04 | ✅ | | | |
| P2-05 | | ✅ | | |
| P2-06 | ✅ | | | ✅ |

> **C4（移动端零注册）** 在 Wave 10 owner 面测试不直接覆盖——维持既有 Visitor 链路用例（OAC-E2E-17/18）作为回归。

---

## 7. 诚实性总览

| 指标 | 数值 |
|---|---|
| 用例总数 | 30 |
| 用真 CLI 的 | 30 |
| 允许 fake provider 的 | 0 |
| 允许 fault injection 的 | 2（P2-04、P2-05，明确标注 `[fault-injection]`） |
| 语义断言的 | 30 |
| 仅 DOM-only 断言的 | 0 |

**签字承诺**：Wave 10 验收报告中，任何自称 "E2E 通过" 的项都必须来自本清单且满足"真 runtime + 语义断言"；否则该项应标 `not run` 或 `fake-binary` 并单独列出。

---

## 8. 交付依赖

| 依赖 | 负责方 | 交付节点 |
|---|---|---|
| 宿主机 4 个真 CLI 可执行 | DevOps | Sprint 1 D3 |
| 测试 Owner 账号 + 默认 agent auto-provision | Backend | Sprint 1 D5 |
| Playwright + 真 CLI 运行器（不 mock） | QA | Sprint 2 D3 |
| DB / Gateway log 断言工具（查密文、查无明文） | Backend | Sprint 2 D5 |
| Fault injection 夹具（反代 + JWT mock） | QA | Sprint 3 D2 |

---

## 9. 开放问题（留给 Sprint 1 kickoff）

1. **confidence**：流式 P0-07 断言 "≥ 3 次增量"，真 CLI 偶尔会一次性返回——是否放宽到 "≥ 2 次" 并额外检查总耗时 ≥ 500 ms？
2. **OCR 资产**：P1-02 / P1-09 的图片如何在 repo 里存放？建议用 `tests/fixtures/images/*.png` 且 MIT 许可。
3. **真 CLI 成本**：P2-06 并发 10 条 × 4 个 agent ≈ 40 条真推理，是否放到 nightly 而不是每 PR？
4. **Cursor Agent CLI 是否稳定支持非交互 stdin**：P0-05 需要与 Cursor 团队确认 `cursor-agent -m "..."` 模式返回 deterministic。

> 以上问题不阻塞本清单定稿，但建议 Sprint 1 D1 内解决以免阻塞 Sprint 2 E2E 编写。
