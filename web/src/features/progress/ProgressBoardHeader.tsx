// Adapted from multica/packages/views/issues/components/issues-header.tsx

'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ProgressProject } from './project-types';

export function ProgressBoardHeader({
  projects,
  projectFilter,
  includeNoProject,
  onToggleProject,
  onToggleNoProject,
  onCreateProject,
  onCreateTask,
}: {
  projects: ProgressProject[];
  projectFilter: string[];
  includeNoProject: boolean;
  onToggleProject: (projectId: string) => void;
  onToggleNoProject: () => void;
  onCreateProject: (input: { title: string; icon?: string | null }) => void;
  onCreateTask: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectIcon, setProjectIcon] = useState('📁');

  const submitProject = () => {
    const title = projectTitle.trim();
    if (!title) return;
    onCreateProject({ title, icon: projectIcon.trim() || '📁' });
    setProjectTitle('');
    setProjectIcon('📁');
    setCreating(false);
  };

  return (
    <header
      style={{
        padding: 'var(--space-4) var(--space-6) var(--space-3)',
        borderBottom: '1px solid var(--color-gray-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, color: 'var(--color-gray-800)', fontSize: 'var(--text-3xl)' }}>
            Progress
          </h1>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          data-testid="progress-create-task"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            height: 36,
            padding: '0 var(--space-4)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-red)',
            color: 'var(--color-white)',
            cursor: 'pointer',
            fontFamily: 'var(--font-primary)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          <Plus size={16} />
          New task
        </button>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          data-testid="progress-project-filter"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          {projects.map((project) => {
            const selected = projectFilter.includes(project.id);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onToggleProject(project.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 28,
                  padding: '0 var(--space-3)',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--color-gray-border)',
                  background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
                  color: selected ? 'var(--color-red)' : 'var(--color-gray-700)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span aria-hidden="true">{project.icon ?? '📁'}</span>
                {project.title}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onToggleNoProject}
            style={{
              height: 28,
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-gray-border)',
              background: includeNoProject ? 'var(--color-red-bg)' : 'var(--color-white)',
              color: includeNoProject ? 'var(--color-red)' : 'var(--color-gray-700)',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-sm)',
            }}
          >
            未分组
          </button>
          <button
            type="button"
            data-testid="progress-project-create"
            onClick={() => setCreating((value) => !value)}
            style={{
              height: 28,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-gray-700)',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-sm)',
            }}
          >
            + 新建项目
          </button>
        </div>
        {creating && (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <input
              aria-label="Project icon"
              value={projectIcon}
              onChange={(event) => setProjectIcon(event.target.value)}
              style={{
                width: 44,
                height: 32,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-white)',
                textAlign: 'center',
              }}
            />
            <input
              aria-label="Project title"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitProject();
              }}
              placeholder="项目名称"
              style={{
                width: 220,
                height: 32,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-white)',
                padding: '0 var(--space-2)',
                fontFamily: 'var(--font-primary)',
              }}
            />
            <button
              type="button"
              onClick={submitProject}
              disabled={!projectTitle.trim()}
              style={{
                height: 32,
                padding: '0 var(--space-3)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: projectTitle.trim() ? 'var(--color-red)' : 'var(--color-gray-200)',
                color: projectTitle.trim() ? 'var(--color-white)' : 'var(--color-gray-500)',
                cursor: projectTitle.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-primary)',
              }}
            >
              创建
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
