import { expect, test } from "@playwright/test";
import { createRealClaudeHarness } from "../../../helpers/wave10-harness";

/**
 * OAC-W10-E2E-39 · Iron Rule C2 · Core
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-39
 * Iron laws: C2 (encrypted at rest — owner_agent_messages.content_encrypted 非空,
 *            content 列为 null, metadata 不含明文片段)
 *
 * 真断言 (review §3.2 建议的列白名单):
 *   - content_encrypted: 非空
 *   - content: null  (明文不落库)
 *   - metadata JSON 序列化后不含 forbiddenPlaintext
 *
 * 直连 Supabase service role 读, 绕开 RLS, 看"写到磁盘上到底是什么".
 */
test.describe("E2E-39 C2 DB encrypted at rest", () => {
  test.skip("owner_agent_messages row stores ciphertext only", async ({
    browser,
  }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: "claude",
      requireRealCli: true,
    });
    try {
      const nonce = `C2_AT_REST_${Date.now()}`;

      await harness.page.goto(`/chat/${harness.sessionId}`);
      await harness.sendMessage(`记住这个词: ${nonce}`);
      await harness.waitForReply({ timeoutMs: 60_000 });

      // 列白名单断言 (service role bypass RLS, 真实看磁盘)
      await harness.db.assertEncryptedAtRest({
        sessionId: harness.sessionId,
        forbiddenPlaintext: nonce,
      });

      const rows = await harness.db.messagesForSession(harness.sessionId);
      expect(rows.length).toBeGreaterThanOrEqual(2); // owner prompt + agent reply
      for (const row of rows) {
        expect(row.content_encrypted).toBeTruthy();
        expect(row.content).toBeNull();
      }
    } finally {
      await harness.stop();
    }
  });
});
