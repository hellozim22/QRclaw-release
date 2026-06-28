'use client';

import { useEffect, useState } from 'react';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { createClient } from '@/lib/supabase/browser';
import {
  getAgentDisplayName,
  isSystemDefaultAgent,
} from '@/lib/agent-display';
import {
  useOwnerAgentChatStore,
  type AgentConnectionStatus,
} from '@/stores/owner-agent-chat-store';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';

const isOnline = (status: AgentConnectionStatus | undefined) =>
  status === 'online' || status === 'running';

const summarizeRole = (value: string): string | null => {
  const firstLine = value.trim().split('\n').find((line) => line.trim().length > 0)?.trim();
  return firstLine ? firstLine.slice(0, 160) : null;
};

const modelLabel = (agent: OwnerAgentSummary): string => {
  const models = agent.runtime_models?.filter((model) => model.trim().length > 0) ?? [];
  if (models.length > 0) return models.join(', ');
  return '未配置（使用运行时默认模型）';
};

export function AgentDetail({
  agent,
  status,
}: {
  agent: OwnerAgentSummary | null;
  status: AgentConnectionStatus | undefined;
}) {
  const [nameDraft, setNameDraft] = useState(agent ? getAgentDisplayName(agent) : '');
  const [roleDraft, setRoleDraft] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const loadAgents = useOwnerAgentChatStore((state) => state.loadAgents);

  useEffect(() => {
    let cancelled = false;
    setNameDraft(agent ? getAgentDisplayName(agent) : '');
    setRoleDraft('');
    setConfigLoaded(false);
    setLoadError(false);
    setSaveState('idle');
    if (!agent) return () => {
      cancelled = true;
    };

    const loadAgentConfig = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('agents')
          .select('name, description, instructions')
          .eq('id', agent.id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setLoadError(true);
          return;
        }
        setNameDraft(isSystemDefaultAgent(agent) ? getAgentDisplayName(agent) : (data.name ?? agent.name));
        setRoleDraft(data.instructions ?? data.description ?? '');
        setConfigLoaded(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    void loadAgentConfig();
    return () => {
      cancelled = true;
    };
    // Only reload drafts when the selected agent changes. Periodic status polling
    // replaces agent objects, and must not wipe an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  if (!agent) {
    return (
      <main style={{ flex: 1, padding: 'var(--space-8)', color: 'var(--color-gray-600)' }}>
        选择一个 Agent 查看配置。
      </main>
    );
  }

  const defaultAgent = isSystemDefaultAgent(agent);

  const saveConfig = async () => {
    if (!configLoaded) return;
    setSaveState('saving');
    try {
      const supabase = createClient();
      const patch: {
        name?: string;
        description: string | null;
        instructions: string | null;
      } = {
        description: summarizeRole(roleDraft),
        instructions: roleDraft.trim() || null,
      };
      if (!defaultAgent) {
        patch.name = nameDraft.trim() || agent.name;
      }
      const { error } = await supabase.from('agents').update(patch).eq('id', agent.id);
      if (error) {
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      void loadAgents();
    } catch {
      setSaveState('error');
    }
  };

  return (
    <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--space-8)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <AgentAvatar agent={agent} size={56} showStatus online={isOnline(status)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, color: 'var(--color-gray-900)', fontSize: 'var(--text-3xl)' }}>
            {getAgentDisplayName(agent)}
          </h1>
        </div>
      </header>

        <section style={{ marginTop: 28, display: 'grid', gap: 'var(--space-4)', maxWidth: 680 }}>
          <h2 style={{ margin: 0, color: 'var(--color-gray-800)', fontSize: 'var(--text-xl)' }}>
            Agent 配置
          </h2>
          <label style={{ display: 'grid', gap: 8, color: 'var(--color-gray-700)' }}>
            显示名称
            <input
              value={nameDraft}
              readOnly={defaultAgent}
              onChange={(event) => setNameDraft(event.target.value)}
              style={{
                height: 38,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: defaultAgent ? 'var(--color-gray-100)' : 'var(--color-white)',
                color: 'var(--color-gray-800)',
                padding: '0 var(--space-3)',
                fontFamily: 'var(--font-primary)',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8, color: 'var(--color-gray-700)' }}>
            模型型号
            <input
              value={modelLabel(agent)}
              readOnly
              style={{
                height: 38,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-gray-100)',
                color: 'var(--color-gray-800)',
                padding: '0 var(--space-3)',
                fontFamily: 'var(--font-primary)',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8, color: 'var(--color-gray-700)' }}>
            角色说明
            <textarea
              value={roleDraft}
              onChange={(event) => setRoleDraft(event.target.value)}
              placeholder="像 CLAUDE.md 一样，描述这个 Agent 的职责、边界、工具使用方式和输出偏好。"
              rows={10}
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-gray-border)',
                background: 'var(--color-white)',
                color: 'var(--color-gray-800)',
                padding: 'var(--space-3)',
                fontFamily: 'var(--font-primary)',
                lineHeight: 1.6,
              }}
            />
          </label>
          {loadError && (
            <div role="alert" style={{ color: 'var(--color-red)', fontSize: 'var(--text-sm)' }}>
              配置加载失败，暂时不能保存，避免覆盖已有内容。
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={saveConfig}
              disabled={!configLoaded || saveState === 'saving'}
              style={{
                height: 36,
                padding: '0 var(--space-4)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: configLoaded ? 'var(--color-red)' : 'var(--color-gray-200)',
                color: configLoaded ? 'var(--color-white)' : 'var(--color-gray-500)',
                cursor: !configLoaded ? 'not-allowed' : saveState === 'saving' ? 'wait' : 'pointer',
                fontFamily: 'var(--font-primary)',
                fontWeight: 'var(--font-semibold)',
              }}
            >
              {saveState === 'saving' ? '保存中…' : '保存配置'}
            </button>
            {saveState === 'saved' && (
              <span role="status" style={{ color: 'var(--color-green-text)', fontSize: 'var(--text-sm)' }}>
                已保存
              </span>
            )}
            {saveState === 'error' && (
              <span role="alert" style={{ color: 'var(--color-red)', fontSize: 'var(--text-sm)' }}>
                保存失败，请稍后重试
              </span>
            )}
          </div>
        </section>
    </main>
  );
}
