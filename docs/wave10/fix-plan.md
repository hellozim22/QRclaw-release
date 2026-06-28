# Wave 10 验收修复方案 (v2)

> 架构师：QRClaw Frontend
> 初版：2026-04-29
> v2 修订：2026-04-29（合入独立评审 `fix-plan-review.md` 7 条必改项）
> 参考清单：`docs/wave10-acceptance-issues.md`
> 主入口：`web/src/app/(dashboard)/chat/page.tsx` + `web/src/components/chat/OwnerAssistantThread.tsx`

> **v2 变更摘要**：
> 1. Lane B 新增 **#6（IME bug）**、**#18（流式输出）**。
> 2. #14 与 #18 合并为 **"Provider 接口重构：流式 + per-agent session"**（~290 行）。
> 3. #11 去掉 `message_persisted` 新事件方案，改走 `mergeMessages` 复合键 + WS fallback 强化（~80 行）。
> 4. #4 分阶段：v1 砍预览 / 未读，行数上修到 ~300。
> 5. #17 头像补 backfill migration（~15 行）。
> 6. #1 加 `if (loading) return` 双重 submit guard。
> 7. 末尾新增 **"本 Wave 不覆盖项"** 章节。
> 8. 执行顺序按评审修订版：**D → (B-critical #6) → B → A → C**。

---

## Lane A — 视觉 (并行安全，只改样式 / 文案)

### #8 Assistant 去气泡去头像 ✅ **DONE (Round 5)**

- **文件**：`web/src/components/chat/OwnerAssistantThread.tsx`（L115-151）
- **状态**：`FlatAssistantMessage` 已经实现：无 Avatar、无 bubble、左对齐、满宽。`components.AssistantMessage={FlatAssistantMessage}` 已挂载（L204）。
- **本轮动作**：无需改动。补一条 "assistant message renders without avatar" regression（~8 行 test）。
- **风险**：无。
- **行数**：0（产品代码）+ 8（测试）。

---

### #10 代码块：黑底 → 浅灰 + 保留高亮 + 语言标签

- **文件**：`web/src/components/chat/CodeBlock.tsx` + `web/src/components/chat/MarkdownRenderer.tsx`
- **现状**：`shellStyle.background = var(--color-black)`；inline `<code>` 背景 `rgba(255,255,255,.08)`（浅底下几乎不可见）。
- **改什么**：
  1. `shellStyle.background` → `var(--color-gray-50)`；`border` → `1px solid var(--color-gray-border)`。
  2. `headerStyle.background` → `var(--color-gray-100)`；`borderBottom` → `var(--color-gray-border)`。
  3. `preStyle.color` → `var(--color-gray-800)`；`copyBtnStyle` 默认 `var(--color-gray-600)`、hover `var(--color-gray-800)`。
  4. **先 `grep "highlight.js/styles"`** 定位所有 hljs theme import（预期在 `MarkdownRenderer.tsx` 或 `app/layout.tsx`），把 `github-dark.css` → `github.css`。**必须两处都换**，不能只换一处。
  5. **联动修 inline code**：`MarkdownRenderer.tsx` 里 `<code>` 的 `background` 从 `rgba(255,255,255,.08)` → `var(--color-gray-100)`，`color` → `var(--color-gray-800)`。
  6. 确认 `rehype-highlight` 生成的 `className="language-xx"` 有正确传给 `CodeBlock`（现有 `MarkdownRenderer` 里 `code` 组件 props 若未透传，补一行解析）。
- **行数**：~25 行（含 inline code 联动）。
- **风险**：hljs theme 有两处 import 时漏改一处 → 部分代码块仍是暗底。实施前强制 grep。
- **注意**：**不要**改 CodeBlock 的对外 API；只动样式常量与 theme import。

---

### #13 绿点白框 → 纯绿点

- **文件**：`web/src/components/chat/AgentCard.tsx`（L149-160）
- **现状**：compact 模式下 `StatusDot` 外层包着白圈（`background: white + padding: 2px`）。
- **改什么**：
  1. 删除 L149-160 的外层 `<span>`。
  2. `StatusDot` 加可选 `style?: CSSProperties` prop，内部 `...style` 合并到 inline style 末尾（让调用方覆盖生效）。
  3. compact 用法：
     ```tsx
     <StatusDot
       status={runtimeStatus}
       size={10}
       style={{ position: 'absolute', right: 0, bottom: 0 }}
     />
     ```
  4. **实施前 grep `<StatusDot`** 所有调用点（~5 处），确认没人已经在传 `style`，避免覆盖顺序 regression。
- **行数**：-10 / +5 = **净 -5 行**。
- **风险**：低（已加 grep 前置检查）。

---

### #16 去掉 "Runtime 4/4 online" 文字

- **文件**：`web/src/app/(dashboard)/chat/page.tsx`（L361-368）
- **改什么**（v2 采纳评审建议，**改为最小删除**，不加小绿点加戏）：
  1. 直接删除 L361-368 整块 `<div>Runtime {onlineCount}/{totalCount} online</div>`。
  2. header 右侧留空（或未来放 session drawer 触发按钮 —— 属 Lane C）。
  3. 同步删 `chat-page.test.tsx` 里对这串文字的断言（若存在）。
- **行数**：~5 行。
- **风险**：低。

---

### #17（视觉子项）Agent 默认头像接线 + Backfill

- **文件**：
  - `gateway/src/services/default-owner-agents.ts`（L59-92）
  - 新建：`supabase/migrations/<ts>_wave10_default_agent_avatars.sql`（backfill）
- **资源**：`web/public/avatars/claude.png` / `cursor.png` / `codex.png` / `openclaw-color.png`（已存在）。
- **改什么**：
  1. **新账号路径**：`DEFAULT_AGENT_CONFIGS` 每个 runtime 的 `avatarUrl` 从 `null` 改为对应 public 路径：
     ```ts
     claude:   { ..., avatarUrl: '/avatars/claude.png' }
     cursor:   { ..., avatarUrl: '/avatars/cursor.png' }
     codex:    { ..., avatarUrl: '/avatars/codex.png' }
     openclaw: { ..., avatarUrl: '/avatars/openclaw-color.png' }
     ```
  2. **老账号 backfill**（评审必改项 #5）：`ensureDefaultAgents` 的 existing 分支（L170-183）**不会**回填 `avatar_url`。两种方案二选一：
     - **方案 A（推荐）** DB migration 一次性 backfill：
       ```sql
       UPDATE agents
       SET avatar_url = CASE ab.runtime_type
         WHEN 'claude'   THEN '/avatars/claude.png'
         WHEN 'cursor'   THEN '/avatars/cursor.png'
         WHEN 'codex'    THEN '/avatars/codex.png'
         WHEN 'openclaw' THEN '/avatars/openclaw-color.png'
       END
       FROM agent_bindings ab
       WHERE agents.id = ab.agent_id
         AND agents.avatar_url IS NULL
         AND agents.source = 'default';
       ```
     - **方案 B（兜底）** existing 分支里 `updateDefaultOwnerAgentRuntime` 扩展也更新 avatar，代价是每次登录都多 UPDATE。
- **行数**：4 行 config + ~10 行 migration + 1 行测试同步 = **~15 行**。
- **风险**：migration 在 prod 跑时要加 `EXPLAIN`；`agents` 表预计百级数据，放心。
- **注意**：部署到 Vercel 时 `/avatars/*.png` 是绝对路径，OK。

---

## Lane B — 逻辑 Bug (评审新增 #6 / #18 并入)

### 🔴 #6 中文输入法打不进字 **（v2 新增）**

- **文件**：`web/src/components/chat/OwnerAssistantThread.tsx`（L162-165 useMemo）+ `web/src/components/chat/ChatComposer.tsx`（自研 composer）
- **背景**：见 `docs/wave10/assistant-ui-ime-analysis.md`。根因：`createOwnerAssistantAdapter` 的 `useMemo` 依赖里含 `messages`（引用每次 streaming push 都变），导致 runtime 重建 → assistant-ui Thread 内部 textarea unmount/remount → IME composition 窗口中断。
- **改什么**：
  1. **稳定化 adapter 引用**：把 `messages` / `isRunning` / `canSend` 等**动态数据**通过 **ref（`useRef`）** 传给 adapter 内部闭包，`useMemo` deps 只留 `agentId`：
     ```ts
     const stateRef = useRef({ canSend, isRunning, messages, onSend, onStop });
     stateRef.current = { canSend, isRunning, messages, onSend, onStop };
     const adapter = useMemo(
       () => createOwnerAssistantAdapter({
         getState: () => stateRef.current,
       }),
       [agentId],  // 只 agent 切换时重建
     );
     ```
  2. `createOwnerAssistantAdapter` 签名从"静态值"改为"`getState` 回调"；内部 `messages` / `isRunning` 访问点改为 `getState().messages`。
  3. **验证**：打开 `/chat`，切中文输入法连打 "你好世界"，不应有 textarea 闪烁或字符丢失。
  4. 补 E2E IME regression（`tests/e2e/wave10-ime.spec.ts`）—— Playwright 模拟 `compositionstart` / `compositionupdate` / `compositionend` 序列。
- **行数**：~30 行（thread + adapter）+ ~20 行 E2E = **~50 行**。
- **风险**：getState 模式改变了 adapter 内部对变化值的消费方式，需全量走 E2E（包括非 IME 的英文发送/取消/流式路径）。
- **优先级**：P0（与 D 同步开工）。

---

### #1 登录闪红字 "Invalid login credentials"

- **文件**：`web/src/app/(auth)/login/page.tsx`（L46-60）+ `web/src/hooks/useAuth.ts`
- **评审修正**：原方案 "signInWithPassword 返 error 但 session 已建立" 的并发竞态**未经验证**；评审指出更可能是**双重 submit**（浏览器密码管理器 autofill + 表单 JS 双路提交）或**首次失败残留 error 的下一帧闪现**。
- **改什么**（v2 合并方案：guard + 兜底）：
  1. **P0 必加 guard**（评审必改项 #3）：`handleSubmit` 开头加：
     ```ts
     if (loading) return;
     ```
     杜绝双重 submit。**+1 行**。
  2. **兜底查 session**（原方案保留作症状止血）：收到 `authError` 后先 `supabase.auth.getSession()`，若有 session 则直接跳转：
     ```ts
     if (authError) {
       const { data } = await supabase.auth.getSession();
       if (data.session) {
         router.push('/messages');
         return;
       }
       setError(authError.message);
       setLoading(false);
       return;
     }
     ```
  3. **实施前 HAR 调查**（硬要求）：让验收人用相同场景重现并抓 HAR + console log，确认是否有 2 次 `signInWithPassword` 请求。若确认双重 submit → guard 即解；若是真 race → 兜底查 session 兜住。
- **行数**：~10 行（1 行 guard + 8 行 session check + 1 行 import 调整）+ ~15 行 test = **~25 行**。
- **风险**：低。
- **依赖**：HAR 调查先行。

---

### #11 Cursor 消息重复（发 1 显 2）

- **文件**：`web/src/stores/owner-agent-chat-store.ts`（`sendMessage` L529-640、`mergeMessages` L410-413、WS `run_completed` fallback L740-766）
- **评审修正**：原方案"新增 `message_persisted` WS 事件" **过度设计**，且隐藏跨端改动。v2 改走**前端 dedupe 强化三联改**：
  1. **`mergeMessages` 复合键去重**（~L410-413）：原只按 `message.id` 去重；改为按 `(run_id ?? client_id ?? id)` 复合键。
     ```ts
     const keyOf = (m: ChatMessage) =>
       m.run_id ?? m.client_id ?? m.id;
     // 合并时：按 keyOf 建 Map，后来者覆盖前者
     ```
  2. **WS `owner_agent_run_completed` fallback 匹配收紧**（~L740-766）：当前 fallback 按"第一个 streaming/running" 匹配，多 agent 并发时误中。改为**必须 `run_id` 相等**才命中；无 `run_id` 的 bubble 不再被 completion frame 关闭。
  3. **optimistic assistant bubble 的 id 收敛**：DB 持久化后把 assistant bubble 的 `id` 从 `assistantId` 替换为 gateway 分配的 `message_id`（现在只 adopt `run_id` 不换 `id` → history 重放就重复）。具体：在 `run_id` 事件 handler 里多记 `persistedAssistantId`，在 `selectAgent` 触发的 listMessages merge 前，把 local bubble 的 id 改成 DB id。
- **改什么**：在上述三处改。**不**新增 WS 事件类型。
- **行数**：store ~40 行 + 集成测试 ~30 行 + gateway 端**零改动** = **~80 行**（评审采纳）。
- **风险**：中。涉及三处并发时序，必须在 integration test `owner-agent-chat-api.test.ts` 里补"Cursor 发一条 → DB 一条 → UI 一条（刷新后仍一条）"+"并发两个 agent 各发一条，completion 不串"两条用例。
- **注意**：#7（Claude 重复）推断同因，此补丁一并解决。

---

### 🔴 #14 + #18 Provider 接口重构：流式 + per-agent session **（v2 合并）**

> 评审追加 #18（流式输出缺失，真因在 host 非流式接口）后，把它与 #14（OpenClaw session 共享）合并为**一次 provider adapter 接口重构**，避免重复改 4 个 adapter。

#### 根因

- **#14**：`qrclaw-agent-host/internal/provider/openclaw/openclaw.go:35` `sid := fmt.Sprintf("qrclaw-host-smoke-%d", os.Getpid())` 所有 agent 共享同一 session → OpenClaw CLI 吐 wecom-bot 初始化日志。
- **#18**：`provider.Adapter.Run(ctx, input) (string, error)` 是**非流式**签名；claude adapter 用 `cmd.Run()` 阻塞等 CLI 进程完全退出，`ParseStreamJSON` 一次性吃 buffer → CLI 的 stream-json 增量输出被 host 吞掉 → gateway 从 host 收到的是完整 final text，被当作一个大 delta 转发 → 用户看到"一次性全部出现"。前端 / gateway / SSE 解析都没问题。

#### 改什么

**1. Host Go 层（主要工作量）**

- `provider.Adapter` 接口改为流式 callback 风格（最小侵入）：
  ```go
  // 旧
  Run(ctx context.Context, input string) (string, error)
  // 新
  Run(ctx context.Context, req RunRequest, onDelta func(text string)) (finalText string, err error)
  ```
  其中 `RunRequest` 至少包含：
  ```go
  type RunRequest struct {
    AgentID   string   // 解 #14：进 session-id
    SessionID string   // 解 #14：同 agent 多 session 隔离
    Input     string
  }
  ```
- 4 个 adapter 流式改造：
  - **claude**：`cmd.StdoutPipe()` + `json.Decoder` 流式读 assistant/text content，每块调 `onDelta`。
  - **cursor**：用 `--output-format stream-json` 替代当前 final 拉取。
  - **codex**：用 `--stream-json`。
  - **openclaw**：`--json` 本就流式输出每行一个 JSON，切 line-by-line 读。同时把 `sid` 从 `os.Getpid()` 换成 `fmt.Sprintf("qrclaw-host-%s-%s", req.AgentID, req.SessionID)`（解 #14）。
- `internal/host/run.go` 把每个 `onDelta` 立即包成 `event_type=text` 的 WS frame 发给 gateway，而不是攒到 completed 一起发。
- 签名变更前**先 grep** `func .* Run\(ctx` 确认 4 个 adapter 当前签名是否已统一，决定是否有隐藏调用点。

**2. Gateway TS 层**

- `subscribeRunFrames` + `handleRunStreamFrame`（`owner-agent-chat-sse.ts:233-236`）已经能处理 `event_type=text` 增量帧，host 真的逐段发后**天然转发**。
- 清理 `completed` 分支（L251-255）里的 "若 `hasTextDelta=false` 补发 final_message" fallback（改造后正常流程走不到，保留兜底用于 host 真的没发增量时的 graceful degrade）。
- 兜底 edge case：CLI 中途 crash 时半截 JSON → `json.Decoder` 报 decode error → host 把已收到的部分作为最终 text 返回，flag 为 `partial`。

**3. 前端**

- **零改动**。`openai-sse-client` 逐帧 yield，store `delta` 分支每帧 setState —— 上游真流起来后打字机效果自然就有。

#### 降级方案（若本 Wave 来不及做完整流式改造）

- **gateway 节奏化切片**：host 继续返回 final string，gateway 把 `final_message` 按 ~40ms/token 节奏切成多个 delta chunk 写给前端。
- 视觉上像流，但**首字延迟**不变（还是要等 CLI 跑完）。
- ~30 行 gateway 改动。
- **不推荐作为最终方案**，仅作为本轮来不及时的体验补丁。

#### 行数

- Host Go：provider interface + 4 adapter 流式改造 + run.go 增量 fanout + 测试 = **~250 行**
- Gateway TS：~10 行清理 + ~30 行测试 = **~40 行**
- 前端：0
- **合计 ~290 行**

#### 风险

- **🔴 高**。改 `provider.Adapter` 是 breaking change，4 adapter 必须同步跟；测试需保留现有 `ParseStreamJSON` final-text 场景，**新增**流式回调测试（assert `onDelta` 按顺序被调多次）。
- per-agent session（#14 部分）必须配 Go test：两次 Run 传不同 `AgentID` → `--session-id` arg 实际不同。
- 降级方案与最终方案共存期，`completed` 分支 fallback 要保留兼容。

#### 判定

🔴 **必须进本 Wave**（与 #11 同级优先）。若进度紧张，至少落降级方案 30 行兜打字机体验。

---

## Lane C — 布局重构（互相依赖，v1 砍预览/未读）

> 评审指出原 220 行估算**打 5 折**（实际 ~500-600 行才能做完预览+未读+下沉 hook）。v2 **分阶段**：本 Wave 只做 v1（单列列表 + 点击进入），v2 放 Wave 11。

### #4 左栏两层 → 单列微信式 agent 列表 (v1)

- **v1 范围**（本 Wave）：
  - ✅ 单列 `AgentListRail`（宽 280px）：头像 + 名称 + 在线绿点 + 静态 placeholder 文字（"点击开始对话" 或 "刚刚在线"）。
  - ✅ 点击 agent → 进入对话。
  - ✅ state 下沉：`sessionsByAgent` / `activeSessionByAgent` 从 `chat/page.tsx` 移到 `useAgentSessions(agentId)` hook（为 #17 drawer 铺路）。
  - ❌ **砍掉** "最后一条消息预览"（需 store 补 `lastMessageByAgent` selector，留 Wave 11）。
  - ❌ **砍掉** 未读数徽章（需 `unreadByAgent` 状态机，留 Wave 11）。
  - ❌ **砍掉** archived 折叠（默认全显示 active；archived 等 #15 处理）。

- **文件**：
  - 新建：`web/src/components/chat/AgentListRail.tsx`（~180 行，含样式 + 空态 + loading skeleton）
  - 新建：`web/src/hooks/useAgentSessions.ts`（~80 行，state 下沉）
  - 修改：`web/src/app/(dashboard)/chat/page.tsx`（删 rail + sessionlist 三列布局，-40 行；挂 AgentListRail + useAgentSessions）
  - 保留但不挂载：`AgentRuntimeRail.tsx`（留 rollback）
  - E2E selector 迁移：`tests/e2e/wave10-*.spec.ts`（~20-30 处 selector 改动，~30 行）

- **行数**：~180 + ~80 + ~30（page 改 + selector 迁移） + ~20（测试新建）= **~310 行**（v1，评审认可 ~250-300 区间）。

- **风险**：**高**。E2E selector 迁移必须一次到位（可用 `data-testid` 统一替代旧选择器）；state 下沉到 hook 后，`handleSelectSession` 里先切 agent 再切 session 的顺序不能乱。

- **注意**：v1 不做预览 / 未读是**明确已知裁剪**，需在代码 TODO 注释 + Wave 11 规划里显式列出。

---

### #15 Agents 页面清理 + 在线状态

- **文件**：`web/src/app/(dashboard)/agents/page.tsx`（L144-255）
- **改什么**：
  1. L154 删 `<h1>智能体</h1>`。
  2. L156-171 删 "显示全部 / 隐藏离线/归档" 按钮 + `showOffline` state（L50、L56-74）。默认不含 archived，页脚给一个 text link "显示归档"。
  3. L222-253 agent 卡片里，在 name 下方加 `<StatusDot status={deriveRuntimeStatus(...)} size={8}>` + `STATUS_LABEL` 文字。
- **行数**：-30 / +10 = **净 -20 行**。
- **风险**：低。`showOffline` grep 确认仅本文件。
- **判定**：通过。

---

### #17（布局子项）Session 收二级 + 新对话按钮

- **依赖**：必须在 #4 的 `useAgentSessions` hook 落地后。
- **文件**：
  - 新建：`web/src/components/chat/AgentSessionDrawer.tsx`（~120 行）
  - 修改：`web/src/app/(dashboard)/chat/page.tsx` header 区域（~15 行）
  - **不改**老 `SessionList.tsx`（评审建议：deprecate 而非重写，降低风险；加 `@deprecated` JSDoc 后续 Wave 删）。
- **改什么**：
  1. chat header 右侧加："📋 历史 ▾"（触发 drawer）+ "＋ 新对话"（调用 `useAgentSessions().createSession`）。
  2. `AgentSessionDrawer` 弹出浮层，展示当前 agent 的 sessions，内嵌 row 渲染（不从旧 SessionList 抽 SessionRow，独立实现）。
- **行数**：~120 + ~15 = **~135 行**。
- **风险**：中。sessions state 已下沉到 hook，drawer 只读消费。

---

## Lane D — 底层数据修复

### B1 `ensureDefaultAgents` 补 `agent_bindings`

- **文件**：`gateway/src/services/default-owner-agents.ts`（L152-202）+ `gateway/src/db/owner-runtimes.ts`（新 helper）
- **根因**：L186 `createDefaultOwnerAgentRecord` 只 INSERT `agents`；owner chat API 查 `agent_bindings` 取 runtime mapping → 空 → 404 "Owner agent not found"。
- **实施前置**（评审建议）：先查 `supabase/migrations/20260428_wave10_runtime_session.sql` 确认 `agent_bindings` 的 UNIQUE 约束（是 `(agent_id)` 还是 `(owner_id, agent_id, runtime_id)`），决定 upsert ON CONFLICT 策略。
- **改什么**：
  1. 新增 helper `upsertDefaultOwnerAgentBinding({ ownerId, agentId, runtimeId, runtimeType, apiKeyHash })`，幂等 upsert。
  2. `ensureDefaultAgents` 循环内：**无条件**（评审修正，不仅 `!existing.runtimeId` 一个分支）—— 只要 runtime + agent 都存在就 upsert binding：
     ```ts
     if (runtime) {
       await deps.upsertDefaultOwnerAgentBinding({
         ownerId, agentId: created.id ?? existing.id,
         runtimeId: runtime.id, runtimeType, apiKeyHash,
       });
     }
     ```
- **行数**：service ~20 行 + DB helper ~30 行 + 测试 ~40 行 = **~90 行**。
- **风险**：中高。先 staging 验证 10 个 owner。
- **回滚**：env flag `ENSURE_DEFAULT_BINDINGS=true`（默认 on）。

---

### B2 注册流程补 `owners` 行

- **文件**：
  - 新建 migration：`supabase/migrations/<ts>_owners_autocreate_trigger.sql`
  - 修改：`scripts/mint-host-token-and-run.sh`、`tests/helpers/wave10-harness.ts`（原方案说 "deprecated 不急删" —— 评审指出这是坑，必须同步改为 `ON CONFLICT DO NOTHING` 否则 trigger 上线撞 unique）
- **根因**：只 `auth.users` 行、没 `owners` 行 → `/owner-runtimes`、`ensureDefaultAgents`、`/owner-agents` 全跪。
- **改什么**（方案 A，DB trigger）：
  1. Migration 新建 `handle_new_user` trigger（`SECURITY DEFINER`），`AFTER INSERT ON auth.users` 自动 INSERT `public.owners (id, created_at) VALUES (NEW.id, now())`。
  2. RLS policy `owners_insert_own` 已存在（`20260312_init_schema.sql:47`）兼容。
  3. **同步清理**（评审必改）：harness / mint script 里手插 `owners` 改为 `INSERT ... ON CONFLICT (id) DO NOTHING`，避免 trigger 上线后老 fixture 撞 unique。
- **行数**：~25 行 SQL + ~15 行 harness/script 改 = **~40 行**。
- **风险**：中。回滚 = migration down 删 trigger。

---

## 本 Wave 不覆盖项（out-of-scope，显式列出）

> 评审必改项 #2：让验收人清楚知道哪些 issue 本轮**主动不做**，避免期望落差。以下项目记入 **Wave 11 规划**。

| 问题 | 严重 | 本 Wave 处理 | 原因 / 计划 |
|------|------|-------------|------------|
| **#2** "Set up local runtime" 引导需一键启动 host | 🔴 | ❌ 不做 | 产品层 onboarding 断裂，需要 Mac App / launchd service / IPC 协议改造，非本 Wave UI/bug 范畴。 **Wave 11 P0**。 |
| **#3** 未直接识别本机已装 runtime | 🔴 | ❌ 不做 | 与 #2 同源（host daemon 未跑）。需要 host 做成 always-on service 或后端 fallback "检测中" 文案。**Wave 11 P0**。 |
| **#9** 看不到 agent 思考过程 | 🟡 | ❌ 不做 | 需 SSE 传 thinking tokens + UI thinking 折叠组件。**Wave 11 P1**。 |
| **#12** 附件 / 图片 / 语音入口 | 🟡 | ❌ 不做 | ChatComposer 预留了 slot 但未实现。**Wave 11 P1**（UX-4）。 |
| Messages / Chat 入口合并（UX-2） | 🟡 | ⚠️ 部分 | Lane C #4 单列 agent 列表已部分收敛此诉求；完整"Messages 入口并入"留 Wave 11。 |
| My QRcode 并入 Agents（UX-3） | 🟡 | ❌ 不做 | 信息架构层面调整，**Wave 11**。 |
| 离线 agent 清理 | 🟡 | ❌ 不做 | #15 改动后 archived 进折叠入口已减缓视觉累赘；完整清理策略留 Wave 11。 |
| `/chat` 页面下方大片空白 | 🟡 | ⚠️ 可能顺带修 | 推断由老三列布局 `flex:1` 失衡引起，Lane C #4 重构后应消失；不显式排查。 |
| #18 降级方案（若选） | - | - | 与 #14 合并改造首选，若进度紧张采用 ~30 行 gateway 节奏化切片兜底。 |

---

## 执行顺序（v2 修订版）

```
Week 1  (并行开工)
  Lane D                         ~130 行 + 1 migration
    └─ B1 agent_bindings upsert
    └─ B2 owners trigger + harness cleanup
  Lane B-critical                ~50 行
    └─ #6 IME (adapter ref 稳定化 + E2E)      [🔴 P0 并行]

Week 2  (B 主体 + A 视觉)
  Lane B                         ~395 行
    └─ #1 login guard + session 兜底   ~25
    └─ #11 mergeMessages + WS fallback ~80
    └─ #14 + #18 Provider 重构          ~290
        或降级为 gateway 节奏化切片     ~30 (兜底)
  Lane A                         ~50 行
    └─ #10 CodeBlock 浅色 + hljs theme + inline code  ~25
    └─ #13 去白圈                                    ~5
    └─ #16 删 "Runtime N/N online"                    ~5
    └─ #17-avatar config + backfill migration         ~15
    └─ #8 test regression                             ~8

Week 3  (Lane C v1)
  Lane C                         ~425 行
    └─ #4 v1 (AgentListRail + useAgentSessions hook) ~310
    └─ #15 Agents 页清理                             ~-20
    └─ #17-layout drawer + new session button        ~135

Wave 11 (本 Wave 不覆盖项见上表)
  └─ #2 / #3 Onboarding 产品层
  └─ Lane C v2：#4 预览 / 未读 / archived 折叠
  └─ #9 thinking / #12 附件入口 / UX-2/UX-3
```

### 执行要点

1. **D 必须第一**：B1/B2 不落后面全部 502。
2. **B-critical #6 并行开工**：IME 是 🔴 且独立于布局，**不能等**到 C 之后。
3. **B+D 同 worktree 时内部串行**（先 D 落完、E2E 能起来，B 才能跑）：评审已指出原方案漏说这点。
4. **A 在 C 之前**：#10 代码块浅色化是 C 重构的视觉基线，先落。
5. **C 最后**：风险最高、行数最大、E2E selector 改最多；必须等 B+D 稳定。

### 并行策略

- **3 个 git worktree**：`wave10/lane-d-db` / `wave10/lane-b` / `wave10/lane-c`（v1）。
- Lane A 改动纯 CSS + 配置，任何 worktree 随时合入都无冲突，单独一个也行。

### 验收前 E2E 回归

- Lane A：`CodeBlock.test.tsx`、`AgentCard.test.tsx`、`chat-page.test.tsx`
- Lane B：`owner-agent-chat-api.test.ts`、`login.test.tsx`、新增 `wave10-ime.spec.ts`、新增 `openclaw_streaming_test.go` + 4 adapter streaming tests
- Lane C：`tests/e2e/wave10-chat.spec.ts` 全量（selector 迁移同步）
- Lane D：`default-owner-agents.test.ts`、新增 migration test、`wave10-harness.ts` 回归

---

PLAN V2 DONE
