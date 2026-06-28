'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/ui';
import { useQRCodes } from '@/hooks/useQRCodes';
import { type QRCode } from '@/hooks/useQRCodes';

const formatCreatedDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return `Created ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

const QRCodeRow = ({ item, onClick }: { item: QRCode; onClick: () => void }) => {
  const isActive = item.status === 'active';
  const dotColor = isActive ? 'var(--color-green)' : 'var(--color-delete-red)';
  const statusText = isActive ? 'Active' : 'Paused';
  const displayName = item.agents?.name ?? item.slug;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 64,
        padding: '0 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--color-gray-200)',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-gray-800)',
          }}
        >
          {displayName}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--color-gray-500)',
          }}
        >
          {formatCreatedDate(item.created_at)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: dotColor,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 11,
            fontWeight: 400,
            color: dotColor,
          }}
        >
          {statusText}
        </span>
      </div>

      <ChevronRight size={16} color="var(--color-gray-500)" style={{ flexShrink: 0 }} />
    </div>
  );
};

const LoadingSkeleton = () => (
  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[1, 2, 3].map((i) => (
      <div key={i} style={{ height: 56, borderRadius: 8, background: 'var(--color-gray-100)' }} />
    ))}
  </div>
);

export default function MyQRCodesPage() {
  const router = useRouter();
  const { qrcodes, loading, error, refetch } = useQRCodes();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-white)',
      }}
    >
      <TopBar title="My QR Codes" onBack={() => router.push('/m/me')} />

      <div
        style={{ width: '100%', height: 4, background: 'var(--color-gray-100)', flexShrink: 0 }}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              padding: 24,
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                color: 'var(--color-delete-red)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              Failed to load QR codes
            </p>
            <button
              onClick={refetch}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'var(--color-red)',
                color: 'var(--color-white)',
                border: 'none',
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : qrcodes.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
              padding: 24,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'var(--color-red-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-red)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                color: 'var(--color-gray-500)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              No QR codes yet
            </p>
          </div>
        ) : (
          qrcodes.map((item) => (
            <QRCodeRow
              key={item.id}
              item={item}
              onClick={() => {
                /* TODO: navigate to QR detail */
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
