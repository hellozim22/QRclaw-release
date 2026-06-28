/**
 * Server-side slug redirect tests.
 *
 * Ensures /q/[slug] always redirects with the qrcode context query string.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

const mockRedirect = vi.fn((url: string) => {
  const error = new Error('NEXT_REDIRECT') as Error & { digest?: string };
  error.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
});
const mockNotFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

describe('SlugResolvePage redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: {
        id: '34206699-e2e5-4b9e-b779-1b5a18ee59cd',
        slug: 'h3wld6ivt263',
        agent_id: '5619742f-130d-4f1c-a27e-77da5bba7439',
        status: 'active',
      },
      error: null,
    });
  });

  it('redirects to /agent with ?qr= query string preserved', async () => {
    const { default: SlugResolvePage } = await import('@/app/q/[slug]/page');

    await expect(
      SlugResolvePage({ params: Promise.resolve({ slug: 'h3wld6ivt263' }) })
    ).rejects.toMatchObject({
      message: 'NEXT_REDIRECT',
      digest:
        'NEXT_REDIRECT;replace;/agent/5619742f-130d-4f1c-a27e-77da5bba7439?qr=34206699-e2e5-4b9e-b779-1b5a18ee59cd;307;',
    });
  });
});
