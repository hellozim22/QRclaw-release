import { test } from '@playwright/test';

// OAC-Wave10-E2E-08 / R1 P0-08 / P0
// Runtime: true local claude/cursor-agent/codex/openclaw binaries only; fake binary is forbidden.
// Iron laws: C1=covered; C2=not applicable; C4=not applicable; C5=not applicable.
test.describe('Chat Core - Markdown rendering', () => {
  test.skip('renders bold text and code blocks as Markdown instead of plain text', async () => {
    await test.step('Owner sends a prompt asking OpenClaw to output **bold word** and a JavaScript code block', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Owner waits for the final rendered reply', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Semantic assertions: rendered reply includes a strong element with bold word and a pre code block containing console.log(1)', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
    await test.step('Negative assertion: the whole reply is not displayed as literal Markdown source', async () => {
      // TODO: implement after Wave 10 true-runtime fixtures are available.
    });
  });
});
