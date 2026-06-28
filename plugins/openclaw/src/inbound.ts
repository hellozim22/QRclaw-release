import type { ServerFrame, MessageFrame } from '../../../shared/contracts/ws/types.js';

const LIVE_DEDUP_CAPACITY = 1000;
const liveSeenByAccount = new Map<string, Set<string>>();

function isLiveDuplicate(accountLabel: string, messageId: string | undefined): boolean {
  if (!messageId) return false;
  let seen = liveSeenByAccount.get(accountLabel);
  if (!seen) {
    seen = new Set();
    liveSeenByAccount.set(accountLabel, seen);
  }
  if (seen.has(messageId)) return true;
  seen.add(messageId);
  if (seen.size > LIVE_DEDUP_CAPACITY) {
    seen.delete(seen.values().next().value as string);
  }
  return false;
}

/** @internal Test-only: clear module-level dedup state between runs. */
export function _resetLiveDedup(): void {
  liveSeenByAccount.clear();
}

/**
 * Return the live-dedup Set for the given account, creating it lazily.
 *
 * Exposed so the channel layer can hand the *same* Set to `replayHistory`,
 * which then mutates it in-place. That way replay-added message_ids protect
 * against future live duplicates, and live-added message_ids prevent replay
 * from re-dispatching the same row.
 *
 * Note: FIFO eviction (capacity 1000) only triggers when `isLiveDuplicate`
 * runs, not when callers mutate the Set directly. MVP-acceptable; a few
 * hundred replayed ids per reconnect will NOT exceed capacity in practice.
 */
export function getLiveSeenSet(accountLabel: string): Set<string> {
  let seen = liveSeenByAccount.get(accountLabel);
  if (!seen) {
    seen = new Set();
    liveSeenByAccount.set(accountLabel, seen);
  }
  return seen;
}

export interface InboundDeps {
  dispatchInbound: (msg: {
    channel: string;
    accountLabel: string;
    chatId: string;
    user: string;
    text: string;
    extra: Record<string, unknown>;
  }) => void;
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Central inbound frame handler. Called by the runtime's onInboundFrame
 * callback for every frame received over the WS connection.
 *
 * MUST NEVER throw — errors are caught and logged via deps.logger.warn.
 * An unhandled throw would break the WS dispatch loop in the runtime.
 */
export function handleInboundFrame(
  deps: InboundDeps,
  accountLabel: string,
  frame: ServerFrame
): void {
  try {
    const frameType = frame.type as string;

    switch (frameType) {
      case 'message':
        handleMessageFrame(deps, accountLabel, frame as MessageFrame);
        break;

      case 'visitor_message':
        handleVisitorBroadcastFrame(deps, accountLabel, frame);
        break;

      case 'system':
        handleSystemFrame(deps, frame);
        break;

      case 'read_receipt':
        // MVP: silently drop. Read receipts are informational and OpenClaw
        // has no consumer for them yet.
        break;

      case 'ack':
      case 'error':
      case 'agent_typing':
      case 'pong':
      case 'connection_ack':
        break;

      case 'stream_chunk':
      case 'stream_end':
        break;

      default:
        deps.logger.debug(`[inbound] Unhandled frame type: ${frameType}`);
        break;
    }
  } catch (err) {
    deps.logger.warn(
      `[inbound] Error handling frame type=${frame.type}:`,
      err instanceof Error ? err.message : err
    );
  }
}

function handleMessageFrame(deps: InboundDeps, accountLabel: string, frame: MessageFrame): void {
  const { payload } = frame;

  if (payload.sender_type === 'agent') {
    return;
  }

  if (isLiveDuplicate(accountLabel, frame.id)) return;

  deps.dispatchInbound({
    channel: 'qrclaw',
    accountLabel,
    chatId: payload.conversation_id,
    user: payload.conversation_id,
    text: payload.content,
    extra: {
      message_id: frame.id,
      reply_to_message_id: payload.reply_to_message_id,
      thread_id: payload.thread_id,
    },
  });
}

function handleVisitorBroadcastFrame(
  deps: InboundDeps,
  accountLabel: string,
  frame: ServerFrame
): void {
  const payload = frame.payload as Record<string, unknown> | undefined;
  if (!payload) return;

  const senderType = payload.sender_type as string | undefined;
  if (senderType === 'agent') return;

  if (isLiveDuplicate(accountLabel, frame.id)) return;

  const conversationId = payload.conversation_id as string;
  const visitorId = payload.visitor_id as string | undefined;

  deps.dispatchInbound({
    channel: 'qrclaw',
    accountLabel,
    chatId: conversationId,
    user: visitorId ?? conversationId,
    text: payload.content as string,
    extra: {
      message_id: frame.id ?? '',
      reply_to_message_id: payload.reply_to_message_id as string | undefined,
      thread_id: payload.thread_id as string | undefined,
    },
  });
}

function handleSystemFrame(deps: InboundDeps, frame: ServerFrame): void {
  const payload = frame.payload as { event?: string; data?: Record<string, unknown> } | undefined;
  if (!payload) return;

  // TODO: If OpenClaw SDK exposes a presence event hook, dispatch here (§6.1).
  // For now, log and drop — no presence API available in MVP SDK.
  if (payload.event === 'agent_online' || payload.event === 'agent_offline') {
    deps.logger.info(`[inbound] System event: ${payload.event}`, payload.data);
    return;
  }

  deps.logger.debug(`[inbound] System event ignored: ${payload.event}`);
}
