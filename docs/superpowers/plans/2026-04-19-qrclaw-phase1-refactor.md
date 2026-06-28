# QRClaw Phase 1 Refactor (Contracts SSOT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every Zod / type change MUST follow TDD: write failing test → run → implement → run → commit.

**Goal:** Establish a single-source-of-truth WebSocket contract between `gateway`, `web`, and `supabase/functions` by introducing `shared/contracts/` plus an idempotent sync script, eliminating the current schema drift between `gateway/src/ws/schemas.ts` (Zod) and `web/src/types/ws.ts` (TS interfaces).

**Architecture:** Source of truth lives in a repo-root `shared/contracts/` directory with two files per domain: `types.ts` (dependency-free TS interfaces, consumed by any runtime) and `protocol.ts` (Zod schemas for runtime validation, consumed by gateway and Supabase Edge when needed). Consumers import via tsconfig path aliases (`@shared/contracts/*`); Supabase Deno functions get a copy under `supabase/functions/_shared/contracts/ws/types.ts` via `scripts/sync-contracts.mjs`, with a CI `--check` mode failing PRs that desync.

**Tech Stack:** TypeScript 5.9, Node 20, Zod 4.3.6 (gateway-owned version), Vitest 4.1 (tests/ package), Next.js 16 App Router (web), Deno (supabase edge functions, types-only consumer).

---

## File Structure

| Path | Purpose | Owner task |
|---|---|---|
| `shared/contracts/README.md` | Explain SSOT rules, zod version policy, sync script contract | T1 |
| `shared/contracts/ws/types.ts` | Dependency-free TS interfaces for all WS frames (both directions) | T1 (skeleton), T2 (union schema) |
| `shared/contracts/ws/protocol.ts` | Zod schemas + `validateFrame` helper (node/deno runtime validation) | T2 |
| `shared/contracts/ws/index.ts` | Barrel re-exporting types + protocol | T1 |
| `scripts/sync-contracts.mjs` | Node script: sync `shared/contracts/ws/types.ts` → `supabase/functions/_shared/contracts/ws/types.ts`, with `--check` mode exiting non-zero on drift | T1 |
| `tests/unit/shared/contracts-ws-protocol.test.ts` | Vitest suite: protocol schemas accept/reject sample frames; `z.infer<>` stays assignable to hand-written types | T2 |
| `tests/unit/shared/sync-contracts.test.ts` | Vitest suite: sync script copies file and `--check` detects drift | T1 |
| `gateway/src/ws/schemas.ts` | Modified to re-export from `@shared/contracts/ws/protocol` (no duplicated schema definitions) | T3 |
| `gateway/tsconfig.json` | Add `@shared/contracts/*` path + include `../shared/contracts/**/*` | T3 |
| `web/src/types/ws.ts` | Re-export pure types from `@shared/contracts/ws/types` | T4 |
| `web/tsconfig.json` | Add `@shared/contracts/*` path + include `../shared/contracts/**/*` | T4 |
| `supabase/functions/_shared/contracts/ws/types.ts` | Generated copy (do not edit by hand) | T5 |
| `.github/workflows/ci.yml` | Add `contracts-sync-check` job running `node scripts/sync-contracts.mjs --check` | T5 |
| `tests/package.json` | Add `zod@4.3.6` as devDependency so vitest can resolve protocol.ts | T2 |
| `.claude/skills/qrclaw-map/SKILL.md` | Project-specific navigation skill: business domains, key file paths | T6 |
| `.claude/skills/qrclaw-map/map.md` | Table of subsystems and entry points (reference file) | T6 |
| `docs/refactor/execution-log.md` | Append-only log of drift findings, decisions, commits | Continuously |

---

## Drift Findings (input for Task 2)

Captured during plan preparation by diffing `gateway/src/ws/schemas.ts` against `web/src/types/ws.ts`:

1. **Directional coverage gap.** Gateway has Zod schemas only for inbound (client→server) frames + `auth`. Web has TS interfaces for both directions; outbound (server→client) schemas (`connection_ack`, `ack`, `message`, `agent_typing`, `pong`, `error`, `system`) have no Zod counterpart. Decision: include TS types for all frames in `types.ts`; keep `protocol.ts` Zod coverage scoped to **inbound-validated frames only** (no new runtime validation of outbound frames; outbound is produced by gateway and trusted).
2. **`stream_end` payload drift.**
   - gateway: `{ conversation_id, total_chunks: int >=0, total_length?: int >=0 }`
   - web: `{ conversation_id, full_content?: string, total_chunks?: number }`
   Decision: union — `{ conversation_id, total_chunks?, total_length?, full_content? }` (all three optional, keeps both producers/consumers backward compatible).
3. **`stream_chunk.payload.sequence`.** gateway: `.optional()`. web: required `number`. Decision: keep optional (gateway is authoritative for server-produced chunks).
4. **`ping.payload`.** gateway: `z.object({}).optional()`. web: no `payload` field in `PingFrame`. Decision: keep optional empty object schema in protocol; TS type marks payload optional.
5. **`auth` frame.** gateway has it; web has no type. Decision: add `AuthFrame` type to `types.ts` for symmetry.
6. **`agent_message` vs `message`.** gateway validates inbound `agent_message`; web models server→client `message` (with `sender_type`). These are different frames serving different directions — keep both distinct in `types.ts`; `protocol.ts` only provides Zod for `agent_message` (inbound).

All six decisions lock the union schema written in T2.

---

## Dependency Graph / Execution Order

```
T1 (shared skeleton + sync script + its tests)
  ↓
T2 (protocol + types union, tests) ── parallel-ok ─→ T6 (qrclaw-map skill, doc-only)
  ↓
T3 (gateway consumes shared)      ┐
T4 (web consumes shared)          ┤  ← Implementer must run these sequentially (both touch tsconfig-adjacent code; keep serial to preserve clean git history)
  ↓
T5 (sync to supabase + CI job)
  ↓
C1 (final verification)
```

T6 is doc-only and can be dispatched in parallel with T3/T4/T5 by a separate subagent. No other parallelism is safe (single-workspace edits would conflict per `superpowers:dispatching-parallel-agents` guidance).

---

## Task 1: Shared skeleton + sync script

