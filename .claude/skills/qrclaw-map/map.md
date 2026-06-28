# QRClaw Subsystem Map

Last verified: 2026-04-20 (post phase-2 wave-1 HTTP contracts lift).

Ground rule: every path below was confirmed to exist with `ls`. If you find a stale entry, fix it before relying on this map.

---

## High-level architecture

```
                ┌──────────────────────┐
                │  web/  (Next.js 16)  │
                │  visitor + agent UI  │
                └──────────┬───────────┘
                           │ HTTPS (REST)
                           │ WSS  (frames)
                           ▼
                ┌──────────────────────┐
                │  gateway/  (Node 20) │
                │  Express + ws        │
                │  Redis pub/sub       │
                │  neutral relay (C1)  │
                └──┬─────────────────┬─┘
                   │ REST / RLS      │ Edge fn
                   ▼                 ▼
         ┌───────────────┐  ┌────────────────────────┐
         │  Supabase DB  │  │ supabase/functions/    │
         │  Postgres+RLS │  │ Deno edge endpoints    │
         └───────────────┘  └────────────────────────┘
```

Iron rules (from `CLAUDE.md`, v1.3 effective 2026-04-20):
- **C1 neutral relay** — gateway never performs AI inference and never interprets message semantics; it only receives, encrypts, persists, and forwards.
- **C2 encrypted storage** — persisted messages must be ciphertext; plaintext exists only in two places: (a) on the client endpoint (visitor / owner / agent-plugin); (b) in the in-memory of the authorized `decrypted-messages` Edge Function — never persisted, never logged, released on function exit. Gateway writes with KEK to encrypt new messages; the read path no longer decrypts (from M3 onward).
- **C4 mobile zero-signup** — visitor side identified by session token only.
- **C5 replayable messages** — any identity (visitor / owner / agent-plugin) can fetch historical messages after disconnection, device change, or restart. Decryption of historical reads is centralized in the Supabase Edge Function `decrypted-messages` (M3, consolidating `get-decrypted-messages`).

---

## Runtime surfaces

| Surface | Entry file | Build cmd | Deploy target |
|---|---|---|---|
| `web/` | `web/src/app/layout.tsx` (root layout) + `web/src/app/page.tsx` (`/`) | `npm run build` (Next.js) | Vercel |
| `gateway/` | `gateway/src/server.ts` | `npm run build` (`tsc`) | Tencent Cloud (Docker via `gateway/Dockerfile` + `gateway/docker-compose.yml`); PM2 via `gateway/ecosystem.config.cjs` |
| `supabase/functions/` | `supabase/functions/<name>/index.ts` (one per function) | n/a (Deno, deployed by `npx supabase functions deploy`) | Supabase Edge (`zyxqadubhwrnsoujiyir`) |

CI for all three surfaces lives in `.github/workflows/ci.yml`.

---

## Source-of-truth contracts

| Contract | Defined in | Consumed by |
|---|---|---|
| WS frame TS types (both directions) | `shared/contracts/ws/types.ts` | gateway (via `gateway/src/ws/schemas.ts`), web (via `web/src/types/ws.ts`), supabase (via the generated mirror) |
| WS **inbound** Zod schemas + `validateFrame` | `shared/contracts/ws/protocol.ts` | gateway only — web stays Zod-free |
| WS **outbound** Zod schemas + `validateOutboundFrame` | `shared/contracts/ws/outbound.ts` | gateway `sendFrame()` only (see Wave 2 recipe below) — web stays Zod-free |
| Barrel | `shared/contracts/ws/index.ts` | Node consumers that want both types and protocol from one import |
| Supabase **mirror** (generated) | `supabase/functions/_shared/contracts/ws/types.ts` | Edge functions; **do not hand-edit** |
| HTTP request DTOs (types + Zod) | `shared/contracts/http/<domain>/{types,protocol}.ts` (domains: `tickets/`, `messages/`, `subscribers/`, `qrcodes/`) | gateway routes (via `validateRequest(schema)` middleware) + web call sites (types-only import, no Zod) |
| HTTP-contracts barrel | `shared/contracts/http/index.ts` | Re-exports each domain's `types.ts` only — `protocol.ts` is opt-in per call site to keep web Zod-free |

