/**
 * WebSocket message router — full routing pipeline
 * Per §5.6: Rate limit → Dedup → Route lookup → Persist → Forward → ACK
 *
 * Iron Rule C1: Gateway only relays + encrypts, NEVER processes AI content.
 */
import type { WebSocket } from 'ws';
import type { z } from 'zod';
import type { WSFrame, ConnectionInfo, SenderType } from '../types/index.js';
import type {
  MessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  VisitorMessageBroadcastFrame,
  AgentTypingFrame,
  AckFrame as OutboundAckFrame,
  PongFrame as OutboundPongFrame,
  AckStatus as OutboundAckStatus,
  ErrorFrame as OutboundErrorFrame,
} from '../../../shared/contracts/ws/types.js';
import { errorOutboundSchema } from '../../../shared/contracts/ws/outbound.js';
import { WS_CLOSE_CODES } from '../types/index.js';
import { checkRateLimit } from '../redis/rate-limiter.js';
import { isDuplicate } from '../redis/dedup.js';
import { isRedisConnected } from '../redis/client.js';
import { getAgentForQrCode, getVisitorConnection, getQrCodesForAgent } from './registry.js';
import { fanoutFrame } from './fanout.js';
// Local alias so shared TS stays wide (`ErrorFrame.payload.code: string` per
// types.ts:212 design note) while this helper's parameter tightens to the
// closed enum the outbound Zod schema enforces at runtime. Importing the
// schema — already used by sendFrame — keeps the single source of truth and
// avoids duplicating the literal list in gateway code.
type OutboundErrorCode = z.infer<typeof errorOutboundSchema>['payload']['code'];
import { sendFrame } from './send.js';
import { encrypt } from '../crypto/envelope.js';
import { getDEK } from '../crypto/key-manager.js';
import { persistEncryptedMessage, resolveConversationId } from '../db/persist.js';
import { isAgentOnline } from '../redis/presence.js';
import { enqueueOfflineMessage } from '../redis/offline-queue.js';
import type { QueuedMessage } from '../redis/offline-queue.js';
import { injectSecurityEnvelope } from './security-envelope.js';
import { getSystemPrompt } from '../db/system-prompt.js';
import { startSpan, markStep, endSpan, isEnabled } from '../monitoring/perf.js';
import type { PerfSpan } from '../monitoring/perf.js';
import { routeHostMessage } from './host-router.js';

// In-memory stream buffer: messageId → accumulated chunks
const STREAM_BUFFER_MAX_SIZE = 5000;
const STREAM_BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes max per stream

const streamBuffers = new Map<
  string,
  { chunks: string[]; conversationId: string; createdAt: number }
>();

/**
 * Evict stale stream buffers to prevent memory leaks from abandoned streams.
 */
const evictStaleStreamBuffers = (): void => {
  const now = Date.now();
  for (const [key, entry] of streamBuffers) {
    if (now - entry.createdAt > STREAM_BUFFER_TTL_MS) {
      streamBuffers.delete(key);
    }
  }
};

/**
 * Route an incoming WebSocket message through the full pipeline.
 */
export const routeMessage = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const { type } = frame;
  const { role } = connection;

  if (role === 'host') {
    await routeHostMessage(ws, frame, connection);
    return;
  }

  // ── Role-based authorization ──────────────────────────────────────
  // Visitors may only send: ping, visitor_message, read_receipt
  // Agents may only send:   ping, agent_message, stream_chunk, stream_end, read_receipt
  const VISITOR_ALLOWED: ReadonlySet<string> = new Set(['ping', 'visitor_message', 'read_receipt']);
  const AGENT_ALLOWED: ReadonlySet<string> = new Set([
    'ping',
    'agent_message',
    'stream_chunk',
    'stream_end',
    'read_receipt',
  ]);
  const OWNER_ALLOWED: ReadonlySet<string> = new Set(['ping', 'read_receipt']);

  const allowedTypes =
    role === 'agent' ? AGENT_ALLOWED : role === 'owner' ? OWNER_ALLOWED : VISITOR_ALLOWED;
  if (!allowedTypes.has(type)) {
    sendError(
      ws,
      'forbidden',
      `Role '${role}' cannot send '${type}' frames`,
      connection.connectionId
    );
    return;
  }

  const span = isEnabled() ? startSpan(frame.id || 'unknown', `ws_${type}`) : null;

  try {
    switch (type) {
      case 'ping':
        handlePing(ws, connection.connectionId);
        return;

      case 'visitor_message':
        await handleVisitorMessage(ws, frame, connection, span);
        return;

      case 'agent_message':
        await handleAgentMessage(ws, frame, connection, span);
        return;

      case 'stream_chunk':
        await handleStreamChunk(ws, frame, connection, span);
        return;

      case 'stream_end':
        await handleStreamEnd(ws, frame, connection, span);
        return;

      case 'read_receipt':
        await handleReadReceipt(ws, frame, connection);
        return;

      default:
        sendError(
          ws,
          'unknown_message_type',
          `Unknown message type: ${type}`,
          connection.connectionId
        );
    }
  } finally {
    if (span) endSpan(span);
  }
};

