# bibisheng-agent-chat — Runtime / Agents / Progress 实施计划（Multica 复用优先）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` 按 Phase 逐步实施；每 Phase 结束跑 ECC 验证循环。
>
> **版本:** 2026-06-23  
> **状态:** 已锁定 — 待执行 agent 开工  
> **仓库:** `/Users/zeze/bibisheng-agent-chat`  
> **Multica 参考仓:** `/Users/zeze/multica`（只读对标 + 源码拷贝，不整包依赖）

---

## 0. 文档目的

本文档整合以下讨论结论，供**下一个 agent 直接开工**，无需再对齐需求：

1. **架构方案 3**：Runtime（本机能力）+ Agent（逻辑人格）双页，Progress 看板 + 独立任务详情。
2. **Multica 复用优先**：能 copy/adapt 的 UI 与纯逻辑直接从 `packages/views/` 搬，不重复造轮子；后端走 QRClaw Gateway adapter，不引入 `@multica/core`。
3. **Agent 展示名方案 C**：系统默认 agent 用 provider 短名；用户自建 agent 用自定义名。
4. **看板 agent task 可见性**：修复「测试时 Progress 看不到真实 agent 任务」的产品缺口。
5. **ECC 验证**：系统 Chrome + Playwright（`channel: 'chrome'`），禁止 Cursor 内置浏览器。

---

## 1. 产品决策（已锁定）

| # | 决策 | 说明 |
|---|------|------|
| D1 | 走 **方案 3** 双页架构 | `/runtimes` + `/agents` 分离；Progress 独立 |
| D2 | **Multica Reuse-first** | 每个 UI 任务先查 multica 源文件，能 copy 不自研 |
| D3 | Agent 名称 **方案 C** | 默认 agent：`OpenClaw` / `Claude Code` / `Cursor` / `Codex`；自建 agent 用 `agent.name` |
| D4 | 「导入本地 agent」 | **非文件导入**；口径 = 安装 CLI → daemon 检测 → Runtime 上线 → Agent 可用 |
| D5 | 无开发者文案 | 禁止 `dev-up.sh`、`Multica daemon`、`bash scripts` 等出现在 UI |
| D6 | Progress P0 | 看板卡片 + 详情 Activity 必须能看清 **哪个 agent** 开始/完成/失败（头像 + 短名） |
| D7 | Progress P2（可选） | `AgentLiveCard` 级实时 transcript 单独 epic，不阻塞 Phase 0–2 |

---

## 2. 目标架构

```text
Sidebar:  Chat | Agents | Runtimes | Progress | Profile

┌─────────────────────────────┐     ┌─────────────────────────────┐
│ Runtimes（本机能力层）        │     │ Agents（逻辑人格层）          │
│ qrclaw-agent-host daemon     │     │ 默认 4 agent + 用户自建       │
│ detect CLI → 注册 runtime    │────▶│ 绑定 provider / runtime     │
│ ProviderLogo、在线、CLI 版本  │     │ 头像、短名、instructions    │
│ 重新检测、安装提示            │     │ Settings / Connection Tab   │
└─────────────────────────────┘     └─────────────────────────────┘
              │                                    │
              └──────────────┬─────────────────────┘
                             ▼
                    Chat 发消息 / 手动建 Task
                             ▼
              Progress 看板（摘要卡片）→ /progress/[taskId] 详情
                             │
              Activity：头像 + agent 名 + 动作 + 评论(Markdown)
```

### 2.1 与 Multica 的对应关系

| Multica | bibisheng（目标） | 数据/API |
|---------|-------------------|----------|
| `packages/views/runtimes/` | `web/src/features/runtimes/` | `GET /api/owner/local-host/status` |
| `packages/views/agents/` | `web/src/features/agents/` | 现有 `owner-agents` + Zustand |
| Issue board + detail | `web/src/features/progress/` | Phase 0: localStorage；Phase 3: Supabase（可选） |
| Go server timeline API | Gateway 新路由或 Supabase 表 | **不复用** Multica Go server |

### 2.2 当前基线（2026-06-23）

