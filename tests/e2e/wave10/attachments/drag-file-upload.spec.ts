import { test } from '@playwright/test';

// OAC-Wave10-E2E-13 / R1 P1-01 / P1
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=covered; C4=not applicable; C5=not applicable.
test.describe("Attachments - text file upload", () => {
  test.skip("echoes the first line of an uploaded text file", async () => {
    await test.step("Test creates sample.txt with contents hello-wave10 followed by line2", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner attaches sample.txt in the chat input", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Owner sends prompt: 读取附带文件的第一行并原样返回。", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step("Semantic assertions: reply text is exactly hello-wave10, upload uses multipart, and persisted attachment metadata does not store plaintext content", async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