// ─── Pipeline Steps ──────────────────────────────────────────────────

/**
 * Visitor → Agent routing pipeline.
 * ① Rate limit → ② Dedup → ③ Find agent → ④ Encrypt & persist → ⑤ Forward → ⑥ ACK
 */
const handleVisitorMessage = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo,
  span: PerfSpan | null
): Promise<void> => {
  const messageId = frame.id || 'unknown';

  // ① Rate limit
  const rateLimitOk = await checkRateLimitStep(ws, connection);
  markStep(span, 'rate_limit');
  if (!rateLimitOk) return;

  // ② Dedup
  if (isRedisConnected() && frame.id) {
    const dup = await isDuplicate(frame.id);
    markStep(span, 'dedup');
    if (dup) {
      sendAck(ws, messageId, 'duplicate', connection.connectionId);
      return;
    }
  }

  // ③ Route lookup — find agent connections for this QR code
  const qrCodeId = connection.qrCodeId;
  if (!qrCodeId) {
    sendAck(ws, messageId, 'rejected:invalid_session', connection.connectionId);
    return;
  }

  // Use sessionToken as conversation_id for 1:1 visitor↔agent routing (not qrCodeId which broadcasts)
  const visitorSessionToken = connection.sessionToken || connection.connectionId;

  const agentEntries = getAgentForQrCode(qrCodeId);
  markStep(span, 'route_lookup');
  if (agentEntries.length === 0) {
    // No live WebSocket connections — check if agent is online (might be on another node)
    // If truly offline, enqueue the message for delivery on reconnect
    const payload = frame.payload as Record<string, unknown>;
    const content = payload.content as string;
    const contentType = (payload.content_type as string) || 'text';

    const queuedMsg: QueuedMessage = {
      id: messageId,
      timestamp: frame.timestamp,
      senderType: 'visitor',
      conversationId: visitorSessionToken,
      content,
      contentType,
      queuedAt: new Date().toISOString(),
    };

    // Try to find agentId for this qrCode (from connection info or fallback to qrCodeId)
    const agentId = connection.agentId || qrCodeId;
    const enqueued = await enqueueOfflineMessage(agentId, queuedMsg);

    if (enqueued) {
      sendAck(ws, messageId, 'accepted', connection.connectionId);
      console.log(`[Router] Agent offline, message ${messageId} queued for ${agentId}`);
    } else {
      sendAck(ws, messageId, 'rejected:agent_unreachable', connection.connectionId);
    }
    return;
  }

  // ④ Send agent_typing immediately (before slow encrypt/persist)
  const agentTypingFrame: AgentTypingFrame = {
    type: 'agent_typing',
    id: messageId,
    timestamp: new Date().toISOString(),
    payload: { conversation_id: visitorSessionToken },
  };
  sendFrame(ws, agentTypingFrame, { connectionId: connection.connectionId });
  sendAck(ws, messageId, 'accepted', connection.connectionId);
  markStep(span, 'agent_typing');

  // ⑤ Forward to agent(s) — include system_prompt for AI context
  const systemPrompt = await getSystemPrompt(qrCodeId);
  // The `visitor_message` broadcast is already fanoutFrame-pivoted (T3a) and
  // every socket emit passes through `sendFrame`, which re-validates against
  // the outbound Zod schema. The narrow cast below bridges `frame.payload`'s
  // `Record<string, unknown>` (already validated by the inbound schema) to
  // the outbound literal union for `content_type`.
  const broadcastPayloadRaw = frame.payload as Record<string, unknown>;
  const visitorBroadcast: VisitorMessageBroadcastFrame = {
    type: 'visitor_message',
    id: messageId,
    timestamp: new Date().toISOString(),
    payload: {
      content: broadcastPayloadRaw.content as string,
      content_type: broadcastPayloadRaw.content_type as 'text' | 'image_url' | 'file_url',
      sender_type: 'visitor',
      conversation_id: visitorSessionToken,
      qr_code_id: qrCodeId,
      ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
    },
  };
  const fanoutResult = fanoutFrame({ kind: 'direct-to-agents', qrCodeId }, visitorBroadcast);

  if (fanoutResult.delivered === 0) {
    console.warn(`[Router] No agent reachable for message ${messageId}, attempting offline queue`);
    const queuedMsg: QueuedMessage = {
      id: messageId,
      timestamp: frame.timestamp,
      senderType: 'visitor',
      conversationId: visitorSessionToken,
      content: (frame.payload as Record<string, unknown>).content as string,
      contentType: ((frame.payload as Record<string, unknown>).content_type as string) || 'text',
      queuedAt: new Date().toISOString(),
    };
    const agentId = connection.agentId || qrCodeId;
    const enqueued = await enqueueOfflineMessage(agentId, queuedMsg);
    if (!enqueued) {
      sendAck(ws, messageId, 'rejected:agent_unreachable', connection.connectionId);
      return;
    }
  }
  markStep(span, 'forward');

  // ⑥ Encrypt & persist (non-blocking — after ack + forward)
  try {
    await persistMessage(messageId, frame, connection);
  } catch (err) {
    console.error(`[Router] Persist error for ${messageId}:`, (err as Error).message);
  }
  markStep(span, 'encrypt');
};

