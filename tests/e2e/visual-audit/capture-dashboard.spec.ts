import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installQRCodesListMock, removeQRCodesListMock } from './mock-qrcodes-api';
import { installAgentsListMock, removeAgentsListMock } from './mock-agents-api';
import { installCreateQrcodeMock, removeCreateQrcodeMock } from './mock-create-qrcode-api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../test-results/visual-audit-20260327/implementation');

/** Echo agent from TEST_PLAN — override with VISUAL_AUDIT_AGENT_ID if needed */
const AGENT_ID = process.env.VISUAL_AUDIT_AGENT_ID || 'a26c6cf5-4eff-4d9f-aae7-45cf9a061712';

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function expectQrcodesHubVisible(page: Page) {
  await expect(page.getByText(/^My QR/i).first()).toBeVisible({ timeout: 60000 });
}

async function selectFirstAgentOnCreatePage(page: Page) {
  await expect(
    page.getByRole('heading', { name: /Select an Agent|Select Agent|Choose an Agent/i })
  ).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Failed to load agents'), {
    timeout: 30000,
  });
  await page.getByRole('img', { name: 'Visual Audit Agent' }).click();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled({
    timeout: 20000,
  });
}

type WizardAfterAgent = 'template' | 'configure' | 'legacy_customize';

async function waitForCreateWizardBranch(page: Page): Promise<WizardAfterAgent> {
  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      const legacyThree = /Standard/i.test(t) && /Minimal/i.test(t) && /Showcase/i.test(t);
      const designTemplates = /Customer Service/i.test(t) && /Choose a Template/i.test(t);
      if (/Configure Agent Profile|Preview & Configure/i.test(t)) return true;
      if (/Choose a Template|Choose Template/i.test(t)) return true;
      if (designTemplates || (legacyThree && /template/i.test(t))) return true;
      if (/Customize QR Code/i.test(t)) return true;
      const inputs = Array.from(document.querySelectorAll('input[placeholder]'));
      if (
        inputs.some((el) => {
          const p = (el.getAttribute('placeholder') || '').toLowerCase();
          return (
            p.includes('enter display name') ||
            p.includes('office reception') ||
            p.includes('e.g. office reception')
          );
        })
      ) {
        return true;
      }
      return false;
    },
    { timeout: 90000 }
  );
  const t = await page.locator('body').innerText();
  const legacyThree = /Standard/i.test(t) && /Minimal/i.test(t) && /Showcase/i.test(t);
  const designTemplates = /Customer Service/i.test(t) && /Choose a Template/i.test(t);
  if (/Configure Agent Profile|Preview & Configure/i.test(t)) return 'configure';
  if (/Choose a Template|Choose Template/i.test(t)) return 'template';
  if (designTemplates || (legacyThree && /template/i.test(t))) return 'template';
  if (/Customize QR Code/i.test(t)) return 'legacy_customize';
  const hasNewName =
    (await page.getByTestId('create-qrcode-name').count()) > 0 ||
    (await page.locator('[placeholder="Enter display name"]').count()) > 0 ||
    (await page.locator('[placeholder*="e.g. Office Reception" i]').count()) > 0;
  if (hasNewName) return 'configure';
  if ((await page.locator('input[placeholder*="Office Reception" i]').count()) > 0) {
    return 'legacy_customize';
  }
  throw new Error('Create wizard: could not detect template or configure step after Next');
}

/** After step0 + Next: lands on template (3-step) or configure (2-step deploy). */
async function afterAgentNextToTemplateOrConfigure(page: Page): Promise<WizardAfterAgent> {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  return waitForCreateWizardBranch(page);
}

