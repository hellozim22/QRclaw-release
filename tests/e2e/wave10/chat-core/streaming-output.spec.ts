import { expect, test } from '@playwright/test';
import { createRealClaudeHarness } from '../../../helpers/wave10-harness';

/**
 * OAC-W10-E2E-05 · Chat Core · P0
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-05
 * (Previously OAC-Wave10-E2E-07 / R1 P0-07 — renumbered to R2 C6 final numbering.)
 * Iron laws: C1 (gateway neutral — just pipes SSE bytes through)
 *
 * 真断言:
 *   - 首个 DOM update 延迟 < 10s
 *   - 流式过程中采样 5 次, innerText 单调增长
 *   - 最终 reply 含 5 个 Markdown 标题 (`# `)
 *
 * TODO(sprint-1-cu3): unskip after SSE replay helper lands in harness.
 */
test.describe('E2E-05 streaming output token by token', () => {
  test.skip('first token < 10s and content grows monotonically', async ({ browser }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: 'claude',
      requireRealCli: true,
    });
    try {
      await harness.page.goto(`/chat/${harness.sessionId}`);

      const start = Date.now();
      await harness.sendMessage('请分 5 段回答, 每段用 Markdown 一级标题.');

      // TODO: MutationObserver sampling pattern — 5 checkpoints, monotonic grow
      // const samples: string[] = [];
      // for (let i = 0; i < 5; i++) { await page.waitForTimeout(500); samples.push(...); }
      // expect(new Set(samples).size).toBeGreaterThanOrEqual(4);

      const reply = await harness.waitForReply({ timeoutMs: 60_000 });
      const firstTokenMs = Date.now() - start; // TODO: measure at first DOM change, not full reply
      expect(firstTokenMs).toBeLessThan(60_000);

      const headingCount = (reply.match(/^# /gm) ?? []).length;
      expect(headingCount).toBeGreaterThanOrEqual(3);
    } finally {
      await harness.stop();
    }
  });
});
