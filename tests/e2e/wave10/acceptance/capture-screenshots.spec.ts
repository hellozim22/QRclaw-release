/**
 * Wave 10 验收截图采集 spec
 *
 * 产出 docs/wave10-acceptance.md 引用的 8 张截图:
 *   01-login.png
 *   02-dashboard-runtimes.png
 *   03-chat-empty.png
 *   04-message-sent.png
 *   05-reply-streaming.png
 *   06-reply-complete-markdown.png
 *   07-reload-history.png
 *   08-multiple-sessions.png
 *
 * 门控: 默认 test.skip, 只有 WAVE10_ACCEPTANCE=1 才跑, 不污染常规 green lane.
 * 使用真 claude CLI — 禁 fake binary.
 */

import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createRealClaudeHarness } from "../../../helpers/wave10-harness";

const OUT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../test-results/wave10-acceptance-screenshots",
);
mkdirSync(OUT, { recursive: true });
const shot = (name: string) => path.join(OUT, name);

const enabled = process.env.WAVE10_ACCEPTANCE === "1";

test.describe("Wave 10 acceptance screenshots", () => {
  test.skip(!enabled, "set WAVE10_ACCEPTANCE=1 to capture acceptance shots");
  test.setTimeout(240_000);

  test("8 demo screenshots (real claude CLI)", async ({ browser }) => {
    // --- 01 login (unauthenticated) ---
    // Fresh context, no harness yet.
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto("/login");
    await anonPage.waitForLoadState("networkidle").catch(() => {});
    await anonPage.screenshot({ path: shot("01-login.png"), fullPage: false });
    await anonCtx.close();

    // --- 02-08 authenticated + real claude session ---
    const harness = await createRealClaudeHarness(browser, {
      runtime: "claude",
      requireRealCli: true,
    });
    const { page } = harness;
    try {
      // 02 dashboard with runtime rail (online dot on claude)
      await harness.openChat();
      await page.waitForTimeout(1_000);
      await page.screenshot({
        path: shot("02-dashboard-runtimes.png"),
        fullPage: false,
      });

      // 03 chat empty — claude selected, no messages yet
      const rail = page.locator('[data-testid="agent-list-rail"]');
      await rail.locator('button[aria-label^="Claude Code"]').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot("03-chat-empty.png"), fullPage: false });

      // 04 message sent — owner prompt bubble visible
      await harness.sendMessage(
        "只输出数字 42, 不要其他任何内容, 不要标点, 不要引号",
      );
      // Wait for user bubble to render (optimistic insert fires synchronously).
      await page.waitForTimeout(1_500);
      await page.screenshot({
        path: shot("04-message-sent.png"),
        fullPage: false,
      });

      // 05 reply streaming — first deltas are arriving but not yet stable
      await page
        .locator(".aui-assistant-message-content")
        .first()
        .waitFor({ timeout: 60_000 });
      // Quick snapshot while stream is (likely) still in-flight.
      await page.screenshot({
        path: shot("05-reply-streaming.png"),
        fullPage: false,
      });

      // 06 reply complete — wait for text to stabilize and contain "42"
      const reply = await harness.waitForReply({ timeoutMs: 120_000 });
      expect(reply).toContain("42");
      await page.screenshot({
        path: shot("06-reply-complete-markdown.png"),
        fullPage: false,
      });

      // 07 reload history — reload the page, wait for replay
      await page.reload();
      await page.waitForLoadState("networkidle").catch(() => {});
      await rail.locator('button[aria-label^="Claude Code"]').click().catch(() => {});
      await page.waitForTimeout(2_500);
      // The reply bubble should still be present (post-reload replay).
      await page
        .locator(".aui-assistant-message-content")
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(() => {});
      await page.screenshot({
        path: shot("07-reload-history.png"),
        fullPage: false,
      });

      // 08 multiple sessions — open the session list's "+ New Session" (if any)
      // and click a second runtime slot (cursor/codex) to show the rail has 4.
      // This stays within Sprint 1 semantics (rail + session list visible).
      const newSessionBtn = page.getByRole("button", { name: /新建 session|new session|\+ new/i });
      if (await newSessionBtn.count().catch(() => 0)) {
        await newSessionBtn.first().click().catch(() => {});
        await page.waitForTimeout(500);
      }
      // Click another runtime slot to demonstrate multiple-agent isolation.
      const others = rail.locator("button[aria-label]");
      const total = await others.count();
      if (total >= 2) {
        await others.nth(1).click().catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.screenshot({
        path: shot("08-multiple-sessions.png"),
        fullPage: false,
      });
    } finally {
      await harness.stop();
    }
  });
});
