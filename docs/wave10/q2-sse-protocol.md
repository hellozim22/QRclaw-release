# Wave 10 Q2 - Owner Agent OpenAI SSE Protocol

## 1. Decision

QRClaw Owner Agent Chat should expose an OpenAI-compatible SSE endpoint to the browser:

```text
POST /api/owner/agents/:agentId/chat
Authorization: Bearer <supabase-jwt>
Accept: text/event-stream
Content-Type: application/json
```

Host execution continues to use the existing Gateway <-> Host WebSocket protocol. The public browser contract changes from "HTTP send + Owner WS subscription + Supabase polling" to "one OpenAI-style streaming request per user turn".

Recommended migration stance:

- Keep Host WS. It is still the right internal control plane for local/cloud hosts, heartbeats, provider capabilities, backpressure and cancel frames.
- Replace Owner UI run-event WS (HEL-57) with SSE as the primary live output path.
- Keep `GET /api/owner/agents/:id/messages` and `decrypted-messages` as the canonical history/recovery path.
- Keep the existing `POST /messages` route temporarily for rollback and older QRClaw Web builds, then remove its live-reply behavior after `/chat` is stable.

## 2. Target Flow

```text
Browser/LobeChat
  POST /api/owner/agents/:agentId/chat
Gateway
  authenticate owner
  validate OpenAI-ish request
  create/get conversation
  encrypt owner message into owner_agent_messages
  create owner_agent_runs row
  register run stream sink
  send owner_agent_run_request to Host WS
Host
  owner_agent_run_accepted
  owner_agent_run_event(seq=N, event_type=text|thinking|tool_*)
  owner_agent_run_completed or owner_agent_run_failed
Gateway
  validate seq
  encrypt/persist run event
  translate event to OpenAI SSE chunk
  write data: {...}\n\n
  finish with data: [DONE]\n\n
Browser/LobeChat
  render stream natively
```

The stream sink must be registered before dispatching to Host, otherwise fast local hosts can emit the first chunk before HTTP has a listener.

## 3. Request Contract

Use an OpenAI Chat Completions subset, with QRClaw compatibility fields allowed:

```json
{
  "model": "claude",
  "stream": true,
  "messages": [
    { "role": "system", "content": "optional caller-side instruction" },
    { "role": "user", "content": "hello" }
  ],
  "client_message_id": "optional-idempotency-key"
}
```

Rules:

- `messages` is required; Gateway derives the owner message from the last `role=user` message with string content.
- `model` maps to `requested_model`; provider routing still comes from the Owner Agent binding (`backend_provider`).
- `stream` must be `true` or omitted. Non-stream JSON responses are out of scope for Wave 10.
- `client_message_id` or `Idempotency-Key` should dedupe browser retries. If omitted, Gateway creates a new run for every POST.
- Gateway must reject tool/function/image/audio input until QRClaw explicitly supports them.

The existing `{ content, content_type, requested_model, client_message_id }` body may be accepted during migration, but the new frontend should send the OpenAI shape.

## 4. SSE Response Contract

Headers:

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Each event uses OpenAI's `data:` line format:

```text
data: {"id":"chatcmpl_<run_id>","object":"chat.completion.chunk","created":1777377600,"model":"claude","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}

data: {"id":"chatcmpl_<run_id>","object":"chat.completion.chunk","created":1777377601,"model":"claude","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":null}]}

data: {"id":"chatcmpl_<run_id>","object":"chat.completion.chunk","created":1777377602,"model":"claude","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

Mapping:

| Host frame | SSE output |
| --- | --- |
| `owner_agent_run_accepted` | optional first chunk with `delta.role="assistant"` and empty content |
| `owner_agent_run_event(event_type=text)` | `delta.content = payload.content` |
| `owner_agent_run_event(event_type=thinking)` | omit by default; optionally emit as content only when agent/debug mode enables it |
| `owner_agent_run_event(tool_use/tool_result/status)` | persist metadata; do not emit to OpenAI clients until tool-call mapping is designed |
| `owner_agent_run_completed(final_message)` | if no text events were emitted, emit `final_message`; then emit finish chunk + `[DONE]` |
| `owner_agent_run_failed` | emit an SSE error chunk if bytes are still writable, then `[DONE]`; also return HTTP error only if failure occurs before first `data:` write |

Do not add QRClaw-only top-level fields to chunks that LobeChat parses strictly. If diagnostics are needed, use comments (`: run_id=...`) or server logs without plaintext.

## 5. Gateway Design

Add a small streaming hub inside Gateway:

```text
gateway/src/services/owner-agent-run-streams.ts
  register(runId, sink)
  publishAccepted(frame)
  publishEvent(frame)
  publishCompleted(frame)
  publishFailed(frame)
  close(runId, reason)
