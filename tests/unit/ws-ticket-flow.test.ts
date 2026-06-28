import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── WSClient ticket support ─────────────────────────────────────────────────

describe('WSClient ticket support', () => {
  let originalWebSocket: typeof WebSocket;
  let mockWsInstances: Array<{ url: string; close: ReturnType<typeof vi.fn> }>;

  beforeEach(() => {
    mockWsInstances = [];
    originalWebSocket = globalThis.WebSocket;

    // Mock WebSocket as a class constructor
    const MockWebSocket = vi.fn(function (this: Record<string, unknown>, url: string) {
      this.url = url;
      this.readyState = 1;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.send = vi.fn();
      this.close = vi.fn();
      mockWsInstances.push(this as unknown as { url: string; close: ReturnType<typeof vi.fn> });
    }) as unknown as typeof WebSocket;

    (MockWebSocket as unknown as Record<string, number>).OPEN = 1;
    (MockWebSocket as unknown as Record<string, number>).CLOSED = 3;
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('should NOT include ticket in URL — sends auth frame instead (CRITICAL-1)', async () => {
    const { WSClient } = await import('@/lib/ws/client');

    const client = new WSClient({
      gatewayUrl: 'ws://localhost:3001',
      agentId: 'agent-123',
      ticket: 'jwt-ticket-abc',
      role: 'visitor',
    });

    client.connect();

    expect(mockWsInstances).toHaveLength(1);
    const wsUrl = new URL(mockWsInstances[0].url);
    // Ticket must NOT be in URL (OWASP security fix)
    expect(wsUrl.searchParams.has('ticket')).toBe(false);
    // role and agent_id are non-sensitive, still in URL
    expect(wsUrl.searchParams.get('role')).toBe('visitor');
    expect(wsUrl.searchParams.get('agent_id')).toBe('agent-123');

    // Trigger onopen to send auth frame
    const wsInstance = mockWsInstances[0] as unknown as Record<string, unknown>;
    if (typeof wsInstance.onopen === 'function') {
      wsInstance.onopen(new Event('open'));
    }

    // Verify auth frame was sent via ws.send()
    const sendFn = wsInstance.send as ReturnType<typeof vi.fn>;
    expect(sendFn).toHaveBeenCalledTimes(1);
    const authFrame = JSON.parse(sendFn.mock.calls[0][0] as string);
    expect(authFrame.type).toBe('auth');
    expect(authFrame.payload.ticket).toBe('jwt-ticket-abc');

    client.disconnect();
  });

  it('should NOT include sessionToken in URL — sends via auth frame (CRITICAL-1)', async () => {
    const { WSClient } = await import('@/lib/ws/client');

    const client = new WSClient({
      gatewayUrl: 'ws://localhost:3001',
      agentId: 'agent-123',
      ticket: 'jwt-ticket-abc',
      role: 'visitor',
      sessionToken: 'vis_12345_abcdef',
    });

    client.connect();

    const wsUrl = new URL(mockWsInstances[0].url);
    // Token must NOT be in URL
    expect(wsUrl.searchParams.has('token')).toBe(false);

    // Trigger onopen to send auth frame
    const wsInstance = mockWsInstances[0] as unknown as Record<string, unknown>;
    if (typeof wsInstance.onopen === 'function') {
      wsInstance.onopen(new Event('open'));
    }

    const sendFn = wsInstance.send as ReturnType<typeof vi.fn>;
    const authFrame = JSON.parse(sendFn.mock.calls[0][0] as string);
    expect(authFrame.payload.session_token).toBe('vis_12345_abcdef');

    client.disconnect();
  });

  it('should work without ticket for backward compatibility', async () => {
    const { WSClient } = await import('@/lib/ws/client');

    const client = new WSClient({
      gatewayUrl: 'ws://localhost:3001',
      agentId: 'agent-123',
    });

    client.connect();

    const wsUrl = new URL(mockWsInstances[0].url);
    expect(wsUrl.searchParams.has('ticket')).toBe(false);
    expect(wsUrl.searchParams.has('role')).toBe(false);
    expect(wsUrl.searchParams.get('agent_id')).toBe('agent-123');

    client.disconnect();
  });
});

// ─── fetchVisitorTicket ──────────────────────────────────────────────────────

describe('fetchVisitorTicket', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should POST to gateway with qr_code_id and return ticket + session_token', async () => {
    const mockResponse = {
      data: {
        ticket: 'jwt-ticket-xyz',
        session_token: 'vis_999_abc',
        expires_in: 30,
        gateway_url: 'ws://localhost:3001/ws',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { fetchVisitorTicket } = await import('@/lib/ws/ticket');

    const result = await fetchVisitorTicket('qr-code-001', 'https://gateway-test.qrclaw.ai');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://gateway-test.qrclaw.ai/api/visitor-ws-ticket',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code_id: 'qr-code-001' }),
      })
    );

    expect(result.ticket).toBe('jwt-ticket-xyz');
    expect(result.sessionToken).toBe('vis_999_abc');
    expect(result.gatewayWsUrl).toBe('ws://localhost:3001/ws');
  });

  it('should throw on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'QR code not found' } }),
    });

    const { fetchVisitorTicket } = await import('@/lib/ws/ticket');

    await expect(fetchVisitorTicket('bad-id', 'https://gateway-test.qrclaw.ai')).rejects.toThrow(
      'QR code not found'
    );
  });

  it('should throw on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { fetchVisitorTicket } = await import('@/lib/ws/ticket');

    await expect(fetchVisitorTicket('qr-001', 'https://gateway-test.qrclaw.ai')).rejects.toThrow(
      'Network error'
    );
  });
});

// ─── Message history decryption regression ───────────────────────────────────

/**
 * M3-T6: the gateway no longer reads `encryption_keys` at all — the
 * `decrypted-messages` Edge Function owns that path. The historical column
 * rename regression test moves with it and now guards the Edge Function
 * source instead. We also assert the gateway route stays column-free so the
 * decrypt path does not sneak back into Node.
 */
describe('messages history decryption key field (post-M3-T6)', () => {
  it('unified Edge Function still selects key_data_encrypted (not the retired encrypted_dek)', async () => {
    const source = await import('fs/promises');
    const file = await source.readFile(
      require('path').resolve(__dirname, '../../supabase/functions/decrypted-messages/index.ts'),
      'utf8'
    );
    expect(file).toContain("select('key_id, key_data_encrypted')");
    expect(file).not.toContain("select('key_id, encrypted_dek')");
  });

  it('gateway messages route is a thin forwarder and no longer touches encryption_keys', async () => {
    const source = await import('fs/promises');
    const file = await source.readFile(
      require('path').resolve(__dirname, '../../gateway/src/routes/messages.ts'),
      'utf8'
    );
    expect(file).toContain('callDecryptedMessages');
    expect(file).not.toMatch(/from\s*\(\s*['"]encryption_keys['"]\s*\)/);
  });
});
