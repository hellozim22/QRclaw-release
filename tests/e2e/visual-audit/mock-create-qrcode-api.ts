import type { Page, Route } from '@playwright/test';

/** Matches mock-agents-api / mock-qrcodes stable agent id for visual audit. */
const MOCK_AGENT_ID = 'dfef0d02-2823-45b1-90cd-22a85733bb63';

const svgQr =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
      '<rect fill="#FFFFFF" width="180" height="180"/>' +
      '<rect fill="#E24A3F" x="20" y="20" width="140" height="140" rx="8"/>' +
      '</svg>'
  );

const matchesCreateQrcodePath = (url: URL): boolean =>
  url.pathname === '/api/create-qrcode' || url.pathname.endsWith('/api/create-qrcode');

const createQrcodeMockHandler = async (route: Route) => {
  const req = route.request();
  if (req.method() !== 'POST') {
    await route.continue();
    return;
  }
  const slug = `vaud${Date.now().toString(36)}`.slice(0, 12);
  const base =
    process.env.VISUAL_AUDIT_BASE_URL?.replace(/\/$/, '') || 'https://qrclaw-test.vercel.app';
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        slug,
        status: 'active',
        agent_id: MOCK_AGENT_ID,
        profile_url: `${base}/q/${slug}`,
        qr_image_url: svgQr,
      },
    }),
  });
};

/**
 * Mock Gateway create-qrcode so success step renders without real insert / ownership.
 * (Production Gateway response shape may omit fields the web client expects.)
 */
export async function installCreateQrcodeMock(page: Page): Promise<void> {
  await page.route(matchesCreateQrcodePath, createQrcodeMockHandler);
}

export async function removeCreateQrcodeMock(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.unroute(matchesCreateQrcodePath, createQrcodeMockHandler);
  } catch {
    /* page may be closing */
  }
}
