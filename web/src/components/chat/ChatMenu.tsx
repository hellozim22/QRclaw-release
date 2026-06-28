'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, RotateCcw } from 'lucide-react';

interface ChatMenuProps {
  onResetSession: () => void;
}

const ChatMenu = ({ onResetSession }: ChatMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Chat menu"
        data-testid="chat-menu-button"
        style={{
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <MoreVertical size={18} color="var(--color-gray-800)" />
      </button>
      {open && (
        <div
          data-testid="chat-menu-dropdown"
          role="menu"
          style={{
            position: 'absolute',
            top: 28,
            right: 0,
            minWidth: 160,
            background: 'var(--color-white)',
            border: '1px solid var(--color-gray-border)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => {
              onResetSession();
              setOpen(false);
            }}
            role="menuitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-primary)',
              fontSize: 14,
              color: 'var(--color-gray-700)',
              textAlign: 'left',
            }}
          >
            <RotateCcw size={14} />
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatMenu;
