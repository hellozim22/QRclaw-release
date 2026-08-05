import { NextResponse, type NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { isDesktopBootstrap, isLocalHostRequest } from '@/lib/local-app-shell';
import { bundledRuntimeRoot } from '@/lib/bundled-runtime-root';

const HEALTH_URL = 'http://127.0.0.1:19515/health';
const LOG_DIR = '/tmp/bibisheng-agent-chat-logs';
const GATEWAY_PORT = '3100';
const GATEWAY_WS = `ws://127.0.0.1:${GATEWAY_PORT}/ws`;

function isRouteAllowed(request: NextRequest): boolean {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin') ?? '';
  const isLocalHost = isLocalHostRequest(host, origin);
  if (isDesktopBootstrap() && isLocalHost) return true;
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    process.env.LOCAL_DEV_BOOTSTRAP !== '1'
  ) {
    return false;
  }
  return isLocalHost;
}

async function probeHostHealth(): Promise<Record<string, unknown> | null> {
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
  accessToken: string
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

function shellPath(): string {
  return `/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${process.env.PATH ?? ''}`;
}

function loadHostTokenPepper(): string {
  const pepperPath = path.join(process.env.HOME ?? '', '.config/qrclaw/host-token-pepper.env');
  if (fs.existsSync(pepperPath)) {
    const match = fs.readFileSync(pepperPath, 'utf8').match(/^QRCLAW_HOST_TOKEN_PEPPER=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  return process.env.QRCLAW_HOST_TOKEN_PEPPER ?? '';
}

function runProcess(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    input?: string;
  } = {}
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PATH: shellPath(),
        ...(options.env ?? {}),
      },
      stdio: options.input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    if (options.input && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

async function resolveOwnerId(gatewayBase: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${gatewayBase}/api/owner/local-host/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { owner_id?: string } };
    return body.data?.owner_id ?? null;
  } catch {
    return null;
  }
}

async function mintHostTokenViaGateway(
  gatewayBase: string,
  accessToken: string,
  ownerId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${gatewayBase}/api/owner/host-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: `local-dev-${os.hostname()}`,
        scope: {
          owner_id: ownerId,
          can_register_local: true,
          can_receive_private_runs: true,
          allowed_provider_set: ['openclaw', 'claude', 'cursor', 'codex', 'pi'],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

async function attachViaGatewayMint(
  accessToken: string,
  userId: string
): Promise<{ ok: boolean; stderr: string }> {
  const root = bundledRuntimeRoot();
  const hostBin = path.join(root, 'qrclaw-agent-host');
  if (!fs.existsSync(hostBin)) {
    return { ok: false, stderr: 'host binary missing' };
  }

  const gatewayBase =
    process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3100';
  const ownerId = (await resolveOwnerId(gatewayBase, accessToken)) ?? userId;
  const token = await mintHostTokenViaGateway(gatewayBase, accessToken, ownerId);
  if (!token) {
    return { ok: false, stderr: 'gateway host-token mint failed' };
  }

  const hostId = process.env.QRCLAW_HOST_ID ?? '';

  await runProcess(hostBin, ['daemon', 'stop'], {
    env: {
      QRCLAW_WS_URL: GATEWAY_WS,
      ...(hostId ? { QRCLAW_HOST_ID: hostId } : {}),
    },
  });

  const login = await runProcess(hostBin, ['login', '--name', 'default'], {
    input: `${token}\n`,
    env: {
      QRCLAW_WS_URL: GATEWAY_WS,
      ...(hostId ? { QRCLAW_HOST_ID: hostId } : {}),
    },
  });
  if (login.code !== 0) {
    return { ok: false, stderr: login.stderr || 'host login failed' };
  }

  const start = await runProcess(hostBin, ['daemon', 'start'], {
    env: {
      QRCLAW_WS_URL: GATEWAY_WS,
      ...(hostId ? { QRCLAW_HOST_ID: hostId } : {}),
      QRCLAW_GATEWAY_PORT: GATEWAY_PORT,
    },
  });
  return { ok: start.code === 0, stderr: start.stderr };
}

function runMintHost(userId: string): Promise<{ code: number; stderr: string }> {
  const root = bundledRuntimeRoot();
  const mintScript = path.join(root, 'scripts/mint-host-token-and-run.sh');
  const hostBin = path.join(root, 'qrclaw-agent-host');
  const secretsPath = path.join(process.env.HOME ?? '', '.config/qrclaw/secrets.env');
  const pepper = loadHostTokenPepper();

  return runProcess('bash', [mintScript, userId], {
    cwd: root,
    env: {
      QRCLAW_HOST_BIN: hostBin,
      QRCLAW_GATEWAY_PORT: GATEWAY_PORT,
      QRCLAW_WS_URL: GATEWAY_WS,
      QRCLAW_LOG_DIR: LOG_DIR,
      QRCLAW_SECRETS: secretsPath,
      QRCLAW_USER_ID: userId,
      ...(pepper ? { QRCLAW_HOST_TOKEN_PEPPER: pepper } : {}),
    },
  });
}

function runDevSetup(userId: string): Promise<{ code: number; stderr: string }> {
  const repoRoot = path.resolve(process.cwd(), '../..');
  const setupScript = path.join(repoRoot, 'scripts/qrclaw-setup.sh');
  return runProcess('bash', [setupScript], {
    cwd: repoRoot,
    env: userId ? { QRCLAW_ATTACH_USER_ID: userId } : {},
  });
}

async function waitForHealthyHost(
  accessToken?: string
): Promise<{ health: Record<string, unknown>; gatewayOnline: number } | null> {
  const gatewayBase =
    process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3100';

  for (let i = 0; i < 30; i += 1) {
    const health = await probeHostHealth();
    if (health?.status === 'running') {
      if (accessToken) {
        const gw = await gatewayOnlineForSession(gatewayBase, accessToken);
        if (gw && (gw.online > 0 || gw.connected)) {
          return { health, gatewayOnline: gw.online };
        }
      } else {
        const agents = health.agents;
        const count = Array.isArray(agents) ? agents.length : 0;
        if (count > 0) {
          return { health, gatewayOnline: 0 };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * POST /api/dev/reattach-host — (re)launch bundled host when daemon is down or gateway lost WS.
 */
export async function POST(request: NextRequest) {
  if (!isRouteAllowed(request)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const cookieResponse = NextResponse.next();
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
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? '';
  const gatewayBase =
    process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3100';

  const existing = await probeHostHealth();
  if (existing?.status === 'running' && session?.access_token) {
    const gw = await gatewayOnlineForSession(gatewayBase, session.access_token);
    if (gw && (gw.online > 0 || gw.connected)) {
      const agents = existing.agents;
      const count = Array.isArray(agents) ? agents.length : 0;
      return NextResponse.json({ ok: true, already: true, health: existing, agentCount: count });
    }
  }

  let result: { code: number; stderr: string } = { code: 1, stderr: '' };

  if (session?.access_token && userId) {
    const attached = await attachViaGatewayMint(session.access_token, userId);
    result = { code: attached.ok ? 0 : 1, stderr: attached.stderr };
  } else {
    const root = bundledRuntimeRoot();
    const mintScript = path.join(root, 'scripts/mint-host-token-and-run.sh');
    if (fs.existsSync(mintScript)) {
      result = await runMintHost(userId);
    } else if (process.env.LOCAL_DEV_BOOTSTRAP === '1') {
      result = await runDevSetup(userId);
    } else {
      return NextResponse.json(
        { ok: false, error: 'no_attach_script', message: '本机 attach 脚本不可用' },
        { status: 503 }
      );
    }
  }

  const health = await waitForHealthyHost(session?.access_token);
  if (health) {
    const agents = health.health.agents;
    const count = Array.isArray(agents) ? agents.length : 0;
    const res = NextResponse.json({
      ok: true,
      started: true,
      health: health.health,
      agentCount: count,
      online_runtime_count: health.gatewayOnline,
      exitCode: result.code,
    });
    cookieResponse.cookies.getAll().forEach(({ name, value }) => {
      res.cookies.set(name, value);
    });
    return res;
  }

  const res = NextResponse.json(
    {
      ok: false,
      error: 'host_start_timeout',
      message: '本机助手启动超时，请重试。',
      exitCode: result.code,
      stderr: result.stderr.slice(0, 400),
    },
    { status: 503 }
  );
  cookieResponse.cookies.getAll().forEach(({ name, value }) => {
    res.cookies.set(name, value);
  });
  return res;
}
