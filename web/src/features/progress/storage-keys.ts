'use client';

const OWNER_ID_KEY = 'bibisheng.local.ownerId';
const LEGACY_TASKS_STORAGE_KEY = 'bibisheng.progress.tasks.v1';
const TASKS_EVENT_NAME = 'bibisheng-progress-tasks-changed';
const PROJECTS_EVENT_NAME = 'bibisheng-progress-projects-changed';

export const DEFAULT_PROGRESS_OWNER_ID = 'local-dev';

export const getProgressOwnerId = (): string => {
  if (typeof window === 'undefined') return DEFAULT_PROGRESS_OWNER_ID;
  return window.localStorage.getItem(OWNER_ID_KEY) ?? DEFAULT_PROGRESS_OWNER_ID;
};

export const setProgressOwnerId = (ownerId: string) => {
  if (typeof window === 'undefined') return;
  const previousOwnerId = getProgressOwnerId();
  window.localStorage.setItem(OWNER_ID_KEY, ownerId);
  if (previousOwnerId !== ownerId) {
    migrateOwnerScopedKey(tasksStorageKey(previousOwnerId), tasksStorageKey(ownerId));
    migrateOwnerScopedKey(projectsStorageKey(previousOwnerId), projectsStorageKey(ownerId));
    window.dispatchEvent(new Event(TASKS_EVENT_NAME));
    window.dispatchEvent(new Event(PROJECTS_EVENT_NAME));
  }
};

export const tasksStorageKey = (ownerId = getProgressOwnerId()): string =>
  `bibisheng.progress.tasks.v2.${ownerId}`;

export const projectsStorageKey = (ownerId = getProgressOwnerId()): string =>
  `bibisheng.progress.projects.v1.${ownerId}`;

export const legacyTasksStorageKey = (): string => LEGACY_TASKS_STORAGE_KEY;

const migrateOwnerScopedKey = (fromKey: string, toKey: string) => {
  if (typeof window === 'undefined' || fromKey === toKey) return;
  const fromValue = window.localStorage.getItem(fromKey);
  const toValue = window.localStorage.getItem(toKey);
  if (!fromValue || toValue) return;
  window.localStorage.setItem(toKey, fromValue);
};
