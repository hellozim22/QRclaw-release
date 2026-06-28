'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui';
import { useAgent } from '@/hooks/useAgent';
import { buildChatPath, getQrCodeIdFromSearchParams } from '@/lib/chat-routing';

export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQrCodeId = getQrCodeIdFromSearchParams(searchParams);
  const { agent, loading, error } = useAgent(params.agentId, initialQrCodeId);

  const resolvedQrCodeId = agent?.default_qrcode_id ?? null;

  const handleMessage = () => {
    if (!resolvedQrCodeId) {
      return;
    }

    router.push(buildChatPath(params.agentId, resolvedQrCodeId));
  };

  if (loading) {
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
        }}
      >
        <div
          style={{ width: 160, height: 160, borderRadius: 80, background: 'var(--color-gray-100)' }}
        />
        <div
          style={{ width: 120, height: 20, borderRadius: 8, background: 'var(--color-gray-100)' }}
        />
        <div
          style={{ width: 180, height: 14, borderRadius: 6, background: 'var(--color-gray-100)' }}
        />
      </div>
    );
  }

  if (error || !agent) {
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
          }}
        >
          Agent not found
        </p>
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            color: 'var(--color-gray-500)',
            textAlign: 'center',
          }}
        >
          {error ?? 'This agent does not exist or has been removed.'}
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

  const isPaused = agent.status === 'paused';
  const canStartChat = !isPaused && Boolean(resolvedQrCodeId);

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
      }}
    >
      {/* content wrapper: padding 80 24 24 24, vertical, center aligned */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '80px 24px 24px 24px',
          flex: 1,
        }}
      >
        {/* Avatar 160x160 */}
        <div style={{ opacity: isPaused ? 0.5 : 1 }}>
          <Avatar alt={agent.name} size={160} variant="agent" src={agent.avatar_url ?? undefined} />
        </div>

        {/* sp1: 16px */}
        <div style={{ height: 16, flexShrink: 0 }} />

        {/* Name */}
        <h1
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--color-black)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {agent.name}
        </h1>

        {/* sp2: 4px */}
        <div style={{ height: 4, flexShrink: 0 }} />

        {/* Conversations count */}
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            fontWeight: 400,
            color: 'var(--color-gray-500)',
          }}
        >
          {agent.conversation_count} conversations served
        </span>

        {/* sp3: 20px */}
        <div style={{ height: 20, flexShrink: 0 }} />

        {/* Divider 1 */}
        <div
          style={{
            width: 342,
            height: 1,
            background: 'var(--color-gray-border)',
            flexShrink: 0,
          }}
        />

        {/* sp4: 20px */}
        <div style={{ height: 20, flexShrink: 0 }} />

        {/* Description */}
        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--color-gray-700)',
            lineHeight: 1.6,
            textAlign: 'center',
            margin: 0,
            width: 342,
          }}
        >
          {'This agent is ready to assist you.'}
        </p>

        {/* sp5: 20px */}
        <div style={{ height: 20, flexShrink: 0 }} />

        {/* Divider 2 */}
        <div
          style={{
            width: 342,
            height: 1,
            background: 'var(--color-gray-border)',
            flexShrink: 0,
          }}
        />

        {/* sp6: 24px */}
        <div style={{ height: 24, flexShrink: 0 }} />

        {/* Message Button */}
        <button
          onClick={handleMessage}
          disabled={!canStartChat}
          style={{
            width: 342,
            height: 50,
            borderRadius: 12,
            background: 'var(--color-red)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            cursor: canStartChat ? 'pointer' : 'not-allowed',
            opacity: canStartChat ? 1 : 0.5,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-white)',
            }}
          >
            Message
          </span>
        </button>

        {/* sp7: 12px */}
        <div style={{ height: 12, flexShrink: 0 }} />

        {!canStartChat && (
          <>
            <p
              style={{
                width: 342,
                margin: 0,
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--color-gray-500)',
                textAlign: 'center',
              }}
            >
              {isPaused
                ? 'This agent is paused and cannot accept new chats right now.'
                : 'Scan an active QR code to start chatting with this agent.'}
            </p>
            <div style={{ height: 12, flexShrink: 0 }} />
          </>
        )}

        {/* Sign-in hint */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Link
            href="/login"
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-red)',
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--color-gray-500)',
            }}
          >
            to save your conversations
          </span>
        </div>

        {/* Flex spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            width: '100%',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 12,
              fontWeight: 400,
              color: 'var(--color-gray-500)',
            }}
          >
            Powered by QRClaw
          </span>
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--color-muted)',
            }}
          >
            Terms of Service · Privacy Policy
          </span>
        </div>
      </div>
    </div>
  );
}
