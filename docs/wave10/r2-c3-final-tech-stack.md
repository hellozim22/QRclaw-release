# W10-R2 C3 - Final Chat UI Tech Stack

> Date: 2026-04-28. Versions verified with `npm view`.

## 1. Final Decision

Use **assistant-ui + QRClaw OpenAI SSE adapter + lightweight attachment/image packages**.

Do not adopt LobeChat as the UI dependency, do not depend on CopilotKit runtime, and do not use Vercel AI SDK data-stream protocol for Wave 10. The Gateway protocol remains the OpenAI Chat Completions SSE subset from `r1-sse-integration-spec.md`.

Why this is the best fit:

- It covers complete conversation UI, composer, streaming assistant messages, Markdown, files and images without replacing the whole Next 16 app.
- It keeps QRClaw's `/api/owner/agents/:id/chat` OpenAI SSE contract clean; no server-side fork for Lobe, assistant-ui or ai-sdk data-stream.
- It minimizes dependency weight versus Lobe UI and CopilotKit while still avoiding a hand-rolled chat shell.
- It matches C1/C2: Gateway only bridges plaintext in request scope, persisted history stays encrypted, resume remains through `decrypted-messages`.

## 2. Four Combination Comparison

| Combination | Packages checked | SSE fit | Dependency weight | Decision |
|---|---|---|---|---|
| **assistant-ui** | `@assistant-ui/react@0.12.26`, `@assistant-ui/react-ui@0.2.1`, `@assistant-ui/react-markdown@0.12.11` | Good. Supports custom runtime; consume QRClaw OpenAI chunks directly. Avoid assistant-ui data-stream mode. | Medium, MIT, React 19 peer explicit. | **Pick** |
| **shadcn-chat** | `shadcn-chat-cli@1.0.1` copied components + local SSE parser | OK but no durable runtime abstraction. | Low package weight, high local ownership. | Reject as primary; useful only as visual reference. |
| **Lobe UI** | `@lobehub/ui@5.10.0` + `antd@6.3.7` + Lobe theme deps | Excellent for OpenAI SSE, but UI stack is heavy. | High. Adds antd 6/theme system and likely design conflicts. | Reject for Wave 10. |
| **CopilotKit** | `@copilotkit/react-ui@1.56.4`, `@copilotkit/runtime@1.56.4` | Usable, but its runtime is agent/action oriented and pulls backend/provider concepts. | High hidden backend surface; runtime peer deps are broad. | Reject. |

## 3. SSE Compatibility Lock

Final protocol stance:

- Gateway emits anonymous `data: {...}` OpenAI chunks plus final `data: [DONE]`.
- Text uses `choices[0].delta.content`; tool calls may later use `choices[0].delta.tool_calls`.
- Files/images are uploaded before chat. Chat body carries references only: `image_url.url` or `input_file.file_id`; no base64 in SSE or request body.
- Do not switch to Vercel AI SDK data stream (`0:"text"` lines). It helps ai-sdk, but breaks Lobe/OpenAI compatibility and adds a second protocol.
- `assistant-ui` must be wired through a QRClaw runtime adapter that parses OpenAI chunks, not through an ai-sdk data-stream endpoint.

## 4. Locked Dependencies

| Package + version | Use | Replaces current code | Risk / pitfall | Smoke test |
|---|---|---|---|---|
| `@assistant-ui/react@0.12.26` | Runtime primitives: thread, message parts, composer state, streaming append. | `web/src/stores/owner-agent-chat-store.ts` custom `ChatMessage` append loop and `waitForRunReply()` placeholder. | Must write QRClaw runtime adapter; keep OpenAI SSE parser isolated and do not leak plaintext to logs. | Mock `/chat` sends role + `Hel` + `lo` + finish; UI shows one assistant message `Hello`. |
| `@assistant-ui/react-ui@0.2.1` | Prebuilt chat thread/composer/action UI. | Inline chat panel in `web/src/app/(dashboard)/chat/page.tsx`, including hand-written bubbles and textarea. | CSS/theme must be wrapped to QRClaw tokens; avoid hardcoded colors during integration. | Dashboard chat renders agent list + assistant thread; send button disabled while input empty. |
| `@assistant-ui/react-markdown@0.12.11` | Streaming-safe Markdown rendering inside assistant messages. | Direct `{m.content}` rendering in dashboard chat and most of `web/src/components/chat/MarkdownRenderer.tsx` for owner-agent chat. | Do not allow raw HTML; image rendering must use approved attachment URLs only. | Stream an unfinished code fence, then close it; no hydration error or layout crash. |
| `remark-gfm@4.0.1` | Tables, task lists, strikethrough, autolinks. | Extends existing `react-markdown@^10.1.0` usage. | Large streaming tables can jitter; acceptable for Wave 10. | Render table + checklist from a streamed assistant response. |
| `rehype-highlight@7.0.2` | Code block language highlighting. | Manual code block styling in `MarkdownRenderer.tsx`. | Highlight CSS must be scoped; no raw HTML plugin. | Render fenced `ts` block with syntax classes and no console errors. |
| `react-dropzone@15.0.0` | Drag/drop and file picker for attachments. | No current owner-agent file input; replaces future ad hoc `<input type=file>` handling. | Peer range does not explicitly list React 19 but hook API is simple; verify install warnings. Enforce MIME/size before upload. | Drop PNG/PDF/TXT; invalid EXE is rejected client-side and not posted. |
| `react-photo-view@1.2.7` | Lightweight image preview/lightbox. | No current owner-agent image preview; replaces opening signed image URLs in raw anchors. | Apache-2.0, not MIT. Keep if license review accepts; otherwise fall back to native dialog. | Upload image, render thumbnail, open/close preview, keyboard escape works. |