**Files:**
- Create: `shared/contracts/README.md`
- Create: `shared/contracts/ws/types.ts` (skeleton only, full union written in T2)
- Create: `shared/contracts/ws/index.ts`
- Create: `scripts/sync-contracts.mjs`
- Create: `tests/unit/shared/sync-contracts.test.ts`
- Modify: none

Context for implementer: qrclaw is a pnpm-free Node monorepo (`web/`, `gateway/`, `tests/`, `supabase/`). Tests run from `tests/` with vitest 4.1. No `zod` dep in `tests/` yet — T1 does NOT need zod (skeleton types are plain TS). The sync script is plain Node (no deps).

- [ ] **Step 1.1: Create `shared/contracts/README.md`**

```bash
mkdir -p shared/contracts/ws
```

Write file `shared/contracts/README.md`:

```markdown
# shared/contracts

Single source of truth for cross-runtime contracts (WebSocket frames today; HTTP DTOs later).

## Layout

- `ws/types.ts` — dependency-free TypeScript interfaces. Safe to import from any runtime (Node, Deno, browser bundlers). Never import a library from this file.
- `ws/protocol.ts` — Zod schemas and `validateFrame`. Requires `zod` in the consuming project's `node_modules` (gateway already has it). Web MUST NOT import this file (avoids shipping zod to the client).
- `ws/index.ts` — barrel. Safe for Node/gateway only.

## Zod version policy

Zod version is supplied by the **consuming project**, not this directory. Current authoritative version: **4.3.6** (matches `gateway/package.json`). Any upgrade must be synchronized across gateway + tests in a single commit.

## Supabase sync

Supabase Deno functions consume `ws/types.ts` only (types-only, no runtime deps). A Node script at `scripts/sync-contracts.mjs` copies `shared/contracts/ws/types.ts` → `supabase/functions/_shared/contracts/ws/types.ts`. Run it after editing `types.ts`. CI enforces sync via `--check`.

## Editing rules

1. Never edit `supabase/functions/_shared/contracts/**` by hand — it is generated.
2. Changes to `types.ts` that are not purely additive (widening) are breaking. Coordinate with gateway + web + supabase owners.
3. Keep `types.ts` zero-dependency. Zod lives in `protocol.ts`.
```

- [ ] **Step 1.2: Create `shared/contracts/ws/types.ts` skeleton**

Write file `shared/contracts/ws/types.ts`:

```typescript
// Dependency-free TypeScript interfaces for QRClaw WebSocket frames.
// Consumed by web (pure types), gateway (alongside protocol.ts), and
// supabase functions (via the sync-contracts.mjs generated copy).
// DO NOT import any library from this file — Deno/bundler safety.

export interface WSFrame {
  type: string;
  id?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

// Union types are filled in during Task 2 (after drift audit lock-in).
// Keeping this file deliberately minimal here so T1 has no spec creep.
export type ClientFrame = WSFrame;
export type ServerFrame = WSFrame;
```

- [ ] **Step 1.3: Create `shared/contracts/ws/index.ts`**

Write file `shared/contracts/ws/index.ts`:

```typescript
export * from './types';
// protocol.ts intentionally not re-exported here — callers that need Zod
// schemas must import '@shared/contracts/ws/protocol' explicitly so web
// (which lacks zod) cannot accidentally pull the runtime validator in.
```

- [ ] **Step 1.4: Write the failing test for `sync-contracts.mjs`**

Write file `tests/unit/shared/sync-contracts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/sync-contracts.mjs');

function runScript(
  args: string[],
  cwd: string,
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status: number; stdout?: Buffer; stderr?: Buffer };
    return {
      status: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

describe('sync-contracts.mjs', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'qrclaw-sync-'));
    mkdirSync(path.join(sandbox, 'shared/contracts/ws'), { recursive: true });
    mkdirSync(path.join(sandbox, 'supabase/functions/_shared'), { recursive: true });
    writeFileSync(
      path.join(sandbox, 'shared/contracts/ws/types.ts'),
      '// source of truth\nexport type Foo = "bar";\n',
    );
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('copies shared/contracts/ws/types.ts to supabase/_shared/contracts/ws/types.ts', () => {
    const result = runScript([], sandbox);
    expect(result.status).toBe(0);
    const dest = path.join(
      sandbox,
      'supabase/functions/_shared/contracts/ws/types.ts',
    );
    expect(existsSync(dest)).toBe(true);
    const copied = readFileSync(dest, 'utf8');
    expect(copied).toContain('export type Foo = "bar"');
    expect(copied).toMatch(/generated by scripts\/sync-contracts\.mjs/i);
  });

  it('--check exits 0 when destination matches source', () => {
    runScript([], sandbox);
    const result = runScript(['--check'], sandbox);
    expect(result.status).toBe(0);
  });

  it('--check exits non-zero and prints diff hint when destination is stale', () => {
    runScript([], sandbox);
    writeFileSync(
      path.join(sandbox, 'shared/contracts/ws/types.ts'),
      '// source of truth v2\nexport type Foo = "baz";\n',
    );
    const result = runScript(['--check'], sandbox);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/out of sync|drift/i);
  });

  it('--check exits non-zero when destination is missing', () => {
    const result = runScript(['--check'], sandbox);
    expect(result.status).not.toBe(0);
  });
});
```

- [ ] **Step 1.5: Run the test and confirm it fails**

```bash
cd tests && npx vitest run unit/shared/sync-contracts.test.ts
```

Expected: FAIL — "Cannot find module scripts/sync-contracts.mjs" or script-missing errors (status != 0 on first subtest).

- [ ] **Step 1.6: Implement `scripts/sync-contracts.mjs`**

Write file `scripts/sync-contracts.mjs`:

```javascript
#!/usr/bin/env node
// Sync shared/contracts/ws/types.ts → supabase/functions/_shared/contracts/ws/types.ts
// Usage:
//   node scripts/sync-contracts.mjs           # copy (idempotent)
//   node scripts/sync-contracts.mjs --check   # exit non-zero on drift

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);

const ENTRIES = [
  {
    src: 'shared/contracts/ws/types.ts',
    dest: 'supabase/functions/_shared/contracts/ws/types.ts',
  },
];

const GENERATED_HEADER =
  '// AUTO-GENERATED by scripts/sync-contracts.mjs — do not edit.\n' +
  '// Edit shared/contracts/ws/types.ts and rerun the script.\n\n';

function resolveRoot(cwd) {
  // Accept either repo-root cwd or any subdir: walk up until we find package.json + shared/ or use cwd directly.
  if (existsSync(path.join(cwd, 'shared/contracts'))) return cwd;
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'shared/contracts'))) return dir;
    dir = path.dirname(dir);
  }
  return cwd;
}

function main(argv) {
  const checkMode = argv.includes('--check');
  const root = resolveRoot(process.cwd());
  let driftCount = 0;

  for (const { src, dest } of ENTRIES) {
    const srcPath = path.join(root, src);
    const destPath = path.join(root, dest);

    if (!existsSync(srcPath)) {
      console.error(`[sync-contracts] source missing: ${srcPath}`);
      process.exit(2);
    }
    const sourceBody = readFileSync(srcPath, 'utf8');
    const expected = GENERATED_HEADER + sourceBody;

    if (checkMode) {
      if (!existsSync(destPath)) {
        console.error(`[sync-contracts] drift: ${dest} missing`);
        driftCount++;
        continue;
      }
      const actual = readFileSync(destPath, 'utf8');
      if (actual !== expected) {
        console.error(
          `[sync-contracts] drift: ${dest} out of sync with ${src}. Run \`node scripts/sync-contracts.mjs\` to refresh.`,
        );
        driftCount++;
      }
    } else {
      mkdirSync(path.dirname(destPath), { recursive: true });
      writeFileSync(destPath, expected, 'utf8');
      console.log(`[sync-contracts] wrote ${dest}`);
    }
  }

  if (checkMode && driftCount > 0) {
    process.exit(1);
  }
}

main(process.argv.slice(2));
```

- [ ] **Step 1.7: Run the test and confirm it passes**

```bash
cd tests && npx vitest run unit/shared/sync-contracts.test.ts
```

Expected: PASS — all 4 subtests green (`copies...`, `--check exits 0...`, `--check exits non-zero on stale...`, `--check exits non-zero when missing...`).

- [ ] **Step 1.8: Commit T1**

```bash
cd /Users/zeze/qrclaw
git add shared/contracts scripts/sync-contracts.mjs tests/unit/shared/sync-contracts.test.ts
git commit -m "feat(contracts): add shared/contracts skeleton + sync-contracts script

- shared/contracts/ws/types.ts: dependency-free TS interface skeleton
- shared/contracts/ws/index.ts: types-only barrel
- scripts/sync-contracts.mjs: copy + --check mode with drift detection
- tests/unit/shared/sync-contracts.test.ts: 4 test cases covering
  copy / check-clean / check-stale / check-missing

Task 1 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Task 2: Protocol + types union (WS drift resolution)

**Files:**
- Modify: `shared/contracts/ws/types.ts` (fill in full union based on drift findings above)
- Create: `shared/contracts/ws/protocol.ts`
- Modify: `shared/contracts/ws/index.ts` (no change — protocol stays out of barrel)
- Modify: `tests/package.json` (add zod devDependency)
- Create: `tests/unit/shared/contracts-ws-protocol.test.ts`

Context: Gateway currently owns the Zod source of truth at `gateway/src/ws/schemas.ts`. This task lifts that code to `shared/contracts/ws/protocol.ts` — no new validation logic invented. TS union types in `types.ts` come from the six drift decisions in the plan preamble.

- [ ] **Step 2.1: Add zod devDependency to tests**

```bash
cd /Users/zeze/qrclaw/tests
npm install --save-dev zod@4.3.6
```

Expected: `tests/package.json` gains `"zod": "^4.3.6"` under `devDependencies`; `tests/package-lock.json` updates.

- [ ] **Step 2.2: Fill in `shared/contracts/ws/types.ts`**

Replace the skeleton body (Step 1.2) with full union. Overwrite `shared/contracts/ws/types.ts`:

```typescript
// Dependency-free TypeScript interfaces for QRClaw WebSocket frames.
// Consumed by web (pure types), gateway (alongside protocol.ts), and
// supabase functions (via the sync-contracts.mjs generated copy).
// DO NOT import any library from this file — Deno/bundler safety.

export interface WSFrame {
  type: string;
  id?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

// ─── Client → Gateway ────────────────────────────────────────────────

export interface PingFrame extends WSFrame {
  type: 'ping';
  payload?: Record<string, never>;
}

export interface VisitorMessageFrame extends WSFrame {
  type: 'visitor_message';
  id: string;
  payload: {
    content: string;
    content_type: 'text' | 'image_url' | 'file_url';
    metadata?: Record<string, unknown>;
  };
}

export interface AgentMessageFrame extends WSFrame {
  type: 'agent_message';
  id: string;
  payload: {
    content: string;
    content_type: 'text' | 'markdown' | 'image_url' | 'file_url';
    conversation_id: string;
    is_final?: boolean;
    metadata?: Record<string, unknown>;
  };
}

export interface StreamChunkFrame extends WSFrame {
  type: 'stream_chunk';
  id: string;
  payload: {
    conversation_id: string;
    delta: string;
    sequence?: number;
    is_final?: boolean;
  };
}

export interface StreamEndFrame extends WSFrame {
  type: 'stream_end';
  id: string;
  payload: {
    conversation_id: string;
    total_chunks?: number;
    total_length?: number;
    full_content?: string;
  };
}

export interface ReadReceiptFrame extends WSFrame {
  type: 'read_receipt';
  payload: {
    message_ids: string[];
  };
}

export interface AuthFrame extends WSFrame {
  type: 'auth';
  payload: {
    ticket: string;
    session_token?: string;
  };
}

// ─── Gateway → Client ────────────────────────────────────────────────

export interface ConnectionAckFrame extends WSFrame {
  type: 'connection_ack';
  payload: {
    connection_id: string;
    heartbeat_interval_ms: number;
    server_time?: string;
  };
}

export interface AckFrame extends WSFrame {
  type: 'ack';
  payload: {
    message_id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    error_code?: string;
    error_message?: string;
  };
}

export interface MessageFrame extends WSFrame {
  type: 'message';
  id: string;
  payload: {
    content: string;
    content_type: 'text' | 'markdown' | 'image_url' | 'file_url';
    sender_type: 'visitor' | 'agent';
    conversation_id: string;
  };
}

export interface AgentTypingFrame extends WSFrame {
  type: 'agent_typing';
  payload: {
    conversation_id: string;
  };
}

export interface PongFrame extends WSFrame {
  type: 'pong';
}

export interface ErrorFrame extends WSFrame {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface SystemFrame extends WSFrame {
  type: 'system';
  payload: {
    event:
      | 'agent_online'
      | 'agent_offline'
      | 'qrcode_paused'
      | 'qrcode_activated'
      | 'session_expired';
    data?: Record<string, unknown>;
  };
}

// ─── Unions ──────────────────────────────────────────────────────────

export type ClientFrame =
  | PingFrame
  | VisitorMessageFrame
  | AgentMessageFrame
  | StreamChunkFrame
  | StreamEndFrame
  | ReadReceiptFrame
  | AuthFrame;

export type ServerFrame =
  | ConnectionAckFrame
  | AckFrame
  | MessageFrame
  | AgentTypingFrame
  | StreamChunkFrame
  | StreamEndFrame
  | PongFrame
  | ErrorFrame
  | SystemFrame;

// Frame type discriminator — list of all valid `type` values the gateway
// Zod layer will accept on inbound traffic. Kept here so non-Zod consumers
// (web) can still do exhaustive narrowing.
export const INBOUND_FRAME_TYPES = [
  'ping',
  'visitor_message',
  'agent_message',
  'stream_chunk',
  'stream_end',
  'read_receipt',
  'auth',
] as const;

export type InboundFrameType = (typeof INBOUND_FRAME_TYPES)[number];
```

- [ ] **Step 2.3: Write the failing test for `protocol.ts`**

Write file `tests/unit/shared/contracts-ws-protocol.test.ts`:

```typescript
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  validateFrame,
  pingFrameSchema,
  visitorMessageSchema,
  agentMessageSchema,
  streamChunkSchema,
  streamEndSchema,
  readReceiptSchema,
  authFrameSchema,
} from '../../../shared/contracts/ws/protocol';
import type {
  PingFrame,
  VisitorMessageFrame,
  AgentMessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  ReadReceiptFrame,
  AuthFrame,
} from '../../../shared/contracts/ws/types';
import type { z } from 'zod';

describe('validateFrame', () => {
  it('accepts a well-formed visitor_message', () => {
    const frame = {
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content: 'hi', content_type: 'text' },
    };
    const res = validateFrame(frame);
    expect(res.success).toBe(true);
  });

  it('rejects unknown frame type', () => {
    const res = validateFrame({
      type: 'nope',
      timestamp: '2026-04-19T00:00:00Z',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/invalid or missing/i);
    }
  });

  it('rejects visitor_message without content', () => {
    const res = validateFrame({
      type: 'visitor_message',
      id: 'msg-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { content_type: 'text' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateFrame(null).success).toBe(false);
    expect(validateFrame('hello').success).toBe(false);
    expect(validateFrame(42).success).toBe(false);
  });

  it('accepts ping with no payload', () => {
    const res = validateFrame({
      type: 'ping',
      timestamp: '2026-04-19T00:00:00Z',
    });
    expect(res.success).toBe(true);
  });

  it('accepts stream_end with optional total_chunks omitted', () => {
    const res = validateFrame({
      type: 'stream_end',
      id: 'm-1',
      timestamp: '2026-04-19T00:00:00Z',
      payload: { conversation_id: 'c1', total_chunks: 0 },
    });
    expect(res.success).toBe(true);
  });
});

describe('schema ↔ type parity', () => {
  it('pingFrameSchema infers to PingFrame-compatible shape', () => {
    expectTypeOf<z.infer<typeof pingFrameSchema>>().toMatchTypeOf<PingFrame>();
  });
  it('visitorMessageSchema infers compatible with VisitorMessageFrame', () => {
    expectTypeOf<
      z.infer<typeof visitorMessageSchema>
    >().toMatchTypeOf<VisitorMessageFrame>();
  });
  it('agentMessageSchema infers compatible with AgentMessageFrame', () => {
    expectTypeOf<
      z.infer<typeof agentMessageSchema>
    >().toMatchTypeOf<AgentMessageFrame>();
  });
  it('streamChunkSchema infers compatible with StreamChunkFrame', () => {
    expectTypeOf<
      z.infer<typeof streamChunkSchema>
    >().toMatchTypeOf<StreamChunkFrame>();
  });
  it('streamEndSchema infers compatible with StreamEndFrame', () => {
    expectTypeOf<
      z.infer<typeof streamEndSchema>
    >().toMatchTypeOf<StreamEndFrame>();
  });
  it('readReceiptSchema infers compatible with ReadReceiptFrame', () => {
    expectTypeOf<
      z.infer<typeof readReceiptSchema>
    >().toMatchTypeOf<ReadReceiptFrame>();
  });
  it('authFrameSchema infers compatible with AuthFrame', () => {
    expectTypeOf<
      z.infer<typeof authFrameSchema>
    >().toMatchTypeOf<AuthFrame>();
  });
});
```

- [ ] **Step 2.4: Run the test and confirm it fails**

```bash
cd /Users/zeze/qrclaw/tests && npx vitest run unit/shared/contracts-ws-protocol.test.ts
```

Expected: FAIL — "Cannot find module '../../../shared/contracts/ws/protocol'".

- [ ] **Step 2.5: Create `shared/contracts/ws/protocol.ts`**

Write file `shared/contracts/ws/protocol.ts`:

```typescript
// Zod validation schemas for QRClaw WebSocket frames.
// Lifted from gateway/src/ws/schemas.ts so gateway + any future runtime
// validator (e.g. Supabase Edge) share one definition.
// Web MUST NOT import this file — it pulls in zod. Web imports types only.
//
// Iron Rule: Never trust client-supplied data. Validate structure and
// constrain field sizes before any processing.

import { z } from 'zod';
import { INBOUND_FRAME_TYPES, type InboundFrameType } from './types';

// ─── Field Constraints ──────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 16_384; // 16 KB text content
const MAX_ID_LENGTH = 64;
const MAX_DELTA_LENGTH = 4_096;
const MAX_MESSAGE_IDS = 50;
const MAX_METADATA_KEYS = 10;

// ─── Shared primitives ──────────────────────────────────────────────

const timestampSchema = z.string().min(1).max(64);
const messageIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const conversationIdSchema = z.string().min(1).max(MAX_ID_LENGTH);
const contentSchema = z.string().min(1).max(MAX_CONTENT_LENGTH);
const metadataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .refine(
    (val) => !val || Object.keys(val).length <= MAX_METADATA_KEYS,
    { message: `Metadata must have at most ${MAX_METADATA_KEYS} keys` },
  );

// ─── Frame schemas (inbound only) ───────────────────────────────────

export const pingFrameSchema = z
  .object({
    type: z.literal('ping'),
    timestamp: timestampSchema,
    payload: z.object({}).optional(),
  })
  .strict();

export const visitorMessageSchema = z
  .object({
    type: z.literal('visitor_message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'image_url', 'file_url']),
        metadata: metadataSchema,
      })
      .strict(),
  })
  .strict();

export const agentMessageSchema = z
  .object({
    type: z.literal('agent_message'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        content: contentSchema,
        content_type: z.enum(['text', 'markdown', 'image_url', 'file_url']),
        conversation_id: conversationIdSchema,
        is_final: z.boolean().optional(),
        metadata: metadataSchema,
      })
      .strict(),
  })
  .strict();

export const streamChunkSchema = z
  .object({
    type: z.literal('stream_chunk'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        conversation_id: conversationIdSchema,
        delta: z.string().min(1).max(MAX_DELTA_LENGTH),
        sequence: z.number().int().nonnegative().optional(),
        is_final: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const streamEndSchema = z
  .object({
    type: z.literal('stream_end'),
    id: messageIdSchema,
    timestamp: timestampSchema,
    payload: z
      .object({
        conversation_id: conversationIdSchema,
        total_chunks: z.number().int().nonnegative().optional(),
        total_length: z.number().int().nonnegative().optional(),
        full_content: z.string().max(MAX_CONTENT_LENGTH).optional(),
      })
      .strict(),
  })
  .strict();

export const readReceiptSchema = z
  .object({
    type: z.literal('read_receipt'),
    timestamp: timestampSchema,
    payload: z
      .object({
        message_ids: z.array(messageIdSchema).min(1).max(MAX_MESSAGE_IDS),
      })
      .strict(),
  })
  .strict();

export const authFrameSchema = z
  .object({
    type: z.literal('auth'),
    timestamp: timestampSchema,
    payload: z
      .object({
        ticket: z.string().min(1).max(4096),
        session_token: z.string().max(4096).optional(),
      })
      .strict(),
  })
  .strict();

// ─── Discriminator + dispatch ───────────────────────────────────────

const frameTypeSchema = z
  .object({
    type: z.enum(INBOUND_FRAME_TYPES as unknown as [string, ...string[]]),
  })
  .passthrough();

const schemaMap: Record<InboundFrameType, z.ZodType> = {
  ping: pingFrameSchema,
  visitor_message: visitorMessageSchema,
  agent_message: agentMessageSchema,
  stream_chunk: streamChunkSchema,
  stream_end: streamEndSchema,
  read_receipt: readReceiptSchema,
  auth: authFrameSchema,
};

export interface ValidationResult {
  success: true;
  data: Record<string, unknown>;
}

export interface ValidationError {
  success: false;
  error: string;
}

export const validateFrame = (
  raw: unknown,
): ValidationResult | ValidationError => {
  const typeResult = frameTypeSchema.safeParse(raw);
  if (!typeResult.success) {
    const firstIssue = typeResult.error.issues[0];
    return {
      success: false,
      error: firstIssue?.path.includes('type')
        ? 'Invalid or missing message type'
        : firstIssue?.message || 'Invalid frame structure',
    };
  }

  const frameType = typeResult.data.type as InboundFrameType;
  const schema = schemaMap[frameType];
  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join('.') || '';
    return {
      success: false,
      error: `Validation failed${path ? ` at ${path}` : ''}: ${
        firstIssue?.message || 'unknown error'
      }`,
    };
  }

  return { success: true, data: result.data as Record<string, unknown> };
};
```

- [ ] **Step 2.6: Run the test and confirm it passes**

```bash
cd /Users/zeze/qrclaw/tests && npx vitest run unit/shared/contracts-ws-protocol.test.ts
```

Expected: PASS — all 13 subtests green (6 runtime cases + 7 type-parity cases).

- [ ] **Step 2.7: Commit T2**

```bash
cd /Users/zeze/qrclaw
git add shared/contracts/ws/types.ts shared/contracts/ws/protocol.ts \
        tests/unit/shared/contracts-ws-protocol.test.ts \
        tests/package.json tests/package-lock.json
git commit -m "feat(contracts): fill WS union types + lift Zod schemas into shared

- shared/contracts/ws/types.ts: full ClientFrame + ServerFrame unions,
  resolves six drift points between gateway and web (see plan preamble).
- shared/contracts/ws/protocol.ts: Zod schemas + validateFrame lifted
  verbatim from gateway/src/ws/schemas.ts; inbound frames only.
- tests/unit/shared/contracts-ws-protocol.test.ts: 6 validation cases
  + 7 z.infer<> ↔ hand-written type parity cases.
- tests/package.json: zod@4.3.6 devDependency aligns with gateway.

Gateway + web still consume old local copies; T3/T4 wire them up.

Task 2 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Task 3: Gateway consumes shared/contracts

**Files:**
- Modify: `gateway/tsconfig.json` (add path + include)
- Modify: `gateway/src/ws/schemas.ts` (re-export from shared)

Context: Gateway uses `NodeNext` module resolution. `schemas.ts` performs a **value** re-export from `shared/contracts/ws/protocol`, so `tsc` must emit JS for the shared file. This requires `rootDir` to cover both `gateway/src/**` and `shared/contracts/**`. We move `rootDir` to the repo root (`..`) and adjust `main`/`start` to match the new emit layout. This is a coordinated change (Step 3.1 → 3.2 → 3.3) — implementer must do all three before running `typecheck`.

- [ ] **Step 3.1: Patch `gateway/tsconfig.json`**

Overwrite `gateway/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "..",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/contracts/*": ["../shared/contracts/*"]
    }
  },
  "include": ["src/**/*", "../shared/contracts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Effect on build output:
