import { createClient } from '@/lib/supabase/browser';

const getGatewayBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3100';

export type ConnectLocalHostResult = {
  ok: boolean;
  onlineRuntimeCount: number;
  attempts: number;
  message?: string;
};

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchOnlineCount(accessToken: string): Promise<number> {
  try {
    const res = await fetch(`${getGatewayBaseUrl()}/api/owner/local-host/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as {
      data?: { online_runtime_count?: number; host_connected?: boolean };
    };
    const online = body.data?.online_runtime_count ?? 0;
    const connected = body.data?.host_connected ?? false;
    return online > 0 || connected ? Math.max(online, connected ? 1 : 0) : 0;
  } catch {
    return 0;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeDaemonHealth(): Promise<{ running: boolean; agentCount: number }> {
  try {
    const res = await fetch('http://127.0.0.1:19515/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { running: false, agentCount: 0 };
    const body = (await res.json()) as { status?: string; agents?: unknown[] };
    const agents = Array.isArray(body.agents) ? body.agents.length : 0;
    return { running: body.status === 'running', agentCount: agents };
  } catch {
    return { running: false, agentCount: 0 };
  }
}

async function requestHostReattach(): Promise<boolean> {
  try {
    const res = await fetch('/api/dev/reattach-host', {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(90_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && body.ok === true;
  } catch {
    return false;
  }
}

/**
 * Wait for bundled desktop orchestrator / dev-up daemon, then refresh agent runtime status.
 * Retries the ensure-daemon probe up to `maxRetries` times (desktop never spawns setup.sh).
 */
export async function connectLocalHost(options?: {
  maxRetries?: number;
  pauseBetweenRetriesMs?: number;
}): Promise<ConnectLocalHostResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const pauseMs = options?.pauseBetweenRetriesMs ?? 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const daemon = await probeDaemonHealth();
      const token = await getAccessToken();
      let gatewayOnline = token ? await fetchOnlineCount(token) : 0;

      // Only spawn reattach when daemon is down. A healthy daemon may still be
      // registering with Gateway — interrupting it causes owner/token drift.
      if (!daemon.running) {
        await requestHostReattach();
        await sleep(2000);
      } else if (token && gatewayOnline === 0) {
        const maxPolls = 20;
        for (let poll = 0; poll < maxPolls; poll += 1) {
          await sleep(1500);
          gatewayOnline = await fetchOnlineCount(token);
          if (gatewayOnline > 0) break;
        }
      }

      const res = await fetch('/api/dev/ensure-daemon', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        online_runtime_count?: number;
        error?: string;
        message?: string;
      };

      if (res.ok && body.ok) {
        const online = body.online_runtime_count ?? (token ? await fetchOnlineCount(token) : 0);
        return {
          ok: true,
          onlineRuntimeCount: online,
          attempts: attempt,
        };
      }

      if (token) {
        for (let poll = 0; poll < 4; poll += 1) {
          const online = await fetchOnlineCount(token);
          if (online > 0) {
            return { ok: true, onlineRuntimeCount: online, attempts: attempt };
          }
          await sleep(1500);
        }
      }

      if (attempt < maxRetries) {
        await sleep(pauseMs);
        continue;
      }

      return {
        ok: false,
        onlineRuntimeCount: 0,
        attempts: attempt,
        message: body.message ?? body.error ?? '本机助手连接失败，请稍后重试。',
      };
    } catch (err) {
      if (attempt >= maxRetries) {
        return {
          ok: false,
          onlineRuntimeCount: 0,
          attempts: attempt,
          message: err instanceof Error ? err.message : '连接失败',
        };
      }
      await sleep(pauseMs);
    }
  }

  return {
    ok: false,
    onlineRuntimeCount: 0,
    attempts: maxRetries,
    message: '本机助手连接失败，请稍后重试。',
  };
}
