/**
 * GET /api/agent/conversations — Agent-authenticated conversation listing tests.
 *
 * Mirrors tests/unit/backend/agent-create-qrcode.test.ts: middleware invoked
 * directly (no Express router mount). Covers auth, query validation, cursor
 * decoding, scope='self' vs scope='owner', pagination, rate limit, empty result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock (hoisted) ────────────────────────────────────────

vi.mock('../../../gateway/src/db/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

// ─── Redis mock (hoisted) ───────────────────────────────────────────

vi.mock('../../../gateway/src/redis/client', () => ({
  getRedisClient: vi.fn(),
  isRedisConnected: vi.fn().mockReturnValue(true),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { supabase } from '../../../gateway/src/db/supabase.js';
import { getRedisClient, isRedisConnected } from '../../../gateway/src/redis/client.js';
import {
  authenticateAgentMiddleware,
  validateQueryMiddleware,
  rateLimitMiddleware,
  handleAgentConversations,
  agentConversationsRouter,
} from '../../../gateway/src/routes/agent-conversations.js';
import {
  AGENT_CONVERSATIONS_DEFAULT_LIMIT,
  AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE,
} from '../../../shared/contracts/http/agent/conversations/types.js';

// ─── Fixtures ───────────────────────────────────────────────────────

const AGENT_API_KEY = 'sk-test-agent-key-1234567890abcdef';
const AGENT_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = '22222222-2222-2222-2222-222222222222';
const PEER_AGENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const QR_SELF_ID = '33333333-3333-3333-3333-333333333333';
const QR_PEER_ID = '44444444-4444-4444-4444-444444444444';

type VisibilityScope = 'self' | 'owner';

// ─── Test req/res doubles (same shape as agent-create-qrcode.test.ts) ─

interface MockReq {
  headers: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  agentAuth?: { agentId: string; ownerId: string; visibilityScope: VisibilityScope };
  validatedQuery?: { limit?: number; cursor?: string };
}

interface MockRes {
  _statusCode: number;
  _body: Record<string, unknown> | null;
  _headers: Record<string, string | number>;
  status: (code: number) => MockRes;
  json: (body: Record<string, unknown>) => void;
  setHeader: (name: string, value: string | number) => void;
}

function createReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    headers: { authorization: `Bearer ${AGENT_API_KEY}` },
    query: {},
    ...overrides,
  };
}

function createRes(): MockRes {
  const res: MockRes = {
    _statusCode: 200,
    _body: null,
    _headers: {},
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res._body = body;
    },
    setHeader(name: string, value: string | number) {
      res._headers[name] = value;
    },
  };
  return res;
}

// ─── Mock helpers ───────────────────────────────────────────────────

function setupAgentLookup(
  opts: { found?: boolean; status?: string; visibilityScope?: VisibilityScope } = {}
) {
  const { found = true, status = 'active', visibilityScope = 'self' } = opts;
  const mockFrom = vi.mocked(supabase.from);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'agents') {
      const singleFn = vi.fn().mockResolvedValue(
        found
          ? {
              data: {
                id: AGENT_ID,
                owner_id: OWNER_ID,
                status,
                visibility_scope: visibilityScope,
              },
              error: null,
            }
          : { data: null, error: { message: 'not found' } }
      );
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: singleFn }),
        }),
      } as unknown as ReturnType<typeof mockFrom>;
    }
    return makeConversationsChain([]);
  });
}

interface ConversationMockRow {
  id: string;
  qrcode_id: string;
  message_count: number;
  last_active_at: string;
  created_at: string;
  qrcodes: {
    id: string;
    slug: string;
    profile: Record<string, unknown> | null;
    agent_id: string;
  };
}

interface ConversationsCapture {
  selectArg?: string;
  eqCalls: Array<[string, unknown]>;
  orCalls: string[];
  limitArg?: number;
}

function makeConversationsChain(rows: ConversationMockRow[], capture?: ConversationsCapture) {
  const chain: Record<string, unknown> = {};
  const resolved = { data: rows, error: null };

  chain.select = vi.fn((arg: string) => {
    if (capture) capture.selectArg = arg;
    return chain;
  });
  chain.eq = vi.fn((field: string, value: unknown) => {
    if (capture) capture.eqCalls.push([field, value]);
    return chain;
  });
  chain.or = vi.fn((expr: string) => {
    if (capture) capture.orCalls.push(expr);
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn((n: number) => {
    if (capture) capture.limitArg = n;
    return chain;
  });
  // Make the chain thenable so `await query` resolves to `{ data, error }`.
  chain.then = (
    resolve: (v: { data: ConversationMockRow[]; error: null }) => void
  ): Promise<{ data: ConversationMockRow[]; error: null }> => {
    resolve(resolved);
    return Promise.resolve(resolved);
  };
  return chain as unknown as ReturnType<typeof supabase.from>;
}

function setupFullPipeline(opts: {
  visibilityScope: VisibilityScope;
  rows: ConversationMockRow[];
  capture?: ConversationsCapture;
}) {
  const mockFrom = vi.mocked(supabase.from);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'agents') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: AGENT_ID,
                owner_id: OWNER_ID,
                status: 'active',
                visibility_scope: opts.visibilityScope,
              },
              error: null,
            }),
          }),
        }),
      } as unknown as ReturnType<typeof mockFrom>;
    }
    if (table === 'conversations') {
      return makeConversationsChain(opts.rows, opts.capture);
    }
    return makeConversationsChain([]);
  });
}

function setupRedisAllowed() {
  const mockExec = vi
    .fn()
    .mockResolvedValueOnce([
      [null, 0], // zremrangebyscore
      [null, 0], // zcard
    ])
    .mockResolvedValueOnce([
      [null, 1], // zadd
      [null, 1], // pexpire
    ]);

  vi.mocked(getRedisClient).mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: mockExec,
    }),
  } as unknown as ReturnType<typeof getRedisClient>);
  vi.mocked(isRedisConnected).mockReturnValue(true);
}

function setupRedisAtCapacity() {
  const mockExec = vi.fn().mockResolvedValue([
    [null, 0],
    [null, AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE],
  ]);
  vi.mocked(getRedisClient).mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: mockExec,
    }),
  } as unknown as ReturnType<typeof getRedisClient>);
  vi.mocked(isRedisConnected).mockReturnValue(true);
}

// Cast helpers so middleware types accept our doubles.
type MW = typeof authenticateAgentMiddleware;
const asReq = (r: MockReq) => r as unknown as Parameters<MW>[0];
const asRes = (r: MockRes) => r as unknown as Parameters<MW>[1];

// ─── authenticateAgentMiddleware ────────────────────────────────────

describe('authenticateAgentMiddleware (conversations)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(isRedisConnected).mockReturnValue(true);
  });

  it('401 missing Authorization header', async () => {
    setupAgentLookup();
    const req = createReq({ headers: {} });
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(401);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('401 Bearer token shorter than 10 chars', async () => {
    setupAgentLookup();
    const req = createReq({ headers: { authorization: 'Bearer shrt' } });
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 unknown api-key hash (agent lookup returns null)', async () => {
    setupAgentLookup({ found: false });
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 agent.status === 'suspended'", async () => {
    setupAgentLookup({ status: 'suspended' });
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("propagates visibility_scope='self' to req.agentAuth", async () => {
    setupAgentLookup({ visibilityScope: 'self' });
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentAuth).toEqual({
      agentId: AGENT_ID,
      ownerId: OWNER_ID,
      visibilityScope: 'self',
    });
  });

  it("propagates visibility_scope='owner' to req.agentAuth", async () => {
    setupAgentLookup({ visibilityScope: 'owner' });
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    await authenticateAgentMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentAuth?.visibilityScope).toBe('owner');
  });
});

// ─── validateQueryMiddleware ────────────────────────────────────────

describe('validateQueryMiddleware', () => {
  it('accepts empty query', () => {
    const req = createReq({ query: {} });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedQuery).toEqual({});
  });

  it('accepts limit in [1,200] and coerces string → number', () => {
    const req = createReq({ query: { limit: '25' } });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedQuery?.limit).toBe(25);
  });

  it('400 invalid_request when limit=0', () => {
    const req = createReq({ query: { limit: '0' } });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(400);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe(
      'invalid_request'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('400 invalid_request when limit=201', () => {
    const req = createReq({ query: { limit: '201' } });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 invalid_request on unknown query parameter (strict mode)', () => {
    const req = createReq({ query: { limit: '10', unexpected: 'yes' } });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts cursor up to max length', () => {
    const cursor = Buffer.from(
      JSON.stringify({ last_active_at: '2026-04-20T10:00:00.000Z', id: 'abc' }),
      'utf8'
    ).toString('base64url');
    const req = createReq({ query: { cursor } });
    const res = createRes();
    const next = vi.fn();
    validateQueryMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─── handleAgentConversations: scope='self' ─────────────────────────

describe("handleAgentConversations — scope='self'", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns rows with owned_by_me=true and issues a qrcodes.agent_id filter', async () => {
    const rows: ConversationMockRow[] = [
      {
        id: 'c1',
        qrcode_id: QR_SELF_ID,
        message_count: 4,
        last_active_at: '2026-04-20T10:00:00.000Z',
        created_at: '2026-04-19T10:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug-self-1',
          profile: { name: 'Self QR 1' },
          agent_id: AGENT_ID,
        },
      },
      {
        id: 'c2',
        qrcode_id: QR_SELF_ID,
        message_count: 1,
        last_active_at: '2026-04-20T09:00:00.000Z',
        created_at: '2026-04-19T09:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug-self-1',
          profile: { name: 'Self QR 1' },
          agent_id: AGENT_ID,
        },
      },
    ];
    const capture: ConversationsCapture = { eqCalls: [], orCalls: [] };
    setupFullPipeline({ visibilityScope: 'self', rows, capture });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
      validatedQuery: {},
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));

    expect(res._statusCode).toBe(200);
    const body = res._body as Record<string, unknown>;
    const meta = body.meta as Record<string, unknown>;
    const data = body.data as Array<Record<string, unknown>>;

    expect(meta.scope).toBe('self');
    expect(meta.has_more).toBe(false);
    expect(meta.cursor).toBeNull();
    expect(data).toHaveLength(2);
    expect(data.every((r) => r.owned_by_me === true)).toBe(true);
    expect(data[0]).toMatchObject({
      conversation_id: 'c1',
      qrcode_id: QR_SELF_ID,
      qrcode_slug: 'slug-self-1',
      qrcode_label: 'Self QR 1',
      owner_id: OWNER_ID,
      owned_by_me: true,
      message_count: 4,
    });
    expect(capture.eqCalls).toContainEqual(['qrcodes.agent_id', AGENT_ID]);
    expect(capture.selectArg).toBeDefined();
    // scope='self' MUST NOT traverse to the agents table.
    expect(capture.selectArg).not.toContain('agents!inner');
  });
});

// ─── handleAgentConversations: scope='owner' ────────────────────────

describe("handleAgentConversations — scope='owner'", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('flags own rows owned_by_me=true and peer rows false; filters by owner_id', async () => {
    const rows: ConversationMockRow[] = [
      {
        id: 'own-1',
        qrcode_id: QR_SELF_ID,
        message_count: 2,
        last_active_at: '2026-04-20T12:00:00.000Z',
        created_at: '2026-04-19T12:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug-self',
          profile: { name: 'Self QR' },
          agent_id: AGENT_ID,
        },
      },
      {
        id: 'peer-1',
        qrcode_id: QR_PEER_ID,
        message_count: 7,
        last_active_at: '2026-04-20T11:00:00.000Z',
        created_at: '2026-04-19T11:00:00.000Z',
        qrcodes: {
          id: QR_PEER_ID,
          slug: 'slug-peer',
          profile: { name: 'Peer QR' },
          agent_id: PEER_AGENT_ID,
        },
      },
    ];
    const capture: ConversationsCapture = { eqCalls: [], orCalls: [] };
    setupFullPipeline({ visibilityScope: 'owner', rows, capture });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'owner' },
      validatedQuery: {},
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));

    expect(res._statusCode).toBe(200);
    const body = res._body as Record<string, unknown>;
    const meta = body.meta as Record<string, unknown>;
    const data = body.data as Array<{ conversation_id: string; owned_by_me: boolean }>;

    expect(meta.scope).toBe('owner');
    expect(data).toHaveLength(2);
    const byId = new Map(data.map((r) => [r.conversation_id, r.owned_by_me]));
    expect(byId.get('own-1')).toBe(true);
    expect(byId.get('peer-1')).toBe(false);

    expect(capture.eqCalls).toContainEqual(['qrcodes.agents.owner_id', OWNER_ID]);
    expect(capture.selectArg).toContain('agents!inner');
  });
});

// ─── Pagination ─────────────────────────────────────────────────────

describe('handleAgentConversations — keyset pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('flips has_more=true when rows exceed limit, cursor points at last returned row', async () => {
    const rows: ConversationMockRow[] = [
      {
        id: 'row-a',
        qrcode_id: QR_SELF_ID,
        message_count: 10,
        last_active_at: '2026-04-20T15:00:00.000Z',
        created_at: '2026-04-19T15:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug',
          profile: { name: 'N' },
          agent_id: AGENT_ID,
        },
      },
      {
        id: 'row-b',
        qrcode_id: QR_SELF_ID,
        message_count: 5,
        last_active_at: '2026-04-20T14:00:00.000Z',
        created_at: '2026-04-19T14:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug',
          profile: { name: 'N' },
          agent_id: AGENT_ID,
        },
      },
      {
        id: 'row-c',
        qrcode_id: QR_SELF_ID,
        message_count: 1,
        last_active_at: '2026-04-20T13:00:00.000Z',
        created_at: '2026-04-19T13:00:00.000Z',
        qrcodes: {
          id: QR_SELF_ID,
          slug: 'slug',
          profile: { name: 'N' },
          agent_id: AGENT_ID,
        },
      },
    ];
    const capture: ConversationsCapture = { eqCalls: [], orCalls: [] };
    setupFullPipeline({ visibilityScope: 'self', rows, capture });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
      validatedQuery: { limit: 2 },
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));

    expect(res._statusCode).toBe(200);
    const body = res._body as Record<string, unknown>;
    const meta = body.meta as Record<string, unknown>;
    const data = body.data as Array<{ conversation_id: string }>;

    expect(meta.has_more).toBe(true);
    expect(data).toHaveLength(2);
    expect(typeof meta.cursor).toBe('string');
    expect(capture.limitArg).toBe(3); // limit + 1

    const decoded = JSON.parse(Buffer.from(meta.cursor as string, 'base64url').toString('utf8'));
    expect(decoded.id).toBe('row-b');
    expect(decoded.last_active_at).toBe('2026-04-20T14:00:00.000Z');
  });

  it('applies composite keyset filter via .or() when cursor is provided', async () => {
    const capture: ConversationsCapture = { eqCalls: [], orCalls: [] };
    setupFullPipeline({ visibilityScope: 'self', rows: [], capture });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
      validatedQuery: { limit: 10, cursor: 'ignored-decoder-handled-upstream' },
    });

    // Simulate what validateQueryMiddleware would have done upstream: handler
    // expects cursor to already be shape-checked (length). Feed it a valid
    // encoded cursor so handler parses it successfully.
    req.validatedQuery = {
      limit: 10,
      cursor: Buffer.from(
        JSON.stringify({ last_active_at: '2026-04-20T10:00:00.000Z', id: 'last-id' }),
        'utf8'
      ).toString('base64url'),
    };

    const res = createRes();
    await handleAgentConversations(asReq(req), asRes(res));

    expect(res._statusCode).toBe(200);
    expect(capture.orCalls).toHaveLength(1);
    expect(capture.orCalls[0]).toContain('last_active_at.lt.2026-04-20T10:00:00.000Z');
    expect(capture.orCalls[0]).toContain('id.lt.last-id');
  });
});

// ─── Invalid cursor ─────────────────────────────────────────────────

describe('handleAgentConversations — invalid cursor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('400 invalid_cursor on non-JSON base64url payload', async () => {
    setupFullPipeline({ visibilityScope: 'self', rows: [] });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
      validatedQuery: { cursor: 'not-json-blob' },
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));
    expect(res._statusCode).toBe(400);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe(
      'invalid_cursor'
    );
  });

  it('400 invalid_cursor when JSON is missing last_active_at', async () => {
    setupFullPipeline({ visibilityScope: 'self', rows: [] });

    const bad = Buffer.from(JSON.stringify({ id: 'abc' }), 'utf8').toString('base64url');
    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
      validatedQuery: { cursor: bad },
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));
    expect(res._statusCode).toBe(400);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe(
      'invalid_cursor'
    );
  });
});

// ─── Empty result ───────────────────────────────────────────────────

describe('handleAgentConversations — empty result', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns data=[], has_more=false, cursor=null, scope='owner'", async () => {
    setupFullPipeline({ visibilityScope: 'owner', rows: [] });

    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'owner' },
      validatedQuery: {},
    });
    const res = createRes();

    await handleAgentConversations(asReq(req), asRes(res));
    expect(res._statusCode).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body.data).toEqual([]);
    const meta = body.meta as Record<string, unknown>;
    expect(meta.has_more).toBe(false);
    expect(meta.cursor).toBeNull();
    expect(meta.scope).toBe('owner');
  });
});

// ─── Rate limit ─────────────────────────────────────────────────────

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows below capacity and emits X-RateLimit-* headers', async () => {
    setupRedisAllowed();
    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
    });
    const res = createRes();
    const next = vi.fn();
    await rateLimitMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers['X-RateLimit-Limit']).toBe(AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE);
    expect(res._headers['X-RateLimit-Remaining']).toBe(
      AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE - 1
    );
  });

  it('blocks 429 rate_limited when at capacity (current >= limit)', async () => {
    setupRedisAtCapacity();
    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
    });
    const res = createRes();
    const next = vi.fn();
    await rateLimitMiddleware(asReq(req), asRes(res), next);
    expect(res._statusCode).toBe(429);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe('rate_limited');
    expect(res._headers['X-RateLimit-Remaining']).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows (fail-open) when Redis is disconnected', async () => {
    vi.mocked(isRedisConnected).mockReturnValue(false);
    const req = createReq({
      agentAuth: { agentId: AGENT_ID, ownerId: OWNER_ID, visibilityScope: 'self' },
    });
    const res = createRes();
    const next = vi.fn();
    await rateLimitMiddleware(asReq(req), asRes(res), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─── Router wiring (POST is 404 — only GET is registered) ───────────

describe('agentConversationsRouter wiring', () => {
  it('registers GET /api/agent/conversations and no other verbs', () => {
    const stack = (
      agentConversationsRouter as unknown as {
        stack: Array<{
          route?: { path: string; methods: Record<string, boolean> };
        }>;
      }
    ).stack;
    const routes = stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route as { path: string; methods: Record<string, boolean> });

    const hit = routes.find((r) => r.path === '/api/agent/conversations');
    expect(hit).toBeDefined();
    expect(hit!.methods.get).toBe(true);
    expect(hit!.methods.post).toBeFalsy();
    expect(hit!.methods.put).toBeFalsy();
    expect(hit!.methods.delete).toBeFalsy();
  });
});

// ─── Defaults sanity ────────────────────────────────────────────────

describe('contract defaults', () => {
  it('AGENT_CONVERSATIONS_DEFAULT_LIMIT is 50', () => {
    expect(AGENT_CONVERSATIONS_DEFAULT_LIMIT).toBe(50);
  });
  it('AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE is 60', () => {
    expect(AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE).toBe(60);
  });
});
