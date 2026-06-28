# bibisheng-agent-chat — 体验优化执行指引（交给下一 Agent）

> **用途：** 本文是 `2026-06-23-bibisheng-experience-optimization-plan.md` 的**操作手册**。下一 agent **必须先读本文 + 计划 §6**，按 **Wave 0→5** 顺序实施，**全部任务必做**，不得跳过。
>
> **仓库：** `/Users/zeze/bibisheng-agent-chat`  
> **Multica 只读参考：** `/Users/zeze/multica`  
> **验收：** 仅系统 Chrome Playwright（`channel: 'chrome'`），**禁止 Cursor 内置浏览器**

---

## 0. 开工前 15 分钟（强制）

### 0.1 阅读顺序

1. 本文（handoff guide）
2. `docs/superpowers/plans/2026-06-23-bibisheng-experience-optimization-plan.md` — 任务 ID 与 DoD
3. `docs/superpowers/plans/2026-06-23-bibisheng-runtime-agents-progress-multica-reuse.md` — Multica Reuse 矩阵
4. `dev-log/2026-06-23.md`（若存在）— 当日基线

### 0.2 环境启动

```bash
cd /Users/zeze/bibisheng-agent-chat
source ~/.config/qrclaw/secrets.env
bash scripts/dev-up.sh
```

确认：

```bash
curl -s http://localhost:3100/health | head -c 200   # Gateway（bibisheng 默认 3100）
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/chat   # Web
```

### 0.3 跑 baseline ECC（改代码前）

```bash
node tests/ecc-local-verify.mjs --send
node tests/ecc-local-verify-3agents.mjs
```

记录 pass/fail 到 `dev-log/YYYY-MM-DD.md`。若 baseline 已红，先修红再开新功能。

### 0.4 当前已落地 vs 未做

| 已做 | 未做（本指引范围） |
|------|-------------------|
| `getAgentDisplayName()`（`web/src/lib/agent-display.ts`） | Project 模型 + 看板展示/筛选 |
| Progress MVP 看板 + 详情 + localStorage | Assignee/Project 可编辑 |
| Chat send → `ensureProgressTaskForMessage` | Details 单区编辑（仍双栏） |
| Activity 文本 timeline（无头像） | Activity Live 条 + 头像 |
| Agents 网格 + Create 向导 | Agents 双栏 + Runtimes 页 |
| `ProviderLogo` / `AgentAvatar` | **尚未创建** |

---

## 1. 实施总览（Wave 顺序）

```text
Wave 0  基础组件 + 存储迁移（F + J 部分）
Wave 1  Project 体系（A）+ Task 属性（B）+ Chat 联动（G）
Wave 2  Details / Comment（C）+ Activity / Live（D）
Wave 3  看板 UI（E）+ ProgressBoardHeader + TaskCard
Wave 4  Runtimes（H）+ Agents 重构（I）
Wave 5  ECC 脚本（K）+ 文档（L）+ 全量验收
```

**每 Wave 结束必跑：**

```bash
cd web && npm run build && npm run test
node tests/ecc-local-verify.mjs --send
```

**全部 Wave 完成后额外跑：**

```bash
node tests/ecc-local-verify-3agents.mjs
node tests/ecc-local-verify-projects.mjs
node tests/ecc-local-verify-runtimes.mjs
node tests/ecc-local-verify-agents.mjs
```

---

## 2. Wave 0 — 基础组件与存储

### 2.1 创建 `ProviderLogo.tsx`（任务 F-1）

**源文件：** `/Users/zeze/multica/packages/views/runtimes/components/provider-logo.tsx`

**目标：** `web/src/components/agent/ProviderLogo.tsx`

**做法：**

1. 复制 SVG 组件（OpenClaw / Claude / Cursor / Codex 四个即可；Hermes/Pi 可删）。
2. 文件头加：`// Adapted from multica/packages/views/runtimes/components/provider-logo.tsx`
3. 导出：

```typescript
import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';

export function ProviderLogo({
  provider,
  size = 24,
}: {
  provider: OwnerAgentProvider | string;
  size?: number;
}) { /* switch provider → SVG */ }
```