| 模块 | 路径 | 状态 | 主要问题 |
|------|------|------|----------|
| Chat | `web/src/app/(dashboard)/chat/` | ✅ 可用 | `agent.name` 带 `Assistant`；头像资源缺失 |
| Progress 看板 | `web/src/features/progress/ProgressBoard.tsx` | ✅ MVP | localStorage；agent 归因弱；手工测试常「看不到 task」 |
| Progress 详情 | `web/src/features/progress/TaskDetailView.tsx` | ✅ MVP | Activity 无头像；文案重复 |
| Agents 列表 | `web/src/app/(dashboard)/agents/page.tsx` | ⚠️ 偏旧 | 无头像；host token 向导为主路径；无 Runtime 概念 |
| Agents 详情 | `web/src/app/(dashboard)/agents/[agentId]/` | ⚠️ 偏 QR | QR Tab 主导，非本地-first |
| Agents 编辑 | `web/src/app/(dashboard)/agents/[agentId]/edit/` | ⚠️ 仅 instructions | 缺 name/desc/avatar/连接态 |
| Runtimes 页 | — | ❌ 未建 | 后端 `local-host/status` 已有 |
| 头像资源 | `web/public/avatars/` | ❌ 不存在 | Gateway seed 指向 404 |
| 默认 agent 名 | `gateway/src/services/default-owner-agents.ts` | ⚠️ | `* Assistant` 与 UI 映射不一致 |
| 本机 host | `qrclaw-agent-host` + `ensure-daemon` | ✅ | 行为已 mirror multica CLI/daemon |

---

## 3. Multica 复用策略（强制）

### 3.1 原则

1. **Reuse-first**：每个 UI/逻辑任务先在 `/Users/zeze/multica/packages/views/` 找源文件。
2. **Adapter-not-fork**：禁止引入 `@multica/core`、`@multica/ui`、TanStack Query；数据改为 Gateway + Zustand hook。
3. **记录来源**：拷贝文件头部加 `// Adapted from multica/packages/views/...`；Phase 结束更新 `docs/multica-reuse-map.md`（本计划执行时创建）。
4. **Token 对齐**：Multica 的 Tailwind/shadcn 类名改为 QRClaw CSS 变量（`design/design-tokens.css`）。
5. **许可**：Multica 为修改版 Apache 2.0（见 `/Users/zeze/multica/LICENSE`）；单组织内部使用可 copy `packages/views/` 组件；保留版权注释。

### 3.2 不可整包依赖的原因

```text
@multica/views → @multica/core (Query/WS/api) → @multica/ui (shadcn)
                → Go server (/api/issues, timeline, task run)
```

bibisheng 栈：Next.js 16 + Gateway + Supabase + Zustand + 自有 token。整包接入 = 换栈，超出本计划范围。

### 3.3 复用分级矩阵

#### Tier A — 直接 copy / adapt（Phase 0–2 必做）

| Multica 源 | 目标路径（建议） | 改造要点 |
|------------|------------------|----------|
| `runtimes/components/provider-logo.tsx` | `web/src/components/agent/ProviderLogo.tsx` | 几乎零依赖，全站头像/logo |
| `agents/components/agent-list-item.tsx` | `web/src/features/agents/AgentListItem.tsx` | 换 token；status 接 `statusByAgent` |
| `agents/components/agents-page.tsx` | `web/src/features/agents/AgentsPage.tsx` | 去掉 Resizable 或简化为双栏 |
| `agents/components/agent-detail.tsx` | `web/src/features/agents/AgentDetail.tsx` | 先 port Instructions + Settings |
| `agents/components/tabs/instructions-tab.tsx` | 合并进 AgentDetail | 接现有 Monaco 或 textarea |
| `agents/components/tabs/settings-tab.tsx` | 合并进 AgentDetail | name/runtime 只读+可编辑字段 |
| `runtimes/components/runtimes-page.tsx` | `web/src/features/runtimes/RuntimesPage.tsx` | 数据 adapter |
| `runtimes/components/runtime-list.tsx` | `web/src/features/runtimes/RuntimeList.tsx` | |
| `runtimes/components/runtime-detail.tsx` | `web/src/features/runtimes/RuntimeDetail.tsx` | 安装提示改中文 |
| `issues/components/board-card.tsx` | `web/src/features/progress/TaskCard.tsx` | Link → `/progress/[id]` |
| `issues/components/issue-detail.tsx` | Activity 片段 | 只搬 `formatActivity` + timeline 分组 (~80 行) |
| `issues/components/comment-input.tsx` | `web/src/features/progress/TaskCommentInput.tsx` | 去掉 Tiptap，保留布局 |
| `issues/components/comment-card.tsx` | `web/src/features/progress/TaskCommentCard.tsx` | 只读用现有 `MarkdownRenderer` |

