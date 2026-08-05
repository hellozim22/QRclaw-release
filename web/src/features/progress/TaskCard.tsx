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

/** Fixed board-card height so every task tile aligns in a row. */
export const TASK_CARD_HEIGHT = 148;

const TITLE_LINE_HEIGHT = 1.35;
const TITLE_BLOCK_HEIGHT = `calc(var(--text-md) * ${TITLE_LINE_HEIGHT} * 2)`;
const META_ROW_HEIGHT = 24;

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: 'var(--color-gray-600)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.identifier}
        </span>
        <span
          style={{
            flexShrink: 0,
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

      <div
        data-testid={`progress-task-card-project-${task.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: META_ROW_HEIGHT,
          marginBottom: 8,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {project ? (
          <span
            style={{
              display: 'inline-flex',
              maxWidth: '100%',
              alignItems: 'center',
              gap: 6,
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
          </span>
        ) : null}
      </div>

      <div
        title={task.title}
        style={{
          color: 'var(--color-gray-800)',
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--font-semibold)',
          lineHeight: TITLE_LINE_HEIGHT,
          height: TITLE_BLOCK_HEIGHT,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
          flexShrink: 0,
        }}
      >
        {task.title}
      </div>

      <div
        data-testid={`progress-task-card-agent-${task.id}`}
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: META_ROW_HEIGHT,
          flexShrink: 0,
          color: 'var(--color-gray-600)',
          fontSize: 'var(--text-sm)',
          minWidth: 0,
        }}
      >
        {task.agentName ? (
          <>
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
                  flexShrink: 0,
                }}
              >
                A
              </span>
            )}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {task.agentName}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

const cardShellStyle = {
  width: '100%',
  height: TASK_CARD_HEIGHT,
  boxSizing: 'border-box' as const,
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-white)',
  textAlign: 'left' as const,
  fontFamily: 'var(--font-primary)',
};

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
        ...cardShellStyle,
        border: '1px solid var(--color-gray-border)',
        boxShadow: 'var(--shadow-sm)',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.45 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
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
        ...cardShellStyle,
        border: '1px solid var(--color-red)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <TaskCardContent task={task} project={project} agent={agent} agentOnline={agentOnline} />
    </div>
  );
}
