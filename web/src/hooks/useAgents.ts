'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useAuth } from './useAuth';

export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  account_label: string | null;
  status: string;
  ws_connected: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string | null;
  claimed_at: string | null;
}

interface UseAgentsReturn {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const SELECT_FIELDS =
  'id, owner_id, name, description, account_label, status, ws_connected, last_seen_at, created_at, updated_at, claimed_at';

export const useAgents = (): UseAgentsReturn => {
  const { user, loading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Generation counter so a later refetch() always wins over a slower earlier
  // one: each call bumps the id, and only commits state if its id still
  // matches the latest. Prevents "delete → refetch → list still shows deleted
  // row because the slow pre-delete fetch resolved last" style bugs.
  const requestIdRef = useRef(0);

  const fetchAgents = useCallback(async () => {
    const myId = ++requestIdRef.current;

    if (!user) {
      if (myId !== requestIdRef.current) return;
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    // Sort: archived rows sink to the bottom; within each bucket newest-first.
    // Done client-side so we stay resilient to new status values the backend
    // may introduce later.
    const { data, error: fetchError } = await supabase
      .from('agents')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false });

    if (myId !== requestIdRef.current) {
      // A newer fetchAgents call has been issued; discard our stale result.
      return;
    }

    if (fetchError) {
      setError(fetchError.message);
      setAgents([]);
    } else {
      const rows = (data ?? []) as Agent[];
      const sorted = [...rows].sort((a, b) => {
        const archivedA = a.status === 'archived' ? 1 : 0;
        const archivedB = b.status === 'archived' ? 1 : 0;
        if (archivedA !== archivedB) return archivedA - archivedB;
        return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
      });
      setAgents(sorted);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- void fetchAgents(): async work; setState only after await inside fetchAgents, not sync in effect body (rule false positive on void async calls).
      void fetchAgents();
    }
  }, [authLoading, fetchAgents]);

  return { agents, loading: loading || authLoading, error, refetch: fetchAgents };
};