Packages intentionally **not** added:

- `@ai-sdk/react` / `ai`: skipped for Wave 10 because QRClaw already owns the Gateway SSE endpoint and the ai-sdk UI data-stream protocol would create a second wire format. Reconsider only if a Next server route becomes the official model proxy.
- `@lobehub/ui`: too much design-system gravity for a focused chat upgrade.
- `@copilotkit/runtime`: duplicates QRClaw host/runtime concerns and widens backend dependencies.
- `@uppy/react`: too heavy for one chat attachment lane; `react-dropzone` is enough.
- `mermaid`: not required for P0 Markdown; add later behind client-only dynamic import if product needs diagrams.

## 5. Integration Shape

Target component boundary:

```text
web/src/app/(dashboard)/chat/page.tsx
  Agent/session chrome stays QRClaw-owned.
  Right pane becomes <AssistantRuntimeProvider runtime={qrclawRuntime}> + assistant-ui Thread/Composer.

web/src/lib/owner-agent-sse-runtime.ts
  fetch POST /api/owner/agents/:agentId/chat
  parse OpenAI data lines
  fold delta.content into assistant-ui message state
  expose cancel/regenerate hooks through existing routes

web/src/stores/owner-agent-chat-store.ts
  keep agents/list/history selection
  remove waitForRunReply() from live path
  stop calling ensureOwnerWsSubscription() for owner-agent chat in Phase B
```

The existing visitor chat path under `web/src/components/chat/*` can keep its current WS streaming until Wave 10 decides whether owner-agent and visitor chat share one renderer.

## 6. `web/package.json` Diff Preview

```diff
 {
   "dependencies": {
+    "@assistant-ui/react": "^0.12.26",
+    "@assistant-ui/react-markdown": "^0.12.11",
+    "@assistant-ui/react-ui": "^0.2.1",
     "@supabase/ssr": "^0.9.0",
     "@supabase/supabase-js": "^2.99.1",
+    "rehype-highlight": "^7.0.2",
     "lucide-react": "^0.577.0",
     "next": "16.1.6",
     "qrcode": "^1.5.4",
     "react": "19.2.3",
     "react-dom": "19.2.3",
+    "react-dropzone": "^15.0.0",
     "react-markdown": "^10.1.0",
+    "react-photo-view": "^1.2.7",
+    "remark-gfm": "^4.0.1",
     "zustand": "^5.0.11"
   }
 }
```

Install preview:

```bash
cd web
npm install @assistant-ui/react@0.12.26 @assistant-ui/react-ui@0.2.1 @assistant-ui/react-markdown@0.12.11 remark-gfm@4.0.1 rehype-highlight@7.0.2 react-dropzone@15.0.0 react-photo-view@1.2.7
```

## 7. Acceptance Smoke Suite

Run these before declaring the integration done:

1. **Streaming text**: mock Host emits `Hel` then `lo`; UI shows one assistant message and `[DONE]` closes loading state.
2. **Markdown**: stream heading, list, table and fenced code; no hydration error, no raw HTML execution.
3. **File upload**: attach PNG/PDF/TXT; Gateway receives file references before chat POST; invalid MIME is blocked.
4. **Image preview**: uploaded image renders as attachment card and opens in `react-photo-view`.
5. **History recovery**: reload page after completed run; messages load through encrypted history read path, not from SSE cache.
6. **Cancel**: click stop mid-stream; client calls cancel route and UI marks message cancelled without treating `[DONE]` as semantic success.
7. **C2 guard**: test logs and thrown errors contain no prompt, delta text, file signed URL secret, KEK, DEK or JWT.

## 8. Final Call

Lock Wave 10 C3 to the assistant-ui stack above. The only non-MIT dependency in the final add list is `react-photo-view`; it is small and isolated. If license review requires strict MIT-only, remove it and implement a native preview dialog without changing the rest of the selection.
