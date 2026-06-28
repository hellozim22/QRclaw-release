'use client';

import { useRouter } from 'next/navigation';
import { Scan } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useConversations } from '@/hooks/useConversations';
import { type Conversation } from '@/hooks/useConversations';

const formatTimestamp = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getAgentName = (conv: Conversation): string => {
  if (conv.qrcodes?.agents?.name) return conv.qrcodes.agents.name;
  if (conv.qrcodes?.slug) return conv.qrcodes.slug;
  return 'Unknown Agent';
};

const ConversationRow = ({
  conversation,
  onClick,
}: {
  conversation: Conversation;
  onClick: () => void;
}) => (
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
    <Avatar alt={getAgentName(conversation)} size={40} variant="agent" />
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-gray-800)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getAgentName(conversation)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--color-muted)',
            flexShrink: 0,
          }}
        >
          {formatTimestamp(conversation.last_active_at)}
        </span>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 13,
          fontWeight: 400,
          color: 'var(--color-gray-500)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        [Encrypted message]
      </span>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[1, 2, 3].map((i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
        <div
          style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-gray-100)' }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              width: '50%',
              height: 14,
              borderRadius: 4,
              background: 'var(--color-gray-100)',
            }}
          />
          <div
            style={{
              width: '70%',
              height: 12,
              borderRadius: 4,
              background: 'var(--color-gray-100)',
            }}
          />
        </div>
      </div>
    ))}
  </div>
);

export default function MobileMessagesPage() {
  const router = useRouter();
  const { conversations, loading, error, refetch } = useConversations();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Custom top bar */}
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          background: 'var(--color-white)',
          borderBottom: '1px solid var(--color-gray-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 24, height: 24, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--font-primary)',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--color-gray-800)',
          }}
        >
          Messages({conversations.length})
        </span>
        <div
          style={{ width: 22, height: 22, flexShrink: 0, cursor: 'pointer' }}
          onClick={() => router.push('/m/scan')}
        >
          <Scan size={22} color="var(--color-gray-800)" />
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-white)' }}>
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
              }}
            >
              Failed to load messages
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
        ) : conversations.length === 0 ? (
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
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 14,
                color: 'var(--color-gray-500)',
                textAlign: 'center',
              }}
            >
              No messages yet. Scan a QR code to start a conversation!
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conversation={conv}
              onClick={() => {
                const agentId = conv.qrcodes?.agent_id;
                const qrCodeId = conv.qrcode_id;
                if (!agentId || !qrCodeId) {
                  return;
                }
                router.push(`/m/chat/${agentId}?qr=${qrCodeId}`);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
