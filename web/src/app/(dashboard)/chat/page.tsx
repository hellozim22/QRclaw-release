'use client';

/**
 * /chat — Wave 10 Lane C (#4 v1, #16, #17-layout) two-panel refactor
 *
 *   ┌───────────────┬──────────────────────┐
 *   │  280          │  fill                │
 *   │  agent list   │  chat / onboarding   │
 *   └───────────────┴──────────────────────┘
 *
 * The old three-column layout (80px rail + 320px session list) is gone.
 * Sessions are folded into an on-demand `AgentSessionDrawer` anchored to
 * the chat header, and the left column is a single WeChat-style agent list.
 *
 * Session state lives in `useAgentSessions` so the drawer + header "+"
 * button share one source of truth.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { History, Plus } from 'lucide-react';
import AgentListRail from '@/components/chat/AgentListRail';
import AgentSessionDrawer from '@/components/chat/AgentSessionDrawer';
import OnboardingEmptyState, {
  type OnboardingRuntimeRow,
  type OnboardingState,
} from '@/components/chat/OnboardingEmptyState';
import OwnerAssistantThread from '@/components/chat/OwnerAssistantThread';
import RuntimeInstallHint from '@/components/chat/RuntimeInstallHint';
import type { RuntimeStatus } from '@/components/chat/AgentCard';
import { useAgentSessions, type AgentSession } from '@/hooks/useAgentSessions';
import { useAuth } from '@/hooks/useAuth';
import {
  getAgentDisplayName,
  getProviderDisplayName,
  isSystemDefaultAgent,
} from '@/lib/agent-display';
import {
  ensureOwnerWsSubscription,
  useOwnerAgentChatStore,
  type AgentConnectionStatus,
} from '@/stores/owner-agent-chat-store';
import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';

const DEFAULT_AGENT_PROVIDERS = new Set<OwnerAgentProvider>([
  'codex',
  'cursor',
  'claude',
  'openclaw',
  'pi',
]);

const DEFAULT_PROVIDERS: Array<{
  provider: OwnerAgentProvider;
  displayName: string;
  command: string;
  docsUrl: string;
}> = [
  {
    provider: 'claude',
    displayName: getProviderDisplayName('claude'),
    command: 'brew install --cask claude-code',
    docsUrl: 'https://docs.anthropic.com/claude/docs/claude-code',
  },
  {
    provider: 'cursor',
    displayName: getProviderDisplayName('cursor'),
    command: 'brew install --cask cursor',
    docsUrl: 'https://cursor.sh/docs',
  },
  {
    provider: 'codex',
    displayName: getProviderDisplayName('codex'),
    command: 'npm install -g @openai/codex',
    docsUrl: 'https://platform.openai.com/docs/codex',
  },
  {
    provider: 'openclaw',
    displayName: getProviderDisplayName('openclaw'),
    command: 'brew install openclaw',
    docsUrl: 'https://openclaw.ai/docs',
  },
  {
    provider: 'pi',
    displayName: getProviderDisplayName('pi'),
    command: 'brew install pi',
    docsUrl: 'https://github.com/badlogic/pi',
  },
];

const providerMeta = (provider: OwnerAgentProvider) =>
  DEFAULT_PROVIDERS.find((p) => p.provider === provider) ?? DEFAULT_PROVIDERS[0];

const deriveRuntimeStatus = (
  agentConnStatus: AgentConnectionStatus | undefined,
  hasAgent: boolean
): RuntimeStatus => {
  if (!hasAgent) return 'not_installed';
  switch (agentConnStatus) {
    case 'online':
    case 'running':
      return 'online';
    case 'pending':
      return 'updating';
    case 'failed':
      return 'error';
    case 'offline':
    default:
      return 'offline';
  }
};

const compactSessionTitle = (content: string): string => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '历史会话';
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized;
};

const formatUpdatedLabel = (updatedAt: number): string => {
  const diffMs = Date.now() - updatedAt;
  if (diffMs < 60_000) return '刚刚';
  if (diffMs < 3_600_000) return `${Math.max(1, Math.floor(diffMs / 60_000))}m`;
  if (diffMs < 86_400_000) return `${Math.max(1, Math.floor(diffMs / 3_600_000))}h`;
  return '昨天';
};

export default function ChatPage() {
  const {
    agents,
    selectedAgentId,
    messagesByAgent,
    statusByAgent,
    loading,
    loadAgents,
    loadMessages,
    selectAgent,
    sendMessage,
    stopStream,
    resetContext,
    localHostOnlineCount,
    localHostConnectUi,
    localDevAuthReady,
    connectLocalHost,
  } = useOwnerAgentChatStore();

  const { user, loading: authLoading } = useAuth();
  const isLocalDev = process.env.NEXT_PUBLIC_LOCAL_DEV === '1';

  const [installHintProvider, setInstallHintProvider] = useState<OwnerAgentProvider | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  const requestedHistoryAgentsRef = useRef<Set<string>>(new Set());
  const sessionIdByRunIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (isLocalDev && !localDevAuthReady) return;
    if (isLocalDev && (authLoading || !user)) return;

    void loadAgents();
    void ensureOwnerWsSubscription().catch(() => {
      /* auth not ready or reconnect scheduled inside store */
    });
    const wsKeepAlive = setInterval(() => {
      void ensureOwnerWsSubscription().catch(() => {
        /* reconnect scheduled inside store */
      });
    }, 30_000);
    const pollMs = localHostOnlineCount === 0 || localHostOnlineCount === null ? 15_000 : 30_000;
    const interval = setInterval(() => {
      void loadAgents();
    }, pollMs);
    return () => {
      clearInterval(interval);
      clearInterval(wsKeepAlive);
    };
  }, [loadAgents, localHostOnlineCount, isLocalDev, authLoading, user, localDevAuthReady]);

  const visibleAgents = useMemo(
    () => agents.filter((agent) => agent.status === 'active'),
    [agents]
  );
  const defaultAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          agent.status === 'active' &&
          isSystemDefaultAgent(agent) &&
          DEFAULT_AGENT_PROVIDERS.has(agent.backend_provider)
      ),
    [agents]
  );

  useEffect(() => {
    if (visibleAgents.length === 0) return;
    if (!selectedAgentId || !visibleAgents.some((agent) => agent.id === selectedAgentId)) {
      selectAgent(visibleAgents[0].id);
    }
  }, [selectAgent, selectedAgentId, visibleAgents]);

  const preloadVisibleAgentHistories = () => {
    for (const agent of visibleAgents) {
      if (requestedHistoryAgentsRef.current.has(agent.id)) continue;
      requestedHistoryAgentsRef.current.add(agent.id);
      void loadMessages(agent.id);
    }
  };

  useEffect(() => {
    if (!chatSearchQuery.trim()) return;
    const timer = window.setTimeout(preloadVisibleAgentHistories, 250);
    return () => window.clearTimeout(timer);
    // Search should trigger a one-time broad history preload, not a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchQuery]);

  const selectedAgent = selectedAgentId
    ? (visibleAgents.find((a) => a.id === selectedAgentId) ?? null)
    : null;
  const selectedAgentDisplayName = selectedAgent ? getAgentDisplayName(selectedAgent) : null;

  const restoredSessions: AgentSession[] = useMemo(() => {
    return visibleAgents.flatMap((agent) => {
      const agentHistory = messagesByAgent[agent.id] ?? [];
      if (agentHistory.length === 0) return [];
      const firstOwnerMessage = agentHistory.find((message) => message.sender_type === 'owner');
      const lastMessage = agentHistory[agentHistory.length - 1];
      const updatedAt = Date.parse(lastMessage.created_at) || Date.now();
      return [
        {
          id: `history-${agent.id}`,
          agentId: agent.id,
          agentName: getAgentDisplayName(agent),
          title: firstOwnerMessage ? compactSessionTitle(firstOwnerMessage.content) : '历史会话',
          updatedAt,
          updatedLabel: formatUpdatedLabel(updatedAt),
        },
      ];
    });
  }, [messagesByAgent, visibleAgents]);

  const sessions = useAgentSessions({
    activeAgentId: selectedAgentId,
    activeAgentName: selectedAgentDisplayName,
    restoredSessions,
  });

  // Onboarding state still cares about the 4 default providers, even though
  // the UI no longer renders them as a rail.
  const providerRows: OnboardingRuntimeRow[] = useMemo(() => {
    return DEFAULT_PROVIDERS.map((def) => {
      const agent = defaultAgents.find((a) => a.backend_provider === def.provider);
      const status = deriveRuntimeStatus(
        agent ? statusByAgent[agent.id] : undefined,
        Boolean(agent)
      );
      return {
        provider: def.provider,
        displayName: def.displayName,
        status,
      };
    });
  }, [defaultAgents, statusByAgent]);

  const onlineCount = providerRows.filter((r) => r.status === 'online').length;
  const totalCount = providerRows.length;

  const onboardingState: OnboardingState = useMemo(() => {
    if (visibleAgents.length === 0) return 'empty';
    if (onlineCount === totalCount) return 'connected';
    if (onlineCount === 0) return 'empty';
    return 'partial';
  }, [visibleAgents.length, onlineCount, totalCount]);

  const agentMessages = selectedAgentId ? (messagesByAgent[selectedAgentId] ?? []) : [];
  const activeSessionId = sessions.activeSessionId;
  const isLocalDraftSession = activeSessionId?.startsWith('sess-') ?? false;
  const sessionMarker = activeSessionId ? `${activeSessionId}:` : null;
  useEffect(() => {
    if (!selectedAgentId || !activeSessionId?.startsWith('sess-')) return;
    const marker = `${activeSessionId}:`;
    for (const message of agentMessages) {
      if (!message.run_id) continue;
      const hasLocalMarker = [message.id, message.client_id].some((value) =>
        value?.includes(marker)
      );
      if (hasLocalMarker) {
        sessionIdByRunIdRef.current.set(`${selectedAgentId}:${message.run_id}`, activeSessionId);
      }
    }
  }, [activeSessionId, agentMessages, selectedAgentId]);

  const messages =
    isLocalDraftSession && sessionMarker
      ? agentMessages.filter(
          (message) =>
            [message.id, message.client_id].some((value) => value?.includes(sessionMarker)) ||
            (message.run_id
              ? sessionIdByRunIdRef.current.get(`${selectedAgentId}:${message.run_id}`) ===
                activeSessionId
              : false)
        )
      : agentMessages;

  const handleSelectAgent = (agentId: string) => {
    selectAgent(agentId);
    setInstallHintProvider(null);
    setDrawerOpen(false);
  };

  const handleStartFirstOnline = () => {
    const firstOnline = visibleAgents.find(
      (a) => statusByAgent[a.id] === 'online' || statusByAgent[a.id] === 'running'
    );
    if (firstOnline) {
      selectAgent(firstOnline.id);
      setInstallHintProvider(null);
    }
  };

  const canSend =
    Boolean(selectedAgentId) &&
    selectedAgent?.status === 'active' &&
    (statusByAgent[selectedAgentId ?? ''] ?? 'offline') !== 'failed';
  const isRunning = selectedAgentId
    ? statusByAgent[selectedAgentId] === 'running' ||
      messages.some(
        (message) =>
          message.sender_type === 'agent' &&
          (message.status === 'streaming' || message.run_status === 'running')
      )
    : false;

  const handleCreateSession = () => {
    if (selectedAgentId && agentMessages.length > 0) {
      sessions.ensureSession({
        id: `history-${selectedAgentId}`,
        title: '历史会话',
      });
    }
    const session = sessions.createSession({ title: '新对话' });
    if (selectedAgentId) {
      void resetContext(selectedAgentId);
    }
    return session;
  };

  const handleSendMessage = (content: string) => {
    if (!selectedAgentId) return;
    const clientMessageId =
      isLocalDraftSession && activeSessionId
        ? `${activeSessionId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;
    void sendMessage(selectedAgentId, content, clientMessageId);
  };

  const handleSelectSession = (sessionId: string) => {
    sessions.selectSession(sessionId);
    if (sessionId.startsWith('history-') && selectedAgentId) {
      void loadMessages(selectedAgentId);
    }
  };

  const showChat = selectedAgent && !installHintProvider;

  const showLocalHostBanner =
    !loading &&
    !reconnecting &&
    localHostOnlineCount === 0 &&
    visibleAgents.length > 0 &&
    Boolean(localHostConnectUi);

  const handleReconnectHost = async () => {
    setReconnecting(true);
    setReconnectMessage(null);
    try {
      const result = await connectLocalHost(3);
      if (result.ok && result.onlineRuntimeCount > 0) {
        setReconnectMessage(`已连接 ${result.onlineRuntimeCount} 个本机助手`);
      } else if (result.ok) {
        setReconnectMessage('本机助手已就绪');
      } else {
        setReconnectMessage(result.message ?? '重连失败，请稍后再试');
      }
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        height: '100%',
        background: 'var(--color-off-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <AgentListRail
        agents={visibleAgents}
        selectedAgentId={selectedAgentId}
        statusByAgent={statusByAgent}
        messagesByAgent={messagesByAgent}
        searchQuery={chatSearchQuery}
        loading={loading}
        onSearchChange={setChatSearchQuery}
        onSearchFocus={preloadVisibleAgentHistories}
        onSelectAgent={handleSelectAgent}
      />

      <section
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          background: 'var(--color-white)',
          overflow: 'hidden',
        }}
      >
        {installHintProvider ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: 'var(--space-8)',
              overflowY: 'auto',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              background: 'var(--color-off-white)',
            }}
          >
            <RuntimeInstallHint
              provider={installHintProvider}
              displayName={providerMeta(installHintProvider).displayName}
              command={providerMeta(installHintProvider).command}
              docsUrl={providerMeta(installHintProvider).docsUrl}
              status={
                (providerRows.find((r) => r.provider === installHintProvider)?.status ??
                  'not_installed') as Exclude<RuntimeStatus, 'online'>
              }
              onRescan={() => {
                void loadAgents();
                setInstallHintProvider(null);
              }}
            />
          </div>
        ) : !showChat ? (
          <OnboardingEmptyState
            state={onboardingState}
            runtimes={providerRows}
            onlineCount={onlineCount}
            totalCount={totalCount}
            onStartWithFirstOnline={handleStartFirstOnline}
            onInstallHost={() => setInstallHintProvider('claude')}
            onShowHomebrew={() => setInstallHintProvider('openclaw')}
          />
        ) : (
          <>
            {(showLocalHostBanner || reconnecting || reconnectMessage) && (
              <div
                data-testid="local-host-connect-banner"
                style={{
                  flexShrink: 0,
                  margin: 'var(--space-4) var(--space-6) 0',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-gray-border)',
                  background: 'var(--color-off-white)',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-regular)',
                  letterSpacing: 'normal',
                  color: 'var(--color-gray-700)',
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--weight-semibold)',
                        lineHeight: 1.5,
                        letterSpacing: 'normal',
                      }}
                    >
                      {reconnecting
                        ? (localHostConnectUi?.banner_title_reconnecting ?? '正在重连本机助手…')
                        : (localHostConnectUi?.banner_title_idle ?? '本机助手尚未连接')}
                    </p>
                    {reconnectMessage ? (
                      <p
                        role={reconnectMessage.includes('失败') ? 'alert' : 'status'}
                        style={{
                          margin: '4px 0 0',
                          fontSize: 'var(--text-sm)',
                          fontWeight: 'var(--weight-regular)',
                          lineHeight: 1.5,
                          letterSpacing: 'normal',
                          color: reconnectMessage.includes('失败')
                            ? 'var(--color-red)'
                            : 'var(--color-green-text)',
                        }}
                      >
                        {reconnectMessage}
                      </p>
                    ) : (
                      <>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 'var(--weight-regular)',
                            lineHeight: 1.5,
                            letterSpacing: 'normal',
                          }}
                        >
                          {localHostConnectUi?.banner_body ?? ''}
                        </p>
                        {localHostConnectUi?.banner_extra ? (
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'var(--weight-regular)',
                              lineHeight: 1.5,
                              letterSpacing: 'normal',
                              color: 'var(--color-gray-600)',
                            }}
                          >
                            {localHostConnectUi.banner_extra}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="local-host-reconnect-button"
                    onClick={() => void handleReconnectHost()}
                    disabled={reconnecting}
                    style={{
                      flexShrink: 0,
                      height: 34,
                      padding: '0 var(--space-3)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-red)',
                      color: 'var(--color-white)',
                      cursor: reconnecting ? 'wait' : 'pointer',
                      fontFamily: 'var(--font-primary)',
                      fontWeight: 'var(--font-semibold)',
                      fontSize: 'var(--text-sm)',
                      opacity: reconnecting ? 0.75 : 1,
                    }}
                  >
                    {reconnecting ? '重连中…' : '一键重连'}
                  </button>
                </div>
              </div>
            )}
            <header
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 56,
                padding: '0 var(--space-5)',
                borderBottom: '1px solid var(--color-dashboard-divider)',
                background: 'var(--color-white)',
              }}
            >
              <div
                data-testid="chat-header-agent-name"
                style={{
                  fontSize: 'var(--text-md)',
                  fontWeight: 'var(--font-semibold)',
                  color: 'var(--color-gray-800)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedAgentDisplayName}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDrawerOpen((v) => !v)}
                  aria-expanded={drawerOpen}
                  aria-label="History"
                  title="History"
                  data-testid="chat-header-history-button"
                  style={headerBtnStyle(drawerOpen)}
                >
                  <History size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCreateSession();
                    setDrawerOpen(true);
                  }}
                  aria-label="New chat"
                  title="New chat"
                  data-testid="chat-header-new-session-button"
                  style={headerBtnStyle(false, true)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </header>

            <AgentSessionDrawer
              open={drawerOpen}
              agentName={selectedAgentDisplayName}
              sessions={sessions.sessionsForActiveAgent}
              activeSessionId={sessions.activeSessionId}
              onSelect={handleSelectSession}
              onCreate={handleCreateSession}
              onRename={sessions.renameSession}
              onArchive={sessions.archiveSession}
              onClose={() => setDrawerOpen(false)}
            />

            <OwnerAssistantThread
              agentId={selectedAgent.id}
              agentName={selectedAgentDisplayName ?? selectedAgent.name}
              canSend={canSend}
              isRunning={isRunning}
              messages={messages}
              onSend={handleSendMessage}
              onStop={() => stopStream(selectedAgent.id)}
            />
          </>
        )}
      </section>
    </div>
  );
}

const headerBtnStyle = (active: boolean, primary = false): React.CSSProperties => ({
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-gray-border)',
  background: active
    ? 'var(--color-red-bg)'
    : primary
      ? 'var(--color-white)'
      : 'var(--color-white)',
  color: primary ? 'var(--color-red)' : 'var(--color-gray-800)',
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1,
});
