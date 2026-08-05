import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import { createOpenClawAgent, selectAgent } from './agent-ops';
import { startGoHost, type GoHostHandle } from './go-host';
import { generateHostToken } from './host-token';
import { getOwnerJWT, loginAsOwner } from './owner-auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const createLockDir = path.join(repoRoot, 'tests', 'test-results', 'owner-agent-create.lock');

export interface OwnerAgentE2EEnv {
  email: string;
  password: string;
  apiBase: string;
  wsBase: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface OwnerAgentHarness {
  ownerJWT: string;
  ownerId: string;
  agentId: string;
  agentName: string;
  host: GoHostHandle;
  replyText: string;
}

export interface OwnerAgentConversationRow {
  id: string;
  owner_id: string;
  agent_id: string;
  provider_session_id: string | null;
  provider_work_dir: string | null;
}

export const getOwnerAgentE2EEnv = (): { env: OwnerAgentE2EEnv | null; missing: string[] } => {
  const values = {
    email: process.env.E2E_OWNER_EMAIL,
    password: process.env.E2E_OWNER_PASSWORD,
    apiBase: process.env.E2E_API_BASE,
    wsBase: process.env.E2E_WS_BASE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) return { env: null, missing };
  return { env: values as OwnerAgentE2EEnv, missing: [] };
};

export const uniqueAgentName = (prefix: string): string =>
  `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

export const writeFakeOpenClaw = (opts: { replyText: string; delaySeconds?: number }): string => {
  const dir = path.join(repoRoot, 'tests', 'test-results', 'fake-openclaw');
  mkdirSync(dir, { recursive: true });
  const binaryPath = path.join(dir, `openclaw-${randomUUID()}`);
  const payload = JSON.stringify({ payloads: [{ text: opts.replyText }] });
  const quotedPayload = JSON.stringify(payload);
  const delay =
    opts.delaySeconds && opts.delaySeconds > 0 ? `sleep ${Math.ceil(opts.delaySeconds)}` : ':';

  writeFileSync(
    binaryPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      "  echo 'openclaw 1.2.3'",
      '  exit 0',
      'fi',
      delay,
      `printf '%s\\n' ${quotedPayload}`,
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  return binaryPath;
};

export async function createOwnerAgentHarness(
  page: Page,
  request: APIRequestContext,
  env: OwnerAgentE2EEnv,
  opts: {
    agentName: string;
    tokenLabel: string;
    replyText: string;
    fakeDelaySeconds?: number;
  }
): Promise<OwnerAgentHarness> {
  await loginAsOwner(page, { email: env.email, password: env.password });
  const ownerJWT = await getOwnerJWT(page);
  expect(ownerJWT, 'owner JWT should be available post-login').toBeTruthy();

  const ownerId = await resolveOwnerId(request, ownerJWT!, env);
  const hostId = randomUUID();
  await insertHostPlaceholder(request, env, ownerJWT!, ownerId, hostId, opts.agentName);
  const hostToken = await generateHostToken(request, ownerJWT!, {
    ownerId,
    label: opts.tokenLabel,
    hostId,
    allowedProviders: ['openclaw', 'claude', 'cursor', 'codex'],
    apiBase: env.apiBase,
  });
  expect(hostToken.length).toBeGreaterThan(10);

  return await withOwnerAgentCreateLock(async () => {
    let host: GoHostHandle | null = null;
    try {
      const fakeOpenClaw = writeFakeOpenClaw({
        replyText: opts.replyText,
        delaySeconds: opts.fakeDelaySeconds,
      });
      const missingProvider = path.join(path.dirname(fakeOpenClaw), 'missing-provider');
      host = await startGoHost({
        token: hostToken,
        apiBase: env.apiBase,
        wsBase: env.wsBase,
        name: opts.agentName,
        hostId,
        displayName: opts.agentName,
        repoRoot,
        env: {
          QRCLAW_PROVIDER_OPENCLAW_PATH: fakeOpenClaw,
          QRCLAW_PROVIDER_CLAUDE_CODE_PATH: `${missingProvider}-claude`,
          QRCLAW_PROVIDER_CURSOR_AGENT_PATH: `${missingProvider}-cursor`,
          QRCLAW_PROVIDER_CODEX_PATH: `${missingProvider}-codex`,
        },
      });
      await host.waitForRegister(30_000);

      const created = await createOpenClawAgent(page, { name: opts.agentName });
      expect(created.agentName).toBe(opts.agentName);

      const agent = await findAgentByName(request, env.apiBase, ownerJWT!, opts.agentName);
      expect(agent?.id, 'created agent should be listed by API').toBeTruthy();
      await selectAgent(page, opts.agentName);

      return {
        ownerJWT: ownerJWT!,
        ownerId,
        agentId: agent!.id,
        agentName: opts.agentName,
        host,
        replyText: opts.replyText,
      };
    } catch (error) {
      if (host) await host.stop();
      throw error;
    }
  });
}

export async function resolveOwnerId(
  request: APIRequestContext,
  ownerJWT: string,
  env: OwnerAgentE2EEnv
): Promise<string> {
  const ownerRes = await request.get(`${env.supabaseUrl}/rest/v1/owners?select=id&limit=1`, {
    headers: supabaseHeaders(ownerJWT, env),
  });
  expect(ownerRes.ok(), `owners REST returned ${ownerRes.status()}`).toBeTruthy();
  const ownerRows = (await ownerRes.json()) as Array<{ id: string }>;
  expect(ownerRows[0]?.id, 'owner row must exist for signed-in user').toBeTruthy();
  return ownerRows[0].id;
}

export async function findAgentByName(
  request: APIRequestContext,
  apiBase: string,
  ownerJWT: string,
  agentName: string
): Promise<{ id: string; name: string } | null> {
  const listRes = await request.get(`${apiBase}/api/owner/agents`, {
    headers: { Authorization: `Bearer ${ownerJWT}` },
  });
  expect(listRes.ok(), `owner agents API returned ${listRes.status()}`).toBeTruthy();
  const body = (await listRes.json()) as { data: Array<{ id: string; name: string }> };
  return body.data.find((agent) => agent.name === agentName) ?? null;
}

export async function getOwnerAgentConversation(
  request: APIRequestContext,
  env: OwnerAgentE2EEnv,
  ownerJWT: string,
  agentId: string
): Promise<OwnerAgentConversationRow> {
  const res = await request.get(
    `${env.supabaseUrl}/rest/v1/owner_agent_conversations?select=id,owner_id,agent_id,provider_session_id,provider_work_dir&agent_id=eq.${agentId}&status=eq.active&limit=1`,
    { headers: supabaseHeaders(ownerJWT, env) }
  );
  expect(res.ok(), `conversation REST returned ${res.status()}`).toBeTruthy();
  const rows = (await res.json()) as OwnerAgentConversationRow[];
  expect(rows[0]?.id, 'active owner-agent conversation should exist').toBeTruthy();
  return rows[0];
}

export async function updateConversationRuntime(
  request: APIRequestContext,
  env: OwnerAgentE2EEnv,
  ownerJWT: string,
  conversationId: string,
  patch: { provider_session_id: string | null; provider_work_dir: string | null }
): Promise<void> {
  const res = await request.patch(
    `${env.supabaseUrl}/rest/v1/owner_agent_conversations?id=eq.${conversationId}`,
    {
      headers: { ...supabaseHeaders(ownerJWT, env), Prefer: 'return=minimal' },
      data: patch,
    }
  );
  expect(res.ok(), `conversation PATCH returned ${res.status()}`).toBeTruthy();
}

async function insertHostPlaceholder(
  request: APIRequestContext,
  env: OwnerAgentE2EEnv,
  ownerJWT: string,
  ownerId: string,
  hostId: string,
  displayName: string
): Promise<void> {
  const res = await request.post(`${env.supabaseUrl}/rest/v1/agent_hosts`, {
    headers: { ...supabaseHeaders(ownerJWT, env), Prefer: 'return=minimal' },
    data: {
      id: hostId,
      owner_id: ownerId,
      host_type: 'local',
      display_name: displayName,
      status: 'offline',
    },
  });
  expect(res.ok(), `agent host placeholder returned ${res.status()}`).toBeTruthy();
}

function supabaseHeaders(ownerJWT: string, env: OwnerAgentE2EEnv): Record<string, string> {
  return {
    apikey: env.supabaseAnonKey,
    Authorization: `Bearer ${ownerJWT}`,
    'Content-Type': 'application/json',
  };
}

async function withOwnerAgentCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireOwnerAgentCreateLock();
  try {
    return await fn();
  } finally {
    rmSync(createLockDir, { recursive: true, force: true });
  }
}

async function acquireOwnerAgentCreateLock(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      mkdirSync(path.dirname(createLockDir), { recursive: true });
      mkdirSync(createLockDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      await delay(250);
    }
  }
  throw new Error('Timed out waiting for owner-agent E2E create lock');
}
