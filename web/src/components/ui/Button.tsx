'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--color-red)',
    color: 'var(--color-white)',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-white)',
    color: 'var(--color-gray-800)',
    border: '1px solid var(--color-gray-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-gray-800)',
    border: 'none',
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: {
    height: '36px',
    padding: '0 16px',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-medium)' as string,
  },
  md: {
    height: 'var(--btn-height-outline)',
    padding: '0 24px',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-medium)' as string,
  },
  lg: {
    height: 'var(--btn-height-primary)',
    padding: '0 24px',
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)' as string,
  },
};

const Button = ({
  variant = 'primary',
  size = 'lg',
  children,
  disabled,
  style,
  ...props
}: ButtonProps) => {
  const sanitizedStyle = Object.fromEntries(
    Object.entries(style ?? {}).filter(([, value]) => value !== undefined)
  ) as React.CSSProperties;

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-lg)',
    fontFamily: 'var(--font-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s ease',
    width: '100%',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...sanitizedStyle,
  };

  return (
    <button style={baseStyle} disabled={disabled} {...props}>
      {children}
    </button>
  );
};

export default Button;
