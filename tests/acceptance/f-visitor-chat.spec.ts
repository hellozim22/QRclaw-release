import { test, expect } from '@playwright/test';
import { getTestAuth, seedAgent, seedQRCode, cleanupTestData } from './seed-data';

test.describe('Module F: Visitor Chat UI', () => {
  test('F-01: Agent profile page - avatar, name, Message button', async ({ page }) => {
    const auth = await getTestAuth();
    const agentName = `f01-agent-${Date.now()}`;
    const agent = await seedAgent(auth.userId, agentName);

    try {
      await page.goto(`/agent/${agent.id}`);
      // Name heading
      await expect(page.getByRole('heading', { name: agentName })).toBeVisible();
      // Message button
      const msgBtn = page.getByRole('button', { name: /message/i });
      await expect(msgBtn).toBeVisible();
      // Avatar shows first letter of name (no img for seeded agents without avatar)
      const firstLetter = agentName.charAt(0).toUpperCase();
      await expect(page.getByText(firstLetter).first()).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  test('F-01b: Agent profile page - conversations count visible', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f01b-agent-${Date.now()}`);

    try {
      await page.goto(`/agent/${agent.id}`);
      await expect(page.getByText(/0 conversations served/i)).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  test('F-01c: Agent profile page - Sign in link to save conversations', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f01c-agent-${Date.now()}`);

    try {
      await page.goto(`/agent/${agent.id}`);
      const signInLink = page.getByRole('link', { name: /sign in/i });
      await expect(signInLink).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  test('F-07: Chat page layout - TopBar and input box', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f07-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      // Input box
      const inputBox = page.locator('textarea, input[type="text"]').first();
      await expect(inputBox).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  test.skip('F-07b: Chat page - mock messages are shown (skipped: seeded agents have no initial messages)', async ({
    page,
  }) => {
    // Seeded agents don't have mock messages
  });

  test('F-08: Visitor send message - type and send, bubble appears', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f08-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      await page.waitForSelector('textarea, input[type="text"]');
      const input = page.locator('textarea, input[type="text"]').first();
      await input.fill('Hello test message');
      await input.press('Enter');
      await expect(page.getByText('Hello test message')).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // F-02: Navigate to /agent/[agentId] with seeded agent
  test('F-02: Seeded agent profile page loads at /agent/[agentId]', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f02-agent-${Date.now()}`);

    try {
      const response = await page.goto(`/agent/${agent.id}`);
      // Page should load (not 404)
      expect(response?.status()).not.toBe(404);
      await expect(page).not.toHaveTitle(/404/i);
    } finally {
      await cleanupTestData();
    }
  });

  // F-03: Visit /chat/[agentId] with seeded agent
  test('F-03: Chat page loads at /chat/[agentId] for seeded agent', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f03-agent-${Date.now()}`);

    try {
      const response = await page.goto(`/chat/${agent.id}`);
      // Page should load (not 404)
      expect(response?.status()).not.toBe(404);
      await expect(page).not.toHaveTitle(/404/i);
    } finally {
      await cleanupTestData();
    }
  });

  // F-04: Chat page has input box and submit button
  test('F-04: Chat page has input box and submit button', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f04-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      const inputBox = page.locator('textarea, input[type="text"]').first();
      await expect(inputBox).toBeVisible();
      // Send button is an icon button (ArrowUp) with type="submit", no text label
      const sendBtn = page.locator('button[type="submit"]').first();
      await expect(sendBtn).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // F-05: Chat page connection indicator (check for WS indicator if visible)
  test('F-05: Chat page loads without JS errors', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f05-agent-${Date.now()}`);
    const jsErrors: string[] = [];

    page.on('pageerror', (err) => jsErrors.push(err.message));

    try {
      await page.goto(`/chat/${agent.id}`);
      await page.waitForLoadState('networkidle');
      // No critical JS errors on load
      const criticalErrors = jsErrors.filter(
        (e) => !e.includes('Warning') && !e.includes('favicon')
      );
      expect(criticalErrors).toHaveLength(0);
    } finally {
      await cleanupTestData();
    }
  });

  // F-06: Visitor can type and send a message in chat UI
  test('F-06: Visitor can type and send a message on seeded agent chat page', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f06-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      await page.waitForSelector('textarea, input[type="text"]');
      const input = page.locator('textarea, input[type="text"]').first();
      await input.fill('Test message F-06');
      await input.press('Enter');
      await expect(page.getByText('Test message F-06')).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // F-09: RegisterBanner shown for anonymous visitor on chat page
  test('F-09: RegisterBanner prompts visitor to sign up', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f09-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      // RegisterBanner shows "Sign up to save chats" text and a Sign up link
      await expect(page.getByText(/sign up to save chats/i)).toBeVisible();
      await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // F-10: Suggested questions displayed and clickable
  test('F-10: Suggested questions shown and send message on click', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f10-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      // Wait for suggested questions to render
      const suggestedContainer = page.locator('[data-testid="suggested-questions"]');
      await expect(suggestedContainer).toBeVisible();
      // At least one suggested question button
      const buttons = suggestedContainer.locator('button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      // Click the first suggested question
      const firstQuestion = await buttons.first().textContent();
      await buttons.first().click();
      // The text should appear as a sent message bubble (use .last() to avoid matching the button itself)
      await expect(page.getByText(firstQuestion!.trim()).last()).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // F-11: Paused QR code → navigate to agent page, check for paused indicator
  test('F-11: Paused QR code agent page loads without crash', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f11-agent-${Date.now()}`);
    await seedQRCode(agent.id, `f11-qr-${Date.now().toString(36)}`, 'paused');

    try {
      const response = await page.goto(`/agent/${agent.id}`);
      expect(response?.status()).not.toBe(500);
      await expect(page).not.toHaveTitle(/500/i);
    } finally {
      await cleanupTestData();
    }
  });

  // F-12: Chat menu with Reset Session
  test('F-12: Chat menu shows Reset Session option', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `f12-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      // Click the ••• menu button
      const menuBtn = page.locator('[data-testid="chat-menu-button"]');
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();
      // Dropdown should appear with Reset Session
      const dropdown = page.locator('[data-testid="chat-menu-dropdown"]');
      await expect(dropdown).toBeVisible();
      const resetItem = dropdown.getByRole('menuitem', { name: /reset session/i });
      await expect(resetItem).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });
});
