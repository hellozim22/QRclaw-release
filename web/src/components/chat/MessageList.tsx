'use client';

import { useRef, useEffect } from 'react';
import { MessageBubble, formatChatTimestampLabel } from '@/components/ui';
import MarkdownRenderer from './MarkdownRenderer';
import type { ChatMessage } from '@/types/chat';
import type { StreamingState } from '@/types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  streaming: StreamingState | null;
  isAgentThinking: boolean;
  agentAvatarSrc?: string;
  agentName?: string;
  /** When true, show time under each bubble (design parity, e.g. Mobile!Chat). */
  showTimestamps?: boolean;
}

const renderContent = (msg: ChatMessage) => {
  if (msg.senderType === 'agent') {
    return <MarkdownRenderer content={msg.content} />;
  }
  return msg.content;
};

const MessageList = ({
  messages,
  streaming,
  isAgentThinking,
  agentAvatarSrc,
  agentName,
  showTimestamps = false,
}: MessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming?.content]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--color-gray-100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4) 0',
      }}
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          variant={msg.senderType === 'visitor' ? 'sent' : 'received'}
          avatarSrc={msg.senderType === 'agent' ? agentAvatarSrc : undefined}
          avatarAlt={msg.senderType === 'agent' ? agentName : undefined}
          timestampLabel={showTimestamps ? formatChatTimestampLabel(msg.timestamp) : undefined}
        >
          {renderContent(msg)}
        </MessageBubble>
      ))}

      {isAgentThinking && !streaming && (
        <MessageBubble
          variant="received"
          avatarSrc={agentAvatarSrc}
          avatarAlt={agentName}
          timestampLabel={undefined}
        >
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-gray-400)',
                animation: 'qrclaw-dot-bounce 1.4s ease-in-out infinite both',
              }}
            />
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-gray-400)',
                animation: 'qrclaw-dot-bounce 1.4s ease-in-out 0.16s infinite both',
              }}
            />
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-gray-400)',
                animation: 'qrclaw-dot-bounce 1.4s ease-in-out 0.32s infinite both',
              }}
            />
          </span>
        </MessageBubble>
      )}

      {streaming && (
        <MessageBubble
          variant="received"
          avatarSrc={agentAvatarSrc}
          avatarAlt={agentName}
          isStreaming
          timestampLabel={undefined}
        >
          <MarkdownRenderer content={streaming.content || ''} />
        </MessageBubble>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
