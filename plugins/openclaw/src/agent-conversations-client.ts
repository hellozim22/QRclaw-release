import type { ResolvedQRClawAccount } from './accounts.js';
import type {
  AgentConversationItem,
  AgentConversationsResponse,
} from '../../../shared/contracts/http/agent/conversations/types.js';
import { deriveGatewayBaseUrl } from './tools/create-qrcode.js';

export interface ListConversationsDeps {
  logger?: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export interface ListConversationsParams {
  account: ResolvedQRClawAccount;
  /** Per-page limit. Server caps at 200; plugin default 50 matches server default. */
  limit?: number;
  /**
   * Safety cap on pagination. At 50 items/page × 20 pages = 1000 items.
   * Guards against a misbehaving cursor loop. Any account with more than
   * ~1000 active conversations needs a dedicated list endpoint, not replay.
   */
  maxPages?: number;
}

export class AgentConversationsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'AgentConversationsError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Fetch all conversations visible to the authenticated agent, honoring
 * server-side pagination. Visibility is governed by `agents.visibility_scope`
 * on the server side (default `'self'`, opt-in `'owner'`).
 *
 * Uses the same gateway host derived from the account's WS URL — no
 * separate HTTP base URL config is required.
 *
 * Never swallows HTTP errors — callers must catch `AgentConversationsError`
 * and decide whether to log/disconnect/skip replay.
 */
export async function listConversations(
  deps: ListConversationsDeps,
  params: ListConversationsParams
): Promise<AgentConversationItem[]> {
  const { account, limit = 50, maxPages = 20 } = params;
  const baseUrl = deriveGatewayBaseUrl(account.gatewayWsUrl);
  const endpoint = `${baseUrl}/api/agent/conversations`;

  const results: AgentConversationItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (cursor !== undefined) query.set('cursor', cursor);
    const url = `${endpoint}?${query.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${account.agentToken}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AgentConversationsError('network_error', 0, `fetch failed: ${msg}`);
    }

    if (!response.ok) {
      let errorBody: { error?: { code?: string; message?: string } } | undefined;
      try {
        errorBody = (await response.json()) as { error?: { code?: string; message?: string } };
      } catch {
        /* ignore parse failures */
      }
      const code = errorBody?.error?.code ?? `http_${response.status}`;
      const message = errorBody?.error?.message ?? `HTTP ${response.status}`;
      throw new AgentConversationsError(code, response.status, message);
    }

    const json = (await response.json()) as AgentConversationsResponse;
    for (const item of json.data) results.push(item);

    if (!json.meta.has_more || !json.meta.cursor) break;
    cursor = json.meta.cursor;

    if (page === maxPages - 1) {
      deps.logger?.warn(
        `[agent-conversations] Pagination capped at ${maxPages} pages (limit=${limit}); dropping remaining cursor`
      );
    }
  }

  return results;
}
