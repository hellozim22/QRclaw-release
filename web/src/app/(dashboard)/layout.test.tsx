import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import DashboardLayout from './layout';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/chat');
  });

  it('removes the legacy messages nav item', () => {
    render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>
    );

    expect(screen.queryByRole('link', { name: /messages/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /runtimes/i })).toBeNull();
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat');
  });

  it('removes QR code from secondary nav (UX-3: merged into agents tab)', () => {
    render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>
    );

    const secondaryNav = screen.getByRole('navigation', {
      name: 'Dashboard secondary navigation',
    });

    // /qrcodes is no longer a standalone sidebar entry; QR codes live under
    // /agents/[agentId]?tab=qrcodes. Account (settings) remains.
    expect(within(secondaryNav).queryByRole('link', { name: /qr/i })).toBeNull();
    expect(within(secondaryNav).getByRole('link', { name: /个人/i })).toHaveAttribute(
      'href',
      '/settings'
    );
  });
});