/**
 * Agent → Visitor routing pipeline.
 * conversation_id = visitor's sessionToken (1:1 routing, not broadcast)
 */
const handleAgentMessage = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo,
  span: PerfSpan | null
): Promise<void> => {
  const messageId = frame.id || 'unknown';
  const payload = frame.payload as Record<string, unknown>;
  const conversationId = payload.conversation_id as string;

  // ① Rate limit
  const rateLimitOk = await checkRateLimitStep(ws, connection);
  markStep(span, 'rate_limit');
  if (!rateLimitOk) return;

  // ② Dedup
  if (isRedisConnected() && frame.id) {
    const dup = await isDuplicate(frame.id);
    markStep(span, 'dedup');
    if (dup) {
      sendAck(ws, messageId, 'duplicate', connection.connectionId);
      return;
    }
  }

  // ③ Route lookup — find the specific visitor by sessionToken (conversation_id)
  const visitorEntry = getVisitorConnection(conversationId);
  markStep(span, 'route_lookup');

  if (!visitorEntry) {
    // Agent message accepted even if visitor offline — will be persisted
    console.log(`[Router] No visitor online for conversation ${conversationId}, persisting only`);
  }

  // ④ Persist — enrich connection with visitor's qrCodeId for conversation resolution
  const enrichedConnection: ConnectionInfo = visitorEntry
    ? {
        ...connection,
        qrCodeId: visitorEntry.info.qrCodeId,
        sessionToken: visitorEntry.info.sessionToken,
      }
    : connection;

  // ④ Persist
  try {
    await persistMessage(messageId, frame, enrichedConnection);
  } catch (err) {
    console.error(`[Router] Persist error for ${messageId}:`, (err as Error).message);
  }
  markStep(span, 'encrypt');

  // ⑤ Forward to specific visitor if online — inject Security Envelope per §10.2-10.6
  if (visitorEntry) {
    // T3d: `injectSecurityEnvelope` is generic — passing an explicit
    // `MessageFrame['payload']` type argument pins the object-literal
    // contents to the outbound contract (content_type + sender_type
    // literal unions) without a post-hoc `as unknown as MessageFrame`
    // cast at the frame level.
    const envelopedPayload = injectSecurityEnvelope<MessageFrame['payload']>({
      content: payload.content as string,
      content_type: payload.content_type as MessageFrame['payload']['content_type'],
      sender_type: 'agent',
      conversation_id: conversationId,
    });

    const messageFrame: MessageFrame = {
      type: 'message',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: envelopedPayload,
    };
    fanoutFrame({ kind: 'direct-to-visitor', sessionToken: conversationId }, messageFrame);
  }

  // ⑥ ACK
  markStep(span, 'forward');
  sendAck(ws, messageId, 'accepted', connection.connectionId);
};