async function ensureOnConfigureStep(page: Page, from: WizardAfterAgent) {
  const expectConfigureChrome = async () => {
    const testId = page.getByTestId('create-qrcode-name');
    if ((await testId.count()) > 0) {
      await expect(testId).toBeVisible({ timeout: 45000 });
      return;
    }
    await expect(
      page.getByPlaceholder(/Enter display name|Office Reception|e\.g\./i).first()
    ).toBeVisible({ timeout: 45000 });
  };
  if (from === 'configure' || from === 'legacy_customize') {
    await expectConfigureChrome();
    return;
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectConfigureChrome();
}

async function fillCreateQrDisplayName(page: Page, value: string) {
  const byTestId = page.getByTestId('create-qrcode-name');
  if ((await byTestId.count()) > 0) {
    await expect(byTestId).toBeVisible({ timeout: 10000 });
    await byTestId.fill(value);
    return;
  }
  const byNew = page.getByPlaceholder('Enter display name');
  const byEg = page.getByPlaceholder(/e\.g\. Office Reception/i);
  const byLegacy = page.getByPlaceholder(/Office Reception|e\.g\./i);
  if ((await byNew.count()) > 0) {
    await byNew.fill(value);
  } else if ((await byEg.count()) > 0) {
    await byEg.fill(value);
  } else if ((await byLegacy.count()) > 0) {
    await byLegacy.fill(value);
  } else {
    const byName = page.getByRole('textbox', { name: /Name/i });
    const byLabel = page.getByRole('textbox', { name: /^Label$/i });
    if ((await byName.count()) > 0) {
      await byName.first().fill(value);
    } else {
      await byLabel.first().fill(value);
    }
  }
}

/** New wizard requires description + system prompt for Create to enable */
async function fillCreateQrRequiredFields(page: Page, name: string) {
  await fillCreateQrDisplayName(page, name);
  const desc = page.getByTestId('create-qrcode-description');
  if ((await desc.count()) > 0) {
    await desc.fill('Friendly assistant for visitors who scan this code.');
  }
  const prompt = page.getByTestId('create-qrcode-system-prompt');
  if ((await prompt.count()) > 0) {
    await prompt.fill('You are a helpful assistant. Be concise and friendly.');
  }
}

/** Legacy 4-step wizard (Vercel pre-deploy): advance with Next until Create appears. */
async function advanceCreateWizardUntilSubmit(page: Page) {
  for (let i = 0; i < 8; i++) {
    const testId = page.getByTestId('create-qrcode-submit');
    if ((await testId.count()) > 0 && (await testId.isEnabled())) {
      return;
    }
    const createLike = page
      .getByRole('button', { name: /^(Create QR Code|Create)$/i })
      .filter({ hasNotText: /Creating/i });
    if ((await createLike.count()) > 0 && (await createLike.first().isEnabled())) {
      return;
    }
    const next = page.getByRole('button', { name: 'Next', exact: true });
    if ((await next.count()) > 0 && (await next.first().isEnabled())) {
      await next.click();
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
}

async function clickCreateQrPrimary(page: Page) {
  await advanceCreateWizardUntilSubmit(page);
  const byTestId = page.getByTestId('create-qrcode-submit');
  if ((await byTestId.count()) > 0) {
    await expect(byTestId).toBeEnabled({ timeout: 15000 });
    await byTestId.click();
    return;
  }
  const candidates = [
    page.getByRole('button', { name: 'Create QR Code', exact: true }),
    page.getByRole('button', { name: /Create QR code/i }),
    page.getByRole('button', { name: 'Create', exact: true }),
  ];
  for (const loc of candidates) {
    if ((await loc.count()) > 0) {
      await expect(loc.first()).toBeEnabled({ timeout: 15000 });
      await loc.first().click();
      return;
    }
  }
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const hit = buttons.find((b) => {
      const t = (b.textContent || '').trim();
      if (!t || b.disabled) return false;
      if (/creating/i.test(t)) return false;
      return /^(Create QR Code|Create)$/i.test(t) && !/creating/i.test(t);
    });
    hit?.click();
  });
}

test.describe('Dashboard Web 1440×900', () => {
  test.beforeAll(async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(outDir, { recursive: true });
  });

  test('Web!Dashboard-Messages.png', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible({ timeout: 60000 });
    await shot(page, 'Web!Dashboard-Messages');
  });

  test('Web!Dashboard-Streaming.png — chat shell', async ({ page }) => {
    await page.goto(`/chat/${AGENT_ID}`);
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2000);
    await shot(page, 'Web!Dashboard-Streaming');
  });

  test('Web!Dashboard-Support.png — same chat route (support agent if different)', async ({
    page,
  }) => {
    const supportId = process.env.VISUAL_AUDIT_SUPPORT_AGENT_ID || AGENT_ID;
    await page.goto(`/chat/${supportId}`);
    await page.waitForTimeout(2000);
    await shot(page, 'Web!Dashboard-Support');
  });

  test('Web!Dashboard-QRcode-Empty.png', async ({ page }) => {
    await installQRCodesListMock(page, 'empty');
    try {
      await page.goto('/qrcodes');
      await expectQrcodesHubVisible(page);
      await expect(page.getByText('No QR codes yet')).toBeVisible({ timeout: 60000 });
      await shot(page, 'Web!Dashboard-QRcode-Empty');
    } finally {
      await removeQRCodesListMock(page);
    }
  });

  test('Web!CreateQR-Step0-HasAgent.png', async ({ page }) => {
    await installAgentsListMock(page);
    try {
      await page.goto('/qrcodes/create');
      await selectFirstAgentOnCreatePage(page);
      await shot(page, 'Web!CreateQR-Step0-HasAgent');
    } finally {
      await removeAgentsListMock(page);
    }
  });

  test('Web!AddQRModal.png — CreateQR Step1 template (design Web-CreateQR-Step1-Template)', async ({
    page,
  }) => {
    await installAgentsListMock(page);
    try {
      await page.goto('/qrcodes/create');
      await selectFirstAgentOnCreatePage(page);
      const branch = await afterAgentNextToTemplateOrConfigure(page);
      if (branch !== 'template') {
        test.skip(
          true,
          'AddQRModal capture needs Create wizard template step (deploy latest web to Vercel)'
        );
      }
      await shot(page, 'Web!AddQRModal');
    } finally {
      await removeAgentsListMock(page);
    }
  });

  test('Web!CreateQR-Step2.png — Configure + preview (design Web-CreateQR-Step2-Configure)', async ({
    page,
  }) => {
    await installAgentsListMock(page);
    try {
      await page.goto('/qrcodes/create');
      await selectFirstAgentOnCreatePage(page);
      const branch = await afterAgentNextToTemplateOrConfigure(page);
      await ensureOnConfigureStep(page, branch);
      await fillCreateQrRequiredFields(page, 'Audit QR');
      await advanceCreateWizardUntilSubmit(page);
      await shot(page, 'Web!CreateQR-Step2');
    } finally {
      await removeAgentsListMock(page);
    }
  });

  test('Web!CreateQR-Success.png', async ({ page }) => {
    await installAgentsListMock(page);
    await installCreateQrcodeMock(page);
    try {
      await page.goto('/qrcodes/create');
      await selectFirstAgentOnCreatePage(page);
      const branch = await afterAgentNextToTemplateOrConfigure(page);
      await ensureOnConfigureStep(page, branch);
      await fillCreateQrRequiredFields(page, `audit-${Date.now()}`);
      await clickCreateQrPrimary(page);
      await expect(page.getByText('QR Code Created!')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: 'Go to Dashboard', exact: true })).toBeVisible({
        timeout: 15000,
      });
      await page.waitForTimeout(800);
      await shot(page, 'Web!CreateQR-Success');
    } finally {
      await removeCreateQrcodeMock(page);
      await removeAgentsListMock(page);
    }
  });

  test('Web!Dashboard-QRcode.png — list (mocked rows)', async ({ page }) => {
    await installQRCodesListMock(page, 'full');
    try {
      await page.goto('/qrcodes');
      await expectQrcodesHubVisible(page);
      await expect(page.getByText(/Customer Support|Visual Audit Agent/).first()).toBeVisible({
        timeout: 30000,
      });
      await shot(page, 'Web!Dashboard-QRcode');
    } finally {
      await removeQRCodesListMock(page);
    }
  });

  test('Web!EditQR.png — QR detail panel with Edit visible', async ({ page }) => {
    await installQRCodesListMock(page, 'full');
    try {
      await page.goto('/qrcodes');
      await expectQrcodesHubVisible(page);
      await page
        .getByText(/Customer Support|Visual Audit Agent/)
        .first()
        .click();
      await page
        .locator('button')
        .filter({ hasText: /^Edit$/ })
        .first()
        .waitFor({
          state: 'visible',
          timeout: 15000,
        });
      await shot(page, 'Web!EditQR');
    } finally {
      await removeQRCodesListMock(page);
    }
  });

  test('Web!Settings.png', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, 'Web!Settings');
  });

  test('Web!Pricing.png (no auth)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.screenshot({
      path: path.join(outDir, 'Web!Pricing.png'),
      fullPage: false,
      animations: 'disabled',
    });
    await ctx.close();
  });
});
