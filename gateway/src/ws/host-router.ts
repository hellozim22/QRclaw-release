import type { WebSocket } from 'ws';
import type {
  AckFrame,
  ErrorFrame,
  HostCapabilitiesUpdatedFrame,
  HostHeartbeatFrame,
  HostProviderCapability,
  HostRegisterFrame,
  OwnerAgentRunAcceptedFrame,
  OwnerAgentRunCompletedFrame,
  OwnerAgentRunEventFrame,
  OwnerAgentRunFailedFrame,
} from '../../../shared/contracts/ws/types.js';
import { encrypt } from '../crypto/envelope.js';
import { getOwnerAgentDEK } from '../crypto/owner-agent-dek.js';
import {
  getOwnerAgentRunRecord,
  insertOwnerAgentMessageRecord,
  insertOwnerAgentRunEventRecord,
  updateAgentHostHeartbeatRecord,
  updateAgentHostProvidersRecord,
  updateOwnerAgentConversationRuntime,
  updateOwnerAgentRunRuntime,
  upsertAgentHostRecord,
  upsertOwnerAgentConversationKey,
} from '../db/owner-agent-chat.js';
import type { OwnerAgentRunRecord } from '../db/owner-agent-chat.js';
import { syncAgentRuntimesFromHostProviders } from '../db/owner-runtimes.js';
import type { ConnectionInfo, WSFrame } from '../types/index.js';
import {
  clearActiveRun,
  getLastRunSeq,
  recordRunAccepted,
  recordRunSeq,
  registerHostConnection,
  touchHostConnection,
  updateHostCapabilities,
} from '../services/agent-host-registry.js';
import { sendFrame } from './send.js';
import { publishRunFrame } from './stream-hub.js';
import { notifyOwnerRunFrame } from './owner-run-notify.js';

interface HostRouterLimits {
  maxInFlightEvents: number;
}

const DEFAULT_LIMITS: HostRouterLimits = { maxInFlightEvents: 32 };
let limits = { ...DEFAULT_LIMITS };
let inFlightEvents = 0;

export const __setHostRouterLimitsForTest = (next: Partial<HostRouterLimits>): void => {
  limits = { ...DEFAULT_LIMITS, ...next };
  inFlightEvents = 0;
};

export const routeHostMessage = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo
): Promise<void> => {
  if (connection.role !== 'host') {
    sendError(ws, 'forbidden', 'Only Host connections can send Host frames', connection.connectionId);
    return;
  }

  switch (frame.type) {
    case 'host_register':
      await handleHostRegister(ws, frame as HostRegisterFrame, connection);
      return;
    case 'host_heartbeat':
      await handleHostHeartbeat(ws, frame as HostHeartbeatFrame, connection);
      return;
    case 'host_capabilities_updated':
      await handleHostCapabilitiesUpdated(ws, frame as HostCapabilitiesUpdatedFrame, connection);
      return;
    case 'owner_agent_run_accepted':
      await handleRunAccepted(ws, frame as OwnerAgentRunAcceptedFrame, connection);
      return;
    case 'owner_agent_run_event':
      await handleRunEvent(ws, frame as OwnerAgentRunEventFrame, connection);
      return;
    case 'owner_agent_run_completed':
      await handleRunCompleted(ws, frame as OwnerAgentRunCompletedFrame, connection);
      return;
    case 'owner_agent_run_failed':
      await handleRunFailed(ws, frame as OwnerAgentRunFailedFrame, connection);
      return;
    default:
      sendError(ws, 'forbidden', `Host cannot send '${frame.type}' frames`, connection.connectionId);
  }
};

