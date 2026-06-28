# Wave 10 R3 蓝图审查

> 输入: `r2-full-architecture-blueprint.md`、C1/C2/C3/C4/C5/C6 R2 定版文档  
> 结论: 原 9 Sprint 无显式循环依赖, 但包含 3 个过早放入 Wave 10 的 P2/M3 能力。建议压缩为 6 个建设 sprint + 1 个收口 sprint。

## 1. 总结判断

原蓝图方向正确: Runtime / Agent / Session 三层、assistant-ui + OpenAI SSE、默认 4 agent、rename-first migration、真 runtime E2E 都和 R2 主线一致。

必须修正的点:

1. **S1 的双模/SQLite 与 C2 定版冲突**。C2 明确 Wave 10 保留 Supabase, 本地 Supabase 或 SQLite 后置 Wave 11+。因此 S1 不应做 Drizzle 双 dialect、sqlite chmod、cloud/local 切换。
2. **原 182 人日对“完整版 1.0”成立, 不适合当前 zimzheng 自用 + cursor 加速节奏**。可交付范围应收敛到 P0/P1-lite, 约 42-55 人日。
3. **Voice 放 P1 可以, 但只能是 push-to-talk lite**。Always-on wake word、LiveKit/OpenAI realtime、完整语音 agent 都应后置。
4. **Collab / Workflow / Notion / Cloud sync 是 M3+ 能力**。如果放进 Wave 10 主干, 会拖慢 chat 核心闭环并增加切换成本。

## 2. 依赖审查

### 2.1 显式 DAG

原依赖:

```text
S1 -> S2 -> S3 -> S4 -> S5 -> S7 -> S8 -> S9
      |           |
      +-> S6      +-> S8
```

结论: **无循环依赖**。

### 2.2 隐含依赖问题

| 问题 | 影响 | 修正 |
|---|---|---|
| S1 同时做 Supabase + SQLite 双模 | 与 C2 决策冲突, 拉长地基 | Wave 10 只做 Supabase rename-first |
| S6 Voice 只依赖 S2 | 实际还依赖 Host IPC、权限、音频错误态 | 放到 chat/session 稳定后做 lite |
| S8 Notion / cloud sync 依赖不只 S5/S7 | 还依赖存储同步、权限、OAuth | 移出 Wave 10 |
| S9 才做 onboarding 打磨 | C5 要求首屏从第一天对齐 | Onboarding 必须进入 S1/S2 验收 |

## 3. 能力对齐审查

| 蓝图能力 | 对齐情况 | 审查意见 |
|---|---|---|
| Runtime | 对齐 C1/C5 | 四槽位、5s detect、版本显示正确 |
| Agent | 对齐 C1/C5 | 保留轻量 Agent 是正确决策 |
| Session | 对齐 C1/C5 | rename-first、去唯一约束正确 |
| Chat | 对齐 C3/C4 | assistant-ui + OpenAI SSE 是主路径 |
| Voice | 部分对齐 | C3 只把语音作为独立高复杂层, C6 未覆盖语音用例 |
| Collaboration | 方向对, 粒度过大 | 手动转交可做, Workflow DSL 后置 |
| Workspace | P1 合理 | 先做 cwd binding + AGENTS 注入, Git worktree 后置 |
| Tools | P1 合理 | tool card / bash / diff 可与 attachments 合并 |
| Storage | **不对齐 C2** | Wave 10 不做 SQLite / Drizzle 双模 |
| Quality | 对齐 C6 | 但 E2E 数量应随压缩版重排, 不追 35 全量 |

## 4. 估工校正

### 4.1 原估工问题

原 182 人日把本地双模、Notion、cloud sync、workflow DSL、完整 voice、release packaging 全塞进 Wave 10。这个估工不是低估, 而是范围过大。

在 zimzheng 自用 + cursor 加速场景:

- UI boilerplate、文档、测试骨架可提速 30-50%。
- DB migration、C2 加密、真 CLI E2E、Host 状态机不可线性提速。
- 单人并行能力有限, sprint 切换成本会抵消一部分 agent 加速。

建议目标:

| 范围 | 估工 | 说明 |
|---|---:|---|
| P0 可用闭环 | 18-24 人日 | runtime/default agent/chat/session/replay |
| P1-lite 完整体验 | 24-31 人日 | attachments/tool card/workspace/voice lite |
| 收口与验收 | 6-10 人日 | E2E、C2 guard、perf、onboarding |
| 合计 | 42-55 人日 | 约 6-7 个小 sprint |

## 5. 最终 Sprint 排期

### Sprint 1 - Foundation, 今天可动工

目标: 让 Wave 10 有可迁移的数据地基和首屏 4 agent 心智。

交付:

