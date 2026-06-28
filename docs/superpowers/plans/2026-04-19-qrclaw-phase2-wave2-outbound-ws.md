# QRClaw Phase 2 Wave 2 — Outbound WS Frame Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Every Zod / type change MUST follow TDD: write failing test → run → implement → run → commit. Every emit-site migration MUST land alongside an integration test asserting the exact frame shape still parses.

**Goal:** Extend the `shared/contracts/ws/` SSoT (Phase 1) with runtime Zod schemas for every **gateway → client (outbound)** frame, plug every gateway emit site into a single typed `sendFrame()` helper, and ship a feature-flagged rollout that upgrades from "log-only in prod" to "strict-drop" once observability confirms zero failures for N consecutive days.

**Architecture:** `shared/contracts/ws/types.ts` remains the single TS source of truth consumed by `web/` (zod-free) and `supabase/` (generated copy). A new sibling module `shared/contracts/ws/outbound.ts` carries Zod schemas + `validateOutboundFrame()`, paired with parity tests that lock `z.infer<>` ≡ hand-written TS interface. Gateway gains a `sendFrame(ws, frame)` helper (in a new `gateway/src/ws/send.ts`) that validates every outbound payload before calling `ws.send()`. In log-only mode (default on `prod`), validation failures emit a pino `warn` + Prometheus counter but the frame is still delivered. In strict mode (default on `test` / `dev`), a failure drops the frame.

