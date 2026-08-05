export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'blocked',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface ProgressActivity {
  id: string;
  at: string;
  text: string;
  actorType: 'owner' | 'agent' | 'system';
  actorName: string | null;
  actorId?: string | null;
  action: string;
}

export interface ProgressComment {
  id: string;
  at: string;
  authorName: string;
  content: string;
}

export interface ProgressTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  projectId: string | null;
  agentId: string | null;
  agentName: string | null;
  sourceMessage: string | null;
  activity: ProgressActivity[];
  comments?: ProgressComment[];
  createdAt: string;
  updatedAt: string;
}

export const STATUS_META: Record<TaskStatus, { title: string }> = {
  todo: { title: 'Todo' },
  in_progress: { title: 'In Progress' },
  in_review: { title: 'In Review' },
  done: { title: 'Done' },
  blocked: { title: 'Blocked' },
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};