Sync mechanism: `scripts/sync-contracts.mjs` (run with no args to write, `--check` to verify) covers **`ws/` only**. HTTP contracts are not mirrored into `supabase/functions/_shared/` in Wave 1 (no Deno consumer today — see `shared/contracts/README.md`). CI job `Contracts sync check` in `.github/workflows/ci.yml` enforces no `ws/` drift on every push/PR.

---

## Business modules — `web/src/`

| Path | What lives here |
|---|---|
| `web/src/app/layout.tsx` | Root App-Router layout; loads Inter + JetBrains Mono fonts and global CSS. |
| `web/src/app/page.tsx` | Marketing landing page (`/`). |
| `web/src/app/(auth)/` | Auth route group: `login/`, `signup/`, `verify/` and shared `layout.tsx`. |
| `web/src/app/(dashboard)/` | Authenticated agent dashboard: `messages/`, `qrcodes/`, `settings/`. |
| `web/src/app/m/` | Mobile-first visitor app: `chat/`, `me/`, `messages/`, `qrcodes/`, `scan/` with shared `layout.tsx`. |
| `web/src/app/q/[slug]/` | Public landing page resolved from a scanned QR slug. |
| `web/src/app/agent/[agentId]/` | Public agent profile / share page. |
| `web/src/app/chat/[agentId]/` | Desktop visitor chat for a given agent. |
| `web/src/app/claim/`, `web/src/app/auth/`, `web/src/app/docs/`, `web/src/app/pricing/`, `web/src/app/privacy/`, `web/src/app/terms/` | Static / utility pages. |
| `web/src/middleware.ts` | Next.js edge middleware (auth gate / cookie refresh). |
| `web/src/components/ui/` | Design-system primitives (`Button.tsx`, `Avatar.tsx`, `Badge.tsx`, `Input.tsx`, `MessageBubble.tsx`, `QRCard.tsx`, `TabBar.tsx`, `TopBar.tsx`). |
| `web/src/components/chat/` | Chat surface: `ChatInputBar.tsx`, `ChatMenu.tsx`, `ConnectionStatusBanner.tsx`, `MarkdownRenderer.tsx`, `MessageList.tsx`, `RegisterBanner.tsx`, `SuggestedQuestions.tsx`. |
| `web/src/components/landing/` | Marketing sections (`HeroSection.tsx`, `FeaturesSection.tsx`, `CTASection.tsx`, `ConnectSection.tsx`, `Footer.tsx`, `LandingPage.tsx`). |
| `web/src/components/docs/`, `web/src/components/legal/`, `web/src/components/pricing/` | Static-page components. |
| `web/src/hooks/` | React hooks: `useAuth.ts`, `useAgent.ts`, `useAgents.ts`, `useConversations.ts`, `useProfile.ts`, `useQRCodes.ts`, `useWebSocket.ts`. |
| `web/src/lib/supabase/` | Supabase clients: `browser.ts`, `server.ts`, `middleware.ts`, `index.ts`. |
| `web/src/lib/ws/` | Client-side WS plumbing: `client.ts`, `history.ts`, `ticket.ts`, `index.ts`. |
| `web/src/stores/chatStore.ts` | Zustand store for chat state. |
| `web/src/types/ws.ts` | **Re-export only** of WS types from `@shared/contracts/ws/types`. |
| `web/src/types/chat.ts` | UI-side chat view models (not protocol). |
| `web/src/lib/create-qrcode-direct.ts` | Fallback path that inserts a QR row directly via Supabase if the gateway POST fails. |
| `web/src/lib/visual-audit*` | Snapshot helpers used by the visual-audit Playwright suite. |

