'use client';

import type { ProgressProject } from './project-types';
import type { ProgressTask } from './types';

export interface LocalProgressState {
  tasks: ProgressTask[];
  projects: ProgressProject[];
  updatedAt: string;
}

type LocalProgressAction =
  | { action: 'replace_tasks'; tasks: ProgressTask[] }
  | { action: 'replace_projects'; projects: ProgressProject[] }
  | { action: 'import_state'; tasks?: ProgressTask[]; projects?: ProgressProject[] }
  | { action: 'create_task'; input: Partial<ProgressTask> & { title: string } }
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
  | { action: 'append_activity'; taskId: string; activity: Omit<ProgressTask['activity'][number], 'id' | 'at'> & { at?: string } }
  | { action: 'create_project'; input: Partial<ProgressProject> & { title: string } };

const API_PATH = '/api/local/progress';

export async function fetchLocalProgressState(): Promise<LocalProgressState | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(API_PATH, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: LocalProgressState };
    if (!body.data || !Array.isArray(body.data.tasks) || !Array.isArray(body.data.projects)) {
      return null;
    }
    return body.data;
  } catch {
    return null;
  }
}

export function postLocalProgressAction(action: LocalProgressAction): void {
  if (typeof window === 'undefined') return;
  void fetch(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  }).catch(() => undefined);
}
