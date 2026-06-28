// Adapted from multica/packages/views/agents/components/agent-list-item.tsx

'use client';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { getAgentDisplayName } from '@/lib/agent-display';
import type { AgentConnectionStatus } from '@/stores/owner-agent-chat-store';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';

const isOnline = (status: AgentConnectionStatus | undefined) =>
  status === 'online' || status === 'running';

const statusLabel = (status: AgentConnectionStatus | undefined) => {
  if (isOnline(status)) return '在线';
  if (status === 'pending') return '连接中';
  return '离线';
};

export function AgentListItem({
  agent,
  selected,
  status,
  onSelect,
}: {
  agent: OwnerAgentSummary;
  selected: boolean;
  status: AgentConnectionStatus | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${selected ? 'var(--color-red)' : 'var(--color-gray-border)'}`,
        background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
        color: 'var(--color-gray-800)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <AgentAvatar agent={agent} size={34} showStatus online={isOnline(status)} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: 'block' }}>{getAgentDisplayName(agent)}</strong>
        <span style={{ color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
          {agent.backend_provider} · {statusLabel(status)}
        </span>
      </span>
    </button>
  );
}
