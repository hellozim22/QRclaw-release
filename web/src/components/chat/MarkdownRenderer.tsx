'use client';

/**
 * MarkdownRenderer — Wave 10 Sprint 1
 *
 * Streaming-safe markdown with:
 *   - remark-gfm     : tables, task lists, strikethrough, autolinks
 *   - remark-math    : `$inline$` + `$$block$$` math
 *   - rehype-katex   : render math as HTML (KaTeX CSS must be imported app-wide)
 *   - rehype-highlight : fenced code syntax highlighting (highlight.js)
 *
 * Design contract (QRClaw v1 tokens only):
 *   - text        → --color-gray-800
 *   - links       → --color-red
 *   - inline code → --color-gray-200 surface
 *   - code block  → delegated to <CodeBlock /> (--color-black deep surface)
 *   - raw HTML    → stripped (skipHtml + urlTransform safelist)
 *
 * LobeChat抽象映射:
 *   Lobe's `Markdown` component bundles ~12 plugins + shiki + mermaid.
 *   Wave 10 P0 takes only the 4 necessary plugins above. Mermaid/Katex
 *   are lazy-loadable later — today KaTeX is small enough to ship inline.
 *
 * Security:
 *   - `skipHtml` prevents raw HTML execution during streaming.
 *   - `urlTransform` allowlist: http(s)://, mailto:.
 *   - Images pass through but are only rendered if URL passes allowlist.
 */

import { memo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/github.css';
import CodeBlock from './CodeBlock';

export interface MarkdownRendererProps {
  content: string;
  /** Optional className applied to the root `<div>` (for bubble-specific overrides). */
  className?: string;
  /** If true, block rendering of `<img>` entirely (owner-agent chat default). */
  stripImages?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    lineHeight: 1.65,
    color: 'var(--color-gray-800)',
    wordBreak: 'break-word',
  },
  inlineCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    background: 'var(--color-gray-100, #f0f0f0)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 6px',
    color: 'var(--color-gray-800)',
  },
  link: {
    color: 'var(--color-red)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
  list: {
    paddingLeft: 'var(--space-5)',
    margin: 'var(--space-2) 0',
  },
  paragraph: {
    margin: '0 0 var(--space-2) 0',
  },
  heading: {
    fontWeight: 'var(--font-semibold)',
    margin: 'var(--space-3) 0 var(--space-2) 0',
    color: 'var(--color-gray-800)',
    fontFamily: 'var(--font-primary)',
  },
  blockquote: {
    borderLeft: '3px solid var(--color-red)',
    paddingLeft: 'var(--space-3)',
    margin: 'var(--space-2) 0',
    color: 'var(--color-gray-700)',
    background: 'var(--color-red-bg)',
    borderRadius: 'var(--radius-sm)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    margin: 'var(--space-2) 0',
    fontSize: 'var(--text-base)',
  },
  th: {
    textAlign: 'left',
    padding: 'var(--space-2)',
    borderBottom: '1px solid var(--color-gray-border)',
    fontWeight: 'var(--font-semibold)',
    background: 'var(--color-gray-100)',
  },
  td: {
    padding: 'var(--space-2)',
    borderBottom: '1px solid var(--color-gray-border)',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid var(--color-gray-border)',
    margin: 'var(--space-4) 0',
  },
};

const urlAllowlist = (url: string): string => {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return '';
};

function buildComponents(stripImages: boolean) {
  return {
    img: stripImages
      ? () => null
      : ({ src, alt, ...props }: ComponentPropsWithoutRef<'img'>) => {
          if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) return null;
          return (
            <img
              {...props}
              src={src}
              alt={alt ?? ''}
              style={{
                maxWidth: '100%',
                borderRadius: 'var(--radius-md)',
                margin: 'var(--space-2) 0',
              }}
            />
          );
        },

    code: ({
      className,
      children,
      ...props
    }: ComponentPropsWithoutRef<'code'>) => {
      const text = typeof children === 'string' ? children : String(children ?? '');
      const isBlock =
        (className?.startsWith('language-') ?? false) || text.includes('\n');
      if (isBlock) {
        // language-xxx → xxx ; else undefined → plaintext
        const lang = className?.match(/language-([\w-]+)/)?.[1];
        return <CodeBlock code={text.replace(/\n$/, '')} language={lang} />;
      }
      return (
        <code style={styles.inlineCode} {...props}>
          {children}
        </code>
      );
    },

    // react-markdown wraps block <code> in <pre>; CodeBlock already renders its own <pre>.
    pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => <>{children}</>,

    a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={styles.link}
        {...props}
      >
        {children}
      </a>
    ),

    p: ({ children, ...props }: ComponentPropsWithoutRef<'p'>) => (
      <p style={styles.paragraph} {...props}>
        {children}
      </p>
    ),

    ul: ({ children, ...props }: ComponentPropsWithoutRef<'ul'>) => (
      <ul style={styles.list} {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: ComponentPropsWithoutRef<'ol'>) => (
      <ol style={styles.list} {...props}>
        {children}
      </ol>
    ),

    h1: ({ children, ...props }: ComponentPropsWithoutRef<'h1'>) => (
      <h1 style={{ ...styles.heading, fontSize: 'var(--text-2xl)' }} {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: ComponentPropsWithoutRef<'h2'>) => (
      <h2 style={{ ...styles.heading, fontSize: 'var(--text-xl)' }} {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: ComponentPropsWithoutRef<'h3'>) => (
      <h3 style={{ ...styles.heading, fontSize: 'var(--text-lg)' }} {...props}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }: ComponentPropsWithoutRef<'h4'>) => (
      <h4 style={{ ...styles.heading, fontSize: 'var(--text-md)' }} {...props}>
        {children}
      </h4>
    ),

    blockquote: ({
      children,
      ...props
    }: ComponentPropsWithoutRef<'blockquote'>) => (
      <blockquote style={styles.blockquote} {...props}>
        {children}
      </blockquote>
    ),

    table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table} {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
      <th style={styles.th} {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
      <td style={styles.td} {...props}>
        {children}
      </td>
    ),
    hr: (props: ComponentPropsWithoutRef<'hr'>) => <hr style={styles.hr} {...props} />,
  };
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  rehypeKatex,
] as const;

const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
  stripImages = true,
}: MarkdownRendererProps) {
  const components = buildComponents(stripImages);
  return (
    <div className={className} style={styles.root} data-testid="markdown-root">
      <ReactMarkdown
        skipHtml
        urlTransform={urlAllowlist}
        remarkPlugins={remarkPlugins}
        // rehype-highlight tuple is typed loose; cast is fine for this stable combo.
        rehypePlugins={rehypePlugins as unknown as never[]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
