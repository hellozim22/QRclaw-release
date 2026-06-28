import { describe, it, expect, vi } from 'vitest';
import { generateQrcodeSlug, createQrcodeViaSupabase } from '@/lib/create-qrcode-direct';

describe('generateQrcodeSlug', () => {
  it('returns 12 lowercase alphanumeric chars', () => {
    const s = generateQrcodeSlug();
    expect(s).toHaveLength(12);
    expect(s).toMatch(/^[a-z0-9]+$/);
  });
});

describe('createQrcodeViaSupabase', () => {
  it('rejects invalid template', async () => {
    const supabase = {} as never;
    const r = await createQrcodeViaSupabase(supabase, {
      agentId: 'a',
      name: 'N',
      template: 'evil',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('invalid');
  });

  it('inserts and returns data on success', async () => {
    const from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'id-1',
              slug: 'abcdefghijkl',
              status: 'active',
              agent_id: 'ag-1',
              config_version: 1,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });
    const supabase = { from } as never;

    const r = await createQrcodeViaSupabase(supabase, {
      agentId: 'ag-1',
      name: 'My QR',
      greeting: 'Hi',
      template: 'custom',
      systemPrompt: 'be nice',
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.slug).toBe('abcdefghijkl');
      expect(r.data.warnings).toContain('gateway_bypass');
    }
  });

  it('retries on unique slug violation', async () => {
    let calls = 0;
    const from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => {
            calls += 1;
            if (calls === 1) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
            }
            return Promise.resolve({
              data: {
                id: 'id-2',
                slug: 'zzzzzzzzzzzz',
                status: 'active',
                agent_id: 'ag-1',
                config_version: 1,
                created_at: '2026-01-01T00:00:00Z',
              },
              error: null,
            });
          }),
        }),
      }),
    });
    const supabase = { from } as never;

    const r = await createQrcodeViaSupabase(supabase, { agentId: 'ag-1', name: 'X' });
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
