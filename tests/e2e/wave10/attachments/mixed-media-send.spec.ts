import { test } from '@playwright/test';

// OAC-Wave10-E2E-21 / R1 P1-09 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=covered; C4=not applicable; C5=not applicable.
test.describe('Attachments - mixed media send', () => {
  test.skip('sends text file, image, and prompt together and gets a combined answer', async () => {
    await test.step('Owner attaches sample.txt containing foo', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner attaches bar.png containing the visible word BAR', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner sends prompt: 请回复 <txt的内容>-<图里的英文>，全部大写。', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: reply text is exactly FOO-BAR and both attachment records stay within encrypted storage boundaries', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