4. **禁止**硬编码 hex 作页面底色；SVG 内品牌色可保留（与 multica 一致）。

### 2.2 创建 `AgentAvatar.tsx`（任务 F-2）

**目标：** `web/src/components/agent/AgentAvatar.tsx`

```typescript
// 组合 ProviderLogo + 可选在线绿点
export function AgentAvatar({
  agent,
  size = 28,
  showStatus,
  online,
}: {
  agent: OwnerAgentSummary;
  size?: number;
  showStatus?: boolean;
  online?: boolean;
}) { /* ... */ }
```

- 显示名用 `getAgentDisplayName(agent)`，**不要**直接用 `agent.name`。
- `data-testid={`agent-avatar-${agent.id}`}`

### 2.3 Owner 命名空间 localStorage（任务 J-1 / J-2 / J-3）

**问题：** 当前 key 固定为 `bibisheng.progress.tasks.v1`，多用户/换账号会串数据。

**做法：**

1. 新建 `web/src/features/progress/storage-keys.ts`：

```typescript
const OWNER_ID_KEY = 'bibisheng.local.ownerId';

export function getProgressOwnerId(): string {
  if (typeof window === 'undefined') return 'ssr';
  return window.localStorage.getItem(OWNER_ID_KEY) ?? 'local-dev';
}

export function setProgressOwnerId(ownerId: string) {
  window.localStorage.setItem(OWNER_ID_KEY, ownerId);
}

export function tasksStorageKey(ownerId = getProgressOwnerId()) {
  return `bibisheng.progress.tasks.v2.${ownerId}`;
}

export function projectsStorageKey(ownerId = getProgressOwnerId()) {
  return `bibisheng.progress.projects.v1.${ownerId}`;
}
```

2. 在 `LocalDevAutoSignIn` 或 bootstrap 成功后调用 `setProgressOwnerId(ownerId)`（从 `/api/dev/bootstrap` 响应取 `owner_id`）。

3. `task-store.ts` 把所有 `STORAGE_KEY` 改为 `tasksStorageKey()`。

4. **Migration：** 读取旧 key `bibisheng.progress.tasks.v1`，若存在且新 key 为空，迁移并删除旧 key；为每条 task 补 `projectId: 'default'`（Wave 1 建 default project 后执行）。

---

## 3. Wave 1 — Project + Task 属性 + Chat 联动

### 3.1 Project 类型与 Store（A-1 / A-2）

**新建 `project-types.ts`：**

```typescript
export interface ProgressProject {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PROJECT_ID = 'default';
```

**新建 `project-store.ts`：** 模式与 `task-store.ts` 相同：

- `listProgressProjects()` / `getProgressProject(id)` / `createProgressProject()` / `updateProgressProject()` / `deleteProgressProject()`
- `subscribeProgressProjects()` — 同 pattern：`Event + storage` listener
- `ensureDefaultProject()` — 列表为空时写入：

```typescript
{
  id: 'default',
  title: '默认项目',
  icon: '📁',
  description: null,
  createdAt: now,
  updatedAt: now,
}
```

**Vitest：** `project-store.test.ts` — create、ensureDefault、update title。

### 3.2 扩展 Task 模型（A-3 / B-6）

**修改 `types.ts`：**

```typescript
export interface ProgressTask {
  // ...existing
  projectId: string | null;
}
```

**修改 `task-store.ts`：**

1. `createProgressTask` 增加 `projectId?: string | null`，默认 `'default'`（调用 `ensureDefaultProject()`）。
2. `updateProgressTask` patch 扩展：

```typescript
Partial<Pick<ProgressTask,
  'title' | 'description' | 'status' | 'priority' | 'position'
  | 'agentId' | 'agentName' | 'projectId'
>>
```

3. **Activity 结构化**（D-3 预埋）— 创建 task 时：

```typescript
{
  actorType: 'agent',
  actorName: agentName,      // 展示名
  actorId: agentId,
  action: 'agent_run_started',
  text: '开始处理此任务',      // 不要再拼接 agentName
}
```

