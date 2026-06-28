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
  iconOnly?: boolean;
}

const NavItem = ({ href, icon, label, isActive, iconOnly = false }: NavItemProps) => (
  <Link
    href={href}
    aria-label={iconOnly ? label || href : undefined}
    title={iconOnly ? label || undefined : undefined}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: 64,
      height: iconOnly ? 48 : 56,
      borderRadius: 12,
      background: isActive ? 'var(--color-red-bg)' : 'transparent',
      color: isActive ? 'var(--color-red)' : 'var(--color-gray-500)',
      textDecoration: 'none',
      gap: iconOnly ? 0 : 2,
    }}
  >
    {icon}
    {!iconOnly && (
    <span
      style={{
        fontFamily: 'var(--font-primary)',
        fontSize: 10,
        fontWeight: 500,
        color: isActive ? 'var(--color-red)' : 'var(--color-gray-500)',
      }}
    >
      {label}
    </span>
    )}
  </Link>
);

const Sidebar = () => {
  const pathname = usePathname();

  const primaryNavItems = [
    { href: '/chat', icon: <MessagesSquare size={20} />, label: 'Chat' },
    { href: '/agents', icon: <Bot size={20} />, label: 'Agents' },
    { href: '/progress', icon: <KanbanSquare size={20} />, label: 'Progress' },
  ];

  const secondaryNavItems: Array<{
    href: string;
    icon: ReactNode;
    label: string;
    iconOnly?: boolean;
  }> = [
    { href: '/settings', icon: <User size={20} />, label: '个人中心', iconOnly: true },
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
        padding: '20px 0',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <Avatar src="/qrclaw-logo-icon.png" alt="QRClaw" size={40} variant="agent" />
      <div style={{ height: 16 }} />
      <nav
        aria-label="Dashboard primary navigation"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
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
          gap: 8,
        }}
      >
        {secondaryNavItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            iconOnly={item.iconOnly}
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
