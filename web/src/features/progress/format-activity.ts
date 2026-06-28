import type { ProgressActivity } from './types';

export const formatActivity = (entry: ProgressActivity): string => {
  switch (entry.action) {
    case 'agent_run_started':
      return '开始处理此任务';
    case 'agent_run_completed':
      return '已完成此任务';
    case 'agent_run_failed':
      return '处理失败';
    case 'assigned':
    case 'project_changed':
    case 'status_changed':
    case 'priority_changed':
    case 'commented':
      return entry.text;
    case 'created':
      return entry.text || '创建了任务';
    default:
      return entry.text || '任务已更新';
  }
};
