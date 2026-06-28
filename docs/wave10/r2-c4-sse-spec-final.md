# W10-R2 C4 SSE Protocol Final Spec

> Inputs: `q2-sse-protocol.md` + `r1-sse-integration-spec.md`.
> Goal: one executable contract for Gateway SSE, UI libraries, and QRClaw Web.

## 0. Final Decision

Gateway exposes **OpenAI Chat Completions SSE** as the canonical browser-facing stream:

```text
POST /api/owner/agents/:agentId/chat
POST /v1/chat/completions        # compatibility alias
```

Do not make Gateway emit Vercel ai-sdk data stream protocol (`0:"text"` lines). That protocol is a UI/app-route transport, while QRClaw Gateway is the model/runtime boundary. If Web uses ai-sdk `useChat`, add a Web app-route adapter that consumes Gateway OpenAI SSE and returns ai-sdk UI stream. If Web uses assistant-ui custom runtime or LobeChat runtime, consume the OpenAI chunks directly.

Selected C3 stack expectation:

| Consumer | Gateway contract | Integration note |
|---|---|---|
| `@assistant-ui/react@0.12.26` | OpenAI chunk SSE | consume through QRClaw runtime adapter, not ai-sdk data stream |
| `@assistant-ui/react-ui@0.2.1` | adapter-fed state | renders thread/composer/actions; no protocol dependency |
| `@assistant-ui/react-markdown@0.12.11` | text parts | render `delta.content`; raw HTML stays disabled |
| attachments/image packages | references only | `react-dropzone@15.0.0` uploads first; `react-photo-view@1.2.7` previews signed URLs |

## 1. Non-Negotiable Invariants

1. One user turn creates one run and one primary SSE stream.
2. Host execution remains Gateway <-> Host WebSocket; browser never speaks Host WS.
3. SSE uses anonymous `data:` lines only. Do not add SSE `event:` names.
4. `[DONE]` appears exactly once and only means stream closed.
5. `delta.content` is always a string when present; never `null`.
6. Gateway never logs plaintext prompt, delta, file content, JWT, KEK, DEK, or tool output.
7. Persisted messages and run events remain encrypted; history/recovery read path stays `decrypted-messages`.
8. Gateway never emits ai-sdk data stream protocol from `/chat` or `/v1/chat/completions`.

## 2. Request Contract

```http
POST /api/owner/agents/:agentId/chat
Authorization: Bearer <supabase-jwt>
Accept: text/event-stream
Content-Type: application/json
Idempotency-Key: <optional-client-message-id>
```

```json
{
  "model": "claude",
  "stream": true,
  "messages": [
    { "role": "system", "content": "optional caller instruction" },
    { "role": "user", "content": "hello" }
  ],
  "client_message_id": "uuid-from-client",
  "metadata": {
    "qrclaw_cancel_on_disconnect": false
  }
}
```

`/v1/chat/completions` exists for LobeChat, OpenAI SDK, ai-sdk provider smoke tests, and curl. Route agent identity as follows:

| Source | Agent resolution |
|---|---|
| `/api/owner/agents/:agentId/chat` | path param wins |
| `/v1/chat/completions?agent_id=<id>` | query param wins |
| `/v1/chat/completions` with `model="qrclaw:<id>"` | parse model suffix |

Reject ambiguous requests with `400 invalid_request`.

`messages[].content` accepts either a string or an array:

```ts
interface TextPart { type: 'text'; text: string; }
interface ImagePart { type: 'image_url'; image_url: { url: string; }; }
interface FilePart { type: 'input_file'; file_id: string; }
type MessageContent = string | Array<TextPart | ImagePart | FilePart>;
```

Attachments must be uploaded before chat via `POST /api/owner/files`. The chat body only carries `file_id` or signed `image_url.url`. Gateway rejects `data:` base64 URLs and MIME types outside `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`, and `text/*`.

