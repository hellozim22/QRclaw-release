# bibisheng-agent-chat — 完整体验优化计划（Multica 对齐 · ECC 验收）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 按本文 **§6 任务清单** 逐项实施；**全部任务均为必做**，无优先级分层，未完成整表不得宣告 Done。
>
> **版本:** 2026-06-23（体验优化修订）  
> **状态:** 已锁定 — 待执行  
> **仓库:** `/Users/zeze/bibisheng-agent-chat`  
> **Multica 参考仓:** `/Users/zeze/multica`（只读 + 源码 adapt）  
> **前置计划:** `2026-06-23-bibisheng-runtime-agents-progress-multica-reuse.md`（架构与 Multica Reuse 矩阵）

---

## 0. 文档目的

整合用户 2026-06-23 反馈，输出**一份可执行的完整体验改善清单**：

1. **Project 必须有完整逻辑**：Progress 看板与详情能看清任务属于哪个 Project；支持创建、选择、筛选。
2. **Task 名称**：详情页可编辑**单行文本**；自动建 task 时默认仍用现有 `compactTitle()` 逻辑。
3. **其余体验点全部纳入**：Details 单区编辑、Assignee 可选、Activity 可见 agent 执行、Agents/Runtimes Multica 式重构等——**不分优先级，全部完成**。
4. **验收标准**：ECC 脚本矩阵 + 编译门禁；**禁止 Cursor 内置浏览器**，仅系统 Chrome（`channel: 'chrome'`）。

---

## 1. 产品决策（已锁定）

| # | 决策 | 说明 |
|---|------|------|
| E1 | **Project 为一等公民** | 本地 v1 用 localStorage 存 Project 列表；Task 必关联 `projectId`（可为 null =「未分组」） |
| E2 | **看板展示 Project** | 卡片上显示 Project 图标 + 名称（adapt multica `board-card.tsx`） |
| E3 | **Task 标题可编辑** | 详情页单行 input；blur 保存；自动建 task 默认 `compactTitle(sourceMessage)` |
| E4 | **Assignee 可改** | Properties 下拉选 agent（头像 + 短名）；Chat 自动建 task 时预填 |
| E5 | **Details 单区体验** | 去掉左写右看双栏；编辑态纯文本 / 阅读态 Markdown 渲染（Multica 模式，不用 Tiptap） |
| E6 | **Activity 可见执行** | Live 执行条 + 头像 timeline + 去重文案；完成/失败写入结构化 activity |
| E7 | **Agents / Runtimes** | 方案 3 双页；Multica master-detail；host token 降为高级入口 |
| E8 | **Agent 展示名方案 C** | 系统默认 agent → provider 短名；自建 agent → `agent.name`（T0-1 已落地则保持） |
| E9 | **无开发者文案** | UI 禁止 `dev-up`、`Multica daemon`、`bash scripts` 等 |
| E10 | **ECC 仅系统 Chrome** | 所有 E2E 走 `tests/ecc-local-verify*.mjs`；禁止 Cursor 内置浏览器 |

---

## 2. 目标体验（完成后用户应看到什么）

```text
Progress 看板
├── 顶栏：Project 筛选（多选 +「未分组」）+ 新建 Project
├── 列：Backlog | Todo | In Progress | In Review | Done | Blocked
└── 卡片：TASK-001 · [📁 项目名] · 标题 · [AgentAvatar] Claude Code · 优先级

/progress/[taskId] 详情
├── 单行可编辑标题（blur 保存）
├── Details：点击编辑 / blur 后 Markdown 渲染（单区域）
├── Activity：
│   ├── [Live] Claude Code 正在处理…（running 时置顶）
│   └── 头像 + 姓名 + 动作 timeline + 评论卡片
└── Properties：Status / Priority / Assignee（下拉）/ Project（下拉 + 新建）

/agents — 左列表（头像+在线）+ 右详情 Tab（Instructions / Settings / Connection）
/runtimes — 本机四 provider 检测、在线、重新检测、安装提示
```

