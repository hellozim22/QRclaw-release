/**
 * Wave 10 真 CLI E2E Harness
 *
 * 铁律:
 *   - 禁 fake binary (与 Wave 9 happy-path 相反)
 *   - 真 `claude` / `openclaw` / `cursor-agent` / `codex` 进程
 *   - 语义断言 (reply 包含 nonce), 不只是 "element visible"
 *   - C1 (gateway 不解读), C2 (DB 密文 + 日志无明文), C5 (reload replay)
 *
 * 详见: docs/wave10/r2-c7-review-补充.md §3
 *
 * 实现时机: Sprint 1 CU-3 (helper 可编译), Sprint 2 逐步接真逻辑
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { startGoHost, type GoHostHandle } from './go-host';
import { generateHostToken } from './host-token';
import { getOwnerJWT, loginAsOwner } from './owner-auth';

// ---------- 类型 ----------

export type RuntimeType = 'claude' | 'openclaw' | 'cursor' | 'codex';

type RuntimeEnvKey = `QRCLAW_PROVIDER_${string}_PATH`;

interface Wave10Env {
  apiBase: string;
  wsBase: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

interface OwnerFixture {
  email: string;
  password: string;
  jwt: string;
  ownerId: string;
  userId?: string;
  cleanup(): Promise<void>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const ALL_PROVIDERS: RuntimeType[] = ['openclaw', 'claude', 'cursor', 'codex'];
const RUNTIME_BINARY: Record<RuntimeType, string> = {
  claude: 'claude',
  openclaw: 'openclaw',
  cursor: 'cursor-agent',
  codex: 'codex',
};
const RUNTIME_ENV: Record<RuntimeType, RuntimeEnvKey> = {
  claude: 'QRCLAW_PROVIDER_CLAUDE_CODE_PATH',
  openclaw: 'QRCLAW_PROVIDER_OPENCLAW_PATH',
  cursor: 'QRCLAW_PROVIDER_CURSOR_AGENT_PATH',
  codex: 'QRCLAW_PROVIDER_CODEX_PATH',
};

export interface PreflightResult {
  ok: boolean;
  binaryPath?: string;
  version?: string;
  reason?: string;
}

export interface RuntimeHandle {
  type: RuntimeType;
  binaryPath: string;
  version: string;
  pid?: number;
  kill(signal?: NodeJS.Signals): Promise<void>;
  restart(): Promise<void>;
  waitOnline(timeoutMs: number): Promise<void>;
  waitOffline(timeoutMs: number): Promise<void>;
}

export interface OwnerAgentMessageRow {
  id: string;
  session_id: string;
  sender_type: 'owner' | 'agent';
  content: string | null;
  content_encrypted: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbQuery {
  latestOwnerAgentMessage(sessionId: string): Promise<OwnerAgentMessageRow>;
  messagesForSession(sessionId: string): Promise<OwnerAgentMessageRow[]>;
  assertEncryptedAtRest(opts: { sessionId: string; forbiddenPlaintext: string }): Promise<void>;
}

export interface GatewayLogHandle {
  path: string;
  snapshot(): Promise<string>;
  assertNotContains(values: string[], label: string): Promise<void>;
  stop(): Promise<void>;
}

export interface Wave10Harness {
  page: Page;
  owner: { jwt: string; ownerId: string };
  runtime: RuntimeHandle;
  agentId: string;
  sessionId: string;
  log: GatewayLogHandle;
  db: DbQuery;

  openChat(): Promise<void>;
  createSession(opts?: { agentId?: string; title?: string }): Promise<string>;
  sendMessage(text: string): Promise<void>;
  waitForReply(opts: { timeoutMs: number; expected?: RegExp }): Promise<string>;
  assertNoPlaintextLeak(secret: string): Promise<void>;
  stop(): Promise<void>;
}

// ---------- Preflight ----------

/**
 * 检查真实 CLI 是否可用. CI 上 GitHub-hosted runner 会返回 ok:false,
 * self-hosted macOS lane 会返回 ok:true.
 */
