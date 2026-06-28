const escapedLineBreakPattern = /\\r\\n|\\n/g;

function shouldDecodeEscapedLineBreaks(value: string): boolean {
  const matches = value.match(escapedLineBreakPattern);
  if (!matches || matches.length < 2) return false;
  return /任务背景|任务详情|任务解决进度|#{1,6}\s/.test(value);
}

export function normalizeProgressMarkdownText(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (!shouldDecodeEscapedLineBreaks(value)) return value;

  let output = '';
  let linePrefix = '';
  let inFence = false;
  let inInlineCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const atLineStart = linePrefix.trim().length === 0;
    const startsFence =
      atLineStart &&
      !inInlineCode &&
      (value.startsWith('```', index) || value.startsWith('~~~', index));

    if (startsFence) {
      inFence = !inFence;
    } else if (char === '`' && !inFence) {
      inInlineCode = !inInlineCode;
    }

    const escapedBreak =
      value.startsWith('\\r\\n', index)
        ? '\\r\\n'
        : value.startsWith('\\n', index)
          ? '\\n'
          : null;

    const nextAfterBreak = escapedBreak ? value.slice(index + escapedBreak.length) : '';
    const fenceBoundaryBreak =
      inFence &&
      !inInlineCode &&
      (linePrefix.trim().startsWith('```') ||
        linePrefix.trim().startsWith('~~~') ||
        /^\s*(```|~~~)/.test(nextAfterBreak));

    if (escapedBreak && ((!inFence && !inInlineCode) || fenceBoundaryBreak)) {
      output += '\n';
      linePrefix = '';
      inInlineCode = false;
      index += escapedBreak.length - 1;
      continue;
    }

    output += char;
    if (char === '\n') {
      linePrefix = '';
      inInlineCode = false;
    } else {
      linePrefix += char;
    }
  }

  return output;
}
