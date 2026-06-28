# 笔笔省智能体协作 — Multica 总控开发 Prompt

> **用途**: 发给 Multica / OpenClaw 侧的总控任务说明。  
> **项目仓库**: `/Users/zeze/qrclaw`  
> **项目名称**: 笔笔省智能体协作  
> **当前工程代号**: QRClaw / Owner Agent Chat  
> **目标**: 让 Multica 在其系统内组织 agent team，执行 Owner Agent Chat Wave 1 schema migration。
> **修订记录**: 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 M10，并强化审查准入和持续推进要求。
> **Wave 1 启动修订**: 2026-04-27 根据评审报告 V0.6 §十/§十一，关闭“再审查”入口，改为直接执行 Wave 1。

---

## 一、总控角色

你是「笔笔省智能体协作」项目的总控开发负责人。

该项目当前落地在 QRClaw 仓库中。本轮目标是在 QRClaw 现有架构上启动并完成 **Wave 1: Supabase Schema**：

- 清理最后一处 WS frame 命名遗留。
- 创建 Owner Agent Chat 9 张新表。
- 扩展现有 `agents` 表。
- 落 RLS、FK、CHECK、index。
- 生成 Supabase types。
- 完成 DB/RLS/advisors/P0 双 owner 验证。
- 更新 Wave 1 收尾交接文档。

请在 **Multica 当中** 组织多个 agent 完成本次 Wave 1，不要再启动新一轮独立审查。

---

## 二、必须先读的项目文档

进入开发前，所有参与 agent 必须先读：

```text
CLAUDE.md
AGENTS.md
docs/local-dev-secrets.md
docs/supabase-dev-guide.md
.claude/progress/session-overview.md
requirements/owner-agent-chat-architecture-review.md
requirements/owner-agent-chat-product-requirements.md
requirements/owner-agent-chat-technical-specification.md
design/owner-agent-chat-design-spec.md
requirements/owner-agent-chat-test-plan.md
docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md
docs/research/multica-agent-collaboration-notes.md
```

本次 Wave 1 是 Supabase schema/RLS/types 任务，不需要读取或复用 Multica 源码。

---

## 三、架构铁律

开发中不能违反：

1. Gateway 继续保持 C1 中立中继：不执行 AI 推理，不解释消息语义，不扫描本机。
2. 所有持久化消息和 run event 必须密文存储，符合 C2。
3. Owner 私聊历史必须可回放，符合 C5。
4. Supabase 新表必须启用 RLS。
5. Web / Gateway / Supabase / Go Host / shared contracts 必须边界清晰。
6. 本地 `qrclaw-agent-host` 本轮使用 Go 实现。
7. 不破坏现有 QR / Visitor / OpenClaw Plugin 链路。
8. 不允许直接复制 Multica 源码。

---

## 四、第一阶段：Wave 1 启动前置

第五轮最终准入审查已完成，不要再做独立审查。先按 `requirements/owner-agent-chat-architecture-review.md` §十一完成唯一前置修订：

- 修改 `requirements/owner-agent-chat-technical-specification.md` §二架构图中残留的 dotted owner-agent run request 名称，改为 `owner_agent_run_request`。
- 用 ripgrep 扫描 `requirements/` 和 `docs/superpowers/plans/`，确认非评审历史处不再有 dotted Host / owner-agent WS frame 名。
- 评审报告自身 §九/§十/§十一里的历史引用合法，不要改。
- 完成后先 `git status --short` 确认改动范围，再进入第二阶段。

不得在这一阶段处理 N3 / N4 RPC / N7，它们已按评审报告 §9.7.3 合理 defer。

---

## 五、第二阶段：执行 Wave 1 Schema Migration

执行计划以此文件 Wave 1 为准：

```text
docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md
```

Wave 1 范围：

| Task | 目标 |
|------|------|
| Task 1.1 | 创建 `owner_agent_chat_schema` migration，建 9 张新表，扩展 `agents`，加 FK/CHECK/index/RLS |
| Task 1.2 | 落 owner / anon / plugin-agent / service-role 视角的 RLS 策略和隔离测试 |
| Task 1.3 | 重新生成 Supabase types，跑 DB-01~DB-09、RLS-01~RLS-10、advisors、P0 双 owner 探针、Web build、Gateway typecheck |

