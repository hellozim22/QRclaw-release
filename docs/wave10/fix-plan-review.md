# Fix Plan 评审

> 评审人：独立架构评审员
> 日期：2026-04-29
> 被评审：`docs/wave10/fix-plan.md`（Wave 10 验收修复方案）
> 交叉验证源码：
> - `web/src/stores/owner-agent-chat-store.ts`
> - `web/src/app/(auth)/login/page.tsx` + `web/src/hooks/useAuth.ts`
> - `gateway/src/services/default-owner-agents.ts`

---

## 总体判断

**有条件通过**。方案在"已列入的 17 条"里根因分析基本准确、改动粒度合理；但**遗漏了原始清单里 4 条 🔴 阻塞项**（#2、#3、#6、#18），其中 #2/#3 是验收人专门标红的**产品层核心痛点**（onboarding 断裂）；**#18（流式输出缺失）的真根因在 host Go 侧非流式接口**，前端完全无辜——追加调查详见本文件末尾新增章节。如果 Lane A/B/C/D 跑完后 #2/#3/#18 仍未解决，验收照样 fail。另外 Lane C #4 行数估计**偏乐观**，Lane B #11 的根因**只抓了一半**。

---

## 逐条评审

### Lane A — 视觉

#### #8 Assistant 去气泡去头像 ✅
- **评审**：通过。已 DONE，补测试合理。
- **无风险**。

#### #10 代码块浅色化
- **根因判断**：✅ 准确。`shellStyle.background = var(--color-black)` 就是元凶。
- **改法评审**：合理，但**漏了一点**：方案第 4 步说换 hljs 主题，但 `MarkdownRenderer.tsx` 和 `app/layout.tsx` 两处 import 路径方案没明确在哪改——这是"改了 A 漏了 B"风险点。建议先 `grep "highlight.js/styles"` 定位所有 import 再改，避免一处换了另一处没换。
- **盲点**：inline `<code>` 背景用 `rgba(255,255,255,.08)` 在浅背景下会变成几乎不可见（白+白半透明）。方案第 5 条 "注意" 已经预警了，**但没把它列入本条 #10 的行数**（还是 ~20 行），应同步到 MarkdownRenderer。
- **建议**：行数上调到 **~25 行**，在任务描述里明确"包含 inline code 背景色联动改动"。

#### #13 去白圈绿点
- **根因**：✅ 准确。
- **改法**：合理。给 `StatusDot` 加 `style` prop 是最小改动。
- **风险**：给 `StatusDot` 加 `style` prop 后要 grep 所有 `<StatusDot ... />` 调用看是否有已经传 `style`、避免 prop 合并 override 顺序冲突。~1 分钟的 grep 即可覆盖。**低风险**。

#### #16 去 "Runtime 4/4 online"
- **根因**：✅ 准确。
- **改法**：合理。"最小删除" vs "换成小绿点" 二选一，推荐方案清晰。
- **风险**：方案提到 `chat-page.test.tsx` 若断言此字符串需同步改——应该把这条加进 checklist，否则 CI 会红。

#### #17（视觉子项）Agent 默认头像
- **根因**：✅ 准确。
- **改法**：4 行 DEFAULT_AGENT_CONFIGS 改动——**过于乐观**。
  - 已验证 `gateway/src/services/default-owner-agents.ts:60-91` 确实只填 `avatarUrl: null`，改起来是 4 行。
  - **但是**：现有用户的 DB 里 `agents.avatar_url` 已经是 `null`——`ensureDefaultAgents` 的 "existing" 分支（L170-183）**不会**回填 avatar_url。方案完全没提 backfill。
- **遗漏**：需要补一条 migration（或在 existing 分支里 `updateDefaultOwnerAgentRuntime` 扩展也更新 avatar）。否则现有账号（包括验收人本人的 `zeze-test@qrclaw.test`）永远看不到头像。
- **行数修正**：4 → **~15 行**（含 backfill 逻辑）。

---

