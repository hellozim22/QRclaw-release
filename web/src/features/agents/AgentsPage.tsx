// Adapted from multica/packages/views/agents/components/agents-page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';
import type {
  OwnerAgentProvider,
  OwnerAgentExecutionMode,
} from '@shared/contracts/http/owner-agent-chat/types';
import { AgentDetail } from './AgentDetail';
import { AgentListItem } from './AgentListItem';

const PROVIDERS: OwnerAgentProvider[] = ['openclaw', 'claude', 'cursor', 'codex', 'pi'];

const summarizeRole = (value: string): string | null => {
  const firstLine = value
    .trim()
    .split('\n')
    .find((line) => line.trim().length > 0)
    ?.trim();
  return firstLine ? firstLine.slice(0, 160) : null;
};

export function AgentsPage() {
  const {
    agents,
    statusByAgent,
    loading,
    loadAgents,
    createAgent,
    connectLocalHost,
    localHostOnlineCount,
    localHostConnectUi,
  } = useOwnerAgentChatStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [providerDraft, setProviderDraft] = useState<OwnerAgentProvider>('openclaw');
  const [executionModeDraft, setExecutionModeDraft] = useState<OwnerAgentExecutionMode>('standard');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAgents();
    const timer = window.setInterval(() => void loadAgents(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadAgents]);

  const handleConnectAll = async () => {
    setConnecting(true);
    setConnectMessage(null);
    try {
      const result = await connectLocalHost(3);
      if (result.ok) {
        setConnectMessage(
          result.onlineRuntimeCount > 0
            ? `已连接 ${result.onlineRuntimeCount} 个本机助手`
            : '本机助手已就绪'
        );
      } else {
        setConnectMessage(result.message ?? '连接失败，请重试');
      }
    } finally {
      setConnecting(false);
    }
  };

  const onlineCount = useMemo(
    () =>
      agents.filter((agent) => {
        const status = statusByAgent[agent.id];
        return status === 'online' || status === 'running' || agent.runtime_status === 'online';
      }).length,
    [agents, statusByAgent]
  );
  const showConnectHint = (localHostOnlineCount ?? onlineCount) === 0;

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('selected');
    if (selected) setSelectedId(selected);
  }, []);

  const visibleAgents = useMemo(() => {
    const rank = (agent: (typeof agents)[number]) => {
      if (agent.status === 'archived') return 3;
      const status = statusByAgent[agent.id];
      if (status === 'online' || status === 'running') return 0;
      if (status === 'pending') return 1;
      return 2;
    };
    return [...agents].sort((a, b) => rank(a) - rank(b));
  }, [agents, statusByAgent]);

  useEffect(() => {
    if (visibleAgents.length === 0) return;
    if (!selectedId || !visibleAgents.some((agent) => agent.id === selectedId)) {
      setSelectedId(visibleAgents[0].id);
    }
  }, [selectedId, visibleAgents]);

  const selectedAgent = selectedId
    ? (visibleAgents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  const submitCreate = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const agent = await createAgent({
        name,
        description: summarizeRole(roleDraft),
        backend_provider: providerDraft,
        backend_source: 'local',
        instructions: roleDraft.trim() || null,
        execution_mode: executionModeDraft,
        execution_mode_ack: executionModeDraft === 'full_access',
      });
      setSelectedId(agent.id);
      setNameDraft('');
      setRoleDraft('');
      setProviderDraft('openclaw');
      setExecutionModeDraft('standard');
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      data-testid="agents-page"
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        background: 'var(--color-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <aside
        style={{
          width: 320,
          borderRight: '1px solid var(--color-gray-border)',
          background: 'var(--color-off-white)',
          padding: 'var(--space-4)',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <h1 style={{ margin: 0, color: 'var(--color-gray-800)', fontSize: 'var(--text-2xl)' }}>
            Agents
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              data-testid="agents-connect-all"
              onClick={() => void handleConnectAll()}
              disabled={connecting}
              style={{
                height: 34,
                padding: '0 var(--space-3)',
                border: '1px solid var(--color-gray-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-white)',
                color: 'var(--color-gray-800)',
                cursor: connecting ? 'wait' : 'pointer',
                fontFamily: 'var(--font-primary)',
                fontWeight: 'var(--font-semibold)',
                opacity: connecting ? 0.7 : 1,
              }}
            >
              {connecting ? '连接中…' : '一键连接'}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              style={{
                height: 34,
                padding: '0 var(--space-3)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-red)',
                color: 'var(--color-white)',
                cursor: 'pointer',
                fontFamily: 'var(--font-primary)',
                fontWeight: 'var(--font-semibold)',
              }}
            >
              Add
            </button>
          </div>
        </div>

        {(connectMessage || (showConnectHint && !connecting)) && (
          <p
            role={connectMessage && connectMessage.includes('失败') ? 'alert' : 'status'}
            style={{
              margin: '10px 0 0',
              color: connectMessage?.includes('失败')
                ? 'var(--color-red)'
                : 'var(--color-gray-600)',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.5,
            }}
          >
            {connectMessage ?? (showConnectHint ? (localHostConnectUi?.agents_hint ?? '') : '')}
          </p>
        )}

        {createOpen && (
          <div
            style={{
              marginTop: 14,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-gray-border)',
              background: 'var(--color-white)',
              padding: 'var(--space-3)',
              display: 'grid',
              gap: 'var(--space-2)',
            }}
          >
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Agent 名称"
              style={{
                height: 34,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                padding: '0 var(--space-2)',
                fontFamily: 'var(--font-primary)',
              }}
            />
            <textarea
              value={roleDraft}
              onChange={(event) => setRoleDraft(event.target.value)}
              placeholder="角色说明：描述这个 Agent 的职责、边界和输出偏好"
              rows={4}
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                padding: 'var(--space-2)',
                fontFamily: 'var(--font-primary)',
              }}
            />
            <select
              value={providerDraft}
              onChange={(event) => setProviderDraft(event.target.value as OwnerAgentProvider)}
              style={{
                height: 34,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
              }}
            >
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <details>
              <summary style={{ color: 'var(--color-gray-600)', cursor: 'pointer' }}>
                高级选项
              </summary>
              <select
                value={executionModeDraft}
                onChange={(event) =>
                  setExecutionModeDraft(event.target.value as OwnerAgentExecutionMode)
                }
                style={{
                  marginTop: 8,
                  width: '100%',
                  height: 34,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-gray-border)',
                }}
              >
                <option value="standard">Standard</option>
                <option value="full_access">Full Access</option>
              </select>
            </details>
            {error && (
              <div style={{ color: 'var(--color-red)', fontSize: 'var(--text-sm)' }}>{error}</div>
            )}
            <button
              type="button"
              onClick={submitCreate}
              disabled={!nameDraft.trim() || creating}
              style={{
                height: 34,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: nameDraft.trim() ? 'var(--color-red)' : 'var(--color-gray-200)',
                color: nameDraft.trim() ? 'var(--color-white)' : 'var(--color-gray-500)',
                cursor: nameDraft.trim() && !creating ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-primary)',
              }}
            >
              {creating ? 'Creating…' : 'Create Agent'}
            </button>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gap: 'var(--space-2)' }}>
          {loading && visibleAgents.length === 0 ? (
            <div style={{ color: 'var(--color-gray-600)' }}>Loading agents…</div>
          ) : visibleAgents.length === 0 ? (
            <div style={{ color: 'var(--color-gray-600)' }}>No agents yet.</div>
          ) : (
            visibleAgents.map((agent) => (
              <AgentListItem
                key={agent.id}
                agent={agent}
                status={statusByAgent[agent.id]}
                selected={agent.id === selectedAgent?.id}
                onSelect={() => setSelectedId(agent.id)}
              />
            ))
          )}
        </div>
      </aside>

      <AgentDetail
        agent={selectedAgent}
        status={selectedAgent ? statusByAgent[selectedAgent.id] : undefined}
      />
    </section>
  );
}