export async function runtimePreflight(type: RuntimeType): Promise<PreflightResult> {
  loadLocalEnvFiles();
  const envKey = RUNTIME_ENV[type];
  const binaryPath = process.env[envKey] ?? findOnPath(RUNTIME_BINARY[type]);
  if (!binaryPath) {
    return { ok: false, reason: `${type} binary not found on PATH or $${envKey}` };
  }
  if (!isExecutable(binaryPath)) {
    return { ok: false, reason: `${binaryPath} does not exist or is not executable` };
  }
  const version = readCliVersion(binaryPath);
  if (!version.ok) {
    return { ok: false, reason: version.reason };
  }
  return { ok: true, binaryPath, version: version.version };
}

function findOnPath(name: string): string | undefined {
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function readCliVersion(
  binaryPath: string
): { ok: true; version: string } | { ok: false; reason: string } {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.error) {
    return { ok: false, reason: `${binaryPath} --version failed: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    return {
      ok: false,
      reason: `${binaryPath} --version exited ${result.status}${stderr ? `: ${stderr}` : ''}`,
    };
  }
  return { ok: true, version: parseVersion(result.stdout || result.stderr) };
}

function parseVersion(output: string): string {
  const trimmed = output.trim();
  const match = trimmed.match(/\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9.-]+)?/);
  return match?.[0] ?? trimmed.split('\n')[0] ?? 'unknown';
}

// ---------- Runtime control (真 CLI 进程) ----------

export async function startRuntimeControl(opts: {
  runtime: RuntimeType;
  owner: { jwt: string; ownerId: string };
}): Promise<RuntimeHandle> {
  const pre = await runtimePreflight(opts.runtime);
  if (!pre.ok || !pre.binaryPath) {
    throw new Error(`[wave10-harness] runtime ${opts.runtime} unavailable: ${pre.reason}`);
  }

  // TODO(sprint-1-cu3): 实际 spawn 真 CLI via qrclaw-agent-host provider API.
  // 本 stub 只保证编译通过. Sprint 1 CU-3 替换为真 spawn.
  let child: ChildProcess | undefined;

  return {
    type: opts.runtime,
    binaryPath: pre.binaryPath,
    version: pre.version ?? 'unknown',
    pid: child?.pid,
    async kill(signal = 'SIGTERM') {
      child?.kill(signal);
    },
    async restart() {
      throw new Error('TODO(sprint-1-cu3): restart via host provider API');
    },
    async waitOnline(timeoutMs: number) {
      void timeoutMs;
      throw new Error('TODO(sprint-1-cu3): poll /api/runtimes/:type/health');
    },
    async waitOffline(timeoutMs: number) {
      void timeoutMs;
      throw new Error('TODO(sprint-1-cu3): poll /api/runtimes/:type/health (expect offline)');
    },
  };
}

// ---------- DB query (Supabase service role) ----------

export function createDbQuery(opts: { ownerJwt?: string; serviceRole?: string }): DbQuery {
  const url = process.env.SUPABASE_URL ?? '';
  const key = opts.serviceRole ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? opts.ownerJwt ?? '';
  const client: SupabaseClient | null =
    url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  async function requireClient(): Promise<SupabaseClient> {
    if (!client) throw new Error('[wave10-harness] SUPABASE_URL + key not configured');
    return client;
  }

  return {
    async latestOwnerAgentMessage(sessionId) {
      const c = await requireClient();
      const { data, error } = await c
        .from('owner_agent_messages')
        .select('*')
        .eq('conversation_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`no owner_agent_messages row for session=${sessionId}`);
      return { content: null, ...(data as Record<string, unknown>) } as OwnerAgentMessageRow;
    },
    async messagesForSession(sessionId) {
      const c = await requireClient();
      const { data, error } = await c
        .from('owner_agent_messages')
        .select('*')
        .eq('conversation_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        content: null,
        ...(row as Record<string, unknown>),
      })) as OwnerAgentMessageRow[];
    },
    async assertEncryptedAtRest({ sessionId, forbiddenPlaintext }) {
      const rows = await this.messagesForSession(sessionId);
      for (const row of rows) {
        if (row.content && row.content.includes(forbiddenPlaintext)) {
          throw new Error(
            `C2 violation: plaintext '${forbiddenPlaintext}' found in owner_agent_messages.content (id=${row.id})`
          );
        }
        if (!row.content_encrypted) {
          throw new Error(`C2 violation: content_encrypted is null for row id=${row.id}`);
        }
        if (JSON.stringify(row.metadata ?? {}).includes(forbiddenPlaintext)) {
          throw new Error(`C2 violation: plaintext leaked into metadata (id=${row.id})`);
        }
      }
    },
  };
}

// ---------- Gateway log (plaintext 扫描) ----------

/**
 * 读本次 run 的 gateway log. 不硬编码 /tmp — CI 和本地各自传 path.
 * 默认位置可用 `WAVE10_GATEWAY_LOG` env var 覆盖.
 */
export function readGatewayLog(opts?: { path?: string }): string {
  const p = opts?.path ?? process.env.WAVE10_GATEWAY_LOG ?? '/tmp/qrclaw-logs/gateway.log';
  if (!existsSync(p)) {
    throw new Error(`[wave10-harness] gateway log not found at ${p}; set WAVE10_GATEWAY_LOG`);
  }
  return readFileSync(p, 'utf8');
}

export async function startGatewayLogCapture(opts: {
  workerIndex: number;
  path?: string;
}): Promise<GatewayLogHandle> {
  const path =
    opts.path ??
    process.env.WAVE10_GATEWAY_LOG ??
    `/tmp/qrclaw-logs/gateway-${opts.workerIndex}.log`;
  return {
    path,
    async snapshot() {
      return existsSync(path) ? readFileSync(path, 'utf8') : '';
    },
    async assertNotContains(values, label) {
      const snap = existsSync(path) ? readFileSync(path, 'utf8') : '';
      for (const v of values) {
        if (!v) continue;
        if (snap.includes(v)) {
          throw new Error(`C2 violation [${label}]: '${v}' leaked into ${path}`);
        }
      }
    },
    async stop() {
      // Stub: actual impl will close tail stream in Sprint 1 CU-3.
    },
  };
}

// ---------- Top-level harness factory ----------

function loadLocalEnvFiles(): void {
  for (const file of [
    path.join(repoRoot, 'gateway', '.env'),
    path.join(repoRoot, 'web', '.env.local'),
    path.join(homedir(), '.config', 'qrclaw', 'secrets.env'),
  ]) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (!process.env[parsed.key]) process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  const key = match[1];
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function requireWave10Env(): Wave10Env {
  loadLocalEnvFiles();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error(
      '[wave10-harness] missing Supabase env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  return {
    apiBase:
      process.env.E2E_API_BASE ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001',
    wsBase:
      process.env.E2E_WS_BASE ?? process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? 'ws://localhost:3001/ws',
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

function createAdminClient(env: Wave10Env): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

async function createOwnerFixture(
  page: Page,
  request: APIRequestContext,
  env: Wave10Env
): Promise<OwnerFixture> {
  const configuredEmail = process.env.E2E_OWNER_EMAIL;
  const configuredPassword = process.env.E2E_OWNER_PASSWORD;
  if (configuredEmail && configuredPassword) {
    await loginAsOwner(page, { email: configuredEmail, password: configuredPassword });
    const jwt = await getOwnerJWT(page);
    if (!jwt) throw new Error('[wave10-harness] owner JWT missing after configured login');
    const ownerId = await resolveOwnerId(request, env, jwt);
    return {
      email: configuredEmail,
      password: configuredPassword,
      jwt,
      ownerId,
      async cleanup() {},
    };
  }

  const admin = createAdminClient(env);
  const password = `Wave10-${randomUUID()}-Aa1!`;
  const email = `wave10-e2e-${randomUUID()}@qrclaw.test`;
  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError || !createdUser.user) {
    throw new Error(`create temp owner user failed: ${createUserError?.message ?? 'missing user'}`);
  }

  const { data: ownerRow, error: ownerError } = await admin
    .from('owners')
    .insert({
      user_id: createdUser.user.id,
      email,
      display_name: 'Wave 10 E2E Owner',
      plan: 'free',
    })
    .select('id')
    .single();
  if (ownerError || !ownerRow) {
    await admin.auth.admin.deleteUser(createdUser.user.id);
    throw new Error(`create temp owner row failed: ${ownerError?.message ?? 'missing row'}`);
  }

  await loginAsOwner(page, { email, password });
  const jwt = await getOwnerJWT(page);
  if (!jwt) throw new Error('[wave10-harness] owner JWT missing after temp login');

  return {
    email,
    password,
    jwt,
    ownerId: (ownerRow as { id: string }).id,
    userId: createdUser.user.id,
    async cleanup() {
      await admin
        .from('owners')
        .delete()
        .eq('id', (ownerRow as { id: string }).id);
      await admin.auth.admin.deleteUser(createdUser.user.id);
    },
  };
}

async function resolveOwnerId(
  request: APIRequestContext,
  env: Wave10Env,
  ownerJwt: string
): Promise<string> {
  const res = await request.get(`${env.supabaseUrl}/rest/v1/owners?select=id&limit=1`, {
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${ownerJwt}`,
    },
  });
  if (!res.ok()) {
    throw new Error(`resolve owner id failed: ${res.status()} ${(await res.text()).slice(0, 200)}`);
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  if (!rows[0]?.id) throw new Error('[wave10-harness] owner row not found');
  return rows[0].id;
}

