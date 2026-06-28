import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_TITLE,
  type ProgressProject,
} from '@/features/progress/project-types';
import {
  TASK_STATUSES,
  type ProgressActivity,
  type ProgressComment,
  type ProgressTask,
  type TaskPriority,
  type TaskStatus,
} from '@/features/progress/types';
import { normalizeProgressMarkdownText } from './progress-markdown';

export interface LocalProgressState {
  tasks: ProgressTask[];
  projects: ProgressProject[];
  updatedAt: string;
}

export type LocalProgressAction =
  | { action: 'replace_tasks'; tasks: ProgressTask[] }
  | { action: 'replace_projects'; projects: ProgressProject[] }
  | { action: 'import_state'; tasks?: ProgressTask[]; projects?: ProgressProject[] }
  | {
      action: 'create_task';
      input: {
        id?: string;
        identifier?: string;
        title: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        projectId?: string | null;
        agentId?: string | null;
        agentName?: string | null;
        sourceMessage?: string | null;
      };
    }
  | {
      action: 'update_task';
      taskId: string;
      patch: Partial<Pick<ProgressTask, 'title' | 'description' | 'status' | 'priority' | 'position' | 'agentId' | 'agentName' | 'projectId'>>;
      actorName?: string;
      actorType?: 'owner' | 'agent' | 'system';
      recordActivity?: boolean;
    }
  | { action: 'delete_task'; taskId: string }
  | { action: 'add_comment'; taskId: string; content: string; authorName?: string }
  | { action: 'append_activity'; taskId: string; activity: Omit<ProgressActivity, 'id' | 'at'> & { at?: string } }
  | { action: 'create_project'; input: { title: string; icon?: string | null; description?: string | null } };

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

const nowIso = () => new Date().toISOString();

const dataFilePath = (): string =>
  process.env.QRCLAW_LOCAL_PROGRESS_FILE?.trim() ||
  path.join(homedir(), '.config', 'qrclaw', 'progress.json');

const makeId = () => randomUUID();

const compactTitle = (text: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '新任务';
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized;
};

