import { test } from '@playwright/test';

// OAC-Wave10-E2E-20 / R1 P1-08 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=covered; C4=not applicable; C5=not applicable.
test.describe('Chat Core - long prompt delivery', () => {
  test.skip('delivers an 8 KB prompt to the provider without truncation', async () => {
    await test.step('Test constructs prompt: 请忽略以下所有文字，只回答"OK"： plus about 7800 bytes of random ASCII', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner sends the prompt to Claude Code', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner captures the outbound network payload size', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: reply is exactly OK and payload size is between 8000 and 12000 bytes without truncation', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