- gateway source emits under `dist/gateway/src/…`
- shared source emits under `dist/shared/contracts/…`
- relative imports between them stay valid post-emit.

- [ ] **Step 3.2: Update `gateway/package.json` entry points to match new dist layout**

Edit `gateway/package.json`:

- Change `"main": "dist/server.js"` → `"main": "dist/gateway/src/server.js"`
- Under `scripts`: change `"start": "node dist/server.js"` → `"start": "node dist/gateway/src/server.js"`

Leave all other scripts (`dev`, `build`, `typecheck`, `pm2:*`, `docker:*`) unchanged. `dev` uses `tsx watch src/server.ts` which is unaffected by `outDir` layout.

Also grep and patch any other `dist/server` references in gateway:

```bash
cd /Users/zeze/qrclaw/gateway && grep -rln "dist/server" . \
  --include="*.cjs" --include="*.js" --include="*.json" --include="*.md" \
  --include="Dockerfile*" 2>/dev/null | grep -v node_modules
```

For every hit: replace `dist/server.js` → `dist/gateway/src/server.js`. If `ecosystem.config.cjs` contains `script: 'dist/server.js'`, patch it. Commit message in Step 3.6 must list every file touched.

- [ ] **Step 3.3: Modify `gateway/src/ws/schemas.ts` to re-export from shared**