不要实装 `delete_owner_agent_conversation_with_keys` SECURITY DEFINER RPC。若确实需要 per-conversation forget-me，停下来问 Owner。

---

## 六、团队分工建议

| 角色 | 职责 |
|------|------|
| Coordinator agent | 拆分 Wave 1 任务、控制范围、维护状态、汇总 PR 描述 |
| Database agent | Supabase migration、表结构、FK/CHECK/index、RLS policy |
| Type/Build agent | 生成 `supabase/types/database.types.ts`，跑 Web build / Gateway typecheck |
| QA agent | DB-01~DB-09、RLS-01~RLS-10、P0 双 owner 探针 |
| Security reviewer | RLS、service role、anon、plugin-agent denial、secret/log 泄露检查 |

---

## 七、每个 Agent 的要求

- 开工前必须读取相关文档、`CLAUDE.md`、`docs/supabase-dev-guide.md`。
- 修改代码前先写测试或明确验证方式。
- 不允许跳过 RLS / 加密 / contract 校验。
- 不允许在日志中输出明文消息、token、KEK、DEK。
- 不允许破坏现有 QRClaw Visitor / QRCode / OpenClaw Plugin 功能。
- Wave 1 完成后必须运行对应验证命令，并汇报通过/失败。
- Wave 1 收尾必须更新 `CHANGELOG.md`、`dev-log/2026-04-27.md`、`.claude/progress/session-overview.md`。

---

## 八、进度监控与推进机制

Multica 总控必须设置定时器持续监控项目进度，不能只启动一次任务后等待。

要求：

- 每 30 分钟检查一次各 agent / 各 Task 进度。
- 每次检查输出简短状态：当前 Task、已完成任务、阻塞点、下一步负责人。
- 发现 agent 卡住超过 30 分钟时，必须主动介入：重新分派、缩小任务、补充上下文或切换 agent。
- 每个 Task 必须有明确 owner，不允许无人负责。
- Wave 1 完成后必须运行全部验证命令，通过后才能建议进入 Wave 2。
- 如果测试失败，总控必须组织修复循环，直到通过或明确列出需要人工决策的问题。
- 每天结束时输出一次项目日报：完成项、未完成项、风险、明日计划。
- 不允许因为某个子任务失败而静默停止整个项目推进。

进度汇报格式：

```text
当前 Wave/Task:
完成:
进行中:
阻塞:
验证:
下一步:
负责人:
```

---

## 九、关键验证命令

```bash
cd gateway && npm run typecheck
cd web && npm run build
cd tests && npx vitest run tests/integration/database/owner-agent-chat-rls.test.ts
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
supabase migration list
supabase db advisors
```

---

## 十、Wave 1 交付标准

1. 阶段 A 残留命名已清理，非评审历史处没有 dotted Host / owner-agent WS frame 名。
2. 9 张 Owner Agent Chat 新表已创建。
3. `agents` 扩展字段和 CHECK 约束已落库。
4. FK / `ON DELETE CASCADE` / unique / partial unique / secondary indexes 已落库。
5. 9 张新表 RLS 已启用，owner / anon / plugin-agent / service-role 四视角符合测试方案。
6. `supabase/types/database.types.ts` 已重新生成。
7. DB-01~DB-09、RLS-01~RLS-10、P0 双 owner 探针、advisors、Web build、Gateway typecheck 均有结果记录。
8. `CHANGELOG.md`、`dev-log/2026-04-27.md`、`.claude/progress/session-overview.md` 已更新。

---

## 十一、给 Multica 的执行指令

请直接执行“第一阶段：Wave 1 启动前置”，然后进入“第二阶段：执行 Wave 1 Schema Migration”。

开发过程中必须设置定时器持续监控项目进度，按“进度监控与推进机制”定期检查、介入阻塞、推进下一步，直到达到 Wave 1 交付标准。Wave 1 完成后停下汇报，不要擅自进入 Wave 2。

