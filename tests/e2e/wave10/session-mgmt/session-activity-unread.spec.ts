import { test } from '@playwright/test';

// OAC-Wave10-E2E-22 / R1 P1-10 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=covered.
test.describe("Session Management - activity order and unread state", () => {
  test.skip("sorts sessions by recent activity and clears unread after opening", async () => {
    await test.step("Owner sends one message to Codex", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner switches to OpenClaw and sends one message", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("A Codex-side activity arrives while Claude Code is selected", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: left rail order places Codex above OpenClaw, Codex shows unread count 1, and the unread badge disappears after opening Codex", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