---

## 3. 数据模型

### 3.1 Project（新建）

```typescript
// web/src/features/progress/project-types.ts
export interface ProgressProject {
  id: string;
  title: string;
  icon: string | null;        // emoji，默认 📁
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// localStorage: bibisheng.progress.projects.v1
// 首次启动 seed 一个默认 Project：
//   { id: 'default', title: '默认项目', icon: '📁' }
```

### 3.2 Task（扩展）

```typescript
// web/src/features/progress/types.ts — 在 ProgressTask 上增加：
projectId: string | null;     // null = 未分组

// updateProgressTask patch 扩展支持：
// title | description | status | priority | position
// | agentId | agentName | projectId
```

### 3.3 Activity（结构化）

```typescript
// 对齐 multica activity 最小字段集
export interface ProgressActivity {
  id: string;
  at: string;
  actorType: 'owner' | 'agent' | 'system';
  actorName: string | null;
  actorId?: string | null;      // agentId when agent
  action: string;               // created | assigned | status_changed | agent_run_started | agent_run_completed | agent_run_failed | updated | commented
  text: string;                 // 人类可读摘要；禁止重复 actorName
}
```

### 3.4 Chat 自动建 Task 规则

| 字段 | 规则 |
|------|------|
| `title` | `compactTitle(userMessage)` — 与现逻辑一致 |
| `description` | 完整 `userMessage`（或空，不重复塞 title） |
| `projectId` | 当前看板选中的「默认 Project」或 `default` |
| `agentId` / `agentName` | 当前 Chat 选中 agent + `getAgentDisplayName()` |
| `status` | `in_progress` |
| Activity | `action: agent_run_started`，text: `开始处理此任务`（不含重复名） |

---

## 4. Multica 复用锚点（实施时必读）

| 能力 | Multica 源 | bibisheng 目标 |
|------|-----------|----------------|
| 看板卡片 + Project | `issues/components/board-card.tsx` | `ProgressBoard.tsx` / `TaskCard.tsx` |
| Project 筛选 | `issues/components/issues-header.tsx` | `ProgressBoardHeader.tsx` |
| Activity timeline | `issues/components/issue-detail.tsx`（formatActivity + 分组） | `TaskDetailView.tsx` |
| Live 执行 | `issues/components/agent-live-card.tsx` | `TaskAgentLive.tsx`（adapter：接 Zustand running 态） |
| 评论 | `comment-input.tsx` + `comment-card.tsx` | `TaskCommentInput.tsx` + 现有 comment 渲染 |
| 只读 Markdown | `readonly-content.tsx` 模式 | `MarkdownRenderer` + 编辑/阅读切换 |
| Provider 头像 | `runtimes/components/provider-logo.tsx` | `ProviderLogo.tsx` |
| Agents 双栏 | `agents/components/agents-page.tsx` | `features/agents/AgentsPage.tsx` |
| Runtimes | `runtimes/components/runtimes-page.tsx` | `features/runtimes/RuntimesPage.tsx` |

**禁止：** 引入 `@multica/core` / `@multica/ui`；禁止 Cursor 内置浏览器做验收。

---

## 5. 文件结构（Create / Modify）

### Create

```text
web/src/features/progress/project-types.ts
web/src/features/progress/project-store.ts
web/src/features/progress/ProgressBoardHeader.tsx
web/src/features/progress/TaskCard.tsx
web/src/features/progress/TaskAgentLive.tsx
web/src/features/progress/TaskCommentInput.tsx
web/src/features/progress/DescriptionEditor.tsx
web/src/features/progress/format-activity.ts
web/src/components/agent/ProviderLogo.tsx
web/src/components/agent/AgentAvatar.tsx
web/src/features/agents/AgentsPage.tsx
web/src/features/agents/AgentListItem.tsx
web/src/features/agents/AgentDetail.tsx
web/src/features/runtimes/RuntimesPage.tsx
web/src/features/runtimes/RuntimeList.tsx
web/src/features/runtimes/RuntimeDetail.tsx
web/src/features/runtimes/map-local-host-status.ts
web/src/app/(dashboard)/runtimes/page.tsx
tests/ecc-local-verify-runtimes.mjs
tests/ecc-local-verify-agents.mjs
tests/ecc-local-verify-projects.mjs
web/src/features/progress/project-store.test.ts
web/src/features/progress/format-activity.test.ts
docs/multica-reuse-map.md
```

