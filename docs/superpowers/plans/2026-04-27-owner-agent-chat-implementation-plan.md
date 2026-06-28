# Owner Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **修订记录:** 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 B1/B2/B3/B4/B5/B6/B7/B9/B10/B11/B12/M5/M7/M9/M10，并补充 B13。
> **Wave 1 启动修订:** 2026-04-27 根据评审报告 V0.6 §十一，补齐阶段 A 遗留清理、Wave 1 schema/RLS/types/advisors/P0 验证与收尾交接清单。

**Goal:** Build Owner Private Agent Chat so QRClaw owners can create Agents, bind local/cloud providers, and chat with them privately before any visitor-facing Publish as QR flow.

**Architecture:** Keep Gateway as the neutral relay and encryption write path. Add Supabase tables/RLS for Owner private chat and Host registration, extend shared contracts, route runs through Gateway WS, and implement a Go `qrclaw-agent-host` for local CLI detection/execution.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 tokens, Node 20 + Express 5 + ws, Supabase Postgres + Edge Functions, TypeScript shared contracts, Go local host, Vitest, Playwright.

---

## Source Documents

- Product: `requirements/owner-agent-chat-product-requirements.md`
- Technical: `requirements/owner-agent-chat-technical-specification.md`
- Design: `design/owner-agent-chat-design-spec.md`
- Testing: `requirements/owner-agent-chat-test-plan.md`
- Existing architecture map: `.claude/skills/qrclaw-map/map.md`

---

## File Structure

### Create

```text
shared/contracts/http/owner-agent-chat/types.ts
shared/contracts/http/owner-agent-chat/protocol.ts
gateway/src/routes/owner-agents.ts
gateway/src/routes/owner-agent-messages.ts
gateway/src/routes/owner-host-tokens.ts
gateway/src/services/owner-agent-chat.ts
gateway/src/services/agent-host-registry.ts
gateway/src/db/owner-agent-chat.ts
gateway/src/ws/owner-agent-router.ts
qrclaw-agent-host/
tests/unit/shared/http-owner-agent-chat-contracts.test.ts
tests/unit/shared/contracts-ws-owner-agent-chat.test.ts
tests/integration/database/owner-agent-chat-rls.test.ts
tests/integration/gateway/owner-agent-chat-api.test.ts
tests/integration/gateway/owner-agent-chat-ws.test.ts
tests/integration/edge-functions/decrypted-owner-agent-chat.test.ts
tests/e2e/web/owner-agent-chat.spec.ts
```

### Modify

```text
shared/contracts/ws/types.ts
shared/contracts/ws/protocol.ts
shared/contracts/ws/outbound.ts
shared/contracts/http/index.ts
gateway/src/server.ts
gateway/src/ws/router.ts
supabase/functions/decrypted-messages/index.ts
supabase/types/database.types.ts
web/src/app/(dashboard)/...
web/src/components/chat/...
web/src/hooks/...
web/src/stores/chatStore.ts
```

---

## Wave 0: Product Gate

- [ ] Confirm `公开入口` vs `分享` final navigation label.
- [ ] Confirm Host token first-release design: one-time token plus scoped stored token.
- [ ] Confirm `provider_work_dir` stores opaque Host id, not raw absolute path, unless explicitly needed.
- [ ] Confirm provider execution phase order: OpenClaw P0, Claude P1, Cursor P2, Codex P3.
- [ ] Freeze UI glossary: Agent / 智能体 / 底层 Agent / 执行位置 / 公开入口.
- [ ] Confirm cloud Agent source: existing OpenClaw plugin / cloud worker registers `cloud_plugin` capability.
- [ ] Confirm decrypted history path stays in `decrypted-messages` for this release.
- [ ] Confirm all four providers are part of final delivery; any provider deferral requires Owner sign-off.

Exit criteria:

- Product/tech/design/test docs accepted as baseline.

---

## Wave 1: Supabase Schema

### Stage A: Preflight Text Cleanup

- [ ] Patch `requirements/owner-agent-chat-technical-specification.md` §二 architecture diagram text so the owner-agent run request frame name uses `owner_agent_run_request`.
- [ ] Run a scoped text scan under `requirements/` and `docs/superpowers/plans/` for dotted Host / owner-agent WS frame names.
- [ ] Ignore historical citations inside `requirements/owner-agent-chat-architecture-review.md`; do not rewrite review history.
- [ ] Run `git status --short` and confirm the only Stage A code-path change is the technical spec text patch.

Stop rules:

- Do not touch N3 / N4 RPC / N7. They remain deferred by `requirements/owner-agent-chat-architecture-review.md` §9.7.3.
- Do not add new architecture sections during Stage A.

