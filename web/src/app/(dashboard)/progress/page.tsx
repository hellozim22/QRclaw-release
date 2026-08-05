'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProgressBoard } from '@/features/progress/ProgressBoard';
import { listProgressTasks, subscribeProgressTasks } from '@/features/progress/task-store';
import type { ProgressTask } from '@/features/progress/types';

export default function ProgressPage() {
  // Lazy snapshot of the local task store; subscription below handles later changes.
  const [tasks, setTasks] = useState<ProgressTask[]>(() => listProgressTasks());

  const reload = useCallback(() => setTasks(listProgressTasks()), []);

  useEffect(() => subscribeProgressTasks(reload), [reload]);

  return (
    <section
      data-testid="progress-page"
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        background: 'var(--color-off-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <ProgressBoard tasks={tasks} onTasksChange={reload} />
    </section>
  );
}