Overwrite `gateway/src/ws/schemas.ts`:

```typescript
// Canonical source now lives at shared/contracts/ws/protocol.ts.
// This module is kept for backward-compat import paths inside gateway;
// new code should import from '@shared/contracts/ws/protocol' directly.

export {
  pingFrameSchema,
  visitorMessageSchema,
  agentMessageSchema,
  streamChunkSchema,
  streamEndSchema,
  readReceiptSchema,
  authFrameSchema,
  validateFrame,
  type ValidationResult,
  type ValidationError,
} from '../../../shared/contracts/ws/protocol.js';

export type { InboundFrameType as ValidFrameType } from '../../../shared/contracts/ws/types.js';
```

NOTE: NodeNext requires explicit `.js` extensions in relative imports. `tsc` maps `.js` → `.ts` during type checking automatically.

- [ ] **Step 3.4: Typecheck + build gateway**

```bash
cd /Users/zeze/qrclaw/gateway && npm run typecheck && npm run build 2>&1 | tail -20
ls dist/
ls dist/gateway/src/ | head
ls dist/shared/contracts/ws/
```

Expected: both commands exit 0; `dist/gateway/src/server.js` exists; `dist/shared/contracts/ws/protocol.js` + `types.js` exist.

If typecheck fails with errors unrelated to our changes (pre-existing gateway type debt), implementer MUST stop and report BLOCKED — do not silently suppress. If failure is specifically about `.js` extension / module resolution from shared, re-check Step 3.3 import path strings.

