import { test } from '@playwright/test';

// OAC-Wave10-E2E-16 / R1 P1-04 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe('Agent Edit - instructions injection', () => {
  test.skip('applies saved instructions to a later English prompt', async () => {
    await test.step('Owner opens Cursor Agent settings', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner saves instructions: Always reply in Simplified Chinese.', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner sends prompt: What is the capital of France? One word answer.', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: reply contains Chinese characters and 巴黎, and the request payload includes the saved instructions field', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