### Task 1.1 Create Migration

- [ ] Run `supabase migration new owner_agent_chat_schema`.
- [ ] Read the latest two files under `supabase/migrations/` and align SQL style, naming, timestamps, RLS policy style, trigger helpers, and extension usage.
- [ ] Add 9 tables, using `requirements/owner-agent-chat-product-requirements.md` §12.3–§12.10 and `requirements/owner-agent-chat-technical-specification.md` §4.5 as source of truth:
  - `agent_hosts`
  - `agent_host_tokens`
  - `agent_host_providers`
  - `agent_bindings`
  - `owner_agent_conversations`
  - `owner_agent_messages`
  - `owner_agent_runs`
  - `owner_agent_run_events`
  - `owner_agent_conversation_keys`
- [ ] Extend `agents` with `description`, `avatar_url`, `instructions`, `suggested_prompts`, `execution_mode`, and `archived` status.
- [ ] Add CHECK constraints: `length(instructions) <= 8000`, `jsonb_array_length(suggested_prompts) <= 10`, each suggested prompt length `<= 200`, and `execution_mode IN ('standard','full_access')`.
- [ ] Add `ON DELETE CASCADE` to new-table `owner_id`, `agent_id`, `host_id`, `conversation_id`, and `run_id` relationships where the parent row owns the child lifecycle.
- [ ] Add required unique constraints and indexes: `owner_agent_run_events(run_id, seq)` unique, `agent_host_tokens.token_hash` unique, active key partial unique index on `owner_agent_conversation_keys` where `status='active'`, plus secondary indexes from product §12.7 and technical §4.
- [ ] Enable RLS for each new table.
- [ ] Do not implement `delete_owner_agent_conversation_with_keys` SECURITY DEFINER RPC. If product explicitly requires single-conversation forget-me in Wave 1, stop and ask Owner before writing it.

Verification:

```bash
supabase migration list
```

### Task 1.2 RLS Policies

- [ ] Add owner policies through the existing `owners.user_id = auth.uid()` mapping, not by comparing auth UID directly to `owner_id`.
- [ ] Allow owners to read/write only rows owned by their owner record.
- [ ] Ensure anon has no direct access to all 9 new tables.
- [ ] Ensure plugin agent token paths cannot read owner private chat tables.
- [ ] Keep Host access through Gateway WS only; Host must not gain direct Supabase access to private chat tables.
- [ ] Keep service role paths available for Gateway encrypted write/read paths.
- [ ] Avoid `user_metadata` in all authorization logic.
- [ ] Add tests for Owner A vs Owner B isolation across 9 new tables and `agents` extension fields.

Verification:

```bash
cd tests && npx vitest run tests/integration/database/owner-agent-chat-rls.test.ts
```

### Task 1.3 Generate Types

- [ ] Generate Supabase TypeScript types.
- [ ] Commit `supabase/types/database.types.ts`.
- [ ] Run DB-01 through DB-09 from `requirements/owner-agent-chat-test-plan.md` §4.1.
- [ ] Run RLS-01 through RLS-10 from `requirements/owner-agent-chat-test-plan.md` §4.2.
- [ ] Run `supabase db advisors` and classify each warning as fixed, accepted risk, or not applicable.
- [ ] Run a P0 two-owner integration probe: Owner A must not read Owner B rows in the 9 new tables or `agents` extension fields.
- [ ] Run `cd web && npm run build` and `cd gateway && npm run typecheck` to confirm generated types do not break existing compile.
- [ ] Update `CHANGELOG.md`, `dev-log/2026-04-27.md`, and `.claude/progress/session-overview.md` after Wave 1 passes verification.
- [ ] Prepare PR summary `Wave 1: Owner Agent Chat schema migration` with schema list, RLS matrix, DB/RLS test results, advisors disposition, types diff summary, and Stage A patch summary.

Verification:

```bash
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
supabase db advisors
cd tests && npx vitest run tests/integration/database/owner-agent-chat-rls.test.ts
cd web && npm run build
cd gateway && npm run typecheck
```

Exit criteria:

- Stage A dotted frame residue is cleaned outside review-history citations.
- 9 new tables and `agents` extension fields exist with required CHECK/FK/index constraints.
- RLS passes owner isolation, anon denial, plugin-agent denial, and service-role write-path expectations.
- `supabase/types/database.types.ts` is regenerated.
- Advisors and P0 two-owner probe results are recorded in the PR/dev-log.
- Wave 2 contracts can start from generated types and the finalized schema.

---

## Wave 2: Contracts

### Task 2.1 HTTP Contracts

