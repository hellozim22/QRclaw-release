'use client';

/**
 * CodeBlock — Wave 10 Sprint 1
 *
 * Renders a fenced code block with:
 *   - Language label (top-left)
 *   - Copy button (top-right) with 2s "已复制" confirmation
 *   - JetBrains Mono body on --color-black deep surface (r2-ux §1, r3-token §3)
 *
 * NOTE on highlighting:
 *   Syntax highlighting is applied by `rehype-highlight` upstream in
 *   MarkdownRenderer, which injects `hljs language-xxx` classes on the
 *   inner `<code>`. This component only owns the *shell* (surface, padding,
 *   language label, copy button) so we avoid double-escaping / double-parsing.
 *
 *   Standalone usage (outside markdown) can pass `code` + `language` directly;
 *   in that case we render plain monospace — good enough for tool-call cards
 *   and error panels. Upgrade to shiki later if truly needed.
 *
 * Tokens used (all from design/design-tokens.css v1):
 *   --color-black, --color-off-white, --color-gray-600, --color-gray-700,
 *   --color-gray-border, --color-red, --font-mono, --radius-md, --space-2/3.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CodeBlockProps {
  /** Raw code text — required for the copy button. */
  code: string;
  /** Language hint (e.g. "ts", "bash"); shown as top-left label. */
  language?: string;
  /**
   * Pre-highlighted children (e.g. from rehype-highlight). When provided,
   * rendered in place of `code` so syntax colors show through.
   */
  children?: ReactNode;
}

const COPY_RESET_MS = 2000;

const shellStyle: React.CSSProperties = {
  position: 'relative',
  margin: 'var(--space-3) 0',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-gray-50, #f4f4f5)',
  border: '1px solid var(--color-gray-border)',
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-1) var(--space-3)',
  borderBottom: '1px solid var(--color-gray-border)',
  background: 'var(--color-gray-100)',
};

const langLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-gray-600)',
  textTransform: 'lowercase',
  letterSpacing: 0.5,
};

const copyBtnStyle = (copied: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-xs)',
  background: 'transparent',
  border: 'none',
  color: copied ? 'var(--color-green)' : 'var(--color-gray-700)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-sm)',
  transition: 'color 120ms ease',
});

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--space-3)',
  overflowX: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-base)',
  lineHeight: 1.6,
  color: 'var(--color-gray-800)',
  background: 'transparent',
};

function CodeBlock({ code, language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard denied (permissions / insecure context). Silent fail —
      // do NOT log the code text (C2 guard).
      setCopied(false);
    }
  }, [code]);

  return (
    <div style={shellStyle} data-testid="code-block">
      <div style={headerStyle}>
        <span style={langLabelStyle} aria-label={`代码语言 ${language ?? 'plaintext'}`}>
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          style={copyBtnStyle(copied)}
          aria-label={copied ? '已复制' : '复制代码'}
          data-testid="code-block-copy"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre style={preStyle}>
        <code className={language ? `hljs language-${language}` : 'hljs'}>{children ?? code}</code>
      </pre>
    </div>
  );
}

export default CodeBlock;
