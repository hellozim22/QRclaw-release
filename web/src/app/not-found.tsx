'use client';

import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-white)',
        gap: 12,
      }}
    >
      {/* errLogo: 60x60, borderRadius 16 */}
      <img
        src="/qrclaw-logo-icon.png"
        alt="QRClaw"
        style={{ width: 60, height: 60, borderRadius: 16 }}
      />

      {/* errSp1: height 8 */}
      <div style={{ height: 8, flexShrink: 0 }} />

      {/* errTitle */}
      <h1
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--color-gray-800)',
          margin: 0,
        }}
      >
        Page Not Found
      </h1>

      {/* errDesc */}
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 14,
          fontWeight: 400,
          color: 'var(--color-gray-500)',
          textAlign: 'center',
          margin: 0,
          width: 300,
        }}
      >
        {'The page you\u2019re looking for doesn\u2019t exist or has been moved.'}
      </p>

      {/* errSp2: height 12 */}
      <div style={{ height: 12, flexShrink: 0 }} />

      {/* errBtn: Secondary/Outline button, 200x40 */}
      <Link
        href="/"
        style={{
          width: 200,
          height: 40,
          borderRadius: 12,
          background: 'var(--color-white)',
          border: '1px solid var(--color-gray-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          padding: '0 24px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--color-gray-800)',
          }}
        >
          Go Home
        </span>
      </Link>
    </div>
  );
}