const handleHostRegister = async (
  ws: WebSocket,
  frame: HostRegisterFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const payload = frame.payload;
  console.log('[Host] register frame received', {
    host_id: payload.host_id,
    host_type: payload.host_type,
    providers: payload.providers.map((p) => p.provider),
    owner_id: connection.ownerId,
    scope: connection.hostTokenScope,
  });
  if (!isHostTokenAllowed(connection, payload.host_id, payload.host_type, payload.providers)) {
    console.warn('[Host] register rejected by scope', {
      host_id: payload.host_id,
      scope: connection.hostTokenScope,
      providers: payload.providers.map((p) => p.provider),
    });
    ws.close(4003, 'host token scope does not allow this registration');
    return;
  }

  const lastSeenAt = new Date().toISOString();
  registerHostConnection({
    hostId: payload.host_id,
    ownerId: connection.ownerId ?? '',
    tokenId: connection.tokenId ?? '',
    connectionId: connection.connectionId,
    providers: payload.providers,
    ws,
  });
  try {
    await upsertAgentHostRecord({
      hostId: payload.host_id,
      ownerId: connection.ownerId ?? '',
      hostType: payload.host_type,
      displayName: payload.display_name,
      lastSeenAt,
    });
    await updateAgentHostProvidersRecord(payload.host_id, payload.providers);
    if (connection.ownerId) {
      try {
        await syncAgentRuntimesFromHostProviders(connection.ownerId);
      } catch (err) {
        console.warn('[Host] runtime sync on register failed:', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[Host] register DB write failed:', (err as Error).message);
    throw err;
  }

  for (const run of payload.in_flight_runs ?? []) {
    recordRunSeq(run.run_id, run.last_seq);
  }
  sendAck(ws, frame.id ?? payload.host_id, connection.connectionId);
};

const handleHostHeartbeat = async (
  ws: WebSocket,
  frame: HostHeartbeatFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const lastSeenAt = new Date().toISOString();
  touchHostConnection(frame.payload.host_id, frame.payload.active_run_ids ?? [], lastSeenAt);
  await updateAgentHostHeartbeatRecord(frame.payload.host_id, lastSeenAt);
  sendAck(ws, frame.id ?? frame.payload.host_id, connection.connectionId);
};

const handleHostCapabilitiesUpdated = async (
  ws: WebSocket,
  frame: HostCapabilitiesUpdatedFrame,
  connection: ConnectionInfo
): Promise<void> => {
  updateHostCapabilities(frame.payload.host_id, frame.payload.providers);
  await updateAgentHostProvidersRecord(frame.payload.host_id, frame.payload.providers);
  if (connection.ownerId) {
    try {
      await syncAgentRuntimesFromHostProviders(connection.ownerId);
    } catch (err) {
      console.warn('[Host] runtime sync on capabilities update failed:', (err as Error).message);
    }
  }
  sendAck(ws, frame.id ?? frame.payload.host_id, connection.connectionId);
};

const handleRunAccepted = async (
  ws: WebSocket,
  frame: OwnerAgentRunAcceptedFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const run = await loadAuthorizedRun(ws, frame.payload.run_id, connection);
  if (!run) return;

  recordRunAccepted(frame.payload.host_id, frame.payload.run_id, {
    conversationId: frame.payload.conversation_id,
    agentId: frame.payload.agent_id,
    provider: frame.payload.provider,
    correlationId: frame.payload.correlation_id,
  });
  await updateOwnerAgentRunRuntime(run.id, run.ownerId, {
    status: 'accepted',
    hostId: frame.payload.host_id,
    startedAt: frame.payload.accepted_at ?? new Date().toISOString(),
  });
  publishRunFrame(run.id, { kind: 'accepted', frame });
  sendAck(ws, frame.id ?? frame.payload.run_id, connection.connectionId);
};

const handleRunEvent = async (
  ws: WebSocket,
  frame: OwnerAgentRunEventFrame,
  connection: ConnectionInfo
): Promise<void> => {
  if (inFlightEvents >= limits.maxInFlightEvents) {
    await failRunFromGateway(ws, frame.payload, connection, 'backpressure', 'Gateway Host event backpressure');
    return;
  }
  if (!isNextSeq(frame.payload.run_id, frame.payload.seq)) {
    await failRunFromGateway(ws, frame.payload, connection, 'seq_gap', 'Host run event sequence gap');
    return;
  }

  inFlightEvents += 1;
  try {
    const run = await loadAuthorizedRun(ws, frame.payload.run_id, connection);
    if (!run) return;

    recordRunSeq(run.id, frame.payload.seq);
    publishRunFrame(run.id, { kind: 'event', frame });
    notifyOwnerRunFrame(run.ownerId, {
      type: 'owner_agent_run_event',
      id: frame.id,
      timestamp: frame.timestamp ?? new Date().toISOString(),
      payload: frame.payload,
    });
    sendAck(ws, frame.id ?? frame.payload.run_id, connection.connectionId);

    void persistRunEvent(run, frame).catch((err) => {
      console.error('[HostRouter] persistRunEvent:', (err as Error).message);
    });
  } finally {
    inFlightEvents -= 1;
  }
};

const persistRunEvent = async (
  run: OwnerAgentRunRecord,
  frame: OwnerAgentRunEventFrame,
): Promise<void> => {
  const encrypted = await encryptOptionalRunContent(run.conversationId, frame.payload.content);
  await insertOwnerAgentRunEventRecord({
    runId: run.id,
    ownerId: run.ownerId,
    seq: frame.payload.seq,
    type: frame.payload.event_type,
    contentEncrypted: encrypted.contentEncrypted,
    encryptionMeta: encrypted.encryptionMeta,
    metadata: frame.payload.metadata,
  });
  await updateOwnerAgentRunRuntime(run.id, run.ownerId, { status: 'running' });
};

const handleRunCompleted = async (
  ws: WebSocket,
  frame: OwnerAgentRunCompletedFrame,
  connection: ConnectionInfo
): Promise<void> => {
  if (!isNextSeq(frame.payload.run_id, frame.payload.seq)) {
    await failRunFromGateway(ws, frame.payload, connection, 'seq_gap', 'Host run completion sequence gap');
    return;
  }

  const run = await loadAuthorizedRun(ws, frame.payload.run_id, connection);
  if (!run) return;

  recordRunSeq(run.id, frame.payload.seq);
  clearActiveRun(run.id);
  publishRunFrame(run.id, { kind: 'completed', frame });
  notifyOwnerRunFrame(run.ownerId, {
    type: 'owner_agent_run_completed',
    id: frame.id,
    timestamp: frame.timestamp ?? new Date().toISOString(),
    payload: frame.payload,
  });
  sendAck(ws, frame.id ?? frame.payload.run_id, connection.connectionId);

  void persistRunCompletion(run, frame).catch((err) => {
    console.error('[HostRouter] persistRunCompletion:', (err as Error).message);
  });
};

const persistRunCompletion = async (
  run: OwnerAgentRunRecord,
  frame: OwnerAgentRunCompletedFrame,
): Promise<void> => {
  if (frame.payload.final_message) {
    const encrypted = await encryptOptionalRunContent(run.conversationId, frame.payload.final_message);
    await insertOwnerAgentRunEventRecord({
      runId: run.id,
      ownerId: run.ownerId,
      seq: frame.payload.seq,
      type: 'text',
      contentEncrypted: encrypted.contentEncrypted,
      encryptionMeta: encrypted.encryptionMeta,
      metadata: { final: true },
    });
    if (encrypted.contentEncrypted && encrypted.encryptionMeta) {
      await insertOwnerAgentMessageRecord({
        conversationId: run.conversationId,
        ownerId: run.ownerId,
        agentId: run.agentId,
        runId: run.id,
        senderType: 'agent',
        contentEncrypted: encrypted.contentEncrypted,
        contentType: 'text',
        encryptionMeta: encrypted.encryptionMeta,
        status: 'sent',
      });
    }
  }

  await updateOwnerAgentRunRuntime(run.id, run.ownerId, {
    status: 'completed',
    actualModel: frame.payload.actual_model ?? null,
    providerSessionId: frame.payload.provider_session_id ?? null,
    providerWorkDir: frame.payload.provider_work_dir ?? null,
    completedAt: new Date().toISOString(),
  });
  await updateOwnerAgentConversationRuntime(run.conversationId, {
    providerSessionId: frame.payload.provider_session_id,
    providerWorkDir: frame.payload.provider_work_dir,
  });
};

const handleRunFailed = async (
  ws: WebSocket,
  frame: OwnerAgentRunFailedFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const run = await loadAuthorizedRun(ws, frame.payload.run_id, connection);
  if (!run) return;

  recordRunSeq(run.id, frame.payload.seq);
  clearActiveRun(run.id);
  publishRunFrame(run.id, { kind: 'failed', frame });
  notifyOwnerRunFrame(run.ownerId, {
    type: 'owner_agent_run_failed',
    id: frame.id,
    timestamp: frame.timestamp ?? new Date().toISOString(),
    payload: frame.payload,
  });
  sendAck(ws, frame.id ?? frame.payload.run_id, connection.connectionId);

  void persistRunFailure(run, frame).catch((err) => {
    console.error('[HostRouter] persistRunFailure:', (err as Error).message);
  });
};

const persistRunFailure = async (
  run: OwnerAgentRunRecord,
  frame: OwnerAgentRunFailedFrame,
): Promise<void> => {
  const encrypted = await encryptOptionalRunContent(run.conversationId, frame.payload.error_message);
  await insertOwnerAgentRunEventRecord({
    runId: run.id,
    ownerId: run.ownerId,
    seq: frame.payload.seq,
    type: 'error',
    contentEncrypted: encrypted.contentEncrypted,
    encryptionMeta: encrypted.encryptionMeta,
    metadata: {
      error_code: frame.payload.error_code,
      retryable: frame.payload.retryable ?? false,
    },
  });
  await updateOwnerAgentRunRuntime(run.id, run.ownerId, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    errorCode: frame.payload.error_code,
    errorMessage: frame.payload.error_message,
  });
};

const loadAuthorizedRun = async (
  ws: WebSocket,
  runId: string,
  connection: ConnectionInfo
): Promise<OwnerAgentRunRecord | null> => {
  const run = await getOwnerAgentRunRecord(runId);
  if (!run) {
    sendError(ws, 'forbidden', 'Run not found for Host event', connection.connectionId);
    return null;
  }
  if (connection.ownerId && run.ownerId !== connection.ownerId) {
    sendError(ws, 'forbidden', 'Host cannot update another owner run', connection.connectionId);
    return null;
  }
  return run;
};

const encryptOptionalRunContent = async (
  conversationId: string,
  content: string | undefined
): Promise<{ contentEncrypted: string | null; encryptionMeta: Record<string, unknown> | null }> => {
  if (!content) {
    return { contentEncrypted: null, encryptionMeta: null };
  }

  const { rawDek, dekId, info } = await getOwnerAgentDEK(conversationId);
  const keyId = await upsertOwnerAgentConversationKey(conversationId, info.encryptedDek);
  const envelope = await encrypt(content, dekId, rawDek);
  return {
    contentEncrypted: envelope.ciphertext,
    encryptionMeta: {
      iv: envelope.iv,
      tag: envelope.tag,
      algorithm: envelope.algorithm,
      dek_id: envelope.dekId,
      key_id: keyId,
    },
  };
};

const failRunFromGateway = async (
  ws: WebSocket,
  payload: {
    run_id: string;
    conversation_id: string;
    agent_id: string;
    provider: OwnerAgentRunFailedFrame['payload']['provider'];
    correlation_id: string;
    seq: number;
  },
  connection: ConnectionInfo,
  errorCode: string,
  errorMessage: string
): Promise<void> => {
  const run = await loadAuthorizedRun(ws, payload.run_id, connection);
  if (run) {
    await updateOwnerAgentRunRuntime(run.id, run.ownerId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorCode,
      errorMessage,
    });
  }
  clearActiveRun(payload.run_id);

  const failedFrame: OwnerAgentRunFailedFrame = {
    type: 'owner_agent_run_failed',
    timestamp: new Date().toISOString(),
    payload: {
      run_id: payload.run_id,
      conversation_id: payload.conversation_id,
      agent_id: payload.agent_id,
      provider: payload.provider,
      correlation_id: payload.correlation_id,
      seq: payload.seq,
      error_code: errorCode,
      error_message: errorMessage,
      retryable: errorCode === 'backpressure',
    },
  };
  sendFrame(ws, failedFrame, { connectionId: connection.connectionId });
};

const isNextSeq = (runId: string, seq: number): boolean => seq === getLastRunSeq(runId) + 1;

const isHostTokenAllowed = (
  connection: ConnectionInfo,
  hostId: string,
  hostType: 'local' | 'cloud',
  providers: HostProviderCapability[]
): boolean => {
  if (connection.hostId && connection.hostId !== hostId) {
    return false;
  }
  const scope = connection.hostTokenScope ?? {};
  if (scope.owner_id && scope.owner_id !== connection.ownerId) {
    return false;
  }
  if (hostType === 'local' && scope.can_register_local !== true) {
    return false;
  }
  const allowedProviders = Array.isArray(scope.allowed_provider_set)
    ? scope.allowed_provider_set
    : [];
  return providers.every((provider) => allowedProviders.includes(provider.provider));
};

const sendAck = (ws: WebSocket, messageId: string, connectionId?: string): void => {
  const frame: AckFrame = {
    type: 'ack',
    timestamp: new Date().toISOString(),
    payload: {
      message_id: messageId,
      status: 'accepted',
    },
  };
  sendFrame(ws, frame, { connectionId });
};

const sendError = (
  ws: WebSocket,
  code: ErrorFrame['payload']['code'],
  message: string,
  connectionId?: string
): void => {
  const frame: ErrorFrame = {
    type: 'error',
    timestamp: new Date().toISOString(),
    payload: { code, message },
  };
  sendFrame(ws, frame, { connectionId });
};
