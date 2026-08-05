'use client';

/**
 * ChatMessageBubble — Wave 10 Sprint 1
 *
 * Renders a single conversation turn in the chat stream. Three roles:
 *   - user   → right-aligned, --color-visitor-bubble surface
 *   - agent  → left-aligned, --color-white surface + --color-gray-border
 *   - system → centered, --color-gray-100 surface, small type
 *
 * Why separate surface tokens (r2-ux §1):
 *   user ≠ agent surfaces, otherwise long agent replies get visually
 *   "pressed" by the user message above them.
 *
 * Streaming:
 *   When `isStreaming` is true, message content flows through
 *   <StreamingText /> which shows a branded caret and defers Markdown
 *   render until settled. Otherwise content goes straight to
 *   <MarkdownRenderer /> for full GFM/math/code rendering.
 *
 * Props shape mirrors the OpenAI SSE chunk model (r2-c4-sse-spec-final.md)
 * so a runtime adapter can feed chunks in directly.
 *
 * A11y:
 *   - `role="article"` with `aria-label` describing role+time.
 *   - Action buttons (copy / regenerate) have `aria-label`s.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import StreamingText from './StreamingText';

export type ChatRole = 'user' | 'agent' | 'system';

export interface ChatMessageBubbleProps {
  role: ChatRole;
  content: string;
  /** ISO timestamp shown in the meta row. Optional — falsy hides it. */
  timestamp?: string;
  /** Display name (agent) or '我' (user) etc. Optional. */
  author?: string;
  /** When true, render via StreamingText with a caret. */
  isStreaming?: boolean;
  /** Shows a red border + reason string under the bubble. */
  errorMessage?: string;
  /** Show the copy-body action. Default true for agent, false for user. */
  showCopy?: boolean;
  /** Invoked when the user clicks ↻ regenerate. If omitted, button is hidden. */
  onRegenerate?: () => void;
  /** Optional footer slot (e.g. tool call cards, attachments). */
  footer?: ReactNode;
}

const COPY_RESET_MS = 2000;

function formatTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const rootStyle = (role: ChatRole): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: role === 'user' ? 'flex-end' : role === 'system' ? 'center' : 'flex-start',
  margin: 'var(--space-3) 0',
  maxWidth: '100%',
});

const bubbleStyle = (role: ChatRole, hasError: boolean): React.CSSProperties => {
  const base: React.CSSProperties = {
    maxWidth: '88%',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-lg)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    color: 'var(--color-gray-800)',
    lineHeight: 1.65,
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid transparent',
    wordBreak: 'break-word',
  };
  if (role === 'user') {
    return { ...base, background: 'var(--color-visitor-bubble)' };
  }
  if (role === 'system') {
    return {
      ...base,
      background: 'var(--color-gray-100)',
      color: 'var(--color-gray-700)',
      fontSize: 'var(--text-base)',
      boxShadow: 'none',
    };
  }
  // agent
  return {
    ...base,
    background: 'var(--color-white)',
    borderColor: hasError ? 'var(--color-delete-red)' : 'var(--color-gray-border)',
  };
};

const metaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  marginBottom: 4,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-gray-600)',
  fontFamily: 'var(--font-primary)',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-1)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-gray-600)',
};

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-xs)',
  borderRadius: 'var(--radius-sm)',
};

const errorStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-delete-red)',
  background: 'var(--color-red-bg)',
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
};

function ChatMessageBubble({
  role,
  content,
  timestamp,
  author,
  isStreaming = false,
  errorMessage,
  showCopy,
  onRegenerate,
  footer,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const timeLabel = formatTime(timestamp);
  const effectiveShowCopy = showCopy ?? role === 'agent';
  const hasError = Boolean(errorMessage);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopied(false);
    }
  }, [content]);

  const ariaLabel = `${role === 'user' ? '你的消息' : role === 'agent' ? 'Agent 消息' : '系统消息'}${timeLabel ? ' · ' + timeLabel : ''}`;

  return (
    <div
      role="article"
      aria-label={ariaLabel}
      data-testid="chat-bubble"
      data-role={role}
      style={rootStyle(role)}
    >
      {(author || timeLabel) && role !== 'system' && (
        <div style={metaStyle}>
          {author && <span>{author}</span>}
          {timeLabel && <span>{timeLabel}</span>}
        </div>
      )}

      <div style={bubbleStyle(role, hasError)} data-testid="chat-bubble-body">
        {role === 'agent' && isStreaming ? (
          <StreamingText text={content} isStreaming />
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </div>

      {hasError && (
        <div style={errorStyle} role="alert">
          {errorMessage}
        </div>
      )}

      {(effectiveShowCopy || onRegenerate) && !isStreaming && role !== 'system' && (
        <div style={actionsStyle}>
          {effectiveShowCopy && (
            <button
              type="button"
              onClick={handleCopy}
              style={actionBtnStyle}
              aria-label={copied ? '已复制' : '复制消息'}
              data-testid="chat-bubble-copy"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}
          {onRegenerate && role === 'agent' && (
            <button
              type="button"
              onClick={onRegenerate}
              style={actionBtnStyle}
              aria-label="重新生成"
              data-testid="chat-bubble-regenerate"
            >
              <RotateCcw size={12} />
              <span>重新生成</span>
            </button>
          )}
        </div>
      )}

      {footer}
    </div>
  );
}

export default ChatMessageBubble;