4. 改 `projectId` 时 append activity：`action: 'project_changed'`, `text: '移动到项目「xxx」'`
5. 改 assignee 时：`action: 'assigned'`, `text: '分配给 xxx'`

### 3.3 Chat 联动（G-1 / G-2 / G-3）

**修改 `ensureProgressTaskForMessage`：**

```typescript
export const ensureProgressTaskForMessage = (input: {
  agentId: string;
  agentName: string;
  content: string;
  projectId?: string | null;
}): ProgressTask => {
  ensureDefaultProject();
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  // ...
  return createProgressTask({
    title: input.content,           // createProgressTask 内部仍 compactTitle
    description: input.content,     // 全文
    projectId,
    // ...
  });
};
```

**修改 `owner-agent-chat-store.ts` sendMessage：**

1. 读取「当前默认 project」— 可从 `localStorage` `bibisheng.progress.activeProjectId` 或 default。
2. 传入 `ensureProgressTaskForMessage({ ..., projectId })`。
3. **修复重复文案：** 删除 sendMessage 里额外的 `appendProgressTaskActivity(... '${agentName} 开始处理...')`，只保留 createProgressTask 内一条 activity；或反过来只保留 append，但 text 不含重复名。

### 3.4 看板 Project 筛选与新建（A-4 / A-5）

**新建 `ProgressBoardHeader.tsx`：**

- Props：`projectFilter: string[]`, `includeNoProject: boolean`, `onFilterChange`, `onCreateProject`
- UI：Multica `issues-header.tsx` 的 project 筛选区简化版 — chip 多选 +「未分组」+「+ 新建项目」按钮
- testid：`progress-project-filter`, `progress-project-create`
- 新建项目：小 popover/dialog，字段 `title`（必填）、`icon`（可选 emoji，默认 📁）

**状态存放：** `ProgressBoard.tsx` 内 `useState`，或 `web/src/features/progress/board-view-store.ts`（localStorage 持久化筛选条件可选）。

**筛选逻辑**（adapt multica `filter.ts`）：

```typescript
function filterTasksByProject(tasks: ProgressTask[], projectIds: string[], includeNoProject: boolean) {
  if (projectIds.length === 0 && !includeNoProject) return tasks; // 无筛选 = 全部
  return tasks.filter((t) => {
    if (!t.projectId) return includeNoProject;
    return projectIds.length === 0 || projectIds.includes(t.projectId);
  });
}
```

### 3.5 详情页 Properties（A-7 / B-1 / B-3 / B-4 / B-5）

**修改 `TaskDetailView.tsx`：**

| 字段 | 实现 |
|------|------|
| Title | 已有 input → 改为 **`onBlur`** 保存（现在 onChange 每键触发 update，可保留 debounce 或改 blur） |
| Assignee | `<select data-testid="progress-task-assignee-select">` — options 来自 `useOwnerAgentChatStore().agents`，label 用 `getAgentDisplayName` |
| Project | `<select data-testid="progress-task-project-select">` + 底部「新建项目」链接触发 mini dialog |
| Status/Priority | 保持 SelectField |

Assignee onChange：

```typescript
update({
  agentId: selected.id,
  agentName: getAgentDisplayName(selected),
}, { recordActivity: true /* 内部写 assigned activity */ });
```

---

## 4. Wave 2 — Details / Activity

### 4.1 `DescriptionEditor.tsx`（C-1 ~ C-4）

**新建：** `web/src/features/progress/DescriptionEditor.tsx`

**行为（无 Tiptap）：**

```text
state: 'empty' | 'editing' | 'reading'

empty     → 点击「添加描述…」→ editing
editing   → 单 textarea，placeholder「描述目标、验收标准或补充说明」
            blur → save description → reading
reading   → MarkdownRenderer + 右上角「编辑」按钮 → editing
```

- testid：`progress-task-description`
- **删除** `TaskDetailView` 中双栏 grid 与 `progress-task-description-preview`

### 4.2 `TaskCommentInput.tsx`（C-5 / C-6）

Adapt multica `comment-input.tsx` **布局**（圆角卡片 + 底部发送按钮），实现用 textarea + Send 按钮，**不要**引入 ContentEditor/Tiptap。

