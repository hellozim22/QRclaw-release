import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { mkdirSync, createWriteStream, existsSync, type WriteStream } from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

export interface GoHostHandle {
  proc: ChildProcess;
  logPath: string;
  /** Wait until the host logs that it registered with the gateway. */
  waitForRegister(timeoutMs?: number): Promise<void>;
  /** Graceful SIGTERM, escalates to SIGKILL after `graceMs`. */
  stop(graceMs?: number): Promise<void>;
}

export interface StartGoHostOptions {
  /** Owner JWT used for gateway auth (passed via `login` subcommand stdin). */
  token: string;
  /** Web/API base, e.g. http://localhost:3000 — kept for future HTTP polling. */
  apiBase: string;
  /** WebSocket base, e.g. ws://localhost:3000 — combined with `/ws`. */
  wsBase: string;
  /** Agent identity; also used as the `--name` and `--host-id` if not given. */
  name?: string;
  hostId?: string;
  displayName?: string;
  /** Path to the built Go binary. Defaults to qrclaw-agent-host/qrclaw-agent-host. */
  binaryPath?: string;
  /** Log dir, defaults to tests/test-results/. */
  logDir?: string;
  /** Repo root — used to resolve default binary + log paths. */
  repoRoot?: string;
  /** Extra env to merge. Token-bearing vars are stripped from logs. */
  env?: NodeJS.ProcessEnv;
}

const REGISTERED_RE = /registered host\s+\S+/i;

/**
 * Spawn the Go agent host for E2E. Responsibilities:
 *   1. `qrclaw-agent-host login --name <name> --token -` (token piped on stdin)
 *   2. `qrclaw-agent-host run --name <name> --host-id <id> --display-name <dn>`
 *      with `QRCLAW_WS_URL` pointing at the local gateway.
 *   3. Stream stdout/stderr into test-results/go-host.log, sanitizing the
 *      token so it never lands on disk.
 *
 * The Go host (see cmd/qrclaw-agent-host/main.go + run.go) honours
 * `QRCLAW_WS_URL` (full ws URL) and `QRCLAW_HOST_ID`. It does NOT read
 * `QRCLAW_API_BASE`; `apiBase` is accepted for the future /api/hosts poll.
 */
export async function startGoHost(opts: StartGoHostOptions): Promise<GoHostHandle> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const binaryPath =
    opts.binaryPath ?? path.join(repoRoot, 'qrclaw-agent-host', 'qrclaw-agent-host');
  if (!existsSync(binaryPath)) {
    throw new Error(
      `go-host binary not found at ${binaryPath}; build it first (make -C qrclaw-agent-host build)`,
    );
  }

  const logDir = opts.logDir ?? path.join(repoRoot, 'tests', 'test-results');
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'go-host.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const name = opts.name ?? `e2e-${Date.now()}`;
  const hostId = opts.hostId ?? name;
  const displayName = opts.displayName ?? name;
  const wsURL = joinWs(opts.wsBase, '/ws');

  // --- Step 1: login (pipe token via stdin so it never appears in argv) ---
  // Omit --token so the CLI reads from stdin; passing '-' would be stored as
  // the literal string "-" (cmd/qrclaw-agent-host/main.go#cmdLogin).
  const login = spawnSync(binaryPath, ['login', '--name', name], {
    input: opts.token,
    encoding: 'utf8',
    env: sanitizedEnv(opts.env),
  });
  writeSanitized(logStream, `$ ${path.basename(binaryPath)} login --name ${name}\n`, opts.token);
  if (login.stdout) writeSanitized(logStream, login.stdout, opts.token);
  if (login.stderr) writeSanitized(logStream, login.stderr, opts.token);
  if (login.status !== 0) {
    throw new Error(`qrclaw-agent-host login exited ${login.status}`);
  }

  // --- Step 2: run ---
  const runEnv: NodeJS.ProcessEnv = {
    ...sanitizedEnv(opts.env),
    QRCLAW_WS_URL: wsURL,
    QRCLAW_HOST_ID: hostId,
    // Not consumed by the binary today but kept for forward-compat + debugging:
    QRCLAW_API_BASE: opts.apiBase,
    QRCLAW_WS_BASE: opts.wsBase,
  };
  writeSanitized(
    logStream,
    `$ ${path.basename(binaryPath)} run --name ${name} --host-id ${hostId} --display-name ${displayName} (QRCLAW_WS_URL=${wsURL})\n`,
    opts.token,
  );
  const proc = spawn(
    binaryPath,
    ['run', '--name', name, '--host-id', hostId, '--display-name', displayName],
    {
      env: runEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let buffered = '';
  const onChunk = (chunk: Buffer | string) => {
    const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    buffered += s;
    writeSanitized(logStream, s, opts.token);
  };
  proc.stdout?.on('data', onChunk);
  proc.stderr?.on('data', onChunk);

  const handle: GoHostHandle = {
    proc,
    logPath,
    async waitForRegister(timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (proc.exitCode !== null) {
          throw new Error(
            `go-host exited with code ${proc.exitCode} before registering (see ${logPath})`,
          );
        }
        if (REGISTERED_RE.test(buffered)) return;
        await delay(100);
      }
      throw new Error(
        `timed out waiting for "registered host …" in go-host log after ${timeoutMs}ms (see ${logPath})`,
      );
    },
    async stop(graceMs = 5_000) {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      const start = Date.now();
      while (proc.exitCode === null && Date.now() - start < graceMs) {
        await delay(50);
      }
      if (proc.exitCode === null) proc.kill('SIGKILL');
      logStream.end();
    },
  };

  return handle;
}

/** Replace every occurrence of the token with `***REDACTED***` before writing. */
function writeSanitized(stream: WriteStream, chunk: string, token: string): void {
  let out = chunk;
  if (token && token.length >= 4) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    const re = new RegExp(escapeRegex(token), 'g');
    out = out.replace(re, '***REDACTED***');
  }
  stream.write(out);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizedEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...(extra ?? {}) };
}

function joinWs(base: string, pathSeg: string): string {
  if (!base) return pathSeg;
  const trimmed = base.replace(/\/+$/, '');
  const suffix = pathSeg.startsWith('/') ? pathSeg : `/${pathSeg}`;
  return trimmed.endsWith(suffix) ? trimmed : trimmed + suffix;
}
