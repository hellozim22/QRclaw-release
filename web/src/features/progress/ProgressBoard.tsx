'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import {
  createProgressTask,
  moveProgressTask,
} from './task-store';
import { DEFAULT_PROJECT_ID } from './project-types';
import {
  createProgressProject,
  ensureDefaultProject,
  getProgressProject,
  listProgressProjects,
  subscribeProgressProjects,
} from './project-store';
import { ProgressBoardHeader } from './ProgressBoardHeader';
import { DragCard, TaskCard } from './TaskCard';
import {
  STATUS_META,
  TASK_STATUSES,
  type ProgressTask,
  type TaskStatus,
} from './types';

const byPosition = (a: ProgressTask, b: ProgressTask) => a.position - b.position;

function computeNextPosition(tasks: ProgressTask[], status: TaskStatus): number {
  const inColumn = tasks.filter((task) => task.status === status);
  return inColumn.length > 0 ? Math.max(...inColumn.map((task) => task.position)) + 1 : 1;
}

function filterTasksByProject(
  tasks: ProgressTask[],
  projectFilter: string[],
  includeNoProject: boolean,
): ProgressTask[] {
  if (projectFilter.length === 0 && !includeNoProject) return tasks;
  return tasks.filter((task) => {
    if (!task.projectId) return includeNoProject;
    return projectFilter.length === 0 || projectFilter.includes(task.projectId);
  });
}

function Column({
  status,
  tasks,
  getProject,
  getAgent,
  isAgentOnline,
  onSelectTask,
}: {
  status: TaskStatus;
  tasks: ProgressTask[];
  getProject: (projectId: string | null) => ReturnType<typeof getProgressProject>;
  getAgent: (agentId: string | null) => OwnerAgentSummary | null;
  isAgentOnline: (agentId: string | null) => boolean;
  onSelectTask: (task: ProgressTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <section
      ref={setNodeRef}
      data-testid={`progress-column-${status}`}
      style={{
        minWidth: 264,
        width: 264,
        borderRadius: 'var(--radius-xl)',
        background: isOver ? 'var(--color-red-bg)' : 'var(--color-off-white)',
        border: '1px solid var(--color-gray-border)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <header>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'var(--color-gray-800)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          <span>{meta.title}</span>
          <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-sm)' }}>
            {tasks.length}
          </span>
        </div>
        <div style={{ marginTop: 2, color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
          {meta.hint}
        </div>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              project={getProject(task.projectId)}
              agent={getAgent(task.agentId)}
              agentOnline={isAgentOnline(task.agentId)}
              onClick={() => onSelectTask(task)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

export function ProgressBoard({
  tasks,
  onTasksChange,
}: {
  tasks: ProgressTask[];
  onTasksChange: () => void;
}) {
  const router = useRouter();
  const [activeTask, setActiveTask] = useState<ProgressTask | null>(null);
  const [projects, setProjects] = useState(() => {
    ensureDefaultProject();
    return listProgressProjects();
  });
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [includeNoProject, setIncludeNoProject] = useState(false);
  const agents = useOwnerAgentChatStore((state) => state.agents);
  const statusByAgent = useOwnerAgentChatStore((state) => state.statusByAgent);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    const reload = () => setProjects(listProgressProjects());
    reload();
    return subscribeProgressProjects(reload);
  }, []);

  const filteredTasks = useMemo(
    () => filterTasksByProject(tasks, projectFilter, includeNoProject),
    [tasks, projectFilter, includeNoProject],
  );

  const tasksByStatus = useMemo(() => {
    return Object.fromEntries(
      TASK_STATUSES.map((status) => [
        status,
        filteredTasks.filter((task) => task.status === status).sort(byPosition),
      ]),
    ) as Record<TaskStatus, ProgressTask[]>;
  }, [filteredTasks]);

  const getAgent = (agentId: string | null): OwnerAgentSummary | null =>
    agentId ? agents.find((agent) => agent.id === agentId) ?? null : null;

  const isAgentOnline = (agentId: string | null): boolean => {
    if (!agentId) return false;
    const status = statusByAgent[agentId];
    return status === 'online' || status === 'running';
  };

  const toggleProject = (projectId: string) => {
    setProjectFilter((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  };

  const createProject = (input: { title: string; icon?: string | null }) => {
    const project = createProgressProject(input);
    if (!project) return;
    setProjects(listProgressProjects());
    setProjectFilter([project.id]);
    setIncludeNoProject(false);
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((task) => task.id === event.active.id) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = tasks.find((item) => item.id === event.active.id);
    const overId = String(event.over?.id ?? '');
    setActiveTask(null);
    if (!task || !overId) return;

    const targetTask = tasks.find((item) => item.id === overId);
    const nextStatus = (targetTask?.status ?? overId) as TaskStatus;
    if (!TASK_STATUSES.includes(nextStatus)) return;

    moveProgressTask(task.id, nextStatus, targetTask?.position ?? computeNextPosition(tasks, nextStatus));
    onTasksChange();
  };

  const createTask = () => {
    const projectId = projectFilter.length === 1 && !includeNoProject
      ? projectFilter[0]
      : DEFAULT_PROJECT_ID;
    const task = createProgressTask({
      title: '新任务',
      description: '',
      status: 'todo',
      priority: 'medium',
      projectId,
    });
    onTasksChange();
    router.push(`/progress/${task.id}`);
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, background: 'var(--color-white)' }}>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <ProgressBoardHeader
          projects={projects}
          projectFilter={projectFilter}
          includeNoProject={includeNoProject}
          onToggleProject={toggleProject}
          onToggleNoProject={() => setIncludeNoProject((value) => !value)}
          onCreateProject={createProject}
          onCreateTask={createTask}
        />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div
            data-testid="progress-board"
            style={{
              flex: 1,
              minHeight: 0,
              overflowX: 'auto',
              padding: 'var(--space-4) var(--space-5) var(--space-5)',
              display: 'flex',
              gap: 'var(--space-4)',
            }}
          >
            {TASK_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
                getProject={getProgressProject}
                getAgent={getAgent}
                isAgentOnline={isAgentOnline}
                onSelectTask={(task) => router.push(`/progress/${task.id}`)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div style={{ width: 264 }}>
                <DragCard
                  task={activeTask}
                  project={getProgressProject(activeTask.projectId)}
                  agent={getAgent(activeTask.agentId)}
                  agentOnline={isAgentOnline(activeTask.agentId)}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}
