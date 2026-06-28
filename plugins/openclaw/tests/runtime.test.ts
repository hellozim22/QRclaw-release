import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { QRClawRuntime } from '../src/runtime.js';
import type { ResolvedQRClawAccount } from '../src/accounts.js';
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

describe('QRClawRuntime', () => {
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
            connection_id: `conn-${serverClients.length}`,
            heartbeat_interval_ms: 30000,
            server_time: new Date().toISOString(),
          },
        })
      );
    });

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

  function makeAccounts(): ResolvedQRClawAccount[] {
    return [
      {
        label: 'account-a',
        agentToken: 'qak_token_a',
        gatewayWsUrl: `ws://127.0.0.1:${port}`,
        supabaseUrl: 'https://xxx.supabase.co',
      },
      {
        label: 'account-b',
        agentToken: 'qak_token_b',
        gatewayWsUrl: `ws://127.0.0.1:${port}`,
        supabaseUrl: 'https://xxx.supabase.co',
      },
    ];
  }

  it('two accounts create two distinct QRClawConnection instances', async () => {
    const inboundFrames: Array<{ accountLabel: string; frame: ServerFrame }> = [];
    const runtime = new QRClawRuntime(makeAccounts(), {
      onInboundFrame: (accountLabel, frame) => {
        inboundFrames.push({ accountLabel, frame });
      },
    });

    await runtime.start();

    const connA = runtime.connection('account-a');
    const connB = runtime.connection('account-b');

    expect(connA).toBeDefined();
    expect(connB).toBeDefined();
    expect(connA).not.toBe(connB);

    await runtime.stop();
  });

  it('start() connects both; stop() disconnects both', async () => {
    const runtime = new QRClawRuntime(makeAccounts(), {
      onInboundFrame: vi.fn(),
    });

    await runtime.start();

    const connA = runtime.connection('account-a');
    const connB = runtime.connection('account-b');

    expect(connA?.state).toBe('connected');
    expect(connB?.state).toBe('connected');

    await runtime.stop();

    expect(connA?.state).toBe('disconnected');
    expect(connB?.state).toBe('disconnected');
  });

  it("inbound frame on account A does NOT appear on account B's callback", async () => {
    const inboundFrames: Array<{ accountLabel: string; frame: ServerFrame }> = [];
    const runtime = new QRClawRuntime(makeAccounts(), {
      onInboundFrame: (accountLabel, frame) => {
        inboundFrames.push({ accountLabel, frame });
      },
    });

    await runtime.start();

    await new Promise((r) => setTimeout(r, 100));

    const messageForA = {
      type: 'message',
      id: 'msg-for-a',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello account a',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-a',
      },
    };

    serverClients[0].send(JSON.stringify(messageForA));

    await new Promise((r) => setTimeout(r, 200));

    const framesForA = inboundFrames.filter((f) => f.accountLabel === 'account-a');
    const framesForB = inboundFrames.filter((f) => f.accountLabel === 'account-b');

    expect(framesForA.length).toBeGreaterThanOrEqual(1);
    expect(framesForB).toHaveLength(0);

    await runtime.stop();
  });

  it('frames carry accountLabel when dispatched via runtime onInboundFrame', async () => {
    const inboundFrames: Array<{ accountLabel: string; frame: ServerFrame }> = [];
    const runtime = new QRClawRuntime(makeAccounts(), {
      onInboundFrame: (accountLabel, frame) => {
        inboundFrames.push({ accountLabel, frame });
      },
    });

    await runtime.start();
    await new Promise((r) => setTimeout(r, 100));

    const messageFrame = {
      type: 'message',
      id: 'msg-labeled',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'test',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-x',
      },
    };

    serverClients[0].send(JSON.stringify(messageFrame));
    await new Promise((r) => setTimeout(r, 200));

    expect(inboundFrames.length).toBeGreaterThanOrEqual(1);
    const dispatched = inboundFrames[0];
    expect(dispatched.accountLabel).toBeDefined();
    expect(typeof dispatched.accountLabel).toBe('string');

    await runtime.stop();
  });

  it('accounts() returns the resolved accounts list', () => {
    const accts = makeAccounts();
    const runtime = new QRClawRuntime(accts, {
      onInboundFrame: vi.fn(),
    });

    expect(runtime.accounts()).toEqual(accts);
  });

  it('connection() returns undefined for unknown label', () => {
    const runtime = new QRClawRuntime(makeAccounts(), {
      onInboundFrame: vi.fn(),
    });

    expect(runtime.connection('nonexistent')).toBeUndefined();
  });
});
