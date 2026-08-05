'use client';

import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_TITLE,
  type ProgressProject,
} from './project-types';
import { fetchLocalProgressState, postLocalProgressAction } from './local-progress-api';
import { projectsStorageKey } from './storage-keys';

const EVENT_NAME = 'bibisheng-progress-projects-changed';
const SYNC_INTERVAL_MS = 2000;

const nowIso = () => new Date().toISOString();

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let hydrating = false;
let hydrated = false;

export const notifyProgressProjectChange = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT_NAME));
};

export const subscribeProgressProjects = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  const interval = window.setInterval(() => {
    void hydrateProjectsFromLocalApi(true);
  }, SYNC_INTERVAL_MS);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
};

const saveProjects = (projects: ProgressProject[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(projectsStorageKey(), JSON.stringify(projects));
  postLocalProgressAction({ action: 'replace_projects', projects });
  notifyProgressProjectChange();
};

export const makeDefaultProject = (): ProgressProject => {
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

const readLocalProjects = (): ProgressProject[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(projectsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProgressProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalProjectsFromApi = (projects: ProgressProject[]) => {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(projects);
  if (window.localStorage.getItem(projectsStorageKey()) === serialized) return;
  window.localStorage.setItem(projectsStorageKey(), serialized);
  notifyProgressProjectChange();
};

export const hydrateProjectsFromLocalApi = async (force = false): Promise<void> => {
  if (typeof window === 'undefined' || hydrating || (hydrated && !force)) return;
  hydrating = true;
  try {
    const state = await fetchLocalProgressState();
    if (!state) return;
    const local = readLocalProjects();
    const remoteOnlyDefault =
      state.projects.length === 0 ||
      (state.projects.length === 1 && state.projects[0]?.id === DEFAULT_PROJECT_ID);
    if (remoteOnlyDefault && local.length > 0) {
      postLocalProgressAction({ action: 'replace_projects', projects: local });
      return;
    }
    writeLocalProjectsFromApi(state.projects);
    hydrated = true;
  } finally {
    hydrating = false;
  }
};

export const listProgressProjects = (): ProgressProject[] => {
  if (typeof window === 'undefined') return [];
  void hydrateProjectsFromLocalApi();
  return readLocalProjects();
};

export const ensureDefaultProject = (): ProgressProject => {
  const projects = listProgressProjects();
  const existing = projects.find((project) => project.id === DEFAULT_PROJECT_ID);
  if (existing) return existing;

  const defaultProject = makeDefaultProject();
  saveProjects([defaultProject, ...projects]);
  return defaultProject;
};

export const getProgressProject = (
  projectId: string | null | undefined
): ProgressProject | null => {
  if (!projectId) return null;
  const projects = listProgressProjects();
  return projects.find((project) => project.id === projectId) ?? null;
};

export const createProgressProject = (input: {
  title: string;
  icon?: string | null;
  description?: string | null;
}): ProgressProject | null => {
  const title = input.title.trim();
  if (!title) return null;

  const timestamp = nowIso();
  const project: ProgressProject = {
    id: makeId(),
    title,
    icon: input.icon?.trim() || DEFAULT_PROJECT_ICON,
    description: input.description?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  saveProjects([...listProgressProjects(), project]);
  return project;
};

export const updateProgressProject = (
  projectId: string,
  patch: Partial<Pick<ProgressProject, 'title' | 'icon' | 'description'>>
): ProgressProject | null => {
  const projects = listProgressProjects();
  let updated: ProgressProject | null = null;
  const next = projects.map((project) => {
    if (project.id !== projectId) return project;
    updated = {
      ...project,
      ...patch,
      title: patch.title?.trim() || project.title,
      icon: patch.icon === undefined ? project.icon : patch.icon?.trim() || DEFAULT_PROJECT_ICON,
      description:
        patch.description === undefined ? project.description : patch.description?.trim() || null,
      updatedAt: nowIso(),
    };
    return updated;
  });
  saveProjects(next);
  return updated;
};

export const deleteProgressProject = (projectId: string): boolean => {
  if (projectId === DEFAULT_PROJECT_ID) return false;
  const projects = listProgressProjects();
  const next = projects.filter((project) => project.id !== projectId);
  if (next.length === projects.length) return false;
  saveProjects(next);
  return true;
};
