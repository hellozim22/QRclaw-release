import { expect, type Page } from '@playwright/test';

/**
 * Open the Agents page wizard and create a standard-mode OpenClaw agent.
 * Returns the created agent name — not the DB id (which we can't read from
 * the wizard); callers that need the id should list agents via the API after
 * creation.
 *
 * Wizard reference: web/src/app/(dashboard)/agents/page.tsx
 *   - trigger: button "Create Agent"
 *   - dialog: role=dialog
 *   - name: first text input inside dialog
 *   - provider: first select → "openclaw"
 *   - execution mode: second select → "standard"
 *   - primary action: "Create"
 *   - token-step: role=dialog still open, explains local host token storage
 */
export async function createOpenClawAgent(
  page: Page,
  opts: { name: string },
): Promise<{ agentName: string }> {
  await page.goto('/agents');
  await page.getByRole('button', { name: 'Create Agent' }).click();

  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();

  // Name input is the first <input> inside the dialog (label "Name").
  await dlg.locator('input').first().fill(opts.name);

  // Selects: [0] provider, [1] execution mode. Defaults already match
  // openclaw + standard, but set explicitly for determinism.
  const selects = dlg.locator('select');
  await selects.nth(0).selectOption('openclaw');
  await selects.nth(1).selectOption('standard');

  await dlg.getByRole('button', { name: 'Create' }).click();

  await expect(
    dlg.getByText('此 token 已自动写入本机 ~/.qrclaw/agent-host/tokens/, 无需手动操作。'),
  ).toBeVisible({ timeout: 15_000 });
  return { agentName: opts.name };
}

/**
 * Send a chat message from the currently-selected agent panel.
 * Chat page is single-pane: /chat with left-side agent list. Caller must
 * have an agent selected before invoking (navigate there and click the
 * agent's row — see selectAgent helper in the spec).
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('Type a message…');
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * Wait for a non-empty assistant reply to appear in the chat. Returns the
 * latest assistant bubble text.
 *
 * Owner bubbles are right-aligned with sender_type='owner'; assistant
 * bubbles are left-aligned. We don't have data-testids yet, so we key on
 * the known message container and filter out the owner-side bubble by
 * background color `rgb(37, 99, 235)` (#2563eb, owner). Assistant bubbles
 * use `#f3f4f6`.
 */
export async function waitForReply(
  page: Page,
  opts: { timeoutMs: number },
): Promise<string> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const bubbles = page.locator('div[style*="background: rgb(243, 244, 246)"]');
    const count = await bubbles.count();
    if (count > 0) {
      const last = bubbles.last();
      const text = (await last.textContent())?.trim() ?? '';
      if (text.length > 0) return text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`waitForReply: no assistant bubble within ${opts.timeoutMs}ms`);
}

/**
 * Click an agent row in the left-side agent list on /chat.
 * Agent cards render name text; clicking selects and wires the chat panel.
 */
export async function selectAgent(page: Page, name: string): Promise<void> {
  await page.goto('/chat');
  // Wait a moment for the agent list to render post-loadAgents().
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: new RegExp(`^${escapeRegex(name)}`) })
    .first()
    .click({ timeout: 10_000 });
  await expect(page.getByPlaceholder('Type a message…')).toBeVisible({ timeout: 10_000 });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
