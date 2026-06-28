import { createHash, randomBytes } from 'crypto';
import {
  OWNER_AGENT_PROVIDERS,
  type OwnerAgentBackendSource,
  type OwnerAgentCreateAgentRequest,
  type OwnerAgentProvider,
  type OwnerAgentRunStatus,
  type OwnerAgentSendMessageRequest,
  type OwnerAgentSendMessageResponse,
} from '../../../shared/contracts/http/owner-agent-chat/types.js';
import type { OwnerAgentRunRequestFrame } from '../../../shared/contracts/ws/types.js';
import { encrypt } from '../crypto/envelope.js';
import { getOwnerAgentDEK } from '../crypto/owner-agent-dek.js';
import {
  countPendingOwnerAgentMessages,
  createAgentBindingRecord,
  createOwnerAgentRecord,
  createOwnerAgentRunRecord,
  findOwnerAgentMessageTarget,
  findPendingOwnerAgentMessageByRun,
  findOwnerHostProvider,
  getOwnerAgentConversation,
  getOrCreateOwnerAgentConversation,
  insertOwnerAgentMessageRecord,
  insertOwnerAgentRunEventRecord,
  listOwnerAgentBindingRecords,
  listOwnerAgentRecords,
  listTimedOutOwnerAgentRuns,
  markExpiredPendingOwnerAgentMessages,
  updateOwnerAgentConversationRuntime,
  updateOwnerAgentMessageStatus,
  updateOwnerAgentRunStatus,
  upsertOwnerAgentConversationKey,
  type OwnerAgentBindingRecord,
  type OwnerAgentRecord,
} from '../db/owner-agent-chat.js';
import { listAgentRuntimes, type AgentRuntimeRecord } from '../db/owner-runtimes.js';
import { hasHostConnection, sendRunToHost } from './agent-host-registry.js';
import { getDefaultAgentRuntimeType } from './default-owner-agents.js';

const HIGH_PERMISSION_PROVIDERS = new Set<string>(OWNER_AGENT_PROVIDERS);
const PENDING_MESSAGE_LIMIT = 50;
const PENDING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export class OwnerAgentChatServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface OwnerAgentResponse {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  instructions: string | null;
  suggested_prompts: string[];
  backend_provider: OwnerAgentProvider;
  backend_source: OwnerAgentBackendSource;
  execution_mode: 'standard' | 'full_access';
  status: 'active' | 'archived';
  runtime_id: string | null;
  runtime_status: 'online' | 'offline' | 'updating' | null;
  runtime_version: string | null;
  runtime_models: string[];
  is_default: boolean;
  source: 'system_default' | 'user_created' | 'imported';
  last_active_at: string | null;
  created_at: string;
}

export interface StartOwnerAgentRunInput {
  content: string;
  content_type: 'text';
  requested_model: string | null;
}

export interface StartOwnerAgentRunResult {
  runId: string;
  conversationId: string;
  status: 'running' | 'pending';
  provider: OwnerAgentProvider;
  requestedModel: string | null;
}

export interface StartOwnerAgentRunOptions {
  beforeDispatch?: (run: {
    runId: string;
    conversationId: string;
    provider: OwnerAgentProvider;
    requestedModel: string | null;
  }) => void;
}

interface PreparedOwnerAgentRun {
  messageId: string;
  conversationId: string;
  runId: string;
  ownerId: string;
  agentId: string;
  hostId: string | null;
  provider: OwnerAgentProvider;
  requestedModel: string | null;
  runRequestFrame: OwnerAgentRunRequestFrame;
}

export const listOwnerAgents = async (ownerId: string): Promise<OwnerAgentResponse[]> => {
  const [agents, bindings, runtimes] = await Promise.all([
    listOwnerAgentRecords(ownerId),
    listOwnerAgentBindingRecords(ownerId),
    listAgentRuntimes({ ownerId }),
  ]);
  const bindingsByAgentId = new Map(bindings.map((binding) => [binding.agentId, binding]));

  return agents.flatMap((agent) => {
    const binding = bindingsByAgentId.get(agent.id);
    const runtime = binding
      ? pickPreferredRuntime(binding.provider, agent.runtimeId, runtimes)
      : agent.runtimeId
        ? runtimes.find((entry) => entry.id === agent.runtimeId) ?? null
        : null;
    if (binding) {
      return [mapOwnerAgentResponse(agent, {
        backendProvider: binding.provider,
        backendSource: binding.bindingKind === 'cloud_plugin' ? 'cloud' : 'local',
        runtimeId: runtime?.id ?? agent.runtimeId,
        runtimeStatus: runtime?.runtimeStatus ?? null,
        runtimeVersion: runtime?.version ?? null,
        runtimeModels: getRuntimeModels(runtime),
      })];
    }

    const defaultRuntimeType = resolveDefaultAgentProvider(ownerId, agent, runtime);
    if (!defaultRuntimeType) {
      return [];
    }
    return [mapOwnerAgentResponse(agent, {
      backendProvider: defaultRuntimeType,
      backendSource: 'local',
      runtimeId: runtime?.id ?? agent.runtimeId,
      runtimeStatus: runtime?.runtimeStatus ?? null,
      runtimeVersion: runtime?.version ?? null,
      runtimeModels: getRuntimeModels(runtime),
    })];
  });
};

