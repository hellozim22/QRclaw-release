'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { TopBar } from '@/components/ui';
import {
  ChatInputBar,
  ChatMenu,
  ConnectionStatusBanner,
  RegisterBanner,
  MessageList,
} from '@/components/chat';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getQrCodeIdFromSearchParams } from '@/lib/chat-routing';

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params.agentId;
  const qrCodeId = getQrCodeIdFromSearchParams(searchParams);

  const { messages, streaming, isAgentThinking, reset, setConnectionStatus } = useChatStore();
  const { sendMessage, connectionStatus } = useWebSocket({ agentId, qrCodeId });

  const isDisconnected = connectionStatus === 'disconnected';

  const handleResetSession = useCallback(() => {
    reset();
    setConnectionStatus('connected');
  }, [reset, setConnectionStatus]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: 'var(--mobile-width)',
        margin: '0 auto',
        background: 'var(--color-gray-100)',
      }}
    >
      <TopBar
        title={agentId}
        onBack={() => router.back()}
        rightAction={<ChatMenu onResetSession={handleResetSession} />}
      />

      <ConnectionStatusBanner connectionStatus={connectionStatus} />

      <MessageList
        messages={messages}
        streaming={streaming}
        isAgentThinking={isAgentThinking}
        agentAvatarSrc="/qrclaw-logo-icon.png"
        agentName={agentId}
      />

      <RegisterBanner />

      <ChatInputBar onSend={sendMessage} disabled={isDisconnected} />

      <div
        data-testid="powered-by-qrclaw"
        style={{
          textAlign: 'center',
          padding: '4px 0',
          background: 'var(--color-white)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 11,
            color: 'var(--color-gray-500)',
          }}
        >
          Powered by QRClaw
        </span>
      </div>
    </div>
  );
}
