'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, MessagesSquare, Bot, KanbanSquare } from 'lucide-react';
import { Avatar } from '@/components/ui';
import type { ReactNode } from 'react';
import { LocalDevAutoSignIn } from '@/components/LocalDevAutoSignIn';
import { DesktopAutoSignIn } from '@/components/DesktopAutoSignIn';

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
}

const NavItem = ({ href, icon, label, isActive }: NavItemProps) => (
  <Link
    href={href}
    aria-label={label || href}
    title={label || undefined}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      borderRadius: 10,
      background: isActive ? 'var(--color-red-bg)' : 'transparent',
      color: isActive ? 'var(--color-red)' : 'var(--color-gray-500)',
      textDecoration: 'none',
    }}
  >
    {icon}
  </Link>
);

const Sidebar = () => {
  const pathname = usePathname();

  const primaryNavItems = [
    { href: '/chat', icon: <MessagesSquare size={22} strokeWidth={1.75} />, label: 'Chat' },
    { href: '/agents', icon: <Bot size={22} strokeWidth={1.75} />, label: 'Agents' },
    { href: '/progress', icon: <KanbanSquare size={22} strokeWidth={1.75} />, label: 'Progress' },
  ];

  const secondaryNavItems = [
    { href: '/settings', icon: <User size={20} strokeWidth={1.75} />, label: '个人中心' },
  ];

  return (
    <aside
      style={{
        width: 'var(--web-sidebar-width)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--color-white)',
        borderRight: '1px solid var(--color-dashboard-divider)',
        padding: '16px 0 12px',
        flexShrink: 0,
      }}
    >
      <Avatar src="/qrclaw-logo-icon.png" alt="QRClaw" size={36} variant="agent" />
      <nav
        aria-label="Dashboard primary navigation"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 14,
          gap: 4,
        }}
      >
        {primaryNavItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <nav
        aria-label="Dashboard secondary navigation"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {secondaryNavItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </nav>
    </aside>
  );
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100vh',
        width: '100%',
      }}
    >
      <Sidebar />
      <DesktopAutoSignIn />
      <LocalDevAutoSignIn />
      {children}
    </div>
  );
}
