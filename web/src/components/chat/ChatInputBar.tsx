'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatInputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInputBar = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputBarProps) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 56,
        height: 56,
        background: 'var(--color-white)',
        borderTop: '1px solid var(--color-gray-border)',
        padding: '0 12px',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{
          flex: 1,
          height: 40,
          borderRadius: 20,
          background: 'var(--color-white)',
          border: '1px solid var(--color-input-border)',
          padding: '0 14px',
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-800)',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--color-red)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || !value.trim() ? 'default' : 'pointer',
          opacity: disabled || !value.trim() ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <ArrowUp size={18} color="var(--color-white)" />
      </button>
    </form>
  );
};

export default ChatInputBar;
