/**
 * Unit tests for Gateway ticket route helpers and visitor route.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

describe('ticket route helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PORT = '3001';
    process.env.WS_TICKET_SECRET = 'test-ws-ticket-secret';
    process.env.SUPABASE_URL = 'https://zyxqadubhwrnsoujiyir.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    delete process.env.GATEWAY_WS_URL;
    delete process.env.GATEWAY_BASE_URL;
  });

  it('returns explicit GATEWAY_WS_URL when configured', async () => {
    process.env.GATEWAY_WS_URL = 'wss://gateway-test.qrclaw.ai/ws';
    const { getGatewayWsUrl } = await import('../../../gateway/src/routes/ticket.js');
    expect(getGatewayWsUrl()).toBe('wss://gateway-test.qrclaw.ai/ws');
  });

  it('derives websocket URL from GATEWAY_BASE_URL', async () => {
    process.env.GATEWAY_BASE_URL = 'https://gateway-test.qrclaw.ai/';
    const { getGatewayWsUrl } = await import('../../../gateway/src/routes/ticket.js');
    expect(getGatewayWsUrl()).toBe('wss://gateway-test.qrclaw.ai/ws');
  });

  it('falls back to localhost websocket URL', async () => {
    const { getGatewayWsUrl } = await import('../../../gateway/src/routes/ticket.js');
    expect(getGatewayWsUrl()).toBe('ws://localhost:3001/ws');
  });
});

describe('ticketRouter visitor route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PORT = '3001';
    process.env.WS_TICKET_SECRET = 'test-ws-ticket-secret';
    process.env.SUPABASE_URL = 'https://zyxqadubhwrnsoujiyir.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.GATEWAY_WS_URL = 'ws://localhost:3001/ws';
  });

  it('returns visitor ticket with websocket url on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '34206699-e2e5-4b9e-b779-1b5a18ee59cd',
          agent_id: '5619742f-130d-4f1c-a27e-77da5bba7439',
          status: 'active',
        },
      ],
    });

    const { ticketRouter } = await import('../../../gateway/src/routes/ticket.js');
    const layer = ticketRouter.stack.find(
      (entry) => entry.route?.path === '/api/visitor-ws-ticket'
    );
    const stack = layer?.route?.stack;
    expect(stack).toHaveLength(2);
    const middlewareFn = stack![0].handle;
    const handlerFn = stack![1].handle;

    const req = {
      body: { qr_code_id: '34206699-e2e5-4b9e-b779-1b5a18ee59cd' },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await new Promise<void>((resolve, reject) => {
      middlewareFn(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });
    await handlerFn(req, res);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://zyxqadubhwrnsoujiyir.supabase.co/rest/v1/qrcodes?id=eq.34206699-e2e5-4b9e-b779-1b5a18ee59cd&select=id,agent_id,status&limit=1',
      expect.objectContaining({
        headers: {
          apikey: 'test-service-role-key',
          Authorization: 'Bearer test-service-role-key',
        },
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          session_token: expect.stringMatching(/^vis_/),
          expires_in: 30,
          gateway_url: 'ws://localhost:3001/ws',
        }),
      })
    );
  });
});