- [ ] **Step 3.5: Run existing gateway unit/integration tests via tests package**

```bash
cd /Users/zeze/qrclaw/tests && npx vitest run unit/ integration/ 2>&1 | tail -40
```

Expected: all prior tests still green; new shared tests (from T1/T2) green; zero regressions.

- [ ] **Step 3.6: Commit T3**

```bash
cd /Users/zeze/qrclaw
git add gateway/tsconfig.json gateway/package.json gateway/src/ws/schemas.ts
# Include ecosystem.config.cjs / Dockerfile only if they were patched in Step 3.2
git diff --cached --stat
git commit -m "refactor(gateway): consume shared/contracts/ws/protocol

- gateway/tsconfig.json: rootDir raised to .. + @shared/contracts path
  alias added; include extended to pick up shared tree for emit.
- gateway/package.json: main/start paths updated to dist/gateway/src/
  layout that new rootDir produces.
- gateway/src/ws/schemas.ts: thin re-export wrapper; single source of
  truth now lives in shared/contracts/ws/protocol.ts.

Zero behavior change. All prior gateway + ws tests remain green.

Task 3 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Task 4: Web consumes shared/contracts (types only)

**Files:**
- Modify: `web/tsconfig.json`
- Modify: `web/src/types/ws.ts`

Context: Web is Next.js 16 with `moduleResolution: bundler`. No zod installed. Turbopack + webpack both respect tsconfig `paths`. Web imports TS types from shared — no runtime code, so no zero-runtime concerns.

- [ ] **Step 4.1: Patch `web/tsconfig.json`**

Overwrite `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@shared/contracts/*": ["../shared/contracts/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    "../shared/contracts/**/*.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4.2: Rewrite `web/src/types/ws.ts` as a re-export**

