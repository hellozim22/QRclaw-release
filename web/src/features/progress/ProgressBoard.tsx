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
  horizontalListSortingStrategy,
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
import { VISIBLE_TASKS_PER_ROW, visibleTasksForRow } from './row-visibility';
import { DragCard, TaskCard } from './TaskCard';
import {
  STATUS_META,
  TASK_STATUSES,
  type ProgressTask,
  type TaskStatus,
} from './types';

const CARD_WIDTH = 200;

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

function StatusRow({
  status,
  tasks,
  getProject,
  getAgent,
  isAgentOnline,
  onSelectTask,
  onOpenMore,
}: {
  status: TaskStatus;
  tasks: ProgressTask[];
  getProject: (projectId: string | null) => ReturnType<typeof getProgressProject>;
  getAgent: (agentId: string | null) => OwnerAgentSummary | null;
  isAgentOnline: (agentId: string | null) => boolean;
  onSelectTask: (task: ProgressTask) => void;
  onOpenMore: (status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const visible = visibleTasksForRow(tasks);
  const showMore = tasks.length > VISIBLE_TASKS_PER_ROW;

  return (
    <section
      ref={setNodeRef}
      data-testid={`progress-row-${status}`}
      style={{
        width: '100%',
        borderRadius: 'var(--radius-xl)',
        background: isOver ? 'var(--color-red-bg)' : 'var(--color-off-white)',
        border: '1px solid var(--color-gray-border)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--color-gray-800)',
          fontWeight: 'var(--font-semibold)',
        }}
      >
        <span>{STATUS_META[status].title}</span>
        <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-sm)' }}>
          {tasks.length}
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 'var(--space-2)',
        }}
      >
        <SortableContext items={visible.map((task) => task.id)} strategy={horizontalListSortingStrategy}>
          <div
            style={{
              display: 'flex',
              flex: 1,
              minWidth: 0,
              gap: 'var(--space-2)',
              alignItems: 'stretch',
            }}
          >
            {visible.map((task) => (
              <div key={task.id} style={{ width: CARD_WIDTH, flex: '0 0 auto' }}>
                <TaskCard
                  task={task}
                  project={getProject(task.projectId)}
                  agent={getAgent(task.agentId)}
                  agentOnline={isAgentOnline(task.agentId)}
                  onClick={() => onSelectTask(task)}
                />
              </div>
            ))}
          </div>
        </SortableContext>

        {showMore ? (
          <button
            type="button"
            data-testid={`progress-row-more-${status}`}
            aria-label={`View more ${STATUS_META[status].title} tasks`}
            onClick={() => onOpenMore(status)}
            style={{
              flex: '0 0 auto',
              width: 36,
              alignSelf: 'stretch',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--color-gray-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-white)',
              color: 'var(--color-gray-700)',
              fontSize: 'var(--text-lg)',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
            }}
          >
            &gt;
          </button>
        ) : null}
      </div>
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
              overflowY: 'auto',
              padding: 'var(--space-4) var(--space-5) var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {TASK_STATUSES.map((status) => (
              <StatusRow
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
                getProject={getProgressProject}
                getAgent={getAgent}
                isAgentOnline={isAgentOnline}
                onSelectTask={(task) => router.push(`/progress/${task.id}`)}
                onOpenMore={(next) => router.push(`/progress/status/${next}`)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div style={{ width: CARD_WIDTH }}>
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
