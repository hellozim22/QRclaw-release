'use client';

/**
 * ChatComposer — Wave 10 Sprint 1
 *
 * Textarea-based composer for owner→agent chat. Replaces the single-line
 * <ChatInputBar /> used by the visitor path. Features:
 *
 *   - Auto-growing textarea (1 line → up to 8 lines, then scroll).
 *   - Enter = send, Shift+Enter = newline (desktop; mobile auto-flips send).
 *   - Send / Stop morph: while the agent is streaming, the circular
 *     brand-red send button becomes a square red "stop" button that
 *     dispatches `onStop()`.
 *   - Regenerate (↻) button is exposed as an adjacent secondary action
 *     when the latest reply exists and no stream is active.
 *   - Composer is also the anchor for future 📎 / 🎤 slots — currently
 *     reserved via `leadingSlot` / `trailingSlot` props.
 *
 * Accessibility:
 *   - Labelled textarea + `aria-label` on every icon button.
 *   - Character counter (if `maxLength` set) announces via `aria-live`.
 *
 * Tokens used (all v1): --color-red, --color-red-dark, --color-white,
 * --color-gray-800/700/500, --color-input-border, --radius-lg,
 * --font-primary, --space-2/3/4, --btn-height-primary (40).
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ArrowUp, Square, RotateCcw } from 'lucide-react';

export interface ChatComposerHandle {
  /** Programmatically focus the textarea (e.g. after session switch). */
  focus: () => void;
  /** Clear and reset height. */
  reset: () => void;
}

export interface ChatComposerProps {
  onSend: (content: string) => void;
  /** Fired when user clicks the stop icon while `isStreaming` is true. */
  onStop?: () => void;
  /** Fired when user clicks ↻; hidden if omitted. */
  onRegenerate?: () => void;
  /** Drives send↔stop morph + disables input while true. */
  isStreaming?: boolean;
  /** Disables the whole composer (e.g. offline / no agent selected). */
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Slot before the textarea (e.g. 📎 attach). Not wired in S1. */
  leadingSlot?: ReactNode;
  /** Slot between send and trailing edge (e.g. 🎤 mic). Not wired in S1. */
  trailingSlot?: ReactNode;
  ref?: Ref<ChatComposerHandle>;
}

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 22;

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  background: 'var(--color-white)',
  border: '1px solid var(--color-input-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-3)',
  fontFamily: 'var(--font-primary)',
  boxShadow: 'var(--shadow-sm)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-2)',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-md)',
  color: 'var(--color-gray-800)',
  lineHeight: `${LINE_HEIGHT_PX}px`,
  minHeight: LINE_HEIGHT_PX,
  maxHeight: LINE_HEIGHT_PX * MAX_ROWS,
  padding: '6px 0',
};

const sendBtnStyle = (disabled: boolean, stopMode: boolean): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: stopMode ? 'var(--radius-sm)' : '50%',
  background: 'var(--color-red)',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  flexShrink: 0,
  transition: 'border-radius 140ms ease, background 140ms ease',
});

const secondaryBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: 'transparent',
  border: '1px solid var(--color-gray-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--color-gray-700)',
  flexShrink: 0,
};

const hintRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-gray-500)',
};

function ChatComposer({
  onSend,
  onStop,
  onRegenerate,
  isStreaming = false,
  disabled = false,
  placeholder = '输入消息... (Shift+Enter 换行, Enter 发送)',
  maxLength,
  leadingSlot,
  trailingSlot,
  ref,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, LINE_HEIGHT_PX * MAX_ROWS);
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      reset: () => {
        setValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      },
    }),
    []
  );

  const trimmed = value.trim();
  const canSend = !disabled && !isStreaming && trimmed.length > 0;

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePrimary = () => {
    if (isStreaming) {
      onStop?.();
      return;
    }
    handleSubmit();
  };

  const primaryDisabled = isStreaming ? !onStop : !canSend;

  return (
    <form onSubmit={handleSubmit} style={formStyle} data-testid="chat-composer">
      <div style={rowStyle}>
        {leadingSlot}
        <textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="聊天输入框"
          data-testid="chat-composer-input"
          style={textareaStyle}
        />
        {onRegenerate && !isStreaming && (
          <button
            type="button"
            onClick={onRegenerate}
            style={secondaryBtnStyle}
            aria-label="重新生成上一条回复"
            data-testid="chat-composer-regenerate"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={handlePrimary}
          disabled={primaryDisabled}
          style={sendBtnStyle(primaryDisabled, isStreaming)}
          aria-label={isStreaming ? '停止生成' : '发送消息'}
          data-testid="chat-composer-send"
        >
          {isStreaming ? (
            <Square size={14} color="var(--color-white)" fill="var(--color-white)" />
          ) : (
            <ArrowUp size={18} color="var(--color-white)" />
          )}
        </button>
        {trailingSlot}
      </div>
      {maxLength && (
        <div style={hintRowStyle} aria-live="polite">
          <span>Enter 发送 · Shift+Enter 换行</span>
          <span
            style={{
              color:
                value.length > maxLength * 0.9
                  ? 'var(--color-delete-red)'
                  : 'var(--color-gray-500)',
            }}
          >
            {value.length} / {maxLength}
          </span>
        </div>
      )}
    </form>
  );
}

export default ChatComposer;
