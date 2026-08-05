import { expect, test } from '@playwright/test';
import { createRealClaudeHarness } from '../../../helpers/wave10-harness';

/**
 * OAC-W10-E2E-01 · Onboarding · P0
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-01
 * Iron laws: C4 (owner branch — 4 local runtimes auto-detected, no visitor QR)
 *
 * 真断言:
 *   - 登录后 /chat 页面至少 1 个 runtime slot 状态 online
 *   - 左栏列出 4 个默认 provider (openclaw / claude / cursor / codex)
 */
test.describe('E2E-01 runtime auto-detect on first open', () => {
  test.setTimeout(120_000);

  test('at least one runtime shows online in runtime rail', async ({ browser }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: 'claude',
      requireRealCli: true,
    });
    try {
      await harness.openChat();
      const { page } = harness;

      // Agent list rail = <nav aria-label="Agent list"> with agent rows.
      const rail = page.locator('[data-testid="agent-list-rail"]');
      await expect(rail).toBeVisible();

      // Each agent row carries aria-label="<name>" or "<name> · 在线".
      const items = rail.locator('[data-testid^="agent-list-item-"]');
      await expect(items.first()).toBeVisible({ timeout: 30_000 });
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(4);

      // At least one agent must show online (the real claude host).
      await expect
        .poll(
          async () => {
            const labels = await items.evaluateAll((nodes) =>
              nodes.map((n) => n.getAttribute('aria-label') ?? '')
            );
            return labels.some((l) => /在线|online/i.test(l));
          },
          { timeout: 30_000, intervals: [500, 1_000] }
        )
        .toBe(true);
    } finally {
      await harness.stop();
    }
  });
});