#### Tier B — 模式 + 薄封装

| 能力 | Multica 参考 | bibisheng 接法 |
|------|--------------|----------------|
| Actor 头像 | `common/actor-avatar.tsx` | 新建 `AgentAvatar`：内部 `ProviderLogo` + `getAgentDisplayName` |
| Timeline 模型 | `packages/core/types/activity.ts` | 扩展 `web/src/features/progress/types.ts` 对齐字段 |
| Runtime 创建 Agent | `create-agent-dialog.tsx` | 本地 v1 四默认 agent 已 seed；向导仅「高级/远程 host」 |
| Markdown 只读 | `readonly-content.tsx` | 已有 `MarkdownRenderer`，不搬 Tiptap |

#### Tier C — 仅借鉴，Phase 3+ / 不做

| 组件 | 原因 |
|------|------|
| Tiptap `ContentEditor` / `TitleEditor` | 依赖过重；MVP textarea + preview |
| `useIssueTimeline` + Go timeline API | 后端不同；用 Gateway/Supabase adapter |
| `agent-live-card.tsx` | 需 task run WS + 后端 API |
| `@multica/core` 全套 | 与 Zustand/Gateway 重复 |
| Multica daemon 本体 | 已有 `qrclaw-agent-host` |

---

## 4. 看板「看不到 Agent Task」— 根因与修复（Phase 0 P0）

### 4.1 根因表

| ID | 根因 | 用户可见现象 |
|----|------|--------------|
| R1 | Task 仅存 `localStorage`（`bibisheng.progress.tasks.v1`） | 换浏览器/清缓存/新 Playwright context → 看板空 |
| R2 | 自动 task 仅在 **Chat sendMessage** 时创建 | 只开 `/progress` 或只点 New task → 无 agent 来源 task |
| R3 | 列分布：`in_progress` → 完成进 `done` | 用户只看 Todo/Backlog 列以为没有 task |
| R4 | 卡片仅小字 `agentName`，无头像 | 有条目也不像「某个 agent 的任务」 |
| R5 | Chat 创建 task 后无引导 | 用户不知道要去 Progress 哪一列看 |
| R6 | `agentName` 含 `Assistant` 且无头像 | 难以识别 agent |

### 4.2 Phase 0 修复清单

- [ ] **P0-1** `getAgentDisplayName(agent)` — 方案 C，全链路替换展示名
- [ ] **P0-2** copy `ProviderLogo` + `AgentAvatar` 组件
- [ ] **P0-3** Progress 卡片：头像 + agent 短名 + 标题（adapt `board-card.tsx`）
- [ ] **P0-4** Activity：copy `formatActivity` 逻辑 + 头像行（adapt `issue-detail.tsx:1355-1400`）
- [ ] **P0-5** 去掉 activity 重复文案（如「OpenClaw OpenClaw 开始…」）
- [ ] **P0-6** Chat 发消息后轻提示「已加入 Progress」+ 链到 task（toast 或 badge）
- [ ] **P0-7** ECC：`3agents` 脚本断言看板 `cardCount >= 3` 且卡片含 agent testid

### 4.3 Phase 0 验收标准

1. **同一浏览器 context**：Chat 向 3 个 agent 发消息 → `/progress` → 看板 **≥3 张** 带 agent 头像/短名的卡片。
2. 卡片在 `In Progress` 或 `Done` 列可见（非空 localStorage 但 UI 无卡）。
3. 点击卡片 → `/progress/[taskId]` → Activity 显示 agent 开始/完成/失败。
4. `node tests/ecc-local-verify.mjs --send` 与 `node tests/ecc-local-verify-3agents.mjs` 均通过。

---

## 5. Agent 展示名（方案 C）

### 5.1 规则

```typescript
// 伪代码 — 实施时放入 web/src/lib/agent-display.ts
function getAgentDisplayName(agent: OwnerAgentSummary): string {
  if (agent.source === 'system_default' || agent.is_default) {
    return PROVIDER_DISPLAY_NAME[agent.backend_provider];
    // openclaw → OpenClaw, claude → Claude Code, cursor → Cursor, codex → Codex
  }
  return agent.name;
}
```

### 5.2 接入点

