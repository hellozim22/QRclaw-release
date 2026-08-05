'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { setProgressOwnerId } from '@/features/progress/storage-keys';
import { connectLocalHost } from '@/lib/connect-local-host';
import { useOwnerAgentChatStore } from '@/stores/owner-agent-chat-store';

import { isDesktopMode } from '@/lib/desktop-bridge';

interface BootstrapBody {
  ok?: boolean;
  user_id?: string;
  email?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

/** Server bootstrap → browser setSession（兼容 Cursor 内置浏览器 localStorage 问题） */
async function syncSessionFromBootstrap(targetEmail: string): Promise<boolean> {
  const supabase = createClient();
  const res = await fetch('/api/dev/bootstrap', { method: 'POST', credentials: 'include' });
  const body = (await res.json()) as BootstrapBody;
  if (!res.ok || !body.ok) {
    return false;
  }
  if (body.user_id) {
    setProgressOwnerId(body.user_id);
  }
  if (body.email && body.email !== targetEmail) {
    return false;
  }
  if (body.access_token && body.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) {
      console.warn('[LocalDevAutoSignIn] setSession failed:', error.message);
      return false;
    }
    return true;
  }
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user?.email === targetEmail;
}

async function ensureLocalDevSession(
  targetEmail: string,
  targetPassword: string
): Promise<boolean> {
  if (await syncSessionFromBootstrap(targetEmail)) {
    return true;
  }

  const supabase = createClient();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: targetEmail,
    password: targetPassword,
  });

  if (!error && data.session?.access_token && data.user?.email === targetEmail) {
    return true;
  }

  return syncSessionFromBootstrap(targetEmail);
}

/**
 * Multica 式本地启动：bootstrap session → ensure-daemon → loadAgents。
 */
export function LocalDevAutoSignIn() {
  const loadAgents = useOwnerAgentChatStore((s) => s.loadAgents);
  const setLocalDevAuthReady = useOwnerAgentChatStore((s) => s.setLocalDevAuthReady);
  const runId = useRef(0);

  useEffect(() => {
    const shouldBootstrap = process.env.NEXT_PUBLIC_LOCAL_DEV === '1' || isDesktopMode();
    if (!shouldBootstrap) return;

    const id = ++runId.current;
    setLocalDevAuthReady(false);

    const targetEmail = process.env.NEXT_PUBLIC_LOCAL_DEV_EMAIL;
    const targetPassword = process.env.NEXT_PUBLIC_LOCAL_DEV_PASSWORD;

    const bootstrap = async () => {
      if (!targetEmail || !targetPassword) {
        console.warn('[LocalDevAutoSignIn] missing NEXT_PUBLIC_LOCAL_DEV_* credentials');
        setLocalDevAuthReady(true);
        return;
      }

      const sessionOk = await ensureLocalDevSession(targetEmail, targetPassword);
      if (runId.current !== id) return;

      if (!sessionOk) {
        console.warn('[LocalDevAutoSignIn] could not establish local-dev session');
        return;
      }

      setLocalDevAuthReady(true);

      // Let ServiceOrchestrator finish mint-host attach before probing Gateway.
      if (isDesktopMode()) {
        await new Promise((r) => setTimeout(r, 5000));
      }

      await connectLocalHost({ maxRetries: isDesktopMode() ? 5 : 1 });

      for (let i = 0; i < 12; i += 1) {
        if (runId.current !== id) return;
        await loadAgents();
        const { localHostOnlineCount, agents } = useOwnerAgentChatStore.getState();
        if ((localHostOnlineCount ?? 0) > 0 && agents.length > 0) {
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };

    void bootstrap();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setLocalDevAuthReady(true);
        void loadAgents();
      }
      if (event === 'SIGNED_OUT') {
        setLocalDevAuthReady(false);
      }
    });

    return () => {
      runId.current += 1;
      subscription.unsubscribe();
    };
  }, [loadAgents, setLocalDevAuthReady]);

  return null;
}
