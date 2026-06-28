# QRClaw Phase 2 Wave 1 — HTTP Contracts SSoT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every Zod / type change MUST follow TDD: write failing test → run → implement → run → commit (see `superpowers:test-driven-development`).

**Goal:** Extend the `shared/contracts/` pattern (established in Phase 1 for WebSocket frames) to cover the HTTP layer. Gateway request bodies get Zod validation schemas living in `shared/contracts/http/`; web callers consume the matching TS interfaces. Eliminate silent drift between what web sends and what gateway expects.

**Architecture:** New directory `shared/contracts/http/` organised **by domain** (tickets, messages, subscribers, qrcodes). Each endpoint exports a request-body TS interface (consumed by web, zero dependencies) plus a Zod schema (consumed by gateway via a small `validateRequest` middleware). Response bodies stay as TS interfaces only — no runtime validation, no OpenAPI, no tRPC. Mirrors the Phase 1 `ws/types.ts` + `ws/protocol.ts` split so web NEVER imports zod.

**Tech Stack:** TypeScript 5.9, Node 20, Zod 4.3.6 (already hoisted to `shared/` in Phase 1 FU2), Vitest 4.1, Next.js 16 App Router, Express 4.x, Deno (supabase edge functions — out of scope for Wave 1).

---

## §0 Metadata

> **一句话给小白：** 这个计划把 "网页发给网关的 HTTP 请求体长什么样" 这件事固化成一份只写一次、多处复用的真相源，避免网页悄悄改了字段、网关却仍按老规矩校验，导致线上 400 错误但测试全绿的坑。

| 字段 | 值 |
|---|---|
| Status | **Draft** — awaiting user approval before execution |
| Owner (implementer role) | Serial subagent (one task at a time) |
| Reviewers | Spec reviewer (parallel) + code reviewer (post-task) per `superpowers:subagent-driven-development` |
| Depends on (must be merged first) | Phase 1 full series (`7cc4cf4` … `807b388`), CI/CD Wave 0 (`c3ab8d3` … `d99a555`) |
| Depends on (runtime) | `shared/package.json` owns `zod@4.3.6`; `@shared/contracts/*` path alias already live in web/ and gateway/ tsconfigs; `scripts/sync-contracts.mjs` exists |
| Scope (confirmed with user) | depth = **all web-reachable HTTP endpoints**; scope = **A (HTTP, this wave)** + **C (outbound WS — deferred to Wave 2)** |
| Non-scope (confirmed) | Response body runtime validation; OpenAPI; tRPC; codegen beyond TS; Supabase Edge Function unification |
| Expected commit count | 7–8 (T1 + T2a..T2d + T3 + T4 + T5, optional T6) |
| Plan location | `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md` |

### Success criteria (must all pass before declaring Wave 1 done)

1. Every HTTP endpoint in §2 with a request body has a Zod schema under `shared/contracts/http/` and the gateway handler consumes it (removing hand-rolled `typeof x !== 'string'` checks).
2. Every corresponding web caller imports its request-body TS interface from `@shared/contracts/http/…/types` (zero inline `Record<string, string>` / anonymous bodies).
3. `tests/unit/shared/contracts-http-*.test.ts` proves `z.infer<typeof schema>` is assignable to the exported TS interface for each endpoint (same pattern as `tests/unit/shared/contracts-ws-protocol.test.ts`).
4. Web bundle still contains zero references to `zod` (reuse the grep check from Phase 1 T4.5).
5. Six-pane verification (prettier, contracts sync, gateway tsc, web tsc, vitest ≥ 696 + new cases, workflows yaml) all green.
6. `docs/refactor/execution-log.md` gains a Wave 1 entry with the commit table and drift-resolution log.

---

## §1 Problem statement & goals

> **一句话给小白：** 今天网页发请求的时候，请求体只是一个 TypeScript 字面量，写错字段名 tsc 不会报错；网关那边用手写的 `typeof x !== 'string'` 校验，语义和网页脑补的常常对不上。这就是 "HTTP 契约漂移"，Phase 1 已经把 WebSocket 那边的同样问题修掉了，Wave 1 把同样的药方搬到 HTTP。

### 1.1 Why this hurts today

