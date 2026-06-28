import { expect, test } from '@playwright/test';
import { sendChatMessage, waitForReply, selectAgent } from '../../helpers/agent-ops';
import {
  createOwnerAgentHarness,
  getOwnerAgentE2EEnv,
  uniqueAgentName,
  type OwnerAgentHarness,
} from '../../helpers/owner-agent-e2e';

test.describe('Owner Agent Chat - reload during stream', () => {
  let harness: OwnerAgentHarness | null = null;

  test.afterEach(async () => {
    if (harness) {
      await harness.host.stop();
      harness = null;
    }
  });

  test('continues replay after page reload while a run is still active', async ({
    page,
    request,
  }) => {
    const { env, missing } = getOwnerAgentE2EEnv();
    test.skip(missing.length > 0, `Missing owner-agent E2E env: ${missing.join(', ')}`);

    const prompt = 'reply after reload while still running';
    const replyText = 'Delayed stream reply OK.';
    harness = await createOwnerAgentHarness(page, request, env!, {
      agentName: uniqueAgentName('e2e-openclaw-reload'),
      tokenLabel: 'e2e-reload-during-stream',
      replyText,
      fakeDelaySeconds: 4,
    });

    const sendResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/owner/agents/${harness!.agentId}/messages`)
      && response.request().method() === 'POST',
    );
    await sendChatMessage(page, prompt);
    const response = await sendResponse;
    expect(response.ok(), `send message returned ${response.status()}`).toBeTruthy();

    await page.reload();
    await selectAgent(page, harness.agentName);
    await expect(page.getByText(prompt)).toBeVisible({ timeout: 10_000 });
    const reply = await waitForReply(page, { timeoutMs: 100_000 });
    expect(reply).toContain(replyText);

    await page.reload();
    await selectAgent(page, harness.agentName);
    await expect(page.getByText(prompt)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(replyText)).toBeVisible({ timeout: 10_000 });
  });
});
