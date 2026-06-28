import type { ResolvedQRClawAccount } from './accounts.js';
import type {
  DecryptedMessagesResponse,
  DecryptedMessage,
} from '../../../shared/contracts/http/decrypted-messages/types.js';

export interface HistoryDeps {
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

export interface ReplayHistoryParams {
  account: ResolvedQRClawAccount;
  conversationIds: string[];
  cursor?: string;
  limit?: number;
  seen?: Set<string>;
}

export interface ReplayHistoryResult {
  replayed: number;
  seen: Set<string>;
  errors: Array<{ conversation_id: string; reason: string }>;
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 100;

/**
 * Replay visitor messages from the decrypted-messages Edge Function.
 *
 * Called on every WS handshake success (and every reconnect) to pull
 * visitor messages that accumulated while offline and dispatch them
 * to OpenClaw via dispatchInbound — with message_id dedup.
 *
 * Retry policy: 1 initial + 3 retries = 4 total attempts for 5xx/network.
 * 4xx → bail immediately (auth/config problem).
 */
export async function replayHistory(
  deps: HistoryDeps,
  params: ReplayHistoryParams
): Promise<ReplayHistoryResult> {
  // Mutate the caller's Set in-place when provided. This lets the channel
  // layer share one dedup surface between live inbound frames and replayed
  // history rows. Previously we cloned, which silently broke the
  // live→history direction of dedup.
  const seen = params.seen ?? new Set<string>();
  let totalReplayed = 0;
  const errors: Array<{ conversation_id: string; reason: string }> = [];

  const tasks = params.conversationIds.map((conversationId) =>
    replayConversation(deps, params, conversationId, seen).then(
      (count) => {
        totalReplayed += count;
      },
      (err) => {
        const reason = err instanceof Error ? err.message : String(err);
        errors.push({ conversation_id: conversationId, reason });
      }
    )
  );

  await Promise.all(tasks);

  return { replayed: totalReplayed, seen, errors };
}

async function replayConversation(
  deps: HistoryDeps,
  params: ReplayHistoryParams,
  conversationId: string,
  seen: Set<string>
): Promise<number> {
  let cursor = params.cursor;
  let replayed = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchWithRetry(deps, params.account, conversationId, {
      cursor,
      limit: params.limit,
    });

    let hitSeen = false;
    for (const msg of response.data) {
      if (seen.has(msg.message_id)) {
        // We've caught up with messages already dispatched live.
        hitSeen = true;
        continue;
      }

      seen.add(msg.message_id);
      dispatchHistoryMessage(deps, params.account.label, conversationId, msg);
      replayed++;
    }

    if (hitSeen || response.data.length === 0 || !response.meta.has_more) {
      hasMore = false;
    } else {
      cursor = response.meta.cursor ?? undefined;
    }
  }

  return replayed;
}

async function fetchWithRetry(
  deps: HistoryDeps,
  account: ResolvedQRClawAccount,
  conversationId: string,
  opts: { cursor?: string; limit?: number }
): Promise<DecryptedMessagesResponse> {
  const url = `${account.supabaseUrl}/functions/v1/decrypted-messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${account.agentToken}`,
  };

  if (account.supabaseAnonKey) {
    headers['apikey'] = account.supabaseAnonKey;
  }

  const body = JSON.stringify({
    actor: 'agent',
    conversation_id: conversationId,
    ...(opts.limit !== undefined && { limit: opts.limit }),
    ...(opts.cursor !== undefined && { cursor: opts.cursor }),
  });

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body });

      if (response.ok) {
        return (await response.json()) as DecryptedMessagesResponse;
      }

      const statusText = await response.text();

      // 4xx: auth/config problem — bail immediately, no retries
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${statusText}`);
      }

      // 5xx: retriable
      lastError = new Error(`HTTP ${response.status}: ${statusText}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP 4')) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      deps.logger.debug(`[history] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
      await sleep(delay);
    }
  }

  deps.logger.warn(`[history] All retries exhausted for conversation ${conversationId}`);
  throw lastError ?? new Error('Unknown fetch error');
}

function dispatchHistoryMessage(
  deps: HistoryDeps,
  accountLabel: string,
  conversationId: string,
  msg: DecryptedMessage
): void {
  deps.dispatchInbound({
    channel: 'qrclaw',
    accountLabel,
    chatId: conversationId,
    user: conversationId,
    text: msg.content,
    extra: {
      message_id: msg.message_id,
      reply_to_message_id: msg.reply_to_message_id ?? undefined,
      thread_id: msg.thread_id ?? undefined,
      replayed: true,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
