'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useAuth } from './useAuth';

export interface QRCode {
  id: string;
  agent_id: string;
  slug: string;
  status: 'active' | 'paused' | 'revoked' | 'draft';
  profile: Record<string, unknown>;
  config_version: number;
  created_at: string;
  agents: {
    name: string;
  } | null;
}

interface UseQRCodesReturn {
  qrcodes: QRCode[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useQRCodes = (): UseQRCodesReturn => {
  const { user, loading: authLoading } = useAuth();
  const [qrcodes, setQrcodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQRCodes = useCallback(async () => {
    if (!user) {
      setQrcodes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    // RLS policy on qrcodes chains through agents → owners → auth.uid()
    // so no explicit .eq('owner_id', ...) is needed
    const { data, error: fetchError } = await supabase
      .from('qrcodes')
      .select('id, agent_id, slug, status, profile, config_version, created_at, agents(name)')
      .neq('status', 'revoked')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setQrcodes([]);
    } else {
      setQrcodes((data as unknown as QRCode[]) ?? []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- void fetchQRCodes(): async; setState after await only (rule false positive).
      void fetchQRCodes();
    }
  }, [authLoading, fetchQRCodes]);

  return { qrcodes, loading: loading || authLoading, error, refetch: fetchQRCodes };
};
