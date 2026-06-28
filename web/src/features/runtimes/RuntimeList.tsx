'use client';

import { ProviderLogo } from '@/components/agent/ProviderLogo';
import { getProviderDisplayName } from '@/lib/agent-display';
import type { RuntimeRow } from './map-local-host-status';

export function RuntimeList({
  runtimes,
  selectedProvider,
  onSelect,
}: {
  runtimes: RuntimeRow[];
  selectedProvider: string | null;
  onSelect: (provider: string) => void;
}) {
  return (
    <aside
      style={{
        width: 300,
        borderRight: '1px solid var(--color-gray-border)',
        background: 'var(--color-off-white)',
        padding: 'var(--space-4)',
        overflowY: 'auto',
      }}
    >
      <h1 style={{ margin: '0 0 var(--space-4)', color: 'var(--color-gray-800)', fontSize: 'var(--text-2xl)' }}>
        Runtimes
      </h1>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {runtimes.map((runtime) => {
          const selected = runtime.provider === selectedProvider;
          const online = runtime.status === 'online';
          return (
            <button
              key={runtime.provider}
              type="button"
              onClick={() => onSelect(runtime.provider)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                width: '100%',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${selected ? 'var(--color-red)' : 'var(--color-gray-border)'}`,
                background: selected ? 'var(--color-red-bg)' : 'var(--color-white)',
                color: 'var(--color-gray-800)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-primary)',
              }}
            >
              <ProviderLogo provider={runtime.provider} size={28} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ display: 'block' }}>{getProviderDisplayName(runtime.provider)}</strong>
                <span style={{ color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
                  {online ? 'Online' : runtime.detected ? 'Detected' : 'Offline'}
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-full)',
                  background: online ? 'var(--color-green-text)' : 'var(--color-gray-400)',
                }}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
