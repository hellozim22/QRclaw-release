import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

type LegalPageLayoutProps = {
  active: 'terms' | 'privacy';
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
};

export const legalTextStyles = {
  h2: {
    fontSize: 20,
    fontWeight: 700,
    margin: '36px 0 10px',
    letterSpacing: -0.2,
    color: 'var(--color-black)',
  } satisfies CSSProperties,
  h3: {
    fontSize: 15,
    fontWeight: 650,
    margin: '22px 0 8px',
    color: 'var(--color-black)',
  } satisfies CSSProperties,
  p: {
    fontSize: 15,
    lineHeight: 1.85,
    margin: '0 0 14px',
    color: 'var(--color-gray-700)',
  } satisfies CSSProperties,
  ul: {
    fontSize: 15,
    lineHeight: 1.85,
    margin: '0 0 14px',
    paddingLeft: 22,
    color: 'var(--color-gray-700)',
  } satisfies CSSProperties,
};

function navLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    padding: '0 14px',
    borderRadius: 999,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    color: isActive ? 'var(--color-black)' : 'var(--color-gray-600)',
    background: isActive ? 'var(--color-white)' : 'transparent',
    border: isActive ? '1px solid rgba(26, 26, 26, 0.08)' : '1px solid transparent',
    boxShadow: isActive ? '0 1px 2px rgba(26, 26, 26, 0.04)' : 'none',
  };
}

export default function LegalPageLayout({
  active,
  title,
  description,
  updatedAt,
  children,
}: LegalPageLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FCFCFD 0%, #F8F9FB 58%, #F5F7FA 100%)',
        fontFamily: 'var(--font-primary)',
        color: 'var(--color-gray-800)',
      }}
    >
      <header
        className="legal-page-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          background: 'rgba(252, 252, 253, 0.86)',
          borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
        }}
      >
        <div
          className="legal-page-header-inner"
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: 'var(--color-black)',
              flexShrink: 0,
            }}
          >
            <img
              src="/qrclaw-logo-icon.png"
              alt="QRClaw"
              style={{ width: 28, height: 28, borderRadius: 8 }}
            />
            <span style={{ fontSize: 15, fontWeight: 700 }}>QRClaw</span>
          </Link>

          <nav
            className="legal-page-nav"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: 4,
              borderRadius: 999,
              background: 'rgba(26, 26, 26, 0.04)',
            }}
          >
            <Link href="/" aria-label="Back to home" style={navLinkStyle(false)}>
              Back to home
            </Link>
            <Link
              href="/terms"
              aria-current={active === 'terms' ? 'page' : undefined}
              style={navLinkStyle(active === 'terms')}
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              aria-current={active === 'privacy' ? 'page' : undefined}
              style={navLinkStyle(active === 'privacy')}
            >
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main
        className="legal-page-main"
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '56px 24px 96px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: 760,
            width: '100%',
            margin: '0 auto 28px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 28,
              padding: '0 12px',
              borderRadius: 999,
              background: 'rgba(26, 26, 26, 0.04)',
              color: 'var(--color-gray-700)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.2,
              marginBottom: 18,
            }}
          >
            Legal
          </div>

          <h1
            style={{
              fontSize: 44,
              lineHeight: 1.08,
              letterSpacing: -1.3,
              fontWeight: 750,
              color: 'var(--color-black)',
              margin: '0 0 14px',
            }}
          >
            {title}
          </h1>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: 'var(--color-gray-600)',
              margin: '0 0 18px',
              maxWidth: 680,
            }}
          >
            {description}
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 32,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid rgba(26, 26, 26, 0.08)',
              background: 'rgba(255, 255, 255, 0.75)',
              color: 'var(--color-gray-600)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Last updated: {updatedAt}
          </div>
        </div>

        <article
          className="legal-page-article"
          style={{
            maxWidth: 760,
            width: '100%',
            margin: '0 auto',
            background: 'rgba(255, 255, 255, 0.94)',
            border: '1px solid rgba(26, 26, 26, 0.06)',
            borderRadius: 24,
            boxShadow: '0 12px 40px rgba(26, 26, 26, 0.05)',
            overflow: 'hidden',
          }}
        >
          <div
            className="legal-page-article-inner"
            style={{
              padding: '40px 48px 52px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {children}
          </div>
        </article>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .legal-page-header-inner {
            padding: 12px 16px !important;
            flex-wrap: wrap;
            justify-content: flex-start !important;
            gap: 12px !important;
          }

          .legal-page-nav {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }

          .legal-page-nav::-webkit-scrollbar {
            display: none;
          }

          .legal-page-main {
            padding: 32px 16px 72px !important;
          }

          .legal-page-article-inner {
            padding: 28px 20px 36px !important;
          }
        }
      `}</style>
    </div>
  );
}
