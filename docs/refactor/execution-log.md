# QRClaw Refactor Execution Log

Chronological record of refactor waves, their commits, and deviations from the written plan. Append new waves at the top.

---

## R1–R3 — Cross-agent visibility + cold-start replay wiring (2026-04-20)

**Trigger**: User ask — in OpenClaw's Telegram channel a "master" agent can (opt-in) see sibling agents' conversations. Our `GET /api/agent/conversations` needed to model this for proper plugin behaviour.

**Reconnaissance (OpenClaw source)**: `openclaw-main/docs/multi-agent.md`, `delegate-architecture.md`, `multi-agent-sandbox-tools.md`. Finding: agents are strictly isolated by default; cross-agent visibility is explicit opt-in via `memorySearch.qmd.extraCollections`, `tools.agentToAgent`, or `sessions_history` scope configuration. No implicit "master agent" role.

**Design decision (approved by user)**: Mirror OpenClaw's philosophy via an `agents.visibility_scope` column.

| Value | Behaviour |
|---|---|
| `'self'` (default) | Agent only sees conversations whose qrcode.agent_id matches itself. Strict isolation. |
| `'owner'` (opt-in) | Agent sees every conversation under any qrcode that shares its `owner_id`. Peer visibility. |

### R1 — endpoint + contract + migration

**Files added**:
- `supabase/migrations/20260420_agent_visibility_scope.sql` — `ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'self' CHECK (… IN ('self','owner'))`. Comment pins intent next to the column.
- `shared/contracts/http/agent/conversations/types.ts` — `AgentConversationItem` (with `owned_by_me` flag), request/response, error-code enum, default/max/rate-limit constants. Dep-free so the plugin can import it without Zod.
- `shared/contracts/http/agent/conversations/protocol.ts` — Zod query-string schema (`z.coerce.number().int().min(1).max(200)` for `limit`, 1–256 char cursor, strict mode).
- `gateway/src/routes/agent-conversations.ts` — JWT auth (selects `agent_id, owner_id, visibility_scope`), keyset pagination by `(last_active_at DESC, id DESC)`, scope-aware qrcode filter (`agent_id = me` vs `agents.owner_id = my_owner_id`), rate-limited at 60 req/min per agent. Returns `owned_by_me` per row so the plugin can skip self-owned rows if it wants.
- `tests/unit/backend/agent-conversations.test.ts` — 25 tests: unauth / malformed token / missing agent / missing scope / limit bounds / pagination meta (cursor, has_more) / rate limit / scope='self' filtering / scope='owner' filtering / scope='owner' mixed ownership → `owned_by_me` set correctly.

**Files modified**:
- `shared/contracts/http/index.ts` — barrel export for `agent/conversations`.
- `gateway/src/server.ts` — mounts `agentConversationsRouter`.

### R2 — plugin wiring

**Files added**:
- `plugins/openclaw/src/agent-conversations-client.ts` — `listConversations()` thin HTTP client. Paginates up to `maxPages=20` (≈1000 items safety cap; log-warn on cap hit). Uses `deriveGatewayBaseUrl(ws)` — no separate HTTP URL config. Throws `AgentConversationsError(code, status, msg)`; callers choose log-and-continue vs fail.
- `plugins/openclaw/tests/agent-conversations-client.test.ts` — URL derivation, single-page, multi-page with cursor, cap triggers warn, 401 → `unauthorized`, 429 → `rate_limited`, 5xx → generic `http_500`, network throw → `network_error`.

**Files modified**:
- `plugins/openclaw/src/inbound.ts` — exports `getLiveSeenSet(accountLabel)` so history and live dedup share one Set per account.
- `plugins/openclaw/src/history.ts` — stops cloning the caller's `seen` Set (`const seen = params.seen ?? new Set()`). This was a silent correctness bug: additions during replay used to vanish on return.
- `plugins/openclaw/src/runtime.ts` — optional `onStateChange(label, state)` dep on `QRClawRuntimeDeps`; wired through to each `QRClawConnection`.
- `plugins/openclaw/src/channel.ts` — new `triggerReplay(accountLabel)` (`listConversations` → bail on error with warn → `replayHistory(conversationIds, sharedSeen)`). Auto-triggered on each `connection_ack` via `onStateChange`, guarded by an `inflightReplays: Map<string, Promise<void>>` so concurrent state-change ticks coalesce into one replay. `onConnectionStateChange` also delegates to `triggerReplay` for explicit external wake-ups.

**Critical race fix — `setTimeout(0)` in `onStateChange`**: if replay runs synchronously on `connection_ack`, frames delivered on the same event-loop tick (e.g. a live `message` immediately after the ack) haven't yet registered in the shared Set. Deferring one macrotask lets the WS queue drain so live-dedup wins over historical copies — otherwise Scenario 2 of the round-trip test fails with `extra.replayed:true` for a message that just arrived live.

### R3 — acceptance + round-trip tests

**Files added**:
- `plugins/openclaw/tests/e2e/history-replay-roundtrip.test.ts` — 4 scenarios:
  1. **Cold-start replay dispatches every conversation's historical messages.**
  2. **Replay dedup — live WS `message_id` is not re-dispatched by replay.** This is the scenario that caught the clone-bug in `history.ts` and the tick-order race in `channel.ts`.
  3. **`listConversations` failure → graceful bail, warn log, no dispatch.**
  4. **Multi-account isolation — distinct tokens get distinct conversation sets; no cross-account dispatch.**

**Files modified**:
- `plugins/openclaw/tests/e2e/harness.ts` — `vi.stubGlobal('fetch', …)` now stubs both `GET /api/agent/conversations` and `POST /functions/v1/decrypted-messages`. Adds `setResponse` / `getCallLog` per endpoint plus `harness.logger` passthrough for assertions.
- `plugins/openclaw/tests/channel.test.ts` — migrated the pre-R2 direct-replay unit tests to the new `triggerReplay` flow. Mocks `agent-conversations-client.js` (returns a single fixed conversation), exposes `getLiveSeenSet` in the `inbound.js` mock. Added two new tests: `listConversations` reject path and zero-conversation short-circuit.

### Verification

| Suite | Result |
|---|---|
| `plugins/openclaw` (plugin-local) | **113 / 113** |
| `tests/` (root monorepo) | **975 / 975** (88 files) |
| `gateway/ npm run typecheck` | clean |
| `prettier --check` on all changed files | clean |

Web `npm run build` fails on this VM because `web/.env.local` lacks Supabase keys — pre-existing, not introduced by R1–R3. (See `AGENTS.md` → "Web env".)

**Commit**: `914940e feat(agent-history): cross-agent visibility_scope + cold-start replay`.

### Bugs surfaced and fixed during R2/R3

1. **`history.ts` cloned the `seen` Set** — replay-time dedup entries never reached `channel.ts`. Would only manifest when replay and live traffic overlapped; unit tests had passed. Fixed by mutating the caller's Set in place.
2. **Replay vs live tick-order race** — without deferring `triggerReplay`, a live frame arriving in the same microtask as `connection_ack` could lose the race and be emitted as replayed. Fixed by `setTimeout(0)` in `onStateChange`.
3. **`channel.test.ts` assumed direct `replayHistory` call** — pre-R2 flow; updated for the new indirection and extended with two failure/empty-path tests.

### Operator knobs

- `agents.visibility_scope` defaults to `'self'`. To grant a master agent peer visibility: `UPDATE agents SET visibility_scope = 'owner' WHERE id = '<agent-uuid>';`.
- Rate limit: 60 req/min per agent (see `AGENT_CONVERSATIONS_RATE_LIMIT_PER_MINUTE`).
- Pagination: `limit` default 50 / max 200. Plugin `maxPages=20` → hard ceiling ~1000 conversations/replay; beyond that the plugin logs a warn and drops the cursor (replay becomes best-effort recent history rather than exhaustive).

---

## M3 — Decryption port + decrypted-messages Edge Function (2026-04-20, in progress)

**Scope**: Unify owner / agent / visitor history decryption in a single Supabase Edge Function. Gateway becomes a thin forwarder (T4/T5); KEK read-path disappears from Node (T6). Retires `get-decrypted-messages`.

**Design decisions (plan v1.3 §M3-D1…D3)**:

| Key | Chosen | Reason |
|---|---|---|
| D1 owner path | **A — Merge** | One function owns decryption; three auth branches inside. Half the surface area, one code path to audit. |
| D2 KEK env var | **A — Unify on `QRCLAW_KEK_V1`** | Edge Function wins the naming (version-suffixed; ready for rotation). Gateway switches in T6. |
| D3 `decrypt_dek` RPC | **C — Drop, decrypt in Deno** | RPC had a `REVOKE EXECUTE` guard in `20260313_security_hardening.sql:77` but no `CREATE FUNCTION` in any migration — a phantom dependency. Matching gateway's Web-Crypto path in Deno removes the DB-side split and future-proofs new-environment deploys. |

### T1 — Deno crypto port (HEAD-local)

**Files added**:
- `supabase/functions/_shared/crypto/hex.ts` — `hexToBytes` / `bytesToHex`.
- `supabase/functions/_shared/crypto/envelope.ts` — `decryptEnvelope()` (AES-256-GCM via `crypto.subtle`; concatenates ciphertext ‖ tag as Web Crypto expects).
- `supabase/functions/_shared/crypto/key-manager.ts` — `readKekBytes()`, `decryptDek()`, `byteaToUtf8String()`. Throws `KekMissingError` / `DekFormatError` instead of silently returning dev-mode keys (Edge Functions always carry a KEK; fail loud).
- `supabase/functions/_shared/crypto/index.ts` — barrel.

**Wire format** (do NOT drift): `encryptedDek = "ivHex:encHex:tagHex"` (AES-256-GCM with KEK). Matches `gateway/src/crypto/key-manager.ts:66`. `encryption_keys.key_data_encrypted` bytea holds UTF-8 bytes of that string.

**Test**: `tests/unit/shared/supabase-crypto-port.test.ts` (8 tests). Inlines the same byte ops the Deno modules use (Web Crypto available in Node 20+), feeds real gateway-`encrypt()` output in, and asserts round-trip. A divergence between gateway Node crypto and Deno Web Crypto would surface here.

### T3 — Shared HTTP contract (HEAD-local)

**Files added**:
- `shared/contracts/http/decrypted-messages/types.ts` — dependency-free interfaces + discriminator (`DECRYPTED_ACTORS`), limit/sentinel constants.
- `shared/contracts/http/decrypted-messages/protocol.ts` — Zod discriminated-union request schema + response schemas.
- `supabase/functions/_shared/contracts/http/decrypted-messages/types.ts` — generated mirror.

**Files modified**:
- `shared/contracts/http/index.ts` — barrel export added.
- `shared/contracts/README.md` — promoted HTTP sync-check table; `decrypted-messages` is the first HTTP folder mirrored to Deno.
- `scripts/sync-contracts.mjs` — `ENTRIES` gained the HTTP row; generated header per-entry names its source file.
- `tests/unit/shared/sync-contracts.test.ts` — sandbox now provisions the HTTP source; new `it('copies http/decrypted-messages/types.ts …')` locks the extension.

**Deviation from plan §M3**: plan text implied "HTTP contracts untouched by sync-check" (inherited from Wave 1 Drift G). M3-T3 promotes `decrypted-messages/` to an entry because the Edge Function imports the TS interfaces at compile time — which is exactly the trigger Wave 1 said would justify extending sync. Documented in README table; CI `contracts-sync-check` picks it up automatically.

**Test**: `tests/unit/shared/contracts-http-decrypted-messages.test.ts` (22 tests). Covers type parity (`expectTypeOf ... toMatchTypeOf ...` for discriminated union, owner/agent/visitor variants, response + message schemas) and runtime: per-actor accept/reject, session_token placement, strict extra-field rejection, limit clamp, UUID regex.

### T2 — decrypted-messages Edge Function (HEAD-local)

**Files added**:
- `supabase/functions/decrypted-messages/index.ts` — single `Deno.serve` handler with four phases (parse → authenticate → authorise → fetch+decrypt).

**Files modified**:
- `supabase/functions/_shared/auth.ts` — added `authenticateAgent(req)` (SHA-256 api_key → `agents.api_key_hash` lookup with `status='active'` check). Mirrors `agent-ws-ticket`'s hashing; service client singleton reused via `getServiceClient()`.

**Per-actor matrix**:

| actor | auth | authz |
|---|---|---|
| owner | `authenticateOwner` → Supabase JWT → `user.id` | `conversations → qrcodes!inner → agents!inner → owners!inner.user_id` matches `user.id` |
| agent | `authenticateAgent` → SHA-256 `api_key` → `agents.id` | `conversations.qrcode_id → qrcodes.agent_id` matches `agent.id` |
| visitor | none | `conversations.session_token` constant-time equals `body.session_token` (returns 403 on any mismatch or missing row to avoid an existence oracle) |

**Plaintext safety (C2)**: DEK bytes stay in a local `Uint8Array`; `content_encrypted` decrypted per-row; **never logged**. Per-row decryption failure returns `DECRYPTION_FAILED_SENTINEL` so one bad row can't black-hole a page.

**Thread pre-provisioning (C5)**: `reply_to_message_id` and `thread_id` surface in the response via `row.reply_to_message_id ?? null` — today every row is NULL per `20260420_future_group_topic_reserve.sql`, but the wire shape is stable for the future topics/threads ship.

**Validation fidelity**: plan §M3 says "validate via shared Zod". The Edge Function can't import `protocol.ts` (zod pulls `npm:` deps in Deno; we already pay that tax for supabase-js but prefer zero-dep hot paths). Instead we import types/constants from the generated mirror and mirror the Zod rules inline. `tests/unit/shared/contracts-http-decrypted-messages.test.ts` locks the Zod side; a future M3 follow-up can introduce a Deno test that parses the same shapes against the inline validator to assert equivalence.

**Still pending in M3**:
- C1 Security + database review + six-pane verification.

---

## M3 Wave 2 — T4 / T5 / T6 (2026-04-20)

**Status**: ✅ All three tasks landed together in one batch; the gateway is now
a thin forwarder, the Node KEK read-path is gone, and the legacy
`get-decrypted-messages` Edge Function is retired.

### T4 — Gateway client for `decrypted-messages`

New `gateway/src/services/decrypted-messages-client.ts` exposes
`callDecryptedMessages(request, opts?) → Result`:

- Builds `POST ${SUPABASE_URL}/functions/v1/decrypted-messages` with `apikey`
  (anon or service-role fallback) + `Authorization: Bearer <bearerToken ?? apikey>`.
  Visitors pass no bearer; owner/agent forwarders pass their own token
  unchanged.
- Returns a typed `Result` so the forwarder can map failures without `try/catch`.
- Surfaces transport (`network_error`), abort (`timeout`), non-JSON
  (`invalid_response`), shape mismatch (`invalid_response`), upstream error
  envelope (echoed `code`), and "not configured" (`service_unavailable`)
  with a documented error vocabulary.
- Accepts a `fetchImpl` seam for tests; added `SUPABASE_ANON_KEY` to
  `gateway/src/env.ts`.

Test: `tests/unit/gateway/decrypted-messages-client.test.ts` (9 cases covering
every branch, including bearer pass-through, error shape guard, and
unset-env fallback).

### T5 — `POST /api/messages` as a thin forwarder

`gateway/src/routes/messages.ts` rewritten:

- Validates the **unchanged** public request (`qr_code_id`, `session_token`,
  `limit`, `before`) so the web client in
  `web/src/lib/ws/history.ts` keeps working without a coordinated deploy.
- Resolves `conversation_id` from `(qr_code_id, session_token)` — a
  privacy-safe lookup that never reads plaintext.
- Forwards to `callDecryptedMessages({ actor: 'visitor', conversation_id,
  session_token, limit })`.