### Lane B — 逻辑 Bug

#### #1 登录闪红字
- **根因推断**：❌ **部分错误**。方案猜"Supabase 已经把 session 写进 cookie 但 signIn 返回 error" 的并发竞态——验证源码：
  - `useAuth.ts` signIn 就是纯 `supabase.auth.signInWithPassword` 直通，没其它处理。
  - `login/page.tsx:51-57` 逻辑是：`if (authError) { setError; setLoading(false); return }` —— **没有** `router.push`。
- **真正根因更可能是**：
  1. 密码存在 race condition（`signInWithPassword` 偶发返 `Invalid login credentials` 但 auth state 事件流里另一次尝试成功），或
  2. `router.push('/messages')` 跳走后 **login 组件 unmount 前** 的红字闪现。因为 `error` state 清空靠 `setError('')` 在 submit 开头——如果**用户第二次点 submit**（重试），首次失败的 error 可能还残留在 DOM 上一帧。
  3. 浏览器密码管理器 autofill 触发了**两次** submit（一次表单原生，一次 JS），第一次 session 过期/无效，第二次成功。
- **方案的改法（收到 authError → 主动查 getSession → 有 session 就跳走）能不能治？**：能治"症状"（只要最终有 session 就不显示红字），**但掩盖了真根因**。如果真根因是双重 submit，那更应该在 submit 开头 `if (loading) return`。
- **风险**：方案改法本身不会引入新 bug，但**如果真根因是双重 submit，红字会换个位置复现**（比如切页面前闪一下）。
- **建议**：
  1. 方案保留（作为兜底），**但**要求实施前先让验收人抓一次 HAR + console log 确认是否有 2 次 `signInWithPassword` 请求。
  2. 补一条 `if (loading) return;` 在 `handleSubmit` 开头做 guard（+1 行）。
- **判定**：**有条件通过**，需要先抓实锤。

#### #11 Cursor 消息重复
- **根因推断**：⚠️ **只抓了一半**。方案说的"optimistic + WS 完成 push 未 dedupe" 正确，**但忽略了三处真问题**：
  1. **`selectAgent` 的重放定时器**（store L520-526）：每次选中一个 agent 都会立即拉一次 `listMessages` + 2s/5s/10s 再拉 3 次。`mergeMessages`（L410-413）**只按 `message.id` 去重**。如果一次流程里 optimistic bubble 的 id 是 client UUID `clientId`，而 DB 持久化后的 id 是 gateway 分配的 `message_id`（二者不同），history 重放就会把"已完成的 optimistic" 和 "DB 里的正式 record" 当成两条。——**方案完全没提 `mergeMessages` 的 id-only 去重隐患。**
  2. **WS `owner_agent_run_completed` 的 fallback 匹配**（L760-766）：fallback 按"第一个 streaming 或 running"匹配——并发多 agent 时极容易误中另一条。
  3. **方案里说的 `message_persisted` case 根本不存在**——现有 WS 只处理 `owner_agent_run_event` / `owner_agent_run_completed`（L740-743）。方案写了个 `case 'message_persisted'` 等于要新增 WS 事件类型 + gateway 端推送。**这是隐藏在"前端 25 行"里的一条跨端改动**，方案行数严重低估。
- **改法评审**：方向对（加 `client_id` 去重），**但范围不够**：
  - 必须同时修 `mergeMessages`：让 history 和 current 都按 `(run_id || client_id || id)` 复合键去重。
  - 必须同时修 WS `run_completed` 的 fallback 匹配——限定到匹配 `run_id` 的 bubble，否则会错杀正在跑的另一个 agent 的 bubble。
  - 如果要走 `message_persisted` 新事件，gateway 端是 ~30 行（新增 fanout 事件 + schema + 幂等性保证），不止 5 行。
- **行数修正**：方案写 ~30 行 → **实际 ~80-100 行**（前端 40 + gateway 40 + 测试 20）。
- **判定**：**根因方向对，但范围和行数都被低估了一倍以上**。如果只改方案里列的，Claude/Cursor 重复会缓解但不会根治。

