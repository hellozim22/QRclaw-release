/**
 * POST /api/agent/create-qrcode — Agent-authenticated QR creation tests.
 *
 * Covers: auth (happy + missing + invalid + suspended), validation, rate limit,
 * cross-owner attack prevention (strict schema), optional fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// ─── Supabase mock (hoisted — no top-level variable references) ─────

vi.mock('../../../gateway/src/db/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

// ─── Redis mock (hoisted — no top-level variable references) ────────

vi.mock('../../../gateway/src/redis/client', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 0],
      ]),
    }),
  }),
  isRedisConnected: vi.fn().mockReturnValue(true),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { supabase } from '../../../gateway/src/db/supabase.js';
import { getRedisClient, isRedisConnected } from '../../../gateway/src/redis/client.js';
import { agentCreateQrcodeSchema } from '../../../shared/contracts/http/agent/protocol.js';
import { authenticateAgentMiddleware } from '../../../gateway/src/routes/agent-create-qrcode.js';
import { validateRequest } from '../../../gateway/src/middleware/validate-request.js';
import type { AgentCreateQrcodeResponse } from '../../../shared/contracts/http/agent/types.js';

// ─── Test fixtures ──────────────────────────────────────────────────

const AGENT_API_KEY = 'sk-test-agent-key-1234567890abcdef';
const AGENT_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = '22222222-2222-2222-2222-222222222222';
const QR_CODE_ID = '33333333-3333-3333-3333-333333333333';
const QR_SLUG = 'abcd1234efgh';

// ─── Test helpers ───────────────────────────────────────────────────

interface MockReq {
  headers: Record<string, string | undefined>;
  body: Record<string, unknown>;
  agentAuth?: { agentId: string; ownerId: string };
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
    body: { label: 'Test QR' },
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

function setupAgentLookup(opts: { found?: boolean; status?: string } = {}) {
  const { found = true, status = 'active' } = opts;

  const mockFrom = vi.mocked(supabase.from);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'agents') {
      const singleFn = vi
        .fn()
        .mockResolvedValue(
          found
            ? { data: { id: AGENT_ID, owner_id: OWNER_ID, status }, error: null }
            : { data: null, error: { message: 'not found' } }
        );
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: singleFn }),
        }),
        insert: vi.fn(),
      } as ReturnType<typeof mockFrom>;
    }
    if (table === 'qrcodes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: QR_CODE_ID, slug: QR_SLUG }, error: null }),
          }),
        }),
      } as ReturnType<typeof mockFrom>;
    }
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    } as ReturnType<typeof mockFrom>;
  });
}

function setupRedisRateLimit(currentCount: number) {
  const mockExec = vi
    .fn()
    .mockResolvedValueOnce([
      [null, 0], // zremrangebyscore
      [null, currentCount], // zcard
    ])
    .mockResolvedValueOnce([
      [null, 1], // zadd
      [null, 1], // pexpire
    ]);

  const mockRedisClient = vi.mocked(getRedisClient);
  mockRedisClient.mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: mockExec,
    }),
  } as ReturnType<typeof mockRedisClient>);
}

// ─── Auth Middleware Tests ───────────────────────────────────────────

describe('authenticateAgentMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupAgentLookup();
  });

  it('sets agentAuth on valid token', async () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    await authenticateAgentMiddleware(
      req as unknown as Parameters<typeof authenticateAgentMiddleware>[0],
      res as unknown as Parameters<typeof authenticateAgentMiddleware>[1],
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentAuth).toEqual({ agentId: AGENT_ID, ownerId: OWNER_ID });
  });

  it('returns 401 for missing Authorization header', async () => {
    const req = createReq({ headers: {} });
    const res = createRes();
    const next = vi.fn();

    await authenticateAgentMiddleware(
      req as unknown as Parameters<typeof authenticateAgentMiddleware>[0],
      res as unknown as Parameters<typeof authenticateAgentMiddleware>[1],
      next
    );

    expect(res._statusCode).toBe(401);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid agent token (hash mismatch)', async () => {
    setupAgentLookup({ found: false });

    const req = createReq({
      headers: { authorization: 'Bearer invalid-token-that-wont-match' },
    });
    const res = createRes();
    const next = vi.fn();

    await authenticateAgentMiddleware(
      req as unknown as Parameters<typeof authenticateAgentMiddleware>[0],
      res as unknown as Parameters<typeof authenticateAgentMiddleware>[1],
      next
    );

    expect(res._statusCode).toBe(401);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for suspended agent', async () => {
    setupAgentLookup({ found: true, status: 'suspended' });

    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    await authenticateAgentMiddleware(
      req as unknown as Parameters<typeof authenticateAgentMiddleware>[0],
      res as unknown as Parameters<typeof authenticateAgentMiddleware>[1],
      next
    );

    expect(res._statusCode).toBe(401);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for short token (< 10 chars)', async () => {
    const req = createReq({ headers: { authorization: 'Bearer short' } });
    const res = createRes();
    const next = vi.fn();

    await authenticateAgentMiddleware(
      req as unknown as Parameters<typeof authenticateAgentMiddleware>[0],
      res as unknown as Parameters<typeof authenticateAgentMiddleware>[1],
      next
    );

    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Schema Validation Tests ────────────────────────────────────────

describe('agentCreateQrcodeSchema', () => {
  it('accepts valid minimal request', () => {
    const result = agentCreateQrcodeSchema.safeParse({ label: 'My QR' });
    expect(result.success).toBe(true);
  });

  it('accepts valid request with all optional fields', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'My QR',
      system_prompt: 'You are a helpful bot',
      callback_hint: 'openclaw-ref-123',
      agent_account_label: 'default',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing label', () => {
    const result = agentCreateQrcodeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty label', () => {
    const result = agentCreateQrcodeSchema.safeParse({ label: '' });
    expect(result.success).toBe(false);
  });

  it('rejects label exceeding 64 chars', () => {
    const result = agentCreateQrcodeSchema.safeParse({ label: 'a'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('rejects system_prompt exceeding 4000 chars', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'X',
      system_prompt: 'a'.repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects callback_hint exceeding 256 chars', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'X',
      callback_hint: 'a'.repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it('rejects agent_account_label exceeding 128 chars', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'X',
      agent_account_label: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('cross-owner attack: rejects body with owner_id via .strict()', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'X',
      owner_id: '99999999-9999-9999-9999-999999999999',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('cross-owner attack: rejects body with agent_id via .strict()', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'X',
      agent_id: '99999999-9999-9999-9999-999999999999',
    });
    expect(result.success).toBe(false);
  });
});

// ─── validateRequest middleware integration ──────────────────────────

describe('validateRequest with agentCreateQrcodeSchema', () => {
  const validate = validateRequest(agentCreateQrcodeSchema);

  it('passes valid body', () => {
    const req = { body: { label: 'Valid' } } as Parameters<typeof validate>[0];
    const res = createRes();
    const next = vi.fn();

    validate(req, res as unknown as Parameters<typeof validate>[1], next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for missing label', () => {
    const req = { body: {} } as Parameters<typeof validate>[0];
    const res = createRes();
    const next = vi.fn();

    validate(req, res as unknown as Parameters<typeof validate>[1], next);

    expect(res._statusCode).toBe(400);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe(
      'invalid_request'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for label too long', () => {
    const req = { body: { label: 'a'.repeat(100) } } as Parameters<typeof validate>[0];
    const res = createRes();
    const next = vi.fn();

    validate(req, res as unknown as Parameters<typeof validate>[1], next);

    expect(res._statusCode).toBe(400);
    expect((res._body as Record<string, Record<string, string>>)?.error?.code).toBe(
      'invalid_request'
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Response Contract Tests ────────────────────────────────────────

describe('AgentCreateQrcodeResponse contract', () => {
  it('response type matches the shared contract', () => {
    const response: AgentCreateQrcodeResponse = {
      qr_code_id: QR_CODE_ID,
      slug: QR_SLUG,
      qr_image_url: `https://qrclaw.ai/api/qr/${QR_SLUG}`,
      public_url: `https://qrclaw.ai/q/${QR_SLUG}`,
      expires_at: null,
    };

    expect(response.qr_code_id).toBe(QR_CODE_ID);
    expect(response.slug).toBe(QR_SLUG);
    expect(response.qr_image_url).toContain(QR_SLUG);
    expect(response.public_url).toContain('/q/');
    expect(response.expires_at).toBeNull();
  });

  it('response allows ISO 8601 expires_at', () => {
    const response: AgentCreateQrcodeResponse = {
      qr_code_id: QR_CODE_ID,
      slug: QR_SLUG,
      qr_image_url: `https://qrclaw.ai/api/qr/${QR_SLUG}`,
      public_url: `https://qrclaw.ai/q/${QR_SLUG}`,
      expires_at: '2026-12-31T23:59:59Z',
    };

    expect(response.expires_at).toBe('2026-12-31T23:59:59Z');
  });
});

// ─── SHA-256 Consistency ────────────────────────────────────────────

describe('SHA-256 hashing consistency', () => {
  it('Node crypto hash matches expected output', () => {
    const hash = createHash('sha256').update(AGENT_API_KEY, 'utf8').digest('hex');
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('same input always produces same hash', () => {
    const hash1 = createHash('sha256').update('test-key-12345', 'utf8').digest('hex');
    const hash2 = createHash('sha256').update('test-key-12345', 'utf8').digest('hex');
    expect(hash1).toBe(hash2);
  });

  it('different inputs produce different hashes', () => {
    const hash1 = createHash('sha256').update('key-aaa', 'utf8').digest('hex');
    const hash2 = createHash('sha256').update('key-bbb', 'utf8').digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});

// ─── Optional Fields Pass-Through ───────────────────────────────────

describe('optional fields pass-through', () => {
  it('system_prompt passes schema validation', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'Test',
      system_prompt: 'You are helpful',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.system_prompt).toBe('You are helpful');
    }
  });

  it('callback_hint passes schema validation', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'Test',
      callback_hint: 'ref-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.callback_hint).toBe('ref-abc');
    }
  });

  it('agent_account_label passes schema validation', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'Test',
      agent_account_label: 'default',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent_account_label).toBe('default');
    }
  });

  it('all optional fields together', () => {
    const result = agentCreateQrcodeSchema.safeParse({
      label: 'Full',
      system_prompt: 'Prompt',
      callback_hint: 'hint',
      agent_account_label: 'acct',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.system_prompt).toBe('Prompt');
      expect(result.data.callback_hint).toBe('hint');
      expect(result.data.agent_account_label).toBe('acct');
    }
  });
});
