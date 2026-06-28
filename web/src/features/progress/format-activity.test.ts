import { describe, expect, it } from 'vitest';
import { formatActivity } from './format-activity';
import type { ProgressActivity } from './types';

const activity = (patch: Partial<ProgressActivity>): ProgressActivity => ({
  id: 'activity-1',
  at: '2026-06-23T00:00:00.000Z',
  actorType: 'agent',
  actorName: 'Claude Code',
  action: 'agent_run_started',
  text: '开始处理此任务',
  ...patch,
});

describe('formatActivity', () => {
  it('formats agent execution states without repeating actor name', () => {
    expect(formatActivity(activity({ action: 'agent_run_started' }))).toBe('开始处理此任务');
    expect(formatActivity(activity({ action: 'agent_run_completed' }))).toBe('已完成此任务');
    expect(formatActivity(activity({ action: 'agent_run_failed' }))).toBe('处理失败');
  });

  it('preserves explicit assignment and project text', () => {
    expect(formatActivity(activity({ action: 'assigned', text: '分配给 Cursor' }))).toBe('分配给 Cursor');
    expect(formatActivity(activity({ action: 'project_changed', text: '移动到项目「Demo」' }))).toBe('移动到项目「Demo」');
  });
});
