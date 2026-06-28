/**
 * TDD RED: Tests for CTASection subscribe interaction.
 * Feature: Landing page email subscription form.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the subscribe logic independently (not the full React component)
// since the component uses inline styles and doesn't need DOM rendering tests

describe('CTASection subscribe logic', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('should call /api/subscribe with valid email on submit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, message: 'Subscribed successfully' }),
    });

    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    const result = await submitSubscription('user@example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/subscribe');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('should reject empty email without calling API', async () => {
    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    const result = await submitSubscription('');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should reject invalid email format without calling API', async () => {
    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    const result = await submitSubscription('not-an-email');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('should handle API error response gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ success: false, error: 'Internal error' }),
    });

    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    const result = await submitSubscription('user@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle network failure gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    const result = await submitSubscription('user@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network');
  });

  it('should trim and lowercase email before sending', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, message: 'Subscribed' }),
    });

    const { submitSubscription } = await import('../../../web/src/lib/subscribe.js');
    await submitSubscription('  User@Example.COM  ');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email).toBe('user@example.com');
  });
});
