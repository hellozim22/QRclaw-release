import { test } from '@playwright/test';

// OAC-Wave10-E2E-10 / R1 P0-10 / P0
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=covered.
test.describe("Session Management - conversation context", () => {
  test.skip("keeps two prompt turns in one conversation", async () => {
    await test.step("Owner sends first prompt: 请记住数字 77，只回答\"收到\"。", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner waits for the first reply", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner sends second prompt: 刚才我让你记住的数字是多少？只回答数字。", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: second reply is exactly 77 and both requests share the same conversation_id", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
