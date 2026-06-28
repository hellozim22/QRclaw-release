'use client';

import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';

const RegisterBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
        background: 'var(--color-red-bg)',
        borderTop: '1px solid var(--color-red-light)',
        padding: '0 10px 0 14px',
        flexShrink: 0,
      }}
    >
      <UserPlus size={16} color="var(--color-red)" />
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-primary)',
          fontSize: 12,
          fontWeight: 'var(--font-medium)',
          color: 'var(--color-gray-700)',
        }}
      >
        Sign up to save chats &amp; access history
      </span>
      <a
        href="/signup"
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 12,
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-red)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Sign up &rarr;
      </a>
      <button
        onClick={() => setDismissed(true)}
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.06)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <X size={10} color="var(--color-black)" />
      </button>
    </div>
  );
};

export default RegisterBanner;
