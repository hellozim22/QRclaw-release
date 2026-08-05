import { expect, test } from '@playwright/test';
import { createRealClaudeHarness } from '../../../helpers/wave10-harness';

/**
 * OAC-W10-E2E-02 · Onboarding · P0
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-02
 * Iron laws: C4 (zero-register owner branch — default agent auto-provisioned)
 *
 * 真断言:
 *   - 登录后 /chat 页面左栏有 claude runtime card
 *   - 点击 claude card → 右栏 assistant-ui Thread 出现
 *   - composer 输入框启用 (placeholder = "输入消息...", 不是 "runtime 离线")
 */
test.describe('E2E-02 default agent click opens chat', () => {
  test.setTimeout(120_000);

  test('clicking claude default agent opens the chat composer', async ({ browser }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: 'claude',
      requireRealCli: true,
    });
    try {
      await harness.openChat();
      const { page } = harness;

      const rail = page.locator('[data-testid="agent-list-rail"]');
      await expect(rail).toBeVisible();

      // Click the first agent row whose text contains "Claude" (the default agent).
      const claudeItem = rail
        .locator('[data-testid^="agent-list-item-"]')
        .filter({ hasText: /Claude/i })
        .first();
      await expect(claudeItem).toBeVisible({ timeout: 15_000 });
      await claudeItem.click();

      // Right pane must now show the assistant-ui Thread, NOT onboarding empty.
      const thread = page.locator('[data-testid="owner-assistant-thread"]');
      await expect(thread).toBeVisible({ timeout: 10_000 });

      // Composer placeholder = "输入消息..." when online.
      const composer = thread.locator('textarea, input').first();
      await expect(composer).toBeVisible({ timeout: 10_000 });
      const placeholder = await composer.getAttribute('placeholder');
      expect(placeholder ?? '').toContain('输入消息');
    } finally {
      await harness.stop();
    }
  });
});
