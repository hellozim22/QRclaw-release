# Wave 10 战略架构审查

> 2026-04-28 · 独立审查（不动代码）
> 范围：pivot 到 Multica-style 多 agent 协作 + fork LobeChat + OpenAI SSE 全面化
> 视角：从铁律、Wave 5-9 投入、业务真实目标三个独立维度切入，不重复 Q1/Q2 评估

---

## 1. 业务战略判断（从零重推）

### 1.1 用户真正想要的

把用户表述剥掉，三层推：

**表层**："做一个 Multica-style 多智能体产品"
**中层**："zimzheng 一人用多个 agent 协作做 笔笔省"
**真层**：**"我自己一个人一台机器，想让 claude/cursor/codex/openclaw 并肩替我干活，而且不要每次都手动拷命令、切窗口、贴 context。"**

也就是：**这不是 SaaS，这是给 zimzheng 自己的 personal agent workbench**。客户只有一个。笔笔省只是第一个被 agent 们"攻击"的 target project。

这个判断如果立住，产品取舍会全变：
- 不需要多租户扩张 → auth/RLS 做到"能用"就停，不再加功能
- 不需要 agent marketplace → `agents` 表只要能让本机 CLI 一键注册
- 不需要 B2B 客服闭环 → visitor/QR 冷冻，留个返回分支即可

### 1.2 产品定位（一句）

> **QRClaw = zimzheng 的本机多 agent 控制台，主 Chat 是"和 4 个本地 CLI 同时对话"，副分支保留"被访客 QR 触达"。**

对照 Multica：Multica 是 team/multi-tenant 的协作工作台，QRClaw 不抄它的组织模型，只抄它的**交互范式**（左栏 agent 列表 / 右栏私聊 / 底层能力绑定 / 立即可聊）。

### 1.3 3 个月目标（推荐）

| 月 | 目标 | 成功判据 |
|---|------|---------|
| M1 | 本机 4 个 CLI（openclaw/claude/cursor/codex）自动发现 + 一键 Chat | zimzheng 打开 dashboard，5 秒内看到 4 个 agent 在线，点一个就能流式对话 |
| M2 | agent 之间能"转交任务"（手动触发，gateway 转消息，不解读语义） | agent A 说"交给 B 处理" → UI 显示 ready-to-forward，一键转发到 B 的私聊 |
| M3 | 笔笔省 workspace 绑定：4 个 agent 共享一个 project workdir，各自记忆独立 | zimzheng 能在 Chat 里说"帮我改 笔笔省 的记账页"，由 agent 各自去处理，输出可被 merge |

M1 是本轮 Wave 10 的核心；M2/M3 是后续 wave。

---

## 2. Multica 能力拆解

Multica 的关键能力（从现有调研和产品需求文档反推）：

| 能力 | QRClaw 必须 | 可延后 | 永远不做 |
|------|:-----------:|:------:|:--------:|
| 左侧 Agent 列表 + 私聊主会话 | ✅ | | |
| Agent 绑定底层执行器（claude/cursor/codex/openclaw） | ✅ | | |
| 本地 CLI 自动发现 | ✅ | | |
| Instructions / Suggested Prompts | ✅ (简版) | | |
| Markdown 流式渲染 + 代码块 | ✅ | | |
| 文件/图片上传 | | ✅ (M2) | |
| 语音通话 / TTS | | | ✅ (不做) |
| Agent Market / 插件市场 | | | ✅ (zimzheng 不需要) |
| 多租户 team 协作 | | | ✅ (单人用) |
| Agent 群聊 / 多 agent 一个话题 | | ✅ (M2 手动转) | |
| Skills / Env / MCP 编排 | | ✅ (M3) | |
| Run Timeline / tool call 可视化 | | ✅ (M2) | |
| Publish as QR / 对外访客入口 | | ✅ (复用 wave 5-9 visitor) | |

**结论**：Multica 30% 能力就够覆盖 zimzheng 的需求。不要被它的 UI 体量吓到去做"功能对等"。

---

## 3. 技术栈风险

### 3.1 Next 16 ↔ LobeChat Next 14

**风险等级**：高（整换路线）/ 低（组件抽取）

- QRClaw web 已经在 Next 16 + React 19 + Tailwind v4 + App Router。
- LobeChat 按 Next 14 心智组织，其内部依赖（ant-design、antd-style、pro-editor）并未全面验证 React 19 并发行为。
- 真实痛点不是"能不能构建"，而是**"每次 upstream sync 解冲突**的成本：LobeChat 每周 5-10 个 commit，RSC boundary、middleware、server actions 都可能改动。

**建议**：不 sync upstream。把 LobeChat 当"已经证明可行的实现参考"，本地重写关键组件并 vendor 最小依赖（react-markdown + remark-gfm + rehype-highlight + remark-math + rehype-katex）。bundle 可控，React 19 兼容由我们自己验证。

### 3.2 Supabase ↔ LobeChat 默认 ORM

LobeChat 默认 Drizzle + 自建 `lobechat-*` 表（client/server 双模式）。QRClaw 是 Supabase + RLS + Edge Function。**这两套 persistence layer 不能共存**。

**建议**：LobeChat 的 `store/session/topic/message` 全部不引入。只抽取其**纯 UI / 渲染组件**（Conversation 气泡、ChatInput、Markdown renderer）。凡是带 store/service/provider/runtime 字样的代码都不进来。

### 3.3 C2 加密 vs SSE 明文传输（最关键）

