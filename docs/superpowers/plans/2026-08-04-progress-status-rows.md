# Progress Status Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Progress multi-column Kanban with vertical status rows (≤6 cards + `>` more arrow) while keeping drag-and-drop.

**Architecture:** Keep `task-store` / status / position model unchanged. Refactor `ProgressBoard` columns into horizontal status rows. Add `/progress/status/[status]` for full status lists. English-only status titles.

**Tech Stack:** Next.js App Router, React 19, `@dnd-kit` (horizontal sortable + droppable rows), existing Progress local store.

## Global Constraints

- Row view only — no multi-column Kanban, no board-level horizontal scroll of infinite cards
- English-only status labels (no Chinese hints on board)
- Status order: backlog → todo → in_progress → in_review → done → blocked
- Max 6 visible tasks per row by `position`; if `count > 6`, show `>` at row end
- `>` opens `/progress/status/[status]`; task click opens `/progress/[taskId]`
- Done not collapsed; Blocked has no special emphasis
- Keep DnD: cross-row = status change; in-row = position reorder
- YAGNI — minimal files, no over-design

---

### Task 1: Visible-slice helper + English-only STATUS_META

**Files:**
- Modify: `web/src/features/progress/types.ts`
- Create: `web/src/features/progress/row-visibility.ts`
- Create: `web/src/features/progress/row-visibility.test.ts`

**Interfaces:**
- Produces: `VISIBLE_TASKS_PER_ROW = 6`, `visibleTasksForRow(tasks: ProgressTask[]): ProgressTask[]`, `STATUS_META[status].title` only

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { VISIBLE_TASKS_PER_ROW, visibleTasksForRow } from './row-visibility';
import type { ProgressTask } from './types';

function stub(id: string, position: number): ProgressTask {
  return {
    id, identifier: id, title: id, description: '', status: 'todo', priority: 'none',
    position, projectId: null, agentId: null, agentName: null, sourceMessage: null,
    activity: [], createdAt: '', updatedAt: '',
  };
}

describe('visibleTasksForRow', () => {
  it('returns all when count <= 6', () => {
    const tasks = [1, 2, 3].map((n) => stub(`t${n}`, n));
    expect(visibleTasksForRow(tasks)).toHaveLength(3);
  });

  it('returns first 6 by input order when count > 6', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => stub(`t${i + 1}`, i + 1));
    expect(visibleTasksForRow(tasks).map((t) => t.id)).toEqual(
      ['t1', 't2', 't3', 't4', 't5', 't6'],
    );
    expect(VISIBLE_TASKS_PER_ROW).toBe(6);
  });
});
```

- [x] **Step 2: Implement helper + slim STATUS_META**

```ts
// row-visibility.ts
import type { ProgressTask } from './types';
export const VISIBLE_TASKS_PER_ROW = 6;
export function visibleTasksForRow(tasks: ProgressTask[]): ProgressTask[] {
  return tasks.slice(0, VISIBLE_TASKS_PER_ROW);
}
```

```ts
// types.ts — STATUS_META
export const STATUS_META: Record<TaskStatus, { title: string }> = {
  backlog: { title: 'Backlog' },
  todo: { title: 'Todo' },
  in_progress: { title: 'In Progress' },
  in_review: { title: 'In Review' },
  done: { title: 'Done' },
  blocked: { title: 'Blocked' },
};
```

- [x] **Step 3: Run tests**

Run: `cd web && npx vitest run src/features/progress/row-visibility.test.ts`
Expected: PASS

---

### Task 2: Refactor ProgressBoard to status rows + keep DnD

**Files:**
- Modify: `web/src/features/progress/ProgressBoard.tsx`

**Interfaces:**
- Consumes: `visibleTasksForRow`, `STATUS_META.title`, existing `moveProgressTask`
- Produces: `data-testid="progress-row-{status}"`, `data-testid="progress-row-more-{status}"` (`>` link when count > 6)

- [x] **Step 1: Replace Column with StatusRow**
  - Vertical stack of 6 status rows (full width)
  - Header: English title + count only (no hint)
  - Horizontal `SortableContext` with `horizontalListSortingStrategy`
  - Render `visibleTasksForRow(tasks)` only
  - If `tasks.length > 6`, render Link/`router.push` to `/progress/status/{status}` showing only `>`
  - Droppable id remains status string; drag-end logic unchanged
  - Board container: `overflowY: auto`, **no** `overflowX: auto` as primary scroll
  - Cards: fixed-ish width (~200px) so up to 6 fit; row uses `display: flex; gap; alignItems: stretch`
  - Rename testids: `progress-row-*` (keep `progress-board`)

- [x] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit` (or project equivalent)
Expected: no errors in progress files

---

### Task 3: Status secondary page

**Files:**
- Create: `web/src/app/(dashboard)/progress/status/[status]/page.tsx`

**Interfaces:**
- Route param `status` must be in `TASK_STATUSES`; invalid → back to `/progress`
- List all tasks in status sorted by position; click → `/progress/[taskId]`
- Back link to `/progress`
- Respect same project filter? **No** — keep simple: show all tasks in that status (YAGNI). Optional: reuse store subscribe only.

- [x] **Step 1: Implement page** (client component, subscribe to `listProgressTasks`)

- [x] **Step 2: Smoke typecheck / lint on new file**

---

### Task 4: Verification

- [x] Run `cd web && npx vitest run src/features/progress/`
- [x] Grep: no `progress-column`, no board `overflowX: 'auto'`, no `meta.hint` render
- [x] Grep: `progress-row-more` and `/progress/status/` wired
- [ ] Manual checklist: ≤6 no arrow; >6 shows `>`; status page lists all; DnD cross-row + in-row still works
- [x] Confirm diff stays small — no new abstraction layers beyond `row-visibility.ts`
