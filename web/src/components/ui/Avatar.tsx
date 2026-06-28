'use client';

import { User } from 'lucide-react';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: number;
  variant?: 'agent' | 'user';
  initials?: string;
}

const Avatar = ({ src, alt = '', size = 36, variant = 'agent', initials }: AvatarProps) => {
  const borderRadius = size > 40 ? 'var(--radius-xl)' : 'var(--radius-sm)';

  if (variant === 'user' && !src) {
    const containerStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius,
      background: 'var(--color-user-avatar-bg)',
      flexShrink: 0,
    };

    if (initials) {
      return (
        <div style={containerStyle}>
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: size * 0.4,
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-white)',
            }}
          >
            {initials}
          </span>
        </div>
      );
    }

    return (
      <div style={containerStyle}>
        <User size={size * 0.5} color="var(--color-white)" />
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius,
    objectFit: 'cover',
    flexShrink: 0,
  };

  if (src) {
    return <img src={src} alt={alt} style={imgStyle} />;
  }

  return <img src="/qrclaw-logo-icon.png" alt={alt || 'QRClaw'} style={imgStyle} />;
};

export default Avatar;
