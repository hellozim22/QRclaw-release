import { expect, test } from '@playwright/test';
import { sendChatMessage, waitForReply, selectAgent } from '../../helpers/agent-ops';
import {
  createOwnerAgentHarness,
  getOwnerAgentE2EEnv,
  uniqueAgentName,
  type OwnerAgentHarness,
} from '../../helpers/owner-agent-e2e';

test.describe('Owner Agent Chat - happy path', () => {
  let harness: OwnerAgentHarness | null = null;

  test.afterEach(async () => {
    if (harness) {
      await harness.host.stop();
      harness = null;
    }
  });

  test('login -> host online -> agent -> chat -> reply -> reload -> replay', async ({
    page,
    request,
  }) => {
    const { env, missing } = getOwnerAgentE2EEnv();
    test.skip(missing.length > 0, `Missing owner-agent E2E env: ${missing.join(', ')}`);

    const prompt = 'say hello in one line';
    harness = await createOwnerAgentHarness(page, request, env!, {
      agentName: uniqueAgentName('e2e-openclaw-happy'),
      tokenLabel: 'e2e-happy-path',
      replyText: 'Happy path reply OK.',
    });

    // Capture network for the history endpoint to diagnose replay failures.
    const historyResponses: Array<{ url: string; status: number; body: string }> = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.includes('/api/owner/agents/') && url.endsWith('/messages')) {
        try {
          const txt = await resp.text();
          historyResponses.push({ url, status: resp.status(), body: txt.slice(0, 400) });
        } catch {
          /* ignore */
        }
      }
    });

    await test.info().attach('initial-setup', { body: JSON.stringify({ agentName: harness.agentName }, null, 2), contentType: 'application/json' });
    await sendChatMessage(page, prompt);
    // Wait specifically for the NEW reply (harness knows the exact text).
    await expect(page.getByText(harness.replyText)).toBeVisible({ timeout: 100_000 });
    const reply = harness.replyText;

    await page.reload();
    await selectAgent(page, harness.agentName);
    // Allow retry delays in store to kick in.
    await page.waitForTimeout(4_000);
    await test.info().attach('history-responses', {
      body: JSON.stringify(historyResponses, null, 2),
      contentType: 'application/json',
    });
    // Dump zustand store state as attachment for diagnostics
    const storeDump = await page.evaluate(() => {
      const w = window as any;
      try {
        const s = w.__OWNER_AGENT_STORE__?.getState?.() ?? null;
        if (!s) return { error: 'store not exposed' };
        return {
          selectedAgentId: s.selectedAgentId,
          agents: s.agents?.map((a: any) => a.id) ?? [],
          messagesByAgent: Object.fromEntries(
            Object.entries(s.messagesByAgent ?? {}).map(([k, v]: any) => [k, v.length]),
          ),
          error: s.error,
        };
      } catch (e) {
        return { error: String(e) };
      }
    });
    await test.info().attach('store-dump', {
      body: JSON.stringify(storeDump, null, 2),
      contentType: 'application/json',
    });
    await expect(page.getByText(prompt)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(reply)).toBeVisible({ timeout: 15_000 });
  });
});
