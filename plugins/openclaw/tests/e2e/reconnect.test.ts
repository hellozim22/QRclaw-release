import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('e2e: reconnect dedup (mid-session disconnect → reconnect → no double dispatch)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('same message_id dispatched only once across reconnect', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_reconnect_test' } },
    });
    await harness.lifecycle.start();

    const m1Frame = {
      type: 'message',
      id: 'M1',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello from visitor',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-reconnect',
      },
    };

    harness.pushFrame('default', m1Frame);
    await harness.waitForDispatch((d) => d.extra.message_id === 'M1');
    expect(harness.capture.inboundDispatches).toHaveLength(1);

    // Speed up reconnect: the default reconnectDelayMs is 3000ms inside
    // QRClawConnection; we intercept setTimeout to shrink anything > 1s.
    const origSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', ((
      fn: (...args: unknown[]) => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      return origSetTimeout(fn, ms && ms > 1000 ? 50 : ms, ...rest);
    }) as typeof globalThis.setTimeout);

    harness.forceCloseConnection('default');

    await harness.waitForConnection('default', 5000);
    await new Promise((r) => origSetTimeout(r, 150));

    harness.pushFrame('default', m1Frame);

    await new Promise((r) => origSetTimeout(r, 200));

    expect(harness.capture.inboundDispatches).toHaveLength(1);
    expect(harness.capture.inboundDispatches[0].extra.message_id).toBe('M1');
  });

  it('new messages after reconnect are still dispatched', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_reconnect_new' } },
    });
    await harness.lifecycle.start();

    harness.pushFrame('default', {
      type: 'message',
      id: 'M-before',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'before disconnect',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-rc2',
      },
    });
    await harness.waitForDispatch((d) => d.extra.message_id === 'M-before');

    const origSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', ((
      fn: (...args: unknown[]) => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      return origSetTimeout(fn, ms && ms > 1000 ? 50 : ms, ...rest);
    }) as typeof globalThis.setTimeout);

    harness.forceCloseConnection('default');
    await harness.waitForConnection('default', 5000);
    await new Promise((r) => origSetTimeout(r, 150));

    harness.pushFrame('default', {
      type: 'message',
      id: 'M-after',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'after reconnect',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-rc2',
      },
    });

    await harness.waitForDispatch((d) => d.extra.message_id === 'M-after');

    expect(harness.capture.inboundDispatches).toHaveLength(2);
    expect(harness.capture.inboundDispatches[1].text).toBe('after reconnect');
  });
});
