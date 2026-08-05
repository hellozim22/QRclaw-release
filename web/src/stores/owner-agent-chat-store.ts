import { create } from 'zustand';
import {
  parseOpenAISSE,
  type OpenAISSEEvent,
} from '@/lib/openai-sse-client';
import { createClient } from '@/lib/supabase/browser';
import { connectLocalHost, type ConnectLocalHostResult } from '@/lib/connect-local-host';
import { isDesktopMode } from '@/lib/desktop-bridge';
import { maybeSummarizeConversationToProgress } from '@/lib/local-progress-summary';
import type {
  OwnerAgentCreateAgentRequest,
  OwnerAgentCreateHostTokenResponse,
  OwnerAgentSummary,
  OwnerAgentProvider,
  OwnerAgentRunStatus,
  OwnerAgentSendMessageResponse,
} from '@shared/contracts/http/owner-agent-chat/types';
import {
  DECRYPTION_FAILED_SENTINEL,
  DECRYPTION_UNAVAILABLE_SENTINEL,
} from '@shared/contracts/http/decrypted-messages/types';

// UI-only message shape — wire concrete transport in Wave 6.
export interface ChatMessage {
  id: string;
  client_id?: string;
  sender_type: 'owner' | 'agent' | 'system';
  content: string;
  status: 'sending' | 'streaming' | 'sent' | 'failed';
  run_id?: string | null;
  run_status?: OwnerAgentRunStatus;
  created_at: string;
}

export interface OwnerAgentReply {
  id: string;
  content: string;
  created_at: string;
}

interface OwnerAgentHistoryMessage {
  id: string;
  sender_type: 'owner' | 'agent' | 'system';
  content: string;
  status?: ChatMessage['status'];
  run_id?: string | null;
  run_status?: OwnerAgentRunStatus;
  created_at: string;
}

export type AgentConnectionStatus =
  | 'online'
  | 'offline'
  | 'pending'
  | 'running'
  | 'failed';

export interface ChatClient {
  listAgents(): Promise<OwnerAgentSummary[]>;
  listMessages(agentId: string): Promise<ChatMessage[]>;
  createAgent(payload: OwnerAgentCreateAgentRequest): Promise<OwnerAgentSummary>;
  createHostToken(payload: CreateHostTokenPayload): Promise<OwnerAgentCreateHostTokenResponse>;
  sendMessage(
    agentId: string,
    content: string,
    clientId: string,
  ): Promise<OwnerAgentSendMessageResponse>;
  streamMessage(
    agentId: string,
    content: string,
    clientId: string,
    signal: AbortSignal,
  ): AsyncGenerator<OpenAISSEEvent>;
  waitForRunReply(agentId: string, runId: string, timeoutMs?: number): Promise<OwnerAgentReply | null>;
  resetContext(agentId: string): Promise<void>;
  stopStream?(agentId: string): void;
}

export interface CreateHostTokenPayload {
  label?: string;
  provider: OwnerAgentProvider;
}

const DEFAULT_GATEWAY_URL = 'https://gateway-test.qrclaw.ai';

interface AuthContext {
  accessToken: string;
  userId: string;
}

interface GatewayErrorBody {
  error?: {
    message?: string;
  };
}

const getGatewayBaseUrl = (): string => {
  return (process.env.NEXT_PUBLIC_GATEWAY_URL ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
};

const getAuthContext = async (): Promise<AuthContext> => {
  const supabase = createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const userId = sessionData.session?.user?.id;
  if (sessionError || !accessToken || !userId) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  return { accessToken, userId };
};

const getOwnerId = async (userId: string): Promise<string> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('owners')
    .select('id')
    .eq('user_id', userId)
    .single();

  const ownerId = (data as { id?: string } | null)?.id;
  if (error || !ownerId) {
    throw new Error('Owner profile not found');
  }

  return ownerId;
};

const callGateway = async <T>(
  path: string,
  accessToken: string,
  init: RequestInit,
): Promise<T> => {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const body = (parsed ?? {}) as GatewayErrorBody;
    throw new Error(body.error?.message ?? 'Request failed');
  }

  return parsed as T;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const HISTORY_REPLAY_RETRY_DELAYS_MS =
  process.env.NODE_ENV === 'test' ? [] : [2_000, 5_000, 10_000];
const activeStreams = new Map<string, AbortController>();

