import { test } from '@playwright/test';

// OAC-Wave10-E2E-11 / R1 P0-11 / P0
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe("Onboarding - offline agent state", () => {
  test.skip("marks an offline runtime clearly and does not fake send success", async () => {
    await test.step("Test pauses the true OpenClaw CLI process with pkill -STOP", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner observes the OpenClaw status row for up to five seconds", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner attempts to send a message to OpenClaw", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: status text contains offline, outgoing bubble remains pending, and no Gateway SSE message event is consumed", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Cleanup step resumes the OpenClaw CLI process with pkill -CONT", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
