'use client';

import { useParams } from 'next/navigation';
import { TaskDetailView } from '@/features/progress/TaskDetailView';

export default function ProgressTaskPage() {
  const params = useParams<{ taskId: string }>();
  return <TaskDetailView taskId={params.taskId} />;
}
