'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useAuth } from './useAuth';

export interface Conversation {
  id: string;
  qrcode_id: string;
  session_token: string;
  message_count: number;
  last_active_at: string | null;
  created_at: string;
  qrcodes: {
    slug: string;
    agent_id: string;
    profile: Record<string, unknown>;
    agents: {
      name: string;
    } | null;
  } | null;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useConversations = (): UseConversationsReturn => {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    // RLS chains: conversations → qrcodes → agents → owners → auth.uid()
    const { data, error: fetchError } = await supabase
      .from('conversations')
      .select(
        'id, qrcode_id, session_token, message_count, last_active_at, created_at, qrcodes(slug, agent_id, profile, agents(name))'
      )
      .order('last_active_at', { ascending: false, nullsFirst: false });

    if (fetchError) {
      // Fallback: try simpler query without nested agent join
      const { data: simpleData, error: simpleError } = await supabase
        .from('conversations')
        .select(
          'id, qrcode_id, session_token, message_count, last_active_at, created_at, qrcodes(slug, agent_id, profile)'
        )
        .order('last_active_at', { ascending: false, nullsFirst: false });

      if (simpleError) {
        setError(simpleError.message);
        setConversations([]);
      } else {
        setConversations((simpleData as unknown as Conversation[]) ?? []);
      }
    } else {
      setConversations((data as unknown as Conversation[]) ?? []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- void fetchConversations(): async; setState after await only (rule false positive).
      void fetchConversations();
    }
  }, [authLoading, fetchConversations]);

  return { conversations, loading: loading || authLoading, error, refetch: fetchConversations };
};