---

## Business modules — `gateway/src/`

| Path | What lives here |
|---|---|
| `gateway/src/server.ts` | Process entry: builds Express app, mounts routes, starts the WS server. |
| `gateway/src/env.ts` | Reads & validates required env vars; `process.exit(1)` on missing `WS_TICKET_SECRET` / `QRCLAW_KEK_V1` / `SUPABASE_JWT_SECRET`. `ENCRYPTION_KEK` still honoured as deprecated fallback. |
| `gateway/src/ws/handler.ts` | WS connection lifecycle (open / message / close) — the per-socket loop. |
| `gateway/src/ws/router.ts` | Routes inbound frames to per-type handlers after `validateFrame`. |
| `gateway/src/ws/auth.ts` | WS-ticket → connection auth. |
| `gateway/src/ws/registry.ts` | In-memory connection registry. |
| `gateway/src/ws/schemas.ts` | **Re-export** of inbound + outbound Zod schemas, `validateFrame`, `validateOutboundFrame` from `@shared/contracts/ws/{protocol,outbound}`. |
| `gateway/src/ws/send.ts` | `sendFrame()` — the single outbound choke point (readyState + 128 KiB backpressure + `validateOutboundFrame` + counter + log + `ws.send`). Every gateway → client emit goes through it. |
| `gateway/src/ws/fanout.ts` | `fanoutFrame(target, frame: ServerFrame)` — multi-recipient wrapper that delegates each send to `sendFrame`. |
| `gateway/src/ws/security-envelope.ts` | Outbound envelope sealing (generic `injectSecurityEnvelope<T>(payload) → T & { security_envelope }`). |
| `gateway/src/routes/` | HTTP routes: `health.ts`, `ticket.ts`, `messages.ts`, `subscribe.ts`, `seo.ts`, `create-qrcode.ts`, `create-qrcode-avatar.ts`. |
| `gateway/src/middleware/` | Express middleware: `auth.ts`, `error-handler.ts`, `i18n.ts`. |
| `gateway/src/redis/` | Redis-backed primitives: `client.ts`, `dedup.ts`, `presence.ts`, `offline-queue.ts`, `rate-limiter.ts`, `ip-rate-limiter.ts`. |
| `gateway/src/db/` | Supabase access: `supabase.ts` (client), `persist.ts` (encrypted message writes), `system-prompt.ts`. |
| `gateway/src/crypto/` | Envelope encryption — **write path only** (M3-T6). `envelope.ts` exports `encrypt`; `key-manager.ts` exports `getDEK`/`rotateDEK`. Read-path decryption lives in the `decrypted-messages` Edge Function. |
| `gateway/src/services/decrypted-messages-client.ts` | Thin HTTP client that `routes/messages.ts` uses to forward visitor history requests to `supabase/functions/decrypted-messages`. |
| `gateway/src/monitoring/` | `metrics.ts`, `perf.ts`. |
| `gateway/src/types/index.ts` | Gateway-internal type aliases (non-protocol). |

Process management:
- `gateway/ecosystem.config.cjs` — PM2 cluster config.
- `gateway/Dockerfile`, `gateway/docker-compose.yml`, `gateway/nginx/` — containerised deploy.
- `gateway/TLS.md` — TLS notes for public hosts.

---

## Business modules — `supabase/functions/`

