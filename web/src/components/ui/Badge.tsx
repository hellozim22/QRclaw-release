'use client';

interface BadgeProps {
  status: 'online' | 'offline' | 'busy';
  label?: string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  online: { color: 'var(--color-green)', label: 'Online' },
  offline: { color: 'var(--color-gray-500)', label: 'Offline' },
  busy: { color: 'var(--color-warning)', label: 'Busy' },
};

const Badge = ({ status, label }: BadgeProps) => {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--color-gray-100)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-gray-700)',
  };

  const dotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: 'var(--radius-full)',
    background: config.color,
    flexShrink: 0,
  };

  return (
    <span style={containerStyle}>
      <span style={dotStyle} />
      {displayLabel}
    </span>
  );
};

export default Badge;
