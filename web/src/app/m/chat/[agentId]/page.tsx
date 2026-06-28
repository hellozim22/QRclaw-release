'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { TopBar } from '@/components/ui';
import {
  ChatInputBar,
  ConnectionStatusBanner,
  RegisterBanner,
  MessageList,
} from '@/components/chat';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getQrCodeIdFromSearchParams } from '@/lib/chat-routing';
import { getSupportAgentGuideMessages } from '@/lib/support-guide-snapshot';
import type { ChatMessage } from '@/types/chat';

export default function MobileChatPage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params.agentId;
  const qrCodeId = getQrCodeIdFromSearchParams(searchParams);
  const isSupportGuideShot = searchParams.get('guide') === '1';
  const isVisualAuditChat = searchParams.get('audit') === '1';
  const isCopyMenuShot = searchParams.get('copymenu') === '1';
  const isStreamingShot = searchParams.get('streaming') === '1';

  const isEchoAudit = isVisualAuditChat && !isSupportGuideShot;
  const isSupportAudit = isSupportGuideShot && isVisualAuditChat;

  const topTitle = isEchoAudit ? 'Echo Agent' : isSupportGuideShot ? 'QRClaw Support' : agentId;
  const displayAgentName = isEchoAudit
    ? 'Echo Agent'
    : isSupportGuideShot
      ? 'QRClaw Support'
      : agentId;

  const [guideLiveSnapshot, setGuideLiveSnapshot] = useState<ChatMessage[] | undefined>(undefined);
  const [auditFixtureMessages, setAuditFixtureMessages] = useState<ChatMessage[] | undefined>(
    undefined
  );
  const needsAuditChunk = isEchoAudit || isSupportAudit;
  const [auditChunkReady, setAuditChunkReady] = useState(!needsAuditChunk);

  useEffect(() => {
    let cancelled = false;
    if (!needsAuditChunk) {
      setAuditFixtureMessages(undefined);
      setAuditChunkReady(true);
      return;
    }
    setAuditChunkReady(false);
    void (async () => {
      try {
        if (isSupportAudit) {
          const { SUPPORT_AGENT_GUIDE_AUDIT_MESSAGES } =
            await import('@/lib/visual-audit/chat-support-audit-messages');
          if (!cancelled) setAuditFixtureMessages(SUPPORT_AGENT_GUIDE_AUDIT_MESSAGES);
        } else if (isEchoAudit) {
          const { VISUAL_AUDIT_CHAT_MESSAGES } =
            await import('@/lib/visual-audit/chat-echo-messages');
          if (!cancelled) setAuditFixtureMessages(VISUAL_AUDIT_CHAT_MESSAGES);
        }
      } catch {
        if (!cancelled) setAuditFixtureMessages(undefined);
      } finally {
        if (!cancelled) setAuditChunkReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAuditChunk, isEchoAudit, isSupportAudit]);

  useEffect(() => {
    if (isSupportAudit) {
      setGuideLiveSnapshot(undefined);
      return;
    }
    if (isVisualAuditChat) {
      setGuideLiveSnapshot(undefined);
      return;
    }
    if (!isSupportGuideShot) {
      setGuideLiveSnapshot(undefined);
      return;
    }
    setGuideLiveSnapshot(getSupportAgentGuideMessages(new Date().toISOString()));
  }, [isSupportGuideShot, isVisualAuditChat, isSupportAudit]);

  const staticSnapshotMessages = useMemo(() => {
    if (isSupportAudit || isEchoAudit) return auditFixtureMessages;
    return guideLiveSnapshot;
  }, [isSupportAudit, isEchoAudit, auditFixtureMessages, guideLiveSnapshot]);

  const { messages, streaming: storeStreaming, isAgentThinking } = useChatStore();
  const streaming =
    isStreamingShot && isEchoAudit
      ? { messageId: 'audit-stream', content: 'How can QRClaw help my business?', sequence: 1 }
      : storeStreaming;
  const { sendMessage, connectionStatus, isStaticSnapshot } = useWebSocket({
    agentId,
    qrCodeId: needsAuditChunk && !auditChunkReady ? null : qrCodeId,
    staticSnapshotMessages:
      needsAuditChunk && !auditChunkReady ? undefined : staticSnapshotMessages,
  });

  const isDisconnected = connectionStatus === 'disconnected';

  if (needsAuditChunk && !auditChunkReady) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100%',
          background: 'var(--color-gray-100)',
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-gray-100)',
      }}
    >
      {isSupportGuideShot ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 72,
            padding: '12px 16px',
            background: 'var(--color-white)',
            borderBottom: '1px solid var(--color-gray-border)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            style={{
              width: 24,
              height: 24,
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={24} color="var(--color-gray-800)" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qrclaw-logo-icon.png"
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-gray-800)',
                lineHeight: 1.2,
              }}
            >
              {topTitle}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-green-text)',
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-green)',
                  flexShrink: 0,
                }}
              />
              Online
            </div>
          </div>
        </div>
      ) : (
        <TopBar title={topTitle} onBack={() => router.back()} />
      )}

      {!isStaticSnapshot && <ConnectionStatusBanner connectionStatus={connectionStatus} />}

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <MessageList
          messages={messages}
          streaming={streaming}
          isAgentThinking={isAgentThinking}
          agentAvatarSrc="/qrclaw-logo-icon.svg"
          agentName={displayAgentName}
          showTimestamps={isEchoAudit}
        />
        {isCopyMenuShot && isEchoAudit ? (
          <div
            style={{
              position: 'absolute',
              left: 56,
              top: 120,
              width: 160,
              borderRadius: 12,
              padding: '4px 0',
              background: 'var(--color-white)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid var(--color-gray-border)',
              zIndex: 20,
            }}
          >
            {['Copy', 'Forward', 'Delete'].map((label) => (
              <button
                key={label}
                type="button"
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--color-gray-800)',
                  cursor: 'default',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!isEchoAudit && <RegisterBanner />}

      <ChatInputBar
        onSend={sendMessage}
        disabled={isDisconnected || isStaticSnapshot}
        placeholder={isEchoAudit ? 'Message Echo Agent...' : 'Type a message...'}
      />
    </div>
  );
}