| Path | What lives here |
|---|---|
| `supabase/functions/visitor-ws-ticket/index.ts` | Mints a WS ticket for an anonymous mobile visitor. |
| `supabase/functions/agent-ws-ticket/index.ts` | Mints a WS ticket for an authenticated agent. |
| `supabase/functions/create-qrcode/index.ts` | Server-side QR code creation (used when web cannot reach gateway). |
| `supabase/functions/manage-qrcode/index.ts` | Owner CRUD over QR codes. |
| `supabase/functions/claim-agent/index.ts` | Claim flow — bind a QR/agent to a newly-registered owner. |
| `supabase/functions/decrypted-messages/index.ts` | **Unified** decryption endpoint (M3). Serves owner / agent / visitor actors; supersedes the retired `get-decrypted-messages`. Owns the `QRCLAW_KEK_V1` read path. |
| `supabase/functions/_shared/crypto/{envelope,key-manager,hex}.ts` | Deno Web-Crypto port of the gateway encrypt/DEK-unwrap code used by `decrypted-messages`. |
| `supabase/functions/data-retention/index.ts` | Scheduled retention / purge job. |
| `supabase/functions/usage-stats/index.ts` | Aggregated counters for the dashboard. |
| `supabase/functions/_shared/auth.ts` | Shared auth helpers across edge fns. |
| `supabase/functions/_shared/cors.ts` | Shared CORS headers helper. |
| `supabase/functions/_shared/jwt.ts` | JWT verification (ES256). |
| `supabase/functions/_shared/supabase.ts` | Service-role Supabase client factory. |
| `supabase/functions/_shared/contracts/ws/types.ts` | **Generated** mirror — do not hand-edit. |
| `supabase/migrations/*.sql` | Versioned Postgres schema + RLS, e.g. `20260312_init_schema.sql`, `20260319_security_critical_fixes.sql`. |
| `supabase/config.toml` | Supabase CLI config. |

---

## Tests layout (`tests/`)

| Layer | Path |
|---|---|
| Vitest unit | `tests/unit/{backend,database,frontend,shared}/` |
| Vitest integration | `tests/integration/{api,smoke,ws}/` |
| Playwright E2E | `tests/e2e/{flows,mobile,web}/` plus `tests/e2e/sample.spec.ts` |
| Visual audit | `tests/e2e/visual-audit/` |
| Acceptance | `tests/acceptance/` |
| Helpers / fixtures / mocks | `tests/helpers/`, `tests/fixtures/`, `tests/mocks/` |
| Vitest config | `tests/vitest.config.ts` |
| Playwright config | `tests/playwright.config.ts` |
| Cross-package tsconfig for shared typecheck | `tests/tsconfig.shared-typecheck.json` |

Run from `tests/` (own `package.json`): `npx vitest run` and `npx playwright test`.

---

## Hot paths (most frequently edited)

1. `shared/contracts/ws/types.ts` — every protocol change starts here.
2. `shared/contracts/ws/protocol.ts` — paired Zod for any inbound frame change.
3. `gateway/src/ws/router.ts` — wiring new inbound frame handlers.
4. `gateway/src/ws/handler.ts` — per-connection lifecycle tweaks.
5. `web/src/hooks/useWebSocket.ts` — client-side WS driver; primary call site for streaming deltas.
6. `web/src/lib/ws/client.ts` — low-level WS connection + auto-reconnect.
7. `web/src/stores/chatStore.ts` — chat state mutations on incoming frames.
8. `gateway/src/db/persist.ts` — encrypted message persistence path.
9. `web/src/components/chat/MessageList.tsx` — message rendering surface.
10. `supabase/migrations/` — any schema or RLS change.

---

## When NOT to edit directly

| Path | Reason | How to update instead |
|---|---|---|
| `supabase/functions/_shared/contracts/ws/types.ts` | Generated by `scripts/sync-contracts.mjs`. CI fails on drift. | Edit `shared/contracts/ws/types.ts`, then `node scripts/sync-contracts.mjs`. |
| `gateway/dist/` | `tsc` output. | Re-run `cd gateway && npm run build`. |
| `web/.next/` and `web/tsconfig.tsbuildinfo` | Next.js build artefacts. | `cd web && npm run build`. |
| `web/node_modules/`, `gateway/node_modules/`, `tests/node_modules/`, `shared/node_modules/` | Installed deps. Each package owns its own deps — `shared/` now ships `zod` for gateway/tests to resolve via NodeNext walk. | `npm install` in the matching directory. Fresh clone requires installing in all four. |

---