- **Web lies about payload shape and tsc won't catch it.** `web/src/lib/ws/ticket.ts` builds the body as `const requestBody: Record<string, string> = { qr_code_id: qrCodeId }`. The gateway handler in `gateway/src/routes/ticket.ts:175-182` expects `{ qr_code_id?: string; session_token?: string }`. If web ever sends `session_token: null` instead of omitting it, tsc accepts it, gateway silently fails at runtime — and CI has no way to notice because the two sides share no type.
- **Duplicated constants go out of sync silently.** `web/src/app/(dashboard)/qrcodes/create/page.tsx:1521` and `gateway/src/routes/create-qrcode-avatar.ts:4` both hardcode `600_000` as the max data-URL length for `profile_avatar`. Phase 1 showed (drift finding #6, `agent_message` vs `message`) that duplicated constants drift within a quarter unless they share a module.
- **Inline Zod in gateway isn't discoverable.** `gateway/src/routes/subscribe.ts:22` hides a Zod schema inside the handler; web has no way to read or share it. Every other POST endpoint falls back to `body.foo as string | undefined` manual checks — unsafe and inconsistent.
- **Production 400s that CI never caught.** See `docs/refactor/execution-log.md` — Phase 1 unearthed a real web bug (unsequenced `stream_chunk` drop, D4) that was a pure contract mismatch. HTTP layer has had analogous incidents (e.g. `profile_avatar` silently rejected when the data-URL crossed 600k by one character because web used `<` and gateway used `<=` at one point in git history; see §2).

### 1.2 Goals

1. Establish `shared/contracts/http/` as the SSoT for every **request body** web sends to gateway.
2. Web never imports zod (bundle size guardrail — verified in Phase 1 T4.5).
3. Gateway handlers call a single `validateRequest(schema)` middleware that emits the existing `{ error: { code, message } }` shape so no client-visible behaviour changes.
4. Add one parity test per endpoint proving `z.infer<typeof schema>` is assignable to the exported TS interface (catches future divergence).

### 1.3 Non-goals (user-confirmed)

- **Response bodies stay as TypeScript types.** Gateway is the trusted producer; adding runtime validation there costs CPU and buys nothing today.
- **No OpenAPI / no tRPC / no codegen beyond TS.** Team is small, wire format is stable, added tooling would outweigh value.
- **Only request bodies get Zod.** Query params (`before` in `/api/messages`), headers (Bearer tokens, X-Session-Token), and path params are out of scope for Wave 1.
- **Edge Function HTTP contract unification is deferred.** `claim-agent` PATCH (the only Edge Function web calls today) is flagged in §2 and §9 but not touched this wave.
- **No behaviour change.** Same 4xx codes, same JSON error shape, same rate-limit behaviour. Pure refactor.

### 1.4 Wave scope confirmation

- User confirmed depth = **all web-reachable HTTP endpoints** (not just the worst offenders).
- User confirmed scope split: **A (HTTP) in this wave, C (outbound WS Zod) in Wave 2**. `shared/contracts/ws/protocol.ts` already handles inbound; outbound schemas are the other Wave 2 half.

---

## §2 Current state inventory

> **一句话给小白：** 把所有网页会打的 HTTP 接口摊开看一眼，谁用了 Zod、谁是手写校验、网页到底发了个什么形状。这是整个计划最重要的一节 —— 所有后面的决定都从这张表长出来。

### 2.1 Gateway endpoint table

Source: `gateway/src/server.ts:99-104` (router mounts) → each `routes/*.ts` (handler). Method, path, body shape, auth, and existing validation quality were read line-by-line during plan preparation.

| # | Method | Path | Handler file | Request body shape | Has inline Zod? | Web caller(s) | Drift status |
|---|---|---|---|---|---|---|---|
| 1 | GET | `/health` | `gateway/src/routes/health.ts:16` | (none) | n/a | — (infra monitoring only) | n/a — no body |
| 2 | GET | `/metrics` | `gateway/src/routes/health.ts:35` | (none; Bearer token header) | n/a | — (ops tooling) | n/a — no body |
| 3 | GET | `/robots.txt` | `gateway/src/routes/seo.ts:18` | (none) | n/a | — (crawlers) | n/a — no body |
| 4 | GET | `/sitemap.xml` | `gateway/src/routes/seo.ts:34` | (none) | n/a | — (crawlers) | n/a — no body |
| 5 | POST | `/api/agent-ws-ticket` | `gateway/src/routes/ticket.ts:39` | (empty object; auth via `Authorization: Bearer <api_key>` header) | No (header checks only) | `scripts/agent-sdk/agent-connector.ts:274` (SDK, not web); `scripts/agent-sdk/example-*.ts` | **Low** — body is empty; header auth is separate concern |
| 6 | POST | `/api/visitor-ws-ticket` | `gateway/src/routes/ticket.ts:155` | `{ qr_code_id: string; session_token?: string }` | No (manual `if (!qr_code_id)`) | `web/src/lib/ws/ticket.ts:45` | **Drift A** — web body typed as loose `Record<string, string>`; no shared shape |
| 7 | POST | `/api/messages` | `gateway/src/routes/messages.ts:21` | `{ qr_code_id: string; session_token: string; limit?: number; before?: string }` | No (manual checks) | `web/src/lib/ws/history.ts:29` | **Drift B** — web body is inline anonymous object literal; `limit` hardcoded `50`; `before` never sent (pagination gap flagged) |
| 8 | POST | `/api/subscribe` | `gateway/src/routes/subscribe.ts:141` | `{ email: string }` (trim, max 254, RFC email) | **YES** — `subscribeSchema` at `subscribe.ts:22` | `web/src/lib/subscribe.ts:35` | **Drift D** — web re-implements email validation with a different regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) and duplicates the `254` constant |
| 9 | POST | `/api/create-qrcode` | `gateway/src/routes/create-qrcode.ts:199` | `{ agent_id: string; name: string; greeting?: string; template?: 'default'\|'minimal'\|'showcase'\|'custom'; system_prompt?: string; profile_avatar?: string (data-URL) }` | No (manual checks + `tryDecodeProfileAvatarDataUrl`) | `web/src/app/(dashboard)/qrcodes/create/page.tsx:1536` | **Drifts C + E** — `template` typed as bare `string` on web; `profile_avatar` 600000-char cap & regex duplicated across the two sides; `system_prompt` 1000-char truncation is gateway-only (web doesn't know) |

### 2.2 Supabase Edge Functions reachable from the web layer

Source: `supabase/functions/*/index.ts` + grep of `web/src` for `functions/v1/` and `supabase.functions.invoke`.

| # | Method | Path | Handler file | Request body | Called from web? | Drift status |
|---|---|---|---|---|---|---|
| 10 | PATCH | `/functions/v1/claim-agent` | `supabase/functions/claim-agent/index.ts:166` | `{ agent_id: string (UUID) }` | **YES** — `web/src/app/claim/[token]/page.tsx:207` + `:359` | **Drift G — out of Wave 1 scope.** Flagged in §9 follow-ups. Deno runtime + web TS have no shared type today. |
| 11 | POST | `/functions/v1/claim-agent` | same file, `handleCreate` at `:115` | `{ name: string }` | No (internal / CLI only) | Ambiguous — not called by web. Leave alone. |
| 12 | PATCH | `/functions/v1/manage-qrcode` | `supabase/functions/manage-qrcode/index.ts:29` | `{ qrcode_id; status?; name?; greeting?; theme?; system_prompt?; suggested_questions? }` | No (dashboard currently uses supabase-js directly, not this endpoint) | Ambiguous — stale endpoint? Flag for §7 risk. |
| 13 | DELETE | `/functions/v1/manage-qrcode` | same file | `{ qrcode_id }` | No | Ambiguous — stale endpoint? |
| 14 | POST | `/functions/v1/create-qrcode` | `supabase/functions/create-qrcode/index.ts:51` | Same as #9 (superseded by gateway `/api/create-qrcode`) | No — gateway path is authoritative | Duplicate — flagged for deletion in §9 |
| 15 | POST | `/functions/v1/get-decrypted-messages` | `supabase/functions/get-decrypted-messages/index.ts:31` | `{ conversation_id?; limit?; before? }` | No | Ambiguous — dashboard may wire this up in future iterations |
| 16 | GET | `/functions/v1/usage-stats` | `supabase/functions/usage-stats/index.ts:23` | (query params only) | No | Ambiguous |
| — | POST | `/functions/v1/data-retention` | `supabase/functions/data-retention/index.ts` | (cron-only, service_role) | n/a | n/a — internal |
| — | POST | `/functions/v1/{agent,visitor}-ws-ticket` | `supabase/functions/{agent,visitor}-ws-ticket/index.ts` | Superseded by gateway paths #5 + #6 | No (gateway authoritative) | Duplicates — flagged in §9 |

**Inventory totals:** 9 gateway endpoints + 1 web-reachable Edge Function = **10 endpoints actually consumed by web/**. The Wave 1 surface area (endpoints **with a JSON request body** that web calls) is therefore **5** (gateway #6, #7, #8, #9 + Edge Function #10). #5 has no body. #10 is deferred to §9.

### 2.3 Drift findings (input for §4 tasks)

Numbered decisions. Each becomes a scenario in the T2 parity tests.

**Drift A — `visitor-ws-ticket` body is unenforced on web.**
- Web: `const requestBody: Record<string, string> = { qr_code_id: qrCodeId }` (then conditionally `requestBody.session_token = ...`).
- Gateway: reads `{ qr_code_id?: string; session_token?: string }` via `req.body as`. Manual `if (!qr_code_id)` 400.
- Decision: introduce `VisitorWsTicketRequest` TS interface + `visitorWsTicketRequestSchema` Zod; gateway wraps handler in `validateRequest(visitorWsTicketRequestSchema)`; web types the body as `VisitorWsTicketRequest`.

**Drift B — `messages` body is inline anonymous on web.**
- Web: builds `{ qr_code_id, session_token, limit: 50 }` with no named type.
- Gateway: destructures with `as` cast to anonymous shape.
- Functional gap: web hardcodes `limit: 50` and never sends `before` — pagination cursor unused. NOT fixed by contracts work (pure UI decision) but **documented explicitly** in the `MessagesHistoryRequest` interface JSDoc so future callers don't assume `before` is unsupported on the gateway side.
- Decision: introduce `MessagesHistoryRequest` + `messagesHistoryRequestSchema` (`{ qr_code_id: string, session_token: string, limit?: number (1–100), before?: string }`); gateway uses `validateRequest`; web uses the interface.

**Drift C — `create-qrcode.template` enum not enforced on web.**
- Web: `template: data.template` where `data.template` is a raw `string` state.
- Gateway: `VALID_QR_TEMPLATES = Set(['default', 'minimal', 'showcase', 'custom'])` at `create-qrcode.ts:18`, 400s if unknown.
- Decision: introduce `QR_TEMPLATES = ['default','minimal','showcase','custom'] as const` in `shared/contracts/http/qrcodes/types.ts`; Zod `z.enum(QR_TEMPLATES)`; web uses the union type `QrTemplate` so tsc catches typos at the call site.

**Drift D — `subscribe` email validation duplicated across boundary.**
- Gateway: Zod `.email()` + `.max(254)` (RFC 5321). Lives inline at `subscribe.ts:22`.
- Web: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` + literal `254`. Lives inline at `subscribe.ts:7`.
- Decision: export `SUBSCRIBE_EMAIL_MAX_LENGTH = 254` constant from `shared/contracts/http/subscribers/types.ts`; gateway lifts its Zod schema to `shared/contracts/http/subscribers/protocol.ts`; web imports the constant but keeps its lightweight client regex (web stays zod-free). Single source for the magic number.

**Drift E — `create-qrcode.profile_avatar` 600000 / regex duplicated.**
- Web: `data.profileAvatarDataUrl.length < 600000` + `/^data:image\/(png|jpeg|jpg|webp);base64,/i` at `page.tsx:1521`.
- Gateway helper: `MAX_DATA_URL_CHARS = 600_000` + `DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i` at `create-qrcode-avatar.ts:4-5`.
- Decision: export `PROFILE_AVATAR_MAX_DATA_URL_CHARS` and `PROFILE_AVATAR_DATA_URL_REGEX` from `shared/contracts/http/qrcodes/types.ts` (dependency-free). Both sides import. Gateway's `tryDecodeProfileAvatarDataUrl` stays (still owns the magic-byte kind check — server-trust-only).

**Drift F — `create-qrcode.system_prompt` silent truncation.**
- Gateway truncates >1000 chars and emits `warnings: ['system_prompt_truncated']` in response; web has no `maxLength` on its input or pre-flight warning.
- This is a **response-body semantics** concern (warnings array shape) plus a UX gap. Response bodies are out of scope; the request-body schema will bound `system_prompt` with `z.string().max(1000)` and gateway will stop silently truncating — it will **400** on oversized input instead, matching Wave 1's "no behaviour change" constraint is intentionally broken here only if the implementer flags it during code review. **Decision in T2d:** `system_prompt: z.string().max(1000).optional()` — but keep gateway's truncation branch as a feature flag `PHASE2_STRICT_SYSTEM_PROMPT` (default **off** in Wave 1) so any prod impact can be rolled back instantly. Spec reviewer must sign off.

**Drift G — `claim-agent` PATCH body has no shared type.**
- Web sends `{ agent_id: agent.id }` typed inline; Deno Edge Function reads `body.agent_id as string`.
- Decision: **out of Wave 1 scope** (Deno + Node type sharing adds its own design space — needs its own mini-plan). Log as §9 follow-up.

**Drift H (ambiguity, not a drift) — stale Edge Functions.**
- `manage-qrcode`, `create-qrcode` (Edge), `agent-ws-ticket` (Edge), `visitor-ws-ticket` (Edge): exist but web uses gateway paths or supabase-js directly. No web caller to align. Leave alone. Flag for `docs/refactor/execution-log.md` so a future cleanup wave can decide whether to delete them.

**Drift I — `/api/agent-ws-ticket` body is empty on purpose.**
- Body is not meaningful (header auth). No request-body schema needed — we still add a `z.object({}).strict()` schema so the middleware path is uniform and rejects surprise payloads (defense in depth). Low priority, may be included in T2a or dropped; implementer's call.

**Summary: 5 real drifts (A, B, C, D, E) + 1 semantic gap flagged (F) + 1 out-of-scope (G) + 1 ambiguity note (H) + 1 optional (I).** Phase 1 resolved 6 for WS. Same order of magnitude.

---

## §3 Target architecture

> **一句话给小白：** 新建 `shared/contracts/http/` 目录，按 "业务域" (ticket、message、subscriber、qrcode) 分子目录。每个接口写两个文件：`types.ts` 放 TypeScript 接口（网页可以 import），`protocol.ts` 放 Zod（只有网关 import）。Phase 1 的做法搬过来就行，格式一致才好维护。

### 3.1 Directory layout (proposed)

Organise by **domain noun** to match Phase 1 `ws/` (single domain). Domain subfolder per cluster of related endpoints; each file responsibility-focused per `writing-plans` skill guidance (small files over large).

```
shared/contracts/http/
├── index.ts                         # barrel (types-only re-exports + any domain constants)
├── tickets/
│   ├── types.ts                     # AgentWsTicketRequest, VisitorWsTicketRequest
│   └── protocol.ts                  # agentWsTicketRequestSchema, visitorWsTicketRequestSchema
├── messages/
│   ├── types.ts                     # MessagesHistoryRequest + MESSAGES_LIMIT_{MIN,MAX,DEFAULT}
│   └── protocol.ts                  # messagesHistoryRequestSchema
├── subscribers/
│   ├── types.ts                     # SubscribeRequest + SUBSCRIBE_EMAIL_MAX_LENGTH
│   └── protocol.ts                  # subscribeRequestSchema
└── qrcodes/
    ├── types.ts                     # CreateQrcodeRequest + QR_TEMPLATES + avatar constants
    └── protocol.ts                  # createQrcodeRequestSchema
```

**Why domain-grouped instead of per-endpoint?** Matches the Phase 1 `ws/` layout (one `types.ts` for all frames, one `protocol.ts` for all schemas). Phase 1's single folder works because WS frames are one domain. HTTP spans four domains today; splitting per domain keeps each `types.ts` under ~60 lines and mirrors the gateway's `routes/*.ts` file split. Per-endpoint folders would explode to eight+ files for low gain.

**Why NOT by endpoint path?** e.g. `http/api/visitor-ws-ticket/types.ts` — would couple SSoT layout to URL structure; URLs may renumber/restructure before contracts do.

### 3.2 Split rule (mirrors Phase 1)

- `types.ts` — **zero runtime deps**. TS interfaces, `readonly` const tuples (for enums), numeric constants. Safe for any consumer (Next.js client bundles included).
- `protocol.ts` — **imports `zod`** (already in `shared/package.json` post-Phase 1 FU2). Only gateway imports from here. `z.infer<typeof schema>` must be assignable to the hand-written interface (parity tests enforce this).
- **Barrel `http/index.ts` re-exports only `types/*`**, NEVER `protocol/*` — Phase 1 rule. Prevents accidental web-side zod import.

### 3.3 `validateRequest` middleware shape

One generic helper lives at `gateway/src/middleware/validate-request.ts` (new file). Not in `shared/` — Express-specific, gateway-only.

```typescript
// Skeleton for T1 (actual implementation in T2a alongside the first handler rewrite).
import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export const validateRequest =
  <T>(schema: ZodType<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const path = firstIssue?.path.join('.') || '';
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: `Validation failed${path ? ` at ${path}` : ''}: ${firstIssue?.message ?? 'unknown error'}`,
        },
      });
      return;
    }
    // Replace req.body with the parsed (and coerced) value so handlers can trust types.
    req.body = result.data;
    next();
  };
```

Error shape is **identical** to today's inline 400s (`{ error: { code, message } }` per `gateway/src/middleware/error-handler.ts:26`). The `code` is always `invalid_request` for body-shape failures — matches today's `create-qrcode.ts` convention and supersedes the mix of `bad_request` / `invalid_request` currently in the codebase. **No behaviour change visible to clients** — verified by the existing backend test suites (§5).

### 3.4 Error propagation — what changes for clients

Nothing. HTTP status stays `400`; JSON error body stays `{ error: { code, message } }`. The `code` value is normalised to `invalid_request` for body-validation failures (today's code is sometimes `bad_request`; this is a **narrow, intentional** consolidation flagged to the spec reviewer). The `message` is now auto-generated from Zod issues — still a human-readable string; existing backend tests that assert substring match (not exact string equality) continue to pass. Tests that assert exact strings are updated in the same commit as the handler rewrite (see §4 T2b, T2d).

### 3.5 `scripts/sync-contracts.mjs` changes

**None required for Wave 1.** The sync script copies `shared/contracts/ws/types.ts` → `supabase/functions/_shared/contracts/ws/types.ts` because Edge Functions consume WS types. HTTP contracts are **not** consumed by any Deno Edge Function in Wave 1 scope (Drift G is deferred). Therefore no new `ENTRIES` entry is added to the script in this wave. A one-sentence note is added to `shared/contracts/README.md` in T1 making this explicit: "HTTP contracts are node/web-only in Wave 1; no supabase sync."

If Wave 1b (or Phase 2 Wave 2) unifies `claim-agent` with shared contracts, that wave adds `{ src: 'shared/contracts/http/…', dest: 'supabase/functions/_shared/contracts/http/…' }` to the `ENTRIES` array and extends the existing test suite. Not now.

### 3.6 `tsconfig` / path alias updates

**None required.** Phase 1 already set:
- `gateway/tsconfig.json`: `"@shared/contracts/*": ["../shared/contracts/*"]`, `include: ["src/**/*", "../shared/contracts/**/*"]`.
- `web/tsconfig.json`: `"@shared/contracts/*": ["../shared/contracts/*"]`, `include: […, "../shared/contracts/**/*.ts"]`.

Both globs match `shared/contracts/http/**/*.ts` transparently. No tsconfig touch-up needed.

### 3.7 Lint / ESLint boundaries

Web has `no-restricted-paths` rule lightly enforced. Phase 1 T4.3 confirmed `@shared/contracts/ws/types` imports pass lint. Same lint config will accept `@shared/contracts/http/*/types` without change. **Action:** T3 adds one allowlist probe — if lint fails, implementer halts and reports BLOCKED rather than loosening the rule silently.

---

## §4 Task breakdown

> **一句话给小白：** 把上面架构拆成一个个能在 30 分钟内做完的小任务。每个任务都有明确的 "要改哪些文件"、"怎么验证"、"提交的时候 commit message 该怎么写"。顺序不能乱，前一个不绿后一个不动。

### Dependency graph

```
T1 (scaffold http/ + validateRequest middleware + its tests)
  ↓
T2a (tickets)    ── serial ─→ T2b (messages) ── serial ─→ T2c (subscribers) ── serial ─→ T2d (qrcodes)
  ↓
T3 (web callers switch to shared types)
  ↓
T4 (decide contracts-sync-check scope; update README + maybe CI)
  ↓
T5 (docs — append recipe to qrclaw-map/map.md)

T6 (optional — regression tests for drifts D/E) may be dispatched in parallel with T3 by a second subagent.
C1 (final verification) at the end.
```

T2a-d are serial, not parallel, because every T2* touches `gateway/tsconfig.json` emit layout adjacently to `gateway/src/middleware/validate-request.ts` — keeping serial preserves clean git history (same rationale as Phase 1 T3/T4).

### Standard task template

Every task below has these mandatory subsections:

- **Goal** — one-sentence outcome.
- **Files touched (allowlist)** — explicit, `Create:` / `Modify:`. Any change outside this list HALTS the task and consults the user (§6).
- **Tests-first** — new failing test written before implementation (per `superpowers:test-driven-development`).
- **Verification** — exact commands + expected output.
- **Done means** — checklist of observable post-conditions.
- **Reviewer checkpoint** — spec reviewer + code reviewer signals per `superpowers:subagent-driven-development`.

---

### Task T1 — Scaffold `shared/contracts/http/` + `validateRequest` middleware

**Goal:** Create the empty HTTP contracts tree, the gateway middleware, and its failing tests. Later T2 tasks slot schemas in.

**Files (allowlist):**
- Create: `shared/contracts/http/index.ts` (barrel, re-exports per-domain `types` modules — initially empty)
- Create: `shared/contracts/http/tickets/types.ts` (skeleton — filled in T2a)
- Create: `shared/contracts/http/messages/types.ts` (skeleton — filled in T2b)
- Create: `shared/contracts/http/subscribers/types.ts` (skeleton — filled in T2c)
- Create: `shared/contracts/http/qrcodes/types.ts` (skeleton — filled in T2d)
- Create: `gateway/src/middleware/validate-request.ts`
- Create: `tests/unit/backend/validate-request.test.ts`
- Modify: `shared/contracts/README.md` (append a "HTTP contracts" section + "no supabase sync in Wave 1" note)

**Tests-first:**
- `tests/unit/backend/validate-request.test.ts` asserts four cases: (a) valid body passes through and mutates `req.body` to the parsed data; (b) invalid body returns `400` with `{ error: { code: 'invalid_request', message: /Validation failed/ } }`; (c) the `next` callback is called exactly once for valid, zero times for invalid; (d) errors include the failing JSON path (e.g. `at payload.email`).

**Verification:**
```
cd tests && npx vitest run unit/backend/validate-request.test.ts
# Expected: FAIL before implementation, PASS after.
cd gateway && npm run typecheck
# Expected: 0 errors (skeleton types compile; middleware imports zod from shared/).
```

**Done means:**
- All four middleware tests green.
- `shared/contracts/http/index.ts` exports nothing substantive yet but compiles.
- `gateway/src/middleware/validate-request.ts` reusable by T2a onward.
- Commit message: `feat(contracts): scaffold shared/contracts/http + validateRequest middleware`.

**Reviewer checkpoint:**
- Spec reviewer verifies: middleware error shape matches `§3.4`; no new dependencies added to `shared/`, `gateway/`, `web/`, or `tests/` (Zod already present).
- Code reviewer verifies: middleware is generic over schema type; does not mutate `req.body` in failure case; handles non-object bodies safely.

---

### Task T2a — `tickets` domain (2 endpoints)

**Goal:** Lift `/api/visitor-ws-ticket` body validation into `shared/contracts/http/tickets/`. Wire gateway handler via `validateRequest`. (Include `/api/agent-ws-ticket` via an empty `strict()` schema — Drift I; optional per implementer call, but recommended for uniformity.)

**Files (allowlist):**
- Modify: `shared/contracts/http/tickets/types.ts` (fill `VisitorWsTicketRequest`, `AgentWsTicketRequest`)
- Create: `shared/contracts/http/tickets/protocol.ts`
- Modify: `shared/contracts/http/index.ts` (add `export * from './tickets/types'` — types-only)
- Modify: `gateway/src/routes/ticket.ts` (wrap two handlers with `validateRequest`; delete inline `if (!qr_code_id)` branches that the schema now covers)
- Create: `tests/unit/shared/contracts-http-tickets.test.ts` (parity tests + schema-accepts/rejects cases — 6 cases)
- Modify: `tests/unit/backend/ticket-route.test.ts` (update any asserts that pinned exact 400 message strings; asserts on `code: 'invalid_request'` stay — it matches today's code for this handler already)

**Tests-first:**
1. `visitorWsTicketRequestSchema` accepts `{ qr_code_id: 'abc' }`.
2. …accepts `{ qr_code_id: 'abc', session_token: 'vis_1' }`.
3. …rejects `{}` (missing qr_code_id).
4. …rejects `{ qr_code_id: 123 }` (wrong type).
5. Type parity: `expectTypeOf<z.infer<typeof visitorWsTicketRequestSchema>>().toMatchTypeOf<VisitorWsTicketRequest>()`.
6. Symmetric: `agentWsTicketRequestSchema` accepts `{}`, rejects `{ unexpected: true }` (strict).

**Verification:**
```
cd tests && npx vitest run unit/shared/contracts-http-tickets.test.ts unit/backend/ticket-route.test.ts
# Expected: all green.
cd gateway && npm run typecheck && npm run build
# Expected: 0 errors. Dist layout unchanged (Phase 1 already raised rootDir).
```

**Done means:**
- Gateway `ticket.ts` no longer contains `if (!qr_code_id)` or `req.body as { qr_code_id?: string; ... }`. Handler signature narrows to the `VisitorWsTicketRequest` type automatically via middleware.
- `tests/unit/backend/ticket-route.test.ts` still covers the same auth + ticket-mint paths; only body-shape errors route through Zod.
- Commit: `refactor(contracts/http): lift visitor-ws-ticket validation into shared/contracts/http/tickets`.

**Reviewer checkpoint:**
- Spec reviewer verifies: §2 Drift A fully resolved; parity test exists.
- Code reviewer verifies: Zod schema is `.strict()` (matches Phase 1 `protocol.ts`); no leakage of supabase credential checks into the schema (those stay in the handler).

---

### Task T2b — `messages` domain (1 endpoint)

**Goal:** Lift `/api/messages` body validation. Document the pagination gap (limit hardcoded, before never sent) in the interface JSDoc.

**Files (allowlist):**
- Modify: `shared/contracts/http/messages/types.ts` (`MessagesHistoryRequest` + `MESSAGES_LIMIT_MIN=1`, `MESSAGES_LIMIT_MAX=100`, `MESSAGES_LIMIT_DEFAULT=50`)
- Create: `shared/contracts/http/messages/protocol.ts`
- Modify: `shared/contracts/http/index.ts`
- Modify: `gateway/src/routes/messages.ts` (wrap handler; replace manual `if (!qr_code_id || !session_token)` + `Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT)` with schema-enforced bounds using `.default(MESSAGES_LIMIT_DEFAULT)` + `.min(1).max(100)`)
- Create: `tests/unit/shared/contracts-http-messages.test.ts` (5 cases: accept minimum, accept with before, reject missing, reject limit=0, reject limit=101)
- Modify: `tests/unit/backend/messages-history.test.ts` (same message-string caveat as T2a)

**Tests-first:** see above; all failures before `protocol.ts` is written.

**Verification:**
```
cd tests && npx vitest run unit/shared/contracts-http-messages.test.ts unit/backend/messages-history.test.ts
cd gateway && npm run typecheck
```

**Done means:** Drift B resolved. `pageLimit` math removed from handler; `req.body.limit` is already normalised by the schema.

**Commit:** `refactor(contracts/http): lift messages-history validation into shared/contracts/http/messages`.

**Reviewer checkpoint:** spec reviewer checks that `before` stays optional string (no date-format validation — keep it parser-friendly so iso strings, epoch strings, etc. all work); code reviewer confirms no new caps were invented (all numbers traced to handler or existing constants).

---

### Task T2c — `subscribers` domain (1 endpoint)

**Goal:** Lift inline `subscribeSchema` from `gateway/src/routes/subscribe.ts:22` into `shared/contracts/http/subscribers/protocol.ts`. Export the `254` constant to kill Drift D's duplication.

**Files (allowlist):**
- Modify: `shared/contracts/http/subscribers/types.ts` (`SubscribeRequest` + `SUBSCRIBE_EMAIL_MAX_LENGTH = 254`)
- Create: `shared/contracts/http/subscribers/protocol.ts` (verbatim Zod lift from `subscribe.ts:22-24`; no new rules invented)
- Modify: `shared/contracts/http/index.ts`
- Modify: `gateway/src/routes/subscribe.ts` (delete inline `subscribeSchema`; replace `validateSubscribeInput` → import and use `subscribeRequestSchema`; keep `normalizeEmail` export — it's business logic)
- Modify: `tests/unit/backend/subscribe-api.test.ts` (imports change from `../../../gateway/src/routes/subscribe` → both the lift + backward-compat re-export if any test consumes `subscribeSchema` directly)
- Create: `tests/unit/shared/contracts-http-subscribers.test.ts` (4 cases + parity)

**Tests-first:** ensure no regression of existing 27-ish subscribe tests. New parity test proves `z.infer<>` matches `SubscribeRequest`.

**Verification:**
```
cd tests && npx vitest run unit/shared/contracts-http-subscribers.test.ts unit/backend/subscribe-api.test.ts
cd gateway && npm run typecheck
```

**Done means:** Drift D resolved (one `254` constant, one Zod schema); web still owns its lightweight client regex — but now imports `SUBSCRIBE_EMAIL_MAX_LENGTH` from shared (web-side change happens in **T3**, not here).

**Commit:** `refactor(contracts/http): lift subscribe validation into shared/contracts/http/subscribers`.

**Reviewer checkpoint:** spec reviewer confirms Zod behaviour is literally unchanged (copy-paste from gateway); code reviewer confirms no accidental behaviour change (rate limit, upsert, 429 branch untouched).

---

### Task T2d — `qrcodes` domain (1 endpoint, biggest payload)

**Goal:** Lift `/api/create-qrcode` validation. Resolve Drifts C + E + F.

**Files (allowlist):**
- Modify: `shared/contracts/http/qrcodes/types.ts`:
  - `CreateQrcodeRequest` interface
  - `QR_TEMPLATES = ['default','minimal','showcase','custom'] as const`; `type QrTemplate = typeof QR_TEMPLATES[number]`
  - `PROFILE_AVATAR_MAX_DATA_URL_CHARS = 600_000`
  - `PROFILE_AVATAR_DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,/i` (Note: gateway's server-side regex has a captured body group `(.+)` — keep server regex separate; web only needs the prefix test. Document this split in the JSDoc.)
  - `SYSTEM_PROMPT_MAX_LENGTH = 1000`
- Create: `shared/contracts/http/qrcodes/protocol.ts` (`createQrcodeRequestSchema` with `template: z.enum(QR_TEMPLATES).optional()`, `system_prompt: z.string().trim().max(SYSTEM_PROMPT_MAX_LENGTH).optional()`, `profile_avatar: z.string().max(PROFILE_AVATAR_MAX_DATA_URL_CHARS).optional()`)
- Modify: `shared/contracts/http/index.ts`
- Modify: `gateway/src/routes/create-qrcode.ts`:
  - Wrap handler with `validateRequest(createQrcodeRequestSchema)`
  - Delete `VALID_QR_TEMPLATES` set (now comes from shared)
  - Delete `if (!agent_id || typeof agent_id !== 'string')` branches
  - **Keep** `tryDecodeProfileAvatarDataUrl` — server-only magic-byte check stays (security)
  - **Keep** the `system_prompt_truncated` warning branch gated behind a constant `PHASE2_STRICT_SYSTEM_PROMPT = false` (default off) so Wave 1 is a pure refactor. Spec reviewer signs off on this gate.
- Modify: `gateway/src/routes/create-qrcode-avatar.ts`:
  - `MAX_DATA_URL_CHARS` → import from `@shared/contracts/http/qrcodes/types`
  - `DATA_URL_RE` stays (has capture group for decode)
- Create: `tests/unit/shared/contracts-http-qrcodes.test.ts` (8 cases: accept minimal body, accept full body with avatar, reject invalid template, reject oversized system_prompt, reject oversized profile_avatar, parity test, reject missing agent_id, reject empty name)
- Modify: `tests/unit/backend/create-qrcode-profile.test.ts` (if any test pins an exact 400 message; assertions on `code: 'invalid_request'` remain — matches today)
- Modify: `tests/unit/backend/create-qrcode-avatar.test.ts` (import path update if it referenced `MAX_DATA_URL_CHARS` directly)

**Tests-first:** 8 new cases + green existing suite.

**Verification:**
```
cd tests && npx vitest run unit/shared/contracts-http-qrcodes.test.ts unit/backend/create-qrcode-profile.test.ts unit/backend/create-qrcode-avatar.test.ts
cd gateway && npm run typecheck && npm run build
```

**Done means:** Drift C + E fully resolved; Drift F flagged with a feature gate (no behaviour change today).

**Commit:** `refactor(contracts/http): lift create-qrcode validation into shared/contracts/http/qrcodes`.

**Reviewer checkpoint:**
- Spec reviewer confirms: `QR_TEMPLATES` constant is single-source; `PHASE2_STRICT_SYSTEM_PROMPT` gate logged in plan + execution-log so rollback path is obvious; feature gate default is `false`.
- Code reviewer confirms: `tryDecodeProfileAvatarDataUrl` still runs (magic-byte check mustn't be regressed); owner-auth + storage upload branches untouched.

---

### Task T3 — Web callers consume shared types

**Goal:** Every web-side HTTP payload is typed against the shared interface. Web imports zero Zod.

**Files (allowlist):**
- Modify: `web/src/lib/ws/ticket.ts` (type `requestBody: VisitorWsTicketRequest` instead of `Record<string, string>`; import from `@shared/contracts/http/tickets/types`)
- Modify: `web/src/lib/ws/history.ts` (type body param against `MessagesHistoryRequest`)
- Modify: `web/src/lib/subscribe.ts` (import `SUBSCRIBE_EMAIL_MAX_LENGTH` from shared; keep local regex)
- Modify: `web/src/app/(dashboard)/qrcodes/create/page.tsx` (type `payload` against `CreateQrcodeRequest`; import `QR_TEMPLATES`, `PROFILE_AVATAR_MAX_DATA_URL_CHARS`, `PROFILE_AVATAR_DATA_URL_REGEX`)

**Tests-first:** web has no unit tests for these specific files; rely on **tsc** as the test (type drift surfaces as compilation error). Phase 1 T4 used the same pattern.

**Verification:**
```
cd web && npx tsc --noEmit
# Expected: 0 errors. Any field mismatch shows up here.
cd web && npm run lint
# Expected: pass. If no-restricted-paths trips on @shared/contracts/http, STOP and consult user (do not loosen rule).
cd web && NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder \
  NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001 \
  NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:3001/ws \
  npm run build
# Expected: success, no warnings new to Wave 1.
grep -r "zod" web/.next/server/app/ 2>/dev/null | head -5 || echo "no zod leakage"
# Expected: "no zod leakage".
```

**Done means:** no `Record<string, string>` or anonymous `{ qr_code_id, session_token, limit }` literals remain in web HTTP callers.

**Commit:** `refactor(web): consume shared/contracts/http types (zod-free)`.

**Reviewer checkpoint:** spec reviewer confirms web bundle stays zod-free (Phase 1 guardrail); code reviewer spot-checks the three web call sites and the page component for inline-body cleanup.

---

### Task T4 — Sync-check scope decision + README

**Goal:** Make it explicit in code and docs that HTTP contracts do **not** flow into supabase (Wave 1 only). Prevent future contributors from wondering if they're supposed to run `sync-contracts`.

**Files (allowlist):**
- Modify: `shared/contracts/README.md` — append section "HTTP contracts": "HTTP contracts are gateway + web only in Wave 1. No Supabase sync; `scripts/sync-contracts.mjs --check` does not cover `shared/contracts/http/**`. Wave 1b / Phase 2 Wave 2 may extend this if `claim-agent` is brought into the SSoT."
- Modify: `.github/workflows/ci.yml` — no change. The existing `contracts-sync-check` job already covers `ws/` only; it does not need to grow. **Decision justified here; zero CI diff**.

**Tests-first:** n/a (doc-only).

**Verification:**
```
# Confirm the existing sync-check job still passes with nothing added.
cd /Users/zeze/qrclaw && node scripts/sync-contracts.mjs --check && echo OK
# Confirm workflow still parses.
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```

**Done means:** README paragraph lands; any subagent reading `qrclaw-map` understands that `shared/contracts/http/` is not synced.

**Commit:** `docs(contracts): document HTTP scope of Wave 1 (no supabase sync)`.

**Reviewer checkpoint:** spec reviewer reads the README delta; confirms no CI gate weakening.

---

### Task T5 — Update `qrclaw-map` with an "add a new endpoint" recipe

**Goal:** Future agents stumbling onto "add a new POST route" should find a 6-step recipe referencing this plan.

**Files (allowlist):**
- Modify: `.claude/skills/qrclaw-map/map.md`:
  - Under "Cross-cutting contracts" add a row for HTTP contracts pointing at `shared/contracts/http/`.
  - New section **"Adding a new HTTP endpoint"** with 6 numbered steps: (1) decide domain subfolder, (2) add TS interface to `types.ts`, (3) add Zod schema to `protocol.ts`, (4) write parity test, (5) wire gateway handler via `validateRequest`, (6) type web caller. Reference this plan by path.

**Tests-first:** n/a.

**Verification:** `wc -l .claude/skills/qrclaw-map/map.md` increases; `head .claude/skills/qrclaw-map/map.md` frontmatter intact.

**Commit:** `docs(skill): extend qrclaw-map with add-http-endpoint recipe`.

**Reviewer checkpoint:** spec reviewer reads the recipe and tries to mentally add a hypothetical `/api/feedback` endpoint following it.

---

### Task T6 (optional) — Targeted regression tests for pre-existing drifts

**Goal:** For any drift in §2 that shipped a production bug, lock in the fix with a red→green test now so the refactor can't silently re-introduce it.

Dispatched **only** if the user flags, during review, that a specific drift caused a real incident. Today's §2 analysis suggests candidates:

- **Drift E avatar regex** — has any prod report mentioned rejected 600k-exactly avatars? If yes, write a boundary test that constructs a 600000-char data URL and asserts the gateway accepts it (or rejects it — whichever the product decision is), before T2d lands. If no prod incident, skip this.
- **Drift C template enum** — a "why isn't 'classic' accepted?" style ticket would justify a table-driven test hitting each enum value.

**Files (allowlist, conditional):**
- Create: `tests/unit/backend/create-qrcode-boundaries.test.ts` (if Drift E incident confirmed)
- Modify: `tests/unit/backend/create-qrcode-profile.test.ts` (if Drift C incident confirmed)

**Tests-first / verification:** standard TDD, red first.

**Commit (if executed):** `test(create-qrcode): lock in <drift> regression before Wave 1 lift`.

**Reviewer checkpoint:** spec reviewer agrees the incident is real before executor spends time. If no incident cited, **skip T6** — tests covering §2 already live in existing suites.

---

### Checkpoint C1 — Final verification

Run the full six-pane suite (mirrors `docs/refactor/execution-log.md` Wave 0 §"Final verification"):

```
# 1. Prettier
cd /Users/zeze/qrclaw && npm run format:check
# 2. Contracts sync (WS only — unchanged by Wave 1)
node scripts/sync-contracts.mjs --check
# 3. Gateway tsc + build
cd gateway && npm run typecheck && npm run build
# 4. Web tsc
cd /Users/zeze/qrclaw/web && npx tsc --noEmit
# 5. Vitest
cd /Users/zeze/qrclaw/tests && npx vitest run
# Expected: 696+N passing, 0 type errors. N = new parity tests (≥23: 6 tickets + 5 messages + 4 subscribers + 8 qrcodes ≈ 23, minus overlap with existing suites).
# 6. Workflows yaml
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```

Append entry to `docs/refactor/execution-log.md` with commit SHAs, drift resolutions, any deviations. Commit: `docs(refactor): record Phase 2 Wave 1 completion in execution log`.

---

## §5 Verification strategy

> **一句话给小白：** 每个任务做完都要证明：(a) 新 Zod 拒绝了坏数据、(b) 新 TS 类型和 Zod 保持同步、(c) 没改坏已有业务。具体命令全在这一节。

### 5.1 Per-task verification (TDD discipline)

- Each T2* task runs its own new Zod-parity tests + the backend route suite that already covers that endpoint (`ticket-route.test.ts`, `messages-history.test.ts`, `subscribe-api.test.ts`, `create-qrcode-profile.test.ts`, `create-qrcode-avatar.test.ts`). Red first, green after.
- T3 verification is **web tsc + web build + bundle grep for `zod`**. Same pattern Phase 1 T4 established (see plan §T4.3-5).

### 5.2 Integration smoke (manual, once per wave before marking complete)

Start gateway locally, hit each endpoint twice — one valid, one invalid payload. Expected: 200/201 for valid; 400 with `{ error: { code: 'invalid_request', message: /Validation failed/ } }` for invalid.

```
cd /Users/zeze/qrclaw/gateway && npm run dev &
GATEWAY=http://localhost:3001

# Valid visitor-ws-ticket
curl -s -X POST $GATEWAY/api/visitor-ws-ticket \
  -H 'Content-Type: application/json' \
  -d '{"qr_code_id":"00000000-0000-0000-0000-000000000000"}' | head -c 200

# Invalid (missing qr_code_id)
curl -s -X POST $GATEWAY/api/visitor-ws-ticket \
  -H 'Content-Type: application/json' -d '{}'
# Expected: {"error":{"code":"invalid_request","message":"Validation failed at qr_code_id: Required"}}

# Valid messages
curl -s -X POST $GATEWAY/api/messages -H 'Content-Type: application/json' \
  -d '{"qr_code_id":"abc","session_token":"vis_1"}' | head -c 200

# Invalid messages (limit out of range)
curl -s -X POST $GATEWAY/api/messages -H 'Content-Type: application/json' \
  -d '{"qr_code_id":"abc","session_token":"vis_1","limit":999}'
# Expected: 400 invalid_request at limit.

# Valid subscribe
curl -s -X POST $GATEWAY/api/subscribe -H 'Content-Type: application/json' \
  -d '{"email":"[email protected]"}'

# Invalid subscribe
curl -s -X POST $GATEWAY/api/subscribe -H 'Content-Type: application/json' \
  -d '{"email":"not-an-email"}'
# Expected: 400 invalid_request at email.

# create-qrcode — skipped in smoke (requires JWT); covered by unit tests.
```

Commit nothing from smoke; it's a gate before C1, not a deliverable.

### 5.3 Contract parity test pattern (reuse Phase 1 idiom)

Every `tests/unit/shared/contracts-http-<domain>.test.ts` uses the exact pattern from `tests/unit/shared/contracts-ws-protocol.test.ts`:

```typescript
import { expectTypeOf } from 'vitest';
import type { z } from 'zod';
import { visitorWsTicketRequestSchema } from '../../../shared/contracts/http/tickets/protocol';
import type { VisitorWsTicketRequest } from '../../../shared/contracts/http/tickets/types';

it('z.infer matches VisitorWsTicketRequest', () => {
  expectTypeOf<z.infer<typeof visitorWsTicketRequestSchema>>().toMatchTypeOf<VisitorWsTicketRequest>();
});
```

Phase 1's Drift D1 (`WSFrame.id` inheritance) surfaced because `.toEqualTypeOf` was stronger than `.toMatchTypeOf`; we prefer `.toMatchTypeOf` here (asymmetric match — schema output widens into the TS interface) because request-body interfaces intentionally allow looser readers. If a specific field needs strict parity, upgrade to `.toEqualTypeOf` case-by-case.

### 5.4 Six-pane final verification

Run C1 block in §4. All six must be green before landing the execution-log commit.

### 5.5 Pre-existing test suites to keep green (no intentional changes)

- `tests/unit/backend/ticket-verifier.test.ts` (Bearer/ticket JWT logic — untouched)
- `tests/unit/frontend/create-qrcode-display.test.ts` + `tests/unit/frontend/create-qrcode-direct.test.ts` (response-display logic — untouched)
- All WS test files — untouched (Wave 2 territory)

---

## §6 Execution protocol

> **一句话给小白：** 谁做、怎么复查、什么时候停下来找人，这一节把这些讲清楚。Phase 1 已经跑过一轮，照样学即可。

### 6.1 Roles (per `superpowers:subagent-driven-development`)

- **Orchestrator** (primary conversation agent): dispatches subagents, reviews between tasks, updates todos.
- **Implementer subagent** (serial, one per task): executes a single task end-to-end. Fresh context each time.
- **Spec reviewer subagent** (parallel, after each task): re-reads the task against §2 drifts + §3 architecture; issues DONE_CLEAN / DONE_WITH_CONCERNS / BLOCKED.
- **Code reviewer subagent** (parallel, after each task): reads the diff for typos, missing error branches, and adherence to Phase 1 style.

### 6.2 Commit discipline

- **One logical change per commit.** Match Phase 1: 7–8 commits total for Wave 1.
- **Conventional Commits**: `feat(contracts): …`, `refactor(contracts/http): …`, `docs(contracts): …`.
- **Commit body** references this plan: `Task T2b of docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`.
- **No mixing** schema lifts with unrelated cleanups; if discovered in passing, note in the execution log follow-ups section and leave for later.

### 6.3 HALT conditions — when to stop and consult the user

Implementer must STOP and return a BLOCKED report if any of the following triggers:

1. Spec reviewer returns `DONE_WITH_CONCERNS` **more than once** on the same task (escalation signal).
2. Any diff lands **outside** the task's files-touched allowlist (even one-line drive-by).
3. A new dependency is added to `shared/package.json`, `gateway/package.json`, `web/package.json`, or `tests/package.json` (Wave 1 explicitly needs zero new deps).
4. Web lint flags `no-restricted-paths` (do NOT loosen the rule — report instead).
5. A backend test fails with a message-string mismatch that isn't trivially updatable (might indicate a real semantic regression).
6. `PHASE2_STRICT_SYSTEM_PROMPT` gate (Drift F) needs to flip to `true` to make a test pass (means Wave 1 scope is changing — escalate).
7. Any Drift G / H / I decision needs to change (supabase sync surface broadens).

### 6.4 Self-audit before each commit

Per `superpowers:verification-before-completion` — evidence before assertions.

```
git diff --ignore-all-space --stat    # Confirm files touched == allowlist.
git diff --ignore-all-space path/a path/b path/c    # Spot-check three probe files.
# Run the task's verification block; paste exit code + last 5 lines of output into commit message if novel.
```

Only then `git add <allowlist>` + `git commit`.

### 6.5 Between-task review

Orchestrator runs, in parallel:

- Spec reviewer: reads plan §2 + task section, reads diff, signs off.
- Code reviewer: reads diff + run `git log -p HEAD` for last 2 commits context.

Both must sign `DONE_CLEAN` (or orchestrator writes a capture for `DONE_WITH_CONCERNS` and decides). Then the next task is dispatched.

---

## §7 Risk register

> **一句话给小白：** 这里列出已知的坑和风险 —— 有没有多部分上传？agent SDK 会不会一起挂掉？这些 Wave 1 之前就得想清楚。

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Multipart / file uploads** bypass JSON-Zod. Is `profile_avatar` a file upload or JSON data-URL? | Low (confirmed JSON data-URL from §2 source read) | High if wrong | §2 inventory confirms `create-qrcode` uses JSON with a base64 data-URL — NOT multipart. No Express `multer` / `busboy` in gateway. Risk closed unless a new endpoint changes this. Document in `shared/contracts/http/README.md`: "If you introduce multipart, contracts/http is not your layer — add a separate schema file and middleware." |
| R2 | **`scripts/agent-sdk/*` also sends request bodies**. If the SDK sends a body shape the new schema rejects, agents break in prod. | Low | High (agents authenticate via `/api/agent-ws-ticket` which has empty body; only `visitor-ws-ticket` + `messages` are potentially SDK-reachable) | Grep confirms (§2 research) the SDK only hits `/api/visitor-ws-ticket` and `/api/agent-ws-ticket`. Both body shapes the SDK sends match the schemas we define. **Mitigation:** T2a adds one explicit test `visitorWsTicketRequestSchema` accepts the exact SDK-formatted body (copied from `scripts/agent-sdk/test-visitor-openclaw.ts:8-12`). |
| R3 | **Supabase Edge Functions proxy to gateway** — type propagation. | None today (no proxying in current code) | n/a | `supabase/functions/{agent,visitor}-ws-ticket/` are **standalone duplicates** of gateway endpoints, not proxies. Deletion is a §9 follow-up — NOT Wave 1. |
| R4 | **Shared zod dependency implications.** `shared/package.json` already owns zod (Phase 1 FU2). HTTP schemas reuse the same version. | Low | Low | Any Zod upgrade in the future touches one place — confirmed by Phase 1 FU2 docs. No mitigation needed beyond keeping that rule. |
| R5 | **`PHASE2_STRICT_SYSTEM_PROMPT` gate left in code** could rot. | Medium over months | Low | Added to `docs/refactor/execution-log.md` follow-up list the moment T2d lands. Next wave flips it on deliberately, or it gets deleted. |
| R6 | **Normalisation of error `code` from `bad_request` → `invalid_request`** (§3.4) could break a client that matches on the string. | Low (web only matches on `message` / `status`, not `code` in the callers we reviewed) | Medium if a mobile client exists somewhere | Grep `web/src` for `'bad_request'` in T3 — expected zero hits. If any found, STOP and escalate. |
| R7 | **Middleware ordering** — `validateRequest` runs before business-logic middleware (e.g. `jwtAuthMiddleware` on `/api/create-qrcode`). If auth returns 401, validation never runs → unchanged. If validation runs first and returns 400 for unauth request, attacker learns field names. | Low | Low (field names are public API) | Keep `jwtAuthMiddleware` **first** on `/api/create-qrcode` — same as today (`createQrcodeRouter.post('/api/create-qrcode', jwtAuthMiddleware, validateRequest(schema), handleCreateQrcode)`). T2d explicitly lists this order. |
| R8 | **Zod error messages drift between versions** → tests that assert exact strings break on Zod upgrade. | Medium | Low (tests only, not prod) | Parity + backend tests assert `/Validation failed/` regex, never exact strings. Codified in §5.3. |

---

## §8 Local delivery vs GitHub boundary

> **一句话给小白：** 有些东西在本地能验证，但是 CI 里得等代码推到远端才真正跑。这张表让我们不会假装 "CI 绿了"。

Mirrors `docs/refactor/execution-log.md` Wave 0 pattern. The repo currently has no GitHub remote (per Phase 1 constraint), so CI job outcomes are simulated locally.

| Artifact | Local-verified | Awaits first GitHub run |
|---|---|---|
| `shared/contracts/http/**/*.ts` | vitest + tsc green | — (pure code, no infra) |
| `gateway/src/middleware/validate-request.ts` | unit tests + gateway build | — |
| `gateway/src/routes/*.ts` (T2a-d diffs) | `npm run build` + updated backend test suite | Gateway deploy workflow (`deploy-gateway.yml`) will redeploy on push to `main` |
| `web/src/lib/**/*.ts` + `web/src/app/.../page.tsx` | `next build` + `tsc --noEmit` + `grep zod` empty | Next.js preview build (Vercel) on PR |
| `shared/contracts/README.md`, `.claude/skills/qrclaw-map/map.md` | `wc -l` + `head -5` checks | — (doc-only) |
| `.github/workflows/ci.yml` | **no change** in Wave 1 | existing `contracts-sync-check` job re-runs (expected green — unchanged) |
| `docs/refactor/execution-log.md` append | file diff + timestamp | — |

No new workflow files. No new secrets. No new environment variables. This wave is pure code + docs — infra untouched.

---

## §9 Known follow-ups explicitly out of scope

> **一句话给小白：** 这些东西值得做，但不是这一波。留给下一波的人一个清楚的列表，比藏在脑子里强。

1. **Response body Zod validation.** Punted by user. Gateway is the trusted producer today; revisit if multi-gateway or third-party producers appear. Would reuse the `validateRequest` mechanism but on the outbound side, likely as a **dev-only** assertion (not in prod hot path).
2. **OpenAPI generation from Zod.** Deliberately out of scope. If we ever grow a public API + external SDK consumers, revisit `zod-to-openapi` or `@asteasolutions/zod-to-openapi`.
3. **tRPC.** Out of scope. Team is small, wire format is stable, added tooling ROI negative today.
4. **Supabase Edge Function contract unification (Drift G).** `PATCH /functions/v1/claim-agent` needs shared types with web. Deno/Node type sharing + sync script extension together is its own plan. Candidate: Wave 1b or Phase 2 Wave 2.
5. **Stale duplicate Edge Functions.** `manage-qrcode`, Edge `create-qrcode`, Edge `agent-ws-ticket`, Edge `visitor-ws-ticket`, `get-decrypted-messages` — gateway has authoritative versions or web doesn't call them. Needs a dedicated cleanup wave that checks for non-web callers first (infra, cron, admin tools).
6. **`PHASE2_STRICT_SYSTEM_PROMPT` flag flip (Drift F).** Once analytics show no 1000-char `system_prompt` submissions, or product decides the silent-truncation UX is bad, flip the gate on and delete the truncation branch. Track in execution log.
7. **Query parameter + header schemas.** Wave 1 covers request bodies only. `GET /metrics` Bearer token, `before` query param on messages, any future query-string API all stay manual. If a future domain grows multiple query params, extend to `shared/contracts/http/{domain}/query.ts`.
8. **Rename mock "spec" files** (CI/CD Wave 0 leftover): moving `tests/e2e/{web,mobile,flows}/*.spec.ts` (vitest-based) → `tests/integration/` so the Playwright runner scope is structural. Not contract work.
9. **README dev-onboarding doc** refresh for the `shared/contracts/http` layer (what to read first when adding an HTTP endpoint). T5 updates `qrclaw-map`; the top-level README could also get a one-line pointer.
10. **Outbound WS Zod (Phase 2 Wave 2).** Gateway produces `MessageFrame`, `ConnectionAckFrame`, etc. — TS-typed but not runtime-validated. Next wave's scope.

---

## Next action for the orchestrator

**Awaiting user approval.** Once approved, open an `in_progress` todo for **Task T1** (scaffold `shared/contracts/http/` + `validateRequest` middleware + its failing tests) and dispatch a fresh implementer subagent per `superpowers:subagent-driven-development`. All other tasks remain `pending` until T1 lands green and the spec+code reviewers return `DONE_CLEAN`.
