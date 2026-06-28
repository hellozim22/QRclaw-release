'use client';

import { type InputHTMLAttributes, type ReactNode, useId, useState } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Taller field for mobile auth screens (visual audit). */
  variant?: 'default' | 'authMobile';
  /** Secondary label color (e.g. Create QR configure step). */
  labelMuted?: boolean;
}

const Input = ({
  label,
  error,
  iconLeft,
  iconRight,
  variant = 'default',
  labelMuted = false,
  style,
  onFocus,
  onBlur,
  id: idProp,
  ...props
}: InputProps) => {
  const [focused, setFocused] = useState(false);
  const autoId = useId();

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-medium)',
    color: labelMuted ? 'var(--color-gray-600)' : 'var(--color-gray-800)',
  };

  const borderColor = error
    ? 'var(--color-red)'
    : focused
      ? 'var(--color-red)'
      : 'var(--color-input-border)';

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: variant === 'authMobile' ? 'var(--input-height-auth-mobile)' : 'var(--input-height)',
    background: 'var(--color-white)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${borderColor}`,
    padding: '0 var(--space-4)',
    gap: 'var(--space-2)',
    transition: 'border-color 0.15s ease',
    ...style,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-normal)',
    color: 'var(--color-gray-800)',
  };

  const errorStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-red)',
  };

  const inputId = idProp ?? autoId;

  return (
    <div style={containerStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      )}
      <div style={wrapperStyle}>
        {iconLeft && <span style={{ display: 'flex', flexShrink: 0 }}>{iconLeft}</span>}
        <input
          id={inputId}
          style={inputStyle}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {iconRight && <span style={{ display: 'flex', flexShrink: 0 }}>{iconRight}</span>}
      </div>
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
};

export default Input;