保留 testid：`progress-task-comment-input`, `progress-task-comment-submit`

### 4.3 `format-activity.ts`（D-1 / D-2）

**新建：** adapt multica `issue-detail.tsx` 内 `formatActivity`（约 110–180 行）

```typescript
export function formatActivity(entry: ProgressActivity): string {
  switch (entry.action) {
    case 'agent_run_started': return '开始处理此任务';
    case 'agent_run_completed': return '已完成此任务';
    case 'agent_run_failed': return '处理失败';
    case 'assigned': return entry.text; // 或「分配给 …」
    case 'project_changed': return entry.text;
    case 'status_changed': return entry.text;
    case 'created': return '创建了任务';
    default: return entry.text;
  }
}
```

**修改 `TimelineEntry`：** 左侧 `AgentAvatar`（agent 类型）或用户占位；中间 `{actorName} {formatActivity(item)}`；**禁止** `{actorName} {item.text}` 当 text 已含名字。

**Vitest：** `format-activity.test.ts`

### 4.4 `TaskAgentLive.tsx`（D-4 ~ D-7）

**新建：** `web/src/features/progress/TaskAgentLive.tsx`

**显示条件：**

```typescript
const show =
  task.status === 'in_progress' &&
  task.agentId &&
  (statusByAgent[task.agentId] === 'running' || messagesHaveStreaming);
```

**UI：**

- testid `progress-task-live`
- AgentAvatar + `{agentName} 正在处理` + 计时器（`useEffect` setInterval）
- Link「查看对话」→ `/chat?agent={agentId}` 或 store 内 `selectAgent(agentId)`

**插入位置：** `TaskDetailView` Activity section **顶部**（Multica `AgentLiveCard` 位置）。

**完成/失败：** `owner-agent-chat-store.ts` 已有 `appendProgressTaskActivity` — 确认：

- `action: 'agent_run_completed' | 'agent_run_failed'`
- `text` 不含重复 agentName
- 完成后 `updateProgressTask(taskId, { status: 'done' })` 或 `blocked`（已有则复核）

---

## 5. Wave 3 — 看板卡片与 Chat Toast

### 5.1 抽取 `TaskCard.tsx`（E-1 / E-2 / A-6）

**源：** multica `board-card.tsx`

**卡片内容自上而下：**

1. 行1：`{identifier}` + priority pill
2. 行2：**Project** — `{icon} {project.title}`，testid `progress-task-card-project-{taskId}`
3. 行3：**title**（truncate）
4. 行4：`AgentAvatar` + 短名，testid `progress-task-card-agent-{taskId}`

**ProgressBoard.tsx：** 用 `@dnd-kit` 包裹 `TaskCard`；传入 `project={getProgressProject(task.projectId)}`

### 5.2 New Task（A-8）

`createProgressTask` 调用处传入：

```typescript
projectId: activeProjectFilter.length === 1 ? activeProjectFilter[0] : DEFAULT_PROJECT_ID,
title: '新任务',
description: '',
```

### 5.3 Chat Toast（E-4）

**位置：** `owner-agent-chat-store.ts` 在 `ensureProgressTaskForMessage` 返回后，或 Chat 页面 subscribe progress change。

**轻量实现：** 在 store 增加 `lastProgressTaskId: string | null`，Chat 页 `useEffect` 显示 fixed toast：

- testid `chat-progress-toast`
- 文案：「已加入 Progress」+ Link `/progress/{taskId}`

### 5.4 空态（E-5）

ProgressBoard 无 task 时显示中文引导，**不要**出现 dev-up / bash 字样。

---

## 6. Wave 4 — Runtimes + Agents

### 6.1 侧栏（H-1）

**修改 `web/src/app/(dashboard)/layout.tsx`：**

```typescript
import { Cpu } from 'lucide-react'; // 或 Server

const primaryNavItems = [
  { href: '/chat', ... },
  { href: '/agents', ... },
  { href: '/runtimes', icon: <Cpu size={20} />, label: 'Runtimes' },
  { href: '/progress', ... },
];
```

