'use client';

/**
 * AgentCard — Wave 10 S1
 *
 * Presentational agent row. Shows avatar / name / runtime hint and a status dot.
 * Parent (page) owns the underlying store and passes `runtimeStatus` + `onSelect`.
 *
 * Token compliance: strictly uses v1 tokens from `design/design-tokens.css`
 * per `docs/wave10/r3-token-mapping.md`. No `--surface-*` / `--text-*` etc.
 */

import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';

export type RuntimeStatus =
  | 'online'
  | 'offline'
  | 'needs_login'
  | 'not_installed'
  | 'updating'
  | 'error';

export interface AgentCardProps {
  id: string;
  name: string;
  provider: OwnerAgentProvider;
  avatarUrl?: string | null;
  runtimeStatus: RuntimeStatus;
  selected?: boolean;
  disabled?: boolean;
  hint?: string;
  onSelect?: (id: string) => void;
  /** Compact: used inside the 80px runtime rail. */
  compact?: boolean;
}

const DOT_COLOR: Record<RuntimeStatus, string> = {
  online: 'var(--color-green)',
  offline: 'var(--color-gray-500)',
  needs_login: 'var(--color-warning)',
  updating: 'var(--color-warning)',
  not_installed: 'var(--color-gray-500)',
  error: 'var(--color-delete-red)',
};

const STATUS_LABEL: Record<RuntimeStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  needs_login: '需登录',
  updating: '更新中',
  not_installed: 'Not installed',
  error: '错误',
};

export function StatusDot({ status, size = 8 }: { status: RuntimeStatus; size?: number }) {
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      role="img"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 'var(--radius-full)',
        background: DOT_COLOR[status],
        flexShrink: 0,
      }}
    />
  );
}

export default function AgentCard({
  id,
  name,
  provider,
  avatarUrl,
  runtimeStatus,
  selected = false,
  disabled = false,
  hint,
  onSelect,
  compact = false,
}: AgentCardProps) {
  const handleClick = () => {
    if (disabled) return;
    onSelect?.(id);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={`${name} · ${STATUS_LABEL[runtimeStatus]}`}
        aria-pressed={selected}
        title={`${name}\n${STATUS_LABEL[runtimeStatus]}`}
        style={{
          position: 'relative',
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-lg)',
          border: selected
            ? '2px solid var(--color-red)'
            : '1px solid var(--color-gray-border)',
          background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'background 120ms, border-color 120ms',
        }}
        onFocus={(event) => {
          event.currentTarget.style.outline = '2px solid var(--color-red)';
          event.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(event) => {
          event.currentTarget.style.outline = 'none';
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-full)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-gray-800)',
              fontFamily: 'var(--font-primary)',
              textTransform: 'uppercase',
            }}
          >
            {provider.slice(0, 2)}
          </span>
        )}
        <span
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            display: 'inline-flex',
          }}
        >
          <StatusDot status={runtimeStatus} size={8} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={selected}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        border: 'none',
        borderLeft: selected
          ? '3px solid var(--color-red)'
          : '3px solid transparent',
        background: selected ? 'var(--color-red-bg)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        textAlign: 'left',
        fontFamily: 'var(--font-primary)',
        color: 'var(--color-gray-800)',
        transition: 'background 120ms',
      }}
      onMouseEnter={(event) => {
        if (disabled || selected) return;
        event.currentTarget.style.background = 'var(--color-gray-100)';
      }}
      onMouseLeave={(event) => {
        if (disabled || selected) return;
        event.currentTarget.style.background = 'transparent';
      }}
      onFocus={(event) => {
        event.currentTarget.style.outline = '2px solid var(--color-red)';
        event.currentTarget.style.outlineOffset = '-2px';
      }}
      onBlur={(event) => {
        event.currentTarget.style.outline = 'none';
      }}
    >
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-gray-100)',
          border: '1px solid var(--color-gray-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-gray-700)',
          textTransform: 'uppercase',
          overflow: 'hidden',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          provider.slice(0, 2)
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--color-gray-800)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-gray-600)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 2,
          }}
        >
          <StatusDot status={runtimeStatus} size={6} />
          <span>{hint ?? STATUS_LABEL[runtimeStatus]}</span>
        </div>
      </div>
    </button>
  );
}