async function insertHostPlaceholder(
  admin: SupabaseClient,
  ownerId: string,
  hostId: string,
  displayName: string
): Promise<void> {
  const { error } = await admin.from('agent_hosts').insert({
    id: hostId,
    owner_id: ownerId,
    host_type: 'local',
    display_name: displayName,
    status: 'offline',
  });
  if (error) throw new Error(`insert host placeholder failed: ${error.message}`);
}

async function createBoundAgent(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    hostId: string;
    provider: RuntimeType;
    name: string;
  }
): Promise<string> {
  const { data: agent, error: agentError } = await admin
    .from('agents')
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      api_key_hash: `wave10-${randomUUID()}`,
      status: 'active',
      visibility_scope: 'self',
      description: `Wave 10 true ${input.provider} E2E agent`,
      instructions: null,
      suggested_prompts: [],
      execution_mode: 'standard',
    })
    .select('id')
    .single();
  if (agentError || !agent) {
    throw new Error(`create bound agent failed: ${agentError?.message ?? 'missing agent'}`);
  }

  const agentId = (agent as { id: string }).id;
  const { error: bindingError } = await admin.from('agent_bindings').insert({
    agent_id: agentId,
    owner_id: input.ownerId,
    binding_kind: 'local_host',
    host_id: input.hostId,
    preferred_host_id: input.hostId,
    provider: input.provider,
    execution_mode: 'standard',
    status: 'active',
  });
  if (bindingError) throw new Error(`create bound agent binding failed: ${bindingError.message}`);
  return agentId;
}