| 位置 | 文件 |
|------|------|
| Chat 左栏 / Header | `AgentListRail.tsx`, `chat/page.tsx` |
| Progress 卡片 / Activity / Assignee | `ProgressBoard.tsx`, `TaskDetailView.tsx`, `task-store.ts` |
| Agents 列表 / 详情 | Phase 2 agents feature |
| 自动 task 写入 | `owner-agent-chat-store.ts`（`agentName` 字段写 display name） |
| ECC 测试 | `tests/ecc-local-verify*.mjs` — 断言短名，非 `* Assistant` |
| Gateway seed（可选 Phase 1） | `default-owner-agents.ts` 改短名 + migration |

---

## 6. 分 Phase 实施

### Phase 0 — 看板 Agent Task 可见 + 身份基础（P0，1–2 天）

**Goal:** 不动大架构；Progress 必须稳定展示真实 agent task；Multica Tier A 组件落地。

| Task ID | 内容 | Multica 源 | 验证 |
|---------|------|------------|------|
| T0-1 | `getAgentDisplayName` + 全链路 | — | grep 无 UI 展示 `Assistant` |
| T0-2 | `ProviderLogo` + `AgentAvatar` | `provider-logo.tsx` | Chat/Progress 有 logo |
| T0-3 | Progress 卡片 agent 归因 | `board-card.tsx` | 看板卡片 testid |
| T0-4 | Activity timeline | `issue-detail.tsx` | 详情页 activity testid |
| T0-5 | 评论 UI | `comment-input/card.tsx` | ECC comment 步骤 |
| T0-6 | 更新 ECC 脚本 | — | 3agents pass |

**Files (create/modify):**

```text
web/src/lib/agent-display.ts                    # 新建
web/src/components/agent/ProviderLogo.tsx       # copy multica
web/src/components/agent/AgentAvatar.tsx          # 新建
web/src/features/progress/ProgressBoard.tsx       # 改
web/src/features/progress/TaskDetailView.tsx      # 改
web/src/features/progress/types.ts                # 扩展 TimelineEntry
web/src/features/progress/task-store.ts           # activity 结构化
web/src/stores/owner-agent-chat-store.ts          # agentName 用 display name
tests/ecc-local-verify.mjs
tests/ecc-local-verify-3agents.mjs
docs/multica-reuse-map.md                         # 新建，记录拷贝对照
```

---

### Phase 1 — Runtimes 页（本机能力层）（P0，2–3 天）

**Goal:** 产品化「本机识别 / 连接 / 重新检测」；对标 multica runtimes。

| Task ID | 内容 | Multica 源 |
|---------|------|------------|
| T1-1 | `/runtimes` 路由 + 侧栏（Agents 下或上） | `runtimes-page.tsx` |
| T1-2 | `mapLocalHostStatusToRuntimeDevice()` adapter | `RuntimeDevice` 类型对齐 |
| T1-3 | Runtime 列表 + 详情 master-detail | `runtime-list/detail.tsx` |
| T1-4 | 「重新检测」→ refresh status + ensure-daemon（local dev） | — |
| T1-5 | 安装提示（中文，来自 `RUNTIME_INSTALL_HINTS`） | `runtime-detail` 信息区 |
| T1-6 | `tests/ecc-local-verify-runtimes.mjs` | — |

**Gateway（可选扩展）:**

```text
GET /api/owner/local-host/status  # 已有
# 可选补充字段: display_name, cli_version, last_seen_at
```

**导航变更:**

```text
web/src/app/(dashboard)/layout.tsx
  Chat | Agents | Runtimes | Progress | Profile
```

---

### Phase 2 — Agents 页重构（逻辑人格层）（P0，2–3 天）

**Goal:** Multica 式双栏；编辑完整；弱化 QR/host token 主路径。

| Task ID | 内容 | Multica 源 |
|---------|------|------------|
| T2-1 | `/agents` 双栏 master-detail | `agents-page.tsx` |
| T2-2 | 列表项头像+在线 | `agent-list-item.tsx` |
| T2-3 | 详情 Tab: Instructions / Settings / Connection | `agent-detail.tsx` + tabs |
| T2-4 | 合并 `/agents/[id]/edit` → `?tab=instructions` | 现有 edit 页逻辑 |
| T2-5 | `/agents/[id]` QR 主导 → 降级或隐藏（本地 v1） | — |
| T2-6 | Connection Tab 链到 `/runtimes` 对应 provider | — |
| T2-7 | `tests/ecc-local-verify-agents.mjs` | — |