**Tech Stack:** TypeScript 5.9 (NodeNext in gateway, bundler in web), Node 20, Zod 4.3.6 (owned by `shared/package.json` per Phase 1 FU2), Vitest 4.1 (from `tests/`), pino 9 (gateway's existing logger), prom-client (already wired in `gateway/src/monitoring/perf.ts`). Next.js 16 / `web/` is **not** touched by this wave.

---

## §0 Metadata

**为什么要做这件事？** Phase 1 把客户端发给网关的 WebSocket 帧用 Zod 严格校验了，所以非法入站帧会被拒绝；但网关发给客户端的帧目前只有 TypeScript 类型约束，没有运行时校验。这意味着如果网关代码里某个分支写错了字段名（比如 `security_envelope` 漏了、`status` 值拼错），web 端会静默崩溃或错渲染，排查起来很痛。本波把出站帧也纳入 Zod 校验。

| Field | Value |
|---|---|
| Status | **Draft** |
| Wave | Phase 2, Wave 2 (outbound WS validation) |
| Depends on | Phase 1 plan `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md` (SSoT + shared/ + sync-contracts) + Phase 2 Wave 1 plan (pending — scope TBD, not blocking the design of this plan) |
| Owner | single implementer + two reviewers (code-reviewer + spec-reviewer) |
| Scope | `shared/contracts/ws/outbound.ts`, `gateway/src/ws/send.ts`, every gateway emit site, CI observability wiring, qrclaw-map skill update |
| Out of scope | Web-side Zod (web stays zod-free), schema generation, wire format changes, HTTP DTO contracts |
| Estimated tasks | 7 (T1–T6 + C1 final verification) |
| Estimated commits | 9–12 (each task 1–2 commits) |

Wave-1 dependency note: an in-flight Wave 1 plan may touch `gateway/src/ws/router.ts` (e.g. to split handlers into per-domain files). If Wave 1 lands first, emit-site file paths in §2 may shift — the implementer MUST re-grep before starting T3. The plan structure survives the file move.

---

## §1 Problem Statement & Goals

**这一节讲的是：问题是什么、为什么要解决、不做什么。**

### 1.1 The failure mode

网关每天会向成千上万个 WebSocket 客户端发出 9 种不同的帧。今天网关和 web 对出站帧的契约只靠 TypeScript 类型维持：编译时能对，但运行时没有任何保险。举两个具体反例：

- **Phase 1 捕获的 `stream_chunk.sequence` 漂移（见 `docs/refactor/execution-log.md` D4 条目）**：网关偶尔不发 `sequence`，web 用 `?? 0` 兜底，再加上去重逻辑 `seq <= stored`，导致每个流的第一段之后所有无序 chunk 全部被默默丢弃。问题在于：TS 类型 `sequence?: number` 看起来两边都合法，编译通过，但语义不一致。如果当时有 Zod 校验 + parity 测试 + 样例回放，就能在开发阶段发现。
- **Router 里的 `'rejected:invalid_session'` / `'rejected:agent_unreachable'` ack status**：TS 类型明文写 `status: 'sent' | 'delivered' | 'read' | 'failed'`，但 `router.ts` 实际发出的字符串是 `'accepted'` / `'duplicate'` / `'rejected:*'`。web 上代码 `switch (status)` 不匹配任何分支，UI 上 optimistic message 会永远停在 "sending" 状态。没人报 bug 只是因为这些分支很少走到。

这种 drift 是跨服务契约维护最常见的腐蚀源。Phase 1 解决了方向 A（client → gateway），Wave 2 解决方向 B（gateway → client）。

### 1.2 Goals

- **G1**：网关产生的每一种出站帧都有一份 Zod schema，和 TS 接口形成 `z.infer<> ≡ interface` 的 parity（与 Phase 1 Task 2 的测试手法一致）。
- **G2**：所有出站 `ws.send(...)` 调用统一走 `sendFrame(ws, frame)` helper，该 helper 在发送前跑一次 Zod 校验。
- **G3**：校验失败时，可观测（pino + prom counter），可回退（feature flag 切换 log-only vs strict-drop），可定位（日志带 frame.type + connection_id + 第一个失败路径）。
- **G4**：引入 Wave 2 不改变任何线上行为；默认模式是 log-only，strict-drop 只在 `test` / `dev` 环境 + CI 上默认开启。
- **G5**：把所有 drift（包括 §2.3 列举的 7 条）在 schema 里一次性消化掉，要么加进 TS 类型，要么收紧 Zod。

### 1.3 Non-goals

- ❌ **不做 schema 生成**（JSON schema / OpenAPI）。Zod 就是源。
- ❌ **不改变 wire format**。现有出站帧的字节级结构保持不变；只是开始校验。
- ❌ **不给 web 加 Zod**。web 继续只消费 TS 类型。web bundle 不应该因为本 wave 出现任何 zod import。
- ❌ **不覆盖反向（inbound）帧**。Phase 1 已经做完。Wave 2 只做 server → client。
- ❌ **不处理 Supabase Edge 出站**。当前 edge functions 不直接写 WebSocket；等 HTTP DTO 波次再处理。

### 1.4 Scope summary

| Covered by Wave 2 | Not covered |
|---|---|
| 9 outbound frame types (see §2.1) | Inbound frames (Phase 1) |
| Every gateway emit site (15 sites, see §2.2) | HTTP REST DTOs |
| `gateway/src/ws/send.ts` helper | Supabase Edge functions |
| Feature-flagged rollout (log-only → strict) | Web runtime validation |
| Observability counter | New wire format fields |
| qrclaw-map skill update | Dev onboarding doc rewrite |

---

## §2 Current State Inventory

**这一节讲的是：动手改之前，先盘清当前每个帧的类型、emit 点、drift。**

### 2.1 Outbound frame catalog (from `shared/contracts/ws/types.ts`)

| # | Frame type | Direction | `ServerFrame` union member? | Zod today? | TS payload fields |
|---|---|---|---|---|---|
| 1 | `connection_ack` | OUTBOUND only | ✓ | ✗ | `connection_id`, `heartbeat_interval_ms`, `server_time?` |
| 2 | `ack` | OUTBOUND only | ✓ | ✗ | `message_id`, `status`, `error_code?`, `error_message?` |
| 3 | `message` | OUTBOUND only | ✓ | ✗ | `content`, `content_type`, `sender_type`, `conversation_id` |
| 4 | `agent_typing` | OUTBOUND only | ✓ | ✗ | `conversation_id` |
| 5 | `pong` | OUTBOUND only | ✓ | ✗ | (no payload; only `type` + `timestamp`) |
| 6 | `error` | OUTBOUND only | ✓ | ✗ | `code`, `message`, `details?` |
| 7 | `system` | OUTBOUND only | ✓ | ✗ | `event` (enum), `data?` |
| 8 | `stream_chunk` | **BIDIRECTIONAL** | ✓ | ✓ (inbound) | `conversation_id`, `delta`, `sequence?`, `is_final?` |
| 9 | `stream_end` | **BIDIRECTIONAL** | ✓ | ✓ (inbound) | `conversation_id`, `total_chunks?`, `total_length?`, `full_content?` |
| — | `visitor_message` | inbound AND emitted outbound (router.ts:203-217) — NOT in ServerFrame union | ClientFrame only | ✓ (inbound) | outbound also carries `sender_type`, `qr_code_id`, `system_prompt?` which are NOT in TS interface |

Inbound-only (Phase 1 territory, untouched by Wave 2): `ping`, `agent_message`, `read_receipt`, `auth`.

Bidirectional frames (`stream_chunk`, `stream_end`) already have an inbound Zod schema. Wave 2 must decide: **reuse the same schema** (they happen to have the same shape today) or **split into `streamChunkInboundSchema` vs `streamChunkOutboundSchema`**. Decision locked in §3.2: **split** — outbound schemas live in `outbound.ts`, even if the body is currently identical, because `stream_end` outbound has started to diverge from inbound (security_envelope injection — see drift #3). Keeping them separate keeps future evolution sane.

### 2.2 Gateway emit-site inventory

Every site that writes a JSON-stringified outbound frame to a live WebSocket. Source: `gateway/src/ws/handler.ts` + `gateway/src/ws/router.ts`.

| # | File | Line | Frame type | Pattern | Helper? |
|---|---|---|---|---|---|
| E1 | `gateway/src/ws/handler.ts` | 187 | `error` (code `auth_required`) | `ws.send(JSON.stringify({...}))` | no |
| E2 | `gateway/src/ws/handler.ts` | 259 | `connection_ack` | `ws.send(JSON.stringify(ack))` | no |
| E3 | `gateway/src/ws/handler.ts` | 279 | `message` (offline queue drain) | `ws.send(frame)` | no |
| E4 | `gateway/src/ws/handler.ts` | 355 | `error` (code `invalid_json`) | `ws.send(error)` | no |
| E5 | `gateway/src/ws/handler.ts` | 370 | `error` (code `invalid_frame`) | `ws.send(error)` | no |
| E6 | `gateway/src/ws/handler.ts` | 393 | `error` (code `routing_error`) | `ws.send(errorFrame)` | no |
| E7 | `gateway/src/ws/router.ts` | 189–197 | `agent_typing` | `sendSafe(ws, JSON.stringify(...))` | `sendSafe` |
| E8 | `gateway/src/ws/router.ts` | 203–218 | `visitor_message` (gateway→agent broadcast) | `forwardToRecipients(..., {type:'visitor_message', ...})` | `forwardToRecipients` → `sendSafe` |
| E9 | `gateway/src/ws/router.ts` | 313–318 | `message` (agent→visitor w/ envelope) | `forwardToRecipients([visitorEntry.ws], {...})` | `forwardToRecipients` → `sendSafe` |
| E10 | `gateway/src/ws/router.ts` | 363–374 | `stream_chunk` | `sendSafe(visitorEntry.ws, chunkFrame)` | `sendSafe` |
| E11 | `gateway/src/ws/router.ts` | 420–430 | `stream_end` (no envelope fallback) | `sendSafe(visitorEntry.ws, endFrame)` | `sendSafe` |
| E12 | `gateway/src/ws/router.ts` | 497–508 | `stream_end` (with security_envelope) | `sendSafe(visitorEntry.ws, endFrame)` | `sendSafe` |
| E13 | `gateway/src/ws/router.ts` | 627–632 | `pong` | `ws.send(pong)` | no |
| E14 | `gateway/src/ws/router.ts` | 634–644 | `ack` (all statuses) | `sendSafe(ws, ack)` | `sendAck` wrapper |
| E15 | `gateway/src/ws/router.ts` | 646–653 | `error` (router-level codes) | `sendSafe(ws, error)` | `sendError` wrapper |

**15 emit sites. 6 of them bypass `sendSafe()` entirely (E1–E6).** That's the refactor target — force every site through `sendFrame()`.

### 2.3 Drift findings (input for T1 schema design)

| # | Drift | Conflicting sites | Resolution |
|---|---|---|---|
| D1 | `visitor_message` as outbound frame | `types.ts` puts it in `ClientFrame` only; router.ts:203–218 emits it to agent with extra fields (`sender_type`, `qr_code_id`, `system_prompt`) | Add `VisitorMessageBroadcastFrame` (new TS type) to `ServerFrame` union OR explicitly widen `VisitorMessageFrame.payload` with optional outbound-only fields. **Lock-in:** new narrow TS type `VisitorMessageBroadcastFrame` — avoids polluting the inbound schema with gateway-only fields. |
| D2 | `message` outbound carries `security_envelope` | `types.ts` `MessageFrame.payload` has no envelope field; `router.ts:306–318` injects it via `injectSecurityEnvelope()` | Extend `MessageFrame.payload.security_envelope?: SecurityEnvelope` (use existing `SecurityEnvelope` type from `gateway/src/types/index.ts` — **moved to `shared/contracts/ws/types.ts`** as part of T1). |
| D3 | `stream_end` outbound also carries `security_envelope` | same as D2, but on `StreamEndFrame.payload` (router.ts:497–508) | Extend `StreamEndFrame.payload.security_envelope?` symmetrically. |
| D4 | `message` offline-queue drain carries `queued_at` | `handler.ts:267–277` emits `queued_at: string`; `types.ts` `MessageFrame.payload` has no such field | Extend `MessageFrame.payload.queued_at?: string`. |
| D5 | `ack.status` open-string reality vs enum | `types.ts`: `'sent' \| 'delivered' \| 'read' \| 'failed'`; router emits `'accepted'`, `'duplicate'`, `'rejected:invalid_session'`, `'rejected:agent_unreachable'` | Widen TS enum union to actual set: `'sent' \| 'delivered' \| 'read' \| 'failed' \| 'accepted' \| 'duplicate' \| 'rejected:invalid_session' \| 'rejected:agent_unreachable' \| 'rejected:rate_limited'`. Zod `z.enum([...])` mirrors. No `.passthrough()` on strings — we'd rather reject than accept an unknown status. |
| D6 | `error.payload.message_id` undocumented field | `router.ts:389` `errorFrame.payload.message_id` exists; `types.ts` `ErrorFrame.payload` does not declare it | Add optional `message_id?: string` to `ErrorFrame.payload`. |
| D7 | `error.code` open string | Fixed error codes used by gateway: `auth_required`, `invalid_json`, `invalid_frame`, `routing_error`, `rate_limited`, `forbidden`, `unknown_message_type`. TS: `code: string` (free-form) | Lock as `z.enum([...])` listing the 7 known codes. Any future code must be added to the enum intentionally. Future-proofing: add `'unknown_error'` as explicit catch-all; no `.passthrough()`. |

No further drift discovered. Seven findings total.

### 2.4 Web consumer inventory (readonly — for impact analysis only)

| Frame type | Dispatched in | Read fields |
|---|---|---|
| `connection_ack` | `web/src/lib/ws/client.ts:167` | `payload.heartbeat_interval_ms` |
| `ack` | `web/src/lib/ws/client.ts:175` → `useWebSocket.ts:106` | `payload.message_id`, `payload.status` |
| `message` | `web/src/lib/ws/client.ts:178` → `useWebSocket.ts:110` | `id`, `payload.content`, `payload.content_type`, `payload.sender_type`, `timestamp` |
| `stream_chunk` | `client.ts:181` → `useWebSocket.ts:122` → `chatStore.appendStreamDelta` | `id`, `payload.delta`, `payload.sequence` |
| `stream_end` | `client.ts:184` → `useWebSocket.ts:131` → `chatStore.endStream` | `id`, `payload.full_content` |
| `agent_typing` | `client.ts:187` → `useWebSocket.ts:137` | (no payload read — just flips `isAgentThinking`) |
| `pong` | `client.ts:190` | (no payload read) |
| `error` | `client.ts:193` → `useWebSocket.ts:141` | `payload.code`, `payload.message` |
| `system` | `client.ts:196` | (currently just forwarded to `onSystem` callback; no consumer wired) |

Impact assessment: **widening TS types (D2/D3/D4/D5/D6) is backward-compatible with every observed consumer** — they read a strict subset of fields. Locking `error.code` and `ack.status` enums (D7/D5) is also safe because web never narrows on enum membership, only does string comparisons.

---

## §3 Target Architecture

**这一节讲的是：加完 Zod 之后的代码长什么样，哪些文件新增、哪些文件改。**

### 3.1 File layout after Wave 2

```
shared/contracts/ws/
  types.ts         # (Phase 1) — extended with drift resolutions D1–D7
  protocol.ts      # (Phase 1) — inbound Zod, unchanged
  outbound.ts      # NEW — outbound Zod + validateOutboundFrame()
  index.ts         # (Phase 1) — no change; outbound.ts intentionally NOT re-exported

gateway/src/ws/
  handler.ts       # migrate emit sites to sendFrame()
  router.ts        # migrate emit sites to sendFrame()
  send.ts          # NEW — sendFrame() helper, flag-aware, metric-aware
  schemas.ts       # (Phase 1) — re-export extended to include outbound schemas

gateway/src/monitoring/
  perf.ts          # (existing) — extended with outbound_validation_failures_total counter

tests/unit/shared/
  contracts-ws-outbound.test.ts   # NEW — parity + runtime validation
tests/integration/ws/
  outbound-validation.test.ts     # NEW — simulate emit, assert schema pass/fail
```

### 3.2 Why `outbound.ts` (sibling) instead of extending `protocol.ts`

1. **Physical separation enforces the web-safety rule** — `protocol.ts` already carries the "gateway-only" stigma. Keeping outbound alongside reinforces "this file validates OUTBOUND" semantics; no mixed-direction schema file.
2. **Parity tests stay readable** — one file's worth of `expectTypeOf<>` per direction.
3. **Future divergence path** — bidirectional frames (`stream_chunk`, `stream_end`) need direction-aware schemas the moment a field diverges (already true for `stream_end`'s `security_envelope`). Sibling files let inbound stay strict while outbound widens.
4. **Barrel `index.ts` still forbids accidental web import** — `outbound.ts` is not re-exported there.

### 3.3 `sendFrame()` helper contract

```typescript
// gateway/src/ws/send.ts

import type { WebSocket } from 'ws';
import type { ServerFrame } from '../../../shared/contracts/ws/types.js';
import { validateOutboundFrame } from '../../../shared/contracts/ws/outbound.js';
import { getOutboundValidationMode } from '../config/feature-flags.js';
import { outboundValidationFailures } from '../monitoring/perf.js';
import { logger } from '../logger.js';

const MAX_BUFFER_SIZE = 128 * 1024;

export type SendFrameResult = 'sent' | 'dropped_backpressure' | 'dropped_invalid' | 'closed';

export const sendFrame = (
  ws: WebSocket,
  frame: ServerFrame,
  context: { connectionId?: string } = {},
): SendFrameResult => {
  if (ws.readyState !== ws.OPEN) return 'closed';
  if (ws.bufferedAmount > MAX_BUFFER_SIZE) return 'dropped_backpressure';

  const validation = validateOutboundFrame(frame);
  if (!validation.success) {
    outboundValidationFailures.inc({ frame_type: (frame as { type?: string }).type ?? 'unknown' });
    logger.warn({
      msg: 'outbound_frame_validation_failed',
      connectionId: context.connectionId,
      frameType: (frame as { type?: string }).type,
      error: validation.error,
    });
    if (getOutboundValidationMode() === 'strict') {
      return 'dropped_invalid';
    }
    // log-only mode: fall through and send anyway
  }

  try {
    ws.send(JSON.stringify(frame));
    return 'sent';
  } catch {
    return 'closed';
  }
};
```

Key properties:
- **Shape**: accepts a *parsed object* (not a pre-stringified string). Every emit site must stop calling `JSON.stringify` itself — the helper owns serialization.
- **Backpressure preserved**: the `bufferedAmount` check from today's `sendSafe()` is retained.
- **Two-mode**: `strict` drops invalid; `log-only` warns + sends.
- **Observability**: single counter `outbound_validation_failures_total{frame_type}` — labels bounded by the 9 known types + `unknown`.

### 3.4 Rollout strategy: **Option γ (HYBRID)**

**为什么选 γ？** 团队只有 1-2 人，MVP 阶段，线上出问题没法半夜响应。Option α 太激进（一旦 Zod 有 bug 就丢流量），Option β 没有终点（永远只是观察，drift 永远修不干净）。γ 的妙处在于：test + CI 上默认 strict（任何 drift 在 PR 阶段就被 vitest 染红），prod 默认 log-only（不影响现存流量），指标看板上 7 天无 failure 再手动翻转到 strict。

| Env | Default mode | How to flip |
|---|---|---|
| `test` (vitest), `ci` | `strict` | env `QRCLAW_OUTBOUND_VALIDATION=strict` set in `tests/vitest.config.ts` + CI workflow |
| `dev` (local `npm run dev`) | `strict` | default when `NODE_ENV !== 'production'` |
| `prod` (gateway deploy) | `log-only` | flip to `strict` via env `QRCLAW_OUTBOUND_VALIDATION=strict` after observability criterion |
| Observability flip criterion | `outbound_validation_failures_total == 0` for **7 consecutive days** across rolling window | manual review of Prometheus / pino logs |

Feature-flag shape: a single env var `QRCLAW_OUTBOUND_VALIDATION`, values `'strict' | 'log-only'`, decoded once at gateway boot and cached. No hot-reload (keeps semantics trivial; one-line change in `gateway/src/config/feature-flags.ts`).

### 3.5 Backward compatibility guarantees

- Web bundles: no change. `outbound.ts` is not re-exported through `index.ts`, so any accidental `@shared/contracts/ws` import from web still gets only types.
- Inbound schemas (Phase 1): untouched.
- Wire format: byte-identical.
- Gateway tests from Phase 1: must stay green.

---

## §4 Task Breakdown (TDD-driven)

**这一节讲的是：把活儿切成 6 个主任务，每个任务 2–5 分钟一个 step，先红再绿再提交。** Dependencies: T1 → T2 → T3 (per-domain, roughly parallelizable) → T4 → T5 → T6. Per Phase 1 style, every task lists files-touched allowlist, verification command, done-means checklist, and a reviewer checkpoint.

---

### T1: Schemas + parity tests

**这一步干什么？** 在 `shared/contracts/ws/outbound.ts` 里写全 9 种出站帧的 Zod schema，顺便把 §2.3 的 7 条 drift 全部在 `types.ts` 里一次修掉，并补齐 parity 测试。

**Files (allowlist — fail the reviewer if any other path is touched):**
- Modify: `shared/contracts/ws/types.ts` (only D1–D7 extensions; no renames, no deletions)
- Create: `shared/contracts/ws/outbound.ts`
- Create: `tests/unit/shared/contracts-ws-outbound.test.ts`
- Modify: `gateway/src/ws/schemas.ts` (re-export outbound schemas)
- Generate: `supabase/functions/_shared/contracts/ws/types.ts` via `node scripts/sync-contracts.mjs` (DO NOT edit by hand)

**Steps:**
1. Write failing parity test file (use `expectTypeOf<z.infer<typeof ackOutboundSchema>>().toEqualTypeOf<AckFrame>()` pattern from Phase 1 T2b).
2. Run: `cd tests && npx vitest run unit/shared/contracts-ws-outbound.test.ts` — expect FAIL (module missing).
3. Extend `types.ts` for D1 (new `VisitorMessageBroadcastFrame`), D2 (`security_envelope?` on `MessageFrame`), D3 (same on `StreamEndFrame`), D4 (`queued_at?`), D5 (widen `AckFrame.payload.status`), D6 (add `message_id?` to `ErrorFrame.payload`), D7 (no TS change — enum lives only in Zod; TS stays `code: string`).
4. Move `SecurityEnvelope` interface from `gateway/src/types/index.ts` → `shared/contracts/ws/types.ts` (otherwise MessageFrame can't reference it). Leave a re-export shim in gateway's types file so gateway imports don't break.
5. Create `outbound.ts` with 9 schemas: `connectionAckOutboundSchema`, `ackOutboundSchema`, `messageOutboundSchema`, `agentTypingOutboundSchema`, `pongOutboundSchema`, `errorOutboundSchema` (D7 enum), `systemOutboundSchema`, `streamChunkOutboundSchema`, `streamEndOutboundSchema`, and a 10th `visitorMessageBroadcastOutboundSchema` for D1. Plus `validateOutboundFrame(raw)` dispatch.
6. Run: sync-contracts to refresh supabase copy.
7. Run: `cd tests && npx vitest run` — expect GREEN; line count > baseline + at least 20 new cases (10 schemas × 2: one positive + one parity).
8. Run: `cd gateway && npm run typecheck && npm run build` — expect zero errors.
9. Commit.

**Verification:**
```
cd /Users/zeze/qrclaw/tests && npx vitest run unit/shared/contracts-ws-outbound.test.ts 2>&1 | tail -10
cd /Users/zeze/qrclaw/gateway && npm run typecheck 2>&1 | tail -5
node /Users/zeze/qrclaw/scripts/sync-contracts.mjs --check && echo OK
```

**Done means:**
- [ ] 10 new schemas exported from `outbound.ts`
- [ ] 10 parity tests pass (`expectTypeOf`) + at least 10 runtime positive cases + at least 5 runtime rejection cases (one per drift)
- [ ] `types.ts` captures D1–D7
- [ ] Supabase copy synced (CI `contracts-sync-check` would pass)
- [ ] Gateway typecheck green
- [ ] Web bundle unaffected (no need to re-run web — `@shared/contracts/ws/outbound` is not imported anywhere web can reach)

**Reviewer checkpoint (after commit):** code-reviewer verifies the 7 drift resolutions match §2.3; spec-reviewer checks `types.ts` additions are purely additive (widening) per the Phase 1 "editing rules".

**Halt condition:** if any TS change in `types.ts` is not purely additive (i.e. narrows an existing field), STOP — that breaks web at compile time. Re-design.

---

### T2: `sendFrame()` helper + feature flag + counter

**这一步干什么？** 建立出站发送的单一入口。

**Files:**
- Create: `gateway/src/ws/send.ts`
- Create: `gateway/src/config/feature-flags.ts` (if not present)
- Modify: `gateway/src/monitoring/perf.ts` (+ Prometheus counter `outbound_validation_failures_total`)
- Create: `tests/unit/backend/ws-send.test.ts`

**Steps:**
1. Write failing test that:
   - valid frame → `sent`, counter not incremented;
   - invalid frame + `strict` → `dropped_invalid`, counter +1, `ws.send` NOT called;
   - invalid frame + `log-only` → `sent`, counter +1, `ws.send` called anyway with the bad payload;
   - closed ws → `closed`, no validation, no metric;
   - buffered amount > MAX → `dropped_backpressure`, no validation.
2. Run: expect FAIL (module missing).
3. Implement `feature-flags.ts`: `getOutboundValidationMode(): 'strict' | 'log-only'` reading env `QRCLAW_OUTBOUND_VALIDATION`, default `strict` when `NODE_ENV !== 'production'`, else `log-only`.
4. Extend `perf.ts` with a prom-client `Counter` named `outbound_validation_failures_total`, label `frame_type`.
5. Implement `send.ts` exactly per §3.3.
6. Run tests → GREEN.
7. Commit.

**Verification:**
```
cd /Users/zeze/qrclaw/tests && npx vitest run unit/backend/ws-send.test.ts
```

**Done means:**
- [ ] 5 subtests green (sent / strict-drop / log-only / closed / backpressure)
- [ ] Counter visible on `/metrics` (confirm via smoke test in integration run — deferred to T4)
- [ ] Feature flag switchable via env without a redeploy needed (once `sendFrame()` starts being used)

**Reviewer checkpoint:** code-reviewer confirms `ws.send` is still called in log-only mode (zero-behavior-change guarantee); spec-reviewer confirms counter label cardinality stays bounded (10 known frame types + 1 unknown = 11 series).

**Halt condition:** if counter ends up with unbounded label cardinality (e.g. `connectionId`), STOP and fix before proceeding.

---

### T3: Migrate emit sites (domain-by-domain)

**这一步干什么？** 把 15 个 `ws.send()` / `sendSafe()` 调用逐个换成 `sendFrame()`。分 5 个子任务，每个子任务一次 commit，严禁把多个 domain 混在一个 commit 里。

#### T3a — stream domain (`stream_chunk`, `stream_end`)

Migrates: E10, E11, E12. Files touched: `gateway/src/ws/router.ts`.

- Replace the 3 `sendSafe(...)` calls with `sendFrame(ws, frameObject, { connectionId })`.
- Delete the inline `JSON.stringify(...)` wrappers — `sendFrame` stringifies.
- Run integration test `cd tests && npx vitest run integration/ws/`. Expect pass.
- Commit: `refactor(gateway): route stream emit sites through sendFrame`.

**Done means:** grep inside `handleStreamChunk` / `handleStreamEnd` / `forwardStreamEndToVisitor` yields zero `ws.send(` and zero `sendSafe(`. Integration tests for streaming still green.

#### T3b — ack / receipt domain (`ack`, `pong`)

Migrates: E13, E14. Files touched: `gateway/src/ws/router.ts`.

- Rewrite `sendAck()` and `handlePing()` internally to call `sendFrame()`.
- Keep the public helpers `sendAck` / `handlePing` since multiple call sites depend on them.
- Run tests.
- Commit.

#### T3c — error / system domain

Migrates: E1, E4, E5, E6, E15. Files touched: `gateway/src/ws/handler.ts`, `gateway/src/ws/router.ts`.

- Rewrite `sendError()` helper to use `sendFrame()`; use it for E15.
- For E1/E4/E5/E6 (bare `ws.send(JSON.stringify(...))` in handler.ts), inline-replace with `sendFrame(ws, {...})`.
- `system` frame has zero emit sites today (reserved for future presence updates); just make sure its schema exists (T1 covered it) and T6 adds a note.

#### T3d — message / typing domain

Migrates: E3, E7, E9. Files touched: both.

- E3 (offline queue drain): change the hand-built frame object to include the now-declared `queued_at` field (already in TS post-D4) and route via `sendFrame`.
- E7 (`agent_typing`): straightforward replacement.
- E9 (`message` with security_envelope): the frame object passed into `forwardToRecipients` is already the right shape — rewrite `forwardToRecipients` to take a typed frame and call `sendFrame` per recipient. Remove the `JSON.stringify` inside the old helper.

#### T3e — connection_ack + visitor_message broadcast

Migrates: E2, E8. Files touched: `handler.ts`, `router.ts`.

- E2 (`connection_ack`): straightforward.
- E8 (visitor_message broadcast): this now has its own Zod schema (`visitorMessageBroadcastOutboundSchema` from T1 / D1). The object currently built at router.ts:203–218 matches the schema exactly. Route via `sendFrame`.

**Global verification after all T3 substeps:**
```
cd /Users/zeze/qrclaw/gateway && rg -n 'ws\.send\(|sendSafe\(' src/ws/ | grep -v 'send.ts:'
```
Expected: zero matches outside `gateway/src/ws/send.ts`.

**Halt condition for any T3 substep:** if the integration suite (`tests/integration/ws/*.test.ts`) goes red **and** the root cause is not a drift already captured in §2.3 — STOP, open the execution log, record the new drift, decide: (a) widen the schema (back to T1) or (b) fix the emit site (proceed). Do not silently loosen.

---

### T4: Observability wiring

**这一步干什么？** 确认 Prometheus / pino 确实能看到校验失败的事件，没有看不到 bug 就等于没发生。

**Files:**
- Modify: `gateway/src/monitoring/perf.ts` (expose counter in `getMetrics()` output)
- Create: `tests/integration/ws/outbound-validation-metric.test.ts`

**Steps:**
1. Write integration test: spin up ws server, emit a deliberately malformed frame via a test-only bypass (export a `__sendRawForTest` in `send.ts`), assert that:
   - `outboundValidationFailures.get()` shows +1
   - pino logger captured the warn (use `pino-test` or intercept via a spy)
   - in log-only mode, the bad frame still reaches the client (close the loop)
2. Wire the counter into the `/metrics` endpoint Prometheus scrape if not already (check `gateway/src/routes/metrics.ts` existence; if missing, punt to a follow-up).
3. Commit.

**Done means:**
- [ ] Integration test green
- [ ] `curl localhost:3001/metrics | grep outbound_validation_failures_total` yields a 0-value sample after boot (confirms counter is registered, not just defined)

---

### T5: Flip feature flag — test env first, then prod

**这一步干什么？** 正式把 strict 模式打开。

**Files:**
- Modify: `tests/vitest.config.ts` (set `env.QRCLAW_OUTBOUND_VALIDATION=strict`)
- Modify: `.github/workflows/ci.yml` (set the same env on test jobs)
- Modify: `docs/refactor/execution-log.md` (append deploy log entry + date of prod strict flip — LEFT BLANK until criterion met)

**Steps:**
1. Add `env:` block to vitest config.
2. Add `env:` block to relevant CI jobs (`gateway-test`, `gateway-lint` don't need it; only `tests` job).
3. Run full CI locally (`cd tests && QRCLAW_OUTBOUND_VALIDATION=strict npx vitest run`). Expect green — if ANY test fails, a drift slipped through T1–T3; STOP, record in execution-log, go back.
4. Commit (with execution-log entry LEFT BLANK for prod flip — only test-env flip is in this commit).
5. **Do NOT flip prod in this task.** Prod flip is a future operational event gated on §3.4's 7-day zero-failure criterion; it's a one-line env var change that lives outside this plan.

**Done means:**
- [ ] Vitest runs with strict mode by default
- [ ] CI runs with strict mode
- [ ] Prod still log-only (no deploy env change in this wave)

**Reviewer checkpoint:** spec-reviewer verifies that flipping to strict in test does not cause any pre-existing test to flake — if a test mocks a broken outbound frame, it should be explicitly re-mocked to either (a) pass the schema, or (b) use the `__sendRawForTest` bypass to continue exercising the error path.

---

### T6: Update qrclaw-map skill (navigation doc)

**这一步干什么？** 让未来的 agent 知道加新出站帧要走哪些步骤。

**Files:**
- Modify: `.claude/skills/qrclaw-map/map.md` (add "Outbound WS frame recipe")

**Steps:**
1. Append a section "Recipe: adding a new outbound WS frame":
   1. Add the TS interface to `shared/contracts/ws/types.ts`.
   2. Add the frame to the `ServerFrame` union.
   3. Add the Zod schema to `shared/contracts/ws/outbound.ts` + entry in the `outboundSchemaMap` dispatcher.
   4. Add a parity test + runtime positive test in `tests/unit/shared/contracts-ws-outbound.test.ts`.
   5. Run `node scripts/sync-contracts.mjs` (refreshes supabase copy).
   6. Emit via `sendFrame(ws, frame)` from a handler — NEVER `ws.send()` or `sendSafe()` directly.
   7. Verify: `cd gateway && npm run typecheck`, `cd tests && npx vitest run`.
2. Commit.

**Done means:**
- [ ] Section exists, all 7 recipe steps spelled out
- [ ] Map's "cross-cutting contracts" table updated with a new row for `shared/contracts/ws/outbound.ts`

---

## §5 Verification Strategy

**这一节讲的是：怎么证明这波没坏东西。**

### 5.1 Per-task unit tests

Each task creates at minimum one new vitest file; T1 adds ~25 cases, T2 adds 5, T4 adds 1 integration case. Running `cd tests && npx vitest run` at task boundaries must stay green.

### 5.2 Integration tests

New file `tests/integration/ws/outbound-validation.test.ts` stands up a real gateway ws server (following the pattern of `tests/integration/ws/connection.test.ts`), and for each of the 9 outbound frame types:

- emits a valid frame, asserts the client receives it parseable,
- emits an invalid-but-documented-bad frame (via `__sendRawForTest`), asserts:
  - in strict mode, client receives nothing,
  - in log-only mode, client still receives the bad frame,
  - in both modes, `outboundValidationFailures` counter increments.

### 5.3 Parity tests (hard-lock)

Mirrors Phase 1 T2b pattern. For each Zod schema `S` paired with TS interface `I`:

```typescript
expectTypeOf<z.infer<typeof S>>().toEqualTypeOf<I>();
```

`toEqualTypeOf` (not `toMatchTypeOf`) is intentional — Phase 1 D1 drift (`WSFrame.id` inheritance) was only caught when Phase 1 upgraded the assertion. Wave 2 starts strict.

### 5.4 Observability verification

- Run gateway locally with `QRCLAW_OUTBOUND_VALIDATION=log-only` + a deliberate bad-frame bypass test.
- Hit `/metrics`, grep `outbound_validation_failures_total`, confirm increment.
- Tail `pm2 logs gateway` (or equivalent), confirm `outbound_frame_validation_failed` warn entries appear with `frameType` + `connectionId` + `error` fields populated.

### 5.5 Final six-pane check

Mirrors Phase 1 / Wave 0 gating. Must all pass before closing the wave:

| Pane | Command |
|---|---|
| Prettier | `npm run format:check` |
| Contracts sync | `node scripts/sync-contracts.mjs --check` |
| Gateway tsc | `cd gateway && npm run typecheck && npm run build` |
| Web tsc | `cd web && npx tsc --noEmit` |
| Vitest | `cd tests && npx vitest run` (with and without `QRCLAW_OUTBOUND_VALIDATION=strict`) |
| Workflows yaml | `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml` |

---

## §6 Execution Protocol

**这一节讲的是：谁来做、以什么节奏做、出问题怎么停。**

### 6.1 Roles

| Role | Who | Responsibility |
|---|---|---|
| Implementer | single subagent per task (fresh context) | writes code, runs local verification, commits |
| Code-reviewer | dedicated subagent after each task | reads diff, checks for drift from plan, confirms test coverage |
| Spec-reviewer | dedicated subagent after each task | reads spec (this plan), compares against diff, flags scope creep |

Parallelism: reviewers can run in parallel with each other (same commit, different perspectives); implementer must serialize across tasks (T1 → T2 → T3 substeps → T4 → T5 → T6). T3 substeps a–e touch the same files (`router.ts`, `handler.ts`) and MUST be serialized to keep commits reviewable.

### 6.2 Per-task commit discipline

- One **feature** commit per task (multiple commits allowed for T3's five substeps).
- Commit message body lists: files touched, test count added, drift findings resolved (if any).
- No combined "misc fixes" commits — any incidental find goes into the execution log + a dedicated follow-up commit.

### 6.3 Halt conditions

| Condition | Halt + rollback action |
|---|---|
| T1 parity test fails with a "narrowing" type change required to pass | STOP — the drift resolution is not purely additive; re-design in §2.3 before touching any emit site |
| T3 integration test surfaces a drift NOT in §2.3 | STOP — append new drift to execution-log, decide widen-schema vs fix-emit-site, update plan before proceeding |
| T5 vitest run fails when strict mode flips on | STOP — a latent emit site slipped through T3; bisect by substepping through T3a–T3e in strict mode |
| T4 counter has cardinality > 20 series | STOP — someone added a dimension (connectionId?); revert and cap |

### 6.4 Self-audit on every commit

```
git diff --ignore-all-space HEAD~1 HEAD | head -200
```

Skim for: stray console.logs, commented-out code, unrelated file modifications. If anything looks off, `git commit --amend` (only if not yet pushed, per AGENTS.md rules).

### 6.5 Local-delivery mode

Per the qrclaw monorepo's "no remote" stance (documented in Phase 1 + Wave 0), all Wave 2 commits land locally. CI / prod flag flip happen once the user pushes the branch to GitHub. Execution-log records "code-ready, awaiting push" entries for T4/T5.

---

## §7 Risk Register

**这一节讲的是：最有可能出问题的地方在哪，怎么防。**

| # | Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|---|
| R1 | **`stream_chunk` validation overhead in hot path** — at ~50 chunks/sec per active stream, Zod parsing adds 30–80µs per frame | Medium | Latency regression on streaming UX | Before T5 flip to strict-in-prod, run a micro-benchmark: 10k `streamChunkOutboundSchema.parse(validFrame)` calls, measure p99. If > 200µs, fallback to `safeParse` + consider precompiling via `z.object().parse` pinned at module load. Record result in execution-log. |
| R2 | **Broadcast fan-out attribution** — `forwardToRecipients()` sends the same frame to N agents; if schema fails, metric increments once per recipient even though the payload is the same | Low | Noisy metric, misleading dashboards | `sendFrame` validates once per *frame*, but counter increments per *send call*. Acceptable: each recipient consuming a bad frame is its own UX harm. Document this semantics in the counter help text. |
| R3 | **Dev-time sample frames / test mocks drift** — hand-built frame objects in integration tests (e.g. `tests/integration/ws/connection.test.ts`, `tests/acceptance/mock-agent.ts`) might not conform to the now-strict schemas | High | T5 strict-flip goes red | Before T5, grep `tests/` for hand-built `type: 'xxx'` literals (use the regex `type:\s*['"](connection_ack\|ack\|pong\|message\|agent_typing\|error\|system\|stream_chunk\|stream_end)['"]`). Audit every hit; either fix the mock or route through a `buildFrame<T>()` factory. |
| R4 | **Feature flag toggle path unclear** — single env var is easy to forget | Medium | Unexpected behavior post-deploy | Document flag in `gateway/README.md` in T6; also add a boot-time pino log `gateway started: outbound_validation_mode=<mode>`. |
| R5 | **`SecurityEnvelope` move from gateway to shared breaks gateway imports** | Low | gateway typecheck red | T1 Step 4 leaves a re-export shim in `gateway/src/types/index.ts`. Verify with `rg "SecurityEnvelope" gateway/src` — every hit should resolve via the shim. |
| R6 | **Counter registration collision** — if `outboundValidationFailures` is imported in test setup multiple times, prom-client throws on duplicate registration | Medium | Test suite red | Register in `perf.ts` using `promClient.register.getSingleMetric('outbound_validation_failures_total') ?? new Counter(...)` pattern. Covered by T2 step 4. |
| R7 | **D1 widening (`ServerFrame` now includes `visitor_message` outbound)** may confuse web narrowing logic | Low | Web `switch (frame.type)` might hit the new case | Web's `client.ts:166` switch currently has no `'visitor_message'` case → `default: break;` — confirmed safe; no UX change. Record fact in PR description. |

---

## §8 Local Delivery vs GitHub Boundary

**这一节讲的是：哪些改完就真生效了，哪些等 push 到 GitHub 才真生效。**

| Artifact | Locally verifiable after commit | Awaits GitHub push / prod deploy to actually take effect |
|---|---|---|
| `shared/contracts/ws/outbound.ts` Zod schemas | ✅ vitest run green | — (pure code, no runtime difference) |
| `shared/contracts/ws/types.ts` D1–D7 edits | ✅ typecheck gateway + web | — |
| `supabase/functions/_shared/contracts/ws/types.ts` synced copy | ✅ `sync-contracts.mjs --check` OK | CI `contracts-sync-check` green once pushed |
| `gateway/src/ws/send.ts` helper | ✅ unit tests green | — |
| Feature-flag wiring | ✅ `QRCLAW_OUTBOUND_VALIDATION=strict npm run dev` works locally | Prod takes effect only when operator sets env on the VPS gateway and restarts (`pm2 restart gateway`) |
| Emit-site migration (T3) | ✅ integration tests + strict mode in vitest | Byte-identical wire format, so zero prod difference on commit |
| Prometheus counter `outbound_validation_failures_total` | ✅ visible at `localhost:3001/metrics` | Grafana dashboard needs manual panel creation after first prod scrape |
| pino warn logs | ✅ visible in local gateway stdout | Log aggregator (whatever the VPS uses) will start receiving once deployed |
| Strict flip in prod | ❌ not in this wave | Gated on §3.4 7-day zero-failure criterion, executed outside this plan as a one-line env change |
| `.claude/skills/qrclaw-map/map.md` recipe update | ✅ doc only | — |

---

## §9 Out-of-scope Follow-ups

**这一节讲的是：这波不做、但下一波要记得做的事。**

1. **Bidirectional frame schema split.** `stream_chunk` and `stream_end` today share a Zod schema shape across directions. Wave 2 gives each direction its own schema file (outbound.ts / protocol.ts) but the bodies are copy-pasted. When outbound's `security_envelope` becomes non-optional, or when inbound gets a new field, re-audit to make sure divergence is captured. **Scope:** next refactor wave.

2. **`ping` / `pong` direction clarification.** Today `PingFrame` is client-only (web sends ping) and `PongFrame` is server-only (gateway responds with pong). The SDK literature sometimes treats these as mirrors. If we ever add server-initiated ping (e.g. for idle detection), Wave 3 must add `ping` to `ServerFrame` union and a matching outbound schema. Document as a known gap.

3. **Schema evolution playbook.** What happens when we want to add a new field to an outbound frame?
   - Step 1: add to TS interface as optional.
   - Step 2: widen Zod to accept missing field (keep `.strict()`).
   - Step 3: deploy gateway with the field populated.
   - Step 4: once all producers populate, tighten Zod (optional → required) in a follow-up PR.
   - Write this up as an ADR (`docs/adr/004-ws-schema-evolution.md`) in a future wave.

4. **Outbound validation in Supabase Edge.** If Edge functions start pushing frames into the WS fabric (via the broker), they'll need to import `@shared/contracts/ws/outbound` too. Deno can import zod 3+ directly; the sync script already copies `types.ts` but does NOT copy `outbound.ts`. When this becomes relevant, extend `sync-contracts.mjs` entry table.

5. **Strict-mode flip criterion** — 7-day zero-failure window is a working hypothesis. After first prod exposure, reassess: should we require N distinct frame types observed (not just "no failures" which could mean "no traffic")? Track in execution-log once prod data lands.

6. **Codegen vs hand-written Zod.** Once there are 15+ Zod schemas, consider generating them from TS interfaces via `ts-to-zod`. Not now — 10 schemas don't justify the generator dependency.

7. **Rate-limit the validation failure counter / log.** If a buggy gateway binary floods the log with millions of `outbound_frame_validation_failed` entries, disk fills up. Add a log-level rate limit (pino's built-in `level` mechanism per-logger or a sampled pino child logger). Record as a follow-up in the execution-log the moment a >1000/min burst is observed.

---

## §10 Self-Review Checklist (run before execution)

**这一节讲的是：把这份 plan 当 spec，对照一遍。**

**Spec coverage:** Every drift (D1–D7) maps to T1 schema / type edits. Every outbound emit site (E1–E15) maps to T3 substeps a–e. Helper created in T2. Observability in T4. Rollout in T5. Doc in T6. ✅

**Placeholder scan:** No `TBD`, `TODO`, `implement later`, `similar to Task N`. Every file has an exact path; every step has an exact command; every test case has at least a description of the assertion shape. ✅

**Type consistency:** `sendFrame(ws, frame, ctx)` signature appears in §3.3, T2 test cases, and T3 migration steps under the same name. `validateOutboundFrame` appears in outbound.ts definition (T1), send.ts import (T2), and integration test (T4) under the same name. `outboundValidationFailures` counter name consistent across T2/T4/R6. `QRCLAW_OUTBOUND_VALIDATION` env var spelling consistent across §3.4, T2, T5. ✅

**TDD discipline:** T1, T2, T4 each follow red-green-refactor. T3 substeps are refactor-with-green-tests (existing suite must stay green). T5 is CI wiring only. T6 is doc-only. ✅

**Commit granularity:** Estimated 9–12 commits across 6 tasks (T3 alone accounts for 5). Each commit scoped to one concern. Execution-log entry per wave-task at close. ✅

---

## Next action for the orchestrator

Dispatch T1 as a fresh subagent using `superpowers:subagent-driven-development`. Provide the subagent with: this plan path, the Phase 1 plan path (for pattern reference), and the execution-log path (for writing deviations). Halt dispatch of T2 until T1's code-reviewer + spec-reviewer both return ✅.
