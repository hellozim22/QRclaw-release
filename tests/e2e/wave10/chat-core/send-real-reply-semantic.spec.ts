import { expect, test } from "@playwright/test";
import { createRealClaudeHarness } from "../../../helpers/wave10-harness";

/**
 * OAC-W10-E2E-04 · Chat Core · P0 · 关键用例
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-04
 * Iron laws: C1 (gateway neutral relay), C2 (encrypted at rest, no plaintext leak into logs)
 *
 * 语义断言铁律 (用户教训, Wave 9 → Wave 10):
 *   - 不信 "element visible" — 信 "reply contains 42"
 *   - prompt 固定 "只输出数字 42", 真 claude CLI 必然回 "42"
 *   - 同一 reply 既验 reply 正确, 又验 C2 无明文泄漏
 */
test.describe("E2E-04 real claude reply semantic", () => {
  test.setTimeout(300_000);

  test("real claude CLI replies with 42 and C1/C2 guardrails hold", async ({
    browser,
  }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: "claude",
      requireRealCli: true,
    });
    try {
      await harness.page.goto(`/chat`);
      const prompt = "只输出数字 42, 不要其他任何内容, 不要标点, 不要引号";
      await harness.sendMessage(prompt);
      // 真 claude CLI: 首 token < 30s, 完整 reply < 120s (留足网络/冷启动余量).
      const reply = await harness.waitForReply({ timeoutMs: 180_000 });

      // 语义断言: 真 Claude 会吐回 "42"
      expect(reply).toContain("42");

      // C2: DB 密文, 原文不出现在 content / metadata 列
      const rows = await harness.db.messagesForSession(harness.sessionId);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const row of rows) {
        expect(row.content_encrypted).toBeTruthy();
        expect(row.content).toBeNull();
      }

      // C2: gateway log 不出现 prompt 原文 (Chinese prefix 不会误命中端口/时间戳)
      await harness.log.assertNotContains(["只输出数字"], "gateway.log");
    } finally {
      await harness.stop();
    }
  });
});
