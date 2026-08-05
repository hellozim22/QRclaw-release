import { test } from '@playwright/test';

// OAC-Wave10-E2E-27 / R1 P2-03 / P2
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe('Chat Core - oversized prompt handling', () => {
  test.skip('rejects or preserves a 64 KB prompt without silent truncation', async () => {
    await test.step('Owner pastes a 64 KB prompt into the message input', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner clicks send', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Test compares the pre-send prompt hash with the accepted payload or decrypted persisted value', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: UI either shows an explicit max-size error or sends the full payload; silent truncation is forbidden', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
