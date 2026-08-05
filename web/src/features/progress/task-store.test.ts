import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProgressTask,
  deleteProgressTask,
  listProgressTasks,
  updateProgressTask,
} from './task-store';

describe('progress task store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('deletes a task and normalizes remaining positions', () => {
    const first = createProgressTask({ title: 'First task' });
    const second = createProgressTask({ title: 'Second task' });
    const third = createProgressTask({ title: 'Third task' });

    expect(deleteProgressTask(second.id)).toBe(true);

    const tasks = listProgressTasks();
    expect(tasks.map((task) => task.id)).toEqual([first.id, third.id]);
    expect(tasks.map((task) => task.position)).toEqual([1, 2]);
  });

  it('returns false when the task does not exist', () => {
    createProgressTask({ title: 'Keep me' });

    expect(deleteProgressTask('missing-task')).toBe(false);
    expect(listProgressTasks()).toHaveLength(1);
  });

  it('normalizes escaped markdown line breaks in task descriptions', () => {
    const task = createProgressTask({
      title: 'Markdown task',
      description: '## 任务背景\\n\\n第一段\\n\\n## 任务详情',
    });

    expect(task.description).toBe('## 任务背景\n\n第一段\n\n## 任务详情');

    const updated = updateProgressTask(
      task.id,
      { description: '## 任务解决进度\\n\\n- 已创建' },
      { recordActivity: false }
    );

    expect(updated?.description).toBe('## 任务解决进度\n\n- 已创建');
  });
});
