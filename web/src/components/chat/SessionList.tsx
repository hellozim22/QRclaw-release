'use client';

/**
 * SessionList — Wave 10 S1
 *
 * Middle column (320px per `r2-c5-onboarding-final.md` §11).
 *
 * Controlled component: parent owns the session array + active id and handles
 * create/rename/archive mutations.  This file is presentation-only so it can
 * be tested without the store.
 *
 * Wave 10 uses Archive semantics for "delete" (§12) — history is retained.
 */

import { useState } from 'react';

export interface SessionItem {
  id: string;
  title: string;
  /** e.g. "2m", "昨天", "周一" */
  updatedLabel?: string;
  /** Whether this session has an in-flight SSE run. */
  isStreaming?: boolean;
  /** Used to group by agent in the list. */
  agentId: string;
  agentName: string;
}

export interface SessionListProps {
  sessions: SessionItem[];
  activeSessionId: string | null;
  /** If set, list is filtered to sessions under this agent only. */
  filterAgentId?: string | null;
  canCreate?: boolean;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onRename: (sessionId: string, nextTitle: string) => void;
  onArchive: (sessionId: string) => void;
}

export default function SessionList({
  sessions,
  activeSessionId,
  filterAgentId,
  canCreate = true,
  onSelect,
  onCreate,
  onRename,
  onArchive,
}: SessionListProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = sessions.filter((session) => {
    if (filterAgentId && session.agentId !== filterAgentId) return false;
    if (!normalizedQuery) return true;
    return (
      session.title.toLowerCase().includes(normalizedQuery) ||
      session.agentName.toLowerCase().includes(normalizedQuery)
    );
  });

  const grouped = filtered.reduce<Record<string, SessionItem[]>>((acc, session) => {
    const bucket = acc[session.agentName] ?? [];
    bucket.push(session);
    acc[session.agentName] = bucket;
    return acc;
  }, {});

  const startRename = (session: SessionItem) => {
    setRenamingId(session.id);
    setDraftTitle(session.title);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = draftTitle.trim();
    if (next) onRename(renamingId, next);
    setRenamingId(null);
    setDraftTitle('');
  };

  return (
    <aside
      aria-label="Session list"
      style={{
        width: 'var(--web-middle-col-width)',
        minWidth: 260,
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-white)',
        borderRight: '1px solid var(--color-dashboard-divider)',
        height: '100%',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <header
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          borderBottom: '1px solid var(--color-gray-border)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-gray-800)',
          }}
        >
          Sessions
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate}
          aria-label="新建 Session"
          style={{
            height: 'var(--btn-height-outline)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-gray-border)',
            background: canCreate ? 'var(--color-white)' : 'var(--color-gray-100)',
            color: canCreate ? 'var(--color-red)' : 'var(--color-gray-500)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-medium)',
            cursor: canCreate ? 'pointer' : 'not-allowed',
            transition: 'background 120ms',
          }}
          onMouseEnter={(event) => {
            if (!canCreate) return;
            event.currentTarget.style.background = 'var(--color-red-bg)';
          }}
          onMouseLeave={(event) => {
            if (!canCreate) return;
            event.currentTarget.style.background = 'var(--color-white)';
          }}
        >
          + New Session
        </button>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions..."
          aria-label="Search sessions"
          style={{
            height: 'var(--input-height)',
            padding: '0 var(--space-3)',
            border: '1px solid var(--color-input-border)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            color: 'var(--color-gray-800)',
            background: 'var(--color-white)',
            outline: 'none',
          }}
          onFocus={(event) => {
            event.currentTarget.style.borderColor = 'var(--color-red)';
          }}
          onBlur={(event) => {
            event.currentTarget.style.borderColor = 'var(--color-input-border)';
          }}
        />
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-2) 0',
        }}
      >
        {filtered.length === 0 && (
          <div
            style={{
              padding: 'var(--space-6) var(--space-4)',
              color: 'var(--color-gray-600)',
              fontSize: 'var(--text-md)',
              textAlign: 'center',
            }}
          >
            {sessions.length === 0 ? '还没有 session，点上面新建。' : '没有匹配的 session。'}
          </div>
        )}

        {Object.entries(grouped).map(([agentName, items]) => (
          <section key={agentName} style={{ marginBottom: 'var(--space-3)' }}>
            {!filterAgentId && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-medium)',
                  color: 'var(--color-gray-600)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {agentName}
              </div>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((session) => {
                const active = session.id === activeSessionId;
                const isEditing = renamingId === session.id;
                return (
                  <li key={session.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      onClick={() => !isEditing && onSelect(session.id)}
                      onKeyDown={(event) => {
                        if (isEditing) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(session.id);
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
                        cursor: isEditing ? 'text' : 'pointer',
                        outline: 'none',
                      }}
                      onMouseEnter={(event) => {
                        if (active || isEditing) return;
                        event.currentTarget.style.background = 'var(--color-gray-100)';
                      }}
                      onMouseLeave={(event) => {
                        if (active || isEditing) return;
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
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--radius-full)',
                          background: session.isStreaming
                            ? 'var(--color-warning)'
                            : active
                              ? 'var(--color-red)'
                              : 'var(--color-gray-300)',
                          flexShrink: 0,
                        }}
                      />
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitRename();
                            } else if (event.key === 'Escape') {
                              setRenamingId(null);
                              setDraftTitle('');
                            }
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: '1px solid var(--color-red)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px var(--space-2)',
                            fontSize: 'var(--text-md)',
                            fontFamily: 'var(--font-primary)',
                            color: 'var(--color-gray-800)',
                            outline: 'none',
                          }}
                          aria-label="Rename session"
                        />
                      ) : (
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
                          {session.title}
                        </span>
                      )}
                      {session.updatedLabel && !isEditing && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-gray-500)',
                            flexShrink: 0,
                          }}
                        >
                          {session.updatedLabel}
                        </span>
                      )}
                      {!isEditing && (
                        <span
                          style={{
                            display: 'flex',
                            gap: 'var(--space-1)',
                            marginLeft: 'var(--space-1)',
                            opacity: active ? 1 : 0.6,
                          }}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startRename(session);
                            }}
                            aria-label={`重命名 ${session.title}`}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--color-gray-600)',
                              fontSize: 'var(--text-sm)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (
                                window.confirm(
                                  '归档此 session？历史消息保留，可从归档恢复。',
                                )
                              ) {
                                onArchive(session.id);
                              }
                            }}
                            aria-label={`归档 ${session.title}`}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--color-delete-red)',
                              fontSize: 'var(--text-sm)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
