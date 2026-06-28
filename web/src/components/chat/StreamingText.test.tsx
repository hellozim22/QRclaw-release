import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreamingText from './StreamingText';

describe('StreamingText', () => {
  it('shows caret while streaming and does not render markdown', () => {
    render(<StreamingText text="**bold** so far" isStreaming />);
    const host = screen.getByTestId('streaming-text');
    expect(host).toHaveAttribute('data-streaming', 'true');
    expect(host).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('stream-caret')).toBeInTheDocument();
    // Raw text contains the asterisks; markdown not yet compiled.
    expect(host.textContent).toContain('**bold**');
  });

  it('renders markdown once stream ends', () => {
    render(<StreamingText text="**bold**" isStreaming={false} />);
    const host = screen.getByTestId('streaming-text');
    expect(host).toHaveAttribute('data-streaming', 'false');
    expect(host).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('stream-caret')).toBeNull();
    // bold → <strong>
    expect(host.querySelector('strong')?.textContent).toBe('bold');
  });

  it('supports plain-text settled mode', () => {
    render(
      <StreamingText text="**as-is**" isStreaming={false} asMarkdown={false} />,
    );
    expect(screen.getByTestId('streaming-text').textContent).toBe('**as-is**');
  });
});