### 6.2 Runtimes Feature（H-2 ~ H-5）

**目录：** `web/src/features/runtimes/`

**`map-local-host-status.ts`：**

```typescript
// GET /api/owner/local-host/status → { data: { providers: [{ provider, status, detected }] } }
export interface RuntimeRow {
  provider: OwnerAgentProvider;
  status: 'online' | 'offline' | string;
  detected: boolean;
}
```

Web 侧 fetch 需带 JWT — 复用现有 `createClient()` session token 或 store 内已有 fetch helper。

**`RuntimesPage.tsx`：** adapt multica `runtimes-page.tsx` — 左列表右详情；CSS 用 QRClaw 变量。

**重新检测：** 按钮 testid `runtime-redetect` → 再调 status API + 可选 `POST /api/dev/ensure-daemon`（若项目有）。

**安装提示（中文）：**

| provider | 提示 |
|----------|------|
| openclaw | 安装 OpenClaw CLI 并保持本机服务运行 |
| claude | 安装 Claude Code CLI |
| cursor | 安装 Cursor CLI |
| codex | 安装 Codex CLI |

**禁止**在 UI 展示 `bash scripts/dev-up.sh`。

**路由：** `web/src/app/(dashboard)/runtimes/page.tsx` → export `RuntimesPage`

### 6.3 Agents 双栏（I-1 ~ I-9）

**新建 feature 目录：** `web/src/features/agents/`

| 文件 | 说明 |
|------|------|
| `AgentsPage.tsx` | 左 280px 列表 + 右详情；URL `?selected={agentId}` |
| `AgentListItem.tsx` | adapt multica `agent-list-item.tsx` |
| `AgentDetail.tsx` | Tab: Instructions / Settings / Connection |

**`web/src/app/(dashboard)/agents/page.tsx`：** 改为 `export { AgentsPage as default } from '@/features/agents/AgentsPage'`

**Instructions Tab：** 从 `agents/[agentId]/edit/page.tsx` **搬迁** Monaco 逻辑到 Tab 内。

**Settings Tab：**

- 自建 agent：`name`、`description` 可编辑 → `PATCH` owner agent API
- 系统默认 agent：name 只读，description 可编辑（若 API 支持）

**Connection Tab：**

- 显示 `statusByAgent[agentId]` + ProviderLogo
- Link `/runtimes`

**Create Agent（I-7）：**

- 主表单：name、description、provider select
- 「高级选项」折叠：host token 向导（保留现有逻辑，不要删除）

**QR Tab（I-8）：** `/agents/[agentId]` 若存在 QR 向导 — 本地 v1 **默认不渲染**或移到「高级」。

**Edit 重定向（I-5）：** `agents/[agentId]/edit/page.tsx`：

```typescript
redirect(`/agents?selected=${agentId}&tab=instructions`);
```

---

## 7. Wave 5 — ECC 测试与文档

### 7.1 更新 `ecc-local-verify.mjs`（K-1）

在现有 Progress 步骤中增加：

1. 打开 `/progress` → 可见 `progress-project-filter`
2. 点击 New task → 进详情 → `progress-task-title-input` fill + blur
3. `progress-task-description` 编辑/blur
4. `progress-task-assignee-select` 存在且可改

**必须保持：** `chromium.launch({ channel: 'chrome' })`

### 7.2 更新 `ecc-local-verify-3agents.mjs`（K-2）

1. `STORAGE_KEY` 改为与 `tasksStorageKey()` 一致（或 evaluate 时读 `bibisheng.progress.tasks.v2.local-dev`）
2. 断言看板卡片 ≥3
3. 断言 `progress-task-card-project-*` 存在
4. 断言 `progress-task-card-agent-*` 存在
5. 详情页断言 `progress-task-live` 在 streaming 期间可见（可缩短 wait 窗口）
6. Activity 行含 agent 短名，不含 `Assistant`

### 7.3 新建 `ecc-local-verify-projects.mjs`（K-3）

```text
1. bootstrap + /progress
2. 点击 progress-project-create → 创建「ECC测试项目」
3. 筛选仅该项目
4. New task → 卡片显示项目名
5. 详情 progress-task-project-select 值正确
```

