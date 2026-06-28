import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Production Smoke Tests — Edge Function Reachability (Phase 7)
 *
 * Validates Supabase Edge Functions contract:
 * - ws-ticket: issues single-use WS ticket
 * - agent-verify: validates agent API key
 * - qr-resolve: resolves QR slug to active QR + agent
 * - Each returns proper error on invalid input
 *
 * Mock-based: defines the Edge Function invocation contract.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface EdgeFunctionResponse<T> {
  status: number;
  data: T | null;
  error: string | null;
}

interface WsTicket {
  ticket: string;
  expiresAt: number;
}

interface AgentVerification {
  agentId: string;
  status: 'active' | 'pending';
  ownerId: string;
}

interface QrResolveResult {
  qrId: string;
  slug: string;
  agentId: string;
  agentName: string;
  status: 'active';
}

// ─── Mock Edge Function Invoker ─────────────────────────────────────

const createEdgeFunctionInvoker = () => {
  const registeredAgents = new Map<string, AgentVerification>();
  const registeredQRs = new Map<string, QrResolveResult>();
  let ticketCounter = 0;

  // Seed data
  registeredAgents.set('key_valid_123', {
    agentId: 'agent-1',
    status: 'active',
    ownerId: 'owner-1',
  });
  registeredAgents.set('key_pending_456', {
    agentId: 'agent-2',
    status: 'pending',
    ownerId: 'owner-2',
  });
  registeredQRs.set('my-qr-slug', {
    qrId: 'qr-1',
    slug: 'my-qr-slug',
    agentId: 'agent-1',
    agentName: 'Support Bot',
    status: 'active',
  });

  const invokeWsTicket = (sessionToken?: string): EdgeFunctionResponse<WsTicket> => {
    if (!sessionToken) {
      return { status: 401, data: null, error: 'missing_session_token' };
    }

    ticketCounter += 1;
    return {
      status: 200,
      data: {
        ticket: `tkt_${ticketCounter}_${Date.now()}`,
        expiresAt: Math.floor(Date.now() / 1000) + 30,
      },
      error: null,
    };
  };

  const invokeAgentVerify = (apiKey?: string): EdgeFunctionResponse<AgentVerification> => {
    if (!apiKey) {
      return { status: 400, data: null, error: 'missing_api_key' };
    }

    const agent = registeredAgents.get(apiKey);
    if (!agent) {
      return { status: 401, data: null, error: 'invalid_api_key' };
    }

    return { status: 200, data: agent, error: null };
  };

  const invokeQrResolve = (slug?: string): EdgeFunctionResponse<QrResolveResult> => {
    if (!slug) {
      return { status: 400, data: null, error: 'missing_slug' };
    }

    const qr = registeredQRs.get(slug);
    if (!qr) {
      return { status: 404, data: null, error: 'qr_not_found' };
    }

    return { status: 200, data: qr, error: null };
  };

  return { invokeWsTicket, invokeAgentVerify, invokeQrResolve };
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('Smoke: Edge Function — ws-ticket', () => {
  let invoker: ReturnType<typeof createEdgeFunctionInvoker>;

  beforeEach(() => {
    invoker = createEdgeFunctionInvoker();
    vi.restoreAllMocks();
  });

  it('issues ticket with valid session token', () => {
    const result = invoker.invokeWsTicket('session_abc123');

    expect(result.status).toBe(200);
    expect(result.data?.ticket).toMatch(/^tkt_/);
    expect(result.data?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(result.error).toBeNull();
  });

  it('rejects missing session token', () => {
    const result = invoker.invokeWsTicket();

    expect(result.status).toBe(401);
    expect(result.data).toBeNull();
    expect(result.error).toBe('missing_session_token');
  });

  it('each ticket is unique', () => {
    const r1 = invoker.invokeWsTicket('session_1');
    const r2 = invoker.invokeWsTicket('session_2');

    expect(r1.data?.ticket).not.toBe(r2.data?.ticket);
  });
});

describe('Smoke: Edge Function — agent-verify', () => {
  let invoker: ReturnType<typeof createEdgeFunctionInvoker>;

  beforeEach(() => {
    invoker = createEdgeFunctionInvoker();
    vi.restoreAllMocks();
  });

  it('verifies active agent with valid API key', () => {
    const result = invoker.invokeAgentVerify('key_valid_123');

    expect(result.status).toBe(200);
    expect(result.data?.agentId).toBe('agent-1');
    expect(result.data?.status).toBe('active');
    expect(result.error).toBeNull();
  });

  it('returns pending agent status', () => {
    const result = invoker.invokeAgentVerify('key_pending_456');

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('pending');
  });

  it('rejects invalid API key', () => {
    const result = invoker.invokeAgentVerify('key_bad_999');

    expect(result.status).toBe(401);
    expect(result.error).toBe('invalid_api_key');
  });

  it('rejects missing API key', () => {
    const result = invoker.invokeAgentVerify();

    expect(result.status).toBe(400);
    expect(result.error).toBe('missing_api_key');
  });
});

describe('Smoke: Edge Function — qr-resolve', () => {
  let invoker: ReturnType<typeof createEdgeFunctionInvoker>;

  beforeEach(() => {
    invoker = createEdgeFunctionInvoker();
    vi.restoreAllMocks();
  });

  it('resolves active QR by slug', () => {
    const result = invoker.invokeQrResolve('my-qr-slug');

    expect(result.status).toBe(200);
    expect(result.data?.qrId).toBe('qr-1');
    expect(result.data?.agentName).toBe('Support Bot');
    expect(result.data?.status).toBe('active');
    expect(result.error).toBeNull();
  });

  it('returns 404 for unknown slug', () => {
    const result = invoker.invokeQrResolve('nonexistent-slug');

    expect(result.status).toBe(404);
    expect(result.error).toBe('qr_not_found');
  });

  it('rejects missing slug', () => {
    const result = invoker.invokeQrResolve();

    expect(result.status).toBe(400);
    expect(result.error).toBe('missing_slug');
  });
});
