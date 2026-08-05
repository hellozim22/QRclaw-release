import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodeBlock from './CodeBlock';

const mockClipboard = (writeText: (text: string) => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
};

describe('CodeBlock', () => {
  it('shows language label when provided', () => {
    render(<CodeBlock code="ok" language="bash" />);
    expect(screen.getByLabelText('代码语言 bash')).toBeInTheDocument();
  });

  it('falls back to "text" when no language given', () => {
    render(<CodeBlock code="ok" />);
    expect(screen.getByLabelText(/代码语言 plaintext/)).toBeInTheDocument();
  });

  it('copies code to clipboard and shows confirmation', async () => {
    const writeText = vi.fn(async () => undefined);
    const user = userEvent.setup();
    mockClipboard(writeText);
    render(<CodeBlock code="hello()" language="ts" />);
    await user.click(screen.getByTestId('code-block-copy'));
    expect(writeText).toHaveBeenCalledWith('hello()');
    await waitFor(() => expect(screen.getByLabelText('已复制')).toBeInTheDocument());
  });

  it('does not throw if clipboard API rejects', async () => {
    const user = userEvent.setup();
    mockClipboard(async () => {
      throw new Error('denied');
    });
    render(<CodeBlock code="x" />);
    await user.click(screen.getByTestId('code-block-copy'));
    // Still rendered, no exception surfaced.
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
  });
});
