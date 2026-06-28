'use client';

import { type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

const TopBar = ({ title, onBack, rightAction }: TopBarProps) => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 'var(--topbar-height)',
    background: 'var(--color-white)',
    padding: '0 var(--space-4)',
    borderBottom: '1px solid var(--color-gray-border)',
    flexShrink: 0,
  };

  const leftStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onBack ? 'pointer' : 'default',
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-gray-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const rightStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      <div style={leftStyle} onClick={onBack}>
        {onBack && <ChevronLeft size={24} color="var(--color-gray-800)" />}
      </div>
      <span style={titleStyle}>{title}</span>
      <div style={rightStyle}>{rightAction}</div>
    </div>
  );
};

export default TopBar;
