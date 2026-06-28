'use client';

/**
 * useAgentSessions — Wave 10 Lane C (#4 v1)
 *
 * State-down-shifted hook that owns per-agent session state so chat page and
 * the upcoming `AgentSessionDrawer` (#17-layout) can consume the same source.
 *
 * Scope for v1:
 *  - In-memory sessions keyed by agentId.
 *  - Create / rename / archive / select (select-to-activate).
 *  - No server persistence (the store doesn't expose session CRUD yet — that
 *    moves into this hook once the gateway contract lands in Wave 11).
 *
 * Notes
 *  - Intentionally does NOT touch `owner-agent-chat-store` — another lane is
 *    mutating it and we don't want a merge bomb.
 *  - Exposes a stable API so tests can drive through the hook without having
 *    to mock the store.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface AgentSession {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  /** e.g. "2m", "昨天". Free-form label, not used for sorting. */
  updatedLabel?: string;
  /** Unix ms; used for ordering in the drawer. */
  updatedAt: number;
  isStreaming?: boolean;
}

export interface UseAgentSessionsApi {
  /** All sessions across agents, most recent first. */
  allSessions: AgentSession[];
  /** Sessions filtered to the current agent, most recent first. */
  sessionsForActiveAgent: AgentSession[];
  /** Active session id for the current agent (null if none). */
  activeSessionId: string | null;

  createSession: (opts?: { title?: string }) => AgentSession | null;
  ensureSession: (opts?: { id?: string; title?: string }) => AgentSession | null;
  renameSession: (sessionId: string, nextTitle: string) => void;
  archiveSession: (sessionId: string) => void;
  selectSession: (sessionId: string) => void;
  /** Programmatically set active session for an agent (used by page). */
  setActiveSession: (agentId: string, sessionId: string | null) => void;
}

export interface UseAgentSessionsInput {
  activeAgentId: string | null;
  activeAgentName: string | null;
  restoredSessions?: AgentSession[];
}

export function useAgentSessions({
  activeAgentId,
  activeAgentName,
  restoredSessions = [],
}: UseAgentSessionsInput): UseAgentSessionsApi {
  const [sessionsByAgent, setSessionsByAgent] = useState<
    Record<string, AgentSession[]>
  >({});
  const [activeSessionByAgent, setActiveSessionByAgent] = useState<
    Record<string, string | null>
  >({});

  const allSessions = useMemo(() => {
    const flat = Object.values(sessionsByAgent).flat();
    return flat.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessionsByAgent]);

  const sessionsForActiveAgent = useMemo(() => {
    if (!activeAgentId) return [];
    const list = sessionsByAgent[activeAgentId] ?? [];
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeAgentId, sessionsByAgent]);

  const activeSessionId = activeAgentId
    ? activeSessionByAgent[activeAgentId] ?? null
    : null;

  useEffect(() => {
    if (restoredSessions.length === 0) return;
    setSessionsByAgent((prev) => {
      let changed = false;
      const next: Record<string, AgentSession[]> = { ...prev };
      for (const session of restoredSessions) {
        const existing = next[session.agentId]?.find((item) => item.id === session.id);
        if (existing) {
          if (
            existing.title === session.title &&
            existing.updatedAt === session.updatedAt &&
            existing.updatedLabel === session.updatedLabel
          ) {
            continue;
          }
          next[session.agentId] = (next[session.agentId] ?? []).map((item) =>
            item.id === session.id ? { ...item, ...session } : item,
          );
        } else {
          next[session.agentId] = [session, ...(next[session.agentId] ?? [])];
        }
        changed = true;
      }
      return changed ? next : prev;
    });
    setActiveSessionByAgent((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const session of restoredSessions) {
        if (next[session.agentId]) continue;
        next[session.agentId] = session.id;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [restoredSessions]);

  const ensureSession = useCallback(
    (opts?: { id?: string; title?: string }): AgentSession | null => {
      if (!activeAgentId || !activeAgentName) return null;
      const id =
        opts?.id ??
        `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const session: AgentSession = {
        id,
        agentId: activeAgentId,
        agentName: activeAgentName,
        title: opts?.title?.trim() || `新对话 · ${activeAgentName}`,
        updatedAt: Date.now(),
        updatedLabel: '刚刚',
      };
      let ensured = session;
      setSessionsByAgent((prev) => {
        const existing = prev[activeAgentId]?.find((s) => s.id === id);
        if (existing) {
          ensured = existing;
          return prev;
        }
        return {
          ...prev,
          [activeAgentId]: [session, ...(prev[activeAgentId] ?? [])],
        };
      });
      return ensured;
    },
    [activeAgentId, activeAgentName],
  );

  const createSession = useCallback(
    (opts?: { title?: string }): AgentSession | null => {
      const session = ensureSession(opts);
      if (activeAgentId && session) {
        setActiveSessionByAgent((prev) => ({ ...prev, [activeAgentId]: session.id }));
      }
      return session;
    },
    [activeAgentId, ensureSession],
  );

  const renameSession = useCallback(
    (sessionId: string, nextTitle: string) => {
      const title = nextTitle.trim();
      if (!title) return;
      setSessionsByAgent((prev) => {
        const next: Record<string, AgentSession[]> = {};
        for (const [aid, list] of Object.entries(prev)) {
          next[aid] = list.map((s) =>
            s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s,
          );
        }
        return next;
      });
    },
    [],
  );

  const archiveSession = useCallback((sessionId: string) => {
    setSessionsByAgent((prev) => {
      const next: Record<string, AgentSession[]> = {};
      for (const [aid, list] of Object.entries(prev)) {
        next[aid] = list.filter((s) => s.id !== sessionId);
      }
      return next;
    });
    setActiveSessionByAgent((prev) => {
      const next = { ...prev };
      for (const [aid, sid] of Object.entries(next)) {
        if (sid === sessionId) next[aid] = null;
      }
      return next;
    });
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      const session = Object.values(sessionsByAgent)
        .flat()
        .find((s) => s.id === sessionId);
      if (!session) return;
      setActiveSessionByAgent((prev) => ({
        ...prev,
        [session.agentId]: sessionId,
      }));
    },
    [sessionsByAgent],
  );

  const setActiveSession = useCallback(
    (agentId: string, sessionId: string | null) => {
      setActiveSessionByAgent((prev) => ({ ...prev, [agentId]: sessionId }));
    },
    [],
  );

  return {
    allSessions,
    sessionsForActiveAgent,
    activeSessionId,
    createSession,
    ensureSession,
    renameSession,
    archiveSession,
    selectSession,
    setActiveSession,
  };
}

export default useAgentSessions;