#### #14 OpenClaw session 共享
- **根因**：✅ 准确。`os.Getpid()` 作为 session-id 硬编码是实锤的（memory 里 4/28 已记录）。
- **改法**：合理。接口扩 `RunRequest.AgentID` 最小侵入。
- **风险**：方案提到 "看现有签名，如果已经是 RunRequest 那就零侵入"——**这是前提未验证**。如果 4 个 provider 签名不统一，改动要涉及 `claude/cursor/codex` 三个实现同步调整——**不是 15 行，而是 40-60 行**。
- **建议**：实施前先 `grep "func.*Run.*ctx"` 四个 provider，确认接口一致性，再决定行数。
- **判定**：方向正确，行数存风险。

---

### Lane C — 布局重构

#### #4 左栏合并单列
- **根因**：✅ 用户明确要求，不是 bug 是 spec 违反。
- **改法评审**：
  - 新建 `AgentListRail` ~180 行、`chat/page.tsx` 净 -40 行 = ~220 行——**严重低估**。
  - 实际工作：
    1. 新 `AgentListRail`：头像 + 名称 + 最后消息预览 + 未读数 + 状态点，微信风格——至少 200-250 行（含样式、空态、loading、skeleton）。
    2. `lastMessageByAgent` store selector：新建 + 测试（~50 行）。
    3. `unreadByAgent` 逻辑——**方案完全没提**。微信式列表有未读数是核心视觉，没有就是半成品。这块可以"v1 不做"，但方案没把它作为已知裁剪项标出来。
    4. `chat/page.tsx` 布局重构：不只是删两列加一列，现在的 `sessionsByAgent` / `activeSessionByAgent` state（~130 行）要下沉到 `useAgentSessions` hook——hook 本身 ~80 行。
    5. E2E 选择器迁移：方案提到了，但没列入行数——实际 `tests/e2e/wave10-*.spec.ts` 至少 20-30 处 selector 要改。
  - **真实行数**：**~500-600 行净增**（不是 220）。
- **风险**：**最高**。本 Lane 是所有 lane 里风险最大，但方案没建议分阶段落地。
- **建议**：
  1. 明确 v1 裁剪项：先不做未读数、先不做最后消息预览（留 placeholder "点击开始对话"）、先不做 archived 折叠。
  2. v1 只完成"单列列表 + 点击进入对话"，行数降到 ~250 行可控范围。
  3. v2 迭代预览 + 未读。
- **判定**：方向对，但 220 行估算**打 5 折**，需要分阶段。

#### #15 Agents 页面清理
- **根因**：✅ 纯 UI 清理，准确。
- **改法**：合理。-30/+10 估算合理。
- **风险**：低。
- **判定**：通过。

#### #17（布局子项）Session 收二级 + 新对话按钮
- **根因**：✅ 准确。
- **改法**：
  - 新建 `AgentSessionDrawer` ~120 行——合理。
  - **依赖项**：这条**必须**在 #4 的 `useAgentSessions` hook 落地后才能开工，否则 state 归属会冲突。方案把 #4→#15→#17 串行是对的。
  - **但**：`SessionList.tsx` 从 rail 组件简化为 `SessionRow`——旧文件全量重写成本高于"新建 drawer + deprecate SessionList"。建议直接新建不改老文件。
- **行数**：方案 ~120 行净增合理。
- **判定**：通过。

---

### Lane D — 底层数据