### Modify

```text
web/src/features/progress/types.ts
web/src/features/progress/task-store.ts
web/src/features/progress/ProgressBoard.tsx
web/src/features/progress/TaskDetailView.tsx
web/src/stores/owner-agent-chat-store.ts
web/src/app/(dashboard)/layout.tsx
web/src/app/(dashboard)/agents/page.tsx
web/src/app/(dashboard)/agents/[agentId]/edit/page.tsx   # 重定向到 /agents?selected=
web/src/lib/agent-display.ts                             # 已存在则扩展
tests/ecc-local-verify.mjs
tests/ecc-local-verify-3agents.mjs
```

---

## 6. 完整任务清单（全部必做）

> 执行顺序建议按表格 ID 自上而下，但**无「可选 Phase」**——整表完成才是 Done。

### A. Project 体系

| ID | 任务 | 验收 |
|----|------|------|
| A-1 | 新建 `project-types.ts` + `project-store.ts`（CRUD + localStorage + subscribe） | Vitest：create/list/update/delete |
| A-2 | 首次无数据时 seed **默认 Project**（`默认项目` / 📁） | 新 session 打开 Progress 有默认 project |
| A-3 | `ProgressTask` 增加 `projectId`；`createProgressTask` / `updateProgressTask` 支持读写 | 旧数据 migration：无 projectId → 挂到 default |
| A-4 | 看板顶栏 **Project 筛选**（多选 +「未分组」）— adapt multica filter 逻辑 | `data-testid="progress-project-filter"` |
| A-5 | 顶栏 **新建 Project**（title + 可选 icon emoji） | `data-testid="progress-project-create"` |
| A-6 | 看板卡片展示 **Project 图标 + 名称**（有 project 时） | 卡片含 `progress-task-card-project-*` |
| A-7 | 详情 Properties **Project 下拉**（切换 project + 快捷新建） | 改 project 写 Activity `assigned to project` |
| A-8 | 手动「New task」默认挂当前筛选唯一 project 或 default | 新建卡 immediately 显示 project |

### B. Task 标题与属性

| ID | 任务 | 验收 |
|----|------|------|
| B-1 | 详情页标题：**单行 input**，`onBlur` 调用 `updateProgressTask({ title }, { recordActivity: false })` | testid `progress-task-title-input` blur 后持久化 |
| B-2 | 自动建 task：`title = compactTitle(message)` 保持不变 | 3agents 脚本断言 title 非空且 ≤42 字规则 |
| B-3 | Properties **Assignee 下拉**：列表来自 `useOwnerAgentChatStore.agents` + `AgentAvatar` + 短名 | testid `progress-task-assignee-select` |
| B-4 | 改 Assignee 更新 `agentId` + `agentName`（display name）并写 Activity | timeline 有 `assigned` 动作 |
| B-5 | Status / Priority 下拉保持可用；改 status 写清晰 Activity | 现有行为 + 文案中文化 |
| B-6 | `updateProgressTask` patch 类型扩展 `agentId` / `agentName` / `projectId` | typecheck 通过 |

### C. Details 与评论编辑体验

