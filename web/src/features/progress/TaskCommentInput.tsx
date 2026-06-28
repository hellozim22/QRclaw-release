// Adapted from multica/packages/views/issues/components/comment-input.tsx

'use client';

import { Send } from 'lucide-react';

export function TaskCommentInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = value.trim().length > 0;

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-white)',
        overflow: 'hidden',
      }}
    >
      <textarea
        id="progress-task-comment"
        data-testid="progress-task-comment-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="记录验收意见、补充信息或下一步"
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-gray-800)',
          padding: 'var(--space-3)',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'var(--font-primary)',
          lineHeight: 1.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '0 var(--space-2) var(--space-2)',
        }}
      >
        <button
          type="button"
          data-testid="progress-task-comment-submit"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            height: 34,
            padding: '0 var(--space-3)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: canSubmit ? 'var(--color-red)' : 'var(--color-gray-200)',
            color: canSubmit ? 'var(--color-white)' : 'var(--color-gray-500)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-primary)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          <Send size={14} />
          Comment
        </button>
      </div>
    </div>
  );
}
