'use client';

/**
 * AgentSessionDrawer — Wave 10 Lane C (#17-layout)
 *
 * Floating panel anchored to the chat header "📋 历史 ▾" button. Lists
 * sessions for the currently-selected agent. Read-only consumer of
 * `useAgentSessions` — the parent passes the already-filtered list.
 *
 * Dismiss behavior:
 *  - Overlay click or Escape → onClose.
 *  - Selecting a session → calls onSelect then onClose.
 *
 * Keeps its own scroll; always positioned as a floating card, not a full-side
 * drawer, to minimize layout impact on the chat thread.
 */

import { useEffect } from 'react';
import type { AgentSession } from '@/hooks/useAgentSessions';

export interface AgentSessionDrawerProps {
  open: boolean;
  agentName: string | null;
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onRename: (sessionId: string, nextTitle: string) => void;
  onArchive: (sessionId: string) => void;
  onClose: () => void;
}

export default function AgentSessionDrawer({
  open,
  agentName,
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onArchive,
  onClose,
}: AgentSessionDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Transparent overlay to catch outside clicks. */}
      <div
        aria-hidden
        onClick={onClose}
        data-testid="agent-session-drawer-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          zIndex: 30,
        }}
      />
      <aside
        role="dialog"
        aria-label="会话历史"
        data-testid="agent-session-drawer"
        style={{
          position: 'fixed',
          top: 64,
          right: 'var(--space-6)',
          width: 320,
          maxHeight: '70vh',
          zIndex: 50,
          background: 'var(--color-white)',
          border: '1px solid var(--color-gray-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-primary)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--color-gray-border)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-gray-800)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {agentName ? `${agentName} · 历史` : '会话历史'}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            data-testid="agent-session-drawer-close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-gray-600)',
              fontSize: 'var(--text-lg)',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <button
            type="button"
            onClick={() => {
              onCreate();
              onClose();
            }}
            data-testid="agent-session-drawer-new"
            style={{
              width: '100%',
              height: 'var(--btn-height-outline)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--color-gray-border)',
              background: 'var(--color-white)',
              color: 'var(--color-red)',
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              cursor: 'pointer',
            }}
          >
            + 新对话
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 0 var(--space-2) 0',
          }}
        >
          {sessions.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-6) var(--space-4)',
                textAlign: 'center',
                fontSize: 'var(--text-md)',
                color: 'var(--color-gray-600)',
              }}
            >
              还没有历史会话
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sessions.map((s) => {
                const active = s.id === activeSessionId;
                return (
                  <li key={s.id}>
                    <div
                      data-testid={`agent-session-drawer-item-${s.id}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      onClick={() => {
                        onSelect(s.id);
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(s.id);
                          onClose();
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-4)',
                        borderLeft: active
                          ? '3px solid var(--color-red)'
                          : '3px solid transparent',
                        background: active ? 'var(--color-red-bg)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (active) return;
                        e.currentTarget.style.background =
                          'var(--color-gray-100)';
                      }}
                      onMouseLeave={(e) => {
                        if (active) return;
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--radius-full)',
                          background: s.isStreaming
                            ? 'var(--color-warning)'
                            : active
                              ? 'var(--color-red)'
                              : 'var(--color-gray-300)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 'var(--text-md)',
                          color: 'var(--color-gray-800)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: active
                            ? 'var(--font-medium)'
                            : 'var(--font-normal)',
                        }}
                      >
                        {s.title}
                      </span>
                      {s.updatedLabel && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-gray-500)',
                            flexShrink: 0,
                          }}
                        >
                          {s.updatedLabel}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`重命名 ${s.title}`}
                        data-testid={`agent-session-drawer-rename-${s.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const next = window.prompt('重命名会话', s.title);
                          if (next && next.trim()) onRename(s.id, next);
                        }}
                        style={iconBtnStyle('var(--color-gray-600)')}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`归档 ${s.title}`}
                        data-testid={`agent-session-drawer-archive-${s.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            window.confirm(
                              '归档此会话？历史消息保留，可从归档恢复。',
                            )
                          ) {
                            onArchive(s.id);
                          }
                        }}
                        style={iconBtnStyle('var(--color-delete-red)')}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

const iconBtnStyle = (color: string): React.CSSProperties => ({
  border: 'none',
  background: 'transparent',
  color,
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  padding: '2px 4px',
});
