# Wave 10 Sprint 1 · Chat Component Library

Owner→agent chat UI primitives. Extracted logically (not as a runtime
dependency) from LobeChat while staying inside the QRClaw v1 design-token
SSoT at `design/design-tokens.css`.

> **Tech-stack context (r2-c3-final-tech-stack.md)**: `assistant-ui` will
> become the *runtime* for the dashboard chat page, but the Wave 10 chat
> **UI surface itself is QRClaw-owned**. These components are designed
> to slot into either the vanilla React path or an `assistant-ui` runtime
> adapter — they accept plain `content` strings + `isStreaming` flags, no
> framework-specific primitives leak in.

---

## 1. Components

| Component            | Role                                         | Test file                          |
|----------------------|----------------------------------------------|------------------------------------|
| `MarkdownRenderer`   | Streaming-safe GFM + math + code markdown    | `MarkdownRenderer.test.tsx`        |
| `CodeBlock`          | Code surface w/ language label + copy button | `CodeBlock.test.tsx`               |
| `StreamingText`      | Delta accumulator w/ branded caret           | `StreamingText.test.tsx`           |
| `ChatMessageBubble`  | user / agent / system turn                   | `ChatMessageBubble.test.tsx`       |
| `ChatComposer`       | Textarea + send↔stop + regenerate            | `ChatComposer.test.tsx`            |

Run tests with `pnpm --filter web test` (or `npm run test` inside `web/`).

---

## 2. Design-token contract (r3-token-mapping.md)

Every component uses **only** the v1 tokens listed below. Do **not**
introduce `--surface-*`, `--accent-*`, `--bubble-*`, `--code-*`, or any
other v2 draft namespace.

| UI slot                         | Token                                        |
|---------------------------------|----------------------------------------------|
| Page background                 | `--color-off-white`                          |
| Agent bubble surface            | `--color-white` + `--color-gray-border`      |
| User bubble surface             | `--color-visitor-bubble`                     |
| System bubble surface           | `--color-gray-100`                           |
| Primary text                    | `--color-gray-800`                           |
| Secondary text                  | `--color-gray-700`                           |
| Placeholder / disabled          | `--color-gray-500`                           |
| Brand CTA / focus / caret       | `--color-red`                                |
| Hover / deep accent             | `--color-red-dark`                           |
| Soft emphasis                   | `--color-red-bg`                             |
| Destructive / error             | `--color-delete-red`                         |
| Code block deep surface         | `--color-black`                              |
| Code block foreground           | `--color-off-white`                          |
| Font (body)                     | `--font-primary`                             |
| Font (mono)                     | `--font-mono`                                |

The "three-voice typography" rule (Sans / Serif / Mono) is respected:
body is `--font-primary` (Inter), code is `--font-mono` (JetBrains Mono).
Serif voice is reserved for marketing surfaces and not used here.

---

## 3. API

### 3.1 `MarkdownRenderer`

```tsx
import { MarkdownRenderer } from '@/components/chat';

<MarkdownRenderer content={assistantText} stripImages />
```

| Prop          | Type      | Default | Description                                    |
|---------------|-----------|---------|------------------------------------------------|
| `content`     | `string`  | —       | Raw markdown.                                  |
| `className`   | `string?` | —       | Optional class on root.                        |
| `stripImages` | `boolean` | `true`  | Owner chat: block `<img>` during render.       |

Pipeline: `remark-gfm` → `remark-math` → `rehype-highlight` → `rehype-katex`.
Raw HTML is stripped (`skipHtml`). URLs are allowlisted to `http(s)` /
`mailto:` — `javascript:` etc. collapse to empty.

> **Callers must import KaTeX CSS once at the app root**:
> `import 'katex/dist/katex.min.css';` (recommended: `app/layout.tsx`).
> Highlight.js theme CSS is similarly app-level (we default to
> `highlight.js/styles/github-dark.css`).

### 3.2 `CodeBlock`

```tsx
<CodeBlock code={sql} language="sql" />
```

| Prop        | Type             | Default   | Description                                |
|-------------|------------------|-----------|--------------------------------------------|
| `code`      | `string`         | —         | Raw text used by the copy button.          |
| `language`  | `string?`        | —         | Shown as `ts` / `bash` label.              |
| `children`  | `ReactNode?`     | —         | Pre-highlighted nodes (used by markdown).  |

### 3.3 `StreamingText`

```tsx
<StreamingText text={partial} isStreaming={!finished} />
```

| Prop          | Type       | Default | Description                                      |
|---------------|------------|---------|--------------------------------------------------|
| `text`        | `string`   | —       | Accumulated text (append on every delta).        |
| `isStreaming` | `boolean`  | —       | While true: raw text + caret; then markdown.     |
| `asMarkdown`  | `boolean`  | `true`  | Settled mode: compile markdown.                  |
| `className`   | `string?`  | —       | Optional class on root.                          |

The caret is a 8×1em `--color-red` rectangle that blinks via injected
`@keyframes qrclaw-stream-blink`. Parent `aria-live="polite"` prevents
screen readers from announcing every delta.

### 3.4 `ChatMessageBubble`

