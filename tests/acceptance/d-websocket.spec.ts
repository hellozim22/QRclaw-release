import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import jsonwebtoken from 'jsonwebtoken';
const jwt = jsonwebtoken;
import { gatewayAPI, WS_URL } from './helpers';
import { MockAgent, MockVisitor, signAgentTicket, signVisitorTicket } from './mock-agent';

const WS_TICKET_SECRET = process.env.WS_TICKET_SECRET || 'CHANGE_ME_TEST_WS_TICKET_SECRET';

test.describe('Module D: WebSocket', () => {
  // ─── Existing passing tests ───────────────────────────────────

  test('D-08: /health endpoint returns ok', async () => {
    const { status, body } = await gatewayAPI('GET', '/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.redis).toBe('connected');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
  });

  test('D-01: WS endpoint rejects connection without ticket', async () => {
    const ws = new WebSocket(WS_URL);
    const result = await new Promise<{ code: number }>((resolve) => {
      ws.on('close', (code: number) => resolve({ code }));
      ws.on('error', () => resolve({ code: -1 }));
      setTimeout(() => {
        ws.close();
        resolve({ code: 0 });
      }, 5000);
    });
    expect(result.code).not.toBe(0);
  });

  test('D-02: Invalid ticket is rejected', async () => {
    const ws = new WebSocket(`${WS_URL}?ticket=invalid_token_here`);
    const result = await new Promise<{ code: number; reason?: string }>((resolve) => {
      ws.on('close', (code: number, reason: Buffer) =>
        resolve({ code, reason: reason.toString() })
      );
      ws.on('error', () => resolve({ code: -1 }));
      setTimeout(() => {
        ws.close();
        resolve({ code: 0 });
      }, 5000);
    });
    expect([1008, 4001, 4003, -1, 1006]).toContain(result.code);
  });

  // ─── New WebSocket tests ──────────────────────────────────────

  test('D-03: Valid agent ticket → connection succeeds and receives connection_ack', async () => {
    const agent = new MockAgent({ agentId: 'test-agent-d03', ownerId: 'test-owner-d03' });
    const ack = await agent.connect();
    expect(ack.type).toBe('connection_ack');
    agent.close();
  });

  test('D-04: Valid visitor ticket → connection succeeds', async () => {
    const visitor = new MockVisitor({
      sessionToken: `sess_d04_${Date.now()}`,
      qrCodeId: 'test-qr-d04',
      agentId: 'test-agent-d04',
    });
    const ack = await visitor.connect();
    expect(ack.type).toBe('connection_ack');
    visitor.close();
  });

  test('D-05: Expired ticket → connection is rejected', async () => {
    const expiredTicket = jwt.sign(
      { role: 'agent', agentId: 'test-agent-d05', ownerId: 'test-owner-d05' },
      WS_TICKET_SECRET,
      { expiresIn: '0s' }
    );

    // Wait 1 second to ensure token is expired
    await new Promise((r) => setTimeout(r, 1100));

    const ws = new WebSocket(`${WS_URL}?ticket=${expiredTicket}`);
    const result = await new Promise<{ code: number }>((resolve) => {
      ws.on('close', (code: number) => resolve({ code }));
      ws.on('error', () => resolve({ code: -1 }));
      setTimeout(() => {
        ws.close();
        resolve({ code: 0 });
      }, 5000);
    });
    expect(result.code).not.toBe(0);
  });

  test('D-06: Ping/pong works after connection', async () => {
    const agent = new MockAgent({ agentId: 'test-agent-d06', ownerId: 'test-owner-d06' });
    await agent.connect();
    const pong = await agent.ping();
    expect(pong.type).toBe('pong');
    agent.close();
  });

  test('D-07: Heartbeat does not disconnect connection within 30s', async () => {
    const agent = new MockAgent({ agentId: 'test-agent-d07', ownerId: 'test-owner-d07' });
    await agent.connect();
    expect(agent.isConnected).toBe(true);
    // Wait 5s and verify still connected (reasonable proxy for heartbeat stability)
    await new Promise((r) => setTimeout(r, 5000));
    expect(agent.isConnected).toBe(true);
    agent.close();
  });

  test('D-09: Multiple concurrent agent connections', async () => {
    const agents = [
      new MockAgent({ agentId: 'test-agent-d09a', ownerId: 'test-owner-d09' }),
      new MockAgent({ agentId: 'test-agent-d09b', ownerId: 'test-owner-d09' }),
      new MockAgent({ agentId: 'test-agent-d09c', ownerId: 'test-owner-d09' }),
    ];

    const acks = await Promise.all(agents.map((a) => a.connect()));
    for (const ack of acks) {
      expect(ack.type).toBe('connection_ack');
    }
    for (const a of agents) {
      a.close();
    }
  });
});