const waitForOwnerAgentRunReply = async (
  agentId: string,
  runId: string,
  timeoutMs = 60_000,
): Promise<OwnerAgentReply | null> => {
  const { accessToken } = await getAuthContext();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await callGateway<{ data: OwnerAgentHistoryMessage[] }>(
        `/api/owner/agents/${agentId}/messages`,
        accessToken,
        { method: 'GET' },
      );
      const message = [...response.data]
        .reverse()
        .find(
          (entry) =>
            entry.sender_type === 'agent' &&
            entry.run_id === runId &&
            entry.content.trim().length > 0 &&
            !isDecryptionSentinel(entry.content),
        );
      if (message) {
        return {
          id: message.id,
          content: message.content,
          created_at: message.created_at,
        };
      }
    } catch {
      // Gateway may be briefly unavailable while persisting — keep polling.
    }

    await delay(250);
  }

  return null;
};

export const httpChatClient: ChatClient = {
  async listAgents() {
    const { accessToken } = await getAuthContext();
    const response = await callGateway<{ data: OwnerAgentSummary[] }>(
      '/api/owner/agents',
      accessToken,
      { method: 'GET' },
    );
    return response.data;
  },
  async listMessages(agentId) {
    const { accessToken } = await getAuthContext();
    const response = await callGateway<{ data: OwnerAgentHistoryMessage[] }>(
      `/api/owner/agents/${agentId}/messages`,
      accessToken,
      { method: 'GET' },
    );
    return response.data.map(mapHistoryMessage).filter((m): m is ChatMessage => m !== null);
  },
  async createAgent(payload) {
    const { accessToken } = await getAuthContext();
    const response = await callGateway<{ data: OwnerAgentSummary }>(
      '/api/owner/agents',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },
  async createHostToken(payload) {
    const { accessToken, userId } = await getAuthContext();
    const ownerId = await getOwnerId(userId);
    return await callGateway<OwnerAgentCreateHostTokenResponse>(
      '/api/owner/host-tokens',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          label: payload.label,
          scope: {
            owner_id: ownerId,
            allowed_provider_set: [payload.provider],
            can_register_local: true,
            can_receive_private_runs: true,
          },
        }),
      },
    );
  },
  async sendMessage(agentId, content, clientId) {
    const { accessToken } = await getAuthContext();
    return await callGateway<OwnerAgentSendMessageResponse>(
      `/api/owner/agents/${agentId}/messages`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          content_type: 'text',
          client_message_id: clientId,
        }),
      },
    );
  },
  async *streamMessage(agentId, content, clientId, signal) {
    const { accessToken } = await getAuthContext();
    const response = await fetch(`${getGatewayBaseUrl()}/api/owner/agents/${agentId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stream: true,
        client_message_id: clientId,
        messages: [{ role: 'user', content }],
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`chat http ${response.status}`);
    }

    // Emit the gateway-assigned run_id BEFORE the SSE body so callers can
    // rewrite their optimistic assistant bubble. Without this the WS
    // owner_agent_run_completed frame (which carries the real run_id) can't
    // find the bubble and appends a duplicate — which also leaves the
    // bubble in 'streaming' state, locking the composer input.
    const realRunId = response.headers.get('X-QRClaw-Run-Id');
    if (realRunId) {
      yield { type: 'run_id', runId: realRunId };
    }

    let sawContent = false;
    for await (const event of parseOpenAISSE(response.body, signal)) {
      if (event.type === 'delta' && event.content.length > 0) {
        sawContent = true;
      }
      yield event;
    }

    // The host may complete through WS while the SSE response is still racing
    // with the client state update. If SSE finishes without carrying any text,
    // ask the persisted conversation for the completed agent message so the UI
    // does not stay on an empty streaming bubble.
    if (!sawContent && realRunId && !signal.aborted) {
      const reply = await waitForOwnerAgentRunReply(agentId, realRunId, 20_000);
      if (reply?.content) {
        yield { type: 'delta', content: reply.content };
      }
    }
  },
  waitForRunReply: waitForOwnerAgentRunReply,
  async resetContext(agentId) {
    const { accessToken } = await getAuthContext();
    await callGateway(
      `/api/owner/agents/${agentId}/conversation/reset`,
      accessToken,
      { method: 'POST' },
    );
  },
};

export const mockChatClient: ChatClient = {
  async listAgents() {
    return [];
  },
  async listMessages() {
    return [];
  },
  async createAgent(payload) {
    return {
      id: `agent-${payload.name}`,
      name: payload.name,
      avatar_url: payload.avatar_url ?? null,
      description: payload.description ?? null,
      backend_provider: payload.backend_provider,
      backend_source: payload.backend_source,
      execution_mode: payload.execution_mode,
      status: 'active',
      runtime_id: null,
      runtime_status: null,
      is_default: false,
      source: 'user_created',
      last_active_at: null,
      created_at: new Date().toISOString(),
    };
  },
  async createHostToken(payload) {
    return {
      token_id: `token-${payload.provider}`,
      token: 'qrclaw_host_test',
      scope: {
        owner_id: 'owner-test',
        allowed_provider_set: [payload.provider],
        can_register_local: true,
        can_receive_private_runs: true,
      },
      expires_at: null,
      created_at: new Date().toISOString(),
    };
  },
  async sendMessage(agentId, _content, clientId) {
    return {
      message_id: clientId,
      conversation_id: `conv-${agentId}`,
      run_id: `run-${clientId}`,
      status: 'pending',
    };
  },
  async *streamMessage() {
    yield { type: 'done', finishReason: 'stop' };
  },
  async waitForRunReply() {
    return null;
  },
  async resetContext() {
    // TODO(wave6): call POST /api/owner/agents/:id/reset-context
  },
  stopStream() {
    // no-op mock hook
  },
};

export interface LocalHostConnectUi {
  banner_title_idle: string;
  banner_title_reconnecting: string;
  banner_body: string;
  banner_extra: string;
  agents_hint: string;
}

export interface OwnerAgentChatState {
  client: ChatClient;
  agents: OwnerAgentSummary[];
  selectedAgentId: string | null;
  messagesByAgent: Record<string, ChatMessage[]>;
  statusByAgent: Record<string, AgentConnectionStatus>;
  loading: boolean;
  error: string | null;
  localHostOnlineCount: number | null;
  localHostAttachCommand: string | null;
  localHostInstallHint: string | null;
  localHostConnectUi: LocalHostConnectUi | null;
  /** LOCAL_DEV: true after auto sign-in + ensure-daemon completes */
  localDevAuthReady: boolean;

  // actions
  _setClient(c: ChatClient): void;
  setLocalDevAuthReady(ready: boolean): void;
  connectLocalHost(maxRetries?: number): Promise<ConnectLocalHostResult>;
  loadAgents(): Promise<void>;
  loadMessages(agentId: string): Promise<void>;
  selectAgent(agentId: string | null): void;
  sendMessage(
    agentId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<void>;
  stopStream(agentId: string): void;
  resetContext(agentId: string): Promise<void>;
  createAgent(payload: OwnerAgentCreateAgentRequest): Promise<OwnerAgentSummary>;
  createHostToken(payload: CreateHostTokenPayload): Promise<OwnerAgentCreateHostTokenResponse>;
  setStatus(agentId: string, status: AgentConnectionStatus): void;
}

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cid-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const isDecryptionSentinel = (content: string): boolean =>
  content === DECRYPTION_FAILED_SENTINEL ||
  content === DECRYPTION_UNAVAILABLE_SENTINEL;

const mapHistoryMessage = (message: OwnerAgentHistoryMessage): ChatMessage | null => {
  if (isDecryptionSentinel(message.content)) {
    return null;
  }
  return {
    id: message.id,
    sender_type: message.sender_type,
    content: message.content,
    status: message.status ?? 'sent',
    run_id: message.run_id ?? null,
    run_status: message.run_status,
    created_at: message.created_at,
  };
};

const mapRuntimeStatusToConnectionStatus = (
  status: OwnerAgentSummary['runtime_status'],
): AgentConnectionStatus => {
  if (status === 'online') {
    return 'online';
  }
  if (status === 'updating') {
    return 'pending';
  }
  return 'offline';
};

const messageDedupeKeys = (message: ChatMessage): string[] => {
  const keys = [`id:${message.id}`];
  if (message.run_id && message.content.trim().length > 0) {
    keys.push(`run:${message.sender_type}:${message.run_id}:${message.content}`);
  }
  return keys;
};

const isInFlightMessage = (message: ChatMessage): boolean =>
  message.status === 'sending' ||
  message.status === 'streaming' ||
  message.run_status === 'running';

const mergeMessages = (history: ChatMessage[], current: ChatMessage[]): ChatMessage[] => {
  const historyIds = new Set(history.map((message) => message.id));
  const seen = new Set<string>();
  const merged: ChatMessage[] = [];

  const tryAdd = (message: ChatMessage): void => {
    if (isDecryptionSentinel(message.content)) {
      return;
    }
    const keys = messageDedupeKeys(message);
    if (keys.some((key) => seen.has(key))) {
      return;
    }
    merged.push(message);
    keys.forEach((key) => seen.add(key));
  };

  for (const message of history) {
    tryAdd(message);
  }

  for (const message of current) {
    const keepLocal =
      isInFlightMessage(message) ||
      message.status === 'failed' ||
      !historyIds.has(message.id);
    if (keepLocal) {
      tryAdd(message);
    }
  }

  return merged;
};

const loadMessagesForAgent = async (
  get: () => OwnerAgentChatState,
  set: (
    partial:
      | Partial<OwnerAgentChatState>
      | ((state: OwnerAgentChatState) => Partial<OwnerAgentChatState> | OwnerAgentChatState),
  ) => void,
  agentId: string,
): Promise<void> => {
  try {
    const messages = await get().client.listMessages(agentId);
    set((s) => {
      return {
        messagesByAgent: {
          ...s.messagesByAgent,
          [agentId]: mergeMessages(messages, s.messagesByAgent[agentId] ?? []),
        },
      };
    });
  } catch (e) {
    set({ error: e instanceof Error ? e.message : 'failed to load messages' });
  }
};

export const useOwnerAgentChatStore = create<OwnerAgentChatState>((set, get) => ({
  client: httpChatClient,
  agents: [],
  selectedAgentId: null,
  messagesByAgent: {},
  statusByAgent: {},
  loading: false,
  error: null,
  localHostOnlineCount: null,
  localHostAttachCommand: null,
  localHostInstallHint: null,
  localHostConnectUi: null,
  localDevAuthReady: process.env.NEXT_PUBLIC_LOCAL_DEV !== '1',

  _setClient(c) {
    set({ client: c });
  },

  setLocalDevAuthReady(ready) {
    set({ localDevAuthReady: ready });
  },

  async connectLocalHost(maxRetries = 3) {
    const result = await connectLocalHost({ maxRetries });
    await get().loadAgents();
    return result;
  },

  async loadAgents() {
    set({ loading: true, error: null });
    const isLocalShell =
      process.env.NEXT_PUBLIC_LOCAL_DEV === '1' ||
      (typeof window !== 'undefined' && isDesktopMode());
    let lastError: unknown = null;
    for (let attempt = 0; attempt < (isLocalShell ? 5 : 1); attempt += 1) {
      try {
        let hostStatus:
          | {
              online_runtime_count: number;
              attach_command: string;
              install_hint: string | null;
              connect_ui: LocalHostConnectUi | null;
              providers?: Array<{ provider: string; status: string }>;
            }
          | null = null;

        try {
          const { accessToken } = await getAuthContext();
          for (let hostAttempt = 0; hostAttempt < 4; hostAttempt += 1) {
            const status = await callGateway<{
              data: {
                online_runtime_count: number;
                attach_command: string;
                install_hint: string | null;
                connect_ui: LocalHostConnectUi | null;
                providers?: Array<{ provider: string; status: string }>;
              };
            }>('/api/owner/local-host/status', accessToken, { method: 'GET' });
            hostStatus = status.data;
            if ((hostStatus.online_runtime_count ?? 0) > 0) break;
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch {
          hostStatus = null;
        }

        const agents = await get().client.listAgents();
        const providerOnline = new Map<string, boolean>();
        for (const row of hostStatus?.providers ?? []) {
          if (row.status === 'online') {
            providerOnline.set(row.provider, true);
          }
        }

        let nextSelected: string | null = null;
        set((s) => {
          nextSelected = s.selectedAgentId ?? agents[0]?.id ?? null;
          const statusByAgent = { ...s.statusByAgent };
          for (const agent of agents) {
            if (statusByAgent[agent.id] === 'running') {
              continue;
            }
            const fromDb = mapRuntimeStatusToConnectionStatus(agent.runtime_status);
            const fromLive = providerOnline.get(agent.backend_provider)
              ? ('online' as const)
              : null;
            statusByAgent[agent.id] = fromLive ?? fromDb;
          }
          return {
            agents,
            loading: false,
            selectedAgentId: nextSelected,
            statusByAgent,
            localHostOnlineCount: hostStatus?.online_runtime_count ?? null,
            localHostAttachCommand: hostStatus?.attach_command ?? null,
            localHostInstallHint: hostStatus?.install_hint ?? null,
            localHostConnectUi: hostStatus?.connect_ui ?? null,
          };
        });
        if (nextSelected) {
          void loadMessagesForAgent(get, set, nextSelected);
        }
        return;
      } catch (e) {
        lastError = e;
        if (!isLocalShell || attempt >= 4) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    set({
      loading: false,
      error: lastError instanceof Error ? lastError.message : 'failed to load agents',
      localHostOnlineCount: null,
      localHostAttachCommand: null,
      localHostInstallHint: null,
      localHostConnectUi: null,
    });
  },

  async createAgent(payload) {
    set({ loading: true, error: null });
    try {
      const agent = await get().client.createAgent(payload);
      set((s) => ({
        agents: [agent, ...s.agents.filter((existing) => existing.id !== agent.id)],
        selectedAgentId: agent.id,
        loading: false,
      }));
      return agent;
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'failed to create agent',
      });
      throw e;
    }
  },

  async createHostToken(payload) {
    set({ error: null });
    try {
      return await get().client.createHostToken(payload);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'failed to create host token' });
      throw e;
    }
  },

  async loadMessages(agentId) {
    await loadMessagesForAgent(get, set, agentId);
  },

  selectAgent(agentId) {
    set({ selectedAgentId: agentId });
    if (!agentId) return;
    void loadMessagesForAgent(get, set, agentId);
    for (const retryDelayMs of HISTORY_REPLAY_RETRY_DELAYS_MS) {
      window.setTimeout(() => {
        if (get().selectedAgentId === agentId) {
          void loadMessagesForAgent(get, set, agentId);
        }
      }, retryDelayMs);
    }
  },

  async sendMessage(agentId, content, clientMessageId) {
    const trimmed = content.trim();
    if (!trimmed) return;
    activeStreams.get(agentId)?.abort();
    const clientId = clientMessageId ?? genId();
    const assistantId = `assistant-${clientId}`;
    const now = new Date().toISOString();
    const optimistic: ChatMessage = {
      id: clientId,
      client_id: clientId,
      sender_type: 'owner',
      content: trimmed,
      status: 'sending',
      created_at: now,
    };
    const assistant: ChatMessage = {
      id: assistantId,
      client_id: assistantId,
      sender_type: 'agent',
      content: '',
      status: 'streaming',
      run_id: clientId,
      run_status: 'running',
      created_at: now,
    };
    set((s) => ({
      messagesByAgent: {
        ...s.messagesByAgent,
        [agentId]: [...(s.messagesByAgent[agentId] ?? []), optimistic, assistant],
      },
      statusByAgent: { ...s.statusByAgent, [agentId]: 'running' },
    }));
    const controller = new AbortController();
    activeStreams.set(agentId, controller);
    let ownerMessageSent = false;
    let adoptedRunId: string | null = null;

    const markOwnerSent = () => {
      if (ownerMessageSent) return;
      ownerMessageSent = true;
      set((s) => ({
        messagesByAgent: {
          ...s.messagesByAgent,
          [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
            message.id === clientId ? { ...message, status: 'sent' } : message,
          ),
        },
      }));
    };

    try {
      for await (const event of get().client.streamMessage(
        agentId,
        trimmed,
        clientId,
        controller.signal,
      )) {
        markOwnerSent();
        if (event.type === 'run_id') {
          // Adopt the gateway-assigned run_id on our optimistic assistant
          // bubble so the WS completion frame dedupes (see streamMessage).
          const realRunId = event.runId;
          adoptedRunId = realRunId;
          set((s) => ({
            messagesByAgent: {
              ...s.messagesByAgent,
              [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
                message.id === assistantId
                  ? { ...message, run_id: realRunId }
                  : message.id === clientId
                    ? { ...message, run_id: realRunId }
                    : message,
              ),
            },
          }));
        } else if (event.type === 'delta') {
          set((s) => ({
            messagesByAgent: {
              ...s.messagesByAgent,
              [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${event.content}` }
                  : message,
              ),
            },
          }));
        } else if (event.type === 'error') {
          throw new Error(event.message);
        } else {
          break;
        }
      }
      markOwnerSent();
      let assistantAfterStream = (get().messagesByAgent[agentId] ?? []).find(
        (message) => message.id === assistantId,
      );
      const needsReplyFallback =
        assistantAfterStream &&
        !controller.signal.aborted &&
        (!assistantAfterStream.content.trim() ||
          assistantAfterStream.status === 'streaming' ||
          assistantAfterStream.run_status === 'running');
      if (needsReplyFallback && assistantAfterStream?.run_id) {
        try {
          const reply = await get().client.waitForRunReply(
            agentId,
            assistantAfterStream.run_id,
            20_000,
          );
          if (reply?.content) {
            set((s) => ({
              messagesByAgent: {
                ...s.messagesByAgent,
                [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: message.content.trim()
                          ? message.content
                          : reply.content,
                        status: 'sent' as const,
                        run_status: 'completed' as const,
                      }
                    : message,
                ),
              },
            }));
            assistantAfterStream = get().messagesByAgent[agentId]?.find(
              (message) => message.id === assistantId,
            );
          }
        } catch {
          // waitForRunReply errors are surfaced via the outer catch when send fails.
        }
      }
      set((s) => ({
        messagesByAgent: {
          ...s.messagesByAgent,
          [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  status: message.content.trim() ? ('sent' as const) : ('failed' as const),
                  run_status: message.content.trim()
                    ? ('completed' as const)
                    : ('failed' as const),
                  // A completed run that produced no text leaves an empty
                  // bubble that would otherwise render the "思考中" indicator
                  // forever. Surface a clean placeholder instead.
                  content: message.content.trim() ? message.content : '回复失败，请重试',
                }
              : message,
          ),
        },
        statusByAgent: {
          ...s.statusByAgent,
          [agentId]: 'online',
        },
      }));
      const agent = get().agents.find((item) => item.id === agentId);
      maybeSummarizeConversationToProgress(agent, get().messagesByAgent[agentId] ?? []);
    } catch (e) {
      const aborted = controller.signal.aborted;
      const ownerPersisted = ownerMessageSent || Boolean(adoptedRunId);
      set((s) => ({
        statusByAgent: { ...s.statusByAgent, [agentId]: 'online' },
        messagesByAgent: {
          ...s.messagesByAgent,
          [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
            message.id === clientId
              ? {
                  ...message,
                  status: ownerPersisted || aborted ? 'sent' : 'failed',
                  run_id: adoptedRunId ?? message.run_id,
                }
              : message.id === assistantId
                ? {
                    ...message,
                    status: aborted ? ('sent' as const) : ('failed' as const),
                    run_status: aborted ? ('completed' as const) : ('failed' as const),
                    // Never surface the raw JS/DOMException string (e.g.
                    // "signal is aborted without reason") in the bubble. Keep
                    // any partial content; otherwise show a clean, localized
                    // placeholder so the bubble is not stuck on the thinking
                    // indicator (which renders whenever content is empty).
                    content:
                      message.content.trim().length > 0
                        ? message.content
                        : aborted
                          ? '（已取消）'
                          : '回复失败，请重试',
                  }
                : message,
          ),
        },
        error: aborted ? null : e instanceof Error ? e.message : 'send failed',
      }));
    } finally {
      if (activeStreams.get(agentId) === controller) {
        activeStreams.delete(agentId);
      }
    }
  },

  stopStream(agentId) {
    activeStreams.get(agentId)?.abort();
    get().client.stopStream?.(agentId);
  },

  async resetContext(agentId) {
    await get().client.resetContext(agentId);
    set((s) => ({
      statusByAgent: { ...s.statusByAgent, [agentId]: 'online' },
    }));
  },

  setStatus(agentId, status) {
    set((s) => ({ statusByAgent: { ...s.statusByAgent, [agentId]: status } }));
  },

  // ── WS subscription (HEL-57) ───────────────────────────────────
  // Subscribes to gateway WS to receive owner_agent_run_event /
  // owner_agent_run_completed frames pushed by gateway after host
  // delivers a reply.
  // Stored on globalThis so HMR doesn't multiply connections.
}));