| ID | 任务 | 验收 |
|----|------|------|
| C-1 | **删除** Details 左右双栏（textarea + preview） | 页面无 `progress-task-description-preview` 并排布局 |
| C-2 | 新建 `DescriptionEditor.tsx`：**单区域** — 空态占位「添加描述…」→ 编辑 textarea → blur 后 `MarkdownRenderer` 阅读态 | testid `progress-task-description` |
| C-3 | placeholder 用自然语言，**不提 Markdown** | grep Details 区域无 "Markdown" 字样 |
| C-4 | 阅读态右上角「编辑」链回编辑态 | 点击可再改 |
| C-5 | adapt `TaskCommentInput.tsx` 布局（单输入框 + 发送）；去掉双栏 | testid 保留 comment input/submit |
| C-6 | 评论发送后渲染为卡片（现有 `TimelineEntry` comment 分支 + Markdown） | ECC comment 步骤通过 |

### D. Activity 与 Agent 执行可见性

| ID | 任务 | 验收 |
|----|------|------|
| D-1 | 新建 `format-activity.ts` — adapt multica `formatActivity`（中文化动作文案） | Vitest 覆盖 started/completed/failed/assigned |
| D-2 | Timeline 行改为 **AgentAvatar + 姓名 + formatActivity 文案** | 无「Claude Code Claude Code…」重复 |
| D-3 | Activity `action` 字段结构化；创建/改 status/assignee/project 各写对应 action | grep task-store 无裸拼接重复名 |
| D-4 | 新建 `TaskAgentLive.tsx`：task `in_progress` 且 agent `running` 时置顶 Live 条 | testid `progress-task-live` |
| D-5 | Live 条内容：头像 + 短名 + 「正在处理」+ 已用时 + **查看对话** 链到 Chat | 3agents 发消息后详情页可见 Live |
| D-6 | run 完成/失败：`appendProgressTaskActivity` 写 `agent_run_completed` / `agent_run_failed`；Live 条消失 | done/blocked 列卡片仍带 agent 归因 |
| D-7 | Chat store 完成回调与 Progress task 联动（已有则加固 id 匹配） | 同一 session 详情 timeline 有 completed |

### E. Progress 看板增强

| ID | 任务 | 验收 |
|----|------|------|
| E-1 | 抽取 `TaskCard.tsx` — adapt multica `board-card.tsx` | 含 identifier、priority、title、project、agent |
| E-2 | 卡片 **AgentAvatar + 短名**（非仅小字 agentName） | testid `progress-task-card-agent-*` |
| E-3 | 拖拽列 / 排序保持可用 | 现有 DnD 无回归 |
| E-4 | Chat 发消息后 **toast「已加入 Progress」** + 链到 task 或 /progress | testid `chat-progress-toast` 或等价 |
| E-5 | 看板空态引导：「在 Chat 向 Agent 发消息，或点击 New task」 | 无开发者术语 |

### F. Agent 身份组件（全站）

| ID | 任务 | 验收 |
|----|------|------|
| F-1 | copy/adapt `ProviderLogo.tsx` | Chat / Progress / Agents 可见 |
| F-2 | 新建 `AgentAvatar.tsx`（ProviderLogo + 在线点可选） | 全站统一 |
| F-3 | `getAgentDisplayName()` 接入 Progress / Agents / Chat（T0-1 已做则复核） | UI grep 无 `Assistant` 展示 |
| F-4 | 补 `web/public/avatars/` 或纯 SVG fallback — seed URL 404 时不破图 | 网络面板无致命 404 阻塞 |

### G. Chat 联动

| ID | 任务 | 验收 |
|----|------|------|
| G-1 | `ensureProgressTaskForMessage` 写入 `projectId`（default 或用户上次选择） | task 带 project |
| G-2 | 自动 task 的 `description` 与 `title` 分离（description=全文，title=compact） | 详情 Details 不全重复 title |
| G-3 | `agentName` 一律写 display name | 与 B-3 一致 |

### H. Runtimes 页