Overwrite `web/src/types/ws.ts`:

```typescript
// WebSocket frame types — canonical definitions in shared/contracts/ws/types.
// This module is re-exported so existing `@/types/ws` imports keep working.
// DO NOT import from '@shared/contracts/ws/protocol' here — web must stay zod-free.

export type {
  WSFrame,
  PingFrame,
  VisitorMessageFrame,
  AgentMessageFrame,
  StreamChunkFrame,
  StreamEndFrame,
  ReadReceiptFrame,
  AuthFrame,
  ConnectionAckFrame,
  AckFrame,
  MessageFrame,
  AgentTypingFrame,
  PongFrame,
  ErrorFrame,
  SystemFrame,
  ClientFrame,
  ServerFrame,
  InboundFrameType,
} from '@shared/contracts/ws/types';

export { INBOUND_FRAME_TYPES } from '@shared/contracts/ws/types';
```

- [ ] **Step 4.3: Lint web**

```bash
cd /Users/zeze/qrclaw/web && npm run lint 2>&1 | tail -30
```

Expected: passes. If import/no-restricted-paths complains about `../shared/`, add exception in `web/.eslintrc*` — implementer should report back for adjustment rather than silently loosening rules.

- [ ] **Step 4.4: Build web**

```bash
cd /Users/zeze/qrclaw/web && NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder \
  NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001 \
  NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:3001/ws \
  npm run build 2>&1 | tail -25
```

Expected: build succeeds. Zero zod-related errors (confirm with `grep -i zod` in build output).

- [ ] **Step 4.5: Grep web build bundles for zod leakage**

```bash
cd /Users/zeze/qrclaw/web && grep -r "zod" .next/server/app/ 2>/dev/null | head -5 || echo "no zod leakage"
```

Expected: output is `no zod leakage` (zod must not enter the web bundle).

- [ ] **Step 4.6: Commit T4**

