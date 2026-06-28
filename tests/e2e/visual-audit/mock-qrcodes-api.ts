import type { Page } from '@playwright/test';

function buildMockRowsFull() {
  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const baseUrl =
    process.env.VISUAL_AUDIT_BASE_URL?.replace(/\/$/, '') || 'https://qrclaw-test.vercel.app';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#E24A3F" width="120" height="120" rx="8"/><text x="60" y="68" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">QR</text></svg>';
  const qrDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return [
    {
      id: '11111111-1111-1111-1111-111111111111',
      agent_id: 'dfef0d02-2823-45b1-90cd-22a85733bb63',
      slug: 'customer-support',
      status: 'active',
      profile: {
        name: 'Customer Support',
        greeting: 'Hi! Scan to chat with our support team.',
        profile_url: `${baseUrl}/q/customer-support`,
        qr_image_url: qrDataUrl,
        scan_count: 1247,
        conversation_count: 89,
      },
      config_version: 1,
      created_at: iso(0),
      agents: { name: 'Visual Audit Agent' },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      agent_id: 'dfef0d02-2823-45b1-90cd-22a85733bb63',
      slug: 'sales-inquiries',
      status: 'active',
      profile: {
        name: 'Sales Inquiries',
        greeting: 'Questions about pricing? Chat with us!',
        profile_url: `${baseUrl}/q/sales-inquiries`,
        qr_image_url: qrDataUrl,
        scan_count: 856,
        conversation_count: 42,
      },
      config_version: 1,
      created_at: iso(14),
      agents: { name: 'Visual Audit Agent' },
    },
  ];
}

/**
 * Intercept Supabase REST qrcodes reads so empty / full list shots do not depend on DB + Gateway.
 */
export async function installQRCodesListMock(page: Page, mode: 'empty' | 'full'): Promise<void> {
  const rows = mode === 'full' ? buildMockRowsFull() : [];
  const body = mode === 'empty' ? '[]' : JSON.stringify(rows);
  const matchesQrcodesList = (url: string): boolean => {
    try {
      const p = new URL(url).pathname;
      return p === '/rest/v1/qrcodes' || p.endsWith('/rest/v1/qrcodes');
    } catch {
      return false;
    }
  };

  await page.route(
    (url) => matchesQrcodesList(url),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': mode === 'empty' ? '0-0/0' : `0-${rows.length - 1}/${rows.length}`,
        },
        body,
      });
    }
  );
}

export async function removeQRCodesListMock(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.unroute((url) => {
      try {
        const p = new URL(url).pathname;
        return p === '/rest/v1/qrcodes' || p.endsWith('/rest/v1/qrcodes');
      } catch {
        return false;
      }
    });
  } catch {
    /* page may be closing */
  }
}
