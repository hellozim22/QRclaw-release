'use client';

import { usePathname, useRouter } from 'next/navigation';
import { TabBar } from '@/components/ui';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab: 'messages' | 'me' =
    pathname === '/m/me' || pathname.startsWith('/m/me/') ? 'me' : 'messages';
  const hideTabBar =
    pathname.startsWith('/m/qrcodes') ||
    pathname.startsWith('/m/scan') ||
    pathname.startsWith('/m/chat');

  const handleTabChange = (tab: 'messages' | 'me') => {
    if (tab === 'messages') {
      router.push('/m/messages');
    } else {
      router.push('/m/me');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxWidth: 390,
        margin: '0 auto',
        background: 'var(--color-white)',
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {!hideTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} />}
    </div>
  );
}
