'use client';

import type {
  ProgressActivity,
  ProgressComment,
  ProgressTask,
  TaskPriority,
  TaskStatus,
} from './types';
import { DEFAULT_PROJECT_ID } from './project-types';
import { ensureDefaultProject, getProgressProject } from './project-store';
import { fetchLocalProgressState, postLocalProgressAction } from './local-progress-api';
import { normalizeProgressMarkdownText } from '@/lib/progress-markdown';
import { legacyTasksStorageKey, tasksStorageKey } from './storage-keys';

const EVENT_NAME = 'bibisheng-progress-tasks-changed';
const SYNC_INTERVAL_MS = 2000;

const nowIso = () => new Date().toISOString();

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let hydrating = false;
let hydrated = false;

const compactTitle = (text: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '新任务';
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized;
};

const nextIdentifier = (tasks: ProgressTask[]): string => {
  const max = tasks.reduce((acc, task) => {
    const match = task.identifier.match(/TASK-(\d+)/);
    return Math.max(acc, match ? Number(match[1]) : 0);
  }, 0);
  return `TASK-${String(max + 1).padStart(3, '0')}`;
};

const normalizeActivity = (activity: Partial<ProgressActivity>): ProgressActivity => ({
  id: activity.id ?? makeId(),
  at: activity.at ?? nowIso(),
  actorType: activity.actorType ?? 'system',
  actorName: activity.actorName ?? null,
  actorId: activity.actorId ?? null,
  action: activity.action ?? 'updated',
  text: activity.text ?? '任务已更新',
});

const normalizeStoredTask = (
  task: Omit<ProgressTask, 'status'> & { projectId?: string | null; status?: string }
): ProgressTask => {
  const rawStatus = typeof task.status === 'string' ? task.status : 'todo';
  const status: TaskStatus = rawStatus === 'backlog' ? 'todo' : (rawStatus as TaskStatus);

  return {
    ...task,
    status,
    projectId: task.projectId === undefined ? DEFAULT_PROJECT_ID : task.projectId,
    description: normalizeProgressMarkdownText(task.description ?? ''),
    activity: Array.isArray(task.activity) ? task.activity.map(normalizeActivity) : [],
    comments: Array.isArray(task.comments)
      ? task.comments.map((comment) => ({
          ...comment,
          content: normalizeProgressMarkdownText(comment.content),
        }))
      : [],
  };
};

const readTasksFromKey = (key: string): ProgressTask[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProgressTask[];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredTask) : [];
  } catch {
    return [];
  }
};

const migrateLegacyTasks = () => {
  if (typeof window === 'undefined') return;
  const nextKey = tasksStorageKey();
  if (window.localStorage.getItem(nextKey)) return;

  const legacyTasks = readTasksFromKey(legacyTasksStorageKey());
  if (legacyTasks.length === 0) return;

  ensureDefaultProject();
  window.localStorage.setItem(nextKey, JSON.stringify(legacyTasks));
  window.localStorage.removeItem(legacyTasksStorageKey());
};

export const notifyProgressTaskChange = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT_NAME));
};

export const subscribeProgressTasks = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  const interval = window.setInterval(() => {
    void hydrateTasksFromLocalApi(true);
  }, SYNC_INTERVAL_MS);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
};

const writeLocalTasksFromApi = (tasks: ProgressTask[]) => {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(tasks.map(normalizeStoredTask));
  if (window.localStorage.getItem(tasksStorageKey()) === serialized) return;
  window.localStorage.setItem(tasksStorageKey(), serialized);
  notifyProgressTaskChange();
};

export const hydrateTasksFromLocalApi = async (force = false): Promise<void> => {
  if (typeof window === 'undefined' || hydrating || (hydrated && !force)) return;
  hydrating = true;
  try {
    const state = await fetchLocalProgressState();
    if (!state) return;
    const local = readTasksFromKey(tasksStorageKey());
    if (state.tasks.length === 0 && local.length > 0) {
      postLocalProgressAction({ action: 'replace_tasks', tasks: local });
      return;
    }
    writeLocalTasksFromApi(state.tasks);
    hydrated = true;
  } finally {
    hydrating = false;
  }
};

export const listProgressTasks = (): ProgressTask[] => {
  if (typeof window === 'undefined') return [];
  ensureDefaultProject();
  migrateLegacyTasks();
  void hydrateTasksFromLocalApi();
  return readTasksFromKey(tasksStorageKey());
};

export const getProgressTask = (taskId: string): ProgressTask | null => {
  return listProgressTasks().find((task) => task.id === taskId) ?? null;
};

export const saveProgressTasks = (
  tasks: ProgressTask[],
  options: { persistReplace?: boolean } = {}
) => {
  if (typeof window === 'undefined') return;
  ensureDefaultProject();
  const normalized = tasks.map(normalizeStoredTask);
  window.localStorage.setItem(tasksStorageKey(), JSON.stringify(normalized));
  if (options.persistReplace ?? true) {
    postLocalProgressAction({ action: 'replace_tasks', tasks: normalized });
  }
  notifyProgressTaskChange();
};

