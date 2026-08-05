import type { ProgressTask } from './types';

export const VISIBLE_TASKS_PER_ROW = 6;

export function visibleTasksForRow(tasks: ProgressTask[]): ProgressTask[] {
  return tasks.slice(0, VISIBLE_TASKS_PER_ROW);
}
