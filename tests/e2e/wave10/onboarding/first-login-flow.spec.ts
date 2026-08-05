import { test } from '@playwright/test';

// OAC-Wave10-E2E-12 / R1 P0-12 / P0
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe('Onboarding - first login readiness', () => {
  test.skip('renders the chat dashboard ready to use within the first paint budget', async () => {
    await test.step('Owner records performance.now before navigating to /chat', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner waits until the agent list is rendered and the message input is enabled', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner captures network requests during the first load', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: first interactive chat state is ready within 1500 ms P95 and /api/owner/agents is fetched only once', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
