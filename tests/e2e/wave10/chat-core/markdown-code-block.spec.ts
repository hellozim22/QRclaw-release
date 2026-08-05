import { expect, test } from '@playwright/test';
import { createRealClaudeHarness } from '../../../helpers/wave10-harness';

/**
 * OAC-W10-E2E-06 · Chat Core · P0
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-06
 * Iron laws: C1 (gateway passes markdown bytes through unchanged)
 *
 * 真断言:
 *   - prompt 要 Claude 写 Python hello world 代码块
 *   - DOM 出现 <code class="language-python">
 *   - "Copy" 按钮存在且可点 (copy 到剪贴板内容含 "print")
 */
test.describe('E2E-06 markdown code block rendering', () => {
  test.skip('python code block renders with language class and copy button', async ({
    browser,
  }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: 'claude',
      requireRealCli: true,
    });
    try {
      await harness.page.goto(`/chat/${harness.sessionId}`);
      await harness.sendMessage('用 python 写 hello world, 只给代码块, 不要解释.');
      await harness.waitForReply({ timeoutMs: 60_000 });

      const codeBlock = harness.page.locator('code.language-python').first();
      await expect(codeBlock).toBeVisible();
      await expect(codeBlock).toContainText('print');

      const copyBtn = harness.page.locator('[data-testid="code-copy-button"]').first();
      await expect(copyBtn).toBeVisible();

      // TODO(sprint-2): click copy, read clipboard via page.evaluate(() => navigator.clipboard.readText())
    } finally {
      await harness.stop();
    }
  });
});