| ID | 任务 | 验收 |
|----|------|------|
| H-1 | 侧栏增加 **Runtimes**（Chat \| Agents \| Runtimes \| Progress \| Profile） | layout 导航可见 |
| H-2 | `/runtimes` 路由 + adapt `runtimes-page.tsx` 双栏 | 页面加载无报错 |
| H-3 | `mapLocalHostStatusToRuntimeDevice()` adapter 接 `GET /api/owner/local-host/status` | 四 provider 行 |
| H-4 | 「重新检测」刷新 status + 触发 ensure-daemon（local dev API） | testid `runtime-redetect` |
| H-5 | 中文安装提示（CLI 名 + 文档链，无 bash 命令块在 UI） | grep 无 `bash scripts` |
| H-6 | `tests/ecc-local-verify-runtimes.mjs` | 脚本 pass |

### I. Agents 页重构

| ID | 任务 | 验收 |
|----|------|------|
| I-1 | `/agents` 改为 **左列表 + 右详情** master-detail | 非 grid-only |
| I-2 | 列表项：AgentAvatar、短名、在线点、provider 标签 | adapt `agent-list-item.tsx` |
| I-3 | 详情 Tab：**Instructions / Settings / Connection** | testid `agent-tab-*` |
| I-4 | Settings：显示名（自建可改）、描述可改；默认 agent 显示名只读 | 保存后列表刷新 |
| I-5 | Instructions Tab 合并原 `/agents/[id]/edit` Monaco/textarea | edit 路由 302 → `/agents?selected=` |
| I-6 | Connection Tab：Runtime 在线态 + 链到 `/runtimes` | 只读 + 跳转 |
| I-7 | Create Agent：简化表单（name、description、provider）；**host token 收到「高级」** | 主按钮非 token 向导 |
| I-8 | `/agents/[id]` QR 主导 Tab **隐藏或降级**（本地 v1） | 默认不见 QR 向导 |
| I-9 | `tests/ecc-local-verify-agents.mjs` | 脚本 pass |

### J. 存储与迁移

| ID | 任务 | 验收 |
|----|------|------|
| J-1 | localStorage key 加 **owner 命名空间**（bootstrap ownerId） | 换账号不串 task |
| J-2 | Task / Project 数据结构版本迁移（v1→v2：补 projectId） | 旧数据打开不白屏 |
| J-3 | 登出清理 progress localStorage（或按 owner 隔离） | 安全 review 无跨用户泄漏 |

### K. ECC 测试矩阵（系统 Chrome only）

| ID | 任务 | 验收 |
|----|------|------|
| K-1 | 更新 `ecc-local-verify.mjs`：Project 筛选、title blur、description 单区、assignee select | `--send` pass |
| K-2 | 更新 `ecc-local-verify-3agents.mjs`：看板卡片 ≥3、含 project + agent testid、**Live 条**、Activity 头像 | pass |
| K-3 | 新建 `ecc-local-verify-projects.mjs`：建 project → 建 task → 筛选 → 卡片显示 project 名 | pass |
| K-4 | 新建 `ecc-local-verify-runtimes.mjs` | pass |
| K-5 | 新建 `ecc-local-verify-agents.mjs` | pass |
| K-6 | 所有脚本 `chromium.launch({ channel: 'chrome' })`；**禁止** Cursor browser MCP 作验收依据 | code review |
| K-7 | Vitest：`project-store.test.ts`、`format-activity.test.ts`、`agent-display.test.ts` | `npm run test` 绿 |

### L. 文档与交接

| ID | 任务 | 验收 |
|----|------|------|
| L-1 | 创建并维护 `docs/multica-reuse-map.md` | 每个 adapt 文件有记录 |
| L-2 | 更新 `dev-log/2026-06-23.md`（或当日） | 含根因 + 测试基线 |
| L-3 | 更新 `.claude/progress/session-overview.md` | 体验优化 Done 勾选 |
| L-4 | copy 文件头注释 `// Adapted from multica/packages/views/...` | spot check ≥5 文件 |

---

## 7. 验收命令（每批任务合并前必跑）