#### B1 `ensureDefaultAgents` 补 `agent_bindings`
- **根因验证**：✅ 确认。`default-owner-agents.ts:152-202` 只 INSERT `agents` 表（通过 `createDefaultOwnerAgentRecord`），无 `agent_bindings` 写入。
- **改法评审**：合理。
- **关键盲点**：方案第 3 步 "已有 agent 但 binding 缺失的旧数据" 里说 `existing.runtimeId` 为 null 走 upsert——**但 existing 分支只在 `!existing.runtimeId` 时调用 `updateDefaultOwnerAgentRuntime`（L171-178）**。如果 runtime 不存在但 agent 存在（runtime 后装场景），binding 永远没机会补。应该**无条件** upsert binding（只要 runtime 存在 + agent 存在就 upsert，幂等即可）。
- **行数**：~90 行合理。
- **风险**：schema unique key 需先查 `supabase/migrations/20260428_wave10_runtime_session.sql`——方案提到了但没给出具体要看什么。建议查 `agent_bindings.UNIQUE (agent_id)` 还是 `(owner_id, agent_id, runtime_id)`——决定 upsert 策略。
- **判定**：**有条件通过**，需要先查 schema。

#### B2 注册流程补 `owners` 行
- **根因**：✅ 准确。Trigger 方案 A 确实是 Supabase 官方推荐。
- **改法**：合理。
- **风险**：
  - `SECURITY DEFINER` 触发器写 `public.owners` 需要 `owners_insert_own` policy——方案提到了，OK。
  - **但**：方案说 "scripts/mint-host-token-and-run.sh 和 tests/helpers/wave10-harness.ts 里手插 owners 行的 hack 可标 deprecated 不急删"——**这是坑**。如果 trigger 部署到 prod 但 test harness 还在手插，会撞 unique key 冲突。应该同步删（或改成 upsert `ON CONFLICT DO NOTHING`）。
- **判定**：通过，但请求同步清理 hack。

---

---

## 追加评审：#18 流式输出缺失（打字机效果丢失）

> 用户反馈：SSE delta 事件确实到前端了（E2E 截图证明），但用户看到的是"一次性全部出现"，没有打字机逐字效果。

### 源码验证

我读了三个关键层：

**1. SSE 解析层：`web/src/lib/openai-sse-client.ts`**
- `parseOpenAISSE` 是纯 async generator，按 `\n\n` 切边界逐帧 `yield`。
- **delta 是逐帧逐个 yield 的，不攒 buffer**（L98-99）。
- ✅ 这一层**没问题**。

**2. Store 层：`web/src/stores/owner-agent-chat-store.ts` L602-612**
```ts
} else if (event.type === 'delta') {
  set((s) => ({
    messagesByAgent: {
      ...s.messagesByAgent,
      [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
        message.id === assistantId
          ? { ...message, content: `${message.content}${event.content}` }
          : message,
      ),
    },
  }));
}
```
- **每个 delta 都**立即 `set((s) => ...)` —— zustand 的 `set` 是**同步**的，会立即触发订阅者重渲染。
- ✅ 这一层逻辑上也**没问题**。

**3. Gateway 层：`gateway/src/routes/owner-agent-chat-sse.ts` L233-236**
```ts
if (event.event_type === 'text' && typeof event.content === 'string') {
  ctx.markTextDelta();
  ctx.res.write(formatOpenAIChatChunkForTest(ctx.runId, ctx.model, { content: event.content }));
  return;
}
```
- Gateway 收到 host 的 `text` 事件就立即 `res.write` —— 也没攒 buffer。
- Headers 里 `X-Accel-Buffering: no` + `flushHeaders` 都设了，反代不会缓冲。
- ✅ gateway 层也**没问题**。

**4. Host 层（真凶）：`qrclaw-agent-host/internal/provider/claude/claude.go` L34-50**
```go
func (a *adapter) Run(ctx context.Context, input string) (string, error) {
    cmd := exec.CommandContext(ctx, a.r.Path, ...)
    cmd.Stdin = bytes.NewBufferString(input)
    var out, errb bytes.Buffer
    cmd.Stdout = &out           // ← 全部写进内存 buffer
    cmd.Stderr = &errb
    if err := cmd.Run(); err != nil { ... }   // ← 阻塞直到进程退出
    return ParseStreamJSON(&out)               // ← 然后一次性解析整个 stream
}
```

