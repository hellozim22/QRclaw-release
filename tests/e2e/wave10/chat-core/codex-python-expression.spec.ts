import { test } from '@playwright/test';

// OAC-Wave10-E2E-06 / R1 P0-06 / P0
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe("Chat Core - Codex code reply", () => {
  test.skip("returns a one-line Python expression that evaluates to 2", async () => {
    await test.step("Owner switches to Codex backed by the true Codex CLI", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner sends prompt: 给我一个返回 2 的 Python 单行表达式，仅一行，不加解释。", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner waits for completion", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: normalized reply is either 1+1 or 2, or the expression evaluates to 2 in the test runner sandbox", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