// HMR-safe single connection holder
const WS_KEY = '__qrclaw_owner_ws__';
const WS_RECONNECT_KEY = '__qrclaw_owner_ws_reconnect__';
type Holder = { ws: WebSocket | null; agentToConvo: Map<string, string> };
type ReconnectState = {
  timer: ReturnType<typeof setTimeout> | number | null;
  attempt: number;
  connecting: boolean;
};
interface OwnerWsPayload {
  agent_id?: string;
  content?: string;
  final_message?: string;
  run_id?: string;
  error_message?: string;
}

interface OwnerWsFrame {
  type?: string;
  timestamp?: string;
  payload?: OwnerWsPayload;
}

type GlobalOwnerWs = typeof globalThis & {
  [WS_KEY]?: Holder;
  [WS_RECONNECT_KEY]?: ReconnectState;
};
type OwnerAgentDebugWindow = Window & {
  __OWNER_AGENT_STORE__?: typeof useOwnerAgentChatStore;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const globalOwnerWs = globalThis as GlobalOwnerWs;
const holder: Holder = globalOwnerWs[WS_KEY] ?? { ws: null, agentToConvo: new Map() };
globalOwnerWs[WS_KEY] = holder;
const reconnectState: ReconnectState = globalOwnerWs[WS_RECONNECT_KEY] ?? {
  timer: null,
  attempt: 0,
  connecting: false,
};
globalOwnerWs[WS_RECONNECT_KEY] = reconnectState;

const scheduleOwnerWsReconnect = (): void => {
  if (typeof window === 'undefined' || reconnectState.timer) return;
  const delayMs = Math.min(30_000, 1_000 * 2 ** reconnectState.attempt);
  reconnectState.attempt += 1;
  reconnectState.timer = window.setTimeout(() => {
    reconnectState.timer = null;
    void ensureOwnerWsSubscription().catch(() => {
      scheduleOwnerWsReconnect();
    });
  }, delayMs);
};

export async function ensureOwnerWsSubscription(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (
    process.env.NEXT_PUBLIC_LOCAL_DEV === '1' &&
    !useOwnerAgentChatStore.getState().localDevAuthReady
  ) {
    return;
  }
  if (holder.ws?.readyState === WebSocket.OPEN) return;
  if (holder.ws?.readyState === WebSocket.CONNECTING || reconnectState.connecting) return;

  reconnectState.connecting = true;
  try {
  const ctx = await getAuthContext();
  const gatewayBase = getGatewayBaseUrl();
  const ticketRes = await fetch(`${gatewayBase}/api/owner/ws-ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!ticketRes.ok) throw new Error(`ws-ticket failed: ${ticketRes.status}`);
  const body = (await ticketRes.json()) as {
    data: { ticket: string; gateway_url: string };
  };

  const wsUrl = `${body.data.gateway_url}?ticket=${encodeURIComponent(body.data.ticket)}`;
  const ws = new WebSocket(wsUrl);
  holder.ws = ws;

  ws.onopen = () => {
    reconnectState.attempt = 0;
  };

  ws.onmessage = (ev) => {
    let frame: OwnerWsFrame;
    try {
      const parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as unknown;
      if (!isRecord(parsed)) return;
      frame = parsed as OwnerWsFrame;
    } catch {
      return;
    }
    if (
      frame.type === 'owner_agent_run_event' ||
      frame.type === 'owner_agent_run_completed' ||
      frame.type === 'owner_agent_run_failed'
    ) {
      if (frame.type === 'owner_agent_run_failed') {
        const agentId = frame.payload?.agent_id;
        const runId = frame.payload?.run_id;
        const errorMessage = 'Agent execution failed. Please check this local agent setup.';
        if (!agentId || !runId) return;
        useOwnerAgentChatStore.setState((s) => ({
          statusByAgent: { ...s.statusByAgent, [agentId]: 'online' },
          messagesByAgent: {
            ...s.messagesByAgent,
            [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
              message.run_id === runId && message.sender_type === 'agent'
                ? {
                    ...message,
                    status: 'failed' as const,
                    run_status: 'failed' as const,
                    content: message.content || errorMessage || 'Agent run failed',
                  }
                : message,
            ),
          },
          error: errorMessage ?? 'Agent run failed',
        }));
        return;
      }

      const agentId = frame.payload?.agent_id;
      const content =
        frame.type === 'owner_agent_run_completed'
          ? frame.payload?.final_message ?? frame.payload?.content
          : frame.payload?.content;
      const runId = frame.payload?.run_id;
      if (!agentId || !content || !runId) return;
      // The POST /chat response and the owner WS completion can race. If the
      // completion arrives before the optimistic assistant bubble adopts the
      // gateway run_id, it used to miss the bubble and leave the composer
      // permanently locked in `running`. Apply the incoming run_id to the
      // latest in-flight bubble first, then let the normal matcher update it.
      const current = useOwnerAgentChatStore.getState();
      const listForAgent = current.messagesByAgent[agentId] ?? [];
      const hasRunId = listForAgent.some(
        (m) => m.sender_type === 'agent' && m.run_id === runId,
      );
      if (!hasRunId) {
        const inFlight = [...listForAgent]
          .reverse()
          .find(
            (m) =>
              m.sender_type === 'agent' &&
              (m.status === 'streaming' || m.run_status === 'running'),
          );
        if (inFlight) {
          useOwnerAgentChatStore.setState((s) => ({
            messagesByAgent: {
              ...s.messagesByAgent,
              [agentId]: (s.messagesByAgent[agentId] ?? []).map((message) =>
                message.id === inFlight.id ? { ...message, run_id: runId } : message,
              ),
            },
          }));
        }
      }
      const isCompleted = frame.type === 'owner_agent_run_completed';
      useOwnerAgentChatStore.setState((s) => {
        const list = s.messagesByAgent[agentId] ?? [];
        // Prefer matching by run_id (adopted from SSE header) but fall back
        // to the in-flight streaming assistant bubble when WS beats the SSE
        // `run_id` event. Without this fallback a duplicate assistant
        // message is appended AND the original bubble stays
        // `run_status: running`, which the assistant-ui Thread reads as
        // "still generating" and locks the composer input.
        const matched =
          list.find((m) => m.run_id === runId && m.sender_type === 'agent') ??
          list.find(
            (m) =>
              m.sender_type === 'agent' &&
              (m.status === 'streaming' || m.run_status === 'running'),
          );
        let nextList: ChatMessage[];
        if (matched) {
          if (matched.content) {
            // SSE is the primary stream for the current tab. When WS delivers
            // the same final message, only use it to settle status; do not
            // append/overwrite content and create a visible duplicate.
            nextList = list.map((m) =>
              m === matched && isCompleted
                ? {
                    ...m,
                    run_id: runId,
                    status: 'sent' as const,
                    run_status: 'completed' as const,
                  }
                : m,
            );
          } else {
            nextList = list.map((m) =>
              m === matched
                ? {
                    ...m,
                    run_id: runId,
                    content,
                    status: isCompleted ? ('sent' as const) : m.status,
                    run_status: isCompleted ? ('completed' as const) : m.run_status,
                  }
                : m,
            );
          }
        } else {
          // No in-flight bubble (e.g. reload / other tab) → append fresh.
          nextList = [
            ...list,
            {
              id: `${runId}-evt`,
              sender_type: 'agent',
              content,
              status: 'sent',
              run_id: runId,
              run_status: isCompleted
                ? ('completed' as const)
                : ('running' as const),
              created_at: frame.timestamp ?? new Date().toISOString(),
            },
          ];
        }
        const next: Partial<OwnerAgentChatState> = {
          messagesByAgent: { ...s.messagesByAgent, [agentId]: nextList },
        };
        if (isCompleted) {
          next.statusByAgent = {
            ...s.statusByAgent,
            [agentId]: 'online',
          };
        }
        return next;
      });
    }
  };

  ws.onclose = () => {
    holder.ws = null;
    scheduleOwnerWsReconnect();
  };
  ws.onerror = () => {
    /* onclose handles reconnect */
  };
  } finally {
    reconnectState.connecting = false;
  }
}

// Test-only reset helper.
export const __resetOwnerAgentChatStoreForTests = () => {
  useOwnerAgentChatStore.setState({
    client: mockChatClient,
    agents: [],
    selectedAgentId: null,
    messagesByAgent: {},
    statusByAgent: {},
    loading: false,
    error: null,
    localHostOnlineCount: null,
    localHostAttachCommand: null,
    localHostInstallHint: null,
    localHostConnectUi: null,
    localDevAuthReady: process.env.NEXT_PUBLIC_LOCAL_DEV !== '1',
  });
  holder.ws = null;
  holder.agentToConvo.clear();
  reconnectState.timer = null;
  reconnectState.attempt = 0;
  reconnectState.connecting = false;
};

// E2E diagnostic: expose store for Playwright tests (non-prod only)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as OwnerAgentDebugWindow).__OWNER_AGENT_STORE__ = useOwnerAgentChatStore;
}