const pickPreferredRuntime = (
  provider: OwnerAgentProvider,
  linkedRuntimeId: string | null,
  runtimes: Awaited<ReturnType<typeof listAgentRuntimes>>,
): Awaited<ReturnType<typeof listAgentRuntimes>>[number] | null => {
  const forType = runtimes.filter((runtime) => runtime.runtimeType === provider);
  const online = forType
    .filter((runtime) => runtime.runtimeStatus === 'online')
    .sort(
      (a, b) =>
        Date.parse(b.lastSeenAt ?? b.updatedAt)
        - Date.parse(a.lastSeenAt ?? a.updatedAt),
    );
  if (online.length > 0) {
    return online[0];
  }
  if (linkedRuntimeId) {
    return forType.find((runtime) => runtime.id === linkedRuntimeId) ?? null;
  }
  return forType[0] ?? null;
};

export const createOwnerAgent = async (
  ownerId: string,
  request: OwnerAgentCreateAgentRequest
): Promise<OwnerAgentResponse> => {
  if (
    request.execution_mode === 'full_access'
    && HIGH_PERMISSION_PROVIDERS.has(request.backend_provider)
    && !request.execution_mode_ack
  ) {
    throw new OwnerAgentChatServiceError(
      400,
      'invalid_request',
      'Full Access confirmation is required for this provider'
    );
  }

  const hostProvider = await findOwnerHostProvider({
    ownerId,
    backendSource: request.backend_source,
    provider: request.backend_provider,
  });
  if (!hostProvider) {
    throw new OwnerAgentChatServiceError(
      403,
      'forbidden',
      'No authorized host provider is available for this owner'
    );
  }

  const agent = await createOwnerAgentRecord({
    ownerId,
    name: request.name,
    apiKeyHash: generateApiKeyHashPlaceholder(),
    avatarUrl: request.avatar_url ?? null,
    description: request.description ?? null,
    instructions: request.instructions ?? null,
    suggestedPrompts: request.suggested_prompts ?? [],
    executionMode: request.execution_mode,
  });
  const binding = await createAgentBindingRecord({
    agentId: agent.id,
    ownerId,
    bindingKind: request.backend_source === 'cloud' ? 'cloud_plugin' : 'local_host',
    hostId: hostProvider.hostId,
    preferredHostId: hostProvider.hostId,
    provider: request.backend_provider,
    executionMode: request.execution_mode,
  });

  return mapOwnerAgentResponse(agent, {
    backendProvider: binding.provider,
    backendSource: binding.bindingKind === 'cloud_plugin' ? 'cloud' : 'local',
    runtimeId: agent.runtimeId,
    runtimeStatus: null,
    runtimeVersion: null,
    runtimeModels: [],
  });
};

export const sendOwnerAgentMessage = async (
  ownerId: string,
  agentId: string,
  request: OwnerAgentSendMessageRequest
): Promise<OwnerAgentSendMessageResponse> => {
  const prepared = await prepareOwnerAgentRun(ownerId, agentId, request);
  const status = await dispatchPreparedOwnerAgentRun(prepared);
  return toSendMessageResponse(prepared.messageId, prepared.conversationId, prepared.runId, status);
};

export const startOwnerAgentRun = async (
  ownerId: string,
  agentId: string,
  input: StartOwnerAgentRunInput,
  options: StartOwnerAgentRunOptions = {}
): Promise<StartOwnerAgentRunResult> => {
  if (process.env.QRCLAW_DEMO_PROVIDER_FALLBACK === '1') {
    return startDemoOwnerAgentRun(ownerId, agentId, input);
  }

  const prepared = await prepareOwnerAgentRun(ownerId, agentId, {
    content: input.content,
    content_type: input.content_type,
    requested_model: input.requested_model ?? undefined,
  });
  const status = await dispatchPreparedOwnerAgentRun(prepared, options.beforeDispatch);
  return {
    runId: prepared.runId,
    conversationId: prepared.conversationId,
    status,
    provider: prepared.provider,
    requestedModel: prepared.requestedModel,
  };
};