### 7.4 新建 `ecc-local-verify-runtimes.mjs`（K-4）

```text
1. /runtimes 加载
2. 四行 provider 可见
3. runtime-redetect 可点击
```

### 7.5 新建 `ecc-local-verify-agents.mjs`（K-5）

```text
1. /agents 双栏
2. 点击列表项 → 右侧 agent-tab-instructions 可见
3. 切换 settings / connection tab
4. 列表含 agent-avatar-*
```

### 7.6 文档（L-1 ~ L-4）

1. 创建 `docs/multica-reuse-map.md` — 每 copy 文件一行
2. 更新 `dev-log/YYYY-MM-DD.md`
3. 更新 `.claude/progress/session-overview.md` — 勾选体验优化项
4. adapt 注释 spot check

---

## 8. 关键文件速查

| 用途 | 路径 |
|------|------|
| Task CRUD | `web/src/features/progress/task-store.ts` |
| 看板 | `web/src/features/progress/ProgressBoard.tsx` |
| 详情 | `web/src/features/progress/TaskDetailView.tsx` |
| Chat store | `web/src/stores/owner-agent-chat-store.ts` |
| 展示名 | `web/src/lib/agent-display.ts` |
| 侧栏 | `web/src/app/(dashboard)/layout.tsx` |
| Agents 页 | `web/src/app/(dashboard)/agents/page.tsx` |
| Local host API | `gateway/src/routes/owner-agents.ts` → `GET /api/owner/local-host/status` |
| Multica board | `multica/packages/views/issues/components/board-card.tsx` |
| Multica agents | `multica/packages/views/agents/components/agents-page.tsx` |
| Multica runtimes | `multica/packages/views/runtimes/components/runtimes-page.tsx` |

---

## 9. 常见陷阱（必读）

| 陷阱 | 后果 | 预防 |
|------|------|------|
| 用 Cursor 内置浏览器验收 | 与用户要求不符 | 只跑 `ecc-local-verify*.mjs` |
| Activity text 重复 agentName | 「Claude Code Claude Code…」 | text 用短句，名字只在 UI 列显示 |
| onChange 每键写 activity | timeline 爆炸 | title/description 用 `{ recordActivity: false }` |
| 引入 @multica/core | 构建失败 / 栈冲突 | 只 copy views 组件 |
| ECC storage key 未更新 | 3agents 读不到 task | 脚本与 `tasksStorageKey()` 对齐 |
| Claude provider 本机失败 | 3agents 红 | UI 断言与 provider 断言分开；blocked task 也要在看板可见 |
| 硬编码 `#fff` / `#e5e7eb` | 违反 token 规范 | 用 `var(--color-*)` |
| New task 无 projectId | 看板不显示项目 | default project 必 seed |

---

## 10. Definition of Done 勾选流程

完成所有 Wave 后，打开计划 §8，逐项勾选。全部 ✓ 后在本文件末尾追加：

```markdown
## 完成记录
- 执行 agent：
- 完成日期：
- ECC：ecc-local-verify / 3agents / projects / runtimes / agents 全部 pass
- build + vitest pass
```

并提交 `dev-log` + `session-overview` 更新（**用户未要求 commit 则不 commit**）。

---

## 11. 给 Orchestrator 的一句话 Prompt

可直接复制给下一 agent：

```text
你在 /Users/zeze/bibisheng-agent-chat 执行体验优化。
先读 docs/superpowers/plans/2026-06-23-bibisheng-experience-handoff-guide.md
和 docs/superpowers/plans/2026-06-23-bibisheng-experience-optimization-plan.md。
按 Wave 0→5 全部完成（Project、Task 可编辑、Details 单区、Activity Live、看板、Runtimes、Agents 双栏、ECC 五脚本）。
验收只用系统 Chrome Playwright，禁止 Cursor 内置浏览器。
Multica 组件从 /Users/zeze/multica/packages/views/ adapt，禁止引入 @multica/core。
每 Wave 结束 npm run build && ecc-local-verify.mjs --send。
```

---

*End of handoff guide*
