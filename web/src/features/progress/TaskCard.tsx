// Adapted from multica/packages/views/issues/components/board-card.tsx

'use client';

import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { PRIORITY_LABEL, type ProgressTask } from './types';
import type { ProgressProject } from './project-types';

const priorityColor: Record<ProgressTask['priority'], string> = {
  urgent: 'var(--color-red)',
  high: 'var(--color-warning)',
  medium: 'var(--color-indigo)',
  low: 'var(--color-green-text)',
  none: 'var(--color-gray-500)',
};

function TaskCardContent({
  task,
  project,
  agent,
  agentOnline,
}: {
  task: ProgressTask;
  project: ProgressProject | null;
  agent: OwnerAgentSummary | null;
  agentOnline: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 8,
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
            padding: '2px 6px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-gray-100)',
            color: priorityColor[task.priority],
            fontSize: 'var(--text-xs)',
          }}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>

      {project && (
        <div
          data-testid={`progress-task-card-project-${task.id}`}
          style={{
            display: 'inline-flex',
            maxWidth: '100%',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            padding: '3px 7px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-gray-100)',
            color: 'var(--color-gray-700)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <span aria-hidden="true">{project.icon ?? '📁'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.title}
          </span>
        </div>
      )}

      <div
        style={{
          color: 'var(--color-gray-800)',
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--font-semibold)',
          lineHeight: 1.35,
        }}
      >
        {task.title}
      </div>

      {task.agentName && (
        <div
          data-testid={`progress-task-card-agent-${task.id}`}
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--color-gray-600)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {agent ? (
            <AgentAvatar agent={agent} size={24} showStatus online={agentOnline} />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                display: 'inline-grid',
                placeItems: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-white)',
                color: 'var(--color-gray-700)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
              }}
            >
              A
            </span>
          )}
          <span>{task.agentName}</span>
        </div>
      )}
    </>
  );
}

export function TaskCard({
  task,
  project,
  agent,
  agentOnline,
  onClick,
}: {
  task: ProgressTask;
  project: ProgressProject | null;
  agent: OwnerAgentSummary | null;
  agentOnline: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => {
        if (!isDragging) onClick();
      }}
      data-testid={`progress-task-card-${task.id}`}
      style={{
        width: '100%',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-white)',
        boxShadow: 'var(--shadow-sm)',
        textAlign: 'left',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.45 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        fontFamily: 'var(--font-primary)',
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCardContent task={task} project={project} agent={agent} agentOnline={agentOnline} />
    </button>
  );
}

export function DragCard({
  task,
  project,
  agent,
  agentOnline,
}: {
  task: ProgressTask;
  project: ProgressProject | null;
  agent: OwnerAgentSummary | null;
  agentOnline: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-red)',
        background: 'var(--color-white)',
        boxShadow: 'var(--shadow-md)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <TaskCardContent task={task} project={project} agent={agent} agentOnline={agentOnline} />
    </div>
  );
}