**找到根因了**：Host 端 `cmd.Run()` **阻塞等 Claude CLI 进程完全退出**才开始解析 stdout；`ParseStreamJSON` 一次性扫完整个 `bytes.Buffer`，然后 `return final.String()` 返回**完整拼好的文本**作为**单次**结果。

也就是说：**Claude CLI 的增量 stream-json 输出被 host 层完全吞掉了**。Host 的 `Run` 接口签名本身 (`(string, error)`) 就是非流式的——返回一个 final string。上游 gateway 从 host 拿到的就是**一个完整回复**（通过 `subscribeRunFrames` 里的 `completed` 事件发过来），然后 gateway 再假模假样包成一个 SSE delta + 一个 done 转发给前端。

**E2E 截图之所以看到有 delta 事件**，是因为 gateway 把这一整段 final text 当作**一个 delta chunk** 写出去了（L235），不是逐字 delta。前端收到一个巨大 delta，浏览器一帧渲完 → 用户感知就是"一次性全出现"。

### 根因定位

- ❌ 不是 "store buffer 攒 delta 最后 flush"。store 没攒。
- ❌ 不是 "React 18 automatic batching 合并渲染"。每次 delta 都是独立 microtask 里的 setState，batching 不跨 microtask。
- ✅ **真因**：`qrclaw-agent-host` 的 provider adapter 接口是**非流式**的 `Run(ctx, input) (string, error)`，CLI 的增量 stdout 被 `bytes.Buffer` 吃掉、`ParseStreamJSON` 一次性拼成 final string。
- 整条链路上**真正能"逐字流"的只有 Claude CLI 的原生 stream-json 输出**，但这个增量特性在 host 入口就被吞了。

### 修复建议（新增 Lane E 或挂到 Lane B #14 同一轮改动）

这条和 #14（OpenClaw session）本质是**同一个 provider adapter 接口重构问题**，建议合并处理：

#### 改动范围

**1. Host 侧（Go）—— 主要工作量**
- 把 `provider.Adapter.Run` 改成**流式**接口：
  ```go
  // 旧
  Run(ctx context.Context, input string) (string, error)

  // 新（两种方案二选一）
  // A. Callback 风格（最小侵入）
  Run(ctx context.Context, req RunRequest, onDelta func(text string)) (finalText string, err error)

  // B. Channel 风格（更 Go-idiomatic）
  Run(ctx context.Context, req RunRequest) (<-chan RunEvent, error)
  ```
- Claude adapter：不再 `cmd.Run()` 阻塞等结果；改成 `cmd.StdoutPipe()` + `json.Decoder` 流式读，每读一个 `assistant` / `text` content 块就 `onDelta(s)`。
- Cursor / Codex / OpenClaw 同步改造（codex 已经支持 `--stream-json`，cursor-agent 有 `--output-format stream-json`，openclaw 有 `--json`）。
- 上游 `internal/host/run.go` 把每个 `onDelta` 包成 `event_type=text` 的 WS frame 立即发给 gateway（而不是等 completed 才发一个 final_message）。

**2. Gateway 侧（TS）—— 已经基本就绪**
- `subscribeRunFrames` + `handleRunStreamFrame` 已经能处理 `event_type=text` 增量帧（L233-236）；只要 host 真的逐段发，gateway 就真的逐段转发。
- **需要改**：`completed` 分支（L251-255）里的 "如果 hasTextDelta 为 false 则写 final_message" fallback —— 现在实际上**每次都走这条 fallback**（因为 host 从不发增量 text），改造后真正的增量来了就走不到这里。保留无损。

**3. 前端侧—— 零改动**
- `openai-sse-client` 已经是逐帧 yield。
- store 已经是每帧 setState。
- 真流起来后打字机效果自然就有了。

#### 行数估算
- Host Go：provider interface 改 + 4 个 adapter 流式改造 + run.go 增量 fanout + 测试 = **~250 行**
- Gateway TS：~10 行清理 + 测试 ~30 行 = **~40 行**
- 前端：0
- **合计 ~290 行**