**铁律 C2 v1.3 原文**："明文只存在于两处：(a) 端侧客户端；(b) 已授权的 Edge Function 内存态——不落盘、不写日志、函数结束即释放缓存"。

**SSE over Gateway** 的新路径：
```
Host → Gateway [明文 delta in memory] → Browser
                ↓
          [encrypt + persist]
```

Gateway 现在**确实**看到明文 delta，但这**本来就合规**——因为 Gateway 在 Wave 5-9 已经是**写路径**的明文处理点（持 KEK 加密新消息）。SSE 只是延长了明文在 Gateway RAM 里停留的时间（从"写入瞬间"变成"整个 run 期间 ~秒级"）。

**但有三个硬护栏必须加进 SSE 实现**：

1. **不落日志**：Gateway SSE 路由**禁止** `logger.info({content: ...})`、`console.log(chunk)`。只记 `run_id`, `seq`, `bytes`。
2. **不落盘临时缓冲**：Node stream backpressure 的 drain buffer 是内存 Buffer，OK；但禁止写 tmpfile、禁止 gzip 落 disk cache、禁止 nginx 中间层 buffering（`X-Accel-Buffering: no` 必须设置，Q2 评估已经写了——✅）。
3. **不做读路径 SSE resume**：任何"从 `content_encrypted` 解密后通过 SSE 重放"的行为**直接破 C2**——解密必须走 `decrypted-messages` Edge Function，不能在 Gateway 做。Q2 §9 已明确——✅。

**我这里追加一条 Q2 没覆盖的**：SSE 断线重连的 `Last-Event-ID` header 如果被 Gateway 误解析为"重放入口"，会诱导开发者加"从 DB 解密"逻辑。**建议显式写死**：Gateway 收到 `Last-Event-ID` 一律忽略，强制客户端走 `decrypted-messages` 回放。

**结论**：SSE 和 C2 可以共存，但需要把 **"Gateway 禁止读路径解密"** 作为**成文护栏**写进 Wave 10 acceptance，不能靠开发者自觉。

### 3.4 OpenAI SSE 协议 vs QRClaw 自有 run event 协议

Q2 建议把 `owner_agent_run_event` WS → OpenAI SSE 单向流。这在产品体验上是对的，但有两个次级风险：

- **thinking / tool_use 丢失**：OpenAI SSE 只表达 `delta.content`。QRClaw 现在的 `event_type=thinking|tool_use|tool_result` 如果统一压成 content，调试和 replay 会失去结构。Q2 §4 说"默认不发"——同意，但**必须落盘**（`owner_agent_run_events` 已存，继续存，只是不走 SSE）。
- **cancel 语义**：OpenAI 客户端常用"断开连接=cancel"。Q2 §10 推荐默认不 cancel，走显式 POST。**同意**。但要注意：LobeChat fork 进来后如果默认行为是 abort on unmount，要在 LobeChat 那侧 patch 掉。

---

## 4. Wave 5-9 成果保留度

一个一个过：

| 投入 | Pivot 后价值 | 保留度 | 理由 |
|------|-------------|:------:|------|
| Gateway 中立中继 + 加密写路径 | **核心保留** | 95% | 就是新主线的必要基础 |
| Supabase `owner_agent_*` schema + Edge Function `decrypted-messages` | **核心保留** | 100% | 加密读路径不需动 |
| Host WebSocket 协议（accepted/event/completed/failed） | **核心保留** | 100% | Q2 明确 Host WS 继续用，只换 Owner 面 |
| OpenClaw Channel Plugin（M0-M4） | **保留** | 90% | 作为 4 个 agent 之一继续存在 |
| Go adapter | **保留** | 70% | 如果走 openai SSE，adapter 只负责 host→gateway WS，不动 |
| Owner WS run-event fanout（HEL-57） | **废弃** | 20% | SSE 替换后退役，Q2 §6 已说明 |
| `owner-agent-chat-store` 的 `waitForRunReply` 轮询 | **废弃** | 0% | SSE 替换 |
| `web/chat/page.tsx` 现有气泡 | **重写** | 30% | 用 LobeChat 抽取的组件替换，但 store 保留 |
| `agents/page.tsx` 创建向导 | **保留** | 85% | UI 可润色，核心流程（name/provider/execution_mode/host token）对新 pivot 完全成立 |
| Visitor/QR 链路 | **冷冻保留** | 100% | 作为 Path C 的次分支，0 改动 |

**总评**：**约 75-80% 的 Wave 5-9 投入在 pivot 后仍是战略资产**。真正要退役的只有 Owner 前端的"run-event WS 消费 + 轮询"这两块——本来就是 Wave 9 为了凑时序临时打的 patch。

**这个数字很重要**：说明 pivot 不是"重来"，是"把新的产品壳扣在已经跑通的协议地基上"。

---

## 5. 独立的红线总结

给 Wave 10 执行 agent 的三条不可破红线：

1. **C2 护栏成文**：Gateway SSE 路由禁止日志明文；禁止 `Last-Event-ID` 触发的 DB 解密；resume 一律走 Edge Function。
2. **LobeChat 只抽 UI 层**：带 store/service/provider/runtime 字样的代码一概不 vendor。Drizzle、agent-runtime、i18n-store、plugin-store **全部不进来**。
3. **Host WS 协议冻结**：Wave 5-9 已稳的 `owner_agent_run_*` frames 不因 SSE 改造而改字段。Gateway 内部 host-router 的 `handleRunEvent` 在持久化**之后**再推送给 SSE sink（顺序：encrypt → persist → publish → ack），保 C5 replay 的正确性。
