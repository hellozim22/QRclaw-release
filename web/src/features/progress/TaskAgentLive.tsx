'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { getAgentDisplayName } from '@/lib/agent-display';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';
import type { ProgressTask } from './types';

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
};

export function TaskAgentLive({ task }: { task: ProgressTask }) {
  const agents = useOwnerAgentChatStore((state) => state.agents);
  const statusByAgent = useOwnerAgentChatStore((state) => state.statusByAgent);
  const messagesByAgent = useOwnerAgentChatStore((state) => state.messagesByAgent);
  const [now, setNow] = useState(() => Date.now());

  const agent = useMemo(
    () => (task.agentId ? agents.find((item) => item.id === task.agentId) ?? null : null),
    [agents, task.agentId],
  );

  const hasStreamingMessage = Boolean(
    task.agentId &&
      (messagesByAgent[task.agentId] ?? []).some((message) =>
        message.sender_type === 'agent' &&
        (message.status === 'streaming' || message.run_status === 'running')
      ),
  );
  const isRunning = Boolean(
    task.agentId &&
      task.status === 'in_progress' &&
      (statusByAgent[task.agentId] === 'running' || hasStreamingMessage),
  );

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  if (!isRunning) return null;

  const elapsed = Math.max(0, Math.floor((now - Date.parse(task.updatedAt)) / 1000));
  const agentName = agent ? getAgentDisplayName(agent) : task.agentName ?? 'Agent';

  return (
    <aside
      data-testid="progress-task-live"
      style={{
        marginTop: 14,
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-red-bg)',
        padding: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
        {agent && <AgentAvatar agent={agent} size={36} showStatus online />}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--color-gray-800)', fontWeight: 'var(--font-semibold)' }}>
            {agentName} 正在处理
          </div>
          <div style={{ marginTop: 2, color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
            执行中 · 已用时 {formatElapsed(elapsed)}
          </div>
        </div>
      </div>
      <Link
        href={`/chat?agent=${task.agentId}`}
        style={{
          color: 'var(--color-red)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-semibold)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        查看对话
      </Link>
    </aside>
  );
}