```bash
source ~/.config/qrclaw/secrets.env
bash scripts/dev-up.sh

cd web && npm run build
cd web && npm run test
cd gateway && npm run typecheck

node tests/ecc-local-verify.mjs --send
node tests/ecc-local-verify-3agents.mjs
node tests/ecc-local-verify-projects.mjs
node tests/ecc-local-verify-runtimes.mjs
node tests/ecc-local-verify-agents.mjs
```

### 7.1 ECC Step 5 陷阱检查

```bash
# 无开发者文案
rg "dev-up|Multica daemon|bash scripts|Agent Host" web/src/

# 新代码无硬编码 hex
rg "#[0-9a-fA-F]{6}" web/src/features/progress web/src/features/agents web/src/features/runtimes

# Details 无双栏 preview
rg "progress-task-description-preview" web/src/features/progress/TaskDetailView.tsx  # 应无或仅测试废弃

# UI 不强调 Markdown
rg "Markdown" web/src/features/progress/TaskDetailView.tsx web/src/features/progress/DescriptionEditor.tsx
```

---

## 8. Definition of Done（整体门禁）

以下 **全部勾选** 方可宣告本计划完成：

- [ ] **Project**：可创建、筛选、看板卡片与详情 Properties 均展示所属 Project
- [ ] **Task 标题**：详情单行可编辑；自动建 task 默认 `compactTitle` 逻辑不变
- [ ] **Assignee / Project**：详情 Properties 均可下拉修改并写 Activity
- [ ] **Details**：单区域编辑→阅读，无左右 Markdown 双栏
- [ ] **Activity**：Live 执行条 + 头像 timeline；测试可见 agent 正在执行
- [ ] **看板**：卡片含 Project + AgentAvatar + 标题 + 优先级
- [ ] **Chat**：发消息 → toast → Progress task（带 project + agent）
- [ ] **Runtimes**：四 provider、重新检测、中文安装提示
- [ ] **Agents**：双栏、头像、Instructions/Settings/Connection、Create 简化
- [ ] **Multica reuse map** 已填；关键文件有 adapt 注释
- [ ] **ECC 五脚本** 全部绿（系统 Chrome）
- [ ] **编译 + Vitest** 绿
- [ ] **dev-log + session-overview** 已更新
- [ ] **未使用 Cursor 内置浏览器** 作为验收依据

---

## 9. 风险与约束

| 风险 | 处理 |
|------|------|
| localStorage 仍易丢（换机） | 本计划完成 localStorage + owner 命名空间；Supabase 持久化为后续 epic，不阻塞本表 |
| AgentLiveCard 完整 WS 版 | 本计划用 Zustand running 态 + Live 条；完整 transcript 不纳入本表 |
| Claude provider 本机失败 | ECC 区分 UI pass vs provider pass；blocked task 仍必须在看板可见 |
| Tiptap 过重 | 本计划明确 **不引入** Tiptap；用 DescriptionEditor 单区切换 |

---

## 10. 附录 — 关键 UI testid 约定

| testid | 含义 |
|--------|------|
| `progress-project-filter` | 看板 Project 筛选 |
| `progress-project-create` | 新建 Project |
| `progress-task-card-project-*` | 卡片 Project 区域 |
| `progress-task-title-input` | 可编辑标题 |
| `progress-task-description` | Details 单区 |
| `progress-task-assignee-select` | Assignee 下拉 |
| `progress-task-project-select` | Project 下拉 |
| `progress-task-live` | Agent 执行 Live 条 |
| `progress-task-activity-*` | Timeline 条目 |
| `progress-task-comment-input` | 评论输入 |
| `chat-progress-toast` | Chat 创建 task 提示 |
| `agent-tab-instructions` / `settings` / `connection` | Agents 详情 Tab |
| `runtime-redetect` | Runtimes 重新检测 |

---

*End of plan — 执行 agent 从 **A-1** 开始，按 §6 整表推进直至 §8 全部勾选。*