## 3. Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
X-QRClaw-Run-Id: <run_id>
X-QRClaw-Conversation-Id: <conversation_id>
```

If the run fails before the first byte is written, return non-2xx JSON instead of SSE.

## 4. Chunk Envelope

Every JSON data chunk uses this shape:

```json
{
  "id": "chatcmpl_<run_id>",
  "object": "chat.completion.chunk",
  "created": 1777377600,
  "model": "claude",
  "choices": [
    {
      "index": 0,
      "delta": {},
      "finish_reason": null
    }
  ]
}
```

Field dictionary:

| Field | Rule |
|---|---|
| `id` | same value for all chunks of one run |
| `object` | fixed `chat.completion.chunk` |
| `created` | Gateway UTC Unix seconds |
| `model` | actual model, then requested model, then `qrclaw-owner-agent` |
| `choices[0].index` | always `0` |
| `choices[0].delta` | object, at least `{}` |
| `choices[0].finish_reason` | `null` until final chunk |

## 5. Event Dictionary

SSE event type is semantic, not the `event:` field.

| Semantic event | Output |
|---|---|
| `start` | `data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}` |
| `text_delta` | `data: {"choices":[{"delta":{"content":"..."},"finish_reason":null}]}` |
| `thinking_delta` | off by default; debug mode may emit `delta.reasoning_content` |
| `tool_call_start` | `delta.tool_calls[0].id/type/function.name` |
| `tool_call_args_delta` | `delta.tool_calls[0].function.arguments` incremental string |
| `tool_result` | no JSON chunk; emit SSE comment and persist encrypted event |
| `heartbeat/status` | SSE comment only, e.g. `: status=running seq=12` |
| `finish_stop` | final chunk with `finish_reason:"stop"` |
| `finish_tool_calls` | final chunk with `finish_reason:"tool_calls"` |
| `finish_cancelled` | final chunk with `finish_reason:"cancelled"` |
| `finish_length` | final chunk with `finish_reason:"length"` |
| `mid_stream_error` | error chunk, then `[DONE]` |
| `done` | `data: [DONE]` |

## 6. Host WS -> SSE Mapping

| Host frame | Gateway persistence | SSE output |
|---|---|---|
| `owner_agent_run_accepted` | update run status | role chunk |
| `owner_agent_run_event(type=text)` | encrypt into `owner_agent_run_events` | `delta.content` |
| `owner_agent_run_event(type=thinking)` | encrypt event | no output unless debug enabled |
| `owner_agent_run_event(type=tool_use)` | encrypt event | `delta.tool_calls[]` |
| `owner_agent_run_event(type=tool_result)` | encrypt event | comment only |
| `owner_agent_run_event(type=status)` | optional encrypted metadata | comment only |
| `owner_agent_run_completed(final_message)` | encrypt final assistant message | final text if no text events, then finish chunk |
| `owner_agent_run_failed` | mark failed, persist safe error metadata | HTTP error before first byte, otherwise error chunk |

The stream sink must be registered before dispatching `owner_agent_run_request` to Host.

## 7. Tool Call Rules

Use OpenAI `delta.tool_calls[]` with `index`, `id`, `type:"function"`, `function.name`, and incremental `function.arguments`. Clients accumulate argument fragments. When the assistant asks for tools, finish with `finish_reason:"tool_calls"`. `tool_result` is persisted and used in the next request as `role:"tool"` content; Wave 10 does not support same-turn mixed tool result rendering.

## 8. Attachment Rules

Attachments are request inputs, not SSE outputs.

Flow: upload via `POST /api/owner/files`, then pass file references in chat content parts. Assistant-generated images/files, if added later, should be markdown links in `delta.content` or tool-result metadata. Do not invent `delta.attachment`.

## 9. Finish Reasons

| Reason | Meaning | Client action |
|---|---|---|
| `stop` | normal completion | mark assistant message complete |
| `tool_calls` | model requests tool execution | enter tool loop / show pending tool state |
| `length` | host/provider truncated output | mark complete with warning |
| `error` | run failed after stream started | mark message failed |
| `cancelled` | owner or gateway cancelled run | mark cancelled, allow retry/regenerate |

After any finish chunk, send `data: [DONE]`.

## 10. OpenAI vs ai-sdk Bridge

Conflict:

- OpenAI-compatible clients expect `data: {chat.completion.chunk}` lines.
- Vercel ai-sdk `useChat` UI endpoints often expect ai-sdk data stream protocol.

Resolution:

1. Gateway remains OpenAI-compatible.
2. A Next app route may bridge Gateway OpenAI SSE to ai-sdk UI stream if QRClaw chooses `@ai-sdk/react` for client state.
3. assistant-ui can either use that ai-sdk app route or a custom runtime that parses OpenAI chunks.
4. LobeChat should point directly to `/v1/chat/completions` or a thin route alias.

Bridge sketch:

```text
QRClaw Web useChat
  -> /api/chat-ui-stream       # Next app route, ai-sdk data stream
    -> Gateway /v1/chat/completions  # OpenAI SSE
      -> Host WS
