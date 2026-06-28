import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('e2e: outbound roundtrip (sendText → gateway frame)', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('sendText produces a valid agent_message frame at the mock gateway', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_outbound' } },
    });
    await harness.lifecycle.start();

    const messageId = harness.lifecycle.sendText({
      accountLabel: 'default',
      conversationId: 'conv-1',
      text: 'hi there',
    });

    const frame = await harness.waitForOutboundFrame('default', 'agent_message');

    expect(frame.type).toBe('agent_message');
    expect(frame.id).toBe(messageId);
    expect(UUID_RE.test(messageId)).toBe(true);

    const payload = frame.payload as Record<string, unknown>;
    expect(payload.content).toBe('hi there');
    expect(payload.content_type).toBe('markdown');
    expect(payload.conversation_id).toBe('conv-1');
  });
});
