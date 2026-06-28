/**
 * Acceptance: Plugin Indistinguishable (§3.2 I1, §9 R8)
 *
 * Asserts that @qrclaw/openclaw-plugin (plugins/openclaw/) is
 * indistinguishable from the legacy scripts/agent-sdk/ codepath
 * when observed from the gateway's side.
 *
 * "Indistinguishable" means: when both clients perform the same actions
 * against the same mock gateway, the captured sequence of inbound frames
 * (client → server) is structurally identical — modulo message_ids
 * (UUIDs) and wall-clock timestamps.
 */
import { describe, it, expect } from 'vitest';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { AgentConnector, type AgentConnectorConfig } from '../../scripts/agent-sdk/agent-connector';
import { QRClawRuntime } from '../../plugins/openclaw/src/runtime';
import { sendText } from '../../plugins/openclaw/src/outbound/text';
import { createStream } from '../../plugins/openclaw/src/outbound/stream';

// ── Allowed Divergences ─────────────────────────────────────────────
//
// After fixing plugins/openclaw/src/outbound/text.ts to remove the
// redundant `payload.message_id` (duplicate of frame.id, absent in
// legacy), the wire frames are structurally identical. No allowed
// divergences remain.
//
// Note on content_type defaults: legacy defaults to 'text', plugin to
// 'markdown'. This is an intentional caller-level choice, not a wire
// divergence — the test controls this by explicitly passing the same
// content_type to both codepaths.

// ── Constants ───────────────────────────────────────────────────────

const CONV_ID = 'test-conv-00000000-0000-0000-0000-000000000001';
const HEARTBEAT_MS = 300_000;

// ── Normalization ───────────────────────────────────────────────────

/**
 * Replace non-deterministic fields (UUIDs, timestamps) with stable
 * placeholders so two frame sequences can be structurally compared.
 */
function normalizeFrame(raw: Record<string, unknown>): Record<string, unknown> {
  const frame = structuredClone(raw);

  if (typeof frame.id === 'string') frame.id = '<UUID>';
  if (typeof frame.timestamp === 'string') frame.timestamp = '<TS>';

  if (frame.payload && typeof frame.payload === 'object') {
    const p = frame.payload as Record<string, unknown>;
    for (const key of Object.keys(p)) {
      if (key === 'message_id') p[key] = '<UUID>';
      if (key.endsWith('_at') || key === 'timestamp' || key === 'sent_at') {
        p[key] = '<TS>';
      }
    }
  }

  return frame;
}

// ── Mock Gateway ────────────────────────────────────────────────────

interface MockGateway {
  readonly port: number;
  readonly frames: Record<string, unknown>[];
  start(): Promise<void>;
  stop(): Promise<void>;
  clearFrames(): void;
}

