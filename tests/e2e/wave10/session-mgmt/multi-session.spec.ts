import { test } from '@playwright/test';

// OAC-Wave10-E2E-15 / R1 P1-03 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=covered.
test.describe("Session Management - agent context isolation", () => {
  test.skip("does not leak remembered context across providers", async () => {
    await test.step("Owner asks Claude Code to remember number 111", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner switches to Codex and asks what number was remembered", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner switches back to Claude Code and asks the same question", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: Codex reply does not contain 111, while Claude Code reply does contain 111", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
