import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';

vi.mock('../src/accounts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/accounts.js')>();
  return { ...actual };
});

vi.mock('../src/runtime.js', () => {
  const connections = new Map<string, { send: ReturnType<typeof vi.fn> }>();
  return {
    QRClawRuntime: vi.fn().mockImplementation((accounts: unknown[], deps: unknown) => {
      connections.clear();
      for (const a of accounts as Array<{ label: string }>) {
        connections.set(a.label, { send: vi.fn() });
      }
      return {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        connection: (label: string) => connections.get(label),
        accounts: () => accounts,
        __connections: connections,
      };
    }),
  };
});

vi.mock('../src/inbound.js', () => {
  const seenByAccount = new Map<string, Set<string>>();
  return {
    handleInboundFrame: vi.fn(),
    getLiveSeenSet: vi.fn((label: string) => {
      let s = seenByAccount.get(label);
      if (!s) {
        s = new Set();
        seenByAccount.set(label, s);
      }
      return s;
    }),
    _resetLiveDedup: vi.fn(() => {
      seenByAccount.clear();
    }),
  };
});

vi.mock('../src/agent-conversations-client.js', () => ({
  listConversations: vi
    .fn()
    .mockResolvedValue([{ conversation_id: 'conv-seeded-1', owned_by_me: true }]),
  AgentConversationsError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, msg: string) {
      super(msg);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('../src/outbound/text.js', () => ({
  sendText: vi.fn().mockReturnValue('msg-id-123'),
  QRClawOutboundError: class extends Error {
    code: string;
    constructor(opts: { code: string; message: string }) {
      super(opts.message);
      this.code = opts.code;
    }
  },
}));

vi.mock('../src/outbound/stream.js', () => ({
  createStream: vi.fn().mockReturnValue({
    messageId: 'stream-id-456',
    pushChunk: vi.fn(),
    end: vi.fn(),
    abort: vi.fn(),
  }),
}));

vi.mock('../src/history.js', () => ({
  replayHistory: vi.fn().mockResolvedValue({ replayed: 0, seen: new Set(), errors: [] }),
}));

import { createQRClawChannelPlugin } from '../src/channel.js';
import { QRClawRuntime } from '../src/runtime.js';
import { handleInboundFrame } from '../src/inbound.js';
import { sendText } from '../src/outbound/text.js';
import { createStream } from '../src/outbound/stream.js';
import { replayHistory } from '../src/history.js';

const TEST_CONFIG = {
  accounts: {
    default: {
      agentToken: 'qak_test_token_1',
      gatewayWsUrl: 'wss://gw.example.com/ws',
      supabaseUrl: 'https://xxx.supabase.co',
    },
    secondary: {
      agentToken: 'qak_test_token_2',
      gatewayWsUrl: 'wss://gw.example.com/ws',
      supabaseUrl: 'https://xxx.supabase.co',
    },
  },
  defaultAccount: 'default',
};

describe('QRClaw Channel Plugin', () => {
  let plugin: ReturnType<typeof createQRClawChannelPlugin>;
  let mockDispatchInbound: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchInbound = vi.fn();
    plugin = createQRClawChannelPlugin();
  });

  describe('plugin structure', () => {
    it('has required id and setup fields', () => {
      expect(plugin.id).toBe('qrclaw');
      expect(plugin.setup).toBeDefined();
      expect(plugin.setup.resolveAccount).toBeDefined();
      expect(plugin.setup.inspectAccount).toBeDefined();
    });
  });

  describe('on install / start', () => {
    it('resolves accounts and starts runtime', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      expect(QRClawRuntime).toHaveBeenCalledTimes(1);
      const runtimeInstance = (QRClawRuntime as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(runtimeInstance.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('inbound: visitor message', () => {
    it('dispatches visitor message frame through handleInboundFrame', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      const runtimeCall = (QRClawRuntime as ReturnType<typeof vi.fn>).mock.calls[0];
      const deps = runtimeCall[1];
      const onInbound = deps.onInboundFrame;

      const visitorFrame: ServerFrame = {
        type: 'message',
        id: 'msg-001',
        timestamp: new Date().toISOString(),
        payload: {
          content: 'Hello from visitor',
          content_type: 'text',
          sender_type: 'visitor',
          conversation_id: 'conv-123',
        },
      };

      onInbound('default', visitorFrame);

      expect(handleInboundFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchInbound: mockDispatchInbound,
        }),
        'default',
        visitorFrame
      );
    });
  });

  describe('outbound: text', () => {
    it('sends text via sendText with correct params', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      const messageId = lifecycle.sendText({
        accountLabel: 'default',
        conversationId: 'conv-123',
        text: 'Hello from agent',
      });

      expect(sendText).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: expect.anything() }),
        expect.objectContaining({
          accountLabel: 'default',
          conversationId: 'conv-123',
          text: 'Hello from agent',
        })
      );
      expect(messageId).toBe('msg-id-123');
    });
  });

  describe('outbound: stream', () => {
    it('creates stream controller with correct params', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      const controller = lifecycle.createStream({
        accountLabel: 'default',
        conversationId: 'conv-456',
      });

      expect(createStream).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: expect.anything() }),
        expect.objectContaining({
          accountLabel: 'default',
          conversationId: 'conv-456',
        })
      );
      expect(controller.messageId).toBe('stream-id-456');
      expect(typeof controller.pushChunk).toBe('function');
      expect(typeof controller.end).toBe('function');
    });
  });

  describe('on state → connected: replayHistory', () => {
    it('invokes replayHistory when connection becomes connected', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      const runtimeCall = (QRClawRuntime as ReturnType<typeof vi.fn>).mock.calls[0];
      const accounts = runtimeCall[0];
      const account = accounts.find((a: { label: string }) => a.label === 'default');

      await lifecycle.onConnectionStateChange('default', 'connected');

      expect(replayHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchInbound: mockDispatchInbound,
        }),
        expect.objectContaining({
          account,
          conversationIds: ['conv-seeded-1'],
          seen: expect.any(Set),
        })
      );
    });

    it('uses per-account seen set across multiple reconnects', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      await lifecycle.onConnectionStateChange('default', 'connected');
      const firstCall = (replayHistory as ReturnType<typeof vi.fn>).mock.calls[0];
      const firstSeen = firstCall[1].seen;

      firstSeen.add('msg-already-seen');

      await lifecycle.onConnectionStateChange('default', 'connected');
      const secondCall = (replayHistory as ReturnType<typeof vi.fn>).mock.calls[1];
      const secondSeen = secondCall[1].seen;

      expect(secondSeen).toBe(firstSeen);
      expect(secondSeen.has('msg-already-seen')).toBe(true);
    });

    it('does not call replayHistory when listConversations rejects', async () => {
      const { listConversations: listMock, AgentConversationsError } =
        await import('../src/agent-conversations-client.js');
      (listMock as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AgentConversationsError('internal_error', 500, 'boom')
      );
      const warn = vi.fn();

      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
      });

      await lifecycle.start();
      await lifecycle.onConnectionStateChange('default', 'connected');

      expect(replayHistory).not.toHaveBeenCalled();
      const joined = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(joined).toMatch(/list conversations|history/i);
    });

    it('skips replayHistory entirely when agent has zero conversations', async () => {
      const { listConversations: listMock } = await import('../src/agent-conversations-client.js');
      (listMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();
      await lifecycle.onConnectionStateChange('default', 'connected');

      expect(replayHistory).not.toHaveBeenCalled();
    });
  });

  describe('on uninstall / stop', () => {
    it('calls runtime.stop and clears timers', async () => {
      const lifecycle = plugin.createLifecycle!(TEST_CONFIG, {
        dispatchInbound: mockDispatchInbound,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      await lifecycle.start();

      const runtimeInstance = (QRClawRuntime as ReturnType<typeof vi.fn>).mock.results[0].value;

      await lifecycle.stop();

      expect(runtimeInstance.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('agentToken never leaked', () => {
    it('does not expose agentToken in any log-safe output', () => {
      const inspection = plugin.setup.inspectAccount!(
        { channels: { qrclaw: TEST_CONFIG } } as never,
        'default'
      );

      const serialized = JSON.stringify(inspection);
      expect(serialized).not.toContain('qak_test_token_1');
      expect(serialized).not.toContain('qak_test_token_2');
    });
  });
});