type ProgressTaskPatch = Partial<
  Pick<
    ProgressTask,
    | 'title'
    | 'description'
    | 'status'
    | 'priority'
    | 'position'
    | 'agentId'
    | 'agentName'
    | 'projectId'
  >
>;

const describePatch = (task: ProgressTask, patch: ProgressTaskPatch) => {
  if (patch.status && patch.status !== task.status) {
    return { action: 'status_changed', text: `状态更新为 ${patch.status}` };
  }
  if (patch.priority && patch.priority !== task.priority) {
    return { action: 'priority_changed', text: `优先级更新为 ${patch.priority}` };
  }
  if ('agentId' in patch || 'agentName' in patch) {
    return { action: 'assigned', text: patch.agentName ? `分配给 ${patch.agentName}` : '取消分配' };
  }
  if ('projectId' in patch && patch.projectId !== task.projectId) {
    const projectTitle = patch.projectId
      ? (getProgressProject(patch.projectId)?.title ?? '未知项目')
      : '未分组';
    return { action: 'project_changed', text: `移动到项目「${projectTitle}」` };
  }
  return { action: 'updated', text: '任务已更新' };
};

const normalizePositions = (tasks: ProgressTask[]): ProgressTask[] => {
  const byStatus = new Map<string, ProgressTask[]>();
  for (const task of tasks) {
    byStatus.set(task.status, [...(byStatus.get(task.status) ?? []), task]);
  }
  const normalized: ProgressTask[] = [];
  for (const group of byStatus.values()) {
    group
      .sort((a, b) => a.position - b.position || Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .forEach((task, index) => normalized.push({ ...task, position: index + 1 }));
  }
  return normalized;
};

export const deleteProgressTask = (taskId: string): boolean => {
  const tasks = listProgressTasks();
  const next = tasks.filter((task) => task.id !== taskId);
  if (next.length === tasks.length) return false;
  saveProgressTasks(normalizePositions(next), { persistReplace: false });
  postLocalProgressAction({ action: 'delete_task', taskId });
  return true;
};

export const createProgressTask = (input: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  sourceMessage?: string | null;
}): ProgressTask => {
  const tasks = listProgressTasks();
  const timestamp = nowIso();
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  const description = normalizeProgressMarkdownText(input.description ?? input.sourceMessage ?? '');
  const task: ProgressTask = {
    id: makeId(),
    identifier: nextIdentifier(tasks),
    title: compactTitle(input.title),
    description,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'medium',
    position:
      Math.max(
        0,
        ...tasks
          .filter((item) => item.status === (input.status ?? 'todo'))
          .map((item) => item.position)
      ) + 1,
    projectId,
    agentId: input.agentId ?? null,
    agentName: input.agentName ?? null,
    sourceMessage: input.sourceMessage ?? null,
    activity: [
      {
        id: makeId(),
        at: timestamp,
        actorType: input.agentName ? 'agent' : 'owner',
        actorName: input.agentName ?? 'You',
        actorId: input.agentId ?? null,
        action: input.agentName ? 'agent_run_started' : 'created',
        text: input.agentName ? '开始处理此任务' : `创建任务：${compactTitle(input.title)}`,
      },
    ],
    comments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  saveProgressTasks(normalizePositions([...tasks, task]), { persistReplace: false });
  postLocalProgressAction({ action: 'create_task', input: task });
  return task;
};

export const updateProgressTask = (
  taskId: string,
  patch: ProgressTaskPatch,
  options: { recordActivity?: boolean } = {}
): ProgressTask | null => {
  const tasks = listProgressTasks();
  let updated: ProgressTask | null = null;
  const timestamp = nowIso();
  const normalizedPatch: ProgressTaskPatch = {
    ...patch,
    ...(patch.description === undefined
      ? {}
      : { description: normalizeProgressMarkdownText(patch.description) }),
  };
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    const recordActivity = options.recordActivity ?? true;
    const activityMeta = describePatch(task, normalizedPatch);
    const activity = recordActivity
      ? [
          ...task.activity,
          {
            id: makeId(),
            at: timestamp,
            actorType: 'owner' as const,
            actorName: 'You',
            actorId: null,
            action: activityMeta.action,
            text: activityMeta.text,
          },
        ]
      : task.activity;
    updated = {
      ...task,
      ...normalizedPatch,
      updatedAt: timestamp,
      activity,
    };
    return updated;
  });
  saveProgressTasks(normalizePositions(next), { persistReplace: false });
  if (updated) {
    postLocalProgressAction({
      action: 'update_task',
      taskId,
      patch: normalizedPatch,
      actorName: normalizedPatch.agentName ?? 'You',
      actorType: 'owner',
      recordActivity: options.recordActivity ?? true,
    });
  }
  return updated;
};