## How to add a new inbound WS frame

A frame the gateway receives (client → gateway). Most routing / handler work lives in `gateway/src/ws/router.ts`.

1. **Type** — add the interface to `shared/contracts/ws/types.ts`, add its literal to `INBOUND_FRAME_TYPES`, and add the type to the `ClientFrame` union.
2. **Schema** — add a strict Zod schema to `shared/contracts/ws/protocol.ts` and register it in `schemaMap`.
3. **Test** — add a case to `tests/unit/shared/contracts-ws-protocol.test.ts` (parity via `expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<Interface>()` plus accept/reject runtime cases). Land this before implementing the handler.
4. **Sync** — run `node scripts/sync-contracts.mjs` so `supabase/functions/_shared/contracts/ws/types.ts` is updated. Commit the regenerated file in the same change.
5. **Wire** — handle the new type in `gateway/src/ws/router.ts` (server side) and consume any downstream replies via `web/src/hooks/useWebSocket.ts` / `web/src/stores/chatStore.ts` (client side). The `Contracts sync check` CI job fails any PR that skipped step 4.

---

## How to add a new outbound WS frame

A frame the gateway emits (gateway → client). Wave 2 centralised all emit sites on `sendFrame()`; the recipe forces new frames through that choke point so validation, metrics, and backpressure come for free.

1. **Type** — add the interface to `shared/contracts/ws/types.ts`. Add its literal to `OUTBOUND_FRAME_TYPES` **and** add the type to the `ServerFrame` union.
2. **Schema** — add a strict Zod schema to `shared/contracts/ws/outbound.ts` and register it in `outboundSchemaMap` (the `validateOutboundFrame()` dispatcher reads this map).
3. **Test** — add a parity + runtime case to `tests/unit/shared/contracts-ws-outbound.test.ts`. Parity uses `expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<Interface>()` (fall back to `toMatchTypeOf` only when the schema intentionally narrows the interface, e.g. a widened union on the TS side — document in the test comment).
4. **Sync** — run `node scripts/sync-contracts.mjs` and commit the regenerated `supabase/functions/_shared/contracts/ws/types.ts`. CI fails on drift.
5. **Emit** — build the frame as a strongly-typed object literal in `gateway/src/ws/router.ts` or `gateway/src/ws/handler.ts` and hand it to `sendFrame(ws, frame, { connectionId })`. For broadcasts use `fanoutFrame({ kind: 'direct-to-visitor' | 'direct-to-agents' | 'multi', … }, frame)` — it loops through `sendFrame` internally.
6. **Never** call `ws.send()` or reintroduce a `sendSafe` helper directly. The only allowed `ws.send` in the repo is inside `send.ts` itself. `grep -rn 'ws\.send(\|sendSafe(' gateway/src/ws/ | grep -v 'send.ts:'` must stay empty.
7. **Verify** — `cd gateway && npm run typecheck`, `cd tests && npx vitest run`. Vitest pins `QRCLAW_OUTBOUND_VALIDATION=strict` (see `tests/vitest.config.ts`), so any frame whose runtime shape drifts from the Zod schema surfaces as a red test instead of a silent log-only warning.

Observability: `sendFrame` increments `outbound_validation_failures_total:<frame_type>` on every rejection (exposed via `GET /metrics` → `counters`) and emits a structured `console.warn` with `frameType`, `connectionId`, and the Zod error — never the frame body (Iron Rule C2).

---

## How to add a new HTTP endpoint

Applies when gateway adds a `POST /api/<name>` (or another method that carries a body). Mirror the Wave 1 pattern — see `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md` for the full rationale and worked examples.

