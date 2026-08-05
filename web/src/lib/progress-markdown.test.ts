import { describe, expect, it } from 'vitest';
import { normalizeProgressMarkdownText } from './progress-markdown';

describe('normalizeProgressMarkdownText', () => {
  it('decodes escaped markdown line breaks for structured task details', () => {
    expect(normalizeProgressMarkdownText('## 任务背景\\n\\n背景内容\\n\\n## 任务详情')).toBe(
      '## 任务背景\n\n背景内容\n\n## 任务详情'
    );
  });

  it('preserves escaped line breaks inside code spans and fenced code blocks', () => {
    const source = [
      '## 任务详情',
      '',
      '`const s = "a\\nb"`',
      '',
      '```js',
      'const text = "x\\ny";',
      '```',
    ].join('\\n');

    expect(normalizeProgressMarkdownText(source)).toBe(
      ['## 任务详情', '', '`const s = "a\\nb"`', '', '```js', 'const text = "x\\ny";', '```'].join(
        '\n'
      )
    );
  });

  it('returns an empty string for malformed non-string values', () => {
    expect(normalizeProgressMarkdownText(null)).toBe('');
  });
});
