import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, type Harness, type CreateQrcodeHandler } from './harness.js';
import pluginEntry from '../../index.js';
import type { OpenClawPluginApi } from '../../src/openclaw-types.js';

describe('e2e: tool qrclaw_create_qrcode', () => {
  let harness: Harness;

  afterEach(async () => {
    if (harness) await harness.teardown();
  });

  function registerAndGetTool(h: Harness) {
    pluginEntry.register(h.mockApi as OpenClawPluginApi);
    const tool = h.registeredTools.find((t) => t.name === 'qrclaw_create_qrcode');
    if (!tool) throw new Error('qrclaw_create_qrcode tool was not registered');
    return tool;
  }

  it('success: calls gateway with correct auth + body, returns data', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_tool_tok' } },
    });

    const mockResponse = {
      qr_code_id: 'qr-123',
      slug: 'my-bot',
      public_url: 'https://qrclaw.ai/c/my-bot',
      qr_image_url: 'https://qrclaw.ai/qr/my-bot.png',
      expires_at: null,
    };

    harness.setCreateQrcodeHandler((_url, _init) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: mockResponse }),
      text: async () => JSON.stringify({ data: mockResponse }),
    }));

    const tool = registerAndGetTool(harness);
    const result = await tool.execute('exec-1', { label: 'My Bot' });

    const createCalls = harness.fetchCalls.filter((c) =>
      c.url.includes('/api/agent/create-qrcode')
    );
    expect(createCalls).toHaveLength(1);

    const call = createCalls[0];
    const headers = call.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer qak_tool_tok');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(call.init?.body as string);
    expect(body.label).toBe('My Bot');

    const data = JSON.parse(result.content[0].text);
    expect(data.qr_code_id).toBe('qr-123');
    expect(data.slug).toBe('my-bot');
    expect(data.public_url).toBe('https://qrclaw.ai/c/my-bot');
    expect(data.qr_image_url).toBe('https://qrclaw.ai/qr/my-bot.png');
    expect(data.expires_at).toBeNull();
  });

  it('rate-limit: 429 → surfaces rate_limited error', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_tool_rl' } },
    });

    const handler: CreateQrcodeHandler = () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'rate_limited', message: 'Too many requests' } }),
      text: async () =>
        JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
    });
    harness.setCreateQrcodeHandler(handler);

    const tool = registerAndGetTool(harness);
    const result = await tool.execute('exec-2', { label: 'Rate Test' });

    expect(result.content[0].text).toMatch(/Error:.*Too many requests/);
  });

  it('auth failure: 401 → surfaces unauthorized error', async () => {
    harness = await createHarness({
      accounts: { default: { agentToken: 'qak_tool_bad' } },
    });

    const handler: CreateQrcodeHandler = () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
      text: async () =>
        JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
    });
    harness.setCreateQrcodeHandler(handler);

    const tool = registerAndGetTool(harness);
    const result = await tool.execute('exec-3', { label: 'Auth Test' });

    expect(result.content[0].text).toMatch(/Error:.*Unauthorized/);
  });
});
