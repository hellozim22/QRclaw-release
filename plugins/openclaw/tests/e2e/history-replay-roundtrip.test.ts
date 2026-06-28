/**
 * Acceptance tests for history replay wiring (R2).
 *
 * These tests exercise the cold-start replay flow end-to-end:
 *
 *   plugin connect
 *     → channel.onConnectionStateChange('connected')
 *     → GET /api/agent/conversations
 *     → replayHistory(conversationIds)
 *     → POST /functions/v1/decrypted-messages (per conversation)
 *     → dispatchInbound (with extra.replayed = true)
 *
 * CURRENT STATE (R3 landed, R2 not yet):
 *   channel.ts passes `conversationIds: []` at line 173, so no HTTP call
 *   to either endpoint happens on connect. Scenarios 1, 2, 3, 4 therefore
 *   fail ASSERTIONALLY (not with timeouts or infra errors) — they are TDD
 *   acceptance tests that R2 must turn green.
 *
 * AFTER R2 LANDS: all scenarios must pass. See "Notes for R2" in the R3
 * task card for the exact wiring contracts each scenario exercises.
 *
 * R4 (bug-fix sweep) is allowed to tweak assertion details IF R2
 * uncovers a real API-shape issue; but the scenario intent is the
 * contract.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHarness, type Harness } from './harness.js';
import type { DecryptedMessage } from '../../../../shared/contracts/http/decrypted-messages/types.js';
import type {
  AgentConversationItem,
  AgentConversationsResponse,
} from '../../../../shared/contracts/http/agent/conversations/types.js';

const ISO = '2026-04-20T00:00:00.000Z';

function makeMsg(messageId: string, content: string): DecryptedMessage {
  return {
    id: `row-${messageId}`,
    message_id: messageId,
    content,
    sender_type: 'visitor',
    persisted_at: ISO,
    reply_to_message_id: null,
    thread_id: null,
  };
}

function makeConv(
  overrides: Partial<AgentConversationItem> & Pick<AgentConversationItem, 'conversation_id'>
): AgentConversationItem {
  const base: AgentConversationItem = {
    conversation_id: overrides.conversation_id,
    qrcode_id: `qr-${overrides.conversation_id}`,
    qrcode_slug: `slug${overrides.conversation_id}`.padEnd(12, '0'),
    qrcode_label: null,
    owner_id: 'owner-1',
    owned_by_me: true,
    message_count: 0,
    last_active_at: ISO,
    created_at: ISO,
  };
  return { ...base, ...overrides };
}

describe('e2e (R2 acceptance): cold-start history replay roundtrip', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  it('Scenario 1: cold-start replay dispatches historical messages from every conversation', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_r3_s1' } },
    });

    const conversationsResponse: AgentConversationsResponse = {
      data: [
        makeConv({
          conversation_id: 'conv-A',
          qrcode_id: 'qr-1',
          qrcode_slug: 'abc123456789',
          qrcode_label: 'Alpha',
          message_count: 3,
        }),
        makeConv({
          conversation_id: 'conv-B',
          qrcode_id: 'qr-2',
          qrcode_slug: 'def123456789',
          qrcode_label: 'Beta',
          message_count: 1,
        }),
      ],
      meta: { has_more: false, cursor: null, scope: 'self' },
    };
    harness.agentConversations.setResponse(conversationsResponse);
    harness.decryptedMessages.setMessagesFor('conv-A', [
      makeMsg('hist-a1', 'm1'),
      makeMsg('hist-a2', 'm2'),
      makeMsg('hist-a3', 'm3'),
    ]);
    harness.decryptedMessages.setMessagesFor('conv-B', [makeMsg('hist-b1', 'm4')]);

    await harness.lifecycle.start();
    await harness.waitForConnection('default');

    // R2 must hook this up so onConnectionStateChange fires automatically on
    // WS ack. Until then we invoke it explicitly so the plugin code path is
    // exercised identically.
    await harness.lifecycle.onConnectionStateChange('default', 'connected');

    await vi.waitFor(
      () => {
        const replayed = harness.capture.inboundDispatches.filter((d) => d.extra.replayed === true);
        expect(replayed).toHaveLength(4);
      },
      { timeout: 2000, interval: 25 }
    );

    const replayed = harness.capture.inboundDispatches.filter((d) => d.extra.replayed === true);
    expect(replayed.map((d) => d.text).sort()).toEqual(['m1', 'm2', 'm3', 'm4']);

    const forA = replayed.filter((d) => d.chatId === 'conv-A');
    const forB = replayed.filter((d) => d.chatId === 'conv-B');
    expect(forA).toHaveLength(3);
    expect(forB).toHaveLength(1);
    expect(forA.every((d) => d.accountLabel === 'default')).toBe(true);

    const convCalls = harness.agentConversations.getCallLog();
    expect(convCalls.length).toBeGreaterThanOrEqual(1);
    expect(convCalls[0].token).toBe('qak_r3_s1');

    const decryptedCalls = harness.decryptedMessages.getCallLog();
    const convIdsHit = new Set(decryptedCalls.map((c) => c.conversation_id));
    expect(convIdsHit).toEqual(new Set(['conv-A', 'conv-B']));
  });

  it('Scenario 2: replay dedup — live WS message id is not re-dispatched by replay', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_r3_s2' } },
    });

    harness.agentConversations.setResponse({
      data: [makeConv({ conversation_id: 'conv-C', message_count: 2 })],
      meta: { has_more: false, cursor: null, scope: 'self' },
    });
    harness.decryptedMessages.setMessagesFor('conv-C', [
      makeMsg('live-1', 'hello from live'),
      makeMsg('hist-only-1', 'only in history'),
    ]);

    await harness.lifecycle.start();
    await harness.waitForConnection('default');

    // Push the live frame BEFORE replay runs. The runtime's live-dedup
    // registers 'live-1'; R2 must ensure the channel-level seenSet handed
    // to replayHistory also contains 'live-1' so replay skips it.
    harness.pushFrame('default', {
      type: 'message',
      id: 'live-1',
      timestamp: ISO,
      payload: {
        content: 'hello from live',
        content_type: 'text',
        sender_type: 'visitor',
        conversation_id: 'conv-C',
      },
    });
    await harness.waitForDispatch((d) => d.extra.message_id === 'live-1');

    await harness.lifecycle.onConnectionStateChange('default', 'connected');

    await vi.waitFor(
      () => {
        const ids = harness.capture.inboundDispatches.map((d) => d.extra.message_id);
        expect(ids).toContain('hist-only-1');
      },
      { timeout: 2000, interval: 25 }
    );

    // Settle: give any spurious second-dispatch a chance to sneak in.
    await new Promise((r) => setTimeout(r, 50));

    // Core dedup contract: each message_id dispatched EXACTLY ONCE, regardless
    // of which async path (live WS vs history replay) wins the race. Asserting
    // WHICH path won for `live-1` is a test over-specification — both paths
    // are inherently async (WS travels ws.send → onmessage → handler; replay
    // travels fetch → json → dispatch loop) and ordering is not controllable
    // without introducing production delays. The visible UX is identical in
    // either ordering: the message shows up once.
    const idCounts = harness.capture.inboundDispatches.reduce<Record<string, number>>((a, d) => {
      const id = d.extra.message_id as string;
      a[id] = (a[id] ?? 0) + 1;
      return a;
    }, {});
    expect(idCounts['live-1']).toBe(1);
    expect(idCounts['hist-only-1']).toBe(1);
    expect(harness.capture.inboundDispatches).toHaveLength(2);

    // `hist-only-1` ONLY exists in history, so it MUST be dispatched as replayed.
    const histOnlyOne = harness.capture.inboundDispatches.find(
      (d) => d.extra.message_id === 'hist-only-1'
    );
    expect(histOnlyOne!.extra.replayed).toBe(true);
  });

  it('Scenario 3: replay failure from /api/agent/conversations bails gracefully', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_r3_s3' } },
    });

    harness.agentConversations.setResponse({
      status: 500,
      body: { error: { code: 'internal_error', message: 'boom' } },
    });

    await harness.lifecycle.start();
    await harness.waitForConnection('default');
    await harness.lifecycle.onConnectionStateChange('default', 'connected');

    // Wait until the conversations endpoint was actually hit (or time out).
    await vi.waitFor(
      () => {
        expect(harness.agentConversations.getCallLog().length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 2000, interval: 25 }
    );

    // Settle a beat so any logger.warn has been flushed.
    await new Promise((r) => setTimeout(r, 50));

    // Plugin stays connected — no crash, WS still open.
    expect(harness.getAccountWs('default')).toBeDefined();

    // No replayed dispatches (nothing to replay because conv-list failed).
    const replayed = harness.capture.inboundDispatches.filter((d) => d.extra.replayed === true);
    expect(replayed).toHaveLength(0);

    // Downstream decrypted-messages must NOT be called when the conv-list
    // call failed.
    expect(harness.decryptedMessages.getCallLog()).toHaveLength(0);

    // logger.warn should mention the failure. Accept any call whose
    // concatenated message contains one of the expected markers.
    const warnMock = harness.logger.warn as unknown as {
      mock: { calls: unknown[][] };
    };
    const warnJoined = warnMock.mock.calls
      .map((args) => args.map((a) => String(a)).join(' '))
      .join('\n');
    expect(warnJoined).toMatch(/history|conversations|500|internal_error/i);
  });

  it('Scenario 4: multi-account isolation — per-token conversation lists + dispatches', async () => {
    harness = await createHarness({
      accounts: {
        primary: { agentToken: 'qak_r3_primary' },
        secondary: { agentToken: 'qak_r3_secondary' },
      },
    });

    harness.agentConversations.setResponse(
      {
        data: [makeConv({ conversation_id: 'conv-P' })],
        meta: { has_more: false, cursor: null, scope: 'self' },
      },
      { forToken: 'qak_r3_primary' }
    );
    harness.agentConversations.setResponse(
      {
        data: [makeConv({ conversation_id: 'conv-S' })],
        meta: { has_more: false, cursor: null, scope: 'self' },
      },
      { forToken: 'qak_r3_secondary' }
    );

    harness.decryptedMessages.setMessagesFor('conv-P', [makeMsg('p-1', 'primary-only')], {
      forToken: 'qak_r3_primary',
    });
    harness.decryptedMessages.setMessagesFor('conv-S', [makeMsg('s-1', 'secondary-only')], {
      forToken: 'qak_r3_secondary',
    });

    await harness.lifecycle.start();
    await harness.waitForConnection('primary');
    await harness.waitForConnection('secondary');

    await harness.lifecycle.onConnectionStateChange('primary', 'connected');
    await harness.lifecycle.onConnectionStateChange('secondary', 'connected');

    await vi.waitFor(
      () => {
        const replayed = harness.capture.inboundDispatches.filter((d) => d.extra.replayed === true);
        expect(replayed).toHaveLength(2);
      },
      { timeout: 2000, interval: 25 }
    );

    const convTokens = new Set(harness.agentConversations.getCallLog().map((c) => c.token));
    expect(convTokens).toEqual(new Set(['qak_r3_primary', 'qak_r3_secondary']));

    const replayed = harness.capture.inboundDispatches.filter((d) => d.extra.replayed === true);

    const byAccount = new Map<string, typeof replayed>();
    for (const d of replayed) {
      const list = byAccount.get(d.accountLabel) ?? [];
      list.push(d);
      byAccount.set(d.accountLabel, list);
    }

    const primaryDispatches = byAccount.get('primary') ?? [];
    const secondaryDispatches = byAccount.get('secondary') ?? [];

    expect(primaryDispatches).toHaveLength(1);
    expect(secondaryDispatches).toHaveLength(1);
    expect(primaryDispatches[0].text).toBe('primary-only');
    expect(primaryDispatches[0].chatId).toBe('conv-P');
    expect(secondaryDispatches[0].text).toBe('secondary-only');
    expect(secondaryDispatches[0].chatId).toBe('conv-S');

    // Cross-contamination guard: no primary dispatch carries conv-S content
    // and vice versa.
    expect(primaryDispatches.every((d) => d.chatId !== 'conv-S')).toBe(true);
    expect(secondaryDispatches.every((d) => d.chatId !== 'conv-P')).toBe(true);
  });
});
