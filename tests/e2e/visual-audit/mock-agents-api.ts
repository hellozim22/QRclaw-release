import type { Page, Route } from '@playwright/test';

/** Same id as mock QR rows in mock-qrcodes-api.ts — stable label for wizard + list shots. */
const MOCK_AGENT = {
  id: 'dfef0d02-2823-45b1-90cd-22a85733bb63',
  owner_id: '27f45189-de0f-4399-8bba-acbed3ed4795',
  name: 'Visual Audit Agent',
  status: 'active',
  ws_connected: true,
  last_seen_at: null as string | null,
  created_at: '2026-03-27T12:00:00.000Z',
};

const MOCK_BODY = JSON.stringify([MOCK_AGENT]);

const matchesAgentsList = (url: URL): boolean =>
  url.pathname === '/rest/v1/agents' || url.pathname.endsWith('/rest/v1/agents');

const agentsListHandler = async (route: Route) => {
  if (route.request().method() !== 'GET') {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: MOCK_BODY,
  });
};

/**
 * Intercept Supabase REST agents reads so Create QR wizard does not depend on account agents.
 */
export async function installAgentsListMock(page: Page): Promise<void> {
  await page.route(matchesAgentsList, agentsListHandler);
}

export async function removeAgentsListMock(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.unroute(matchesAgentsList, agentsListHandler);
  } catch {
    /* page may be closing */
  }
}