**Settings Tab MVP 字段:**

| 字段 | 可编辑 | 说明 |
|------|--------|------|
| 显示名称 | ✅ | 仅自建 agent；默认 agent 可选只读 |
| 描述 | ✅ | |
| Instructions | ✅ | Monaco/textarea |
| Provider | ❌ | 只读 + ProviderLogo |
| Runtime / 在线 | ❌ | 只读，链到 Runtimes |
| Avatar | P1 | 上传或 provider logo |

---

### Phase 3 — Progress 持久化 + Activity 增强（P1，2–4 天）

**Goal:** 解决 R1（localStorage 易丢）；对齐 Multica timeline 后端形状（adapter 实现）。

| Task ID | 内容 | 说明 |
|---------|------|------|
| T3-1 | localStorage key 加 `ownerId` 命名空间 | 登出清理 |
| T3-2 | `TimelineEntry` 对齐 multica `activity.ts` | type: activity \| comment |
| T3-3 | Supabase `owner_progress_tasks` + RLS | 可选但推荐 |
| T3-4 | Gateway CRUD `/api/owner/progress/tasks` | Chat send 写 DB |
| T3-5 | 完成/失败：agent 回复 Markdown 摘要块 | adapt multica comment 卡片 |
| T3-6 | P2 预留：`AgentLiveCard` epic | 需 task run WS |

---

### Phase 4 — 测试、文档、交接（持续）

#### 4.1 ECC 脚本矩阵（系统 Chrome，`channel: 'chrome'`）

| 脚本 | 覆盖 |
|------|------|
| `tests/ecc-local-verify.mjs --send` | Chat、搜索、Progress 看板、详情、评论 |
| `tests/ecc-local-verify-3agents.mjs` | 3 agent 真实对话 → task → 看板 ≥3 卡 → Activity |
| `tests/ecc-local-verify-runtimes.mjs` | **Phase 1 新建** — 四 provider + 重新检测 |
| `tests/ecc-local-verify-agents.mjs` | **Phase 2 新建** — 双栏 + 头像 + instructions 保存 |

**禁止:** Cursor 内置浏览器、`launchPersistentContext` 注入假 store（`open-user-chrome-*.mjs` 仅手测）。

#### 4.2 编译门禁（每 Phase 结束）

```bash
source ~/.config/qrclaw/secrets.env
bash scripts/dev-up.sh                    # 或确保 redis/gateway/web/host 在线

cd web && npm run build
cd gateway && npm run typecheck
cd qrclaw-agent-host && go test ./...

node tests/ecc-local-verify.mjs --send
node tests/ecc-local-verify-3agents.mjs
# Phase 1+ :
node tests/ecc-local-verify-runtimes.mjs
node tests/ecc-local-verify-agents.mjs
```

#### 4.3 常见陷阱（ECC Step 5）

```bash
# 无开发者文案
rg "dev-up|Multica daemon|bash scripts|Agent Host" web/src/

# 无硬编码 hex（新代码）
rg "#[0-9a-fA-F]{6}" web/src/features/runtimes web/src/features/agents web/src/features/progress

# Progress 无右侧内嵌详情（应独立路由）
rg "progress-task-detail\"" web/src/features/progress/ProgressBoard.tsx  # 应无 aside 详情
```

#### 4.4 文档交接义务

| 文档 | 何时更新 |
|------|----------|
| `dev-log/YYYY-MM-DD.md` | 每 Phase 结束 |
| `.claude/progress/session-overview.md` | Phase 0+1 完成后 |
| `docs/multica-reuse-map.md` | 每 Phase 记录源→目标文件 |
| `COLLEAGUE-QUICKSTART.md` | Phase 1 后补 Runtimes 流程 |

---

## 7. ECC Agent Team 分工

| 角色 | 职责 | 触发时机 |
|------|------|----------|
| **planner** | 确认 Phase 顺序、阻塞升级 | 开工前 |
| **explore** | Multica 源文件只读清单 | Phase 0 前（本文档 §3.3 已给） |
| **frontend** | web features + pages | Phase 0–2 |
| **backend** | Gateway runtime/progress API | Phase 1–3 |
| **tdd-guide** | ECC 脚本 + Vitest | 每 Phase |
| **code-reviewer** | Phase 结束 review | 每 Phase |
| **security-reviewer** | dev API、Markdown XSS、localStorage | Phase 0、3 |

