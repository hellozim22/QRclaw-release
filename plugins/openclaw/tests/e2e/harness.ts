import { WebSocketServer, type WebSocket as WsType } from 'ws';
import net from 'net';
import { vi } from 'vitest';
import { createQRClawChannelPlugin } from '../../src/channel.js';
import type { PluginConfig, PluginLifecycle, LifecycleDeps } from '../../src/channel.js';
import { _resetLiveDedup } from '../../src/inbound.js';
import type { OpenClawPluginApi } from '../../src/openclaw-types.js';
import type { AgentConversationsResponse } from '../../../../shared/contracts/http/agent/conversations/types.js';
import type {
  DecryptedMessage,
  DecryptedMessagesResponse,
} from '../../../../shared/contracts/http/decrypted-messages/types.js';

export interface HarnessAccountConfig {
  agentToken: string;
}

export interface HarnessConfig {
  accounts: Record<string, HarnessAccountConfig>;
}

export interface InboundDispatch {
  channel: string;
  accountLabel: string;
  chatId: string;
  user: string;
  text: string;
  extra: Record<string, unknown>;
}

export type ParsedFrame = Record<string, unknown> & {
  type: string;
  id?: string;
  payload?: Record<string, unknown>;
};

export type CreateQrcodeHandler = (
  url: string,
  init: RequestInit
) => { ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> };

export type AgentConversationsResponseSpec =
  | AgentConversationsResponse
  | { status: number; body: unknown };

export interface AgentConversationsCallEntry {
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  token: string;
}

export interface DecryptedMessagesCallEntry {
  conversation_id: string;
  cursor?: string;
  limit?: number;
  token: string;
}

export interface AgentConversationsStub {
  /**
   * Configure the JSON body (or status+body pair) returned for
   * `GET /api/agent/conversations`. Pass `opts.forToken` to scope the
   * response to a specific `Authorization: Bearer <token>`; omitting
   * `forToken` sets the fallback used when no per-token entry matches.
   */
  setResponse(response: AgentConversationsResponseSpec, opts?: { forToken?: string }): void;
  getCallLog(): AgentConversationsCallEntry[];
}

export interface DecryptedMessagesStub {
  /**
   * Seed the messages returned by `POST /functions/v1/decrypted-messages`
   * for a given conversation_id. `opts.forToken` scopes the bucket to a
   * specific bearer token (used for multi-account isolation assertions).
   * `opts.has_more` / `opts.cursor` drive the response meta for pagination
   * tests; both default to `false` / `null`.
   */
  setMessagesFor(
    conversationId: string,
    msgs: DecryptedMessage[],
    opts?: { has_more?: boolean; cursor?: string | null; forToken?: string }
  ): void;
  getCallLog(): DecryptedMessagesCallEntry[];
}