#### 风险
- **高**。改 provider interface 是 breaking change，4 个 adapter 都要跟。
- stream-json 的错误恢复：进程中途 crash 时半截 JSON 要能容错（`json.Decoder` 本身就会报 `decode error`，需要 graceful degrade 到"已收到的部分当 final"）。
- 测试策略：`ParseStreamJSON` 的现有测试要保留（final-text 场景），**新增** streaming 回调测试（assert `onDelta` 按顺序被调多次）。

#### 与 #14 的合并可能

- #14（OpenClaw session-id 隔离）只是在 `Run(ctx, input)` 里改 args。
- #18 要把 `Run` 签名从非流式改成流式。
- **两者合并为一次 interface 重构更划算**：一次改完 4 个 adapter，省一轮代码审查 + 一轮回归测试。
- 新方案：**Lane B #14 扩大范围，改名为 "Provider adapter 接口重构（流式 + per-agent session）"**，行数从 15 涨到 **~290**。

#### 替代方案（临时 workaround）

如果 Wave 10 本轮来不及做完整流式改造，有个**降级方案**：
- Host 侧继续返回 final string，**但 gateway 侧模拟打字机**：把 host 的 `final_message` 按 ~40ms/token 节奏切成多个 delta chunk 写给前端。
- 代价：不是真流，只是"视觉上的流"；用户发完消息到开始看到字的**首字延迟**不变（还是要等 CLI 跑完），但后续字符出现节奏变自然。
- 行数：~30 行 gateway 改动。
- **不推荐作为最终方案**，但可作为本轮的临时体验补丁。

### 方案作者对此条的推断

方案作者**完全没提这条**。用户在追加里猜 "store buffer 攒 delta" / "React 18 batching" —— **两个推断都错**，真因在 host 侧非流式接口。

这是**跨层调查的典型案例**：前端看 SSE 有 delta 以为上游在流，实际上游早就被 buffer 吃了。必须逐层往下读到 Go 代码才能看清。

### 判定

🔴 **必须进本 Wave**（与 #14 合并改造），否则用户"打字机效果"的产品期望达不到。如果来不及做完，至少实施"gateway 节奏化切片"的降级方案，行数 30。

---

## 遗漏项

**方案完全没处理的 🔴 阻塞项（3 条）**：

### #2 🔴 "Set up local runtime" 引导让普通用户安装
- **验收人原话**："对普通 owner 用户应**一键启动 host**"
- **严重性**：🔴 阻塞。产品层面的 onboarding 断裂，不是 UI/bug 能修掉的。
- **方案处理**：**完全留白**。Lane A/B/C/D 都不碰。
- **真实需求**：Wave 10 pivot 反馈 UX-1 的核心痛点。要么加 "一键启动 host" 按钮（需要 IPC/协议），要么默认把 host 做成 systemd/launchd 自动拉起的 service。
- **建议**：至少开 Lane E "Onboarding" 专门列出来，即使本轮不做也要标为"已知缺口、下一 Wave 补"。否则验收人看到这条仍未解决，整个修复就是白跑。

### #3 🔴 为什么没直接识别本机已装的 runtime
- **验收人原话**："你之前 E2E 是怎么测的？"
- **严重性**：🔴 阻塞。与 #2 同源——host 没跑 = runtime 永远 offline。E2E 绿和真人用户体验脱节的实锤。
- **方案处理**：**完全留白**。
- **真实需求**：需要 Web 端直接 detect（浏览器侧扫描本机 CLI 不可行，但可以：host 做成 always-on service；或者后端 fallback，owner 登录后若无 host 连接则在 UI 显示"检测中"而不是"未安装"）。
- **建议**：同 #2，至少要在方案里**明确**这是已知范围外问题。

