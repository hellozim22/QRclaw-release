'use client';

/**
 * AgentListRail — Wave 10 Lane C (#4 v1)
 *
 * WeChat-style single-column agent list (replaces the old 80px runtime rail
 * + 320px session list combo).
 *
 *   ┌────────────────────────────────┐
 *   │ 🟢  Claude Code                │
 *   │     点击开始对话               │
 *   ├────────────────────────────────┤
 *   │ 🟢  Cursor Agent               │
 *   │     点击开始对话               │
 *   └────────────────────────────────┘
 *
 * Clicking a row calls `onSelectAgent(agent.id)`.
 *
 * Token compliance: only v1 tokens from `design/design-tokens.css`.
 */

import { Search } from 'lucide-react';
import { useState } from 'react';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { getAgentDisplayName } from '@/lib/agent-display';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import type { AgentConnectionStatus, ChatMessage } from '@/stores/owner-agent-chat-store';

export interface ChatSearchResult {
  agentId: string;
  agentName: string;
  messageId: string;
  snippet: string;
  createdAt: string;
}

export interface AgentListRailProps {
  agents: OwnerAgentSummary[];
  selectedAgentId: string | null;
  statusByAgent: Record<string, AgentConnectionStatus>;
  messagesByAgent?: Record<string, ChatMessage[]>;
  searchQuery?: string;
  loading?: boolean;
  onSearchChange?: (query: string) => void;
  onSearchFocus?: () => void;
  onSelectAgent: (agentId: string) => void;
}

const RAIL_WIDTH = 280;

const isOnline = (agent: OwnerAgentSummary, status: AgentConnectionStatus | undefined): boolean => {
  if (status === 'online' || status === 'running') return true;
  if (status === 'failed') return false;
  return agent.runtime_status === 'online';
};

function AgentRow({
  agent,
  selected,
  online,
  onClick,
}: {
  agent: OwnerAgentSummary;
  selected: boolean;
  online: boolean;
  onClick: () => void;
}) {
  const displayName = getAgentDisplayName(agent);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`agent-list-item-${agent.id}`}
      aria-pressed={selected}
      aria-label={`${displayName}${online ? ' · Online' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        border: 'none',
        borderLeft: selected ? '3px solid var(--color-red)' : '3px solid transparent',
        background: selected ? 'var(--color-red-bg)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-primary)',
        color: 'var(--color-gray-800)',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        e.currentTarget.style.background = 'var(--color-gray-100)';
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        e.currentTarget.style.background = 'transparent';
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid var(--color-red)';
        e.currentTarget.style.outlineOffset = '-2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
      }}
    >
      <AgentAvatar agent={agent} size={44} showStatus online={online} />

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
          {displayName}
        </div>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-gray-600)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {online ? 'Online' : 'Offline'}
        </div>
      </div>
    </button>
  );
}

function Skeleton() {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-gray-100)',
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 12,
            width: '60%',
            background: 'var(--color-gray-100)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 6,
          }}
        />
        <div
          style={{
            height: 10,
            width: '40%',
            background: 'var(--color-gray-100)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      </div>
    </div>
  );
}

function buildSearchResults(
  agents: OwnerAgentSummary[],
  messagesByAgent: Record<string, ChatMessage[]>,
  query: string
): ChatSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: ChatSearchResult[] = [];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  for (const [agentId, messages] of Object.entries(messagesByAgent)) {
    const agent = agentById.get(agentId);
    if (!agent) continue;
    for (const message of messages) {
      if (!message.content.toLowerCase().includes(needle)) continue;
      results.push({
        agentId,
        agentName: getAgentDisplayName(agent),
        messageId: message.id,
        snippet:
          message.content.length > 120 ? `${message.content.slice(0, 120)}…` : message.content,
        createdAt: message.created_at,
      });
    }
  }
  return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20);
}

function SearchResultRow({ result, onClick }: { result: ChatSearchResult; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={`chat-search-result-${result.messageId}`}
      onClick={onClick}
      style={{
        width: '100%',
        border: 'none',
        background: 'transparent',
        padding: 'var(--space-3) var(--space-4)',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--font-primary)',
        borderBottom: '1px solid var(--color-gray-border)',
      }}
    >
      <div
        style={{
          color: 'var(--color-gray-800)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-medium)',
          marginBottom: 4,
        }}
      >
        {result.agentName}
      </div>
      <div
        style={{
          color: 'var(--color-gray-600)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.45,
        }}
      >
        {result.snippet}
      </div>
    </button>
  );
}

export default function AgentListRail({
  agents,
  selectedAgentId,
  statusByAgent,
  messagesByAgent = {},
  searchQuery: controlledSearchQuery,
  loading = false,
  onSearchChange,
  onSearchFocus,
  onSelectAgent,
}: AgentListRailProps) {
  const [uncontrolledSearchQuery, setUncontrolledSearchQuery] = useState('');
  const searchQuery = controlledSearchQuery ?? uncontrolledSearchQuery;
  const setSearchQuery = (next: string) => {
    setUncontrolledSearchQuery(next);
    onSearchChange?.(next);
  };
  const activeAgents = agents.filter((a) => a.status === 'active');
  const searchResults = buildSearchResults(activeAgents, messagesByAgent, searchQuery);
  const isSearching = searchQuery.trim().length > 0;

  return (
    <nav
      aria-label="Agent list"
      data-testid="agent-list-rail"
      style={{
        width: RAIL_WIDTH,
        minWidth: RAIL_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-white)',
        borderRight: '1px solid var(--color-dashboard-divider)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <header
        style={{
          flexShrink: 0,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-4)',
          borderBottom: '1px solid var(--color-dashboard-divider)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            width: '100%',
            height: 32,
            padding: '0 10px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-gray-100)',
          }}
        >
          <Search size={14} style={{ color: 'var(--color-gray-600)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={onSearchFocus}
            data-testid="chat-search-input"
            placeholder="Search chats..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-800)',
              fontFamily: 'var(--font-primary)',
            }}
          />
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-2) 0',
        }}
      >
        {loading && agents.length === 0 ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : activeAgents.length === 0 ? (
          <div
            data-testid="agent-list-empty"
            style={{
              padding: 'var(--space-6) var(--space-4)',
              textAlign: 'center',
              color: 'var(--color-gray-600)',
              fontSize: 'var(--text-md)',
              lineHeight: 1.6,
            }}
          >
            No agents yet.
            <br />
            Create one on the Agents page.
          </div>
        ) : isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map((result) => (
              <SearchResultRow
                key={`${result.agentId}-${result.messageId}`}
                result={result}
                onClick={() => onSelectAgent(result.agentId)}
              />
            ))
          ) : (
            <div
              data-testid="chat-search-empty"
              style={{
                padding: 'var(--space-6) var(--space-4)',
                textAlign: 'center',
                color: 'var(--color-gray-600)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.6,
              }}
            >
              No matching chats yet.
            </div>
          )
        ) : (
          activeAgents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              selected={agent.id === selectedAgentId}
              online={isOnline(agent, statusByAgent[agent.id])}
              onClick={() => onSelectAgent(agent.id)}
            />
          ))
        )}
      </div>
    </nav>
  );
}
