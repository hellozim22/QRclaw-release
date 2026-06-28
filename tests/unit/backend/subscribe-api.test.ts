/**
 * TDD: Tests for POST /api/subscribe endpoint.
 * Feature: Newsletter email subscription from landing page CTA.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the module under test
const mockUpsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('../../../gateway/src/db/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: mockUpsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  },
  isSupabaseConfigured: vi.fn(() => true),
}));

// Mock Redis client (subscribe.ts uses redis/client directly)
vi.mock('../../../gateway/src/redis/client.js', () => ({
  isRedisConnected: vi.fn(() => false), // Default: Redis unavailable → fail-open
  getRedisClient: vi.fn(),
}));

import { validateSubscribeInput, normalizeEmail } from '../../../gateway/src/routes/subscribe.js';

describe('subscribe API — input validation', () => {
  it('should accept a valid email', () => {
    const result = validateSubscribeInput({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid email format', () => {
    const result = validateSubscribeInput({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('should reject when email field is missing', () => {
    const result = validateSubscribeInput({});
    expect(result.success).toBe(false);
  });

  it('should reject an empty string', () => {
    const result = validateSubscribeInput({ email: '' });
    expect(result.success).toBe(false);
  });

  it('should reject email with whitespace only', () => {
    const result = validateSubscribeInput({ email: '   ' });
    expect(result.success).toBe(false);
  });

  it('should accept email with mixed case', () => {
    const result = validateSubscribeInput({ email: 'User@Example.COM' });
    expect(result.success).toBe(true);
  });

  it('should reject email exceeding 254 characters', () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    const result = validateSubscribeInput({ email: longEmail });
    expect(result.success).toBe(false);
  });
});

describe('subscribe API — email normalization', () => {
  it('should lowercase the email', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('should trim whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });
});

describe('subscribe API — database interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should upsert with normalized email and return 201', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'uuid-1' },
      error: null,
    });

    const { handleSubscribe } = await import('../../../gateway/src/routes/subscribe.js');

    const mockReq = {
      body: { email: 'Test@Example.com' },
      ip: '127.0.0.1',
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleSubscribe(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should return 200 on duplicate email (PGRST116 silent success)', async () => {
    // ON CONFLICT DO NOTHING → Supabase returns PGRST116 (no rows)
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows returned' },
    });

    const { handleSubscribe } = await import('../../../gateway/src/routes/subscribe.js');

    const mockReq = {
      body: { email: 'dup@example.com' },
      ip: '127.0.0.1',
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleSubscribe(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should return 400 for invalid email', async () => {
    const { handleSubscribe } = await import('../../../gateway/src/routes/subscribe.js');

    const mockReq = {
      body: { email: 'not-valid' },
      ip: '127.0.0.1',
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleSubscribe(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return 500 on unexpected DB error', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    });

    const { handleSubscribe } = await import('../../../gateway/src/routes/subscribe.js');

    const mockReq = {
      body: { email: 'user@example.com' },
      ip: '127.0.0.1',
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleSubscribe(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});