function providerEnv(runtime: RuntimeType, binaryPath: string): NodeJS.ProcessEnv {
  const missing = path.join(repoRoot, 'tests', 'test-results', 'missing-provider');
  return {
    [RUNTIME_ENV.openclaw]: runtime === 'openclaw' ? binaryPath : `${missing}-openclaw`,
    [RUNTIME_ENV.claude]: runtime === 'claude' ? binaryPath : `${missing}-claude`,
    [RUNTIME_ENV.cursor]: runtime === 'cursor' ? binaryPath : `${missing}-cursor`,
    [RUNTIME_ENV.codex]: runtime === 'codex' ? binaryPath : `${missing}-codex`,
  };
}

export async function createRealClaudeHarness(
  browser: Browser,
  opts: {
    runtime?: RuntimeType;
    requireRealCli?: boolean;
    workerIndex?: number;
  } = {}
): Promise<Wave10Harness> {
  const runtimeType = opts.runtime ?? 'claude';
  const workerIndex = opts.workerIndex ?? 0;
  const env = requireWave10Env();

  const pre = await runtimePreflight(runtimeType);
  if (!pre.ok && opts.requireRealCli) {
    throw new Error(`[wave10-harness] requireRealCli but ${runtimeType}: ${pre.reason}`);
  }
  if (!pre.ok || !pre.binaryPath) {
    throw new Error(`[wave10-harness] runtime ${runtimeType} unavailable: ${pre.reason}`);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const request = context.request;
  const admin = createAdminClient(env);
  const ownerFixture = await createOwnerFixture(page, request, env);
  const owner = { jwt: ownerFixture.jwt, ownerId: ownerFixture.ownerId };
  const hostId = randomUUID();
  const agentName = `wave10-${runtimeType}-${randomUUID().slice(0, 8)}`;
  await insertHostPlaceholder(admin, owner.ownerId, hostId, agentName);
  const hostToken = await generateHostToken(request, owner.jwt, {
    ownerId: owner.ownerId,
    label: `wave10-${runtimeType}`,
    hostId,
    allowedProviders: ALL_PROVIDERS,
    apiBase: env.apiBase,
  });
  const host = await startGoHost({
    token: hostToken,
    apiBase: env.apiBase,
    wsBase: env.wsBase,
    name: agentName,
    hostId,
    displayName: agentName,
    repoRoot,
    env: providerEnv(runtimeType, pre.binaryPath),
  });
  await host.waitForRegister(30_000);
  const agentId = await createBoundAgent(admin, {
    ownerId: owner.ownerId,
    hostId,
    provider: runtimeType,
    name: agentName,
  });
  const runtime: RuntimeHandle = runtimeFromHost(runtimeType, pre, host);
  const log = await startGatewayLogCapture({ workerIndex });
  const db = createDbQuery({ serviceRole: env.supabaseServiceRoleKey });
  let lastChatResponse: Promise<void> | null = null;

  const harness: Wave10Harness = {
    page,
    owner,
    runtime,
    agentId,
    sessionId: '',
    log,
    db,

    async openChat() {
      await page.goto('/chat');
      await page.waitForFunction(() => {
        const w = window as unknown as {
          __OWNER_AGENT_STORE__?: { getState?: () => unknown };
        };
        return Boolean(w.__OWNER_AGENT_STORE__?.getState);
      });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const ready = await page.evaluate(async (id) => {
          const w = window as unknown as {
            __OWNER_AGENT_STORE__: {
              getState: () => {
                agents: Array<{ id: string }>;
                loadAgents: () => Promise<void>;
                selectAgent: (agentId: string) => void;
                setStatus: (agentId: string, status: 'online') => void;
              };
            };
          };
          const store = w.__OWNER_AGENT_STORE__.getState();
          if (!store.agents.some((agent) => agent.id === id)) {
            await store.loadAgents();
          }
          store.selectAgent(id);
          store.setStatus(id, 'online');
          return store.agents.some((agent) => agent.id === id);
        }, agentId);
        if (ready) {
          return;
        }
        await page.waitForTimeout(500);
      }
      const state = await page.evaluate((id) => {
        const w = window as unknown as {
          __OWNER_AGENT_STORE__: {
            getState: () => {
              agents: Array<{ id: string; name?: string; backend_provider?: string }>;
              selectedAgentId: string | null;
              statusByAgent: Record<string, string>;
              error: string | null;
            };
          };
        };
        const store = w.__OWNER_AGENT_STORE__.getState();
        return {
          expectedAgentId: id,
          agentIds: store.agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            provider: agent.backend_provider,
          })),
          selectedAgentId: store.selectedAgentId,
          statusByAgent: store.statusByAgent,
          error: store.error,
        };
      }, agentId);
      throw new Error(`[wave10-harness] agent not loaded in chat store: ${JSON.stringify(state)}`);
    },
    async createSession({ title = '新会话' } = {}) {
      void title;
      await this.openChat();
      return this.sessionId;
    },
    async sendMessage(text: string) {
      await this.openChat();
      lastChatResponse = page
        .waitForResponse(
          (response) =>
            response.url().includes(`/api/owner/agents/${agentId}/chat`) &&
            response.request().method() === 'POST',
          { timeout: 120_000 }
        )
        .then(async (response) => {
          const headers = response.headers();
          harness.sessionId = headers['x-qrclaw-conversation-id'] ?? harness.sessionId;
          if (!response.ok()) {
            throw new Error(
              `chat SSE failed: ${response.status()} ${(await response.text()).slice(0, 200)}`
            );
          }
        });
      await page.evaluate(
        async ({ id, content }) => {
          const w = window as unknown as {
            __OWNER_AGENT_STORE__: {
              getState: () => {
                sendMessage: (agentId: string, message: string) => Promise<void>;
              };
            };
          };
          await w.__OWNER_AGENT_STORE__.getState().sendMessage(id, content);
        },
        { id: agentId, content: text }
      );
    },
    async waitForReply({ timeoutMs, expected }) {
      // Owner chat uses @assistant-ui/react <Thread>. Assistant messages render
      // with `.aui-assistant-message-content`. Wave 10 Sprint 1's
      // `[data-testid=chat-bubble][data-role=agent]` lives in the visitor flow,
      // not the owner dashboard — selecting it causes a 60s timeout even when
      // the real Claude reply already landed. Prefer the assistant-ui content
      // node and fall back to the legacy selector for visitor-flow specs.
      const reply = page
        .locator(
          '.aui-assistant-message-content, [data-testid="chat-bubble"][data-role="agent"] [data-testid="chat-bubble-body"]'
        )
        .last();
      // Phase 1: wait until assistant bubble has any text (first delta arrived).
      await expect
        .poll(async () => (await reply.textContent())?.trim() ?? '', {
          timeout: timeoutMs,
          intervals: [250, 500, 1_000],
        })
        .not.toBe('');
      // Phase 2: wait until streaming stabilizes (3 consecutive identical reads
      // spaced ~1s apart = stream finished). Prevents the classic "assert on
      // partial delta" race where we read "4" before the trailing "2" arrives.
      const stabilizeStart = Date.now();
      let last = '';
      let stable = 0;
      while (Date.now() - stabilizeStart < timeoutMs) {
        await page.waitForTimeout(800);
        const now = (await reply.textContent())?.trim() ?? '';
        if (now === last && now.length > 0) {
          stable += 1;
          if (stable >= 3) break;
        } else {
          stable = 0;
          last = now;
        }
      }
      if (expected) {
        await expect(reply).toContainText(expected, { timeout: timeoutMs });
      }
      if (lastChatResponse) await lastChatResponse;
      return (await reply.textContent())?.trim() ?? '';
    },
    async assertNoPlaintextLeak(secret: string) {
      await log.assertNotContains([secret], 'gateway.log');
      if (!this.sessionId) throw new Error('[wave10-harness] session id missing after send');
      await db.assertEncryptedAtRest({ sessionId: this.sessionId, forbiddenPlaintext: secret });
    },
    async stop() {
      await Promise.allSettled([
        runtime.kill(),
        log.stop(),
        context.close(),
        ownerFixture.cleanup(),
      ]);
    },
  };
  return harness;
}

function runtimeFromHost(
  type: RuntimeType,
  pre: PreflightResult & { ok: true; binaryPath: string },
  host: GoHostHandle
): RuntimeHandle {
  return {
    type,
    binaryPath: pre.binaryPath,
    version: pre.version ?? 'unknown',
    pid: host.proc.pid,
    async kill(signal = 'SIGTERM') {
      host.proc.kill(signal);
      await host.stop();
    },
    async restart() {
      throw new Error('[wave10-harness] restart is not implemented for true CLI E2E');
    },
    async waitOnline(timeoutMs: number) {
      await host.waitForRegister(timeoutMs);
    },
    async waitOffline(timeoutMs: number) {
      void timeoutMs;
      throw new Error('[wave10-harness] waitOffline is not implemented for true CLI E2E');
    },
  };
}

// ---------- Message query helper (直连 DB, 绕开 UI) ----------

export async function queryMessage(sessionId: string): Promise<OwnerAgentMessageRow> {
  return createDbQuery({}).latestOwnerAgentMessage(sessionId);
}
