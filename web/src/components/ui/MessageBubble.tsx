'use client';

import { type ReactNode } from 'react';
import Avatar from './Avatar';

interface MessageBubbleProps {
  variant: 'sent' | 'received';
  children: ReactNode;
  avatarSrc?: string;
  avatarAlt?: string;
  isStreaming?: boolean;
  /** When set, shows a time label under the bubble (design: Mobile!Chat). */
  timestampLabel?: string;
}

function formatChatTimestampLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const MessageBubble = ({
  variant,
  children,
  avatarSrc,
  avatarAlt = '',
  isStreaming = false,
  timestampLabel,
}: MessageBubbleProps) => {
  const isSent = variant === 'sent';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: isSent ? 'flex-end' : 'flex-start',
    alignItems: 'flex-end',
    gap: 'var(--space-2)',
    padding: '0 var(--space-4)',
    width: '100%',
  };

  const columnStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: isSent ? 'flex-end' : 'flex-start',
    maxWidth: '75%',
    gap: 4,
  };

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '100%',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: isSent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-normal)',
    color: 'var(--color-gray-800)',
    background: isSent ? 'var(--color-visitor-bubble)' : 'var(--color-white)',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  };

  const streamingIndicatorStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  };

  const cursorStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 2,
    height: 14,
    marginLeft: 2,
    background: 'var(--color-red)',
    verticalAlign: 'text-bottom',
    animation: 'qrclaw-caret-blink 1s step-end infinite',
  };

  const typingStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-gray-500)',
  };

  const timeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-normal)',
    color: 'var(--color-gray-500)',
    paddingLeft: isSent ? 0 : 2,
    paddingRight: isSent ? 2 : 0,
  };

  return (
    <div style={rowStyle}>
      {!isSent && <Avatar src={avatarSrc} alt={avatarAlt} size={32} variant="agent" />}
      <div style={columnStyle}>
        <div style={bubbleStyle}>
          {children}
          {isStreaming && (
            <span style={streamingIndicatorStyle}>
              <span style={typingStyle}>typing</span>
              <span style={cursorStyle} aria-hidden />
            </span>
          )}
        </div>
        {timestampLabel ? <span style={timeStyle}>{timestampLabel}</span> : null}
      </div>
      {isSent && <Avatar size={32} variant="user" />}
    </div>
  );
};

export { formatChatTimestampLabel };

export default MessageBubble;