- `agent_runtimes`
- `agents.runtime_id / is_default / source`
- `owner_agent_conversations` rename-first 到 `owner_agent_sessions`
- 去掉 `(owner_id, agent_id)` 唯一约束
- `ensureDefaultAgents(owner)` 幂等逻辑
- `/chat` 首屏 4 槽位读取真实/占位状态

估工: 3-4 人日。  
12pm 判断: **今天可以开工, 但只能交付 S1 的 migration SQL / schema diff / 最小接口骨架, 不应承诺完整 S1 闭环当天完成。**

### Sprint 2 - SSE Chat Core

目标: 真 runtime 单轮流式聊天可用。

交付:

- `POST /api/owner/agents/:agentId/chat`
- `/v1/chat/completions` alias
- Host WS -> OpenAI SSE bridge
- assistant-ui runtime adapter
- Markdown GFM / code highlight / cancel / regenerate
- C2 no-plaintext log guard

估工: 6-8 人日。

### Sprint 3 - Attachments + Tool Cards

目标: 文件、图片、基础 tool 可视化进入 chat 主路径。

交付:

- attachment upload + file/image message parts
- PNG/PDF/TXT P1 流程
- image preview
- tool call cards: file_read / file_write / bash
- Monaco diff viewer for file_edit

估工: 6-8 人日。

### Sprint 4 - Session + Agent 管理

目标: 多 session 不串线, Agent 可编辑, C5 replay 稳定。

交付:

- session create/switch/rename/archive
- encrypted history reload
- agent edit / import-export lite
- session search by title first, content search 后置
- P0/P1 E2E 迁入新编号

估工: 7-9 人日。

### Sprint 5 - Workspace + Approval

目标: 自用 coding 场景能绑定 repo, agent 在正确 cwd 工作。

交付:

- workspace CRUD lite
- session/agent 绑定 workspace
- host spawn 注入 cwd
- 自动读取 `AGENTS.md` / `CLAUDE.md`
- Git status 只读展示
- tool approval deny/approve

估工: 7-9 人日。

### Sprint 6 - Voice Lite + Collaboration Lite

目标: 补齐差异化体验, 但不引入 realtime 平台级复杂度。

交付:

- push-to-talk Web Speech API
- macOS `say` TTS
- transcript 入同 message pipeline
- "新建 session / 归档当前" local intent
- 手动转交给另一个 agent
- parallel fan-out 双栏对比 lite

估工: 6-8 人日。

### Sprint 7 - Hardening + Release

目标: 把可用版本收口, 不再加新能力。

交付:

- C6 P0 全绿, P1 选 10-12 个关键用例
- C2 guard: DB 密文、日志无明文、Last-Event-ID 不解密
- cold start 5s runtime 亮槽位
- 10k token 回复不掉帧
- onboarding 三态打磨
- user/dev docs

估工: 7-9 人日。

## 6. 压缩建议

### 立即从 Wave 10 移出

| 能力 | 去向 | 原因 |
|---|---|---|
| SQLite / Drizzle 双模 | Wave 11 | C2 已决策 Wave 10 保 Supabase |
| Notion workspace adapter | M3+ | OAuth / page tree / block ref 复杂度高 |
| Cloud sync | Wave 11+ | 存储同步与冲突解决不属于 chat 可用闭环 |
| Workflow DSL | M3+ | 先做手动转交和 fan-out |
| Always-on wake word | M3+ | 权限、隐私、耗电、误触发都需单独设计 |
| Share editable session | M3+ | 权限和 C2 风险高 |

### 合并原 Sprint

| 原 Sprint | 新归并 |
|---|---|
| S1 Foundation | 新 S1, 但删双模 |
| S2 Chat | 新 S2 |
| S3 Attachments + S8 工具一部分 | 新 S3 |
| S4 Session + S5 Agent 一部分 | 新 S4 |
| S5 Workspace + tool approval | 新 S5 |
| S6 Voice + S7 Collab lite | 新 S6 |
| S9 Polish | 新 S7 |

## 7. 最终建议

采用 **7 sprint 排期**。如果必须进一步压到 6 sprint, 合并 Sprint 6 到 Sprint 7, 但 Voice 只保留输入 transcript, TTS 和 collaboration 全部后置。

Wave 10 的成功标准应从"10 维全量 1.0"改为:

1. 默认 4 agent 可见且可点。
2. 真 runtime chat 流式可用。
3. 多 session 加密回放稳定。
4. 文件/图片/基础 tool 可视化可用。
5. workspace cwd 绑定能服务 zimzheng 自用 coding 场景。
6. C1/C2/C4/C5 铁律不破。

这版能今天从 S1 migration 开始, 也能把 9 sprint 切换成本降到 6-7 个明确闭环。
