import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownRenderer from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders headings and paragraphs with QRClaw tokens', () => {
    render(<MarkdownRenderer content={'# Hello\n\nworld'} />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('renders fenced code via CodeBlock with copy button', () => {
    render(<MarkdownRenderer content={'```ts\nconst x = 1;\n```'} />);
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
    expect(screen.getByTestId('code-block-copy')).toBeInTheDocument();
    expect(screen.getByLabelText(/代码语言 ts/)).toBeInTheDocument();
  });

  it('strips dangerous raw HTML (skipHtml)', () => {
    render(<MarkdownRenderer content={'before<script>alert(1)</script>after'} />);
    const root = screen.getByTestId('markdown-root');
    expect(root.querySelector('script')).toBeNull();
  });

  it('blocks non-http(s) link URLs via urlTransform allowlist', () => {
    render(<MarkdownRenderer content={'[click](javascript:alert(1))'} />);
    const anchor = screen.getByText('click').closest('a');
    // urlTransform('javascript:…') returns '' — react-markdown yields empty href.
    expect(anchor?.getAttribute('href') || '').toBe('');
  });

  it('renders GFM tables', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    render(<MarkdownRenderer content={md} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  });

  it('strips images by default', () => {
    render(<MarkdownRenderer content={'![x](https://ex.com/a.png)'} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