/**
 * Handle stream_chunk: forward to visitor in real-time, buffer for persistence.
 */
const handleStreamChunk = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo,
  span: PerfSpan | null
): Promise<void> => {
  const payload = frame.payload as Record<string, unknown>;
  const messageId = frame.id || 'unknown';
  const conversationId = payload.conversation_id as string;
  const delta = payload.delta as string;

  // Rate limit (streaming counts toward message limit)
  const rateLimitOk = await checkRateLimitStep(ws, connection);
  markStep(span, 'rate_limit');
  if (!rateLimitOk) return;

  // Evict stale buffers before adding new ones
  if (streamBuffers.size > STREAM_BUFFER_MAX_SIZE) {
    evictStaleStreamBuffers();
  }

  // Buffer chunk for later persistence
  const existing = streamBuffers.get(messageId) || {
    chunks: [],
    conversationId,
    createdAt: Date.now(),
  };
  existing.chunks.push(delta);
  streamBuffers.set(messageId, existing);

  // Forward chunk to specific visitor (1:1 routing by sessionToken)
  markStep(span, 'route_lookup');
  const chunkFrame: StreamChunkFrame = {
    type: 'stream_chunk',
    id: messageId,
    timestamp: new Date().toISOString(),
    payload: {
      conversation_id: conversationId,
      delta,
      // Inbound `frame.payload` is `Record<string, unknown>`; these casts
      // pin the optional fields to the `StreamChunkFrame` contract so the
      // outbound Zod schema owns runtime validation. The shape itself is
      // unchanged vs. pre-T3a.
      sequence: payload.sequence as number | undefined,
      is_final: payload.is_final as boolean | undefined,
    },
  };
  fanoutFrame({ kind: 'direct-to-visitor', sessionToken: conversationId }, chunkFrame);
  markStep(span, 'forward');
};

/** Resolve qrCodeId from agent routing map when visitor is disconnected. */
const resolveFallbackQrCodeId = (
  connection: ConnectionInfo,
  conversationId: string,
  preferredQrCodeId?: string
): string => {
  const agentQrCodes = connection.agentId ? getQrCodesForAgent(connection.agentId) : [];

  // If caller knows which qrCodeId should be used (e.g. from stream context), prefer it
  if (preferredQrCodeId && agentQrCodes.includes(preferredQrCodeId)) {
    return preferredQrCodeId;
  }

  // If agent only serves one QR code, it's unambiguous
  if (agentQrCodes.length === 1) {
    return agentQrCodes[0];
  }

  // Multi-QR ambiguity: cannot safely pick — log warning and return empty
  if (agentQrCodes.length > 1) {
    console.warn(
      `[Router] resolveFallbackQrCodeId: agent ${connection.agentId} serves ${agentQrCodes.length} QR codes, cannot resolve unambiguously`
    );
    return '';
  }

  return connection.qrCodeId || '';
};

/** Forward stream_end frame to visitor (extracted for reuse). */
const forwardStreamEndToVisitor = (
  visitorEntry: ReturnType<typeof getVisitorConnection>,
  _ws: WebSocket,
  frame: WSFrame,
  buffer: { chunks: string[] } | undefined,
  fullContent: string,
  conversationId: string,
  _span: PerfSpan | null
): void => {
  if (visitorEntry) {
    const payload = frame.payload as Record<string, unknown>;
    // `frame.id` is `string | undefined` on the inbound `WSFrame` interface
    // but `StreamEndFrame.id` is a required string. Matches the defaulting
    // pattern used elsewhere in this router (`frame.id || 'unknown'`).
    const streamEndId = frame.id || 'unknown';
    const totalChunks =
      (payload.total_chunks as number | undefined) || (buffer?.chunks.length ?? 0);
    const endFrame: StreamEndFrame = {
      type: 'stream_end',
      id: streamEndId,
      timestamp: new Date().toISOString(),
      payload: {
        conversation_id: conversationId,
        total_chunks: totalChunks,
        total_length: fullContent.length,
      },
    };
    fanoutFrame({ kind: 'direct-to-visitor', sessionToken: conversationId }, endFrame);
  }
};