### #6 🔴 中文输入法打不进字
- **验收人原话**："中文输入法打不进字；英文直接敲可以"
- **严重性**：🔴 阻塞。已经有根因定位（IME composition 被 parent re-render 打断），且 docs 里有 `assistant-ui-ime-analysis.md` 专文分析。
- **方案处理**：**完全留白**。
- **真实需求**：`ChatComposer` 或 assistant-ui Thread 的 adapter 要稳定化（`useMemo` 依赖从 `messages` 换成 agent 级稳定引用）。估计 ~30 行改动。
- **建议**：加进 Lane B 作为 **#6 新条目**，优先级 P0。

### #9 🟡 看不到 agent 思考过程
- **方案处理**：留白。
- **严重性**：🟡，可接受本轮不做，**但方案里应该标注**"本 Wave 不做，P1"。
- **建议**：显式列为 out-of-scope。

### #12 🟡 没有上传图片/文件/语音入口
- **方案处理**：留白。
- **严重性**：🟡，可接受本轮不做。
- **建议**：同 #9，显式 out-of-scope。

### 待验收项里的明确 TODO
清单末尾的"待验收项"列表里还有若干 📋：
- "语音 / 文件 / 图片（UX-4）" — out-of-scope OK
- "Messages / Chat 入口合并（UX-2）" — **与 #4 相关，方案里没显式说是否一并解决**
- "My QRcode 并入 Agents（UX-3）" — **方案里没提**
- "离线 agent 清理" — **方案里没提**
- "/chat 页面下方大片空白布局 bug" — **方案里没提**（可能 #4 重构顺带修了，但不确定）

**建议**：方案末尾加一节 "本 Wave 不覆盖项"，把以上显式列出。

---

## 过度设计项

### #13 的 `style` prop 扩展
- 现状：`StatusDot` 直接加 `style?: CSSProperties` 合并 inline style。
- **没过度**，这条是合理最小改动。

### #16 的 "替换为小绿点"
- 方案给了两个版本（最小删除 vs 换小绿点），推荐了后者。
- **略过度**：用户反馈只说"去掉文字"，加小绿点是设计师加戏。最小删除就够。**建议改成"最小删除" 为 v1**。

### #17（布局）的 SessionList 重写
- 方案说"老 SessionList.tsx 保留内部 row 渲染为 SessionRow 子组件供 drawer 复用"——**这是不必要的 refactor**。
- 更干净：直接新建 `AgentSessionDrawer`，内嵌 row 渲染，deprecate 老 `SessionList`（加 `@deprecated` JSDoc 或移到 `_deprecated/`）。
- **降低风险**，少改 1 个旧文件。

### Lane B #11 的 `message_persisted` 新事件
- 为了解决重复，方案走了"加新 WS 事件 + gateway fanout"的路——**过度**。
- 更简单：gateway 侧 `owner_agent_run_completed` 的 payload 已经带 `run_id`；**前端只需修 `mergeMessages` + WS fallback 匹配就够**。不要新增事件。
- **建议**：去掉 `message_persisted` 新事件方案，改走"前端 dedupe 强化"路线，行数反而更少（~40 行）。

---

## 执行顺序调整建议

方案原顺序：**D → A + B → C**

### 评审调整建议：**D → (B + 新增 #2/#3/#6) → A → C**

理由：
1. **D 第一**：✅ 同意。B1/B2 不落后面全部 502。
2. **B 第二**：✅ 同意，**但必须包含新增的 #6（IME）**。#6 是 🔴 阻塞且独立于布局，应该早修而不是等到 C 之后。
3. **A 第三**（非并行）：A 里的 #10（代码块配色）和 #17-avatar 会影响 C 的视觉基线。建议 A 在 C 之前落地，让 C 的重构基于已经浅色化的代码块。
4. **C 最后**：✅ 同意。风险最高、行数最大、测试最多。必须等 B+D 稳定。
5. **新 Lane E（onboarding 缺口）**：
   - #2 / #3 的产品层处理不可能和 A/B/C/D 同节奏。
   - 建议开专题：**本 Wave 不解决，下一 Wave 优先**，但必须在方案文档里显式列出，并 attach 到 Wave 11 规划。