1. **Pick the domain subfolder** under `shared/contracts/http/`. Reuse `tickets/`, `messages/`, `subscribers/`, `qrcodes/` when the endpoint belongs there; otherwise create a new folder — each domain owns `types.ts` (dependency-free) and `protocol.ts` (Zod).
2. **Add the TS interface** to `shared/contracts/http/<domain>/types.ts`. Keep the file zero-imports so web can consume it without pulling in Zod. Export any numeric / string constants that would otherwise be inline magic numbers (see `PROFILE_AVATAR_MAX_DATA_URL_CHARS` etc.).
3. **Add the Zod schema** to `shared/contracts/http/<domain>/protocol.ts`. Default to `z.object({...}).strict()` so unknown keys 400 instead of silently passing. Import constants from `./types.js` — never duplicate them.
4. **Write a parity test** at `tests/unit/shared/contracts-http-<domain>.test.ts`. At minimum: (a) accept a valid body, (b) reject a missing required field, (c) `expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<RequestInterface>()` (use `toMatchTypeOf` if the schema infers to `{ [x: string]: never }` — see the fix commit `1160534` for context).
5. **Wire the gateway route** with `validateRequest(schema)` from `gateway/src/middleware/validate-request.ts`. Place auth middleware FIRST if the route needs it (e.g. `createQrcodeRouter.post('/api/...', jwtAuthMiddleware, validateRequest(schema), handler)`). Destructure `req.body as MyRequest` — TypeScript's Express generic inference does not propagate the body type through the middleware chain; the explicit cast is the documented workaround (see `validateRequest` JSDoc). Delete any pre-existing manual `if (!x)` checks that the schema now covers.
6. **Type the web caller** — any fetch/axios site importing the endpoint should import the interface from `@shared/contracts/http/<domain>/types` and type the request body against it. Web must NOT import `protocol.ts` (that would pull Zod into the browser bundle; `scripts/verify-web-no-zod` / the `next build` output `grep -r 'zod' .next/server/app/` check catches regressions).

Notes:
- HTTP contracts are **not** mirrored into `supabase/functions/_shared/` in Wave 1; `scripts/sync-contracts.mjs --check` does not walk `http/`. If you introduce a Deno consumer (Edge Function), extend the sync script in a dedicated wave rather than hand-mirroring.
- Error shape is fixed: `validateRequest` responds `400` with `{ error: { code: 'invalid_request', message: 'Validation failed at <path>: <zod message>' } }`. Only deviate when the endpoint's existing client depends on a different shape (see `subscribe` for the one Wave 1 exception — the handler calls `schema.safeParse()` inline instead of using the middleware, to preserve the legacy `{ success: false, error }` response).
- `.strict()` can be a breaking change for consumers that send extra keys. Grep the web call site before landing.

---

## Further reading

- Phase-1 refactor plan: `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md`.
- CI/CD Wave 0 plan: `docs/superpowers/plans/2026-04-19-qrclaw-cicd-wave0.md`.
- **Phase 2 index (Wave 1 HTTP + Wave 2 outbound WS)**: `docs/superpowers/plans/2026-04-19-qrclaw-phase2-index.md`.
- Phase 2 Wave 1 plan (HTTP request-body Zod): `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`.
- Phase 2 Wave 2 plan (outbound WS Zod): `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`.
- **GitHub 发布指引（人工 + 发布 agent 协作剧本）**: `docs/release/github-publish-guide.md`.
- Refactor execution log (all waves, with deviations): `docs/refactor/execution-log.md`.
- codex's production CI/CD audit (baseline): `docs/ci-cd-optimization-plan.md`.
- Project entry / verification workflow: `CLAUDE.md`.
- Cursor Cloud / dev caveats: `AGENTS.md`.
- Repo overview: `README.md`.
- Versioned change log: `CHANGELOG.md`.
- WS protocol spec: `requirements/technical-specification-supplement-protocol.md` (see Semantic Skill Router in `CLAUDE.md`).
- Edge-function deployment notes: `supabase/EDGE_FUNCTIONS_ENV.md`, `supabase/MIGRATION_GUIDE.md`, `supabase/PRODUCTION_CHECKLIST.md`.
- Contracts SSoT rules: `shared/contracts/README.md`.