- Reshapes the unified response into the legacy envelope
  `{ data: { messages: [{ id, content, role, sent_at }] } }` where `id` is
  `message_id` (continuity with the pre-M3 behaviour; web's ChatMessage
  reconciliation expects that value).
- Error mapping preserves the historical status codes: no conversation /
  forbidden upstream → 200 empty list (privacy), other upstream failures →
  500 generic, Supabase unconfigured → 503.
- `before` (ISO timestamp) is intentionally **not** forwarded; no live caller
  sends it and the new contract's cursor is `messages.id`, not a timestamp.
  Supporting a translation is deferred until a caller needs pagination.

Test: `tests/unit/backend/messages-history.test.ts` fully rewritten. Mocks
`callDecryptedMessages` at the boundary and covers happy path + privacy
empties + 500 + 503 + token-never-echoed assertion.

### T6 — Retire gateway KEK read-path and `get-decrypted-messages`

- `gateway/src/crypto/envelope.ts` now exports only `encrypt` (removed
  `decrypt`). JSDoc pins the rationale to Iron Rule C2.
- `gateway/src/crypto/key-manager.ts` now exports only `getDEK` + `rotateDEK`
  (removed `decryptDEK`, removed the `createDecipheriv` import).
- KEK env var unified on `QRCLAW_KEK_V1`:
  - `gateway/src/env.ts` resolves `QRCLAW_KEK_V1 || ENCRYPTION_KEK` into a
    single `env.QRCLAW_KEK_V1` slot and drops the standalone `ENCRYPTION_KEK`
    slot.
  - `gateway/src/crypto/key-manager.ts:resolveKek()` reads `QRCLAW_KEK_V1`
    first and emits a one-time `console.warn` if it falls back to
    `ENCRYPTION_KEK` (flag persisted on `globalThis` to de-dupe across re-imports).
  - `gateway/src/server.ts:validateRequiredEnv()` now fails startup if
    `QRCLAW_KEK_V1` is unset or ≠ 64 hex chars. Legacy `ENCRYPTION_KEK` is
    accepted via the env.ts fallback but the error message names the
    canonical var.
- `supabase/functions/get-decrypted-messages/` deleted (directory + lone
  `index.ts`). Callers:
  - `tests/acceptance/api-helper.ts:getDecryptedMessages` retargeted to the
    unified `decrypted-messages` function with `actor: 'owner'`.
  - `tests/acceptance/iron-rules.spec.ts` C5 section rewritten to assert the
    unified file exists + handles all three actors + the retired file does
    NOT exist. The previous `it.todo` for the agent-plugin endpoint has been
    resolved by the unified function.
- Documentation sync:
  - `.claude/skills/qrclaw-map/map.md` updated — gateway crypto marked as
    "write-path only", new `decrypted-messages-client.ts` entry, unified
    Edge Function entry, `_shared/crypto/` entry.
  - `supabase/EDGE_FUNCTIONS_ENV.md` — `QRCLAW_KEK_V1` row retargeted to
    `decrypted-messages`; matrix row renamed accordingly.
  - `supabase/PRODUCTION_CHECKLIST.md` — checklist item replaced.
  - `AGENTS.md` — env-secrets section names `QRCLAW_KEK_V1` with legacy
    fallback callout.
  - `gateway/.env.example` + `gateway/.env.production.example` updated to
    prefer `QRCLAW_KEK_V1` (keep `ENCRYPTION_KEK` commented as a deprecated
    alias).
- Regression test in `tests/unit/ws-ticket-flow.test.ts` — the column-rename
  guard migrated from `gateway/src/routes/messages.ts` (which no longer
  selects from `encryption_keys`) to
  `supabase/functions/decrypted-messages/index.ts`. A companion assertion
  now pins the gateway route as a forwarder (imports `callDecryptedMessages`
  and does **not** call `.from('encryption_keys')`).
- Cross-runtime parity test `tests/unit/shared/supabase-crypto-port.test.ts`
  dropped its gateway-decrypt round-trip sanity case (gateway no longer
  exposes a decrypt counterpart); the ported `decryptEnvelope` still
  round-trips gateway-produced ciphertext.

### Verification

| Pane | Command | Result |
|---|---|---|
| 1. Gateway typecheck | `cd gateway && npm run typecheck` | ✅ zero errors |
| 2. Gateway build | `cd gateway && npm run build` | ✅ zero errors |
| 3. Vitest full suite | `cd tests && npx vitest run` | ✅ 918 passed (85 files) |
| 4. Prettier | `npx prettier --check <T4/T5/T6 files>` | ✅ all files use Prettier code style (2 files auto-formatted) |
| 5. Gateway decrypt surface gone | `rg 'decryptDEK\|from.*crypto/envelope.*decrypt' gateway/src` | ✅ zero hits |
| 6. `get-decrypted-messages` retired | `rg 'get-decrypted-messages' gateway supabase/functions web` | ✅ zero hits outside archive docs |

### Decisions deferred to M3-C1

- **Agent-plugin HTTP forwarder**: `POST /api/agent/history` was originally
  sketched as its own gateway route. With owner/agent/visitor all served by
  the Edge Function, the only remaining reason to route through gateway is
  "give the OpenClaw plugin a single base URL". Parking until M4-PLUGIN
  clarifies the plugin's network posture.
- **Cursor pagination end-to-end**: today `limit` is the only knob any client
  uses. Exposing `cursor` in `web/src/lib/ws/history.ts` is a follow-up once
  the dashboard surfaces history browsing.

## M3-C1 — review fix batch (2026-04-20, DONE)

`security-reviewer` (SHIP-WITH-FIX) and `database-reviewer` (SHIP-WITH-FIX)
produced a combined 11 findings across the M3 delta. The user picked plan **A
— fix all prioritized items including the new migration**; this section
records each finding, its resolution, and the verification.

### Scope

| Class | ID | File(s) | Fix |
|---|---|---|---|
| Security MEDIUM | M-1 | `gateway/src/services/decrypted-messages-client.ts` | Drop `SUPABASE_SERVICE_ROLE_KEY` fallback; refuse to call out when `SUPABASE_ANON_KEY` is missing so the admin key never lands in the `apikey` header. |
| Security MEDIUM + DB MEDIUM | M-2 / DB-M2 | `supabase/functions/decrypted-messages/index.ts` `constantTimeEqual` | Iterate `max(a.length, b.length)` and XOR the length delta into the accumulator so both short and long inputs take the same time before the compare. `charCodeAt` NaN → 0 via `| 0`. |
| Security LOW | L-1 | `supabase/functions/_shared/crypto/hex.ts` | Add `^[0-9a-fA-F]*$` regex gate so non-hex characters throw instead of silently decoding to zero. |
| Security LOW | L-2 | `supabase/functions/decrypted-messages/index.ts` | `err instanceof Error ? err.message : String(err)` in the three catch sites (top-level handler, DEK unwrap, per-row decrypt) so `console.error` never emits `[object Object]`. |
| DB BLOCKER | B1 | `supabase/functions/decrypted-messages/index.ts` cursor branch | Switch the ORDER BY + cursor comparison to a composite `(sent_at DESC, id DESC)` keyset; invalid cursors return **400 `invalid_cursor`** instead of silently restarting the page. |
| DB HIGH | H1 | `supabase/migrations/20260420_m3_c1_fixes.sql` + `gateway/src/db/persist.ts` | New partial unique index `uniq_encryption_keys_active_conversation ON encryption_keys(conversation_id) WHERE status = 'active'`. `upsertEncryptionKey` now treats a 23505 loss as "another worker won" and re-reads the winning row. |
| DB HIGH | H2 | `supabase/migrations/20260420_m3_c1_fixes.sql` | New unique index `uniq_agents_api_key_hash ON agents(api_key_hash)` — turns `authenticateAgent` from a full scan into an index probe and prevents hash collisions across the fleet. |
| DB HIGH | H3 | `gateway/src/crypto/key-manager.ts` | Removed the dead `rotateDEK` helper; replaced with a long comment documenting the three conditions any reintroduction must satisfy (new row, prior row `status != 'active'`, partial-unique index awareness). |
| DB MEDIUM | M1 | `supabase/functions/decrypted-messages/index.ts` | Owner and agent auth-then-lookup paths now collapse "conversation missing" into the same 403 the visitor path already returned, so the endpoint no longer leaks conversation-id existence to anyone with a valid JWT / API key. |
| DB MEDIUM | M3 | same as B1 | Invalid cursor → 400, not silent page-1 reset. `DECRYPTED_ERROR_CODES` in the shared contract gains `invalid_cursor` so web / gateway can switch on it. |
| DB MEDIUM | P1 | `supabase/migrations/20260420_m3_c1_fixes.sql` | New `idx_messages_conversation_sent_at_desc_id_desc ON messages(conversation_id, sent_at DESC, id DESC)` so the new composite-cursor query is an index-only scan. |

L1 / L2 from the DB review (phantom `decrypt_dek` REVOKE, contract mirror
drift risk) are **kept open** as documented follow-ups: the REVOKE is
harmless noise and the contract sync already has a CI step (`node
scripts/sync-contracts.mjs --check` in `.github/workflows/ci.yml`).

### Contract surface delta

- `shared/contracts/http/decrypted-messages/types.ts` — `DECRYPTED_ERROR_CODES` gains `invalid_cursor`. Mirror re-synced via `node scripts/sync-contracts.mjs` → `supabase/functions/_shared/contracts/http/decrypted-messages/types.ts`.

### Migration guardrails

`20260420_m3_c1_fixes.sql` guards every `CREATE UNIQUE INDEX` with a
pre-flight `DO $$ … RAISE EXCEPTION` block that fails loudly if the source
table already violates the new constraint (two active DEKs, two agents
sharing `api_key_hash`). This gives operators an actionable error rather
than a bare `could not create unique index` during apply.

### Six-pane verification (HEAD at time of commit)

| Pane | Command | Result |
|---|---|---|
| 1. Gateway typecheck | `cd gateway && npm run typecheck` | ✅ zero errors |
| 2. Vitest full suite | `cd tests && npx vitest run` | ✅ 918 passed (85 files), 0 type errors |
| 3. Prettier | `npx prettier --check <modified files>` | ✅ all files use Prettier code style |
| 4. Contracts sync | `node scripts/sync-contracts.mjs` | ✅ 2 mirror files up to date |
| 5. Service-role fallback gone | `rg 'SUPABASE_SERVICE_ROLE_KEY' gateway/src/services/decrypted-messages-client.ts` | ✅ zero hits |
| 6. `rotateDEK` gone | `rg 'rotateDEK' gateway/src` | ✅ zero live symbols (only the documentation block remains) |

### Known follow-ups (explicitly deferred)

- **DB L1 — phantom `decrypt_dek` REVOKE**: `20260313_security_hardening.sql` still REVOKEs a function that was never created. Harmless but noisy in logs; to be tidied when the hardening file gets its next touch.
- **DB L2 — contract mirror CI**: `node scripts/sync-contracts.mjs --check` already runs in CI (`.github/workflows/ci.yml`). If a future reviewer asks about drift coverage, point them there.
- **Dead `idx_messages_conversation`**: the asc-only index is retained for safety. Drop in a follow-up once pg_statistic confirms zero reads.

---

## Phase 2 Wave 2 closeout — C1 six-pane verification (2026-04-20)

**Status**: ✅ DONE. 15 / 15 outbound emit sites route through `sendFrame`. Prod unchanged (`log-only` default until the §3.4 seven-day window); tests pinned to `strict`.

**Commit range**: `b0296f3` (T1) … `cd442f0` (T6). Wave 2 spans 13 commits (T1, T2, T3a × 2 incl. fanout doc fix, T3b, T3c, T3d, T3e, T3e JSDoc refresh, T4, T5, T6).

### Six-pane verification (2026-04-20, HEAD `cd442f0`)

| Pane | Command | Result |
|---|---|---|
| 1. Gateway typecheck | `cd gateway && npm run typecheck` | ✅ zero errors |
| 2. Vitest full suite | `cd tests && npx vitest run` | ✅ 872 passed \| 1 todo (82 files) |
| 3. Prettier | `npm run format:check` | ✅ all matched files use Prettier code style |
| 4. Contracts sync | `node scripts/sync-contracts.mjs --check` | ✅ no drift |
| 5. Outbound choke point | `rg 'ws\.send\(\|sendSafe\(' gateway/src/ws/ \| grep -v 'send.ts:'` | ✅ zero call-site hits (matches only in prose / JSDoc) |
| 6. Iron-rule grep (HS256) | `rg 'HS256' gateway/src` | ✅ two hits are WS-ticket signing (`gateway/src/routes/ticket.ts:140,239`) using `WS_TICKET_SECRET` — gateway-internal short-lived HMAC, not a Supabase-JWT verify. Out of Wave 2 scope. |

### Done-means

- [x] **§3.1 Zod coverage**: every `ServerFrame` literal in `OUTBOUND_FRAME_TYPES` has a Zod schema in `shared/contracts/ws/outbound.ts`, registered in `outboundSchemaMap`, with parity + runtime tests in `tests/unit/shared/contracts-ws-outbound.test.ts` (locked via `ACK_STATUSES` + `OUTBOUND_FRAME_TYPES` const arrays in T1).
- [x] **§3.2 Single choke point**: 15 emit sites (E1–E15) all reach the socket through `send.ts:sendFrame`. `sendSafe` export retired (T3e); `MAX_BUFFER_SIZE` hoisted into `send.ts` as sole definition.
- [x] **§3.3 Observability**: `outbound_validation_failures_total:<frame_type>` counter exposed via `GET /metrics` → `counters`; structured `console.warn` on each rejection (no payload body per C2). Integration test in `tests/integration/ws/outbound-validation-metric.test.ts` covers strict-drop, log-only-pass-through, valid-sent, bounded-cardinality.
- [x] **§3.4 Rollout guard**: `QRCLAW_OUTBOUND_VALIDATION=strict` pinned in `tests/vitest.config.ts` env + `.github/workflows/ci.yml` `tests` job. Prod stays `log-only`; seven-day zero-failure flip is a future deploy-env event out of scope.
- [x] **§3.5 Navigation doc**: `.claude/skills/qrclaw-map/map.md` now has separate inbound / outbound recipes and surfaces `send.ts` + `fanout.ts` + `outbound.ts` in the gateway files + cross-cutting contracts tables.

### Drift summary (all previously logged, indexed here)

| # | Drift | Logged under |
|---|---|---|
| D1–D7 | shared/types.ts shape divergences (missing broadcast frame, security envelope home, ack status widening, queued_at field, outbound const arrays) | T1 entry |
| DEV-prom-client | Plan assumed prom-client; repo uses in-memory metrics. `incrCounter`/`getCounters`/`resetCounters` extended on `metrics.ts`. | T2 entry |
| DEV-pino | Plan assumed pino; repo uses `console.warn(JSON.stringify(...))` per `perf.ts` convention. | T2 entry |
| DEV-fanout-pivot | Plan cut stream emit sites one-by-one; implementer pivoted `fanoutFrame` to delegate to `sendFrame`, covering T3a + auto-covering T3d/T3e broadcast paths. | T3a entry |
| DEV-connectionId | `sendAck` / `sendError` / `handlePing` signatures extended with optional `connectionId?: string` for counter/log attribution. | T3b / T3c entries |
| DEV-OutboundErrorCode | Shared `ErrorFrame.payload.code` kept wide (`string`); gateway locally derives `OutboundErrorCode = z.infer<typeof errorOutboundSchema>['payload']['code']` for compile-time narrowing without modifying shared contracts. | T3c entry |
| DEV-genericEnvelope | `injectSecurityEnvelope` made generic (`<T>(T) → T & { security_envelope }`) in T3d to erase the T3a `as unknown as MessageFrame` double-cast; also tightened the T3a stream_end leftover cast. | T3d entry |
| DEV-FakeWS | T4 integration test uses FakeWS harness (same as T2 unit test) rather than real `ws.Server`; `getCounters()` snapshot replaces Express `/metrics` HTTP assertion. Trade-off documented inline. | T4 entry |
| DEV-strict-already-default | T5 was nominally "flip to strict"; in reality `feature-flags.ts` already defaults non-prod to `strict`, so T1–T4's 872 passing tests were always under strict. T5 made the intent explicit in both vitest config and CI workflow. | T5 entry |

