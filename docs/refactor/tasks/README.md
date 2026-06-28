# Trae Agent 任务卡索引

> 本目录存放可被 Trae Agent（或其他 coding agent）独立执行的重构任务卡。
> 所有任务卡遵循同一格式，由 **当前 active 计划** 驱动。
>
> **当前计划**: [`../refactor-plan-phase1.md`](../refactor-plan-phase1.md) v2.0（路线 A，最小可行重构）
> **长期蓝图**: [`../refactor-plan.md`](../refactor-plan.md) v1.0（archived，当前不 active）

---

## 📋 active 任务卡（路线 A）

| ID | 标题 | 状态 | 前置 | 工期 | 可执行者 |
|---|---|---|---|---|---|
| [T-Spike](./T-spike-contract-interop.md) | Deno↔Node 契约互通验证 | 🟢 **可立即执行** | — | 0.5-1 天 | Trae |
| T-WS (待撰写) | WebSocket 契约 SSOT + 漂移对齐 | ⏳ 等 T-Spike 完成 | T-Spike | 2-3 天 | Trae |
| T-CI (待撰写) | CI 增量补丁 | ⏳ 可与 T-WS 并行 | — | 1-2 天 | Trae/Human |
| T-Map (待撰写) | qrclaw-map 补充型 skill | ⏳ 等 T-WS 完成 | T-WS | 1-2 天 | Trae |

**下一个可执行的任务是 `T-Spike`。**

---

## 📦 长期蓝图任务卡（archived）

以下任务卡对应 v1.0 长期蓝图，**当前路线不使用**，保留以备未来触发式 roadmap 启用：

| ID | 标题 | 状态 |
|---|---|---|
| [T0-audit](./T0-audit.md) | 全量现状审计（v1.0 Phase 0） | 🟡 **archived** — 路线 A 不做全量审计，若未来切回 v1.0 蓝图再启用 |

---

## 🎯 任务卡通用规范

### 格式模板

```markdown
# T-{Slug}: {任务标题}

> **计划**: ../refactor-plan-phase1.md（或其他）
> **前置**: {任务}
> **预计工期**: X 天
> **执行者**: Trae Agent / Human
> **Human Checkpoint**: 是/否（及位置）

## 目标
## 上下文
## 详细步骤
## 交付物
## 验收标准
## PR 规范
## 风险与回退
```

### 分支命名

```
refactor/{task-slug}
```

示例：
- `refactor/spike-contract-interop`
- `refactor/ws-contract-ssot`
- `refactor/ci-patch-supabase-check`

### Commit 规范（Conventional Commits）

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

允许的 type：
- `feat`: 新增功能
- `fix`: bug 修复
- `refactor`: 重构（不改行为）
- `spike`: 探索验证
- `docs`: 文档
- `chore`: 杂项（依赖、配置）
- `test`: 测试
- `ci`: CI/CD

示例：
```
spike(contracts): verify Deno-Node schema interop via deno.json imports

Validates that a Zod schema in shared/contracts/ws can be imported by
web, gateway and a Supabase Edge Function simultaneously.

Result: approach A (deno.json imports map) succeeded.

Refs: docs/refactor/tasks/T-spike-contract-interop.md#step-5
```

### PR 描述模板

```markdown
## 任务
- 任务卡: `docs/refactor/tasks/T-{slug}.md`
- 计划: `docs/refactor/refactor-plan-phase1.md`（路线 A）
- 前置: T-{prev} (#PR_NUMBER)

## 变更摘要
<3-5 句>

## 交付物
- [ ] ...

## 验收结果
<贴验收命令输出>

## 待 Human 审批事项
<如有>

## 风险提示
<如有>
```

---

## 🚦 执行流程

```
Human 审核任务卡
      ↓
将任务卡内容 + 启动 Prompt 派发给 Trae
      ↓
Trae 创建分支 → 按步骤执行 → 逐步 commit
      ↓
Trae 本地跑验收命令 → 全绿后发起 PR
      ↓
GitHub CI 跑（tests / web-lint / gateway-lint）
      ↓
Human Review + Merge
      ↓
下一个任务
```

---

## 🛡️ 安全边界（Guardrails）

| 红线 | Trae 可否执行 |
|---|---|
| 修改 `shared/contracts/`（production 契约） | ⚠️ 按任务卡指示 |
| 修改 `supabase/migrations/*` | ❌ |
| 修改 `.github/workflows/*` | ⚠️ 仅 T-CI 允许 |
| 删除测试文件 | ❌ |
| 修改 `package.json` 核心依赖版本 | ⚠️ 需 Human 审核 |
| 升级 Zod、Next.js、React 等主版本 | ❌ 必须 Human 决策 |
| 直接 push 到 main | ❌ |
| 自动 merge PR | ❌ |
| 测试失败时修改测试而非代码 | ❌ |

---

## 🚀 启动 Prompt（派给 Trae 时复制）

当要把 `T-Spike` 派给 Trae，**复制以下整段**发送：

```
你是 QRClaw 重构项目的执行 Agent。请执行以下任务：

项目背景：
- 仓库：qrclaw（web + gateway + supabase 三段 monorepo）
- 当前重构路线：路线 A（最小可行，~1.5 周）
- 本任务是路线 A 的第一个任务：Deno↔Node 契约互通 Spike

执行流程：
1. 阅读 active 计划：docs/refactor/refactor-plan-phase1.md
2. 阅读任务卡总规范：docs/refactor/tasks/README.md
3. 阅读本次任务：docs/refactor/tasks/T-spike-contract-interop.md
4. 严格按任务卡"详细步骤"执行
5. 每完成一步（如 Step 2/3/4/5/6），在分支 commit 一次，commit message 遵循 Conventional Commits
6. 执行完后在本地跑"验收标准"中的所有命令，全部通过后再发 PR
7. PR 标题、分支名、描述按任务卡规范撰写

禁区（任何情况下都不可做）：
- 不修改 gateway/src/ws/schemas.ts（留给 T-WS）
- 不修改 web/src/types/ws.ts（留给 T-WS）
- 不修改 .github/workflows/ci.yml（留给 T-CI）
- 不升级 Zod、Next.js、React 的主版本
- 不直接 push 到 main
- 不自动 merge PR
- 测试失败时只改代码不改测试

遇到不确定的决策（特别是：Zod 版本不统一需要升级？Supabase CLI 版本过旧？方案 ABC 全失败？）：
→ 停止执行，在 PR 描述"待 Human 审批事项"列出问题，等我回复后再继续。

分支名：refactor/spike-contract-interop
PR 标题：spike: Deno-Node contract interop verification

本任务核心是产出 docs/refactor/spike-report.md，
即使三种方案全失败，完整记录证据也算任务完成（由 Human 决策后续）。

开始执行 T-Spike。
```

---

## 📝 任务卡撰写约定

- 一次只撰写 **下一个** 可执行任务卡（当前 + 最多下一个）
- 后续任务卡根据前置产出再补充（避免过度规划）
- 每个任务卡必须含：**至少 3 条可自动验证的验收命令**
- 撰写人需对任务卡"可独立执行性"负责（Trae 不需要额外上下文就能完成）
