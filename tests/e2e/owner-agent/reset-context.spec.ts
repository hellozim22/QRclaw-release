import { expect, test } from '@playwright/test';
import { sendChatMessage, waitForReply } from '../../helpers/agent-ops';
import {
  createOwnerAgentHarness,
  getOwnerAgentConversation,
  getOwnerAgentE2EEnv,
  uniqueAgentName,
  updateConversationRuntime,
  type OwnerAgentHarness,
} from '../../helpers/owner-agent-e2e';

test.describe('Owner Agent Chat - reset context', () => {
  let harness: OwnerAgentHarness | null = null;

  test.afterEach(async () => {
    if (harness) {
      await harness.host.stop();
      harness = null;
    }
  });

  test('clears provider runtime context and keeps chat history visible', async ({
    page,
    request,
  }) => {
    const { env, missing } = getOwnerAgentE2EEnv();
    test.skip(missing.length > 0, `Missing owner-agent E2E env: ${missing.join(', ')}`);

    const firstPrompt = 'establish a provider session';
    const secondPrompt = 'continue after reset with new context';
    harness = await createOwnerAgentHarness(page, request, env!, {
      agentName: uniqueAgentName('e2e-openclaw-reset'),
      tokenLabel: 'e2e-reset-context',
      replyText: 'Context reset reply OK.',
    });

    await sendChatMessage(page, firstPrompt);
    const firstReply = await waitForReply(page, { timeoutMs: 100_000 });
    expect(firstReply.length).toBeGreaterThan(0);

    const conversation = await getOwnerAgentConversation(
      request,
      env!,
      harness.ownerJWT,
      harness.agentId,
    );
    await updateConversationRuntime(request, env!, harness.ownerJWT, conversation.id, {
      provider_session_id: `e2e-session-${Date.now()}`,
      provider_work_dir: `/tmp/qrclaw-e2e-${Date.now()}`,
    });

    const resetResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/owner/agents/${harness!.agentId}/conversation/reset`)
      && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Reset context|重置上下文/i }).click();
    const response = await resetResponse;
    expect(response.ok(), `reset context returned ${response.status()}`).toBeTruthy();

    await expect(page.getByText(firstPrompt)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(firstReply, { exact: true })).toBeVisible({ timeout: 10_000 });

    const resetConversation = await getOwnerAgentConversation(
      request,
      env!,
      harness.ownerJWT,
      harness.agentId,
    );
    expect(resetConversation.provider_session_id).toBeNull();
    expect(resetConversation.provider_work_dir).toBeNull();

    await sendChatMessage(page, secondPrompt);
    const secondReply = await waitForReply(page, { timeoutMs: 100_000 });
    expect(secondReply.length).toBeGreaterThan(0);

    const finalConversation = await getOwnerAgentConversation(
      request,
      env!,
      harness.ownerJWT,
      harness.agentId,
    );
    expect(finalConversation.provider_session_id).toBeNull();
    expect(finalConversation.provider_work_dir).toBeNull();
  });
});
