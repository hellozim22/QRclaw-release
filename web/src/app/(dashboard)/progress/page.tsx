'use client';

import { useEffect, useState } from 'react';
import { ProgressBoard } from '@/features/progress/ProgressBoard';
import {
  listProgressTasks,
  subscribeProgressTasks,
} from '@/features/progress/task-store';
import type { ProgressTask } from '@/features/progress/types';

export default function ProgressPage() {
  const [tasks, setTasks] = useState<ProgressTask[]>([]);

  const reload = () => setTasks(listProgressTasks());

  useEffect(() => {
    reload();
    return subscribeProgressTasks(reload);
  }, []);

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
