'use client';

import React from 'react';
import Link from 'next/link';

const FOOTER_LINKS = [
  { label: 'Contact', href: 'mailto:hello@qrclaw.ai' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'GitHub', href: 'https://github.com/qrclaw' },
];

export default function Footer() {
  return (
    <footer
      style={{
        height: 60,
        display: 'flex',
        alignItems: 'center',
        padding: '0 48px',
        background: 'linear-gradient(180deg, #F9FAFB 0%, var(--color-gray-100) 100%)',
        borderTop: '1px solid rgba(232, 232, 232, 0.12)',
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--color-gray-500)',
        }}
      >
        © {new Date().getFullYear()} QRClaw. All rights reserved.
      </span>
      <div style={{ display: 'flex', gap: 24 }}>
        {FOOTER_LINKS.map((link) =>
          link.href.startsWith('mailto:') || link.href.startsWith('https://') ? (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: 12,
                color: 'var(--color-gray-500)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ) : (
            <Link
              key={link.label}
              href={link.href}
              style={{
                fontSize: 12,
                color: 'var(--color-gray-500)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </Link>
          )
        )}
      </div>
    </footer>
  );
}
