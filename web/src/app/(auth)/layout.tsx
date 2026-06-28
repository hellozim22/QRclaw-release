import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: 'var(--font-primary)',
      }}
    >
      {children}
    </div>
  );
}
