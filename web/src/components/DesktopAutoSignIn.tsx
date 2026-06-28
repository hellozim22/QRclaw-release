'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { setProgressOwnerId } from '@/features/progress/storage-keys';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';
import { isDesktopMode } from '@/lib/desktop-bridge';

/**
 * Desktop WKWebView session — delegates to LocalDevAutoSignIn bootstrap path.
 * Kept for explicit desktop hook; primary auth is POST /api/dev/bootstrap.
 */
export function DesktopAutoSignIn() {
  const loadAgents = useOwnerAgentChatStore((s) => s.loadAgents);
  const ran = useRef(false);

  useEffect(() => {
    if (!isDesktopMode() || ran.current) return;
    ran.current = true;

    const sync = async () => {
      try {
        const res = await fetch('/api/dev/bootstrap', { method: 'POST', credentials: 'include' });
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok?: boolean;
          user_id?: string;
          access_token?: string;
          refresh_token?: string;
        };
        if (body.user_id) setProgressOwnerId(body.user_id);
        if (body.access_token && body.refresh_token) {
          const supabase = createClient();
          await supabase.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          await loadAgents();
        }
      } catch {
        // LocalDevAutoSignIn handles retry
      }
    };

    void sync();
  }, [loadAgents]);

  return null;
}
