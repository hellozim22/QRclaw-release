import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('e2e: multi-account isolation (§G1, dual agent token)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('inbound frame on botA does not dispatch as botB', async () => {
    harness = await createHarness({
      accounts: {
        botA: { agentToken: 'qak_token_A' },
        botB: { agentToken: 'qak_token_B' },
      },
    });
    await harness.lifecycle.start();

    harness.pushFrame('botA', {
      type: 'message',
      id: 'msg-for-a',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello A',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-a',
      },
    });

    await harness.waitForDispatch((d) => d.extra.message_id === 'msg-for-a');

    const forA = harness.capture.inboundDispatches.filter((d) => d.accountLabel === 'botA');
    const forB = harness.capture.inboundDispatches.filter((d) => d.accountLabel === 'botB');

    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(0);
  });

  it('sendText on botA sends frame only to botA socket', async () => {
    harness = await createHarness({
      accounts: {
        botA: { agentToken: 'qak_token_A2' },
        botB: { agentToken: 'qak_token_B2' },
      },
    });
    await harness.lifecycle.start();

    harness.lifecycle.sendText({
      accountLabel: 'botA',
      conversationId: 'conv-a',
      text: 'from A',
    });

    await harness.waitForOutboundFrame('botA', 'agent_message');

    await new Promise((r) => setTimeout(r, 100));

    const botAFrames = (harness.capture.outboundFrames.get('botA') ?? []).filter(
      (f) => f.type === 'agent_message'
    );
    const botBFrames = (harness.capture.outboundFrames.get('botB') ?? []).filter(
      (f) => f.type === 'agent_message'
    );

    expect(botAFrames).toHaveLength(1);
    expect(botBFrames).toHaveLength(0);
  });

  it('disconnecting botA does not affect botB', async () => {
    harness = await createHarness({
      accounts: {
        botA: { agentToken: 'qak_token_A3' },
        botB: { agentToken: 'qak_token_B3' },
      },
    });
    await harness.lifecycle.start();

    harness.forceCloseConnection('botA');

    await new Promise((r) => setTimeout(r, 200));

    expect(harness.getAccountWs('botB')).toBeDefined();

    harness.pushFrame('botB', {
      type: 'message',
      id: 'msg-for-b-post-disconnect',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'still alive',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-b',
      },
    });

    await harness.waitForDispatch((d) => d.extra.message_id === 'msg-for-b-post-disconnect');

    expect(
      harness.capture.inboundDispatches.find(
        (d) => d.extra.message_id === 'msg-for-b-post-disconnect'
      )
    ).toBeDefined();
  });
});