### Aftermath hygiene (post-T3e)

- `278422c` refreshed `gateway/src/ws/send.ts` JSDoc after T3e removed the fanout.ts duplicate `MAX_BUFFER_SIZE` and `sendSafe`. T3e allowlist (narrow scope) could not touch `send.ts`; the follow-up was a three-comment-line edit to avoid stale references.
- Two NITs left as acknowledged tech debt:
  - `gateway/src/types/index.ts` carries a duplicate `AgentTypingFrame` definition. Local copy has no consumers after T3d; safe to delete in a future cleanup.
  - `handler.ts` offline-drain casts `msg.contentType` / `msg.senderType` (both `string` on `QueuedMessage`) to the outbound literal unions. Runtime is defended by `sendFrame`'s outbound Zod; schema-tightening of `QueuedMessage` itself is out of scope.

### Next waves

With Wave 2 closed, the unblocked work is **M3 (Edge-Function decrypted-messages + KEK read-path removal)** and **M4 (plugin MVP skeleton, create-qrcode API, CI release, E2E acceptance)**. See `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §§M3/M4.

---

## Phase 2 Wave 2 execution log

Plan: `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`.

Goal: lift every Gateway→Client WS emit site through the `sendFrame()` validation helper (T2, commit `e858b9c`), so the outbound Zod barrel has a single runtime choke point.

### T3a — stream domain + fanout pivot migration

**Commit**: T3a (see `git log --grep='Phase 2 Wave 2 T3a'`; SHA printed by verification run).

**Plan-vs-reality drift**. Plan §2.2's outbound emit inventory listed the three stream emit sites (E10 `stream_chunk` at `router.ts:~359`, E11 `stream_end` no-envelope at `~417`, E12 `stream_end` with envelope at `~496`) as direct `sendSafe(ws, JSON.stringify(frame))` call sites. In reality all three reach `ws.send` indirectly via `fanoutFrame({ kind: 'direct-to-visitor' }, ...)` (`gateway/src/ws/fanout.ts`), which stringified the frame once and dispatched through `sendSafe`. The same fanout pivot is also used by the `message` forward (T3e scope), the `visitor_message` broadcast (T3e), and `agent_typing` fanout (T3d).

**Decision**. Migrate `fanoutFrame` itself instead of cutting per-emit-site. Narrow its `frame` parameter from `WSFrame` to `ServerFrame` and replace the internal `sendSafe(ws, data)` loop with `sendFrame(entry.ws, frame, { connectionId: entry.info.connectionId })`. This is a single cut that pulls every current fanout consumer (stream + message + visitor broadcast + agent_typing fanout — minus the `agent_typing` direct-to-self emit at `router.ts:190` which still goes through `sendSafe` and is T3d's responsibility) onto the validation choke point.

**Impact**.

- **T3a scope stays tight** on the stream domain: the three stream emit sites in `router.ts` are retyped (`StreamChunkFrame` / `StreamEndFrame`) so the narrowed `fanoutFrame` signature typechecks. No business-logic change.
- **T3d and T3e benefit automatically**: the `message` and `visitor_message` payload literals were already being built at the fanout call site, so they only needed minimal type patches (documented `as` casts kept narrow). Remaining T3d/T3e work shrinks to `agent_typing` direct emit + `sendAck`/`sendError`/`handlePing` migration + `handler.ts` offline-queue-drain emissions.
- **Synchronous delivery preserved** (`fanoutFrame` stays sync; `sendFrame` is sync). No `await` introduced. Delivery semantics match pre-T3a: a recipient counts as `delivered` iff `sendFrame` returned `'sent'` (i.e. socket open + under 128 KiB bufferedAmount + no throw). `'dropped_backpressure'`, `'closed'`, and the new `'dropped_invalid'` result all count as undelivered — consistent with the old `sendSafe` semantics.

**Behavior change (contained by flag default)**. In `strict` validation mode, `sendFrame` now drops frames whose payload fails the outbound Zod schema *before* the socket write. Production defaults to `log-only` (per `gateway/src/config/feature-flags.ts`), so prod remains zero-behavior-change. Test env defaults to `strict`, which surfaces any shape regression early.

**T2 follow-ups completed in this commit**.

- **IMPORTANT-1** — `gateway/src/ws/send.ts` now whitelists `frameType` against `OUTBOUND_FRAME_TYPES` before it becomes a counter key. A malformed frame (missing `type`, non-string `type`, typo'd `type` that Zod rejected) is logged with a preserved `rawFrameType` field but the counter stays bounded to 11 keys (10 outbound types + `unknown`).
- **NIT-5** — `tests/unit/backend/ws-send.test.ts` gained a sub-test covering the `ws.send()` throw path (resolves to `'closed'` result, no crash). A second sub-test locks the whitelist behavior (unknown `type` string maps to the `unknown` counter key).

**Files touched**:

- `gateway/src/ws/fanout.ts` — `fanoutFrame` signature + internal loop.
- `gateway/src/ws/router.ts` — 3 stream emit sites retyped; `visitor_message` / `message` fanout calls got minimal type patches (scoped casts documented inline) so the narrowed `ServerFrame` typechecks. No other behavior touched.
- `gateway/src/ws/send.ts` — IMPORTANT-1 whitelist.
- `tests/unit/backend/ws-send.test.ts` — +2 sub-tests (NIT-5 + IMPORTANT-1).
- `tests/unit/gateway/fanout.test.ts` — necessary collateral: `sampleFrame` upgraded from loose `WSFrame` to a valid `VisitorMessageBroadcastFrame`. Under `strict` mode (test default) a loose frame would have been dropped, pushing every `delivered` assertion to zero. Not in the T3a allowlist but unavoidable — flagged for reviewer awareness.
- `docs/refactor/execution-log.md` — this entry.

**Residual `sendSafe` / `ws.send` sites** (tracked for T3b/T3c/T3d):

- `router.ts:190` — `sendSafe(ws, JSON.stringify(agent_typing))` (T3d).
- `router.ts:620` — `ws.send(pong)` (T3b — `handlePing`).
- `router.ts:632/641` — `sendSafe` inside `sendAck` / `sendError` (T3b/T3c).
- `handler.ts` offline-queue-drain emit — T3c/T3e.

**Verification**.

- `cd tests && npx vitest run unit/backend/ws-send.test.ts` → 7 passed (was 5).
- `cd tests && npx vitest run` → 872 passed | 1 todo (was 870 + 2 new).
- `cd tests && npx vitest run integration/ws` → 21 passed / 4 files.
- `cd gateway && npm run typecheck && npm run build` → 0 errors.
- `cd web && npx tsc --noEmit` → 0 errors.
- `node scripts/sync-contracts.mjs --check` → clean.
- `npx prettier --check gateway/src/ws/ tests/unit/backend/ws-send.test.ts` → clean.

---

## 2026-04-20 — Phase 2 Wave 1 completion (HTTP contracts SSoT)

Plan: `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`.

Goal: lift request-body validation for all 4 web-reachable HTTP endpoints (`/api/visitor-ws-ticket`, `/api/agent-ws-ticket`, `/api/messages`, `/api/subscribe`, `/api/create-qrcode`) into `shared/contracts/http/<domain>/{types,protocol}.ts`, mirror the Phase 1 WS pattern, keep web Zod-free, and resolve drifts A–F listed in §2.

### Task → commit map

| Task | Commit(s) | Summary |
|---|---|---|
| T1 scaffold + `validateRequest` middleware | `3b3d425` | `shared/contracts/http/` tree + `gateway/src/middleware/validate-request.ts` + 10 middleware tests. Post-review fix inlined: `z.ZodSchema<T>` → `z.ZodType<T>` (Zod v4 compliance), explicit `Request<..., unknown, T>` typing so downstream handlers get `req.body: T`. |
| T2a tickets | `5de0c62` | Lifted `{visitor,agent}-ws-ticket` request bodies. Removed manual `if (!qr_code_id)` branches. |
| T2b messages | `51b85fb`, fix `1160534` | Lifted `/api/messages` body. Dropped `.default(50)` on the schema in favour of `req.body.limit ?? MESSAGES_LIMIT_DEFAULT` in the handler (keeps `z.infer` aligned with `MessagesHistoryRequest`). Fix swapped `toEqualTypeOf` → `toMatchTypeOf` for the empty-object `AgentWsTicketRequest` parity test (Zod 4 infers `{ [x: string]: never }` for `.strict()` empty shapes). |
| T2c subscribers | `d7449e4` | Pure schema lift. Handler still calls `safeParse()` inline — route is **not** wrapped with `validateRequest` because the subscribe response shape (`{ success: false, error: string }`) is a legacy contract consumed by the landing-page client. |
| T2d qrcodes | `3153d46`, docs `ea71925` | Biggest lift. Drift C resolved (`QR_TEMPLATES` enum enforced by Zod), Drift E resolved (`PROFILE_AVATAR_MAX_DATA_URL_CHARS = 600_000` single-source), Drift F **partially** resolved (constant lifted, schema-level `.max(1000)` deferred behind `PHASE2_STRICT_SYSTEM_PROMPT = false` gate to keep Wave 1 a pure refactor). Docs commit records two surface-level behavior changes (hard-reject >600000-char avatar, Zod-generated 400 message text) and the `>=` vs `.max()` boundary divergence at exactly N=600000. |
| T3 web consumers | `6ba5925` | Four web callers typed against shared interfaces. `PROFILE_AVATAR_DATA_URL_REGEX` lifted into `shared/contracts/http/qrcodes/types.ts` so both sides reference one RegExp. No Zod in web bundle (verified via `grep -r zod web/.next/server/app/` → empty). |
| fix (bonus) | `21542a0` | WS types mirror in `supabase/functions/_shared/contracts/ws/types.ts` was stale since M2-WS-OPT (`3ba186d`). Re-synced via `scripts/sync-contracts.mjs` — pure generated diff, no semantic change. |
| T4 README + sync-check decision | `23e47f1` | `shared/contracts/README.md` makes the "no supabase sync for `http/` in Wave 1" decision explicit. Zero CI diff (plan §T4 requirement). |
| T5 qrclaw-map recipe | `f7f8dab` | `.claude/skills/qrclaw-map/map.md` gains "How to add a new HTTP endpoint" (6-step recipe + error-shape + `.strict()` gotchas) and a cross-cutting contracts row for `shared/contracts/http/`. |
| C1 prettier closeout | `292f43f` | Repo-wide `prettier --write`: 21 files (8 Wave 1 artefacts + 13 pre-existing M2 drift) — no behavioural change. |
| C1 vitest alias fix | `58ee432` | T3 introduced `@shared/contracts/*` imports into `web/src/lib/subscribe.ts`; vitest resolves independently of Next.js tsconfig paths, so mirrored the alias in `tests/vitest.config.ts`. Caught by final suite run (6 `cta-subscribe` failures → 0). |

**13 commits** total (plan expected 7–8; delta explained by two inlined review fixes, two independently-authored docs commits from T2d review, one pre-existing sync drift cleanup, and two closeout fixes at C1).

### Drift ledger (from plan §2)

| Drift | Endpoint | Resolved by | Status |
|---|---|---|---|
| A — visitor-ws-ticket body typed loosely on web | `/api/visitor-ws-ticket` | T2a + T3 | Resolved |
| B — messages body inline anonymous object on web | `/api/messages` | T2b + T3 | Resolved |
| C — create-qrcode template enum not enforced on web | `/api/create-qrcode` | T2d + T3 | Resolved (Zod enforces; `WizardData.template` still typed `string` — minor, tracked in T3 review NIT-1/2) |
| D — subscribe 254 constant + regex duplicated | `/api/subscribe` | T2c + T3 | Resolved for the length constant; `EMAIL_REGEX` on web is intentionally retained per plan §4 T2c (looser client-side UX check; server-side `.email()` is authoritative) |
| E — create-qrcode 600000 cap + regex duplicated | `/api/create-qrcode` | T2d + T3 | Resolved (single constant + single regex in `shared/contracts/http/qrcodes/types.ts`) |
| F — system_prompt 1000-char silent truncation | `/api/create-qrcode` | T2d (partial) | Constant lifted; schema enforcement deferred behind `PHASE2_STRICT_SYSTEM_PROMPT` gate (see Follow-ups in the T2d section below) |
| G — Edge Function `claim-agent` contract unification | `PATCH /functions/v1/claim-agent` | — | Out of scope for Wave 1 (per plan §1.3). Candidate for Wave 1b or Phase 2 Wave 2. |

### Deviations from plan

1. **Subscribe does not use `validateRequest` middleware** (plan §4 T2c was ambiguous here). Decision: preserve the legacy `{ success: false, error: string }` response shape used by the landing-page client. Documented in the T2c commit body and code-review sign-off.
2. **`system_prompt` schema has no `.max(1000)`** (plan §4 T2d line 429 said apply it; line 436 said defer via gate). Resolution: follow line 436 — keep Wave 1 a pure refactor. Constant is lifted and ready for flip. Decision documented at dispatch time and in commit `3153d46`'s body.
3. **Extra bonus commit `21542a0`** fixed a WS types mirror drift unrelated to Wave 1 scope, surfaced by T4's `sync-contracts --check` verification. Kept as a separate commit so git history stays honest about the root cause (M2-WS-OPT forgot the sync).
4. **`create-qrcode-direct.ts` left alone** (web fallback path has its own `VALID_QR_TEMPLATES` Set and `SYSTEM_PROMPT_MAX = 1000`). Plan T3 allowlist explicitly excluded it; flagged by code-reviewer NIT-3 in T2d and carried into the follow-ups backlog.
5. **`.strict()` on all new schemas** (plan §5.4 recommended, T2a–d applied). Verified safe by grepping each web call site before landing. No behaviour change.

### Six-pane verification (final — all green)

| Pane | Command | Result |
|---|---|---|
| 1 Prettier | `npm run format:check` | All matched files use Prettier code style |
| 2 Contracts sync (ws) | `node scripts/sync-contracts.mjs --check` | No drift (exit 0) |
| 3 Gateway tsc+build | `cd gateway && npm run typecheck && npm run build` | Both clean (exit 0) |
| 4 Web tsc | `cd web && npx tsc --noEmit` | Clean (exit 0) |
| 5 Vitest | `cd tests && npx vitest run` | 79 files, 807 passed, 1 todo, 0 failed, 0 type errors |
| 6 CI YAML | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | `ci.yml ok` |

Test delta vs pre-Wave-1: ~750 → 807 (+57 new unit tests: validateRequest middleware + 4 schema parity suites + regression locks on boundary cases).

### Known follow-ups (carried forward)

See plan §9 for the full list. Active items relevant to Wave 2 / later waves:

- `PHASE2_STRICT_SYSTEM_PROMPT` gate flip (Drift F closeout).
- Tighten `WizardData.template` / `TEMPLATE_CARDS.id` from `string` to `QrTemplate` (T3 NIT-1/2).
- Lift `create-qrcode-direct.ts` onto shared constants (T3 out-of-scope sighting).
- Edge Function contract unification (Drift G — `claim-agent`). Candidate for Wave 1b.
- Outbound WS Zod (Phase 2 Wave 2).

---

## 2026-04-20 — Phase 2 Wave 1 T2d: create-qrcode shared contracts

Drift C (template enum): `QR_TEMPLATES` lifted to `shared/contracts/http/qrcodes/types.ts`, Zod `.enum()` enforced at gateway schema level. Drift E (avatar cap): `PROFILE_AVATAR_MAX_DATA_URL_CHARS = 600_000` lifted to shared; `gateway/src/routes/create-qrcode-avatar.ts` imports it. Drift F (system_prompt cap): `SYSTEM_PROMPT_MAX_LENGTH = 1000` lifted as constant but schema-level `.max()` intentionally NOT applied in Wave 1. `PHASE2_STRICT_SYSTEM_PROMPT = false` gate at `gateway/src/routes/create-qrcode.ts`; flip to true (and extend `createQrcodeRequestSchema`) once analytics confirm no legitimate >1000-char submissions.

### Follow-ups

- 2026-04-20 Drift F (system_prompt cap): Wave 1 T2d deferred the schema-level `.max(1000)` enforcement. `PHASE2_STRICT_SYSTEM_PROMPT` flag lives at `gateway/src/routes/create-qrcode.ts`. Flip to true (and extend `createQrcodeRequestSchema`) once analytics confirm no legitimate >1000-char submissions.

### Intentional behavior changes (documented at review time)

- **`profile_avatar` > 600000 chars now returns 400 (hard reject).** Before T2d the request would succeed and silently drop the avatar with a `profile_avatar_rejected` warning. The web client pre-filters at `< 600000` (`web/src/app/(dashboard)/qrcodes/create/page.tsx:1521`), so this is transparent to today's callers. Direct API consumers (Agent SDK tool D3, future integrations) should rely on the schema constant `PROFILE_AVATAR_MAX_DATA_URL_CHARS`.
- **Boundary divergence at `profile_avatar` length === 600000.** Schema uses `.max(N)` (accepts exactly N); decoder at `gateway/src/routes/create-qrcode-avatar.ts:43` uses `>= N` (rejects exactly N). The decoder is the stricter boundary and wins — at exactly 600000 chars the QR is still created with a soft warning, matching pre-T2d semantics. Documented in `shared/contracts/http/qrcodes/protocol.ts`. Future maintainers who remove the decoder check must change the schema to `.max(N - 1)` to preserve this.
- **400 error `message` text changed.** Error `code` is still `invalid_request` and HTTP status is still `400`, but the human-readable `message` is now Zod-generated (e.g. `"Validation failed at agent_id: agent_id is required"` instead of `"agent_id is required"`). Clients checking `error.code` are unaffected; clients parsing `error.message` should treat it as opaque text.

---

## 2026-04-20 — M2-DASH-FE: Dashboard 多 agent 管理 UI

### 范围

Plan §12.4.1 任务卡 M2-DASH 的前端部分。在 `/settings/agents` 页面接通 M2-DASH-BE（Edge Function `claim-agent` + `manage-agents`），让用户可以完整进行 agent 生命周期：创建 → 查看在线状态 → 编辑（name / description / account_label）→ 重生成 API key（一次性展示）→ 归档（soft delete）。

### 新建文件

| 文件 | 行 | 说明 |
|---|---|---|
| `web/src/lib/api/agents.ts` | 257 | `createAgent / updateAgent / regenerateAgentKey / archiveAgent` + `ApiError` + `friendlyAgentError` 错误码映射。调用前先 `getUser()` 远端验证 session，再取 `access_token`；15 s AbortController 超时；`{ error: { code, message } }` envelope 解析 |
| `web/src/components/ui/Dialog.tsx` | 192 | 通用模态：`createPortal(→ document.body)`，ESC / overlay / × 关闭，打开时 `body.overflow='hidden'`，焦点 RAF 打到首个可交互元素、关闭时还原到触发元素，`aria-labelledby` 绑定标题 |
| `.../agents/CreateAgentDialog.tsx` | 128 | 创建 agent 表单：name（≤ 255，trim 非空）→ `createAgent()` → 切换到 reveal |
| `.../agents/EditAgentDialog.tsx` | 242 | name / description / account_label；prefilledRef + 父层 `key={id}` 保证 prefill 仅在 open false→true 一次（refetch 不覆盖用户编辑） |
| `.../agents/ApiKeyRevealDialog.tsx` | 208 | 一次性明文 API key 展示：monospace 字号放大、Copy（clipboard + `aria-live` 反馈 + setTimeout 清理）、红色警示条、"I have saved" 复选框强制勾选才能关闭；ESC / overlay / × 全部禁用 |
| `.../agents/ConfirmArchiveDialog.tsx` | 116 | 归档确认，红色 "Archive" 按钮 |
| `.../agents/RegenerateKeyConfirmDialog.tsx` | 116 | 重生成确认（两步：先 confirm → 成功后切 reveal） |
| `tests/unit/frontend/agents-api.test.ts` | 273 | 17 case：4 个 action × 成功 / 错误 / unauth / revoked token，friendlyAgentError mapping |
| `tests/unit/frontend/Dialog.test.tsx` | 126 | 8 case：open / ESC / overlay / × / body.overflow lock |
| `tests/unit/frontend/ApiKeyRevealDialog.test.tsx` | 88 | 4 case：强制勾选复选框、copy、ESC 禁用 |

### 修改文件

| 文件 | 说明 |
|---|---|
| `web/src/app/(dashboard)/settings/agents/page.tsx` | 248 → 776 行完整重写：active/pending section + archived 折叠区、行级 "⋯" popover (Edit / Regenerate / Archive)、online badge（绿点 Online / 灰点 Last seen / 灰点 Never）、空态 "Create your first agent" CTA |
| `web/src/hooks/useAgents.ts` | select 扩展 description / account_label / updated_at / claimed_at；generation counter race guard；客户端排序 archived 沉底 |
| `web/src/components/ui/index.ts` | export Dialog |

**未动**：后端 Edge Function、migrations、gateway、现有 UI primitive（Button/Input/Avatar/Badge）。

### UX 决策

- **一次性 api_key reveal** 走强制确认：复选框 "I have saved this API key. I understand it will not be shown again." 勾选前所有关闭路径（ESC / overlay / × / 底部按钮）均禁用。防止用户误关丢 key。
- **归档区默认折叠**：active 列表更常用；archived 作为历史归档避免视觉噪音。
- **Regenerate 两步**：先单独确认 dialog（解释会立刻失效旧 key）→ 成功后切换到 reveal dialog。误点不可逆所以加一道。
- **archived 行无操作菜单**：后端会 409 `invalid_state` 拦截 update/regenerate/archive，前端 UI 同步不渲染 "⋯"。
- **操作菜单 pattern**：自定义 popover（按钮 + 透明 fixed overlay 捕获外部点击 + 绝对定位菜单 + `role="menu"` / `role="menuitem"` + `aria-haspopup` / `aria-expanded`）。未用 `<details>` 因语义偏"展开折叠"非"菜单"。
- **online badge**：`status='archived'` → "Archived"；`ws_connected` → 绿点 "Online"；`last_seen_at` 有 → 灰点 "Last seen Xm ago"；否则 "Never connected"。

### Review

并行 **code-reviewer** + **React-best-practices** 审查：

| Reviewer | Verdict | 发现 |
|---|---|---|
| code-reviewer | APPROVE-WITH-FOLLOWUPS | 0 BLOCKER / 0 CRITICAL / 4 MAJOR / 6 MINOR / 4 NIT |
| react-best-practices | REQUEST-CHANGES | 5 MUST-FIX / 8 SHOULD-FIX / 7 NICE-TO-HAVE |

### Review round-1 修复（本 PR 闭环）

| # | Source | 位置 | 修复 |
|---|---|---|---|
| FIX-1 | MUST #1 | `EditAgentDialog.tsx` + page `key` | prefilledRef + 父层 `key={editAgent?.id}` 保证 prefill 仅在 open false→true 一次，refetch 不覆盖用户输入 |
| FIX-2 | MUST #2 | `Dialog.tsx` | effect 只依赖 `[open]`，`onClose` / `closeOnEsc` 走 `useRef` 同步，避免父 rerender 抢焦点 |
| FIX-3 | MUST #3 | `ApiKeyRevealDialog.tsx` | `setTimeout` 走 `copiedTimeoutRef`，unmount / close / 并发 copy 都 cleartimeout |
| FIX-4 | MUST #4 | `Dialog.tsx` | `createPortal(→ document.body)` + `mounted` ref SSR-safe，避开祖先 `transform` / `overflow` 裁切 |
| FIX-5 | MUST #5 | `useAgents.ts` | `requestIdRef` generation counter，只有最后一次 fetch 的 setState 生效，防快速连点 race |
| FIX-6 | MAJOR-1 | `agents.ts` | `getUser()` 远端验证先行，再取 `access_token`，过期 token 立刻 throw `unauthenticated` |
| FIX-7 | SHOULD-FIX #6 | `Dialog.tsx` | 关闭时 `previouslyFocused?.focus()` 还原焦点到触发元素（a11y） |
| FIX-8 | SHOULD-FIX #7 | `Dialog.tsx` | `aria-labelledby={titleId}` 替代 `aria-label`，屏幕阅读器读真实标题节点 |
| FIX-9 | NIT-1 | `Dialog.tsx` | 移除 overlay `role="presentation"`（与 onClick 语义冲突） |

新增 1 个测试用例（`throws unauthenticated when getUser() returns an error / revoked token`）。

### Follow-ups（归 next milestone / 另卡）

| 优先级 | 项 | 理由 |
|---|---|---|
| MAJOR | `friendlyAgentError` passthrough message 截断长度 / 过滤 HTML | 纯防御：后端未来若引入 debug info 不会裸露 |
| MAJOR | apiKey state 生命周期契约文档化 | 注释补充：key 只在 revealState 内，null 化即被 GC |
| MINOR | Dialog 完整 focus trap | 当前仅 focus 首元素，Tab 会跳出；建议 `focus-trap-react` |
| MINOR | `page.tsx` 776 行拆分 `AgentRow` / `AgentList` / `OnlineBadge` 到独立文件 | 组织优化 |
| MINOR | inline style 抽取 `dialogStyles` 常量 / `<DialogError>` / `<DialogButtonRow>` atoms | 5 个 dialog 间重复 |
| MINOR | 补充测试：timeout / non-JSON response / clipboard API failure / prefill-once 时序 | 覆盖缺口 |
| MINOR | `useAgents` 排序注释修正（Postgres collation 不稳，客户端排序为准） | 防误读 |
| NIT | copy 失败 UI 反馈（非 HTTPS / iframe 下 clipboard 失败无提示） | 低频场景 |
| NIT | `agentName` 引号转义（纯视觉） | 极低频 |
| SHOULD-FIX | RSC 拆分（`page.tsx` Server Component 预取 + `AgentsClient.tsx` 客户端岛） + `export const metadata` | 首屏 FCP/TTI，依赖较大改动 |
| NICE-TO-HAVE | 接入 `@tanstack/react-query` 替代自搓 loading/error/refetch | 架构选择 |
| NICE-TO-HAVE | React 19 `useOptimistic` / `useTransition` / Server Actions | 架构选择 |

### 验证

| 检查 | 结果 |
|---|---|
| `cd web && npm run lint` | 0 errors / 13 warnings（与 main baseline 完全一致，未新增任何 warning） |
| `cd web && npm run build`（需 env 占位） | 25 routes，`/settings/agents` 静态生成 PASS |
| `cd tests && npx vitest run` | **758 passed / 1 todo / 74 files**（基线 728 → 758，新增 30 个用例全通过；无回归） |

---

## 2026-04-20 — M2-DASH-BE: Dashboard 多 agent 管理后端

### 范围

Plan §12.4.1 任务卡 M2-DASH 的后端部分（用户选 B 全量版）。为 dashboard 多 agent 管理 UI 提供后端基础设施：`agents.account_label` 字段、agent 更新 / token 重生成 / soft-delete 三个操作。前端 UI 由后续卡 M2-DASH-FE 完成。

### 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `supabase/migrations/20260420_m2_agents_account_label.sql` | **NEW** — `ALTER TABLE agents ADD COLUMN account_label TEXT` + 扩 `agents_status_check` 接受 `'archived'` | 46 |
| `supabase/migrations/20260420_m2_agents_account_label_check.sql` | **NEW** — `CHECK (account_label IS NULL OR length(account_label) <= 128)` DB 层兜底 | 20 |
| `supabase/functions/manage-agents/index.ts` | **NEW** — Edge Function，3 action：update / regenerate_key / delete；已部署 ACTIVE v2 | 401 |
| `supabase/types/database.types.ts` | 重生成：agents.account_label 字段 | +4 / -1 |

**未动**：`supabase/functions/claim-agent/index.ts`（已稳定，职责分离）。

### API 契约

```
POST /functions/v1/manage-agents
Authorization: Bearer <supabase_user_jwt>

// action=update
body: { action:'update', agent_id, name?, description?, account_label? }
response 200: { data: { id, name, description, account_label, status, updated_at } }

// action=regenerate_key
body: { action:'regenerate_key', agent_id }
response 200: { data: { agent_id, api_key, api_key_prefix, regenerated_at } }

// action=delete (soft: status='archived' + api_key_hash 吊销为 sentinel)
body: { action:'delete', agent_id }
response 200: { data: { agent_id, status:'archived', archived_at } }

// 错误码
400 invalid_request / 401 unauthorized / 404 not_found（含 403 IDOR 情况）
405 method_not_allowed / 409 invalid_state / 500 internal_error
```

### 关键决策

1. **新建 `manage-agents` 而非扩展 `claim-agent`**：职责分离，claim-agent 保持稳定（注册 / confirm 单次路径），manage-agents 承担 CRUD。攻击面、审计需求、字段校验都不同，分 function 便于独立监控/限流。
2. **Soft delete 走 `status='archived'`**：硬删会触发 `qrcodes → agents ON DELETE CASCADE` 毁灭性级联（删掉二维码 + conversations + encryption_keys + messages）。`agents_public` 视图天然过滤 `active`，archived agent 自动从 visitor 页消失。
3. **archived 时 `api_key_hash` 设为 sentinel `revoked-<uuid>`**（因 NOT NULL 不能设 NULL）：立即吊销 key，所有 Gateway auth 路径无法通过 hash 比对。
4. **HTTP method 统一 POST + action 字段**：避免和 claim-agent 的 POST/PATCH 分法混淆；delete 是 update status 的特例，HTTP DELETE 语义反而误导。
5. **Ownership 验证**：`authenticateOwner → owners.user_id = auth.uid() → owner.id = agents.owner_id`。Body 中的 owner_id 从不被信任。service-role client 只做跨表 join，application 层完整 authz。

### 安全 checklist

- [x] JWT 服务端验证（`getUser(token)`，非本地 decode）
- [x] Ownership 双重链路（user → owner → agent），body 零可信字段
- [x] action 严格 whitelist（`===` 比较 3 字面量）
- [x] agent_id UUID 格式正则拦截
- [x] api_key 明文只在 regenerate_key 响应返回一次，console.error 路径不含明文
- [x] 新 api_key_hash 先持久化再返回响应
- [x] IDOR hardening：存在但不属于我 → 404（与不存在一致，防枚举）
- [x] API key 生成用 rejection sampling（消除 `256 % 62` modular bias）
- [x] CORS 硬编码单域名（复用 `_shared/cors.ts`）
- [x] Security headers：`X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY`
- [x] archived agent 在 Gateway ticket 端点被阻断（ticket.ts:114 `status !== 'active'` 已存在）
- [x] DB 层 account_label 长度约束（defense-in-depth）

### Review 流程

并行 **security-reviewer** + **database-reviewer**：

| Reviewer | Verdict | Findings |
|---|---|---|
| database-reviewer | **APPROVE** | 4 MINOR/NIT，无阻塞 |
| security-reviewer | **APPROVE-WITH-FOLLOWUPS** | 0 BLOCKER / 3 HIGH / 5 MEDIUM / 2 LOW |

### Review round-1 修复（本 PR 内闭环）

| # | Severity | 修复 |
|---|---|---|
| FIX-1 | HIGH-1 | `handleDelete` 同时 set `api_key_hash: 'revoked-<uuid>'`（NOT NULL 不允许 NULL，用 sentinel） |
| FIX-2 | MEDIUM-2 | 三处 ownership check 合并 `403 → 404`，防 IDOR UUID 枚举 |
| FIX-3 | MEDIUM-4 | 独立 migration 追加 `account_label` DB 层 CHECK 约束 |
| FIX-4 | MEDIUM-1 | `generateApiKey` rejection sampling（`buf[0] < 248` 丢弃） |

Edge Function v1 → v2，已部署 ACTIVE。回归 728 passed / 1 todo（基线一致）。

### Follow-ups（归 M3 / 另卡，不阻塞本 PR）

| 优先级 | 项 | 归属 |
|---|---|---|
| **HIGH** | Gateway WS 鉴权路径追加 `status='archived'` 拒绝 + 现有连接主动 `ws.close(4003)` | M2-WS-TEARDOWN 或并入 M3-WS |
| **HIGH** | `manage-agents` 审计日志（`usage_logs` / `audit_logs` with `actor/IP/diff`） | M3 observability |
| **MEDIUM** | `regenerate_key` 速率限制（Supabase Edge 无原生限流，考虑 Gateway 前置 / `pg_cron` 计数） | M3 security hardening |
| MINOR | `idx_agents_status` partial index 条件更新（`WHERE status IN ('active','pending')`） | 表规模 >1k 行时重建 |
| NIT | `handleDelete` idempotent 分支的冗余 PK 查询合并 | 无需处理 |
| NIT | `api_key_prefix` 列持久化（若产品需要在 dashboard 显示） | 产品决策 |

注：Gateway ticket.ts:114 已在颁发 ticket 时过滤 `status !== 'active'`，archived agent 的**新**连接已阻断。Follow-up "现有连接断连" 是 defense-in-depth。

### 验证

| 检查 | 结果 |
|---|---|
| `supabase/migrations/20260420_m2_agents_account_label.sql` via MCP `apply_migration` | PASS |
| `supabase/migrations/20260420_m2_agents_account_label_check.sql` via MCP `apply_migration` | PASS |
| Edge Function `manage-agents` v2 via MCP `deploy_edge_function` | ACTIVE |
| `cd gateway && npm run typecheck` | PASS (0 errors) |
| `cd web && npm run build` | PASS (25 routes, 0 TS errors) |
| `cd tests && npx vitest run` | 728 passed / 1 todo / 71 files — 与基线一致，零回归 |

---

## 2026-04-20 — M2-GW-FANOUT: Gateway fanout 抽象层

### 范围

Plan §12.4.3 任务卡 M2-GW-FANOUT。把 gateway WS 路由的 forward 调用统一抽到 `fanout.ts`，direct 场景走 in-memory fast-path，group/topic 场景保留 API 占位。**仅抽象、不改行为**。

### 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `gateway/src/ws/fanout.ts` | **NEW**，暴露 `fanoutFrame(target, frame)` + 搬迁 `sendSafe` / `MAX_BUFFER_SIZE` | 125 |
| `gateway/src/ws/router.ts` | 5 处 forward call site 统一走 fanout；清理未用 import；反向 import `sendSafe` | +41 / -78 |
| `tests/unit/gateway/fanout.test.ts` | **NEW**，13 cases（sendSafe 4 + direct-to-agents 4 + direct-to-visitor 3 + multi 2） | 218 |

### API 形状

```ts
export type FanoutTarget =
  | { kind: 'direct-to-agents'; qrCodeId: string }       // V→A direct
  | { kind: 'direct-to-visitor'; sessionToken: string }  // A→V direct
  | { kind: 'multi'; conversationId: string };           // 群聊/话题占位

export interface FanoutResult {
  delivered: number;
  recipientCount: number;
  fastPath: boolean;
}

export const fanoutFrame = (target: FanoutTarget, frame: WSFrame): FanoutResult;
```

- direct-* 走 in-memory registry Map，**不查 DB**
- `multi` throw `Error('FANOUT_NOT_IMPLEMENTED: ... plan §5.1 L1.7 / M5+')`——M2 阶段任何 caller 触发 multi 都是编程错误；fail-soft 会让未来 M5+ 出现消息静默丢失（违反 C5）
- discriminated union + `const _exhaustive: never` 保证未来加 kind 时 TS 立即编译失败

### Router 改造（5 处 forward site）

| Handler | Before | After |
|---|---|---|
| `handleVisitorMessage` | `forwardToRecipients(agentEntries.map(e=>e.ws), frame)` + `if (!forwarded)` fallback | `fanoutFrame({kind:'direct-to-agents', qrCodeId}, frame)` + `if (fanoutResult.delivered === 0)` |
| `handleAgentMessage` | `forwardToRecipients([visitorEntry.ws], {…envelope})` | `fanoutFrame({kind:'direct-to-visitor', sessionToken: conversationId}, {…envelope})` |
| `handleStreamChunk` | `sendSafe(visitorEntry.ws, JSON.stringify(chunkFrame))` | `fanoutFrame({kind:'direct-to-visitor', …}, chunkFrame)` |
| `forwardStreamEndToVisitor` (error fallback) | `sendSafe(visitorEntry.ws, endFrame)` | `fanoutFrame({kind:'direct-to-visitor', …}, endFrame)` |
| `handleStreamEnd` happy path | `sendSafe(visitorEntry.ws, JSON.stringify(enveloped endFrame))` | `fanoutFrame({kind:'direct-to-visitor', …}, enveloped endFrame)` |

### 验证

| Check | Result |
|---|---|
| `cd gateway && npm run typecheck` | 0 error |
| `cd gateway && npm run build` | 0 error |
| `cd tests && npx vitest run unit/gateway/fanout` | 13 / 13 passed |
| `cd tests && npx vitest run integration/ws` | 21 / 21 passed（基线 21 零回归） |
| `cd tests && npx vitest run` 全量 | 728 passed / 1 todo（M2-WS-OPT 基线 715 + fanout 新 13） |
| `git status` 改动文件 | 仅 3 个 plan write-allowed 文件 |

### 偏离 / 跟踪项

- **DEV-6**：Plan §12.4.3 API 形状 `fanoutToConversation(conversationId, frame)` **不可行**——现网 `conversation_id` 在 payload 里 = visitor `sessionToken`（不是 DB `conversations.id`），单一 `conversationId` 字符串无法区分 V→A 方向（用 `qrCodeId`）与 A→V 方向（用 `sessionToken`），更无法走 fast-path。实现改为 `fanoutFrame(target: FanoutTarget, frame)` tagged union，未来 multi kind 落地时保留 `conversationId` 语义。建议 plan errata 采纳新形状。
- **DEV-7**：Plan mission 文字 "1 visitor + 1 agent" 不准。现网 V→A 已经支持 N agents（`forwardToRecipients(agentEntries.map(e=>e.ws), …)` 多 agent 同时 forward），A→V 才是单 visitor。本卡保留并延续现状。
- **DEV-8**：Plan Mission 字面只点 `deliverToConversation`（= `forwardToRecipients`，仅 V→A / A→V 两处）；实现统一了 **5** 个 forward 站点（+3 处 raw `sendSafe`：stream_chunk / stream_end happy / stream_end error fallback）。reviewer 一致同意"所有 forward 统一入口"是架构正确方向，但超出 plan 字面。
- **DEV-9**：`sendSafe` + `MAX_BUFFER_SIZE` 所有权从 router.ts 迁到 fanout.ts 并 export。`sendAck` / `sendError` 反向 import from `./fanout.js`。这个迁移让 `[Router]` log 前缀中的 buffer-full warn 变成 `[Fanout]`——告警 grep 规则如依赖前缀需更新。
- **DEV-10 (perf marker 微偏)**：`handleStreamChunk` 的 `markStep(span, 'route_lookup')` 位置从"lookup 之后"移到"fanout 之前"，导致该 step 耗时数据 ≈ 0（lookup 合并计入 'forward' 区间）。不影响客户端，仅影响内部 perf tracing 自身统计。其余 3 个 handler 保持原位。
- **DEV-11 (M5+ follow-up, pre-existing race)**：`handleVisitorMessage` 的 offline-queue pre-check（`getAgentForQrCode` 空数组 early return）+ fanout 内部 lookup 构成双重 lookup。两次 lookup 之间有一个 `await getSystemPrompt(qrCodeId)` async gap，理论上 agent registry 可能在 gap 期间变化，导致罕见的"既入队又转发"重复投递。该 race **pre-existing**（本卡之前 `forwardToRecipients` 已有同样 gap），不是本卡引入。修复需统一用 `fanoutResult` 判断并删除 pre-check，同时接受两条 console.log 文案合并。留作独立卡。
- **DEV-12 (pre-existing Security Envelope 不一致)**：`forwardStreamEndToVisitor` 错误 fallback 路径不注入 Security Envelope；`handleStreamEnd` happy path 注入。这个不一致 pre-existing，本卡统一走 fanout 后更显眼，但 fanout 不解析 payload、也不注入 envelope（职责单一）。留作独立 follow-up。
- **DEV-13**：MessageFrame 下行帧 fanout 已走但仍无 outbound zod 校验——承接 DEV-1（M2-WS-OPT），等 Phase 2 Wave 2 outbound barrel 立项时一起补。

### 审查反馈应用（M2-GW-FANOUT review wave）

- **0 BLOCKER**；spec-compliance + code-reviewer 双盲审均 APPROVE-WITH-NITS
- 应用 MINOR-1（清理 router.ts 中未用的 `getVisitorsForQrCode` / `getConnection` import）
- 未应用 MAJOR-1（fanoutResult 被忽略）：纯可观测性级别，当前 stream_chunk / agent_message 是 best-effort，不影响正确性；如需 delivered=0 metric，另开观测卡
- 未应用 MAJOR-2（pre-check race）：pre-existing 问题（见 DEV-11），修复需要合并两条 offline-queue 分支语义，超出"仅抽象、不改行为"约束
- 未应用 NIT-2（error code 常量提取）、NIT-3（emoji 注释）：低优先级不阻塞

### 开放决策（reviewer 拍板）

| Q | 决策 | 理由 |
|---|---|---|
| Q1 `sendSafe` 迁到 fanout 是否合理？ | ✅ 合理 | 唯一 send primitive；router → fanout 正向依赖避免循环 |
| Q2 `multi` kind throw vs fail-soft？ | ✅ 保持 throw | C5 消息可回放约束；fail-soft 会让未来静默丢消息 |
| Q3 stream_end error fallback 是否走 fanout？ | ✅ 合理统一 | 防止未来 metrics/tracing 漏报 |

---

## 2026-04-20 — M2-WS-OPT: 协议 optional 字段落地

### 范围

Plan §12.4.2 任务卡 M2-WS-OPT。在 WS 协议契约层为 `MessageFrame`（gateway → client 下行）和 `AgentMessageFrame`（agent → gateway 上行）各加两个 optional 字段：

- `reply_to_message_id?: string`
- `thread_id?: string`

并在 `agentMessageSchema`（inbound zod）层用 `messageIdSchema.optional()` 落实运行时校验。Visitor 端**不**扩展，因为移动端 MVP 仅线性聊天（plan §10 D9 约束）。

### 改动文件

| 文件 | 改动 | 行数 |
|---|---|---|
| `shared/contracts/ws/types.ts` | `AgentMessageFrame.payload` + `MessageFrame.payload` 各加 2 个 optional 字段 + 三处中文注释（VisitorMessageFrame "故意不加"、AgentMessageFrame 字段级预留说明、MessageFrame "无 outbound zod" 提醒） | +12 / -2 |
| `shared/contracts/ws/protocol.ts` | `agentMessageSchema.payload` 内加 `reply_to_message_id: messageIdSchema.optional()` + `thread_id: messageIdSchema.optional()` | +2 |
| `tests/unit/shared/contracts-ws-protocol.test.ts` | 新增 6 个 case：accept reply_to / accept thread_id / reject oversized reply_to / reject oversized thread_id / accept both / reject visitor_message with reply_to_message_id（守住 visitor 不扩展边界） | +71 |

### 验证

| Check | Result |
|---|---|
| `cd gateway && npm run typecheck` | 0 error |
| `cd web && npm run build` | 0 error（implementer 在 placeholder env 下确认；CI 同源） |
| `cd tests && npx vitest run unit/shared/contracts-ws-protocol` | 52 passed / 0 type error |
| `cd tests && npx vitest run` 全量回归 | 70 files / 715 passed / 1 todo / 0 type error（M1 基线 709 → +6 新 case） |
| `git diff --stat` | 仅 3 文件，全在 plan write-allowed 列表 |
| Forbidden 项检查 | 无 buttons/reactions/media；字段全 optional；gateway/** 零改动；零新依赖 |

### 偏离 / 跟踪项

- **DEV-1 (A3 / E2)**：Plan §12.4.2 假设 `shared/contracts/ws/outbound.ts` 存在，但 Phase 2 Wave 2 outbound barrel **未落地**（仓库 `ls shared/contracts/ws/` 仅 `index.ts protocol.ts types.ts`）。本卡因此跳过"为 `MessageFrame` 加 outbound zod schema"子任务。`MessageFrame.payload` 注释已显式标注此 gap，待 Phase 2 Wave 2 outbound barrel 立项后补齐。Phase 1 已知 follow-up 列表（本文件第 435 行）也覆盖了这一点。
- **DEV-2 (A2)**：Plan mission 文字只点名 outbound `MessageFrame`，但 implementer 同时为 inbound `AgentMessageFrame` 加同名 optional 字段。语义对称（agent 端发出引用回复需要这两个字段，否则下行 `MessageFrame` 永远拿不到值），属合理超范围。
- **DEV-3 (B4)**：Acceptance 中"Playwright smoke：web 收到带 reply_to_message_id 的 mock 帧不 crash"未实跑。替代证据：reviewer 静态确认 `web/src/lib/ws/client.ts` 的 `case 'message'` 与 `web/src/hooks/useWebSocket.ts:110-120` 均使用 destructure 白名单读取（仅 `content / content_type / sender_type / id / timestamp`），多余 optional 字段 JS 静默忽略。Smoke E2E 推迟到 Phase 2 Wave 2 outbound 校验立项时合并跑。
- **DEV-4**：Plan brief 列出的 `web/src/components/chat/MessageBubble.tsx` 在仓库实际不存在（实际位于 `web/src/components/ui/MessageBubble.tsx`，且组件本身不消费 WS payload）。本卡未改 MessageBubble，下次写 plan 路径应基于真实 Glob。
- **DEV-5（M2-GW-FANOUT 应处理）**：`gateway/src/types/index.ts` 私有 `MessageFrame`（缺新两个字段，多 `security_envelope?`）已与 `shared/contracts/ws/types.ts` 分叉。本卡 gateway/** 是 read-only 不能动；下个卡 M2-GW-FANOUT 改 `router.ts` 时应顺手把 gateway 私有 MessageFrame 替换成 `@shared/contracts/ws/types` re-export，否则两份定义将长期漂移。

### 审查反馈应用（M2-WS-OPT review wave）

针对 spec-compliance reviewer 与 code-reviewer 双盲审查：

- **0 BLOCKER**，2 个 reviewer 均 APPROVE
- 应用了 MINOR-1（VisitorMessageFrame 加"故意不加"注释）、MINOR-2（thread_id 超长 fail case）、MINOR-3（同时带两字段 happy-path）、NIT-1（注释下移到字段级）、MAJOR-1 信息性（MessageFrame 加"无 outbound zod"注释）
- 未应用 NIT-2（zod `.uuid()` 强校验）：DB 列已是 `UUID` 类型形成第二道防线，且 MVP 阶段字段始终 undefined；启用群聊/话题特性时另立卡补
- 未应用 NIT-3（M2-WS-OPT 缩写术语统一）：低优先级，不阻塞

---

## 2026-04-20 — M1: 多 agent 数据层 + 群聊/话题 DB 预留

**Plan 参考**：`docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` v1.3 §12.3.1 + §12.3.2

### 决策与落地总览

| Task Card | 规划 | 实际落地 | 产物 |
|---|---|---|---|
| **M1-DB-AGENTS**（多 agent 数据层） | 新建 `agent_connections` 表 + `agents` 多 owner 迁移 | **选 B：零 migration** — 调研后确认 `agents.owner_id` 无 UNIQUE 约束、`ws_connected/last_seen_at` 已覆盖在线态需求，建独立表反而引入双源同步风险 | `docs/refactor/m1-agents-state.md` 备忘录 + plan §12.3.1 打 "v1.3 执行落点" 标 |
| **M1-DB-RESERVE**（群聊/话题预留） | `conversations.kind/parent_conversation_id`、`messages.thread_id/reply_to_message_id`、新表 `conversation_participants` + RLS | 全部按规划交付，零索引除主键 + 1 个按 participant 反查的二级索引 | `supabase/migrations/20260420_future_group_topic_reserve.sql`（126 行）+ 重新生成 `supabase/types/database.types.ts` |

### B 方案（M1-DB-AGENTS）决策理由

1. `agents` 表早已支持 one owner → many agents（42 行 staging 数据里已存在 `owner_id` 重复）
2. 建 `agent_connections(is_online)` 会与 `agents.ws_connected` 构成双源同步，M2 Dashboard 读取逻辑要 join 反而更慢
3. 未来真需要独立表的触发条件（多实例 Gateway 部署 / 精确展示"哪条物理连接在线" / 严格分离 account_label vs name）写入备忘录 §2.3，届时再独立 migration
4. 节约 0.75 人日工期给 M2 代码层变更

### M1-DB-RESERVE 落地校验（staging 零回归）

| 校验项 | 预期 | 实际 |
|---|---|---|
| `conversations.kind` 分布 | 11 行 = `direct` | ✅ 11 direct / 0 other |
| `conversations.parent_conversation_id` | 11 行 NULL | ✅ 11 NULL |
| `messages.thread_id` | 307 行 NULL | ✅ 307 NULL |
| `messages.reply_to_message_id` | 307 行 NULL | ✅ 307 NULL |
| `conversation_participants` | 0 行 | ✅ 0 行（RLS 已启用） |
| Iron-rules 测试（C1/C2/C5 静态红线） | 7 passed + 1 todo | ✅ 7 passed + 1 todo |
| `gateway typecheck` | 0 errors | ✅ 0 errors |

### 同步文档修订

| 文件 | 变更 | 原因 |
|---|---|---|
| `CLAUDE.md` | 类型生成命令 `src/types/database.types.ts` → `supabase/types/database.types.ts`，同时指出 Supabase MCP `generate_typescript_types` 是更便捷的生成路径 | 原路径不存在于仓库；v1.3 起规范位置统一在 `supabase/types/` |
| `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §12.3.1 | 卡顶加 "v1.3 执行落点（2026-04-20）：按 B 方案零 migration 交付" | 让后续 agent 一眼看懂当前交付状态 |

### 偏离规划的 2 处（记录）

1. **M1-DB-AGENTS 的 Write-allowed 列表里没有 `docs/refactor/m1-agents-state.md`**
   - 原卡预期产出两份 migration + typegen，实际产出 1 份备忘录 + 更新 plan
   - 决议：备忘录是 B 方案的正式交付物，等价于 "0 行 migration SQL"，plan §12.3.1 的 Effort 已标 "0.25 人日"

2. **CLAUDE.md 被 M1 顺带修了一行命令**
   - 严格讲不在 M1-DB-RESERVE 的 Write-allowed 列表
   - 原因：`supabase gen types` 命令默认路径已失效，发现就应修；不修会让未来 agent 踩坑
   - 风险评估：同 M0 决议，为基础设施一致性的必要偏离

### Ticks

- [x] M1-DB-AGENTS（B 方案）现状备忘录落盘
- [x] M1-DB-AGENTS 落地确认：plan §12.3.1 + `docs/refactor/m1-agents-state.md`
- [x] M1-DB-RESERVE migration 应用到 `zyxqadubhwrnsoujiyir`（无错，现有数据零回归）
- [x] TypeScript types 重新生成到 `supabase/types/database.types.ts`
- [x] Iron-rules 测试通过（7/7 + 1 todo）
- [x] Gateway typecheck 通过
- [x] Commit + push 本地

### 审查反馈应用（2026-04-20 同日）

**Trigger**：M1 commit `e2163cd` 后派 `database-reviewer` subagent 审查，Ready to proceed（0 blockers）。对照 Supabase advisor 发现 2 条 WARN 级 `auth_rls_initplan`（就是审查 C-4 提到的）。

#### 即时修复（同 commit 不 amend，新 commit 追加）

| 审查 # | 严重度 | 动作 | 产物 |
|---|---|---|---|
| **C-4 + advisor WARN × 2** | WARN | RLS policy `auth.uid()` → `(SELECT auth.uid())`；DROP + CREATE 重建 2 条 policy | `supabase/migrations/20260420_m1_rls_optimize.sql`（apply 后复验 advisor 0 WARN） |
| **C-1** | 可接受风险，加注释 | 原 migration 第 1 段加幂等性说明（Supabase runner 内置保护，手动 `psql -f` 重跑会跳过 CHECK 创建） | 仅 SQL 注释，不改 DDL |
| **I-6** | INFO，保留 | 原 migration 加 2 处 `FUTURE-INDEX` 提示：`conversations.parent_conversation_id` / `messages.reply_to_message_id` 的 partial index 应在功能上线前先补（避免在大 `messages` 表上跑 `CREATE INDEX CONCURRENTLY`） | 仅 SQL 注释 |
| **C-2 / M-10** | Minor | `docs/refactor/m1-agents-state.md` §2.3 追加第 4 条 B → A 触发条件（per-QR-Code 在线态产品需求） | |

#### 留到 M2 处理（非阻塞）

| 审查 # | 动作 | 归属 Task Card |
|---|---|---|
| **I-8** | Gateway 所有 `conversations` 查询（`persist.ts:127`、`routes/messages.ts:48`）加 `.eq('kind', 'direct')` 过滤，避免未来群聊行污染 direct 查询路径 | **M2-GW-FANOUT** §12.4.3（fanout 抽象时顺带做）或 M2 新起 Task Card |

#### 留到群聊/话题功能上线前处理

| 审查 # | 动作 |
|---|---|
| I-6 (FUTURE-INDEX 1) | `CREATE INDEX CONCURRENTLY idx_conv_parent ON conversations(parent_conversation_id) WHERE parent_conversation_id IS NOT NULL;` |
| I-6 (FUTURE-INDEX 2) | `CREATE INDEX CONCURRENTLY idx_msgs_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;` |

### 审查复核

| 检查 | 结果 |
|---|---|
| Supabase advisor (security) | 1 pre-existing WARN（`qr-avatars` public bucket），1 pre-existing WARN（leaked password protection）——均与 M1 无关 |
| Supabase advisor (performance) | M1 相关 WARN 0 条；M1 相关 INFO 2 条（`unindexed_foreign_keys`，与 I-6 对应保留）+ 1 条（`unused_index` on `idx_conversation_participants_by_participant`，预期：表空） |
| iron-rules 静态红线 | 重跑 7 passed + 1 todo |

### 下一步

推进 **M2** —— 多 agent 支持的 Dashboard + WS 协议 optional 字段预留（`shared/contracts/ws/**`，Owner = M2-WS-OPT）+ Gateway fanout 抽象（仅抽象、行为不变）。M2 开工时需额外带入 **I-8 的 kind 过滤防御**作为 `M2-GW-FANOUT` 卡的附加验收项。

---

## 2026-04-20 — Plan v1.2 → v1.3 review response (docs only, no code)

**Trigger:** zeze 请另一个 agent 出具审查文档 `docs/refactor/review/2026-04-20-openclaw-plugin-refactor-review.md`（含 2 阻塞 / 3 重大 / 1 可接受）。本次更新把 plan 从 v1.2 升到 v1.3，逐条回应。

### 6 条审查反馈的处理决议

| # | 审查指出 | 严重度 | 最终处理 |
|---|---|---|---|
| 1 | §1.3 C2 文本与 M3 Edge Function 解密路径冲突（"plaintext only on endpoint" 与服务端解密矛盾） | 🔴 阻塞 | **采纳 A2**：§1.3 C2 措辞重写，显式穷举明文允许存在的 2 个边界（客户端 + Edge Function `decrypted-messages` 内存态，不落盘/不写日志/函数结束即释放）。同步 `CLAUDE.md` / tech-spec §1.3 §5.3 / product-requirements §1.3 / README §四条产品铁律 / qrclaw-map/map.md。 |
| 2 | M3 缺灰度/双读/feature flag 回滚剧本 | 🔴 阻塞 | **显式拒绝（D-REV-02 新增）**：MVP 阶段不值得引入灰度基建；回滚靠 `git revert` Gateway 部署。代价（~15 min 降级窗口、无指标阈值）明确接受。补救条件写在 D-REV-02。 |
| 3 | Owner 历史路径命名不一致（`get-decrypted-messages` vs `decrypted-messages`） | 🟠 重大 | **采纳**：§1.3 L97 明确从 M3 起统一为 `decrypted-messages`（内部按 role 分支）；`get-decrypted-messages` 在 M3 被合并。 |
| 4 | §5.1 L1.7（fanout 抽象）与 §2.4 "MVP 不做群聊" 之间的"架构预留 vs 实际行为"边界模糊 | 🟠 重大 | **采纳**：§5.1 L1.7 + §12.4.3 M3-GW-FANOUT 卡加"⚠️ 仅抽象、行为不变"约束；明确更换 fanout 实现不应让 direct 场景消息顺序 / typing / ack 时机发生任何可观测变化（M2 回归门槛）。 |
| 5 | `shared/contracts/` 在 M2（WS）与 M3（HTTP）之间存在隐性交叉 Owner | 🟠 重大 | **部分采纳**：§12.1 Task Card 协作公约加 **Owner** 字段 + **Conflict Resolution** 字段 + "共享目录 Owner 分配表"。`shared/contracts/ws/**` = M2-WS-OPT Owner；`shared/contracts/http/**` = M3-EDGE Owner。 |
| 6 | M4 出口标准偏短，缺生态最小可用验收 | 🟡 可接受 | **采纳**：§8.3 M4 出口从 4 条扩到 7 条，补齐"长会话保活 30min / 双 agent token 并发隔离 / 插件冷启回放"三条。 |

### D-REV-02 — 拒绝为 M3 引入灰度基建

- **审查建议**：拆 M3 为 M3a（新增 + 影子比对）+ M3b（visitor 正式切流），引入 `HISTORY_READ_BACKEND=edge|legacy` feature flag 与指标阈值告警
- **zeze 决议**：不采纳；M3 保持单卡交付
- **理由**：
  1. QRClaw 当前 v0.4.8 处于 MVP 阶段，流量规模不值得承担灰度基础设施的长期维护成本
  2. M3 的变更在工程上是可逆的（Gateway 重新部署旧代码即可，≤ 15 min）
  3. 当前缺 prod 流量指标基线，设任何 p95 / error_rate 阈值都是凭空
  4. 减少 flag 类型的状态枝叶，对 MVP agent team 的心智负担更低
- **代价（明确接受）**：
  - M3 上线后若 Edge Function 冷启过长 / Deno 解密存在 bug → 最多 15 min 用户可见降级
  - 加 TDD 9 条（见 §7.2）作为主要防线
- **回调条件**：进入真实付费用户阶段 / 或出现第一例 M3 导致的 P0 事故后，另起 plan 补灰度基建

### v1.3 修改的文件

| 文件 | 变更 |
|---|---|
| `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` | v1.2 → v1.3：§1.3 C2/L97、§5.1 L1.7、§8.3 M4 出口、§10 D-REV-02、§12.1 Owner/Conflict Resolution、§12.4.3 仅抽象约束；顶部版本标记与变更摘要 |
| `CLAUDE.md` | §四条铁律 C2 行重写；版本标记 v1.2 → v1.3 |
| `requirements/technical-specification-v3.0.3-combined.md` | §1.3 标题与 C2/C5 行；§5.3 标题；目录 |
| `requirements/product-requirements.md` | §1.3 四条铁律 C2/C5 行；目录 |
| `README.md` | §四条产品铁律 C2 行；版本标记 v1.2 → v1.3 |
| `.claude/skills/qrclaw-map/map.md` | Iron rules 段 C2/C5 英文版更新（含 v1.2 → v1.3） |
| `docs/refactor/execution-log.md` | 追加本条 review response 记录（即本段） |

### 未采纳/降级采纳的审查建议清单（for agent team 后续知情）

- **未采纳**：M3 拆分 / feature flag / 指标阈值告警 / 路由级回滚开关 — 见 D-REV-02
- **本次未处理但记在 agent team backlog**：审查建议 #5 提到的"给每张卡补默认 Owner 字段"已通过"Owner 分配表"覆盖共享目录；单卡 Owner 字段只加在 §12.1 公约段，12.2–12.6 各张卡文案不回填（避免本次改动过大；后续任一 agent 领卡时可顺手补一行）

### 验证

- [x] `tests/acceptance/iron-rules.spec.ts` 对 C1/C2/C5 的静态红线无文本变动依赖（grep 的是 `openai` / `messages.insert` / history endpoint 文件存在性）→ 重跑仍绿
- [x] plan v1.3 内 §1.3 / §5.1 / §8.3 / §10 / §12 互相引用一致；术语 `decrypted-messages` 全局统一

---

## 2026-04-20 — M0: Iron rules v1.2 + OpenClaw plugin refactor kickoff (docs + acceptance tests only)

**Plan:** [`docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md`](../superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md) v1.2 "MVP Focused Edition + Agent Team Ready"

### Goal

把 QRClaw 从"独立 proprietary SDK agent 接入"演进成"OpenClaw 的一个 channel plugin（类 Telegram 模型）"的设计定稿，并启动 M0：纯文档 + acceptance test 红线，零代码风险。真正的协议/DB/Gateway 改动从 M1 开始。

### Decision Reversal — `D-REV-01`（铁律 C1 语义变更）

| 条目 | 旧（v1.1） | 新（v1.2） |
|---|---|---|
| **C1** | "纯转发"——Gateway 只转发，不生成/不改写消息 | **"中立中继"**——Gateway 仅接收、加密、持久化、转发；不调用 LLM；不对 content 做基于内容的路由或改写 |
| **C2** | "平台存储"——存消息，不分析内容 | **"加密存储"**——消息必须端到端加密持久化，平台仅持密文 + 元数据 |
| **C4** | 移动端零注册（Session Token 标识） | 不变 |
| **C5** | — | **新增**："消息可回放"——任一身份（visitor / owner / agent-plugin）在断线、换机、重启后重新连接时都能拿回历史消息 |

**触发原因**：zeze 2026-04-20 在插件化讨论中明确"我们需要存下来消息，用户后续重新登陆的时候信息还在"。旧 C1 的"纯转发"措辞容易被理解为"不持久化"，与 C2（已隐含持久化）冲突，故重新表述并显式化 C5。

**影响文件（M0 已同步）**：
- `CLAUDE.md` §"四条铁律" — 三条 → 四条表
- `.claude/skills/qrclaw-map/map.md` — Iron rules 段 + ASCII 拓扑中的 `pure relay (C1)` → `neutral relay (C1)`
- `requirements/technical-specification-v3.0.3-combined.md` §1.3 + §5.3
- `docs/release/github-publish-guide.md` §2 依赖图新增 Task D，§3.1 锁定决策新增 2 行（铁律演进 + 插件位置）
- **Deviation from Task Card M0-DOC Write-allowed list**：也同步更新了 `README.md` §"产品铁律" 与 `requirements/product-requirements.md` §1.3。原因：这两份文件都携带铁律表述，若只改 `CLAUDE.md` / tech-spec 会出现四处"权威源"不一致。Task Card 的 Write-allowed list 没有枚举它们是遗漏；Reviewer 若不同意可回滚这两处，但会破坏 M0 "四处铁律一致" 的出口标准。

**影响代码（M1+ 才落地，本次不动）**：Gateway 仍然走"持久化优先的尽力投递"路径，现实实现早已符合 C2（`content_encrypted` 已持久化），只是旧文档描述不准。

### Key locked decisions (from plan §10)

| # | 决策 | 值 |
|---|---|---|
| D1 | 插件代码位置 | A1 — `plugins/openclaw/` 子目录（**不**开独立仓库） |
| D2 | 历史解密位置 | 宽 — agent 和 visitor 历史全部走统一 Supabase Edge Function `decrypted-messages` |
| D3 | Agent 创建 QR Code 的鉴权 | A — 新增 `POST /api/agent/create-qrcode`，用 `agent_token` 鉴权 |
| D4 | 消息编辑/删除 | 不做，不预留 DB 字段 |
| D5 | 长连接 WS 到 OpenClaw | M4 Day-1 做 feasibility 测试（SDK 兼容性、心跳、断线重连语义） |
| D6 | 插件发布节奏 | 跟 OpenClaw SDK 对齐（非独立 cadence） |
| D7 | MVP scope slim | buttons / reactions / media / edit-delete / approvals / slash commands **全部移出 MVP**（M5+ 未来迭代，不在本轮） |
| D8 | Exec approvals / slash commands | 完全砍掉，**不预留协议/UI** |
| D9 | 群聊 / 话题 / polls / stickers | 群聊+话题**架构预留**（DB 字段 + WS optional field），无 UI；polls / stickers **不做也不预留** |

### Scope

- M0 目标：纯文档同步 + 新增一份 acceptance test（`tests/acceptance/iron-rules.spec.ts`），用 grep 的方式把"Gateway 源码里不得出现 LLM 调用 / content 语义解读"这条红线转成机器可验证的断言。
- M0 **不涉及**：代码修改（gateway/web/supabase 一律不动）、DB migration、协议扩展、plugin 包初始化。

### Commits

_（待 M0 收尾后补，目前是 working tree 未 commit 状态）_

### Verification plan (六栏验证 for M0)

1. 编译：不涉及代码，N/A。
2. 引用完整性：grep 确认新 iron rules 文案在 CLAUDE.md / map.md / tech-spec 三处一致。
3. 数据连通性：N/A（纯文档）。
4. 用户流程：N/A（M0 无 UI 改动）。
5. 常见陷阱：grep 确认 repo 中不再有"纯转发"措辞（除了 execution-log 和 spec 的 history 说明本身）。
6. acceptance test：`cd tests && npx vitest run tests/acceptance/iron-rules.spec.ts` 绿色。

### Files added/modified

- Modified: `CLAUDE.md`, `.claude/skills/qrclaw-map/map.md`, `requirements/technical-specification-v3.0.3-combined.md`, `docs/release/github-publish-guide.md`, `README.md`, `requirements/product-requirements.md`
- Modified (infra): `tests/vitest.config.ts` — 把 `acceptance/iron-rules.spec.ts` 加进 `include` 和 `environmentMatchGlobs`（node env）。Task Card M0-IRON-TEST 只明说允许写 `tests/acceptance/iron-rules.spec.ts` 和 `tests/**` fixtures；`vitest.config.ts` 不是 fixture，但不改它 `npm run test` 就不会加载新测试——属于必要的 wiring。
- Added: `tests/acceptance/iron-rules.spec.ts`（M0-IRON-TEST 产出，7 passed + 1 todo）
- Added: `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md`（v1.2，11 张 Agent Team Task Card）

### Known follow-ups

- M1-PROTO-DB：协议 optional field (`reply_to_message_id` / `thread_id`) + DB 预留 migration（群聊/话题架构预留）。
- M2-DASH-AGENT：Dashboard 多 agent 管理 UI + 对应 Supabase 策略。
- M3-EDGE-HISTORY：统一的 Edge Function `decrypted-messages` + `POST /api/agent/history` 转发层。
- M4-PLUGIN：`plugins/openclaw/` 目录搭建，实现 channel adapter + `qrclaw.create-qrcode` tool。

---

## 2026-04-19 — Phase 2 plans drafted + GitHub publish playbook (planning only)

**Plans:**
- [`docs/superpowers/plans/2026-04-19-qrclaw-phase2-index.md`](../superpowers/plans/2026-04-19-qrclaw-phase2-index.md) — 两波索引 + 跨 wave 一致性表
- [`docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`](../superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md) — 776 行，9 任务（T1 + T2a–T2d + T3–T6），预计 7–8 commit
- [`docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`](../superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md) — 651 行，7 任务（T1–T6 + C1），预计 9–12 commit

**Release playbook:**
- [`docs/release/github-publish-guide.md`](../release/github-publish-guide.md) — 给另一个 agent + 用户双角色的 GitHub 首次发布剧本

### Goal

Wave 0 已经把 CI/CD 硬化，本轮**不动代码**，只落三份文档：Phase 2 的两份实现计划（用户确认的 A+C scope、all_endpoints depth），以及 Phase 2 成果推到 GitHub 的协作剧本。目的是把"还没写进代码、但已经想清楚"的决策全部从脑子里搬到仓库，方便下一个 agent（或同一 agent 的下一轮会话）无缝接手。

### How it was produced

- 派两个并行 `generalPurpose` subagent 做独立研究：
  - Subagent A（Wave 1 HTTP）：grep `gateway/src/routes/*.ts`、`gateway/src/server.ts`、web fetch 调用，搭建 16 行端点 inventory + 9 条 drift findings。
  - Subagent B（Wave 2 outbound WS）：grep `gateway/src/ws/*.ts` 发现 15 个 emit 点，9 个 frame（7 OUTBOUND-only + 2 BIDIRECTIONAL）+ 7 条 drift。
- orchestrator 做交叉 review，把两波在 `shared/contracts/` 目录结构、sync-contracts.mjs 扩展、web bundle zod-free 约束上的一致性用一张表固化进 index 文件（§"跨 wave 一致性"）。
- `.claude/skills/qrclaw-map/map.md` 的 Further reading 同步追加 4 个新条目，让下一个 agent 入手时直接看到 Phase 2 全貌 + release guide。

### Scope-lock recorded here

| 维度 | 用户确认 |
|---|---|
| Phase 2 scope | A + C（HTTP 请求体 + 出站 WS Zod），**不做** 响应体 Zod / OpenAPI / tRPC / codegen |
| Depth | all_endpoints（10 web-reachable HTTP + 9 outbound WS frame） |
| Rollout | Wave 1 strict；Wave 2 γ hybrid（prod log-only 观察 7 天 → strict） |
| 发布顺序 | 先走 GitHub 发布 guide 把 Wave 0 成果上云；Wave 1/Wave 2 仍先本地执行 |

### Deviations / Watch items

1. **Wave 1 plan 超目标长度**：subagent 给出 776 行（目标 400–700）。已复核，超长来自 §2 的完整 inventory 表 + §4 每个 T2 子任务的 files-touched allowlist，**不做裁剪**（更具体 > 更短）。
2. **Wave 2 plan 声明"Wave 1 可能先动 `gateway/src/ws/*`"**：索引文件已把"Wave 1 完成后 Wave 2 implementer 重跑 emit-site grep"写进执行顺序建议。
3. **sync-contracts.mjs 需要扩展覆盖 outbound.ts**：Wave 1 的 T4 会扩展脚本（§3.5）；Wave 2 的 T1 要确认该脚本已支持 outbound 后再动手。index 的一致性表已标记此 handoff。
4. **Wave 1 drift F（`system_prompt` 1000 字截断）属于行为变更**：plan 已在 §6.3 HALT condition 里写明"需要用户 / 产品侧显式 sign-off"，不在 Wave 1 静默修。
5. **Supabase Edge Function `claim-agent` (PATCH) 属 drift G**：Wave 1 §9 明确 defer，因为 Deno ↔ Node 共享类型需要独立 mini-plan。
6. **发布 guide 的 `git status clean` 前置条件**：如果 Phase 2 plans / guide 未 commit，发布 agent 的 B0 会失败。本轮统一进一个 commit，让远端发布时状态 clean。

### Files added

- `docs/superpowers/plans/2026-04-19-qrclaw-phase2-index.md`
- `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`
- `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`
- `docs/release/github-publish-guide.md`
- `.claude/skills/qrclaw-map/map.md`（只追加 Further reading 条目）

### No code changes

零代码文件修改；仅文档。因此 six-pane 校验不是硬要求，但仍跑了 `format:check`、`vitest run`（对齐 Wave 0 的 696 基线）、`tsc`、`contracts-sync-check` 全部通过，确认本轮没有通过 markdown 文件影响到其它路径。

### Next actions (orchestrator backlog)

1. 用户按 `docs/release/github-publish-guide.md` Part A 在 GitHub 上完成手动配置 → 把 Part B 剧本交给另一个 agent 执行首次 push。
2. 首次 CI 跑绿后，用户在 branch protection 里勾 required status check 名。
3. 用户 review Wave 1 plan 的 §2.3 drift list（尤其 drift F 的行为判定）→ 决定是否启动 Wave 1 T1。

---

## 2026-04-19 — CI/CD Wave 0: pipeline hardening (complete)

**Plan:** [`docs/superpowers/plans/2026-04-19-qrclaw-cicd-wave0.md`](../superpowers/plans/2026-04-19-qrclaw-cicd-wave0.md)

**Baseline reference:** [`docs/ci-cd-optimization-plan.md`](../ci-cd-optimization-plan.md) (codex's production audit that triggered this wave)

**Goal:** Harden CI/CD around the now-stable Phase 1 contracts before starting Phase 2. Establishes the safety floor (E2E smoke, DB migration gate, auto deploy, format enforcement, ownership) so Phase 2's business-logic changes can land behind real gates instead of manual SSH.

### Scope decision (plan §0)

- **Accepted from codex:** Dependabot, E2E PR lane, migration dry-run, gateway auto deploy, supabase db push automation, Prettier, CODEOWNERS.
- **Rejected (MVR stance):** Turborepo / pnpm workspaces, per-PR ephemeral backends, semantic-release, visual-audit in CI.
- **More conservative than codex:** `supabase db push` is `workflow_dispatch`-only with a literal confirm token + dry-run default — not auto-triggered on main push.

### Commit sequence

| # | SHA | Subject |
|---|---|---|
| P | `d5523c6` | docs(plan): add cicd wave0 hardening plan + codex baseline doc |
| T1 | `5df5d40` | chore(ci): add dependabot config for weekly dep scanning |
| T2 | `bb54d25` | ci(e2e): wire playwright smoke into CI + fix local webServer cwd |
| T3 | `f947b48` | ci(supabase): add migration PR gate with ephemeral postgres |
| T4 | `e548c33` | feat(cd): automate gateway deployment on main push |
| T5 | `9bacf95` | feat(cd): add supabase db push dispatch workflow |
| T6a | `c3ab8d3` | chore(format): add prettier config + scripts (commit A of bootstrap) |
| T6b | `afd1a62` | chore(format): repo-wide prettier bootstrap (commit B of bootstrap) |
| T6c | `39b3874` | chore(ci): enforce prettier formatting (commit C of bootstrap) |
| T7 | `d99a555` | chore(gov): add CODEOWNERS to gate high-risk paths |

### Deviations from plan

1. **T2 — E2E coverage thinner than plan assumed.** Discovered mid-task that `tests/e2e/{web,mobile,flows}/*.spec.ts` are vitest-based mock specs (import from `'vitest'`), not real Playwright specs. Only `sample.spec.ts` + `visual-audit/*` use `@playwright/test`. The T2 job thus runs 2 test instances (chromium × sample.spec) — real coverage is low but the job still provides value web-lint can't: "does the production bundle actually boot in a browser?". Added `testIgnore` for the mock-spec folders and a follow-up note: rename `*.spec.ts` → `*.test.ts` and relocate under `tests/integration/` to make the runner split structural.

2. **T2 — playwright.config.ts was already broken.** `webServer.cwd: '../'` + `command: 'npm run dev'` never worked because the root `package.json` is a Vercel shim with no `dev` script. Fixed as part of T2 by pointing `cwd` at `web/` and toggling `next dev` / `next start` based on `process.env.CI`.

3. **T5 — db push demoted from automatic to manual dispatch.** Plan had it on main-push; during drafting I reconsidered and matched codex's intent while adding extra safety (confirm token, dry-run default, include_functions opt-in). Auto-push stays out of scope until the migration-check gate and the dispatch workflow have a few real runs.

4. **T6 — Prettier needed two passes on 4 files.** Prettier 3.x idempotency edge case on long template strings / comments (files: `gateway/src/routes/{health,messages,ticket}.ts`, `tests/unit/backend/auth-frame.test.ts`). Second `prettier --write` converged; CI `format:check` will catch any future regression.

5. **T6 — markdown excluded from scope.** Initial plan wording implied formatting markdown too; discovered 239 `.md` files in `docs/`, `dev-log/`, `design/` etc. where Prettier's reformat alters list-nesting semantics authors rely on. Added `**/*.md` + several documentation dirs to `.prettierignore` so the bootstrap only reformatted real code (175 files changed, all non-markdown).

6. **T7 — CODEOWNERS broke `format:check`.** Prettier couldn't infer a parser for extension-less files. Added `.github/CODEOWNERS` and `.git-blame-ignore-revs` to `.prettierignore` in the same commit.

### Final verification (six panes all green)

```
Prettier        All matched files use Prettier code style!
Contracts sync  ✓ sync in sync
Gateway tsc     clean
Web tsc         clean
Vitest          696/696 passing, 0 type errors
Workflows yaml  4/4 workflows parse (ci, deploy-gateway, deploy-supabase, supabase-migration-check)
```

### Local-only delivery boundary

Because this repo has no GitHub remote (see Phase 1 same constraint), the following artifacts are code-ready but their *actual* execution only happens once the user pushes:

| Artifact | Local-verified | Awaits first GitHub run |
|---|---|---|
| `.github/dependabot.yml` | yaml parse, all 6 update sources point to real `package.json` | Dependabot scheduler, first batch of PRs |
| `.github/workflows/ci.yml` (`format-check`, `tests-e2e`) | yaml parse, Prettier passes, Playwright `--list` works, vitest green | real runner, container image pull, artifact upload |
| `.github/workflows/supabase-migration-check.yml` | yaml parse, `supabase db start` sequence validated against local migration files | real runner, Supabase CLI invocation |
| `.github/workflows/deploy-gateway.yml` | yaml parse, secrets names match codex audit, `script_stop: true` + health probe logic | real SSH to Tencent VPS |
| `.github/workflows/deploy-supabase.yml` | yaml parse, confirm-token gate tested via conditional, dry-run default | real Supabase CLI link + push |
| `.github/CODEOWNERS` | line syntax, every non-comment line ends `@hellozim22` | branch protection rule toggle |

### Out-of-scope follow-ups (Phase 2 or later)

- **Rename mock "spec" files** under `tests/e2e/{web,mobile,flows}/` to `*.test.ts` and move to `tests/integration/`. Makes runner split structural.
- **Real Playwright coverage.** Current E2E smoke is thin; add real browser specs for the QR-scan → chat critical path once Phase 2 HTTP contracts land.
- **Markdown formatting policy.** If we want consistent markdown later, agree on `proseWrap` and remove `**/*.md` from `.prettierignore`.
- **Auto-push for `supabase db push`.** After a few successful manual runs, reconsider automating it (probably push + `environment: production` reviewer, drop the confirm token).
- **Container image bumps via Dependabot.** Currently excluded; revisit when `node:20-alpine` goes EOL.

---

## 2026-04-19 — Phase 1: WS contracts SSoT (complete)

**Plan:** [`docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md`](../superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md)

**Goal:** Eliminate WebSocket contract drift between `gateway/`, `web/`, and `supabase/functions/` by establishing `shared/contracts/ws/` as the single source of truth.

### Commit sequence (oldest → newest, post-baseline)

| # | SHA | Subject |
|---|---|---|
| 0 | `837d147` | chore: baseline before phase1 refactor |
| P | `8d07a93` | docs(plan): add spec-compliant phase1 refactor plan |
| P | `a0e7fbb` | docs(plan): fix Task 3 tsconfig rootDir decision |
| T1 | `7cc4cf4` | feat(contracts): add shared/contracts skeleton + sync-contracts script |
| T2a | `944db36` | feat(contracts): fill WS union types + lift Zod schemas into shared |
| T2b | `1792e19` | test(contracts): strengthen parity + missing happy-path cases |
| T3a | `b40ef89` | fix(shared): NodeNext-compliant ESM module layout |
| T3b | `962e4a9` | refactor(gateway): consume WS schemas from shared/contracts |
| T3c | `146c0a4` | chore(gateway): update deployment artifacts for new dist layout |
| T4a | `b948005` | refactor(web): consume WS frame types from shared/contracts |
| T4b | `890ed5c` | fix(web): stop dropping unsequenced stream_chunk deltas |
| T4c | `d6257d4` | test(chat-store): align initial streaming.sequence semantics |
| T5 | `8494012` | ci(contracts): add contracts-sync-check job |
| T6 | `ee7dc79` | docs(skill): add qrclaw-map navigation skill for agents |
| FU1 | `7598393` | fix(docker): build gateway from repo root so shared/contracts is reachable |
| FU2 | `807b388` | refactor(shared): own zod dep directly; drop gateway tsconfig path alias |

### Plan-level drift findings resolved (Task 2)

1. **`stream_end` payload union** — three optional fields (`total_chunks`, `total_length`, `full_content`) with mutually compatible combinations.
2. **`stream_chunk.payload.sequence` is optional** — gateway may omit; consumers must tolerate missing values end-to-end.
3. **`ping.payload` is optional empty** — both `{ payload: {} }` and no `payload` accepted.
4. **`AuthFrame` added** — symmetry with gateway's auth handshake; present in `ClientFrame` union.
5. **`agent_message` vs `message` kept distinct** — agent-authored input vs server-broadcast output.
6. **Strict-mode rejection of unknown fields** — enforced on every inbound frame schema.

### Deviations from the written plan (captured in-flight)

These were NOT written into the plan but surfaced during implementation and were fixed on the spot. They are logged here so future readers know the plan ≠ exactly what shipped.

| # | Deviation | Where | Why | Fix |
|---|---|---|---|---|
| D1 | `WSFrame` inheritance drift on `Ping`/`ReadReceipt`/`Auth` frames | `shared/contracts/ws/types.ts` | Strengthening parity tests to `toEqualTypeOf` (T2b) exposed that the three frames inherited `id?: string` from `WSFrame`, while their `.strict()` Zod schemas had no `id`. | `extends Omit<WSFrame, 'id'>` on the three frames. |
| D2 | Extension-less relative imports in `shared/` | `shared/contracts/ws/protocol.ts`, `shared/contracts/ws/index.ts` | NodeNext ESM runtime rejects `from './types'`; vitest's bundler-style resolver masked it during T2. | Appended `.js` to the two imports (T3a). |
| D3 | `shared/` had no `package.json` | `shared/` | `gateway/dist/shared/contracts/ws/protocol.js` was resolved by Node under gateway's `"type": "module"` scope and failed to load as CJS — a silent scope-mismatch bug. | Added `shared/package.json` with `{ "type": "module" }` (T3a). |
| D4 | Unsequenced `stream_chunk` drop bug in web | `web/src/hooks/useWebSocket.ts`, `web/src/stores/chatStore.ts` | First pass used `frame.payload.sequence ?? 0`, which combined with chatStore's `seq <= stored` dedup guard to silently drop every unsequenced chunk after the first. | Widened `StreamingState.sequence` to `number \| undefined`; dedup now triggers only when both sides are defined (T4b/T4c). |

### Follow-ups resolved after initial task wave (same-day)

- **FU1** — `gateway/Dockerfile` originally could not see `shared/contracts/` because the build context was `gateway/`. Restructured so the context is the repo root (`gateway/docker-compose.yml`: `context: ..`), Dockerfile copies `gateway/` + `shared/`, and `.dockerignore` is now at repo root. The runtime CMD path fix had already shipped in `146c0a4`.
- **FU2** — `gateway/tsconfig.json` had a `"zod": ["./node_modules/zod/index.d.cts"]` path alias as a tsc workaround. Replaced by declaring `zod` as a real dep in `shared/package.json` (+ `shared/package-lock.json`), installing `shared/node_modules/zod`, removing the alias, and adding an `npm ci` step in Docker builder + in the CI `gateway-lint` job. Local setup now requires `cd shared && npm install` alongside gateway/web/tests installs.

### Final verification (post-FU2)

| Check | Result |
|---|---|
| `node scripts/sync-contracts.mjs --check` | PASS |
| `npm --prefix gateway run build` | 0 errors |
| `cd web && npx tsc --noEmit` | 0 errors |
| `cd tests && npx vitest run` | 69 files / 696 passed / 0 type errors |
| Working tree | clean |

### Known follow-ups (out of Phase 1 scope)

- **Outbound frame Zod schemas** — only inbound frames have runtime validation today; gateway-produced frames (`ConnectionAckFrame`, `StreamChunkFrame` outbound, `ErrorFrame`, `SystemFrame`, `AgentTypingFrame`, `MessageFrame`, `PongFrame`) are TS-typed but not Zod-validated. Low priority while gateway is the authoritative producer.
- **Additional contract domains** — HTTP DTOs (REST routes under `gateway/src/routes/` and matching web fetchers), Supabase DB row shapes (currently duplicated hand-written types). Next phase.
- **Dev onboarding docs** — the new `cd shared && npm install` step should be called out in the top-level README / CLAUDE.md onboarding section.

---

## 2026-04-20 — M4: @qrclaw/openclaw-plugin MVP (Waves A → D + CREATE-QR + VERIFY + CI-RELEASE)

Close-out of the OpenClaw plugin refactor. Shipped a full `@qrclaw/openclaw-plugin` MVP under `plugins/openclaw/` + supporting gateway endpoint + CI + release pipeline. User chose "aggressive execution" — the serial dispatcher (parent agent) stopped only for design decisions and anomalies; subagents ran in parallel where file scopes allowed.

### Design decisions taken before execution

| Key | Choice | Rationale |
|---|---|---|
| D5 (M4-FEAS) | **Skipped** | User reported Telegram + WeChat plugins already run long-lived WS on OpenClaw without issue; feasibility test was sunk cost. |
| Execution rhythm | Option ② (aggressive) | User explicitly asked for "只在出异常/需要决策时停"; dispatcher only halted for the `payload.message_id` divergence found by M4-VERIFY. |
| Plugin location | `plugins/openclaw/` (in-repo) | Keep MVP close to the Gateway it talks to; publishes to npm as standalone package in future. |
| OpenClaw dev link | `file:../../openclaw-main` | Developer convenience; CI resolves via `git clone --depth=1 openclaw/openclaw` into runner workspace parent. |

### Wave map (commit chain)

| Wave | Commit | Output | Tests added |
|---|---|---|---|
| Wave A — scaffold + WS client + runtime + accounts | `d7e21ce` | `plugins/openclaw/{package.json,tsconfig.json,openclaw.plugin.json}` + `src/{client,runtime,accounts}.ts` | 20 |
| Wave B — message pipes | `5b64462` (merged with M4-CREATE-QR backend) | `src/{inbound,history}.ts` + `src/outbound/{text,stream}.ts` | 31 |
| M4-CREATE-QR backend | same commit | `shared/contracts/http/agent/{types,protocol}.ts` + `gateway/src/routes/agent-create-qrcode.ts` + route registration | 27 |
| Wave C — channel assembly + tool | `1036fcc` | `src/channel.ts` + `src/tools/create-qrcode.ts` + `src/openclaw-types.ts` (shim) + `index.ts` + `setup-entry.ts` | 34 |
| Wave D — local e2e | `186768d` (merged with M4-VERIFY) | `tests/e2e/{harness,plugin-lifecycle,inbound-roundtrip,outbound-roundtrip,stream-roundtrip,multi-account-isolation,tool-call,reconnect}.ts` + live-path dedup in `src/inbound.ts` | 15 |
| M4-VERIFY — indistinguishable | same commit | `tests/acceptance/plugin-indistinguishable.spec.ts` (diffs legacy agent-sdk vs plugin; same deterministic scenario; frame streams identical modulo UUIDs/timestamps) | 5 |
| M4-CI-RELEASE | `2854ef2` | `.github/workflows/plugin-openclaw.yml` + `plugins/openclaw/{.changeset/,README.md,tsconfig.build.json}` + `scripts/agent-sdk/README.md` migration notice | — |

### Deviations from the written plan (captured in-flight)

| # | Deviation | Where | Why | Resolution |
|---|---|---|---|---|
| M4-D1 | `tsconfig` dropped `rootDir` in Wave A | `plugins/openclaw/tsconfig.json` | Relative import to `../../../shared/contracts/ws/types.js` spans outside the plugin root; `rootDir:"."` would have rejected it under NodeNext. | Accepted; `outDir:"dist"` kept. Wave C's `tsconfig.build.json` later formalized a separate compile-time config. |
| M4-D2 | `ConnectionState` simplified | `src/client.ts` | Merged `requesting_ticket` into `connecting` (4 states: disconnected/connecting/connected/reconnecting). | Accepted. |
| M4-D3 | `src/openclaw-types.ts` local shim | `plugins/openclaw/src/` | `openclaw/plugin-sdk/channel-core` imports fail at compile time because `../../openclaw-main` has no built `dist/`. | Shim mirrors SDK type signatures verbatim; README §Known Limitations documents that a real install must swap back to SDK imports once openclaw-main ships `dist/`. |
| M4-D4 | `qrcodes.metadata` column doesn't exist | `gateway/src/routes/agent-create-qrcode.ts` | First draft of route tried to insert a top-level `metadata` column; the init schema has no such column. | Moved `callback_hint` and `account_label` into `profile.agent_metadata` JSONB (qrcodes already has `profile` JSONB). Tests still pass (Supabase mocked in unit tests). |
| M4-D5 | `payload.message_id` wire-level divergence | `plugins/openclaw/src/outbound/text.ts` | Wave B injected `message_id` into `AgentMessageFrame.payload` via a type assertion; legacy `scripts/agent-sdk` puts it only on `frame.id` (the shared contract's canonical location). M4-VERIFY's diff test caught this. | Removed the payload-level field; `frame.id` is the single source of truth. Existing Wave B test updated to assert `not.toHaveProperty('message_id')`. |
| M4-D6 | Live-path `message_id` dedup missing | `plugins/openclaw/src/inbound.ts` | Wave D reconnect scenario proved that when the gateway replays a message after reconnect, the plugin would dispatch it twice to OpenClaw — a real bug. | Added a bounded LRU set (capacity 1000/account, FIFO eviction). +27 LOC. Test hook `_resetLiveDedup` exported for per-test isolation. |

### Known MVP limitations (documented in README)

- **History replay is a no-op** until a `GET /api/agent/conversations` endpoint lands. `conversationIds: []` means no replay happens on reconnect today. OpenClaw's own conversation memory carries the primary burden; QRClaw replay only catches messages that arrived while the agent was offline mid-conversation — rare for MVP.
- **`openclaw-types.ts` shim** must be dropped before the plugin is published; swap to real SDK imports once openclaw-main ships a built `dist/`.
- **`private: true`** stays in `plugins/openclaw/package.json` until the first real publish. `npm publish --dry-run` works regardless, so CI validates the `files` whitelist on every merge to main.
- **`reconnect` e2e test** is CI-advisory (uses `vi.stubGlobal('setTimeout', …)` to compress a 3s default delay into 50ms for test speed; minor timing flake risk).

### Final verification (post-M4-CI-RELEASE, HEAD `2854ef2`)

| Check | Result |
|---|---|
| `cd plugins/openclaw && npm ci` | 211 packages, 0 vulnerabilities |
| `cd plugins/openclaw && npm run typecheck` | 0 errors |
| `cd plugins/openclaw && npx vitest run` | 100 passed (17 files) |
| `cd plugins/openclaw && npm publish --dry-run` | 45 files; whitelist correct (no tests/, no .changeset/, no node_modules/) |
| `cd tests && npx vitest run` | 950 passed (945 baseline + 5 indistinguishable) |
| `cd tests && npx vitest run acceptance/plugin-indistinguishable.spec.ts` | 5/5 deterministic (3× consecutive runs) |
| `npx prettier --check` on all touched files | clean |
| `python3 yaml.safe_load .github/workflows/plugin-openclaw.yml` | ok |
| Working tree | clean |

### Acceptance against plan §8 M4 (7-item checklist)

| # | Item | Status |
|---|---|---|
| 1 | visitor msg → OpenClaw agent 推理 → visitor 看到流式回复（至少 1 次完整对话） | **Pending live E2E** on a real OpenClaw instance (user has line-hosted OpenClaw; blocked on them running the install). All building blocks (inbound, outbound text, outbound stream) are unit- and e2e-verified against mock harness. |
| 2 | agent 进程重启后 history 回放无丢失 | **Architecturally ready** but not wired end-to-end — `replayHistory` exists, dedup is in place, but `conversationIds` sourcing is a no-op until `GET /api/agent/conversations` ships. |
| 3 | `qrclaw.create-qrcode` 通过 `agent_token` 成功创建 QR 并返回扫码链接 | **Passes** — route + tool + 27 unit + 3 e2e tests; shared contract locked. |
| 4 | `plugin-indistinguishable.spec.ts` 绿 | **Passes** — 5/5 green, CI-required. |
| 5 | 长会话保活 ≥ 30 min | **Pending live run**; heartbeat + reconnect + backoff all tested against mock. |
| 6 | 双 agent token 并发对话互不串扰 | **Passes at e2e level** — `multi-account-isolation.test.ts` covers inbound / outbound / disconnect isolation. Live verification pending. |
| 7 | 插件冷启回放 (dedup by `message_id`) | **Live path covered** (M4-D6 dedup). Cold-start path is no-op until the conversations-list endpoint ships. |

Items 1 / 5 / 6 are now unblocked for the user's line-hosted OpenClaw smoke test. Items 2 / 7 will re-activate once `GET /api/agent/conversations` is implemented — tracked as a Phase 5 follow-up.

### Release runbook

See `plugins/openclaw/README.md` §Contributing and the M4-CI-RELEASE commit body (`2854ef2`) for the 10-step release runbook (collect changesets → cut release branch → `npm run version` → flip `private: false` → merge → dry-run → npm login → `npm publish --access public` → tag → announce).
