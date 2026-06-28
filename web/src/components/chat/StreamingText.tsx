'use client';

/**
 * StreamingText — Wave 10 Sprint 1
 *
 * Displays a text buffer being progressively appended (SSE delta.content).
 * Adds a brand-red pulsing caret at the tail **only while `isStreaming`**;
 * when the stream ends the caret disappears and the final text is wrapped
 * in `<MarkdownRenderer />` (or plain text if `asMarkdown={false}`).
 *
 * Why split from bubble?
 *   - LobeChat & assistant-ui both separate the *streaming* render path
 *     from the *settled* render path. Re-rendering Markdown on every token
 *     is expensive; during streaming we render raw text with a caret, then
 *     promote to full Markdown once `isStreaming` flips false.
 *   - This avoids the "table jumping while streaming" jank and matches
 *     r2-c3 §7 smoke test #2.
 *
 * A11y:
 *   - Parent container owns `aria-live="polite"` so deltas don't
 *     interrupt the screen reader on every token (LobeChat pattern).
 *   - Caret is `aria-hidden` to avoid being read.
 */

import { memo } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

export interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  /** Render as markdown once settled. Defaults true. */
  asMarkdown?: boolean;
  /** className forwarded to root. */
  className?: string;
}

const caretStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: '1em',
  marginLeft: 2,
  verticalAlign: 'text-bottom',
  background: 'var(--color-red)',
  borderRadius: 1,
  animation: 'qrclaw-stream-blink 900ms steps(2, end) infinite',
};

const textStyle: React.CSSProperties = {
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-md)',
  color: 'var(--color-gray-800)',
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// Keyframes are inlined once per page via a <style> tag emitted by the first
// instance. Next.js hydration-safe because the keyframe name is deterministic.
const KEYFRAMES_ID = 'qrclaw-stream-blink-kf';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent =
    '@keyframes qrclaw-stream-blink { 0%, 45% { opacity: 1 } 50%, 100% { opacity: 0 } }';
  document.head.appendChild(style);
}

const StreamingText = memo(function StreamingText({
  text,
  isStreaming,
  asMarkdown = true,
  className,
}: StreamingTextProps) {
  if (typeof window !== 'undefined') ensureKeyframes();

  if (isStreaming) {
    return (
      <div
        className={className}
        aria-live="polite"
        aria-busy="true"
        data-testid="streaming-text"
        data-streaming="true"
        style={textStyle}
      >
        {text}
        <span aria-hidden="true" style={caretStyle} data-testid="stream-caret" />
      </div>
    );
  }

  return (
    <div
      className={className}
      aria-live="polite"
      aria-busy="false"
      data-testid="streaming-text"
      data-streaming="false"
    >
      {asMarkdown ? (
        <MarkdownRenderer content={text} />
      ) : (
        <div style={textStyle}>{text}</div>
      )}
    </div>
  );
});

export default StreamingText;