```bash
cd /Users/zeze/qrclaw
git add web/tsconfig.json web/src/types/ws.ts
git commit -m "refactor(web): consume shared/contracts/ws/types (types-only)

- web/tsconfig.json: add @shared/contracts/* path + include shared tree.
- web/src/types/ws.ts: thin type re-export from shared; no runtime code.
- Verified zero zod leakage into web bundle (web stays zod-free).

Task 4 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Task 5: Supabase sync + CI gate

**Files:**
- Create (via script): `supabase/functions/_shared/contracts/ws/types.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 5.1: Run the sync script to produce supabase copy**

```bash
cd /Users/zeze/qrclaw && node scripts/sync-contracts.mjs
ls supabase/functions/_shared/contracts/ws/
head -3 supabase/functions/_shared/contracts/ws/types.ts
```

Expected: output contains `[sync-contracts] wrote supabase/functions/_shared/contracts/ws/types.ts`; file exists; first line reads `// AUTO-GENERATED by scripts/sync-contracts.mjs — do not edit.`.

- [ ] **Step 5.2: Verify `--check` is clean**

```bash
cd /Users/zeze/qrclaw && node scripts/sync-contracts.mjs --check; echo "exit=$?"
```

Expected: `exit=0`, no drift messages.

- [ ] **Step 5.3: Patch `.github/workflows/ci.yml` — add `contracts-sync-check` job**

Append a new job to `.github/workflows/ci.yml` (between `gateway-lint` and the end of file):

```yaml

  # ─── Contracts SSOT ─────────────────────────────────────────────────
  contracts-sync-check:
    name: Contracts (shared → supabase sync check)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Verify shared/contracts is in sync with supabase/_shared
        run: node scripts/sync-contracts.mjs --check
```

- [ ] **Step 5.4: Validate the workflow YAML locally**

```bash
cd /Users/zeze/qrclaw && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```

Expected: `ok`.

- [ ] **Step 5.5: Commit T5**

```bash
cd /Users/zeze/qrclaw
git add supabase/functions/_shared/contracts/ .github/workflows/ci.yml
git commit -m "chore(contracts): sync shared → supabase and gate via CI

- supabase/functions/_shared/contracts/ws/types.ts: generated copy.
- .github/workflows/ci.yml: new job \"contracts-sync-check\" runs
  \`node scripts/sync-contracts.mjs --check\` on every PR + push to main.

Task 5 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Task 6: qrclaw-map skill (navigation aid for agents)

**Files:**
- Create: `.claude/skills/qrclaw-map/SKILL.md`
- Create: `.claude/skills/qrclaw-map/map.md`

Context: `.claude/skills/` is the project's skill directory (skills are shared across Cursor/Claude/Codebuddy/Trae via symlinks per the existing adapter-architecture). A skill consists of a `SKILL.md` with a frontmatter description that agents see in autocomplete, plus supporting reference files. This skill complements the 28+ existing skills (see `ls .claude/skills/`) — scope is strictly "where is X in qrclaw" navigation.

This task is doc-only, no tests. Verification = structural check (files exist, frontmatter valid, map covers all subsystems).

- [ ] **Step 6.1: Write `SKILL.md`**

Write file `.claude/skills/qrclaw-map/SKILL.md`:

```markdown
---
name: qrclaw-map
description: QRClaw project navigation. Use when asked "where is X" about qrclaw — business domains, entry points, cross-cutting files (WS contracts, auth, migrations). Load map.md for the full subsystem table.
---

# qrclaw-map

Agent quick-reference for locating code in the QRClaw monorepo.

## When to use

- Anyone asks "where is the X handler / schema / page / migration" in qrclaw.
- Before editing code whose subsystem ownership is unclear.
- When planning a refactor that crosses package boundaries.

## How to use

1. Read `map.md` (sibling file) for the subsystem → path table.
2. For WebSocket protocol questions: the SSOT is `shared/contracts/ws/`; gateway validates inbound via `shared/contracts/ws/protocol.ts`; web consumes types via `@shared/contracts/ws/types`.
3. For schema changes: edit `shared/contracts/ws/types.ts` AND `protocol.ts`, then run `node scripts/sync-contracts.mjs` before committing (CI `contracts-sync-check` will fail otherwise).
4. For database schema: migrations live in `supabase/migrations/`; RLS policies in the same files.

## Non-goals

- This skill does not describe HOW to implement features — it only tells you WHERE things live. For implementation patterns, see the per-package READMEs and the superpowers plans in `docs/superpowers/plans/`.
```

- [ ] **Step 6.2: Write `map.md`**

Write file `.claude/skills/qrclaw-map/map.md`:

```markdown
# QRClaw Subsystem Map

Last updated: 2026-04-19 (phase 1 refactor).

## Top-level layout

| Dir | Runtime | Responsibility |
|---|---|---|
| `web/` | Next.js 16 App Router (Node/edge) | Visitor + agent web UI |
| `gateway/` | Node 20 Express + ws | WebSocket gateway, Redis pub/sub, JWT mint |
| `supabase/` | Supabase Postgres + Deno Edge Functions | DB schema, RLS, auth, edge APIs |
| `shared/contracts/` | Isomorphic TS | SSOT for WS frame types + Zod schemas |
| `tests/` | Vitest + Playwright | Unit / integration / E2E |
| `scripts/` | Node | Dev scripts (incl. sync-contracts.mjs) |
| `docs/` | Markdown | Design, ADRs, superpowers plans |

## Cross-cutting contracts

| Concern | Source of truth | Consumers |
|---|---|---|
| WS frame TS types | `shared/contracts/ws/types.ts` | web (`@shared/contracts/ws/types`), gateway (via schemas.ts), supabase (via generated copy) |
| WS frame Zod schemas + `validateFrame` | `shared/contracts/ws/protocol.ts` | gateway only (web stays zod-free) |
| Supabase synced copy | `supabase/functions/_shared/contracts/ws/types.ts` | Edge functions (future use) — regenerated by `scripts/sync-contracts.mjs`, enforced by CI |

## Gateway subsystems

| Concern | Path |
|---|---|
| HTTP server entry | `gateway/src/server.ts` |
| WS connection lifecycle | `gateway/src/ws/connection.ts` (verify exact name on first read) |
| WS inbound validation | `gateway/src/ws/schemas.ts` → re-exports shared |
| JWT / ticket mint | `gateway/src/auth/` |
| Redis pub/sub | `gateway/src/pubsub/` or `gateway/src/redis/` (verify) |
| PM2 ecosystem | `gateway/ecosystem.config.cjs` |