/**
 * Handle stream_end: finalize stream, persist full message, notify visitor.
 */
const handleStreamEnd = async (
  ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo,
  span: PerfSpan | null
): Promise<void> => {
  const payload = frame.payload as Record<string, unknown>;
  const messageId = frame.id || 'unknown';
  const conversationId = payload.conversation_id as string;

  // Assemble full content from buffered chunks
  const buffer = streamBuffers.get(messageId);
  const fullContent = buffer ? buffer.chunks.join('') : '';
  streamBuffers.delete(messageId);

  // Persist the assembled message
  const assembledFrame: WSFrame = {
    type: 'agent_message',
    id: messageId,
    timestamp: new Date().toISOString(),
    payload: {
      content: fullContent,
      content_type: 'markdown',
      conversation_id: conversationId,
      is_final: true,
    },
  };

  // Resolve connection with qrCodeId fallback for persist
  const visitorEntry = getVisitorConnection(conversationId);
  let enrichedConnection: ConnectionInfo;
  if (visitorEntry) {
    enrichedConnection = {
      ...connection,
      qrCodeId: visitorEntry.info.qrCodeId,
      sessionToken: visitorEntry.info.sessionToken,
    };
  } else {
    const fallbackQrCodeId = resolveFallbackQrCodeId(connection, conversationId);
    if (!fallbackQrCodeId) {
      console.error(
        `[Router] Stream persist skipped: cannot resolve qrCodeId for conversation ${conversationId}`
      );
      // Still forward stream_end to visitor if possible
      forwardStreamEndToVisitor(visitorEntry, ws, frame, buffer, fullContent, conversationId, span);
      return;
    }
    enrichedConnection = { ...connection, qrCodeId: fallbackQrCodeId };
  }

  // Persist the assembled message
  try {
    await persistMessage(messageId, assembledFrame, enrichedConnection);
  } catch (err) {
    console.error(`[Router] Stream persist error for ${messageId}:`, (err as Error).message);
  }
  markStep(span, 'encrypt');

  // Forward stream_end to specific visitor — inject Security Envelope on final message
  if (visitorEntry) {
    const totalChunks =
      (payload.total_chunks as number | undefined) || (buffer?.chunks.length ?? 0);
    // T3d: generic `injectSecurityEnvelope` preserves the caller's payload
    // shape, so the explicit `StreamEndFrame['payload']` type argument
    // yields a return type assignable to the frame contract with no cast.
    const endPayload = injectSecurityEnvelope<StreamEndFrame['payload']>({
      conversation_id: conversationId,
      total_chunks: totalChunks,
      total_length: fullContent.length,
    });
    const endFrame: StreamEndFrame = {
      type: 'stream_end',
      id: messageId,
      timestamp: new Date().toISOString(),
      payload: endPayload,
    };
    fanoutFrame({ kind: 'direct-to-visitor', sessionToken: conversationId }, endFrame);
  }

  // ACK to agent
  markStep(span, 'forward');
  sendAck(ws, messageId, 'accepted', connection.connectionId);
};

/**
 * Handle read_receipt: forward to the other side.
 */