- [ ] Create `shared/contracts/http/owner-agent-chat/types.ts`.
- [ ] Create `shared/contracts/http/owner-agent-chat/protocol.ts`.
- [ ] Define `HostTokenScope` Zod schema with `owner_id`, `allowed_provider_set`, `can_register_local`, and `can_receive_private_runs`.
- [ ] Export types through `shared/contracts/http/index.ts`.
- [ ] Add parity tests.

Verification:

```bash
cd tests && npx vitest run tests/unit/shared/http-owner-agent-chat-contracts.test.ts
```

### Task 2.2 WS Contracts

- [ ] Add Host and owner-agent frame types to `shared/contracts/ws/types.ts`.
- [ ] Add inbound Zod schema to `shared/contracts/ws/protocol.ts`.
- [ ] Add outbound Zod schema to `shared/contracts/ws/outbound.ts`.
- [ ] Run contract sync.

Verification:

```bash
node scripts/sync-contracts.mjs
cd tests && npx vitest run tests/unit/shared/contracts-ws-owner-agent-chat.test.ts
```

---

## Wave 2.5: Mock Host Integration Harness

### Task 2.5.1 Mock Host Harness

- [ ] Create a lightweight mock Host in `tests/integration/gateway/`.
- [ ] Mock Host connects to Gateway WS.
- [ ] Mock Host sends `host_register`.
- [ ] Mock Host receives `owner_agent_run_request`.
- [ ] Mock Host returns 4-5 `owner_agent_run_event` frames and `owner_agent_run_completed`.
- [ ] Add offline, cancel, reset, seq-gap tests.

Verification:

```bash
cd tests && npx vitest run tests/integration/gateway/owner-agent-chat-ws.test.ts
```

Exit criteria:

- Gateway ↔ Host protocol is proven before real Go Host implementation starts.

---

## Wave 3: Gateway

### Task 3.1 Host Token API

- [ ] Implement `POST /api/owner/host-tokens`.
- [ ] Implement `DELETE /api/owner/host-tokens/:tokenId`.
- [ ] Hash token before storage.
- [ ] Use HMAC-SHA256 with `QRCLAW_HOST_TOKEN_PEPPER`.
- [ ] Implement hot revocation: online Host is disconnected after token revoke.
- [ ] Return token original only once.

Verification:

```bash
cd tests && npx vitest run tests/integration/gateway/owner-agent-chat-api.test.ts
```

### Task 3.2 Owner Agent API

- [ ] Implement `GET /api/owner/agents`.
- [ ] Implement `POST /api/owner/agents`.
- [ ] Enforce Full Access confirmation for local high-permission providers.
- [ ] Create `agent_bindings`.

Verification:

```bash
cd gateway && npm run typecheck
```

### Task 3.3 Message Send API

- [ ] Implement `POST /api/owner/agents/:agentId/messages`.
- [ ] Encrypt Owner message.
- [ ] Create run.
- [ ] Route run to Host if online.
- [ ] Save pending when Host offline.
- [ ] Enforce pending lifecycle: limit 50, 7-day expiry, manual resend only, 30-minute run timeout.

Verification:

```bash
cd tests && npx vitest run tests/integration/gateway/owner-agent-chat-api.test.ts
```

### Task 3.4 WS Router

- [ ] Implement Host register/heartbeat/capability updates.
- [ ] Implement run accepted/event/completed/failed handlers.
- [ ] Encrypt run event content before DB write.
- [ ] Use `sendFrame()` for all outbound frames.
- [ ] Implement seq-gap, resume/replay, backpressure and session reset behavior.

Verification:

```bash
cd tests && npx vitest run tests/integration/gateway/owner-agent-chat-ws.test.ts
```

---

## Wave 4: Edge Function

### Task 4.1 Extend decrypted-messages

- [ ] Add actor `owner-private-agent-chat`.
- [ ] Support conversation history read.
- [ ] Support run event read for reload-during-stream.
- [ ] Keep plaintext out of logs.

Verification:

```bash
cd tests && npx vitest run tests/integration/edge-functions/decrypted-owner-agent-chat.test.ts
```

---

## Wave 5: Web UI

### Task 5.1 Navigation

- [ ] Add/rename Dashboard entries:
  - `Chat`
  - `智能体`
  - `公开入口 / 分享`
- [ ] Preserve existing QR functionality under public/share entry.

Verification:

```bash
cd web && npm run build
```

### Task 5.2 Chat Page

- [ ] Agent conversation list.
- [ ] Chat panel.
- [ ] Online/offline/pending/running/failed states.
- [ ] Suggested prompts empty state.
- [ ] Reset context action.

Verification:

```bash
cd tests && npx vitest run tests/unit/frontend/owner-agent-chat-store.test.ts
```