## Web subsystems

| Concern | Path |
|---|---|
| App router entry | `web/src/app/` |
| Visitor chat UI | `web/src/app/(visitor)/` (verify) |
| Agent dashboard | `web/src/app/(agent)/` (verify) |
| WS client hook | `web/src/hooks/useWebSocket.ts` or similar (verify) |
| Frame types | `web/src/types/ws.ts` → re-exports shared |
| Supabase client | `web/src/lib/supabase/` |

## Supabase subsystems

| Concern | Path |
|---|---|
| Migrations | `supabase/migrations/` |
| Edge functions | `supabase/functions/<name>/index.ts` |
| Shared fn code | `supabase/functions/_shared/` (auth.ts, cors.ts, jwt.ts, supabase.ts, contracts/ws/types.ts [generated]) |
| Seed data | `supabase/seed.sql` (if present) |

## Tests layout

| Layer | Path |
|---|---|
| Unit | `tests/unit/{backend,database,frontend,shared}/` |
| Integration | `tests/integration/` |
| E2E (Playwright) | `tests/e2e/{flows,mobile,web}/` |
| Visual audit | `tests/e2e/visual-audit/` |

## Scripts

| Script | Purpose |
|---|---|
| `scripts/sync-contracts.mjs` | Copy `shared/contracts/ws/types.ts` → supabase `_shared`. `--check` mode used by CI. |

## Known drift / open items

- See `docs/refactor/execution-log.md` for historical schema drift entries and resolutions.
- WS outbound frames (server→client) have TS types but no Zod schemas — gateway is the trusted producer. Revisit if external services start producing outbound frames.
```

- [ ] **Step 6.3: Structural verification**

```bash
cd /Users/zeze/qrclaw
ls .claude/skills/qrclaw-map/
head -5 .claude/skills/qrclaw-map/SKILL.md
wc -l .claude/skills/qrclaw-map/map.md
```

Expected: two files present; frontmatter starts with `---` and contains `name: qrclaw-map`; `map.md` >= 40 lines.

- [ ] **Step 6.4: Commit T6**

```bash
cd /Users/zeze/qrclaw
git add .claude/skills/qrclaw-map/
git commit -m "docs(skill): add qrclaw-map navigation skill

- SKILL.md: directive for agents to locate code by subsystem.
- map.md: subsystem → path table, cross-cutting contracts index,
  known drift log pointer.

Task 6 of docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md"
```

---

## Final Verification (C1)

- [ ] **Step C1.1: Full test suite**

```bash
cd /Users/zeze/qrclaw/tests && npx vitest run 2>&1 | tail -15
```

Expected: all tests pass; include line count >= previous baseline + 17 new test cases from T1/T2.

- [ ] **Step C1.2: Gateway typecheck + build**

```bash
cd /Users/zeze/qrclaw/gateway && npm run typecheck && npm run build 2>&1 | tail -5
```

Expected: both succeed, exit 0.

- [ ] **Step C1.3: Web build**

```bash
cd /Users/zeze/qrclaw/web && NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder \
  NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001 \
  NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:3001/ws \
  npm run build 2>&1 | tail -10
```

Expected: success.

- [ ] **Step C1.4: Sync check clean**

```bash
cd /Users/zeze/qrclaw && node scripts/sync-contracts.mjs --check && echo OK
```

Expected: `OK`.

- [ ] **Step C1.5: Git history integrity**

```bash
cd /Users/zeze/qrclaw && git log --oneline | head -10
```

Expected at minimum (order top→bottom, newest first):

```
<sha> docs(skill): add qrclaw-map navigation skill
<sha> chore(contracts): sync shared → supabase and gate via CI
<sha> refactor(web): consume shared/contracts/ws/types (types-only)
<sha> refactor(gateway): consume shared/contracts/ws/protocol
<sha> feat(contracts): fill WS union types + lift Zod schemas into shared
<sha> feat(contracts): add shared/contracts skeleton + sync-contracts script
837d147 chore: baseline before phase1 refactor
```

Seven commits total (baseline + six tasks). T6 may appear out-of-order if run in parallel with T3–T5.

- [ ] **Step C1.6: Record execution log**

Append to `docs/refactor/execution-log.md` (create if absent):

```markdown
## 2026-04-19 — Phase 1 refactor complete

Plan: `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md`

Commits:
- <T1 sha>  shared skeleton + sync script
- <T2 sha>  WS union types + Zod lift
- <T3 sha>  gateway consumes shared
- <T4 sha>  web consumes shared (types-only)
- <T5 sha>  supabase sync + CI job
- <T6 sha>  qrclaw-map skill

Drift resolved: stream_end union, stream_chunk.sequence optional, ping payload optional, auth frame added to web types, agent_message vs message kept distinct.

Follow-ups (not in scope):
- Outbound frame Zod schemas (gateway-produced — low priority).
- Additional contract domains (HTTP DTOs, DB row shapes).
```

- [ ] **Step C1.7: Commit final log**

```bash
cd /Users/zeze/qrclaw
git add docs/refactor/execution-log.md
git commit -m "docs(refactor): record phase 1 completion in execution log"
```

---

## Self-Review Checklist (run before execution)

**Spec coverage:** Every drift finding (six numbered decisions) maps to a code change in T2. Every consumer (gateway, web, supabase) has a consumption task (T3/T4/T5). CI gate exists (T5). Skill exists (T6). ✅

**Placeholder scan:** No "TBD", no "TODO", no "implement later", no "similar to Task N", no "handle edge cases" without code. Conditional branches in Step 3.3 spell out both paths with exact commands. ✅

**Type consistency:** Schema names (`pingFrameSchema`, `visitorMessageSchema`, etc.) are identical across T2 source code, T2 tests, and T3 gateway re-exports. `InboundFrameType` declared in `types.ts` (T2), consumed in `protocol.ts` (T2) and gateway re-export (T3) under its original name — gateway also aliases it as `ValidFrameType` for backward compat. ✅

**TDD discipline:** T1 and T2 follow write-failing-test → run (fail) → implement → run (pass) → commit. T3/T4/T5 are refactor-with-existing-tests tasks (green-to-green) — standard practice. T6 is doc-only. ✅

**Commit granularity:** Seven commits total (baseline + six), each scoped to one logical concern. DRY + frequent-commits requirement met. ✅
