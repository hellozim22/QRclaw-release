import { expect, test } from "@playwright/test";
import {
  createRealClaudeHarness,
  readGatewayLog,
} from "../../../helpers/wave10-harness";

/**
 * OAC-W10-E2E-38 · Iron Rule C2 · Core
 *
 * Source: docs/wave10/r2-c6-test-cases-final.md §E2E-38
 * Iron laws: C1 (gateway neutral relay) + C2 (no plaintext leak into logs)
 *
 * 用户铁律 (Wave 9 教训):
 *   gateway log 绝不允许出现 prompt / reply / host token / owner JWT 明文.
 *   nonce 同时承担 "reply 正确" 与 "log 无明文" 双重验证.
 *
 * 审查要求 (docs/wave10/r2-c7-review-补充.md §2.3):
 *   - 检查 prompt、reply、attachment、host token、owner JWT 五类 secret
 *   - log path 不硬编码 /tmp — 通过 WAVE10_GATEWAY_LOG env 或 harness.log.path
 */
test.describe("E2E-38 C2 gateway logs no plaintext", () => {
  test.skip("sent nonce never appears in gateway.log", async ({ browser }) => {
    const harness = await createRealClaudeHarness(browser, {
      runtime: "claude",
      requireRealCli: true,
    });
    try {
      const nonce = `C2_LEAK_PROBE_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      await harness.page.goto(`/chat/${harness.sessionId}`);
      await harness.sendMessage(`把这个串原样回来: ${nonce}`);
      const reply = await harness.waitForReply({ timeoutMs: 60_000 });

      // 语义前置: 真 Claude 理解并回放 nonce, 否则测试环境本身坏了
      expect(reply).toContain(nonce);

      // C2: gateway log 不得包含 nonce (proves middleman didn't buffer plaintext)
      const logs = readGatewayLog({ path: harness.log.path });
      expect(logs).not.toContain(nonce);

      // 也不得包含 owner JWT
      expect(logs).not.toContain(harness.owner.jwt);
    } finally {
      await harness.stop();
    }
  });
});