### Task 5.3 Agents Page

- [ ] List defined Agent roles only.
- [ ] Create Agent wizard.
- [ ] Full Access confirmation.
- [ ] Host token modal.

Verification:

```bash
cd web && npm run build
```

---

## Wave 6: Go Host

### Task 6.1 Scaffold

- [ ] Create `qrclaw-agent-host/go.mod`.
- [ ] Create `cmd/qrclaw-agent-host/main.go`.
- [ ] Add config, auth, ws, detect, provider packages.

Verification:

```bash
cd qrclaw-agent-host && go test ./...
```

### Task 6.2 Auth

- [ ] Implement `login --token`.
- [ ] Store scoped token with chmod 600.
- [ ] Implement `logout`.

Verification:

```bash
cd qrclaw-agent-host && go test ./internal/auth ./internal/store
```

### Task 6.3 Detection

- [ ] Implement provider detection for:
  - OpenClaw
  - Claude Code
  - Cursor Agent
  - Codex
- [ ] Support env path override.
- [ ] Parse `--version`.

Verification:

```bash
cd qrclaw-agent-host && go test ./internal/detect ./internal/provider/...
```

### Task 6.4 WS Client

- [ ] Connect to Gateway WS.
- [ ] Register Host capabilities.
- [ ] Heartbeat.
- [ ] Receive run requests.
- [ ] Stream run events.

Verification:

```bash
cd qrclaw-agent-host && go test ./internal/ws
```

---

## Wave 7: Provider Adapter

### Task 7.1 OpenClaw P0

- [ ] Implement OpenClaw adapter.
- [ ] Support `--local`.
- [ ] Return final text.

Verification:

```bash
QRCLAW_PROVIDER_E2E=1 cd qrclaw-agent-host && go test ./internal/provider/openclaw
```

### Task 7.2 Claude P1

- [ ] Implement Claude Code adapter.
- [ ] Support `--permission-mode bypassPermissions`.
- [ ] Parse stream-json.

### Task 7.3 Cursor P2

- [ ] Implement Cursor Agent adapter.
- [ ] Support `--yolo`.
- [ ] Parse stream output.

### Task 7.4 Codex P3

- [ ] Confirm supported execution mode.
- [ ] Implement adapter after protocol validation.

---

## Wave 8: E2E and Release Gate

### Task 8.1 Owner Happy Path

- [ ] Login Dashboard.
- [ ] Generate Host token.
- [ ] Start Host.
- [ ] Create OpenClaw Agent.
- [ ] Send message.
- [ ] Receive reply.
- [ ] Refresh and read history.

Verification:

```bash
cd tests && npx playwright test tests/e2e/web/owner-agent-chat.spec.ts
```

### Task 8.2 Regression

- [ ] Existing Visitor QR flow.
- [ ] Agent plugin history replay.
- [ ] decrypted-messages existing actors.

Verification:

```bash
cd tests && npx vitest run
cd tests && npx playwright test
```

### Task 8.3 Final Verification

- [ ] Gateway typecheck.
- [ ] Web build.
- [ ] Web lint.
- [ ] Go Host tests.
- [ ] Supabase advisors.
- [ ] Security review.
- [ ] Update `CHANGELOG.md`.
- [ ] Update `dev-log/YYYY-MM-DD.md`.
- [ ] Update `.claude/progress/session-overview.md`.

Commands:

```bash
cd gateway && npm run typecheck
cd web && npm run build
cd qrclaw-agent-host && go test ./...
cd tests && npx vitest run
cd tests && npx playwright test
supabase db advisors
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Provider protocols differ | Adapter per provider, P0-P3 staged delivery |
| Full Access risk | Owner-only first release, explicit confirmation, token revocation |
| Context/run cross-talk | `run_id` everywhere, session/workdir isolation or queue |
| RLS leakage | Dedicated RLS integration tests |
| QR regression | Regression suite before release |
| Codex complexity | P3 after protocol validation |
| Late integration | Wave 2.5 mock Host harness before Gateway implementation proceeds |
| Gateway horizontal scaling | This release assumes single Gateway instance; migrate Host registry to Redis before scaling out |

---

## Done Definition

The feature is complete when:

- Owner can create an Agent bound to OpenClaw local Host.
- Owner can chat privately with local or cloud Agent bindings.
- History is encrypted at rest and replayable.
- Host token can be created and revoked.
- Owner data is isolated by RLS.
- OpenClaw, Claude Code, Cursor Agent, and Codex support is delivered or explicitly signed off by Owner as deferred.
- Existing QR/Visitor flows still pass.
- Product, technical, design, and test docs are updated.