export const appendProgressTaskActivity = (
  taskId: string,
  activity: Omit<ProgressActivity, 'id' | 'at'> & { at?: string }
): ProgressTask | null => {
  const tasks = listProgressTasks();
  let updated: ProgressTask | null = null;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    updated = {
      ...task,
      updatedAt: nowIso(),
      activity: [
        ...task.activity,
        {
          id: makeId(),
          at: activity.at ?? nowIso(),
          actorType: activity.actorType ?? 'system',
          actorName: activity.actorName ?? null,
          actorId: activity.actorId ?? null,
          action: activity.action,
          text: activity.text,
        },
      ],
    };
    return updated;
  });
  saveProgressTasks(next, { persistReplace: false });
  postLocalProgressAction({ action: 'append_activity', taskId, activity });
  return updated;
};

export const addProgressTaskComment = (
  taskId: string,
  content: string,
  authorName = 'You'
): ProgressComment | null => {
  const trimmed = normalizeProgressMarkdownText(content).trim();
  if (!trimmed) return null;
  const comment: ProgressComment = {
    id: makeId(),
    at: nowIso(),
    authorName,
    content: trimmed,
  };
  const tasks = listProgressTasks();
  let added = false;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    added = true;
    return {
      ...task,
      comments: [...(task.comments ?? []), comment],
      activity: [
        ...task.activity,
        {
          id: makeId(),
          at: comment.at,
          actorType: 'owner' as const,
          actorName: authorName,
          action: 'commented',
          text: '新增评论',
        },
      ],
      updatedAt: nowIso(),
    };
  });
  if (!added) return null;
  saveProgressTasks(next, { persistReplace: false });
  postLocalProgressAction({
    action: 'add_comment',
    taskId,
    content: trimmed,
    authorName,
  });
  return comment;
};

export const updateProgressTaskComment = (
  taskId: string,
  commentId: string,
  content: string
): ProgressComment | null => {
  const trimmed = normalizeProgressMarkdownText(content).trim();
  if (!trimmed) return null;
  const tasks = listProgressTasks();
  let updated: ProgressComment | null = null;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    const comments = (task.comments ?? []).map((comment) => {
      if (comment.id !== commentId) return comment;
      updated = { ...comment, content: trimmed };
      return updated;
    });
    return { ...task, comments, updatedAt: nowIso() };
  });
  saveProgressTasks(next);
  return updated;
};

const formatLegacyChatTaskDescription = (input: { agentName: string; content: string }): string => {
  const normalized = input.content.trim();
  return [
    '## 任务背景',
    `来自与 ${input.agentName} 的对话。当前仅保留原始请求作为背景，后续应由上下文总结器补充完整背景。`,
    '',
    '## 任务详情',
    normalized || '待补充',
    '',
    '## 任务解决进度',
    '- 已识别为可能需要跟进的任务',
    '- 尚未开始执行，等待进一步拆解或确认',
  ].join('\n');
};

export const ensureProgressTaskForMessage = (input: {
  agentId: string;
  agentName: string;
  content: string;
  projectId?: string | null;
}): ProgressTask => {
  const tasks = listProgressTasks();
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  const existing = tasks.find(
    (task) =>
      task.agentId === input.agentId &&
      task.sourceMessage === input.content &&
      task.status !== 'done'
  );
  if (existing) {
    const updated = updateProgressTask(existing.id, { status: 'in_progress' });
    if (updated) return updated;
  }
  return createProgressTask({
    title: input.content,
    description: formatLegacyChatTaskDescription(input),
    status: 'in_progress',
    priority: 'medium',
    projectId,
    agentId: input.agentId,
    agentName: input.agentName,
    sourceMessage: input.content,
  });
};

export const moveProgressTask = (
  taskId: string,
  status: TaskStatus,
  position: number
): ProgressTask | null => {
  const tasks = listProgressTasks();
  let updated: ProgressTask | null = null;
  const next = normalizePositions(
    tasks.map((task) => {
      if (task.id !== taskId) return task;
      updated = {
        ...task,
        status,
        position,
        updatedAt: nowIso(),
        activity: [
          ...task.activity,
          {
            id: makeId(),
            at: nowIso(),
            actorType: 'owner',
            actorName: 'You',
            actorId: null,
            action: 'status_changed',
            text: `移动到 ${status}`,
          },
        ],
      };
      return updated;
    })
  );
  saveProgressTasks(next, { persistReplace: false });
  if (updated) {
    postLocalProgressAction({
      action: 'update_task',
      taskId,
      patch: { status, position },
      actorName: 'You',
      actorType: 'owner',
      recordActivity: true,
    });
  }
  return updated ? (next.find((task) => task.id === taskId) ?? updated) : null;
};
