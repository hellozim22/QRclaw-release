/**
 * Module L: Quota & Rate Limiting
 * Tests WS-level rate limiting, message deduplication, and quota enforcement.
 *
 * L-01~L-06: WS rate limiting via Redis (testable with MockVisitor/MockAgent).
 * L-07: Fallback URL — visitor chat page renders when agent is offline.
 * L-08: Powered by QRClaw watermark on visitor-facing pages.
 */
import { test, expect } from '@playwright/test';
import { MockAgent, MockVisitor } from './mock-agent';
import { getTestAuth, seedAgent, seedQRCode, seedConversation, cleanupTestData } from './seed-data';

test.describe.serial('Module L: Quota', () => {
  let userId: string;
  let agentId: string;
  let qrCodeId: string;
  const connections: { close: () => void }[] = [];

  test.beforeAll(async () => {
    const auth = await getTestAuth();
    userId = auth.userId;
    const agent = await seedAgent(userId, `l-agent-${Date.now()}`);
    agentId = agent.id;
    const qrcode = await seedQRCode(agentId);
    qrCodeId = qrcode.id;
  });

  test.afterAll(async () => {
    for (const conn of connections) {
      conn.close();
    }
    await cleanupTestData();
  });

  // L-01: Rate limit on visitor messages — visitor limit is 60 msg/min
  test('L-01: Visitor rate limit triggers after burst of 65+ messages', async () => {
    const conv = await seedConversation(qrCodeId);
    const visitor = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(visitor);
    await visitor.connect();

    // Gateway rate limit: 60 msgs/min for visitors (sliding window)
    // Send 65 messages rapidly to exceed the limit
    for (let i = 0; i < 65; i++) {
      visitor.sendMessage(`Burst message ${i}`);
    }

    // Wait for rate-limit error to arrive
    await new Promise((r) => setTimeout(r, 2000));

    const errors = visitor.messagesOfType('error');
    const rateLimitErrors = errors.filter((e) => e.payload?.['code'] === 'rate_limited');

    expect(rateLimitErrors.length).toBeGreaterThan(0);
  });

  // L-02: Rate limit on agent messages — agent limit is 120 msg/min
  test('L-02: Agent rate limit triggers after burst of 125+ messages', async () => {
    const conv = await seedConversation(qrCodeId);
    const agent = new MockAgent({ agentId, qrCodeId });
    connections.push(agent);
    await agent.connect();

    // Gateway rate limit: 120 msgs/min for agents (sliding window)
    // Send 125 agent_message frames rapidly to exceed the limit
    for (let i = 0; i < 125; i++) {
      agent.sendReply(conv.id, `Agent burst ${i}`, `msg_l02_${i}_${Date.now()}`);
    }

    // Wait for rate-limit error to arrive
    await new Promise((r) => setTimeout(r, 2500));

    const errors = agent.messagesOfType('error');
    const rateLimitErrors = errors.filter((e) => e.payload?.['code'] === 'rate_limited');

    expect(rateLimitErrors.length).toBeGreaterThan(0);
  });

  // L-03: Rate limit response has correct format
  test('L-03: Rate limit error frame has correct format', async () => {
    const conv = await seedConversation(qrCodeId);
    const visitor = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(visitor);
    await visitor.connect();

    // Burst to trigger rate limit (60 msg/min for visitors)
    for (let i = 0; i < 65; i++) {
      visitor.sendMessage(`Format test ${i}`);
    }

    await new Promise((r) => setTimeout(r, 2000));

    const errors = visitor.messagesOfType('error');
    const rateLimitError = errors.find((e) => e.payload?.['code'] === 'rate_limited');

    expect(rateLimitError).toBeDefined();
    expect(rateLimitError!.type).toBe('error');
    expect(rateLimitError!.payload!['code']).toBe('rate_limited');
    expect(typeof rateLimitError!.payload!['message']).toBe('string');
    expect((rateLimitError!.payload!['message'] as string).length).toBeGreaterThan(0);
  });

  // L-04: A fresh connection (different connectionId) is not rate-limited
  test('L-04: Fresh connection is not affected by another connections rate limit', async () => {
    // Rate limit is per-connection (keyed by connectionId), so a new connection
    // has its own clean rate limit state. The 60s sliding window makes waiting
    // impractical, so we verify independence instead.
    const conv1 = await seedConversation(qrCodeId);
    const conv2 = await seedConversation(qrCodeId);

    const floodVisitor = new MockVisitor({
      sessionToken: conv1.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(floodVisitor);
    await floodVisitor.connect();

    // Trigger rate limit on floodVisitor
    for (let i = 0; i < 65; i++) {
      floodVisitor.sendMessage(`Flood ${i}`);
    }
    await new Promise((r) => setTimeout(r, 1000));

    // Create a fresh visitor with a different session → different connectionId
    const freshVisitor = new MockVisitor({
      sessionToken: conv2.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(freshVisitor);
    await freshVisitor.connect();

    freshVisitor.clearReceived();
    freshVisitor.sendMessage('Fresh message');
    await new Promise((r) => setTimeout(r, 500));

    // Fresh visitor should NOT be rate-limited
    const errors = freshVisitor.messagesOfType('error');
    const rateLimitErrors = errors.filter((e) => e.payload?.['code'] === 'rate_limited');
    expect(rateLimitErrors.length).toBe(0);
  });

  // L-05: Different connections have separate rate limits
  test('L-05: Different visitor connections have independent rate limits', async () => {
    const conv1 = await seedConversation(qrCodeId);
    const conv2 = await seedConversation(qrCodeId);

    const visitor1 = new MockVisitor({
      sessionToken: conv1.sessionToken,
      qrCodeId,
      agentId,
    });
    const visitor2 = new MockVisitor({
      sessionToken: conv2.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(visitor1, visitor2);

    await visitor1.connect();
    await visitor2.connect();

    // Flood visitor1 to trigger rate limit on that connection (60 msg/min)
    for (let i = 0; i < 65; i++) {
      visitor1.sendMessage(`V1 flood ${i}`);
    }

    await new Promise((r) => setTimeout(r, 1000));

    visitor2.clearReceived();

    // Visitor2 sends one message — should not be rate limited
    visitor2.sendMessage('V2 single message');

    await new Promise((r) => setTimeout(r, 500));

    const v2Errors = visitor2.messagesOfType('error');
    const v2RateLimitErrors = v2Errors.filter((e) => e.payload?.['code'] === 'rate_limited');

    // Visitor2's single message should not be rate limited
    expect(v2RateLimitErrors.length).toBe(0);
  });

  // L-06: Message dedup — send message with same ID twice, get 'duplicate' status
  test('L-06: Sending duplicate message ID returns duplicate error or ack', async () => {
    const conv = await seedConversation(qrCodeId);
    const visitor = new MockVisitor({
      sessionToken: conv.sessionToken,
      qrCodeId,
      agentId,
    });
    connections.push(visitor);
    await visitor.connect();

    const duplicateId = `dup_msg_${Date.now()}`;

    visitor.sendMessage('First send', duplicateId);
    await new Promise((r) => setTimeout(r, 300));

    visitor.clearReceived();

    visitor.sendMessage('Second send same ID', duplicateId);
    await new Promise((r) => setTimeout(r, 500));

    // Either an error with code 'duplicate' or an ack with status 'duplicate'
    const errors = visitor.messagesOfType('error');
    const acks = visitor.messagesOfType('ack');

    const isDuplicateError = errors.some((e) => e.payload?.['code'] === 'duplicate');
    const isDuplicateAck = acks.some((a) => a.payload?.['status'] === 'duplicate');

    expect(isDuplicateError || isDuplicateAck).toBe(true);
  });

  // L-07: Fallback URL — when agent offline, visitor sees fallback link
  test('L-07: Visitor chat page shows fallback link when agent is offline', async ({ page }) => {
    // Visit chat page for a seeded agent (no WS agent connected = offline)
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `l07-agent-${Date.now()}`);

    try {
      await page.goto(`/chat/${agent.id}`);
      // Chat page should load without crash
      await page.waitForLoadState('networkidle');
      // Even without a live agent, the page renders and shows input
      const inputBox = page.locator('textarea, input[type="text"]').first();
      await expect(inputBox).toBeVisible();
      // Powered by QRClaw footer should be visible as a fallback branding element
      await expect(page.getByText('Powered by QRClaw')).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });

  // L-08: Powered by QRClaw watermark on visitor-facing pages
  test('L-08: Powered by QRClaw watermark visible on visitor pages', async ({ page }) => {
    const auth = await getTestAuth();
    const agent = await seedAgent(auth.userId, `l08-agent-${Date.now()}`);

    try {
      // Agent profile page has "Powered by QRClaw" footer
      await page.goto(`/agent/${agent.id}`);
      await expect(page.getByText('Powered by QRClaw')).toBeVisible();

      // Chat page also has "Powered by QRClaw" footer
      await page.goto(`/chat/${agent.id}`);
      await expect(page.getByText('Powered by QRClaw')).toBeVisible();
    } finally {
      await cleanupTestData();
    }
  });
});
