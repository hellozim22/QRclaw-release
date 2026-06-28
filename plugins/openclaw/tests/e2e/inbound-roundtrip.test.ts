import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('e2e: inbound roundtrip (visitor message → dispatchInbound)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('visitor message is dispatched with correct OpenClaw shape', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_inbound' } },
    });
    await harness.lifecycle.start();

    harness.pushFrame('default', {
      type: 'message',
      id: 'msg-in-001',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-X',
      },
    });

    const dispatch = await harness.waitForDispatch((d) => d.extra.message_id === 'msg-in-001');

    expect(dispatch).toMatchObject({
      channel: 'qrclaw',
      accountLabel: 'default',
      chatId: 'conv-X',
      user: 'conv-X',
      text: 'hello',
      extra: { message_id: 'msg-in-001' },
    });
  });

  it('agent-echo message does NOT trigger dispatchInbound (loop prevention)', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_echo' } },
    });
    await harness.lifecycle.start();

    harness.pushFrame('default', {
      type: 'message',
      id: 'msg-in-001',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'hello',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-X',
      },
    });

    await harness.waitForDispatch((d) => d.extra.message_id === 'msg-in-001');

    harness.pushFrame('default', {
      type: 'message',
      id: 'msg-agent-echo',
      timestamp: new Date().toISOString(),
      payload: {
        content: 'I am the agent reply',
        content_type: 'markdown',
        sender_type: 'agent',
        conversation_id: 'conv-X',
      },
    });

    await new Promise((r) => setTimeout(r, 150));

    const agentDispatches = harness.capture.inboundDispatches.filter(
      (d) => d.extra.message_id === 'msg-agent-echo'
    );
    expect(agentDispatches).toHaveLength(0);
  });

  it('read_receipt does NOT trigger dispatchInbound', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_receipt' } },
    });
    await harness.lifecycle.start();

    harness.pushFrame('default', {
      type: 'read_receipt',
      timestamp: new Date().toISOString(),
      payload: { message_ids: ['msg-1', 'msg-2'] },
    });

    await new Promise((r) => setTimeout(r, 150));

    expect(harness.capture.inboundDispatches).toHaveLength(0);
  });
});