const handleReadReceipt = async (
  _ws: WebSocket,
  frame: WSFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const payload = frame.payload as Record<string, unknown>;
  const messageIds = payload.message_ids as string[];

  if (!messageIds || messageIds.length === 0) return;

  // Forward receipt to relevant connections
  // For now, log; full implementation needs conversation→connection mapping
  console.log(
    `[Router] read_receipt from ${connection.connectionId}: ${messageIds.length} messages`
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────

const checkRateLimitStep = async (ws: WebSocket, connection: ConnectionInfo): Promise<boolean> => {
  try {
    const role: SenderType = connection.role === 'visitor' ? 'visitor' : 'agent';
    const result = await checkRateLimit(connection.connectionId, role);
    if (!result.allowed) {
      sendError(ws, 'rate_limited', 'Message rate limit exceeded', connection.connectionId);
      return false;
    }
    return true;
  } catch {
    // Rate limiter failure should not block messages
    return true;
  }
};

/**
 * Persist an encrypted message to Supabase (best-effort, non-blocking).
 * Pipeline: encrypt content → upsert encryption_key → insert message record.
 */
const persistMessage = async (
  messageId: string,
  frame: WSFrame,
  connection: ConnectionInfo
): Promise<void> => {
  const payload = frame.payload as Record<string, unknown>;
  const content = payload.content as string;
  const qrCodeId = connection.qrCodeId || '';

  if (!content) return;
  if (!qrCodeId) {
    console.error(`[Router] Persist skipped for ${messageId}: no qrCodeId on connection`);
    return;
  }

  const role: 'visitor' | 'agent' = frame.type === 'visitor_message' ? 'visitor' : 'agent';

  try {
    // Bug fix (Wave 2 I2): DEK cache must key on the real conversation UUID,
    // not on qrCodeId. `encryption_keys.conversation_id` is per-conversation,
    // and multiple visitors sharing one QR spawn distinct `conversations`
    // rows. The prior implementation cached DEK by qrCodeId, so the second
    // visitor's persist path hit `getDEK(qrCodeId)`, received a cached entry
    // with `encryptedDek: ''` (line 131 of key-manager.ts), and then failed
    // in `upsertEncryptionKey` with "No encrypted DEK available for
    // conversation <uuid>" — every subsequent conversation under the same
    // QR silently dropped to offline persistence-failure.
    //
    // Resolving the DB conversation UUID before calling `getDEK` keeps cache
    // semantics aligned with the storage schema: each conversation gets its
    // own DEK and its own `encryption_keys` row, as intended by §10.3.
    const dbConversationId = await resolveConversationId(qrCodeId, connection.sessionToken);
    if (!dbConversationId) {
      console.error(
        `[Router] Persist failed for ${messageId}: could not resolve conversation for qrCode=${qrCodeId}`
      );
      return;
    }

    const { rawDek, dekId, info } = await getDEK(dbConversationId);
    const envelope = await encrypt(content, dekId, rawDek);

    await persistEncryptedMessage({
      messageId,
      conversationId: dbConversationId,
      qrCodeId,
      sessionToken: connection.sessionToken,
      envelope,
      dekInfo: info,
      role,
      sentAt: frame.timestamp || new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Router] Persist failed for ${messageId}:`, (err as Error).message);
  }
};

// T3b: both helpers delegate to `sendFrame()` so ack + pong emit sites get
// Zod validation, backpressure attribution, and counter bookkeeping for
// free. Public signatures stay identical (plus an optional connectionId
// that callers already hold via `ConnectionInfo.connectionId`), so every
// existing call site migrates with zero touch.
const handlePing = (ws: WebSocket, connectionId?: string): void => {
  const frame: OutboundPongFrame = {
    type: 'pong',
    timestamp: new Date().toISOString(),
  };
  sendFrame(ws, frame, { connectionId });
};

// `status` is narrowed to the shared `AckStatus` union (ACK_STATUSES) —
// the single source of truth mirrored by the outbound Zod schema. Every
// literal the router passes today ('accepted', 'duplicate',
// 'rejected:invalid_session', 'rejected:agent_unreachable') is a member,
// so tightening here surfaces drift at compile time instead of shipping
// an invalid frame that sendFrame would reject at runtime.
const sendAck = (
  ws: WebSocket,
  messageId: string,
  status: OutboundAckStatus,
  connectionId?: string
): void => {
  const frame: OutboundAckFrame = {
    type: 'ack',
    timestamp: new Date().toISOString(),
    payload: {
      message_id: messageId,
      status,
    },
  };
  sendFrame(ws, frame, { connectionId });
};

// T3c: route error emits through `sendFrame()` so the outbound Zod schema
// (errorOutboundSchema) validates every frame at runtime and the counter /
// backpressure bookkeeping matches ack/pong. `code` narrows from the historic
// `string` to the closed `OutboundErrorCode` union — all three current
// callers pass literals already in the enum, so this is a zero-behaviour
// tightening that surfaces drift at compile time. Optional `connectionId`
// mirrors the T3b `sendAck` signature change.
const sendError = (
  ws: WebSocket,
  code: OutboundErrorCode,
  message: string,
  connectionId?: string
): void => {
  const frame: OutboundErrorFrame = {
    type: 'error',
    timestamp: new Date().toISOString(),
    payload: { code, message },
  };
  sendFrame(ws, frame, { connectionId });
};
