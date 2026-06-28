import { expect, test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRealClaudeHarness, type Wave10Harness } from '../../helpers/wave10-harness';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../test-results/ppt-demo');

test.describe('PPT demo — OpenClaw owner agent chat', () => {
  let harness: Wave10Harness | null = null;

  test.afterEach(async () => {
    if (harness) await harness.stop();
    harness = null;
  });

  test('clear history, create two realistic turns, and capture full-page screenshot', async ({ browser }) => {
    test.setTimeout(240_000);
    harness = await createRealClaudeHarness(browser, { runtime: 'openclaw' });
    await harness.openChat();
    await harness.page.getByRole('button', { name: 'OpenClaw Assistant · Online' }).click();
    await expect(harness.page.getByTestId('chat-header-agent-name')).toContainText('OpenClaw Assistant', { timeout: 20_000 });
    await harness.page.getByTestId('chat-header-new-session-button').click();
    await expect(harness.page.getByPlaceholder(/Type a message/)).toBeVisible({ timeout: 20_000 });
    await harness.page.screenshot({ path: `${outDir}/01-cleared-empty-chat.png`, fullPage: true });

    await harness.page.evaluate(async (id) => {
      const store = (window as any).__OWNER_AGENT_STORE__.getState();
      store.messagesByAgent[id] = [
        ...(store.messagesByAgent[id] ?? []),
        { id: 'ppt-demo-1', client_id: 'ppt-demo-1', sender_type: 'owner', content: '我想把 OpenClaw 放到咖啡店门口的二维码里，帮我设计一个顾客扫码后的首轮接待话术。', status: 'sent', created_at: new Date().toISOString() },
        { id: 'assistant-ppt-demo-1', client_id: 'assistant-ppt-demo-1', sender_type: 'agent', content: '可以。首轮建议这样说：欢迎来到「晨光咖啡」！我是店里的 OpenClaw 助手，可以帮你快速了解今日豆单、推荐饮品、查询会员优惠，也能把复杂问题转给店员。你今天更想喝清爽一点，还是浓郁一点？', status: 'sent', run_status: 'completed', created_at: new Date().toISOString() },
      ];
      store.statusByAgent[id] = 'online';
      (window as any).__OWNER_AGENT_STORE__.setState({ messagesByAgent: { ...store.messagesByAgent }, statusByAgent: { ...store.statusByAgent } });
    }, (await harness.page.locator('button[aria-pressed="true"][data-testid^="agent-list-item-"]').getAttribute('data-testid'))!.replace('agent-list-item-', ''));

    await harness.page.evaluate(async (id) => {
      const store = (window as any).__OWNER_AGENT_STORE__.getState();
      store.messagesByAgent[id] = [
        ...(store.messagesByAgent[id] ?? []),
        { id: 'ppt-demo-2', client_id: 'ppt-demo-2', sender_type: 'owner', content: '再帮我补一个店员视角的执行清单，要求简短，适合贴到收银台旁边。', status: 'sent', created_at: new Date().toISOString() },
        { id: 'assistant-ppt-demo-2', client_id: 'assistant-ppt-demo-2', sender_type: 'agent', content: '店员执行清单：1）门口二维码保持无遮挡；2）高峰期先让顾客扫码看菜单和优惠；3）遇到过敏、投诉、退款，立即人工接手；4）每天闭店前看一次热门问题，把高频问题补进话术。', status: 'sent', run_status: 'completed', created_at: new Date().toISOString() },
      ];
      store.statusByAgent[id] = 'online';
      (window as any).__OWNER_AGENT_STORE__.setState({ messagesByAgent: { ...store.messagesByAgent }, statusByAgent: { ...store.statusByAgent } });
    }, (await harness.page.locator('button[aria-pressed="true"][data-testid^="agent-list-item-"]').getAttribute('data-testid'))!.replace('agent-list-item-', ''));

    await harness.page.getByRole('button', { name: '关闭' }).click();
    await expect(harness.page.getByText('晨光咖啡')).toBeVisible({ timeout: 10_000 });
    await expect(harness.page.getByText('店员执行清单')).toBeVisible({ timeout: 10_000 });
    await harness.page.screenshot({ path: `${outDir}/02-openclaw-chat-two-turns-fullpage.png`, fullPage: true });
  });
});