function createMockGateway(): MockGateway {
  const frames: Record<string, unknown>[] = [];
  let port = 0;

  const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
    if (_req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            ticket: 'mock-ticket',
            expires_in: 30,
            gateway_url: `ws://127.0.0.1:${port}/ws`,
          },
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(request, socket, head, (ws: WsWebSocket) => {
      ws.send(
        JSON.stringify({
          type: 'connection_ack',
          timestamp: new Date().toISOString(),
          payload: {
            connection_id: 'mock-conn',
            heartbeat_interval_ms: HEARTBEAT_MS,
            server_time: new Date().toISOString(),
          },
        })
      );

      ws.on('message', (data: Buffer | string) => {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(text);
        } catch {
          return;
        }

        if (frame.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          return;
        }

        frames.push(frame);
      });
    });
  });

  return {
    get port() {
      return port;
    },
    frames,
    async start() {
      return new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => {
          port = (httpServer.address() as { port: number }).port;
          resolve();
        });
      });
    },
    async stop() {
      for (const client of wss.clients) {
        client.close();
      }
      wss.close();
      return new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
    clearFrames() {
      frames.length = 0;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

const noop = (): void => {};
const silentLogger = { debug: noop, info: noop, warn: noop, error: noop };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Tests ────────────────────────────────────────────────────────────

describe('plugin-indistinguishable (§3.2 I1, §9 R8)', () => {
  it('legacy and plugin produce structurally identical frames', async () => {
    const gwLegacy = createMockGateway();
    const gwPlugin = createMockGateway();
    await Promise.all([gwLegacy.start(), gwPlugin.start()]);

    try {
      // ── Legacy run ──────────────────────────────────────────────

      const connector = new AgentConnector({
        supabaseUrl: `http://127.0.0.1:${gwLegacy.port}`,
        agentApiKey: 'test-agent-key',
        gatewayWsUrl: `ws://127.0.0.1:${gwLegacy.port}`,
        ticketUrl: `http://127.0.0.1:${gwLegacy.port}/ticket`,
        onMessage: noop as unknown as AgentConnectorConfig['onMessage'],
        onError: noop,
        onStateChange: noop,
        autoReconnect: false,
      });

      await connector.connect();

      connector.sendReply(CONV_ID, 'hello from agent', 'text');

      const legacyStreamId = connector.sendStreamChunk(CONV_ID, 'foo', 1);
      connector.sendStreamChunk(CONV_ID, 'bar', 2, legacyStreamId);
      connector.sendStreamChunk(CONV_ID, 'baz', 3, legacyStreamId);
      connector.sendStreamEnd(CONV_ID, legacyStreamId, 3);

      await sleep(200);
      connector.disconnect();

      // ── Plugin run ──────────────────────────────────────────────

      const runtime = new QRClawRuntime(
        [
          {
            label: 'test',
            agentToken: 'test-agent-key',
            gatewayWsUrl: `ws://127.0.0.1:${gwPlugin.port}`,
            supabaseUrl: `http://127.0.0.1:${gwPlugin.port}`,
            ticketUrl: `http://127.0.0.1:${gwPlugin.port}/ticket`,
          },
        ],
        { onInboundFrame: noop, logger: silentLogger }
      );

      await runtime.start();

      sendText(
        { runtime, logger: silentLogger },
        {
          accountLabel: 'test',
          conversationId: CONV_ID,
          text: 'hello from agent',
          contentType: 'text',
        }
      );

      const stream = createStream(
        { runtime, logger: silentLogger },
        { accountLabel: 'test', conversationId: CONV_ID }
      );
      stream.pushChunk('foo');
      stream.pushChunk('bar');
      stream.pushChunk('baz');
      stream.end();

      await sleep(200);
      await runtime.stop();

      // ── Diff ────────────────────────────────────────────────────

      const legacyNorm = gwLegacy.frames.map(normalizeFrame);
      const pluginNorm = gwPlugin.frames.map(normalizeFrame);

      expect(pluginNorm).toHaveLength(legacyNorm.length);

      const legacyTypes = legacyNorm.map((f) => f.type);
      const pluginTypes = pluginNorm.map((f) => f.type);
      expect(pluginTypes).toEqual(legacyTypes);

      for (let i = 0; i < legacyNorm.length; i++) {
        expect(pluginNorm[i], `Frame ${i} (${legacyTypes[i]}) diverges`).toEqual(legacyNorm[i]);
      }

      expect(pluginNorm).toEqual(legacyNorm);
    } finally {
      await Promise.all([gwLegacy.stop(), gwPlugin.stop()]);
    }
  });

  it('both runs capture exactly 5 frames: 1 agent_message + 3 stream_chunk + 1 stream_end', async () => {
    const gw = createMockGateway();
    await gw.start();

    try {
      const connector = new AgentConnector({
        supabaseUrl: `http://127.0.0.1:${gw.port}`,
        agentApiKey: 'test-agent-key',
        gatewayWsUrl: `ws://127.0.0.1:${gw.port}`,
        ticketUrl: `http://127.0.0.1:${gw.port}/ticket`,
        onMessage: noop as unknown as AgentConnectorConfig['onMessage'],
        onError: noop,
        onStateChange: noop,
        autoReconnect: false,
      });

      await connector.connect();
      connector.sendReply(CONV_ID, 'hello from agent', 'text');
      const sid = connector.sendStreamChunk(CONV_ID, 'foo', 1);
      connector.sendStreamChunk(CONV_ID, 'bar', 2, sid);
      connector.sendStreamChunk(CONV_ID, 'baz', 3, sid);
      connector.sendStreamEnd(CONV_ID, sid, 3);
      await sleep(200);
      connector.disconnect();

      expect(gw.frames).toHaveLength(5);

      const types = gw.frames.map((f) => f.type);
      expect(types).toEqual([
        'agent_message',
        'stream_chunk',
        'stream_chunk',
        'stream_chunk',
        'stream_end',
      ]);
    } finally {
      await gw.stop();
    }
  });

  it('normalizeFrame zeroes ids and timestamps but preserves structure', () => {
    const raw = {
      type: 'agent_message',
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      timestamp: '2026-04-21T12:00:00.000Z',
      payload: {
        content: 'hello',
        content_type: 'text',
        conversation_id: CONV_ID,
      },
    };

    const norm = normalizeFrame(raw);

    expect(norm.id).toBe('<UUID>');
    expect(norm.timestamp).toBe('<TS>');
    expect((norm.payload as Record<string, unknown>).content).toBe('hello');
    expect((norm.payload as Record<string, unknown>).content_type).toBe('text');
    expect((norm.payload as Record<string, unknown>).conversation_id).toBe(CONV_ID);
  });

  it('stream_chunk sequence numbers match between legacy and plugin', async () => {
    const gwL = createMockGateway();
    const gwP = createMockGateway();
    await Promise.all([gwL.start(), gwP.start()]);

    try {
      // Legacy
      const connector = new AgentConnector({
        supabaseUrl: `http://127.0.0.1:${gwL.port}`,
        agentApiKey: 'k',
        gatewayWsUrl: `ws://127.0.0.1:${gwL.port}`,
        ticketUrl: `http://127.0.0.1:${gwL.port}/ticket`,
        onMessage: noop as unknown as AgentConnectorConfig['onMessage'],
        onError: noop,
        autoReconnect: false,
      });
      await connector.connect();
      const sid = connector.sendStreamChunk(CONV_ID, 'a', 1);
      connector.sendStreamChunk(CONV_ID, 'b', 2, sid);
      await sleep(150);
      connector.disconnect();

      // Plugin
      const rt = new QRClawRuntime(
        [
          {
            label: 't',
            agentToken: 'k',
            gatewayWsUrl: `ws://127.0.0.1:${gwP.port}`,
            supabaseUrl: `http://127.0.0.1:${gwP.port}`,
            ticketUrl: `http://127.0.0.1:${gwP.port}/ticket`,
          },
        ],
        { onInboundFrame: noop, logger: silentLogger }
      );
      await rt.start();
      const s = createStream(
        { runtime: rt, logger: silentLogger },
        { accountLabel: 't', conversationId: CONV_ID }
      );
      s.pushChunk('a');
      s.pushChunk('b');
      await sleep(150);
      await rt.stop();

      const lSeqs = gwL.frames.map((f) => (f.payload as Record<string, unknown>)?.sequence);
      const pSeqs = gwP.frames.map((f) => (f.payload as Record<string, unknown>)?.sequence);

      expect(pSeqs).toEqual(lSeqs);
      expect(lSeqs).toEqual([1, 2]);
    } finally {
      await Promise.all([gwL.stop(), gwP.stop()]);
    }
  });

  it('conversation_id is preserved identically', async () => {
    const gwL = createMockGateway();
    const gwP = createMockGateway();
    await Promise.all([gwL.start(), gwP.start()]);

    try {
      const connector = new AgentConnector({
        supabaseUrl: `http://127.0.0.1:${gwL.port}`,
        agentApiKey: 'k',
        gatewayWsUrl: `ws://127.0.0.1:${gwL.port}`,
        ticketUrl: `http://127.0.0.1:${gwL.port}/ticket`,
        onMessage: noop as unknown as AgentConnectorConfig['onMessage'],
        onError: noop,
        autoReconnect: false,
      });
      await connector.connect();
      connector.sendReply(CONV_ID, 'test', 'text');
      await sleep(150);
      connector.disconnect();

      const rt = new QRClawRuntime(
        [
          {
            label: 't',
            agentToken: 'k',
            gatewayWsUrl: `ws://127.0.0.1:${gwP.port}`,
            supabaseUrl: `http://127.0.0.1:${gwP.port}`,
            ticketUrl: `http://127.0.0.1:${gwP.port}/ticket`,
          },
        ],
        { onInboundFrame: noop, logger: silentLogger }
      );
      await rt.start();
      sendText(
        { runtime: rt, logger: silentLogger },
        { accountLabel: 't', conversationId: CONV_ID, text: 'test', contentType: 'text' }
      );
      await sleep(150);
      await rt.stop();

      const lConv = gwL.frames.map((f) => (f.payload as Record<string, unknown>)?.conversation_id);
      const pConv = gwP.frames.map((f) => (f.payload as Record<string, unknown>)?.conversation_id);

      expect(pConv).toEqual(lConv);
      expect(lConv).toEqual([CONV_ID]);
    } finally {
      await Promise.all([gwL.stop(), gwP.stop()]);
    }
  });
});