export interface Harness {
  port: number;
  lifecycle: PluginLifecycle;
  capture: {
    inboundDispatches: InboundDispatch[];
    outboundFrames: Map<string, ParsedFrame[]>;
  };
  pushFrame(accountLabel: string, frame: Record<string, unknown>): void;
  getAccountWs(accountLabel: string): WsType | undefined;
  forceCloseConnection(accountLabel: string): void;
  waitForOutboundFrame(
    accountLabel: string,
    type: string,
    predicate?: (f: ParsedFrame) => boolean,
    timeoutMs?: number
  ): Promise<ParsedFrame>;
  waitForDispatch(
    predicate?: (d: InboundDispatch) => boolean,
    timeoutMs?: number
  ): Promise<InboundDispatch>;
  waitForConnection(accountLabel: string, timeoutMs?: number): Promise<void>;
  teardown(): Promise<void>;
  mockApi: OpenClawPluginApi;
  registeredTools: Array<{
    name: string;
    description: string;
    parameters: unknown;
    execute: (
      id: string,
      params: Record<string, unknown>
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;
  registeredChannels: unknown[];
  setCreateQrcodeHandler(handler: CreateQrcodeHandler): void;
  fetchCalls: Array<{ url: string; init?: RequestInit }>;
  agentConversations: AgentConversationsStub;
  decryptedMessages: DecryptedMessagesStub;
  /**
   * The `logger` object handed to the plugin via `LifecycleDeps`. Each
   * method is a `vi.fn()` so tests can assert against
   * `harness.logger.warn.mock.calls` etc.
   */
  logger: LifecycleDeps['logger'];
}

function normalizeHeaders(h?: HeadersInit): Record<string, string> {
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    const out: Record<string, string> = {};
    for (const entry of h) {
      if (Array.isArray(entry) && entry.length === 2) out[entry[0]] = entry[1];
    }
    return out;
  }
  return { ...(h as Record<string, string>) };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export async function createHarness(config: HarnessConfig): Promise<Harness> {
  const port = await getFreePort();

  const tokenToLabel = new Map<string, string>();
  const ticketToLabel = new Map<string, string>();
  const accountConnections = new Map<string, WsType>();
  const outboundFrames = new Map<string, ParsedFrame[]>();
  const inboundDispatches: InboundDispatch[] = [];
  const registeredTools: Harness['registeredTools'] = [];
  const registeredChannels: unknown[] = [];
  const fetchCalls: Harness['fetchCalls'] = [];
  const connectionListeners = new Map<string, Array<() => void>>();
  let createQrcodeHandler: CreateQrcodeHandler | null = null;
  let ticketCounter = 0;

  let agentConvFallback: AgentConversationsResponseSpec = {
    data: [],
    meta: { has_more: false, cursor: null, scope: 'self' },
  };
  const agentConvByToken = new Map<string, AgentConversationsResponseSpec>();
  const agentConvCalls: AgentConversationsCallEntry[] = [];

  interface DecryptedBucket {
    messages: DecryptedMessage[];
    has_more: boolean;
    cursor: string | null;
  }
  const decryptedStore = new Map<string, DecryptedBucket>();
  const decryptedCalls: DecryptedMessagesCallEntry[] = [];

  for (const [label, acctCfg] of Object.entries(config.accounts)) {
    tokenToLabel.set(acctCfg.agentToken, label);
    outboundFrames.set(label, []);
  }

  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://127.0.0.1:${port}`);
    const ticket = url.searchParams.get('ticket') ?? '';
    const accountLabel = ticketToLabel.get(ticket);

    if (!accountLabel) {
      ws.close(4001, 'Unknown ticket');
      return;
    }

    accountConnections.set(accountLabel, ws);

    ws.send(
      JSON.stringify({
        type: 'connection_ack',
        timestamp: new Date().toISOString(),
        payload: {
          connection_id: `conn-${accountLabel}-${Date.now()}`,
          heartbeat_interval_ms: 60000,
          server_time: new Date().toISOString(),
        },
      })
    );

    const listeners = connectionListeners.get(accountLabel);
    if (listeners) {
      for (const cb of listeners) cb();
      listeners.length = 0;
    }

    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as ParsedFrame;
        const frames = outboundFrames.get(accountLabel)!;
        frames.push(frame);
      } catch {
        /* ignore non-JSON */
      }
    });

    ws.on('close', () => {
      if (accountConnections.get(accountLabel) === ws) {
        accountConnections.delete(accountLabel);
      }
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      fetchCalls.push({ url: urlStr, init });

      if (urlStr.includes('/functions/v1/agent-ws-ticket') || urlStr.includes('/ticket')) {
        const authHeader =
          (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '';
        const token = authHeader.replace('Bearer ', '');
        const label = tokenToLabel.get(token);

        if (!label) {
          return {
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
            json: async () => ({ error: 'Unauthorized' }),
          };
        }

        ticketCounter++;
        const ticket = `mock-ticket-${label}-${ticketCounter}`;
        ticketToLabel.set(ticket, label);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { ticket, expires_in: 30, gateway_url: `ws://127.0.0.1:${port}` },
          }),
          text: async () => JSON.stringify({ data: { ticket } }),
        };
      }

      if (urlStr.includes('/api/agent/conversations')) {
        const headers = normalizeHeaders(init?.headers);
        const token = (headers['Authorization'] ?? headers['authorization'] ?? '').replace(
          'Bearer ',
          ''
        );
        const query: Record<string, string> = {};
        try {
          const parsed = new URL(urlStr);
          parsed.searchParams.forEach((v, k) => {
            query[k] = v;
          });
        } catch {
          /* relative URL — ignore */
        }
        agentConvCalls.push({ url: urlStr, headers, query, token });

        const spec = agentConvByToken.get(token) ?? agentConvFallback;
        if (
          typeof spec === 'object' &&
          spec !== null &&
          'status' in spec &&
          typeof (spec as { status: unknown }).status === 'number'
        ) {
          const withStatus = spec as { status: number; body: unknown };
          return {
            ok: withStatus.status >= 200 && withStatus.status < 300,
            status: withStatus.status,
            json: async () => withStatus.body,
            text: async () =>
              typeof withStatus.body === 'string'
                ? withStatus.body
                : JSON.stringify(withStatus.body),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => spec,
          text: async () => JSON.stringify(spec),
        };
      }

      if (urlStr.includes('/functions/v1/decrypted-messages')) {
        const headers = normalizeHeaders(init?.headers);
        const token = (headers['Authorization'] ?? headers['authorization'] ?? '').replace(
          'Bearer ',
          ''
        );
        let bodyObj: { conversation_id?: string; cursor?: string; limit?: number } = {};
        try {
          if (typeof init?.body === 'string') bodyObj = JSON.parse(init.body);
          else if (init?.body) bodyObj = JSON.parse(init.body.toString());
        } catch {
          /* ignore malformed body */
        }

        const conversationId = bodyObj.conversation_id ?? '';
        decryptedCalls.push({
          conversation_id: conversationId,
          cursor: bodyObj.cursor,
          limit: bodyObj.limit,
          token,
        });

        const bucket =
          decryptedStore.get(`${token}::${conversationId}`) ??
          decryptedStore.get(`*::${conversationId}`);

        const resp: DecryptedMessagesResponse = bucket
          ? {
              data: bucket.messages,
              meta: { cursor: bucket.cursor, has_more: bucket.has_more },
            }
          : { data: [], meta: { cursor: null, has_more: false } };

        return {
          ok: true,
          status: 200,
          json: async () => resp,
          text: async () => JSON.stringify(resp),
        };
      }

      if (urlStr.includes('/api/agent/create-qrcode') && createQrcodeHandler) {
        return createQrcodeHandler(urlStr, init!);
      }

      if (urlStr.includes('/api/agent/create-qrcode')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              qr_code_id: 'qr-default',
              slug: 'test-slug',
              public_url: 'https://qrclaw.ai/c/test-slug',
              qr_image_url: 'https://qrclaw.ai/qr/test.png',
              expires_at: null,
            },
          }),
          text: async () => 'ok',
        };
      }

      return { ok: false, status: 404, text: async () => 'Not found', json: async () => ({}) };
    })
  );

  const plugin = createQRClawChannelPlugin();

  const pluginConfig: PluginConfig = {
    accounts: Object.fromEntries(
      Object.entries(config.accounts).map(([label, cfg]) => [
        label,
        {
          agentToken: cfg.agentToken,
          gatewayWsUrl: `ws://127.0.0.1:${port}/ws`,
          supabaseUrl: `http://127.0.0.1:${port}`,
        },
      ])
    ),
  };

  const deps: LifecycleDeps = {
    dispatchInbound(msg) {
      inboundDispatches.push(msg as InboundDispatch);
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  const lifecycle = plugin.createLifecycle(pluginConfig, deps);

  const mockApi: OpenClawPluginApi = {
    registrationMode: 'full',
    runtime: {
      config: {
        loadConfig: vi.fn(() => ({ channels: { qrclaw: pluginConfig } })),
      },
    },
    registerTool: vi.fn((tool: Harness['registeredTools'][number]) => {
      registeredTools.push(tool);
    }),
    registerChannel: vi.fn((ch: unknown) => {
      registeredChannels.push(ch);
    }),
  };

  _resetLiveDedup();

  const harness: Harness = {
    port,
    lifecycle,
    capture: { inboundDispatches, outboundFrames },
    fetchCalls,
    registeredTools,
    registeredChannels,
    mockApi,
    logger: deps.logger,

    pushFrame(accountLabel: string, frame: Record<string, unknown>) {
      const ws = accountConnections.get(accountLabel);
      if (!ws) throw new Error(`No WS connection for account "${accountLabel}"`);
      ws.send(JSON.stringify(frame));
    },

    getAccountWs(accountLabel: string) {
      return accountConnections.get(accountLabel);
    },

    forceCloseConnection(accountLabel: string) {
      const ws = accountConnections.get(accountLabel);
      if (ws) ws.close(1000, 'Test force close');
    },

    async waitForOutboundFrame(
      accountLabel: string,
      type: string,
      predicate?: (f: ParsedFrame) => boolean,
      timeoutMs = 1000
    ) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const frames = outboundFrames.get(accountLabel) ?? [];
        const match = frames.find((f) => f.type === type && (!predicate || predicate(f)));
        if (match) return match;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`Timeout waiting for ${type} frame on account "${accountLabel}"`);
    },

    async waitForDispatch(predicate?: (d: InboundDispatch) => boolean, timeoutMs = 1000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = predicate
          ? inboundDispatches.find(predicate)
          : inboundDispatches[inboundDispatches.length - 1];
        if (match) return match;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('Timeout waiting for inbound dispatch');
    },

    async waitForConnection(accountLabel: string, timeoutMs = 2000) {
      if (accountConnections.has(accountLabel)) return;
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for "${accountLabel}" connection`));
        }, timeoutMs);

        const listeners = connectionListeners.get(accountLabel) ?? [];
        listeners.push(() => {
          clearTimeout(timer);
          resolve();
        });
        connectionListeners.set(accountLabel, listeners);
      });
    },

    setCreateQrcodeHandler(handler: CreateQrcodeHandler) {
      createQrcodeHandler = handler;
    },

    agentConversations: {
      setResponse(response, opts) {
        if (opts?.forToken) {
          agentConvByToken.set(opts.forToken, response);
        } else {
          agentConvFallback = response;
        }
      },
      getCallLog() {
        return agentConvCalls.map((c) => ({
          ...c,
          headers: { ...c.headers },
          query: { ...c.query },
        }));
      },
    },

    decryptedMessages: {
      setMessagesFor(conversationId, msgs, opts) {
        const token = opts?.forToken ?? '*';
        decryptedStore.set(`${token}::${conversationId}`, {
          messages: msgs,
          has_more: opts?.has_more ?? false,
          cursor: opts?.cursor ?? null,
        });
      },
      getCallLog() {
        return decryptedCalls.map((c) => ({ ...c }));
      },
    },

    async teardown() {
      await lifecycle.stop();
      for (const ws of accountConnections.values()) {
        ws.close();
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      _resetLiveDedup();
    },
  };

  return harness;
}