```tsx
<ChatMessageBubble
  role="agent"
  content={msg.content}
  author="Claude Code"
  timestamp={msg.createdAt}
  isStreaming={msg.status === 'streaming'}
  onRegenerate={() => regenerate(msg.id)}
/>
```

| Prop            | Type                          | Default | Description                                 |
|-----------------|-------------------------------|---------|---------------------------------------------|
| `role`          | `'user' \| 'agent' \| 'system'` | —     | Drives surface token + alignment.           |
| `content`       | `string`                      | —       | Markdown body.                              |
| `timestamp`     | `string?`                     | —       | ISO; shown as local `HH:mm`.                |
| `author`        | `string?`                     | —       | Shown in meta row.                          |
| `isStreaming`   | `boolean`                     | `false` | Route through `StreamingText`.              |
| `errorMessage`  | `string?`                     | —       | Red banner below bubble; `role="alert"`.    |
| `showCopy`      | `boolean?`                    | (agent only) | Forces copy action on/off.            |
| `onRegenerate`  | `() => void`                  | —       | Show ↻ only if provided.                    |
| `footer`        | `ReactNode?`                  | —       | Slot for tool-call cards, attachments.      |

### 3.5 `ChatComposer`

```tsx
<ChatComposer
  onSend={(text) => send(text)}
  onStop={() => cancel()}
  onRegenerate={() => regenerate()}
  isStreaming={streaming}
  maxLength={8000}
/>
```

| Prop           | Type               | Default                                   | Description                         |
|----------------|--------------------|-------------------------------------------|-------------------------------------|
| `onSend`       | `(text) => void`   | —                                         | Required.                           |
| `onStop`       | `() => void`       | —                                         | Enables send→stop morph.            |
| `onRegenerate` | `() => void`       | —                                         | Shows ↻ icon when idle.             |
| `isStreaming`  | `boolean`          | `false`                                   | Freezes input; morphs button.       |
| `disabled`     | `boolean`          | `false`                                   | Full-composer lock.                 |
| `placeholder`  | `string`           | `'输入消息... (Shift+Enter 换行, Enter 发送)'` | —                                   |
| `maxLength`    | `number?`          | —                                         | Shows counter + red on 90%.         |
| `leadingSlot`  | `ReactNode?`       | —                                         | Reserved for 📎 upload.              |
| `trailingSlot` | `ReactNode?`       | —                                         | Reserved for 🎤 mic.                 |
| `ref`          | `Ref<ChatComposerHandle>` | —                                  | `{ focus(), reset() }`.             |

Keyboard contract: `Enter` = send, `Shift+Enter` = newline, IME-composing
Enter is ignored (safe for Chinese / Japanese input).

---

## 4. Wiring example — Dashboard `/chat` page

```tsx
'use client';

import { useState } from 'react';
import {
  ChatMessageBubble,
  ChatComposer,
  type ChatRole,
} from '@/components/chat';

type Turn = { id: string; role: ChatRole; content: string; streaming?: boolean };

export default function DashboardChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
        {turns.map((t) => (
          <ChatMessageBubble
            key={t.id}
            role={t.role}
            content={t.content}
            isStreaming={t.streaming}
          />
        ))}
      </div>
      <ChatComposer
        onSend={(text) => {/* POST /api/owner/agents/:id/chat */}}
        onStop={() => {/* cancel SSE */}}
        isStreaming={streamingId !== null}
        maxLength={8000}
      />
    </div>
  );
}
```

The SSE runtime adapter (`web/src/lib/owner-agent-sse-runtime.ts`, cursor
is authoring in parallel) folds `choices[0].delta.content` into `t.content`
and flips `t.streaming` when the final `[DONE]` frame arrives.

---

## 5. Accessibility checklist

- [x] Every icon button has `aria-label`.
- [x] Streaming region uses `aria-live="polite"`, error uses `role="alert"`.
- [x] Focus ring defaults to `--color-red` (browser default; 2px outline
      applied at the page-level style layer — not duplicated per component).
- [x] Keyboard: Enter send, Shift+Enter newline, IME composition safe.
- [x] Color contrast: `--color-gray-800` on `--color-white` = 12.6:1
      (AAA). `--color-white` on `--color-red` = 4.8:1 (AA body text).

---

## 6. Red-lines (task constraints)

- ❌ Do **not** add LobeChat / antd / CopilotKit dependencies.
- ❌ Do **not** extend `design-tokens.css` — any new token needs a separate
  SSoT upgrade task per r3-token-mapping §4.
- ❌ Do **not** hardcode hex colors.
- ✅ New npm deps added: `remark-gfm`, `remark-math`, `rehype-highlight`,
  `rehype-katex`, `katex`, `highlight.js`, plus the vitest/RTL toolchain
  for unit tests. All are MIT/BSD-compatible.

---

## 7. Out of scope for S1

These are tracked by later sprints, not this component library:

- 📎 file attachment UI (S2 — uses `react-dropzone`).
- 🎤 hold-to-talk voice composer (S3).
- 🔧 tool-call card with expandable params/results (S2).
- 🗣 TTS agent reply playback (S4).
- Mermaid diagram rendering (lazy dynamic import, S3).
- Image lightbox via `react-photo-view` (S2).
