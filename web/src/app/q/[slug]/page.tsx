import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { buildAgentProfilePath } from '@/lib/chat-routing';

export const dynamic = 'force-dynamic';

const SLUG_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/;

interface QRCodeRecord {
  id: string;
  slug: string;
  agent_id: string;
  status: string;
}

interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SlugResolvePage({ params }: SlugPageProps) {
  const { slug } = await params;

  if (!slug || !SLUG_PATTERN.test(slug)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: qrcode, error } = await supabase
    .from('qrcodes')
    .select('id, slug, agent_id, status')
    .eq('slug', slug)
    .single<QRCodeRecord>();

  if (error || !qrcode) {
    notFound();
  }

  if (qrcode.status === 'deleted') {
    notFound();
  }

  if (qrcode.status !== 'active') {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--mobile-width)',
          minHeight: '100dvh',
          margin: '0 auto',
          background: 'var(--color-white)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-gray-800)',
            margin: 0,
          }}
        >
          QR Code Unavailable
        </p>
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            color: 'var(--color-gray-500)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          This QR code is currently not active. Please contact the owner for more information.
        </p>
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-red)',
            textDecoration: 'none',
          }}
        >
          Go to homepage
        </Link>
      </div>
    );
  }

  redirect(buildAgentProfilePath(qrcode.agent_id, qrcode.id));
}
