import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { QRClawConnection, type ConnectionState } from '../src/client.js';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = require('net').createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function createMockTicketServer(port: number) {
  const ticketUrl = `http://127.0.0.1:${port}/ticket`;
  return { ticketUrl };
}

describe('QRClawConnection', () => {
  let wss: WebSocketServer;
  let port: number;
  let serverClients: WsWebSocket[];

  beforeEach(async () => {
    port = await getFreePort();
    wss = new WebSocketServer({ port });
    serverClients = [];

    wss.on('connection', (ws) => {
      serverClients.push(ws);
      ws.send(
        JSON.stringify({
          type: 'connection_ack',
          timestamp: new Date().toISOString(),
          payload: {
            connection_id: 'test-conn-id',
            heartbeat_interval_ms: 30000,
            server_time: new Date().toISOString(),
          },
        })
      );
    });
  });

  afterEach(async () => {
    for (const ws of serverClients) {
      ws.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  it('happy path: connect → ticket fetched → WS open → state transitions', async () => {
    const states: ConnectionState[] = [];
    const onStateChange = (state: ConnectionState) => states.push(state);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            ticket: 'mock-ticket-abc',
            expires_in: 30,
            gateway_url: `ws://127.0.0.1:${port}`,
          },
        }),
      })
    );

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      onInboundFrame: vi.fn(),
      onStateChange,
    });

    await conn.connect();
    expect(conn.state).toBe('connected');
    expect(states).toContain('connecting');
    expect(states).toContain('connected');

    conn.disconnect();
    expect(conn.state).toBe('disconnected');
  });

  it('auth fail: ticket endpoint 401 → onError called, state stays disconnected', async () => {
    const errors: Error[] = [];
    const onError = (err: Error) => errors.push(err);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
    );

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'bad_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      autoReconnect: false,
      onInboundFrame: vi.fn(),
      onError,
    });

    await conn.connect();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/401/);
    expect(conn.state).toBe('disconnected');
  });

  it('inbound frame fan-out: server sends a MessageFrame, onInboundFrame called', async () => {
    const frames: ServerFrame[] = [];
    const onInboundFrame = (frame: ServerFrame) => frames.push(frame);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            ticket: 'mock-ticket',
            expires_in: 30,
            gateway_url: `ws://127.0.0.1:${port}`,
          },
        }),
      })
    );

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      onInboundFrame,
    });

    await conn.connect();

    const messageFrame = {
      type: 'message',
      id: 'msg-001',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello from visitor',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-123',
      },
    };

    serverClients[0].send(JSON.stringify(messageFrame));

    await new Promise((r) => setTimeout(r, 100));

    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('message');
    expect((frames[0] as any).id).toBe('msg-001');

    conn.disconnect();
  });

  it('auto-reconnect: server closes → client re-fetches ticket and reconnects', async () => {
    let fetchCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({
            data: {
              ticket: `mock-ticket-${fetchCount}`,
              expires_in: 30,
              gateway_url: `ws://127.0.0.1:${port}`,
            },
          }),
        };
      })
    );

    const states: ConnectionState[] = [];
    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      autoReconnect: true,
      reconnectDelayMs: 50,
      maxReconnectAttempts: 3,
      onInboundFrame: vi.fn(),
      onStateChange: (s) => states.push(s),
    });

    await conn.connect();
    expect(conn.state).toBe('connected');

    serverClients[0].close(1000);

    await new Promise((r) => setTimeout(r, 500));

    expect(fetchCount).toBeGreaterThanOrEqual(2);
    expect(states).toContain('reconnecting');

    conn.disconnect();
  });

  it('stops reconnecting after maxReconnectAttempts', async () => {
    let fetchCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return {
            ok: true,
            json: async () => ({
              data: {
                ticket: 'mock-ticket-1',
                expires_in: 30,
                gateway_url: `ws://127.0.0.1:${port}`,
              },
            }),
          };
        }
        return {
          ok: false,
          status: 500,
          text: async () => 'Server Error',
        };
      })
    );

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      autoReconnect: true,
      reconnectDelayMs: 20,
      maxReconnectAttempts: 2,
      onInboundFrame: vi.fn(),
      onError: vi.fn(),
    });

    await conn.connect();
    expect(conn.state).toBe('connected');

    serverClients[0].close(1000);

    await new Promise((r) => setTimeout(r, 500));

    expect(conn.state).toBe('disconnected');
    conn.disconnect();
  });

  it('send(frame): client-originated frame arrives at server verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            ticket: 'mock-ticket',
            expires_in: 30,
            gateway_url: `ws://127.0.0.1:${port}`,
          },
        }),
      })
    );

    const receivedMessages: string[] = [];
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        receivedMessages.push(data.toString());
      });
    });

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'default',
      onInboundFrame: vi.fn(),
    });

    await conn.connect();

    const frame = {
      type: 'agent_message' as const,
      id: 'msg-out-001',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello from agent',
        content_type: 'text' as const,
        conversation_id: 'conv-123',
      },
    };

    conn.send(frame);

    await new Promise((r) => setTimeout(r, 100));

    const parsed = receivedMessages.map((m) => JSON.parse(m));
    const agentMsg = parsed.find((p) => p.type === 'agent_message');
    expect(agentMsg).toBeDefined();
    expect(agentMsg.payload.content).toBe('hello from agent');
    expect(agentMsg.id).toBe('msg-out-001');

    conn.disconnect();
  });

  it('accountLabel is accessible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            ticket: 'mock-ticket',
            expires_in: 30,
            gateway_url: `ws://127.0.0.1:${port}`,
          },
        }),
      })
    );

    const conn = new QRClawConnection({
      supabaseUrl: 'https://xxx.supabase.co',
      agentApiKey: 'qak_test_key',
      gatewayWsUrl: `ws://127.0.0.1:${port}`,
      accountLabel: 'my-custom-label',
      onInboundFrame: vi.fn(),
    });

    expect(conn.accountLabel).toBe('my-custom-label');
    conn.disconnect();
  });
});
