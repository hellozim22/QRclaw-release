---
name: qrclaw-map
description: QRClaw codebase navigation. Use when an agent is new to qrclaw, asks "where is X", or needs to locate the entry point of a runtime surface (web / gateway / supabase) or a cross-cutting contract. Load `map.md` (sibling file) for the full layered table.
origin: qrclaw
---

# qrclaw-map

Layered map of the QRClaw monorepo for agents that need to find code fast — business modules, runtime entry points, hot paths, and the single source of truth (SSoT) for cross-runtime contracts.

## When to use

- An agent (or human) new to qrclaw asks "where does X live?".
- Before editing code whose package ownership is unclear (e.g. a WS frame definition that exists in three places).
- When planning a refactor that crosses package boundaries — figure out the dependency direction first.
- When wiring a new feature and you need to know whether logic belongs in `web/`, `gateway/`, or `supabase/functions/`.

## How to use

1. **Read `map.md`** in this same directory. It contains the full navigation table; this file is just routing.
2. For WebSocket protocol questions, consult the **Source-of-truth contracts** section of `map.md` first — there is exactly one SSoT and several mirrors, and editing the wrong one will silently desync.
3. For "how do I add a new WS frame" tasks, follow the recipe under **How to add a new WS frame** in `map.md`.

## The three runtime surfaces

QRClaw runs on three independent runtimes; do NOT mix code between them:

| Surface | Location | Runtime | Role |
|---|---|---|---|
| `web/` | `web/src/` | Next.js 16 App Router (Node + browser) | Visitor + agent + dashboard UI |
| `gateway/` | `gateway/src/` | Node 20 + Express 5 + ws | WebSocket gateway, Redis pub/sub, ticket mint, message persistence |
| `supabase/functions/` | `supabase/functions/<name>/index.ts` | Deno (Supabase Edge) | Auth tickets, qrcode CRUD, decrypted message reads, data retention |

## SSoT — WebSocket contracts

This is the most important rule for any agent touching protocol code:

- **Source of truth**: `shared/contracts/ws/types.ts` (TS interfaces, dependency-free) + `shared/contracts/ws/protocol.ts` (Zod schemas + `validateFrame`).
- **Supabase mirror**: `supabase/functions/_shared/contracts/ws/types.ts` — **GENERATED**, never hand-edit. Refreshed by `scripts/sync-contracts.mjs`; CI job `Contracts sync check` fails the PR if it drifts.
- **Gateway re-export**: `gateway/src/ws/schemas.ts` re-exports from `@shared/contracts/ws/protocol`.
- **Web re-export**: `web/src/types/ws.ts` re-exports types only from `@shared/contracts/ws/types` (web stays Zod-free).

## Non-goals

- This skill does **not** describe HOW to implement features. For patterns, read the per-package READMEs (`web/README.md`), the technical specs in `requirements/`, and the superpowers plans in `docs/superpowers/plans/`.
- This skill does **not** duplicate `CLAUDE.md` (project entry point + verification workflow) or `AGENTS.md` (env caveats). It points at structure; those point at process.
