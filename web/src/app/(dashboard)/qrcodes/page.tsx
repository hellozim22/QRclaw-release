'use client';

/**
 * /qrcodes — Wave 10 S1 UX-3 redirect stub.
 *
 * The QR code list has moved under /agents/[agentId]?tab=qrcodes.
 * This route now redirects to /agents so the user can pick which agent's
 * QR codes to view. Kept as a backwards-compatible redirect rather than a
 * 404 because /qrcodes is still referenced in some user-facing docs and
 * the mobile /m/ namespace.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LegacyQrCodesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/agents');
  }, [router]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background: 'var(--color-off-white)',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          padding: 24,
          background: 'var(--color-white)',
          border: '1px solid var(--color-gray-border)',
          borderRadius: 12,
          textAlign: 'center',
          fontFamily: 'var(--font-primary)',
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-gray-800)',
            marginBottom: 8,
          }}
        >
          QR Codes moved
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-gray-700)',
            lineHeight: 1.6,
            margin: '0 0 16px',
          }}
        >
          QR codes now live alongside the agent that owns them. Redirecting to{' '}
          <strong>Agents</strong>…
        </p>
        <Link
          href="/agents"
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            background: 'var(--color-red)',
            color: 'var(--color-white)',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Go to Agents
        </Link>
      </div>
    </div>
  );
}
