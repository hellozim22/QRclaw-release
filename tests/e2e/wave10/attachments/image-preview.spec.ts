import { test } from '@playwright/test';

// OAC-Wave10-E2E-14 / R1 P1-02 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=covered; C4=not applicable; C5=not applicable.
test.describe('Attachments - image OCR preview', () => {
  test.skip('answers the visible word from an uploaded PNG screenshot', async () => {
    await test.step('Owner attaches ocr-test.png containing the word WAVE10', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner confirms the image preview is associated with the outgoing message', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner sends prompt: 图中有一个英文单词，只回复该单词大写形式。', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: reply uppercased text is exactly WAVE10 and image bytes are stored through encrypted attachment boundaries', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
