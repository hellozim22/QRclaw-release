'use client';

/**
 * AgentRuntimeRail — Wave 10 S1
 *
 * Narrow (80px) left rail per `r2-c5-onboarding-final.md` §3.
 *
 * Shows all 4 default runtime slots (openclaw / claude / cursor / codex) as
 * `AgentCard compact` buttons.  Every slot is always rendered — even when
 * `status === 'not_installed'` — so users immediately see "4 个本机 runtime 槽位".
 *
 * Layout:
 *
 *   ┌────┐
 *   │ CC │  ← compact AgentCard per provider
 *   │ CU │
 *   │ CO │
 *   │ OC │
 *   ├────┤
 *   │ +  │  ← (future) add persona on same runtime
 *   └────┘
 */

import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';
import AgentCard, { type RuntimeStatus } from './AgentCard';

export interface RuntimeSlot {
  provider: OwnerAgentProvider;
  displayName: string;
  status: RuntimeStatus;
  /** agent_id bound to this runtime slot, if default-provisioned. */
  agentId: string | null;
  avatarUrl?: string | null;
}

export interface AgentRuntimeRailProps {
  slots: RuntimeSlot[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  /** Clicked a `not_installed` slot → show install hint on right pane. */
  onSelectUnavailable: (provider: OwnerAgentProvider) => void;
}

export default function AgentRuntimeRail({
  slots,
  selectedAgentId,
  onSelectAgent,
  onSelectUnavailable,
}: AgentRuntimeRailProps) {
  return (
    <nav
      aria-label="Runtime rail"
      style={{
        width: 80,
        minWidth: 80,
        background: 'var(--color-off-white)',
        borderRight: '1px solid var(--color-dashboard-divider)',
        padding: 'var(--space-3) 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <div
        aria-hidden
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-gray-600)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-1)',
        }}
      >
        Agents
      </div>

      {slots.map((slot) => {
        const handler = () => {
          if (slot.agentId && (slot.status === 'online' || slot.status === 'offline')) {
            onSelectAgent(slot.agentId);
          } else if (slot.agentId) {
            // still selectable but opens install hint on right pane
            onSelectAgent(slot.agentId);
            onSelectUnavailable(slot.provider);
          } else {
            onSelectUnavailable(slot.provider);
          }
        };
        return (
          <AgentCard
            key={slot.provider}
            id={slot.agentId ?? slot.provider}
            provider={slot.provider}
            name={slot.displayName}
            avatarUrl={slot.avatarUrl}
            runtimeStatus={slot.status}
            compact
            selected={slot.agentId !== null && slot.agentId === selectedAgentId}
            onSelect={handler}
          />
        );
      })}

      <span
        style={{
          flex: 1,
          width: 32,
          borderTop: '1px solid var(--color-gray-border)',
          marginTop: 'var(--space-3)',
          opacity: 0,
        }}
      />
    </nav>
  );
}
