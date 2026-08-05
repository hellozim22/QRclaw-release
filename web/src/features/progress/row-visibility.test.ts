import { describe, expect, it } from 'vitest';
import { VISIBLE_TASKS_PER_ROW, visibleTasksForRow } from './row-visibility';
import type { ProgressTask } from './types';

function stub(id: string, position: number): ProgressTask {
  return {
    id,
    identifier: id,
    title: id,
    description: '',
    status: 'todo',
    priority: 'none',
    position,
    projectId: null,
    agentId: null,
    agentName: null,
    sourceMessage: null,
    activity: [],
    createdAt: '',
    updatedAt: '',
  };
}

describe('visibleTasksForRow', () => {
  it('returns all when count <= 6', () => {
    const tasks = [1, 2, 3].map((n) => stub(`t${n}`, n));
    expect(visibleTasksForRow(tasks)).toHaveLength(3);
  });

  it('returns first 6 by input order when count > 6', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => stub(`t${i + 1}`, i + 1));
    expect(visibleTasksForRow(tasks).map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
      't6',
    ]);
    expect(VISIBLE_TASKS_PER_ROW).toBe(6);
  });
});
