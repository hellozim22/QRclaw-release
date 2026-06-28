'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';

export interface AgentDetail {
  id: string;
  name: string;
  status: string;
  created_at: string;
  conversation_count: number;
  default_qrcode_id: string | null;
  has_chat_context: boolean;
  avatar_url: string | null;
}

interface UseAgentReturn {
  agent: AgentDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useAgent = (
  agentId: string,
  initialQrCodeId: string | null = null
): UseAgentReturn => {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    if (!agentId) {
      setAgent(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Fetch agent from the public-safe view (restricts columns for anon/visitor access)
    const { data: agentData, error: agentError } = await supabase
      .from('agents_public')
      .select('id, name, status, created_at')
      .eq('id', agentId)
      .single();

    if (agentError) {
      setError(agentError.message);
      setAgent(null);
      setLoading(false);
      return;
    }

    // Fetch conversation count via qrcodes -> conversations
    const { data: qrCodes } = await supabase
      .from('qrcodes')
      .select('id, status, created_at, profile')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    const activeQrCodes = (qrCodes ?? []).filter((qrcode) => qrcode.status === 'active');
    const initialQrBelongsToAgent = Boolean(
      initialQrCodeId && (qrCodes ?? []).some((qrcode) => qrcode.id === initialQrCodeId)
    );
    const defaultQrCodeId = initialQrBelongsToAgent
      ? initialQrCodeId
      : activeQrCodes.length === 1
        ? activeQrCodes[0].id
        : null;
    const qrForDisplay = initialQrBelongsToAgent
      ? (qrCodes ?? []).find((qrcode) => qrcode.id === initialQrCodeId)
      : activeQrCodes[0];
    const profileRecord =
      qrForDisplay && typeof qrForDisplay.profile === 'object' && qrForDisplay.profile !== null
        ? (qrForDisplay.profile as Record<string, unknown>)
        : null;
    const avatarUrl =
      profileRecord &&
      typeof profileRecord.avatar_url === 'string' &&
      profileRecord.avatar_url.trim().length > 0
        ? profileRecord.avatar_url.trim()
        : null;

    const { count } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in(
        'qrcode_id',
        (qrCodes ?? []).map((q) => q.id)
      );

    setAgent({
      ...agentData,
      conversation_count: count ?? 0,
      default_qrcode_id: defaultQrCodeId,
      has_chat_context: defaultQrCodeId !== null,
      avatar_url: avatarUrl,
    });
    setLoading(false);
  }, [agentId, initialQrCodeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- void fetchAgent(): async; setState after await only (rule false positive).
    void fetchAgent();
  }, [fetchAgent]);

  return { agent, loading, error, refetch: fetchAgent };
};
