import { expect, test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createOwnerAgentHarness,
  getOwnerAgentE2EEnv,
  uniqueAgentName,
  type OwnerAgentHarness,
} from '../../helpers/owner-agent-e2e';
import { sendChatMessage, selectAgent } from '../../helpers/agent-ops';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../test-results/wave9-acceptance-screenshots');

// Acceptance demo — captures 8 screenshots at each user-visible milestone.
// Run with: npx playwright test e2e/owner-agent/screenshot-demo.spec.ts
test.describe('Wave 9 acceptance — screenshot demo', () => {
  let harness: OwnerAgentHarness | null = null;
  test.afterEach(async () => {
    if (harness) await harness.host.stop();
    harness = null;
  });

  test('capture screenshots at each milestone', async ({ page, request }) => {
    const { env, missing } = getOwnerAgentE2EEnv();
    test.skip(missing.length > 0, `env missing: ${missing.join(', ')}`);

    // Pre-screenshot 01: login page
    await page.goto('/login');
    await page.screenshot({ path: `${outDir}/01-login-page.png`, fullPage: true });

    // Harness itself performs loginAsOwner, so we don't double-login here.
    const agentName = uniqueAgentName('e2e-demo-happy');
    harness = await createOwnerAgentHarness(page, request, env!, {
      agentName,
      tokenLabel: 'e2e-demo',
      replyText: 'Wave 9 acceptance demo reply OK.',
    });
    // Step 02: after login (harness logged us in and is now on /chat)
    await page.screenshot({ path: `${outDir}/02-after-login-messages.png`, fullPage: true });
    // Step 03: agent created and selected in chat
    await page.screenshot({ path: `${outDir}/03-chat-agent-selected.png`, fullPage: true });

    // Send a message
    await sendChatMessage(page, 'say hello in one line');
    await page.screenshot({ path: `${outDir}/04-message-sent-pending.png`, fullPage: true });

    // Wait for reply to appear
    await expect(page.getByText(harness.replyText)).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${outDir}/05-reply-received.png`, fullPage: true });

    // Reload to exercise history replay
    await page.reload();
    await selectAgent(page, agentName);
    await expect(page.getByText('say hello in one line')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(harness.replyText)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${outDir}/06-reload-history-replay.png`, fullPage: true });

    // Navigate to Agents page to show the created agent
    await page.goto('/agents');
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${outDir}/07-agents-page.png`, fullPage: true });

    // Final: back to chat
    await page.goto('/chat');
    await selectAgent(page, agentName);
    await page.screenshot({ path: `${outDir}/08-chat-final-state.png`, fullPage: true });
  });
});