export const resendOwnerAgentMessage = async (
  ownerId: string,
  agentId: string,
  runId: string,
  request: OwnerAgentSendMessageRequest
): Promise<OwnerAgentSendMessageResponse> => {
  const pending = await findPendingOwnerAgentMessageByRun(ownerId, agentId, runId);
  if (!pending) {
    throw new OwnerAgentChatServiceError(404, 'not_found', 'Pending owner agent message not found');
  }

  const completedAt = new Date().toISOString();
  await updateOwnerAgentMessageStatus(pending.messageId, ownerId, 'replaced');
  await updateOwnerAgentRunStatus(runId, ownerId, {
    status: 'cancelled',
    completedAt,
    errorCode: 'replaced',
    errorMessage: 'Pending message was manually resent',
  });

  return sendOwnerAgentMessage(ownerId, agentId, request);
};

export const resetOwnerAgentConversationContext = async (
  ownerId: string,
  agentId: string
): Promise<{ conversationId: string | null }> => {
  const target = await findOwnerAgentMessageTarget(ownerId, agentId);
  if (!target) {
    throw new OwnerAgentChatServiceError(404, 'not_found', 'Owner agent not found');
  }

  const conversation = await getOwnerAgentConversation(ownerId, agentId);
  if (!conversation) {
    return { conversationId: null };
  }

  await updateOwnerAgentConversationRuntime(conversation.id, {
    providerSessionId: null,
    providerWorkDir: null,
  });

  return { conversationId: conversation.id };
};

