import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProgressProject,
  deleteProgressProject,
  ensureDefaultProject,
  listProgressProjects,
  updateProgressProject,
} from './project-store';
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_TITLE,
} from './project-types';

describe('progress project store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('seeds the default project', () => {
    const project = ensureDefaultProject();

    expect(project.id).toBe(DEFAULT_PROJECT_ID);
    expect(project.title).toBe(DEFAULT_PROJECT_TITLE);
    expect(project.icon).toBe(DEFAULT_PROJECT_ICON);
    expect(listProgressProjects()).toHaveLength(1);
  });

  it('creates and updates a project', () => {
    ensureDefaultProject();
    const project = createProgressProject({ title: 'ECC 测试项目', icon: '🧪' });

    expect(project?.title).toBe('ECC 测试项目');
    expect(project?.icon).toBe('🧪');

    const updated = updateProgressProject(project!.id, {
      title: 'ECC 已更新项目',
      description: '用于项目筛选验证',
    });

    expect(updated?.title).toBe('ECC 已更新项目');
    expect(updated?.description).toBe('用于项目筛选验证');
  });

  it('does not delete the default project', () => {
    ensureDefaultProject();

    expect(deleteProgressProject(DEFAULT_PROJECT_ID)).toBe(false);
    expect(listProgressProjects()).toHaveLength(1);
  });
});
