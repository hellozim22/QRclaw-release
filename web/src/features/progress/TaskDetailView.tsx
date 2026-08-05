'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { getAgentDisplayName } from '@/lib/agent-display';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';
import {
  addProgressTaskComment,
  deleteProgressTask,
  getProgressTask,
  subscribeProgressTasks,
  updateProgressTask,
} from './task-store';
import {
  createProgressProject,
  ensureDefaultProject,
  listProgressProjects,
  subscribeProgressProjects,
} from './project-store';
import type { ProgressProject } from './project-types';
import {
  PRIORITY_LABEL,
  STATUS_META,
  TASK_STATUSES,
  type ProgressActivity,
  type ProgressComment,
  type ProgressTask,
  type TaskPriority,
  type TaskStatus,
} from './types';
import { DescriptionEditor } from './DescriptionEditor';
import { formatActivity } from './format-activity';
import { TaskAgentLive } from './TaskAgentLive';
import { TaskCommentInput } from './TaskCommentInput';

const priorityOptions: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

type TimelineItem =
  | (ProgressActivity & { kind: 'activity' })
  | (ProgressComment & { kind: 'comment' });

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        alignItems: 'center',
        gap: 'var(--space-3)',
        minHeight: 32,
        color: 'var(--color-gray-700)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span style={{ color: 'var(--color-gray-500)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function SelectField<T extends string>({
  value,
  onChange,
  children,
  testId,
}: {
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      style={{
        width: '100%',
        height: 32,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-white)',
        color: 'var(--color-gray-800)',
        padding: '0 var(--space-2)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      {children}
    </select>
  );
}

function TimelineEntry({
  item,
  agents,
  statusByAgent,
}: {
  item: TimelineItem;
  agents: ReturnType<typeof useOwnerAgentChatStore.getState>['agents'];
  statusByAgent: ReturnType<typeof useOwnerAgentChatStore.getState>['statusByAgent'];
}) {
  if (item.kind === 'comment') {
    return (
      <article
        data-testid={`progress-task-comment-${item.id}`}
        style={{
          border: '1px solid var(--color-gray-border)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-white)',
          padding: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            color: 'var(--color-gray-600)',
            fontSize: 'var(--text-sm)',
            marginBottom: 10,
          }}
        >
          <strong style={{ color: 'var(--color-gray-800)' }}>{item.authorName}</strong>
          <span>{formatDateTime(item.at)}</span>
        </div>
        <MarkdownRenderer content={item.content} stripImages />
      </article>
    );
  }

  const actorName = item.actorName ?? (item.actorType === 'agent' ? 'Agent' : 'System');
  const agent = item.actorId
    ? (agents.find((candidate) => candidate.id === item.actorId) ?? null)
    : null;
  const status = agent ? statusByAgent[agent.id] : undefined;

  return (
    <div
      data-testid={`progress-task-activity-${item.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        alignItems: 'start',
        gap: 'var(--space-3)',
        color: 'var(--color-gray-600)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
      }}
    >
      {agent ? (
        <AgentAvatar
          agent={agent}
          size={28}
          showStatus
          online={status === 'online' || status === 'running'}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            display: 'inline-grid',
            placeItems: 'center',
            borderRadius: 'var(--radius-full)',
            background:
              item.actorType === 'agent' ? 'var(--color-red-bg)' : 'var(--color-gray-100)',
            color: item.actorType === 'agent' ? 'var(--color-red)' : 'var(--color-gray-600)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          {item.actorType === 'owner' ? 'Y' : 'A'}
        </span>
      )}
      <div>
        <strong style={{ color: 'var(--color-gray-800)' }}>{actorName}</strong>
        <span> {formatActivity(item)}</span>
      </div>
      <span style={{ whiteSpace: 'nowrap', color: 'var(--color-gray-500)' }}>
        {formatDateTime(item.at)}
      </span>
    </div>
  );
}

export function TaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<ProgressTask | null>(() => getProgressTask(taskId));
  const [titleDraft, setTitleDraft] = useState(() => getProgressTask(taskId)?.title ?? '');
  const [projects, setProjects] = useState<ProgressProject[]>(() => {
    ensureDefaultProject();
    return listProgressProjects();
  });
  const [projectDraftOpen, setProjectDraftOpen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState('');
  const [projectIconDraft, setProjectIconDraft] = useState('📁');
  const [commentDraft, setCommentDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const agents = useOwnerAgentChatStore((state) => state.agents);
  const statusByAgent = useOwnerAgentChatStore((state) => state.statusByAgent);
  const loadAgents = useOwnerAgentChatStore((state) => state.loadAgents);

  useEffect(() => {
    const reload = () => {
      const next = getProgressTask(taskId);
      setTask(next);
      setTitleDraft(next?.title ?? '');
    };
    reload();
    return subscribeProgressTasks(reload);
  }, [taskId]);

  // React-recommended "adjust state when a prop changes" pattern: reset
  // transient delete state whenever the active task changes, without an effect.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (prevTaskId !== taskId) {
    setPrevTaskId(taskId);
    setConfirmingDelete(false);
    setIsDeleting(false);
  }

  useEffect(() => {
    const reload = () => setProjects(listProgressProjects());
    reload();
    return subscribeProgressProjects(reload);
  }, []);

  useEffect(() => {
    if (agents.length === 0) {
      void loadAgents();
    }
  }, [agents.length, loadAgents]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!task) return [];
    return [
      ...task.activity.map((item) => ({ ...item, kind: 'activity' as const })),
      ...(task.comments ?? []).map((item) => ({ ...item, kind: 'comment' as const })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [task]);

  if (!task) {
    if (isDeleting) return null;
    return (
      <section
        data-testid="progress-task-detail-missing"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--color-off-white)',
          color: 'var(--color-gray-700)',
          fontFamily: 'var(--font-primary)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p>这个任务不存在或已被移除。</p>
          <Link href="/progress" style={{ color: 'var(--color-red)' }}>
            返回 Progress
          </Link>
        </div>
      </section>
    );
  }

  const update = (
    patch: Parameters<typeof updateProgressTask>[1],
    options?: Parameters<typeof updateProgressTask>[2]
  ) => {
    const next = updateProgressTask(task.id, patch, options);
    if (next) setTask(next);
  };

  const submitComment = () => {
    const comment = addProgressTaskComment(task.id, commentDraft);
    if (!comment) return;
    setCommentDraft('');
    setTask(getProgressTask(task.id));
  };

  const saveTitle = () => {
    const nextTitle = titleDraft.trim() || '新任务';
    if (nextTitle === task.title) return;
    update({ title: nextTitle }, { recordActivity: false });
    setTitleDraft(nextTitle);
  };

  const changeAssignee = (agentId: string) => {
    if (!agentId) {
      update({ agentId: null, agentName: null });
      return;
    }
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;
    update({
      agentId: agent.id,
      agentName: getAgentDisplayName(agent),
    });
  };

  const createProject = () => {
    const project = createProgressProject({
      title: projectTitleDraft,
      icon: projectIconDraft,
    });
    if (!project) return;
    setProjects(listProgressProjects());
    update({ projectId: project.id });
    setProjectTitleDraft('');
    setProjectIconDraft('📁');
    setProjectDraftOpen(false);
  };

  const handleDeleteTask = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setIsDeleting(true);
    if (deleteProgressTask(task.id)) {
      router.replace('/progress');
    } else {
      setIsDeleting(false);
    }
  };

  return (
    <section
      data-testid="progress-task-detail-page"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 300px',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--color-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <main
        style={{
          minWidth: 0,
          overflowY: 'auto',
          padding: 'var(--space-8) var(--space-10)',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/progress')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-gray-600)',
            cursor: 'pointer',
            fontFamily: 'var(--font-primary)',
            padding: 0,
          }}
        >
          <ArrowLeft size={16} />
          Progress
        </button>

        <div
          style={{
            marginTop: 24,
            color: 'var(--color-gray-600)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {task.identifier}
        </div>
        <input
          data-testid="progress-task-title-input"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          style={{
            width: '100%',
            marginTop: 10,
            border: 'none',
            outline: 'none',
            color: 'var(--color-gray-900)',
            fontSize: 'var(--text-4xl)',
            lineHeight: 1.2,
            fontWeight: 'var(--font-semibold)',
            fontFamily: 'var(--font-primary)',
          }}
        />

        <section style={{ marginTop: 28 }}>
          <h2 style={{ margin: 0, color: 'var(--color-gray-800)', fontSize: 'var(--text-lg)' }}>
            Details
          </h2>
          <div style={{ marginTop: 12 }}>
            <DescriptionEditor
              value={task.description}
              onSave={(description) => update({ description }, { recordActivity: false })}
            />
          </div>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ margin: 0, color: 'var(--color-gray-800)', fontSize: 'var(--text-lg)' }}>
            Activity
          </h2>
          <TaskAgentLive task={task} />
          <div
            data-testid="progress-task-timeline"
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {timeline.map((item) => (
              <TimelineEntry
                key={`${item.kind}-${item.id}`}
                item={item}
                agents={agents}
                statusByAgent={statusByAgent}
              />
            ))}
          </div>
        </section>

        <section style={{ marginTop: 28, paddingBottom: 40 }}>
          <label
            htmlFor="progress-task-comment"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--color-gray-800)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-semibold)',
            }}
          >
            <MessageSquare size={16} />
            Leave a reply
          </label>
          <TaskCommentInput
            value={commentDraft}
            onChange={setCommentDraft}
            onSubmit={submitComment}
          />
        </section>
      </main>

      <aside
        style={{
          borderLeft: '1px solid var(--color-gray-border)',
          background: 'var(--color-off-white)',
          padding: 'var(--space-6)',
          overflowY: 'auto',
        }}
      >
        <h2
          style={{
            margin: '0 0 var(--space-4)',
            color: 'var(--color-gray-800)',
            fontSize: 'var(--text-md)',
          }}
        >
          Properties
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <PropertyRow label="Status">
            <SelectField<TaskStatus> value={task.status} onChange={(status) => update({ status })}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].title}
                </option>
              ))}
            </SelectField>
          </PropertyRow>
          <PropertyRow label="Priority">
            <SelectField<TaskPriority>
              value={task.priority}
              onChange={(priority) => update({ priority })}
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </SelectField>
          </PropertyRow>
          <PropertyRow label="Assignee">
            <SelectField<string>
              value={task.agentId ?? ''}
              onChange={changeAssignee}
              testId="progress-task-assignee-select"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {getAgentDisplayName(agent)}
                </option>
              ))}
            </SelectField>
            {task.agentId && (
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--color-gray-600)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {(() => {
                  const agent = agents.find((item) => item.id === task.agentId);
                  if (!agent) return null;
                  const status = statusByAgent[agent.id];
                  return (
                    <>
                      <AgentAvatar
                        agent={agent}
                        size={24}
                        showStatus
                        online={status === 'online' || status === 'running'}
                      />
                      <span>{getAgentDisplayName(agent)}</span>
                    </>
                  );
                })()}
              </div>
            )}
          </PropertyRow>
          <PropertyRow label="Project">
            <SelectField<string>
              value={task.projectId ?? ''}
              onChange={(projectId) => update({ projectId: projectId || null })}
              testId="progress-task-project-select"
            >
              <option value="">未分组</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.icon ?? '📁'} {project.title}
                </option>
              ))}
            </SelectField>
            <button
              type="button"
              onClick={() => setProjectDraftOpen((value) => !value)}
              style={{
                marginTop: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--color-gray-700)',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
              }}
            >
              + 新建项目
            </button>
            {projectDraftOpen && (
              <div style={{ marginTop: 8, display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    aria-label="Project icon"
                    value={projectIconDraft}
                    onChange={(event) => setProjectIconDraft(event.target.value)}
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
                    value={projectTitleDraft}
                    onChange={(event) => setProjectTitleDraft(event.target.value)}
                    placeholder="项目名称"
                    style={{
                      minWidth: 0,
                      flex: 1,
                      height: 32,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-gray-border)',
                      background: 'var(--color-white)',
                      color: 'var(--color-gray-800)',
                      padding: '0 var(--space-2)',
                      fontFamily: 'var(--font-primary)',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={createProject}
                  disabled={!projectTitleDraft.trim()}
                  style={{
                    height: 32,
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: projectTitleDraft.trim()
                      ? 'var(--color-red)'
                      : 'var(--color-gray-200)',
                    color: projectTitleDraft.trim()
                      ? 'var(--color-white)'
                      : 'var(--color-gray-500)',
                    cursor: projectTitleDraft.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-primary)',
                  }}
                >
                  创建并选择
                </button>
              </div>
            )}
          </PropertyRow>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: '1px solid var(--color-gray-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            color: 'var(--color-gray-600)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <div>Created {formatDateTime(task.createdAt)}</div>
          <div>Updated {formatDateTime(task.updatedAt)}</div>
          {task.sourceMessage && <div>Source: Chat request</div>}
        </div>
        <div
          style={{
            marginTop: 18,
            paddingTop: 18,
            borderTop: '1px solid var(--color-gray-border)',
          }}
        >
          <button
            type="button"
            data-testid="progress-task-delete-button"
            onClick={handleDeleteTask}
            disabled={isDeleting}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-red)',
              cursor: isDeleting ? 'wait' : 'pointer',
              padding: 0,
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
            }}
          >
            {isDeleting ? '删除中…' : confirmingDelete ? '确认删除任务' : '删除任务'}
          </button>
          {confirmingDelete && !isDeleting && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              style={{
                marginLeft: 12,
                border: 'none',
                background: 'transparent',
                color: 'var(--color-gray-600)',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
              }}
            >
              取消
            </button>
          )}
        </div>
      </aside>
    </section>
  );
}
