'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listProgressTasks,
  subscribeProgressTasks,
} from '@/features/progress/task-store';
import {
  STATUS_META,
  TASK_STATUSES,
  type ProgressTask,
  type TaskStatus,
} from '@/features/progress/types';
import { getProgressProject } from '@/features/progress/project-store';

const byPosition = (a: ProgressTask, b: ProgressTask) => a.position - b.position;

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export default function ProgressStatusPage() {
  const router = useRouter();
  const params = useParams<{ status: string }>();
  const statusParam = String(params.status ?? '');
  const [tasks, setTasks] = useState<ProgressTask[]>([]);

  useEffect(() => {
    if (!isTaskStatus(statusParam)) {
      router.replace('/progress');
      return;
    }
    const reload = () => setTasks(listProgressTasks());
    reload();
    return subscribeProgressTasks(reload);
  }, [statusParam, router]);

  const statusTasks = useMemo(() => {
    if (!isTaskStatus(statusParam)) return [];
    return tasks.filter((task) => task.status === statusParam).sort(byPosition);
  }, [tasks, statusParam]);

  if (!isTaskStatus(statusParam)) return null;

  return (
    <section
      data-testid={`progress-status-page-${statusParam}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        background: 'var(--color-off-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-gray-border)',
          background: 'var(--color-white)',
        }}
      >
        <button
          type="button"
          data-testid="progress-status-back"
          onClick={() => router.push('/progress')}
          style={{
            border: '1px solid var(--color-gray-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-white)',
            color: 'var(--color-gray-700)',
            padding: '6px 10px',
            cursor: 'pointer',
            fontFamily: 'var(--font-primary)',
          }}
        >
          Back
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-gray-800)',
          }}
        >
          {STATUS_META[statusParam].title}
        </h1>
        <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-sm)' }}>
          {statusTasks.length}
        </span>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {statusTasks.length === 0 ? (
          <p style={{ color: 'var(--color-gray-500)', margin: 0 }}>No tasks</p>
        ) : (
          statusTasks.map((task) => {
            const project = getProgressProject(task.projectId);
            return (
              <button
                key={task.id}
                type="button"
                data-testid={`progress-status-task-${task.id}`}
                onClick={() => router.push(`/progress/${task.id}`)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  alignItems: 'flex-start',
                  width: '100%',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-gray-border)',
                  background: 'var(--color-white)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-primary)',
                }}
              >
                <span
                  style={{
                    color: 'var(--color-gray-600)',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {task.identifier}
                </span>
                <span
                  style={{
                    color: 'var(--color-gray-800)',
                    fontSize: 'var(--text-md)',
                    fontWeight: 'var(--font-semibold)',
                  }}
                >
                  {task.title}
                </span>
                {project ? (
                  <span style={{ color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
                    {project.icon ?? '📁'} {project.title}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
