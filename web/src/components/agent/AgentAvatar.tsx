'use client';

import { useState } from 'react';
import { getAgentDisplayName } from '@/lib/agent-display';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { ProviderLogo } from './ProviderLogo';

export function AgentAvatar({
  agent,
  size = 28,
  showStatus = false,
  online = false,
}: {
  agent: OwnerAgentSummary;
  size?: number;
  showStatus?: boolean;
  online?: boolean;
}) {
  const label = getAgentDisplayName(agent);
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = agent.avatar_url;
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <span
      data-testid={`agent-avatar-${agent.id}`}
      aria-label={label}
      title={label}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-gray-border)',
        background: 'var(--color-white)',
        color: 'var(--color-gray-900)',
        overflow: 'hidden',
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl ?? undefined}
          alt=""
          onError={() => setImageFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <ProviderLogo provider={agent.backend_provider} size={Math.max(16, size - 8)} />
      )}
      {showStatus && (
        <span
          aria-hidden="true"
          data-testid={online ? `agent-list-item-${agent.id}-online` : undefined}
          style={{
            position: 'absolute',
            right: 1,
            bottom: 1,
            width: Math.max(7, Math.round(size * 0.28)),
            height: Math.max(7, Math.round(size * 0.28)),
            borderRadius: 'var(--radius-full)',
            border: '2px solid var(--color-white)',
            background: online ? 'var(--color-green-text)' : 'var(--color-gray-400)',
          }}
        />
      )}
    </span>
  );
}