**接手第一件事：**

1. 读 `.claude/progress/session-overview.md`
2. 读本文档
3. 读 `dev-log/2026-06-23.md`
4. 跑 baseline：`node tests/ecc-local-verify.mjs --send`

---

## 8. 建议执行顺序

```text
Week 1
  Day 1–2   Phase 0（看板 agent task + Multica logo/activity/comment）
  Day 3–4   Phase 1（Runtimes 页）
  Day 5     Phase 2 启动（Agents 双栏骨架）

Week 2
  Day 1–3   Phase 2 完成（编辑 + Connection）
  Day 4–5   Phase 3（DB 持久化或 Activity 增强，按优先级）
  全程      Phase 4 测试 + dev-log
```

---

## 9. 风险与决策 escalation

| 风险 | 缓解 |
|------|------|
| Claude/Codex 本机 provider 失败 | E2E 区分 UI pass vs provider pass；blocked task 也要在看板可见 |
| 无 avatar png 资产 | `ProviderLogo` SVG 即可，不阻塞 |
| Agents 与 QR 路由冲突 | 本地 v1 隐藏 QR Tab；feature flag |
| Multica copy 引入 shadcn 类名 | 实施时全部换 QRClaw CSS 变量 |
| Task DB 持久化 scope 大 | Phase 0 先 localStorage + 强 UI；Phase 3 再上 DB |
| Multica 许可 | 保留 `Adapted from multica/...` 注释；不对外托管 Multica 式 SaaS |

**遇阻上报：** 产品决策变更（如是否保留 QR Tab、默认 agent 是否允许改名）需 Owner 确认后再改 D1–D7。

---

## 10. Definition of Done（整体）

- [ ] 侧栏：**Chat / Agents / Runtimes / Progress / Profile**
- [ ] **Runtimes**：四 provider 识别、在线状态、重新检测、中文安装提示
- [ ] **Agents**：双栏、头像、Instructions/Settings/Connection 可编辑
- [ ] **Chat**：无 `Assistant` 冗余；ProviderLogo 可见
- [ ] **Progress**：Chat 发消息 → 看板 **必现** agent task 卡片（同 session）
- [ ] **Task 详情**：头像 + Activity 看清哪个 agent 开始/完成/失败；评论 Markdown 可用
- [ ] **Multica 复用**：`docs/multica-reuse-map.md` 已填；关键 UI 有 adapt 注释
- [ ] **ECC**：`ecc-local-verify.mjs --send` + `ecc-local-verify-3agents.mjs` 绿；Phase 1+ 脚本绿
- [ ] **文档**：`dev-log` + `session-overview` 已更新
- [ ] **无开发者文案** leakage

---

## 11. 附录 A — 关键文件索引

### bibisheng（现有）

```text
web/src/features/progress/          # 看板 + 详情 + task-store
web/src/app/(dashboard)/chat/     # Chat 主入口
web/src/app/(dashboard)/agents/   # 待重构
web/src/components/chat/AgentListRail.tsx
web/src/stores/owner-agent-chat-store.ts
gateway/src/services/default-owner-agents.ts
gateway/src/routes/owner-agents.ts   # local-host/status
qrclaw-agent-host/                   # daemon + detect
tests/ecc-local-verify.mjs
tests/ecc-local-verify-3agents.mjs
```

### multica（只读 copy 源）

```text
multica/packages/views/runtimes/components/
multica/packages/views/agents/components/
multica/packages/views/issues/components/issue-detail.tsx
multica/packages/views/issues/components/board-card.tsx
multica/packages/views/issues/components/comment-*.tsx
multica/packages/core/types/activity.ts
```

---

## 12. 附录 B — `docs/multica-reuse-map.md` 模板（执行 agent 创建并维护）

```markdown
# Multica → bibisheng 源码复用对照表

| Multica 源文件 | bibisheng 目标 | Phase | 状态 | 备注 |
|----------------|----------------|-------|------|------|
| packages/views/runtimes/components/provider-logo.tsx | web/src/components/agent/ProviderLogo.tsx | 0 | pending | |
| ... | ... | ... | ... | |
```

---

*End of plan — 执行 agent 从 **Phase 0 / T0-1** 开始。*
