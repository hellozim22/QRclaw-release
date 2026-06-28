import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deriveGatewayBaseUrl,
  TOOL_NAME,
  createQrcodeToolInputSchema,
  handleCreateQrcode,
} from '../src/tools/create-qrcode.js';

describe('tools/create-qrcode', () => {
  describe('TOOL_NAME', () => {
    it('follows OpenClaw tool naming convention', () => {
      expect(TOOL_NAME).toBe('qrclaw_create_qrcode');
    });
  });

  describe('deriveGatewayBaseUrl', () => {
    it('converts ws://localhost:3001/ws to http://localhost:3001', () => {
      expect(deriveGatewayBaseUrl('ws://localhost:3001/ws')).toBe('http://localhost:3001');
    });

    it('converts wss://g.qrclaw.ai/ws to https://g.qrclaw.ai', () => {
      expect(deriveGatewayBaseUrl('wss://g.qrclaw.ai/ws')).toBe('https://g.qrclaw.ai');
    });

    it('converts wss://gateway.example.com/ws to https://gateway.example.com', () => {
      expect(deriveGatewayBaseUrl('wss://gateway.example.com/ws')).toBe(
        'https://gateway.example.com'
      );
    });

    it('handles ws:// without /ws suffix', () => {
      expect(deriveGatewayBaseUrl('ws://localhost:3001')).toBe('http://localhost:3001');
    });

    it('handles wss:// without /ws suffix', () => {
      expect(deriveGatewayBaseUrl('wss://g.qrclaw.ai')).toBe('https://g.qrclaw.ai');
    });

    it('passes through http:// URLs unchanged', () => {
      expect(deriveGatewayBaseUrl('http://localhost:3001')).toBe('http://localhost:3001');
    });

    it('passes through https:// URLs unchanged', () => {
      expect(deriveGatewayBaseUrl('https://g.qrclaw.ai')).toBe('https://g.qrclaw.ai');
    });
  });

  describe('createQrcodeToolInputSchema (hand-written JSON schema)', () => {
    const schema = createQrcodeToolInputSchema;

    it('has type object', () => {
      expect(schema.type).toBe('object');
    });

    it('requires label', () => {
      expect(schema.required).toContain('label');
    });

    it('has label as string', () => {
      expect(schema.properties.label.type).toBe('string');
    });

    it('has system_prompt as optional string', () => {
      expect(schema.properties.system_prompt.type).toBe('string');
      expect(schema.required).not.toContain('system_prompt');
    });

    it('has callback_hint as optional string', () => {
      expect(schema.properties.callback_hint.type).toBe('string');
      expect(schema.required).not.toContain('callback_hint');
    });

    it('has agent_account_label as optional string', () => {
      expect(schema.properties.agent_account_label.type).toBe('string');
      expect(schema.required).not.toContain('agent_account_label');
    });

    it('matches Zod schema field names', async () => {
      const { agentCreateQrcodeSchema } =
        await import('../../../shared/contracts/http/agent/protocol.js');
      const zodShape = agentCreateQrcodeSchema.shape;
      const jsonKeys = Object.keys(schema.properties).sort();
      const zodKeys = Object.keys(zodShape).sort();

      expect(jsonKeys).toEqual(zodKeys);
    });
  });

  describe('handleCreateQrcode', () => {
    const mockFetch = vi.fn();
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.clearAllMocks();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    const baseContext = {
      agentToken: 'qak_test_token',
      gatewayWsUrl: 'wss://gw.example.com/ws',
    };

    it('sends POST with correct body and Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            data: {
              qr_code_id: 'qr-001',
              slug: 'abc123',
              qr_image_url: 'https://qrclaw.ai/api/qr/abc123',
              public_url: 'https://qrclaw.ai/q/abc123',
              expires_at: null,
            },
          }),
      });

      const result = await handleCreateQrcode(baseContext, { label: 'My QR' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gw.example.com/api/agent/create-qrcode',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer qak_test_token',
          }),
          body: JSON.stringify({ label: 'My QR' }),
        })
      );

      expect(result).toEqual({
        qr_code_id: 'qr-001',
        slug: 'abc123',
        qr_image_url: 'https://qrclaw.ai/api/qr/abc123',
        public_url: 'https://qrclaw.ai/q/abc123',
        expires_at: null,
      });
    });

    it('returns response data on 200/201', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              qr_code_id: 'qr-002',
              slug: 'xyz789',
              qr_image_url: 'https://qrclaw.ai/api/qr/xyz789',
              public_url: 'https://qrclaw.ai/q/xyz789',
              expires_at: '2026-05-01T00:00:00Z',
            },
          }),
      });

      const result = await handleCreateQrcode(baseContext, { label: 'Test' });
      expect(result.qr_code_id).toBe('qr-002');
      expect(result.expires_at).toBe('2026-05-01T00:00:00Z');
    });

    it('surfaces rate_limited on 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: { code: 'rate_limited', message: 'Rate limit exceeded' },
          }),
      });

      const err = await handleCreateQrcode(baseContext, { label: 'Test' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { code: string }).code).toBe('rate_limited');
    });

    it('surfaces unauthorized on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'unauthorized', message: 'Invalid agent token' },
          }),
      });

      const err = await handleCreateQrcode(baseContext, { label: 'Test' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { code: string }).code).toBe('unauthorized');
    });

    it('wraps fetch exceptions instead of propagating raw errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(handleCreateQrcode(baseContext, { label: 'Test' })).rejects.toThrow(
        /fetch.*fail/i
      );
    });

    it('includes all optional fields in the body when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            data: {
              qr_code_id: 'qr-003',
              slug: 'full',
              qr_image_url: 'https://qrclaw.ai/api/qr/full',
              public_url: 'https://qrclaw.ai/q/full',
              expires_at: null,
            },
          }),
      });

      await handleCreateQrcode(baseContext, {
        label: 'Full QR',
        system_prompt: 'Be helpful',
        callback_hint: 'https://example.com/callback',
        agent_account_label: 'secondary',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.label).toBe('Full QR');
      expect(body.system_prompt).toBe('Be helpful');
      expect(body.callback_hint).toBe('https://example.com/callback');
      expect(body.agent_account_label).toBe('secondary');
    });
  });
});
