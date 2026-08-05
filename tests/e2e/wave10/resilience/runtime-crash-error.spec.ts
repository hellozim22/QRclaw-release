import { test } from '@playwright/test';

// OAC-Wave10-E2E-26 / R1 P2-02 / P2
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe('Resilience - runtime crash error', () => {
  test.skip('surfaces a true runtime crash as failed instead of completed', async () => {
    await test.step('Owner starts an OpenClaw run through the true local CLI', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Test kills the OpenClaw process during the run', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner waits for the UI terminal state', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: bubble status contains failed or runtime error, run_status is failed, and no completed checkmark is rendered', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