### 并行策略补充
- 方案说 "A / B+D / C 三个 worktree" —— 合理。
- **补充**：Lane D 的 B1/B2 落地后，Lane B 的 E2E 才能跑。因此 B+D 虽然同 worktree，内部仍要串行（先 D 后 B），**不是真并行**。方案没明说，建议修正。

---

## 最终建议

### 必改项（打回重做这些，否则验收 fail）

1. **补 #6（IME bug）+ #18（流式输出）进 Lane B**：🔴 阻塞项不能漏。#18 建议与 #14 合并为 provider 接口重构。
2. **补"本 Wave 不覆盖项"章节**：显式列出 #2 / #3 / #9 / #12 / UX-2/3/4 / 空白布局 bug 等，让验收人知道范围。
3. **#1 增加 `if (loading) return` guard**：先抓 HAR 确认是否双重 submit，再决定是否保留"查 session 兜底"方案。
4. **#11 重写根因分析**：
   - 不走 `message_persisted` 新事件。
   - 改 `mergeMessages` 为复合键去重。
   - 改 WS fallback 匹配为"只匹配 run_id 相等的 bubble"。
   - 行数从 30 调到 80-100。
5. **#17-avatar 加 backfill**：老账号 DB 里的 `avatar_url=null` 要回填。
6. **#4 分阶段**：v1 砍掉"最后消息预览 + 未读数"，行数压到 ~250。v2 再补。
7. **#13 小调整**：`StatusDot` 加 `style` 时补 grep 检查已有调用。

### 建议项（强烈推荐但非阻塞）

- #10 把 inline code 背景联动写进任务描述，行数 → 25。
- #14 实施前先 grep 四个 provider 的 Run 签名，确认接口一致性。
- B1 实施前先查 `agent_bindings` 的 UNIQUE 约束。
- B2 的 test harness 手插 owners 必须同步改为 `ON CONFLICT DO NOTHING`，不然 trigger 上线会撞。
- #16 只删文字不加小绿点，减少设计师加戏。
- #17-layout 不改老 SessionList，直接新建 drawer + deprecate。

### 执行顺序（修订版）

```
Week 1
  └─ Lane D (B1 + B2)               ~130 行 + 1 migration
  └─ Lane B-critical (#6 IME)       ~30 行        [🔴 并行开工]

Week 2
  └─ Lane B (#1 + #11)              ~100 行
  └─ Lane B/E provider 重构 (#14 + #18 合并)   ~290 行
       ├─ 4 个 adapter 流式改造 + per-agent session
       └─ 或降级为 gateway 节奏化切片 ~30 行（本轮兜底）
  └─ Lane A (#10 + #13 + #16 + avatar-backfill)  ~50 行

Week 3
  └─ Lane C v1 (#4 + #15)           ~300 行（砍预览/未读）

Wave 11 (下一 Wave)
  └─ #2 / #3 Onboarding 产品层修复
  └─ Lane C v2 (#4 预览/未读 + #17-layout)
  └─ #9 thinking / #12 附件入口
```

### 最终打分

| 维度 | 分数 | 备注 |
|------|------|------|
| 根因分析准确性 | 6/10 | #11 漏 mergeMessages + fallback；#1 可能抓错；#18 真因在 host Go 层被完全忽视 |
| 改法最小性 | 7/10 | #16/#17-SessionList 稍过度；#11 的新事件方案过度；#18 建议与 #14 合并减少重复开工 |
| 风险评估 | 6/10 | #4 行数低估一倍；#14/#18 provider 接口重构范围大 |
| 依赖顺序 | 8/10 | D→B→C 主干对；B+D 内部串行没说明 |
| 覆盖完整度 | 4/10 | 🔴 #2/#3/#6/#18 四条全部留白，这是最大扣分项 |

**总体判断：有条件通过**。修复上述 7 条"必改项" 后可进入执行。

---

REVIEW DONE