```

The hub is process-local in Wave 10, matching the current in-memory Host registry. Horizontal scale requires Redis/pubsub or sticky routing for both Host WS and Owner SSE.

Route handler outline:

1. Authenticate with `jwtAuthMiddleware`.
2. Resolve `owner_id` and `agentId`.
3. Parse request with a new shared HTTP contract.
4. Reuse `sendOwnerAgentMessage` internals, but split it into:
   - `createOwnerAgentRunFromMessage(...)`
   - `dispatchOwnerAgentRun(...)`
5. Register SSE sink before dispatch.
6. On client disconnect, close only the sink by default. Do not auto-cancel the Host run unless request body has `metadata.qrclaw_cancel_on_disconnect=true`; OpenAI clients commonly disconnect during network changes.
7. Keep the run persisted so history/recovery can read it later.

Host router changes:

- `handleRunAccepted`: after DB status update, publish accepted to stream hub.
- `handleRunEvent`: after seq validation and encrypted persistence, publish plaintext payload to stream hub, then ack Host.
- `handleRunCompleted`: publish final/finish before `clearActiveRun`; keep encrypted final message persistence unchanged.
- `handleRunFailed`: publish failed before `clearActiveRun`.
- Existing owner WS `pushFrameToOwner` becomes migration-only and should not be the new frontend dependency.

Backpressure:

- If `res.write()` returns `false`, pause that sink until `drain`.
- Keep a per-run queued byte cap, for example 256 KB.
- If the cap is exceeded, close the SSE sink and call `cancelRunsForConversation` or a new `cancelRun(runId, "sse_backpressure")` only when product wants disconnect to stop work. Otherwise keep Host running and persist for recovery.

## 6. HEL-57 Owner WS Disposition

HEL-57 should be kept temporarily, then retired.

Phase A keeps both channels:

- New `/chat` streams live deltas for updated Web/LobeChat clients.
- Existing Owner WS subscription remains for older Web clients and rollback.
- Gateway emits no additional plaintext beyond current live frame behavior.

Phase B makes SSE primary:

- Web store `sendMessage()` calls `/chat` and parses SSE.
- Remove `waitForRunReply()` polling placeholder that currently returns `"Reply received."`.
- Stop calling `ensureOwnerWsSubscription()` from Owner Agent Chat pages.

Phase C retires Owner run-event WS:

- Remove browser-facing `owner_agent_run_event` / `owner_agent_run_completed` fanout.
- Keep Host WS frames and shared contracts because they are still internal execution protocol.
- Keep `/api/owner/ws-ticket` only if other owner realtime features still use it.

Rationale: SSE is request-scoped and OpenAI-native. Keeping a parallel Owner WS indefinitely creates duplicate ordering, dedupe and reconnection semantics.

## 7. Multi-Tab And Multi-Device

SSE does not broadcast one request stream to all tabs. The initiating tab owns the live stream.

Expected behavior:

- Two tabs sending messages create two independent runs unless they share the same idempotency key.
- A second tab opened mid-run should load persisted messages and, if needed, decrypted run events via `decrypted-messages` with `include_events=true`.
- Final messages remain cross-device because `owner_agent_messages` and `owner_agent_run_events` are persisted.
- Live mirrored deltas across devices are not part of the OpenAI SSE contract. If product requires them later, add a QRClaw-specific `GET /api/owner/agents/:agentId/runs/:runId/events?after_seq=N` SSE recovery endpoint, backed by `decrypted-messages`, not Owner WS.

Deduping:

- Use `client_message_id` / `Idempotency-Key` for retry safety.
- Store the id on `owner_agent_messages.metadata` or a dedicated nullable column if migration is approved.
- Return/reconnect to the existing `run_id` when the same owner+agent+client key is retried before completion.

## 8. Reconnect And Resume

OpenAI Chat Completions streaming has no standard resume cursor. Wave 10 should define recovery, not pretend transparent SSE resume exists.

If the HTTP stream disconnects:

- Gateway removes the SSE sink.
- Host run continues unless explicitly cancelled.
- Gateway continues encrypting and persisting Host events.
- Browser reloads history through `GET /api/owner/agents/:id/messages`.
- QRClaw Web can additionally call `decrypted-messages` with `actor=owner-private-agent-chat`, `include_events=true`, `run_id`, `after_seq` to rebuild in-progress text.

If Host reconnects:

- Preserve existing `host_register.in_flight_runs` + `last_seq` direction.
- Implement the spec's missing `owner_agent_run_replay` later if Host-side resume becomes real.
- Until then, Gateway can only validate monotonic seq for events it receives after dispatch.

## 9. C2 Encryption Boundary

SSE emits plaintext because OpenAI-compatible clients expect plaintext assistant deltas. C2 is preserved by keeping plaintext transient:

- Owner request plaintext exists in browser, Gateway write-path memory, and Host provider memory.
- Host event plaintext exists in Gateway memory only long enough to encrypt/persist and write to the currently authorized SSE response.
- Persisted `owner_agent_messages` and `owner_agent_run_events` remain encrypted with the existing DEK/KEK envelope.
- Gateway must never read historical ciphertext and decrypt it for SSE resume.
- Resume/history continues through `decrypted-messages`, the authorized read-path decryptor.
- Logs, errors, metrics and comments must not include message content, deltas, prompts, tokens, KEK or DEK.

Encrypted content is therefore not sent inside SSE. Sending ciphertext would be OpenAI-incompatible and would move decryption to LobeChat, which is not part of the current client contract.

## 10. Control Signals

Keep control signals off the OpenAI chat SSE response body.

| Action | Recommended route/channel | Notes |
| --- | --- | --- |
| `reset_context` | existing `POST /api/owner/agents/:id/conversation/reset` | Should also cancel active/pending runs for that conversation via registry, then clear provider session/workdir. |
| `cancel_run` | add `POST /api/owner/agents/:id/runs/:runId/cancel` | Gateway validates owner/run, sends `owner_agent_run_cancel` to Host, marks run `cancelled`. |
| browser disconnect | no cancel by default | Avoid killing long runs on flaky mobile networks. |
| host backpressure/seq gap | Host WS failure frames | Gateway persists failure and emits SSE finish/error if stream is attached. |

Do not overload `data: [DONE]` to mean cancel or reset. `[DONE]` only means the SSE stream is closed.

## 11. `decrypted-messages` Reuse

The existing Edge Function remains the canonical history reader:

- `actor=owner-private-agent-chat` already supports `include_events`, `run_id` and `after_seq`.
- `GET /api/owner/agents/:id/messages` can keep returning final messages for normal page load.
- A future QRClaw Web recovery helper can call the Edge Function through Gateway or directly, then fold `events[]` into the in-progress assistant message.
- No new read-path decryptor should be added to Gateway.

Small improvement: `GET /messages` currently maps agent rows to `run_status=completed`. If the UI wants active-run recovery, add a dedicated response field for active run ids/cursors rather than guessing from final messages.

## 12. Phased Migration Checklist

Phase 1 - Gateway contract and stream bridge:

- Add shared request schema for OpenAI-compatible `/chat`.
- Split `sendOwnerAgentMessage` into create-run and dispatch pieces.
- Add `owner-agent-run-streams` hub.
- Add `/api/owner/agents/:agentId/chat` SSE route.
- Publish Host run frames from `host-router.ts` into the stream hub.
- Add integration tests for text chunks, final-only completion, failure before/after first byte, client disconnect and C2 no-plaintext logs.

Phase 2 - Web client:

- Replace `sendMessage()` with SSE parser.
- Remove `waitForRunReply()` placeholder behavior.
- Keep history reload through existing `/messages`.
- Keep HEL-57 subscription behind a temporary fallback flag.

Phase 3 - Recovery and controls:

- Add idempotency storage.
- Add `POST /runs/:runId/cancel`.
- Make reset context cancel active/pending runs before clearing context.
- Add optional QRClaw recovery endpoint or Web helper using `decrypted-messages include_events`.

Phase 4 - Retire old live channel:

- Remove Owner run-event WS fanout from Web.
- Delete fallback subscription code after one stable release window.
- Keep Host WS and contracts as internal protocol.

## 13. Open Questions

- Should disconnect cancel expensive full-access local runs, or always allow recovery? Default recommendation: continue and recover.
- Does LobeChat require the route to be named `/v1/chat/completions`, or can it point to `/api/owner/agents/:id/chat`? If it requires the former, add an alias route that resolves agent id from model/base URL config.
- Do we want `thinking` visible in QRClaw Web? Default recommendation: persist but do not emit to OpenAI clients.
