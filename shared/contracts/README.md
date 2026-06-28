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

## HTTP contracts

HTTP request/response DTOs live under `http/<domain>/`. Each domain folder mirrors the pattern established by `ws/`:

- `types.ts` — dependency-free TypeScript interfaces. Safe for any runtime.
- `protocol.ts` — Zod schemas consumed by gateway only. Web MUST NOT import these.

Current domain folders:

- `http/tickets/` — WS ticket issuance _(Wave 1)_
- `http/messages/` — legacy visitor message history _(Wave 1; being superseded by `decrypted-messages/` in M3)_
- `http/subscribers/` — email subscriptions _(Wave 1)_
- `http/qrcodes/` — QR code CRUD _(Wave 1)_
- `http/decrypted-messages/` — unified owner / agent / visitor history, consumed by gateway **and** the `decrypted-messages` Supabase Edge Function _(M3)_

Gateway validates HTTP request bodies via `validateRequest(schema)` middleware (`gateway/src/middleware/validate-request.ts`), which uses the Zod schemas from the corresponding `protocol.ts`.

**Sync-check scope:**

| Folder | Mirrored to Supabase? |
|---|---|
| `ws/` | ✅ `supabase/functions/_shared/contracts/ws/types.ts` |
| `http/decrypted-messages/` | ✅ `supabase/functions/_shared/contracts/http/decrypted-messages/types.ts` |
| `http/tickets/`, `http/messages/`, `http/subscribers/`, `http/qrcodes/` | ❌ Gateway + web only |

`scripts/sync-contracts.mjs --check` walks every entry in its `ENTRIES` array; CI (`.github/workflows/ci.yml`, `contracts-sync-check` job) fails on any drift. Add a new `ENTRIES` row whenever a Deno consumer needs to import a shared interface.

## Editing rules

1. Never edit `supabase/functions/_shared/contracts/**` by hand — it is generated.
2. Changes to `types.ts` that are not purely additive (widening) are breaking. Coordinate with gateway + web + supabase owners.
3. Keep `types.ts` zero-dependency. Zod lives in `protocol.ts`.
