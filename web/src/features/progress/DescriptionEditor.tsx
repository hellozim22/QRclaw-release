'use client';

import { useEffect, useState } from 'react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { normalizeProgressMarkdownText } from '@/lib/progress-markdown';

export function DescriptionEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const normalizedValue = normalizeProgressMarkdownText(value);
  const [editing, setEditing] = useState(!normalizedValue.trim());
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => {
    const next = normalizeProgressMarkdownText(value);
    setDraft(next);
    setEditing(!next.trim());
  }, [value]);

  const save = () => {
    const normalizedDraft = normalizeProgressMarkdownText(draft);
    onSave(normalizedDraft);
    setDraft(normalizedDraft);
    setEditing(!normalizedDraft.trim());
  };

  if (editing) {
    return (
      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-gray-border)',
          background: 'var(--color-white)',
          overflow: 'hidden',
        }}
      >
        <textarea
          data-testid="progress-task-description"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          rows={10}
          placeholder="描述目标、验收标准或补充说明"
          style={{
            width: '100%',
            minHeight: 220,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--color-gray-800)',
            padding: 'var(--space-4)',
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
            padding: '0 var(--space-3) var(--space-3)',
          }}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={save}
            style={{
              height: 34,
              padding: '0 var(--space-4)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-red)',
              color: 'var(--color-white)',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
              fontWeight: 'var(--font-semibold)',
            }}
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="progress-task-description"
      style={{
        minHeight: 180,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-white)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-gray-700)',
            cursor: 'pointer',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          编辑
        </button>
      </div>
      <MarkdownRenderer content={normalizedValue || '暂无详情。'} stripImages />
    </div>
  );
}
