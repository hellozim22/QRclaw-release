import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('e2e: plugin lifecycle (install → start → stop)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('start establishes WS connection within 1s, stop tears it down cleanly', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_lifecycle_test' } },
    });

    await harness.lifecycle.start();

    const ws = harness.getAccountWs('default');
    expect(ws).toBeDefined();

    const initialFrameCount = (harness.capture.outboundFrames.get('default') ?? []).length;

    await harness.lifecycle.stop();

    await new Promise((r) => setTimeout(r, 200));

    expect(harness.getAccountWs('default')).toBeUndefined();

    const finalFrameCount = (harness.capture.outboundFrames.get('default') ?? []).length;
    expect(finalFrameCount).toBe(initialFrameCount);
  });

  it('connection_ack is consumed (not forwarded to dispatchInbound)', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_ack_test' } },
    });

    await harness.lifecycle.start();

    await new Promise((r) => setTimeout(r, 100));

    const ackDispatches = harness.capture.inboundDispatches.filter(
      (d) => d.text === 'connection_ack'
    );
    expect(ackDispatches).toHaveLength(0);
  });
});