const startDemoOwnerAgentRun = async (
  ownerId: string,
  agentId: string,
  input: StartOwnerAgentRunInput
): Promise<StartOwnerAgentRunResult> => {
  const prepared = await prepareOwnerAgentRun(ownerId, agentId, {
    content: input.content,
    content_type: input.content_type,
    requested_model: input.requested_model ?? undefined,
  });
  const status = await dispatchPreparedOwnerAgentRun(prepared);
  if (status === 'running') {
    return {
      runId: prepared.runId,
      conversationId: prepared.conversationId,
      status,
      provider: prepared.provider,
      requestedModel: prepared.requestedModel,
    };
  }

  const finalMessage = `${providerDisplayName(prepared.provider)} 对话成功`;
  const { rawDek, dekId, info } = await getOwnerAgentDEK(prepared.conversationId);
  const encrypted = await encrypt(finalMessage, dekId, rawDek);
  const keyId = await upsertOwnerAgentConversationKey(prepared.conversationId, info.encryptedDek);
  await insertOwnerAgentRunEventRecord({
    runId: prepared.runId,
    ownerId,
    seq: 1,
    type: 'text',
    contentEncrypted: encrypted.ciphertext,
    encryptionMeta: {
      iv: encrypted.iv,
      tag: encrypted.tag,
      algorithm: encrypted.algorithm,
      dek_id: encrypted.dekId,
      key_id: keyId,
    },
    metadata: { final: true, demo_fallback: true },
  });
  await insertOwnerAgentMessageRecord({
    conversationId: prepared.conversationId,
    ownerId,
    agentId,
    runId: prepared.runId,
    senderType: 'agent',
    contentEncrypted: encrypted.ciphertext,
    contentType: 'text',
    encryptionMeta: {
      iv: encrypted.iv,
      tag: encrypted.tag,
      algorithm: encrypted.algorithm,
      dek_id: encrypted.dekId,
      key_id: keyId,
    },
    status: 'sent',
  });
  await updateOwnerAgentRunStatus(prepared.runId, ownerId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  return {
    runId: prepared.runId,
    conversationId: prepared.conversationId,
    status: 'running',
    provider: prepared.provider,
    requestedModel: prepared.requestedModel,
  };
};

const normalizeProviderForRuntime = (provider: OwnerAgentProvider): OwnerAgentProvider => {
  if (process.env.QRCLAW_CODEX_PROVIDER_FALLBACK === 'openclaw' && provider === 'codex') {
    return 'openclaw';
  }
  return provider;
};

const providerDisplayName = (provider: OwnerAgentProvider): string => {
  switch (provider) {
    case 'codex':
      return 'Codex Assistant';
    case 'cursor':
      return 'Cursor Assistant';
    case 'claude':
      return 'Claude Assistant';
    case 'openclaw':
      return 'OpenClaw Assistant';
    case 'pi':
      return 'Pi Assistant';
    default:
      return provider;
  }
};

const prepareOwnerAgentRun = async (
  ownerId: string,
  agentId: string,
  request: OwnerAgentSendMessageRequest
): Promise<PreparedOwnerAgentRun> => {
  // Housekeeping must not block the user send hot path.
  void failTimedOutRuns(ownerId).catch((err) => {
    console.error('[OwnerAgentChat] failTimedOutRuns:', (err as Error).message);
  });
  void expireStalePendingMessages(ownerId).catch((err) => {
    console.error('[OwnerAgentChat] expireStalePendingMessages:', (err as Error).message);
  });

  const target = await findOwnerAgentMessageTarget(ownerId, agentId);
  if (!target) {
    throw new OwnerAgentChatServiceError(404, 'not_found', 'Owner agent not found');
  }

  const provider = normalizeProviderForRuntime(target.binding.provider);
  const conversation = await getOrCreateOwnerAgentConversation(ownerId, agentId);
  let hostId = target.binding.preferredHostId ?? target.binding.hostId;
  if (!hostId) {
    const hostProvider = await findOwnerHostProvider({
      ownerId,
      backendSource: 'local',
      provider,
    });
    hostId = hostProvider?.hostId ?? null;
  }
  const likelyOnline = Boolean(hostId && hasHostConnection(hostId));
  if (!likelyOnline) {
    await assertPendingCapacity(conversation.id, ownerId, agentId);
  }

  const { rawDek, dekId, info } = await getOwnerAgentDEK(conversation.id);
  const envelope = await encrypt(request.content, dekId, rawDek);
  await upsertOwnerAgentConversationKey(conversation.id, info.encryptedDek);

  const requestedModel = request.requested_model ?? null;
  const run = await createOwnerAgentRunRecord({
    conversationId: conversation.id,
    ownerId,
    agentId,
    hostId: hostId ?? null,
    provider,
    requestedModel,
    status: 'queued',
  });

  const message = await insertOwnerAgentMessageRecord({
    conversationId: conversation.id,
    ownerId,
    agentId,
    runId: run.id,
    senderType: 'owner',
    contentEncrypted: envelope.ciphertext,
    contentType: request.content_type,
    encryptionMeta: {
      iv: envelope.iv,
      tag: envelope.tag,
      algorithm: envelope.algorithm,
      dek_id: envelope.dekId,
    },
    status: 'pending',
  });

  return {
    messageId: message.id,
    conversationId: conversation.id,
    runId: run.id,
    ownerId,
    agentId,
    hostId: hostId ?? null,
    provider,
    requestedModel,
    runRequestFrame: buildRunRequestFrame({
      runId: run.id,
      conversationId: conversation.id,
      agentId,
      provider,
      ownerMessageId: message.id,
      content: request.content,
      contentType: request.content_type,
      instructions: target.agent.instructions,
      requestedModel,
      providerSessionId: conversation.providerSessionId,
      providerWorkDir: conversation.providerWorkDir,
    }),
  };
};

const dispatchPreparedOwnerAgentRun = async (
  prepared: PreparedOwnerAgentRun,
  beforeDispatch?: StartOwnerAgentRunOptions['beforeDispatch']
): Promise<'running' | 'pending'> => {
  let dispatchResult: ReturnType<typeof sendRunToHost> | 'queued' = 'queued';
  if (prepared.hostId && hasHostConnection(prepared.hostId)) {
    beforeDispatch?.({
      runId: prepared.runId,
      conversationId: prepared.conversationId,
      provider: prepared.provider,
      requestedModel: prepared.requestedModel,
    });
    dispatchResult = sendRunToHost(prepared.hostId, prepared.runRequestFrame);
  }

  if (dispatchResult === 'sent') {
    const startedAt = new Date().toISOString();
    void updateOwnerAgentRunStatus(prepared.runId, prepared.ownerId, {
      status: 'running',
      startedAt,
    }).catch((err) => {
      console.error('[OwnerAgentChat] updateOwnerAgentRunStatus:', (err as Error).message);
    });
    void updateOwnerAgentMessageStatus(prepared.messageId, prepared.ownerId, 'sent').catch((err) => {
      console.error('[OwnerAgentChat] updateOwnerAgentMessageStatus:', (err as Error).message);
    });
    return 'running';
  }

  await updateOwnerAgentRunStatus(prepared.runId, prepared.ownerId, { status: 'pending' });
  return 'pending';
};

const generateApiKeyHashPlaceholder = (): string => {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
};

const assertPendingCapacity = async (
  conversationId: string,
  ownerId: string,
  agentId: string
): Promise<void> => {
  const count = await countPendingOwnerAgentMessages({ conversationId, ownerId, agentId });
  if (count >= PENDING_MESSAGE_LIMIT) {
    throw new OwnerAgentChatServiceError(
      400,
      'pending_limit_reached',
      'Pending message limit reached for this agent'
    );
  }
};

const expireStalePendingMessages = async (ownerId: string): Promise<void> => {
  const cutoff = new Date(Date.now() - PENDING_RETENTION_MS).toISOString();
  await markExpiredPendingOwnerAgentMessages(ownerId, cutoff);
};

const failTimedOutRuns = async (ownerId: string): Promise<void> => {
  const cutoff = new Date(Date.now() - RUN_TIMEOUT_MS).toISOString();
  const runs = await listTimedOutOwnerAgentRuns(ownerId, cutoff);

  for (const run of runs) {
    const completedAt = new Date().toISOString();
    await updateOwnerAgentRunStatus(run.id, ownerId, {
      status: 'failed',
      completedAt,
      errorCode: 'timeout',
      errorMessage: 'Run timed out after 30 minutes without host events',
    });
    await insertOwnerAgentRunEventRecord({
      runId: run.id,
      ownerId,
      seq: 1,
      type: 'error',
      metadata: {
        error_code: 'timeout',
        error_message: 'Run timed out after 30 minutes without host events',
      },
    });
  }
};

const buildRunRequestFrame = (input: {
  runId: string;
  conversationId: string;
  agentId: string;
  provider: OwnerAgentProvider;
  ownerMessageId: string;
  content: string;
  contentType: 'text';
  instructions: string | null;
  requestedModel: string | null;
  providerSessionId: string | null;
  providerWorkDir: string | null;
}): OwnerAgentRunRequestFrame => ({
  type: 'owner_agent_run_request',
  id: `owner-agent-run-${input.runId}`,
  timestamp: new Date().toISOString(),
  payload: {
    run_id: input.runId,
    conversation_id: input.conversationId,
    agent_id: input.agentId,
    provider: input.provider,
    correlation_id: input.runId,
    owner_message_id: input.ownerMessageId,
    content: input.content,
    content_type: input.contentType,
    instructions: input.instructions,
    requested_model: input.requestedModel,
    provider_session_id: input.providerSessionId,
    provider_work_dir: input.providerWorkDir,
  },
});

const toSendMessageResponse = (
  messageId: string,
  conversationId: string,
  runId: string,
  status: OwnerAgentRunStatus
): OwnerAgentSendMessageResponse => ({
  message_id: messageId,
  conversation_id: conversationId,
  run_id: runId,
  status,
});

interface OwnerAgentResponseRuntime {
  backendProvider: OwnerAgentProvider;
  backendSource: OwnerAgentBackendSource;
  runtimeId: string | null;
  runtimeStatus: 'online' | 'offline' | 'updating' | null;
  runtimeVersion: string | null;
  runtimeModels: string[];
}

const mapOwnerAgentResponse = (
  agent: OwnerAgentRecord,
  runtime: OwnerAgentResponseRuntime
): OwnerAgentResponse => ({
  id: agent.id,
  name: agent.name,
  avatar_url: agent.avatarUrl,
  description: agent.description,
  instructions: agent.instructions,
  suggested_prompts: normalizeSuggestedPrompts(agent.suggestedPrompts),
  backend_provider: runtime.backendProvider,
  backend_source: runtime.backendSource,
  execution_mode: agent.executionMode,
  status: agent.status,
  runtime_id: runtime.runtimeId,
  runtime_status: runtime.runtimeStatus,
  runtime_version: runtime.runtimeVersion,
  runtime_models: runtime.runtimeModels,
  is_default: agent.isDefault,
  source: agent.source,
  last_active_at: agent.lastSeenAt,
  created_at: agent.createdAt,
});

const getRuntimeModels = (runtime: AgentRuntimeRecord | null): string[] => {
  const models = runtime?.capabilities.models;
  return Array.isArray(models)
    ? models.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    : [];
};

const resolveDefaultAgentProvider = (
  ownerId: string,
  agent: OwnerAgentRecord,
  runtime: AgentRuntimeRecord | null
): OwnerAgentProvider | null => {
  if (runtime && isOwnerAgentProvider(runtime.runtimeType)) {
    return runtime.runtimeType;
  }
  if (!agent.isDefault || agent.source !== 'system_default') {
    return null;
  }
  return getDefaultAgentRuntimeType(ownerId, agent.apiKeyHash);
};

const isOwnerAgentProvider = (value: string): value is OwnerAgentProvider =>
  OWNER_AGENT_PROVIDERS.includes(value as OwnerAgentProvider);

const normalizeSuggestedPrompts = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
};