```

This prevents protocol drift: only the Web adapter knows ai-sdk UI transport.

## 11. Reconnect, Retry, Cancel

OpenAI Chat Completions SSE has no resume cursor. QRClaw recovery is explicit:

| Action | Route |
|---|---|
| load history | `GET /api/owner/agents/:id/messages` |
| recover in-progress run events | `decrypted-messages?actor=owner-private-agent-chat&include_events=1&run_id=<id>&after_seq=<n>` |
| cancel run | `POST /api/owner/agents/:id/runs/:runId/cancel` |
| reset context | `POST /api/owner/agents/:id/conversation/reset` |
| regenerate | `POST /api/owner/agents/:id/runs/:runId/regenerate` |

Default disconnect behavior: remove the SSE sink, keep Host run alive, persist events for recovery. Cancel on disconnect only when `metadata.qrclaw_cancel_on_disconnect=true`.

## 12. OpenAPI Fragment

```yaml
paths:
  /api/owner/agents/{agentId}/chat:
    post:
      summary: Stream one owner-agent chat turn
      security: [{ bearerAuth: [] }]
      parameters:
        - { name: agentId, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 128 } }
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/OpenAIChatCompletionRequest' } } }
      responses:
        '200':
          description: OpenAI-compatible SSE stream
          headers:
            X-QRClaw-Run-Id: { schema: { type: string } }
            X-QRClaw-Conversation-Id: { schema: { type: string } }
          content:
            text/event-stream:
              schema: { type: string, description: "data: <OpenAIChatCompletionChunk> lines ending with data: [DONE]" }
              examples:
                text:
                  value: |
                    data: {"id":"chatcmpl_run_1","object":"chat.completion.chunk","created":1777377600,"model":"claude","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}
                    data: {"id":"chatcmpl_run_1","object":"chat.completion.chunk","created":1777377601,"model":"claude","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
                    data: [DONE]
        '400': { description: Invalid request before streaming starts }
        '401': { description: Missing or invalid owner JWT }
        '404': { description: Agent not found or not owned by caller }
        '502': { description: Host unavailable before streaming starts }
  /v1/chat/completions:
    post:
      summary: OpenAI-compatible alias for component integration
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/OpenAIChatCompletionRequest' } } }
      responses:
        '200':
          description: Same SSE stream as owner-agent route
          content: { text/event-stream: { schema: { type: string } } }

components:
  schemas:
    OpenAIChatCompletionRequest:
      type: object
      required: [messages]
      properties:
        model:
          type: string
          description: Provider model or `qrclaw:<agent_id>` for the alias route.
        stream:
          type: boolean
          default: true
        client_message_id:
          type: string
        messages:
          type: array
          items:
            type: object
            required: [role, content]
            properties:
              role: { type: string, enum: [system, user, assistant, tool] }
              content:
                oneOf:
                  - type: string
                  - type: array
                    items:
                      oneOf:
                        - $ref: '#/components/schemas/TextPart'
                        - $ref: '#/components/schemas/ImagePart'
                        - $ref: '#/components/schemas/FilePart'
    TextPart:
      type: object
      required: [type, text]
      properties: { type: { const: text }, text: { type: string } }
    ImagePart:
      type: object
      required: [type, image_url]
      properties:
        type: { const: image_url }
        image_url:
          type: object
          required: [url]
          properties:
            url: { type: string, format: uri }
    FilePart:
      type: object
      required: [type, file_id]
      properties: { type: { const: input_file }, file_id: { type: string } }
```

## 13. Client Consumption Skeleton

Browser `EventSource` cannot POST a JSON body. The main chat stream must use `fetch` plus SSE parsing:

```ts
interface ChatStreamCallbacks {
  onRunIds: (ids: { runId: string | null; conversationId: string | null }) => void;
  onTextDelta: (text: string) => void;
  onToolCallDelta: (delta: unknown) => void;
  onFinish: (reason: string | null) => void;
  onError: (error: Error) => void;
}

export async function streamOwnerAgentChat(
  agentId: string,
  request: unknown,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const response = await fetch(`/api/owner/agents/${agentId}/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  callbacks.onRunIds({
    runId: response.headers.get('X-QRClaw-Run-Id'),
    conversationId: response.headers.get('X-QRClaw-Conversation-Id'),
  });

  // Skeleton only: fail fast for !response.ok; decode response.body;
  // split blank-line SSE records; ignore ':' comments; stop on [DONE];
  // parse JSON; fold delta.content/tool_calls/finish_reason into local state.
}
```

Use `EventSource` only for an optional GET recovery/observer stream, not for sending a new chat turn:

```ts
export function observeRunEvents(agentId: string, runId: string, afterSeq: number, callbacks: ChatStreamCallbacks): EventSource {
  const params = new URLSearchParams({ run_id: runId, after_seq: String(afterSeq) });
  const source = new EventSource(`/api/owner/agents/${agentId}/runs/events?${params.toString()}`, { withCredentials: true });
  source.onmessage = (event) => {
    if (event.data === '[DONE]') {
      source.close();
      callbacks.onFinish('stop');
      return;
    }

    // Skeleton only: parse OpenAI chunk and reuse the same fold logic.
  };
  source.onerror = () => {
    source.close();
    callbacks.onError(new Error('run event stream failed'));
  };
  return source;
}
```

## 14. Gateway Implementation Checklist

1. Add shared schemas for OpenAI request, content parts, and chunk output.
2. Split current message send flow into create-run and dispatch-run.
3. Register process-local stream sink before Host dispatch.
4. Publish accepted/event/completed/failed Host frames into stream hub after persistence.
5. Add `/api/owner/agents/:agentId/chat` and `/v1/chat/completions`.
6. Add `POST /runs/:runId/cancel`; make reset cancel active runs first.
7. Keep `GET /messages` and `decrypted-messages` as history/recovery.
8. Add integration tests for text, final-only, tool_call, attachment reject, pre-byte error, mid-stream error, disconnect, idempotency, and C2 no-plaintext logs.

## 15. Final Open Questions

1. C3 locks direct assistant-ui runtime adapter for Wave 10; ai-sdk UI transport is explicitly out of scope.
2. Debug `reasoning_content` should stay off until product decides how visible thinking should be.
3. Same-turn tool result rendering should wait for Wave 11; Wave 10 only guarantees OpenAI tool-call request chunks.
