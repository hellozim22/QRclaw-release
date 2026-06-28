import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { isDesktopBootstrap, isLocalHostRequest } from '@/lib/local-app-shell';

const HEALTH_PORT = 19515;
const HEALTH_URL = `http://127.0.0.1:${HEALTH_PORT}/health`;

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function isDevRouteAllowed(request: NextRequest): boolean {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin') ?? '';
  const isLocalHost = isLocalHostRequest(host, origin);

  // Desktop app: host is started by ServiceOrchestrator; this route probes only.
  if (isDesktopBootstrap() && isLocalHost) {
    return true;
  }

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    process.env.LOCAL_DEV_BOOTSTRAP !== '1'
  ) {
    return false;
  }
  return isLocalHost;
}

async function probeDaemonHealth(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function gatewayOnlineForSession(
  gatewayBase: string,
  accessToken: string,
): Promise<{ online: number; connected: boolean } | null> {
  try {
    const statusRes = await fetch(`${gatewayBase}/api/owner/local-host/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!statusRes.ok) return null;
    const body = (await statusRes.json()) as {
      data?: { online_runtime_count?: number; host_connected?: boolean };
    };
    return {
      online: body.data?.online_runtime_count ?? 0,
      connected: body.data?.host_connected ?? false,
    };
  } catch {
    return null;
  }
}

function runSetup(userId: string): Promise<void> {
  const setupScript = path.join(repoRoot(), 'scripts/qrclaw-setup.sh');
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [setupScript], {
      cwd: repoRoot(),
      env: {
        ...process.env,
        ...(userId ? { QRCLAW_ATTACH_USER_ID: userId } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `qrclaw-setup exited ${code}`));
    });
  });
}

/**
 * POST /api/dev/ensure-daemon — Multica daemon-manager 等价物（服务端 spawn，非浏览器）。
 */
export async function POST(request: NextRequest) {
  if (!isDevRouteAllowed(request)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  let cookieResponse = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const gatewayBase =
    process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3100';

  const health = await probeDaemonHealth();
  if (health?.status === 'running') {
    const agents = health.agents;
    const agentCount = Array.isArray(agents) ? agents.length : 0;

    if (session?.access_token) {
      const gw = await gatewayOnlineForSession(gatewayBase, session.access_token);
      if (gw && (gw.online > 0 || gw.connected)) {
        return jsonWithCookies(
          { ok: true, already: true, health, online_runtime_count: gw.online },
          cookieResponse,
        );
      }
    } else if (agentCount > 0) {
      return jsonWithCookies({ ok: true, already: true, health }, cookieResponse);
    }
  }

  // Desktop: host is started by ServiceOrchestrator — poll only, never run qrclaw-setup.sh.
  if (isDesktopBootstrap()) {
    const maxPolls = 30;
    for (let i = 0; i < maxPolls; i += 1) {
      const polled = await probeDaemonHealth();
      if (session?.access_token) {
        const gw = await gatewayOnlineForSession(gatewayBase, session.access_token);
        if (gw && (gw.online > 0 || gw.connected)) {
          return jsonWithCookies(
            {
              ok: true,
              already: i > 0,
              health: polled,
              online_runtime_count: gw.online,
            },
            cookieResponse,
          );
        }
      } else if (polled?.status === 'running') {
        const agentCount = Array.isArray(polled.agents) ? polled.agents.length : 0;
        if (agentCount > 0) {
          return jsonWithCookies({ ok: true, already: i > 0, health: polled }, cookieResponse);
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return jsonWithCookies(
      {
        ok: false,
        error: 'host_not_ready',
        message: '本机助手尚未连接，请稍后重试。',
      },
      cookieResponse,
      503,
    );
  }

  try {
    await runSetup(session?.user?.id ?? '');
  } catch (err) {
    return jsonWithCookies(
      { ok: false, error: 'setup_failed', message: String(err) },
      cookieResponse,
      500,
    );
  }

  const after = await probeDaemonHealth();
  return jsonWithCookies({ ok: true, started: true, health: after }, cookieResponse);
}

export async function GET(request: NextRequest) {
  if (!isDevRouteAllowed(request)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }
  const health = await probeDaemonHealth();
  return NextResponse.json({ ok: true, health });
}

function jsonWithCookies(
  body: Record<string, unknown>,
  cookieSource: NextResponse,
  status = 200,
): NextResponse {
  const res = NextResponse.json(body, { status });
  cookieSource.cookies.getAll().forEach(({ name, value }) => {
    res.cookies.set(name, value);
  });
  return res;
}