const defaultProject = (): ProgressProject => {
  const timestamp = nowIso();
  return {
    id: DEFAULT_PROJECT_ID,
    title: DEFAULT_PROJECT_TITLE,
    icon: DEFAULT_PROJECT_ICON,
    description: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const normalizeStatus = (value: unknown): TaskStatus =>
  typeof value === 'string' && TASK_STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : 'todo';

const normalizePriority = (value: unknown): TaskPriority =>
  typeof value === 'string' && PRIORITIES.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : 'medium';

const normalizeActivity = (activity: Partial<ProgressActivity>): ProgressActivity => ({
  id: typeof activity.id === 'string' && activity.id ? activity.id : makeId(),
  at: typeof activity.at === 'string' && activity.at ? activity.at : nowIso(),
  text: typeof activity.text === 'string' ? activity.text : '任务已更新',
  actorType:
    activity.actorType === 'owner' || activity.actorType === 'agent' || activity.actorType === 'system'
      ? activity.actorType
      : 'system',
  actorName: typeof activity.actorName === 'string' ? activity.actorName : null,
  actorId: typeof activity.actorId === 'string' ? activity.actorId : null,
  action: typeof activity.action === 'string' && activity.action ? activity.action : 'updated',
});

const normalizeComment = (comment: Partial<ProgressComment>): ProgressComment => ({
  id: typeof comment.id === 'string' && comment.id ? comment.id : makeId(),
  at: typeof comment.at === 'string' && comment.at ? comment.at : nowIso(),
  authorName: typeof comment.authorName === 'string' && comment.authorName ? comment.authorName : 'You',
  content: typeof comment.content === 'string' ? normalizeProgressMarkdownText(comment.content) : '',
});

const normalizeProject = (project: Partial<ProgressProject>): ProgressProject => {
  const timestamp = nowIso();
  return {
    id: typeof project.id === 'string' && project.id ? project.id : makeId(),
    title: typeof project.title === 'string' && project.title.trim() ? project.title.trim() : DEFAULT_PROJECT_TITLE,
    icon: typeof project.icon === 'string' && project.icon.trim() ? project.icon.trim() : DEFAULT_PROJECT_ICON,
    description: typeof project.description === 'string' && project.description.trim() ? project.description.trim() : null,
    createdAt: typeof project.createdAt === 'string' ? project.createdAt : timestamp,
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : timestamp,
  };
};

const nextIdentifier = (tasks: ProgressTask[]): string => {
  const max = tasks.reduce((acc, task) => {
    const match = task.identifier.match(/TASK-(\d+)/);
    return Math.max(acc, match ? Number(match[1]) : 0);
  }, 0);
  return `TASK-${String(max + 1).padStart(3, '0')}`;
};

const normalizeTask = (task: Partial<ProgressTask>): ProgressTask => {
  const timestamp = nowIso();
  const title = typeof task.title === 'string' && task.title.trim() ? task.title.trim() : '新任务';
  return {
    id: typeof task.id === 'string' && task.id ? task.id : makeId(),
    identifier: typeof task.identifier === 'string' && task.identifier ? task.identifier : 'TASK-000',
    title: compactTitle(title),
    description: typeof task.description === 'string' ? normalizeProgressMarkdownText(task.description) : '',
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    position: typeof task.position === 'number' && Number.isFinite(task.position) ? task.position : 1,
    projectId: task.projectId === null || typeof task.projectId === 'string' ? task.projectId : DEFAULT_PROJECT_ID,
    agentId: task.agentId === null || typeof task.agentId === 'string' ? task.agentId : null,
    agentName: task.agentName === null || typeof task.agentName === 'string' ? task.agentName : null,
    sourceMessage: task.sourceMessage === null || typeof task.sourceMessage === 'string' ? task.sourceMessage : null,
    activity: Array.isArray(task.activity) ? task.activity.map(normalizeActivity) : [],
    comments: Array.isArray(task.comments) ? task.comments.map(normalizeComment).filter((item) => item.content.trim()) : [],
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : timestamp,
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : timestamp,
  };
};

const ensureDefaultProject = (projects: ProgressProject[]): ProgressProject[] => {
  if (projects.some((project) => project.id === DEFAULT_PROJECT_ID)) return projects;
  return [defaultProject(), ...projects];
};

const normalizePositions = (tasks: ProgressTask[]): ProgressTask[] => {
  const byStatus = new Map<TaskStatus, ProgressTask[]>();
  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    byStatus.set(status, [...(byStatus.get(status) ?? []), { ...task, status }]);
  }
  const normalized: ProgressTask[] = [];
  for (const group of byStatus.values()) {
    group
      .sort((a, b) => a.position - b.position || Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .forEach((task, index) => normalized.push({ ...task, position: index + 1 }));
  }
  return normalized;
};

const normalizeState = (input: Partial<LocalProgressState>): LocalProgressState => ({
  tasks: normalizePositions(Array.isArray(input.tasks) ? input.tasks.map(normalizeTask) : []),
  projects: ensureDefaultProject(Array.isArray(input.projects) ? input.projects.map(normalizeProject) : []),
  updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : nowIso(),
});

export async function readLocalProgressState(): Promise<LocalProgressState> {
  try {
    const raw = await readFile(dataFilePath(), 'utf8');
    return normalizeState(JSON.parse(raw) as Partial<LocalProgressState>);
  } catch {
    return normalizeState({ tasks: [], projects: [] });
  }
}

async function writeLocalProgressState(state: LocalProgressState): Promise<LocalProgressState> {
  const normalized = normalizeState({ ...state, updatedAt: nowIso() });
  const file = dataFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

const describePatch = (task: ProgressTask, patch: LocalProgressAction & { action: 'update_task' }) => {
  if (patch.patch.status && patch.patch.status !== task.status) {
    return { action: 'status_changed', text: `状态更新为 ${patch.patch.status}` };
  }
  if (patch.patch.priority && patch.patch.priority !== task.priority) {
    return { action: 'priority_changed', text: `优先级更新为 ${patch.patch.priority}` };
  }
  if ('agentId' in patch.patch || 'agentName' in patch.patch) {
    return { action: 'assigned', text: patch.patch.agentName ? `分配给 ${patch.patch.agentName}` : '取消分配' };
  }
  if ('projectId' in patch.patch && patch.patch.projectId !== task.projectId) {
    return { action: 'project_changed', text: '任务项目已更新' };
  }
  return { action: 'updated', text: '任务已更新' };
};

let writeQueue: Promise<unknown> = Promise.resolve();

export async function applyLocalProgressAction(action: LocalProgressAction): Promise<{
  state: LocalProgressState;
  task?: ProgressTask | null;
  project?: ProgressProject | null;
  comment?: ProgressComment | null;
}> {
  const run = writeQueue.then(() => applyLocalProgressActionNow(action));
  writeQueue = run.catch(() => undefined);
  return run;
}

async function applyLocalProgressActionNow(action: LocalProgressAction): Promise<{
  state: LocalProgressState;
  task?: ProgressTask | null;
  project?: ProgressProject | null;
  comment?: ProgressComment | null;
}> {
  const current = await readLocalProgressState();
  const timestamp = nowIso();

  if (action.action === 'replace_tasks') {
    const state = await writeLocalProgressState({ ...current, tasks: action.tasks });
    return { state };
  }
  if (action.action === 'replace_projects') {
    const state = await writeLocalProgressState({ ...current, projects: action.projects });
    return { state };
  }
  if (action.action === 'import_state') {
    const state = await writeLocalProgressState({
      tasks: action.tasks ?? current.tasks,
      projects: action.projects ?? current.projects,
      updatedAt: timestamp,
    });
    return { state };
  }
  if (action.action === 'create_project') {
    const title = action.input.title.trim();
    if (!title) return { state: current, project: null };
    const project: ProgressProject = normalizeProject({
      id: makeId(),
      title,
      icon: action.input.icon ?? DEFAULT_PROJECT_ICON,
      description: action.input.description ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const state = await writeLocalProgressState({ ...current, projects: [...current.projects, project] });
    return { state, project };
  }
  if (action.action === 'create_task') {
    const status = normalizeStatus(action.input.status);
    const title = compactTitle(action.input.title);
    const task: ProgressTask = normalizeTask({
      id: action.input.id ?? makeId(),
      identifier: action.input.identifier ?? nextIdentifier(current.tasks),
      title,
      description: normalizeProgressMarkdownText(action.input.description ?? action.input.sourceMessage ?? ''),
      status,
      priority: action.input.priority ?? 'medium',
      position: Math.max(0, ...current.tasks.filter((item) => item.status === status).map((item) => item.position)) + 1,
      projectId: action.input.projectId ?? DEFAULT_PROJECT_ID,
      agentId: action.input.agentId ?? null,
      agentName: action.input.agentName ?? null,
      sourceMessage: action.input.sourceMessage ?? null,
      activity: [
        {
          id: makeId(),
          at: timestamp,
          actorType: action.input.agentName ? 'agent' : 'owner',
          actorName: action.input.agentName ?? 'You',
          actorId: action.input.agentId ?? null,
          action: action.input.agentName ? 'agent_run_started' : 'created',
          text: action.input.agentName ? '开始处理此任务' : `创建任务：${title}`,
        },
      ],
      comments: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const state = await writeLocalProgressState({ ...current, tasks: [...current.tasks, task] });
    return { state, task };
  }
  if (action.action === 'update_task') {
    let updated: ProgressTask | null = null;
    const patch = {
      ...action.patch,
      ...(action.patch.description === undefined
        ? {}
        : { description: normalizeProgressMarkdownText(action.patch.description) }),
    };
    const normalizedAction = { ...action, patch };
    const tasks = current.tasks.map((task) => {
      if (task.id !== action.taskId) return task;
      const recordActivity = action.recordActivity ?? true;
      const meta = describePatch(task, normalizedAction);
      updated = normalizeTask({
        ...task,
        ...patch,
        updatedAt: timestamp,
        activity: recordActivity
          ? [
              ...task.activity,
              {
                id: makeId(),
                at: timestamp,
                actorType: action.actorType ?? 'agent',
                actorName: action.actorName ?? 'Agent',
                actorId: patch.agentId ?? task.agentId,
                action: meta.action,
                text: meta.text,
              },
            ]
          : task.activity,
      });
      return updated;
    });
    const state = await writeLocalProgressState({ ...current, tasks });
    return { state, task: updated };
  }
  if (action.action === 'delete_task') {
    const next = current.tasks.filter((task) => task.id !== action.taskId);
    const state = await writeLocalProgressState({ ...current, tasks: next });
    return { state, task: null };
  }
  if (action.action === 'add_comment') {
    const content = normalizeProgressMarkdownText(action.content).trim();
    if (!content) return { state: current, comment: null };
    const comment: ProgressComment = {
      id: makeId(),
      at: timestamp,
      authorName: action.authorName?.trim() || 'Agent',
      content,
    };
    let found = false;
    const tasks = current.tasks.map((task) => {
      if (task.id !== action.taskId) return task;
      found = true;
      return normalizeTask({
        ...task,
        comments: [...(task.comments ?? []), comment],
        activity: [
          ...task.activity,
          {
            id: makeId(),
            at: timestamp,
            actorType: 'agent',
            actorName: comment.authorName,
            action: 'commented',
            text: '新增评论',
          },
        ],
        updatedAt: timestamp,
      });
    });
    if (!found) return { state: current, comment: null };
    const state = await writeLocalProgressState({ ...current, tasks });
    return { state, comment };
  }
  if (action.action === 'append_activity') {
    let updated: ProgressTask | null = null;
    const tasks = current.tasks.map((task) => {
      if (task.id !== action.taskId) return task;
      updated = normalizeTask({
        ...task,
        updatedAt: timestamp,
        activity: [...task.activity, normalizeActivity(action.activity)],
      });
      return updated;
    });
    const state = await writeLocalProgressState({ ...current, tasks });
    return { state, task: updated };
  }

  return { state: current };
}
