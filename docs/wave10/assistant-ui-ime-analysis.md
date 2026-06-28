# Root-Cause Analysis: @assistant-ui/react v0.12.26 Chinese IME Failure in QRClaw

**Date:** 2026-04-29
**Author:** agent audit, source walkthrough only — no code changes in this pass
**Status:** Diagnosis-only; fixes deferred to Review
**Version under study:** `@assistant-ui/react` 0.12.26 + `@assistant-ui/react-ui` 0.2.1 (installed under `web/node_modules/@assistant-ui/`)
**Scope file(s):** `web/src/components/chat/OwnerAssistantThread.tsx` (QRClaw glue), `web/src/stores/owner-agent-chat-store.ts` (Zustand store), library source under `web/node_modules/@assistant-ui/{react,react-ui,core,store}/dist/`

> Codebase snapshot used for line numbers below: HEAD on `qrclaw-work` at the time of Round 3 patch.

---

## 1. Reproduction

### Environment
- macOS (arm64), default Chinese pinyin IME (系统自带「拼音」).
- Chrome / Safari against `http://localhost:3001/chat` (Next.js dev).
- Owner logged in (test-owner@example.invalid), host daemon online (4/4), at least one successful Claude round-trip has already been done.

### Observed behaviour

| Input method | After first reply | What happens |
|---|---|---|
| English keys (latin) | works | chars land in composer, Enter sends, normal. |
| Chinese pinyin (IME composition) | **fails** | pressing pinyin keys shows the IME candidate popup briefly, but committed characters don’t land in the textarea; sometimes the candidate popup dismisses mid-compose. |
| Pre-first-reply, any method | works | both English and 中文 work in the *empty* thread state before any streaming has happened. |

The placeholder stays at `输入消息...` after the failure (i.e. the composer is not disabled — it's receiving focus and keystrokes, but its DOM `value` is being rewritten / composition session is being aborted).

### Why Playwright passed in Round 3 manual testing

Playwright's `browser_type(..., slowly: true)` or `browser_fill_form` dispatches synthetic `KeyboardEvent` + `InputEvent`s directly. These **bypass the browser IME composition pipeline entirely**:

- No `compositionstart` / `compositionupdate` / `compositionend` events are emitted.
- `e.nativeEvent.isComposing` is never `true`.
- Synthetic events arrive as fully-committed keystrokes — they look to React like a plain fast typist.

So Playwright's IME tests test the "no IME" path. To repro reliably one must use a real OS IME; `Locator.press('KeyI')` cannot simulate composition.

---

## 2. Source-code walkthrough

### 2.1 `<Thread>` from `@assistant-ui/react-ui` → `Composer` → `ComposerPrimitive.Input`

`@assistant-ui/react-ui/dist/ui/thread.mjs` (not shown, but assembled in `dist/ui/thread.js.map` sources inline) renders:

```tsx
<ThreadRoot config={config}>
  <ThreadViewport>
    <ThreadWelcomeComponent />
    <ThreadMessages … />
    <ThreadFollowupSuggestions />
    <ThreadViewportFooter>
      <ThreadScrollToBottom />
      <ComposerComponent />      // ← defaults to the Composer below
    </ThreadViewportFooter>
  </ThreadViewport>
</ThreadRoot>
```

`web/node_modules/@assistant-ui/react-ui/dist/ui/composer.mjs` lines 22-30:

```js
var Composer = () => {
  const allowAttachments = useAllowAttachments(true);
  return jsxs(ComposerRoot, { children: [
    allowAttachments && jsx(ComposerAttachments, {}),
    allowAttachments && jsx(ComposerAddAttachment, {}),
    jsx(ComposerInput, { autoFocus: true }),
    jsx(ComposerAction, {})
  ] });
};
```

`ComposerInput` is `withDefaults(ComposerPrimitive.Input, { rows: 1, autoFocus: true, className: "aui-composer-input" })` (composer.mjs:36). That forwards straight into the primitive.

### 2.2 `ComposerPrimitive.Input` — the controlled textarea

File: `web/node_modules/@assistant-ui/react/dist/primitives/composer/ComposerInput.js`
Key excerpts (line numbers are from the dist file):

```js
// L39-43
const value = useAuiState((s) => {
    if (!s.composer.isEditing) return "";
    return s.composer.text;
});
const isDisabled = useAuiState((s) => s.thread.isDisabled || s.composer.dictation?.inputDisabled) || disabledProp;
const textareaRef = useRef(null);
const ref = useComposedRefs(forwardedRef, textareaRef);
// suppress text/cursor broadcasts during IME composition
const compositionRef = useRef(false);

// L149-155  (props spread onto <TextareaAutosize>)
const inputProps = {
    name: "input",
    value,                              // ← CONTROLLED
    ...rest,
    ref,
    disabled: isDisabled,
    onChange: composeEventHandlers(onChange, (e) => {
        if (!aui.composer().getState().isEditing) return;
        const isComposing = e.nativeEvent.isComposing === true || compositionRef.current;
        if (isComposing) return;                        // ← during IME: SKIP setText
        flushResourcesSync(() => { aui.composer().setText(e.target.value); });
        …
    }),
    // L175-180
    onCompositionStart: composeEventHandlers(rest.onCompositionStart, () => {
        compositionRef.current = true;
    }),
    onCompositionEnd: composeEventHandlers(rest.onCompositionEnd, (e) => {
        compositionRef.current = false;
        if (!aui.composer().getState().isEditing) return;
        const target = e.target;
        flushResourcesSync(() => { aui.composer().setText(target.value); });
        …
    }),
    …
};
…
// L217
const Component = asChild ? Slot.Root : TextareaAutosize;
return jsx(Component, { ...inputProps });
```

The controlled value is `s.composer.text`, subscribed via `useAuiState` (which wraps `useSyncExternalStore` — `web/node_modules/@assistant-ui/store/dist/useAuiState.js:19-24`):

```js
export const useAuiState = (selector) => {
    const aui = useAui();
    const proxiedState = createProxiedStateImpl(aui);
    const slice = useSyncExternalStore(aui.subscribe, () => selector(proxiedState), () => selector(proxiedState));
    …
    return slice;
};
```

Subscribers fire whenever `aui.subscribe` notifies — which happens on every thread runtime mutation, *including* ones QRClaw causes via streaming deltas.

### 2.3 `useExternalStoreRuntime` — the QRClaw adapter bridge

File: `web/node_modules/@assistant-ui/core/dist/react/runtimes/useExternalStoreRuntime.js`, whole file:

```js
"use client";
import { useEffect, useMemo, useState } from "react";
import { ExternalStoreRuntimeCore } from "../../runtimes/internal.js";
import { AssistantRuntimeImpl } from "../../runtime/internal.js";
import { useRuntimeAdapters } from "./RuntimeAdapterProvider.js";
export const useExternalStoreRuntime = (store) => {
    const [runtime] = useState(() => new ExternalStoreRuntimeCore(store));
    useEffect(() => {
        runtime.setAdapter(store);     // ← NO DEPS: runs every render
    });
    const { modelContext } = useRuntimeAdapters() ?? {};
    useEffect(() => {
        if (!modelContext) return undefined;
        return runtime.registerModelContextProvider(modelContext);
    }, [modelContext, runtime]);
    return useMemo(() => new AssistantRuntimeImpl(runtime), [runtime]);
};
```

Every parent re-render → `useEffect(() => runtime.setAdapter(store))` fires → `ExternalStoreRuntimeCore.setAdapter(store)` delegates into `ExternalStoreThreadRuntimeCore.__internal_setAdapter(store)`:

`web/node_modules/@assistant-ui/core/dist/runtimes/external-store/external-store-thread-runtime-core.js` lines 72-160:

```js
__internal_setAdapter(store) {
    if (this._store === store) return;                        // outer guard (*)
    const isRunning = store.isRunning ?? false;
    this.isDisabled = store.isDisabled ?? false;
    const oldStore = this._store;
    this._store = store;
    …
    else if (store.messages) {
        if (oldStore) {
            if (oldStore.convertMessage !== store.convertMessage) { this._converter = new ThreadMessageConverter(); }
            else if (oldStore.isRunning === store.isRunning && oldStore.messages === store.messages) {
                this._notifySubscribers();                    // inner "nothing changed" branch
                return;
            }
        }
        messages = !store.convertMessage
            ? store.messages
            : this._converter.convertMessages(store.messages, …);   // full conversion pass
        for (let i = 0; i < messages.length; i++) { … this.repository.addOrUpdateMessage(…); }
    }
    …
    this._notifySubscribers();                                // also fires at the end of the non-guarded path
}
```

**Critical property** of this code: the outer guard `(*)` uses **object-identity** equality. If QRClaw hands a new adapter object per render (pre-Round-3 behaviour), every render falls through past `(*)`, re-imports `store.messages` into the repository, and calls `_notifySubscribers()`. Subscribers include `useAuiState(s => s.composer.text)` in the Composer input.

### 2.4 QRClaw's store-side delta engine

`web/src/stores/owner-agent-chat-store.ts` `sendMessage` and `ensureOwnerWsSubscription.onmessage` both do:

```ts
set((s) => ({
  messagesByAgent: {
    ...s.messagesByAgent,
    [agentId]: (s.messagesByAgent[agentId] ?? []).map(...),  // ← new array every delta
  },
  statusByAgent: { ...s.statusByAgent, [agentId]: 'running' | 'online' },
}));
```

Every SSE delta (can be dozens/second for Claude streaming) produces:
- a new top-level `state` object (Zustand),
- a new `messagesByAgent[agentId]` array reference,
- propagates to `ChatPage` → `OwnerAssistantThread` `messages` prop → new reference.

### 2.5 Pre-Round-3 shape (what originally caused IME to break)

```tsx
const adapter = useMemo(
  () => createOwnerAssistantAdapter({ canSend, isRunning, messages, onSend, onStop }),
  [canSend, isRunning, messages, onSend, onStop],
);
const runtime = useExternalStoreRuntime(adapter);
```

Deps include `messages` (new ref per delta). Every delta → new `adapter` → `useExternalStoreRuntime`'s unconditional `setAdapter` takes the **non-short-circuit** branch → repository re-import → `_notifySubscribers` → Composer `useAuiState(s => s.composer.text)` re-runs its subscription.

Even though `s.composer.text` literal string is unchanged (user hasn't typed), **React still re-renders the ComposerInput component** and spreads `inputProps = { value, … }` onto `<TextareaAutosize>`. TextareaAutosize then runs its `useLayoutEffect(resizeTextarea)` on every render (see `react-textarea-autosize/dist/react-textarea-autosize.browser.development.esm.js:200-215`). `resizeTextarea` reads from `libRef.current.value` and **writes `node.style.height`**. Style writes alone do NOT abort IME.

But React reconciliation on a controlled `<textarea>` DOES:
- React sees the `value` prop on the JSX element.
- React's DOM diff logic calls `setValueForStyles`/`setValueForProperty` etc. If the prop value is the **same string** as last render, React skips `node.value = …`. Normally safe.
- However, React in dev (React 19) **does** set `value` via `defaultValue` fallback and `ReactDOMInput`/`ReactDOMTextarea` wrapper logic that, in some paths (`updateWrapper`), always runs `node.value = ''; node.value = value;` when it detects the wrapper changed. With StrictMode, dev double-invocation can also push a textarea value assignment during composition.
- Additionally, `useAuiState`'s `useSyncExternalStore` returns the same `slice` only when `Object.is(prevSlice, nextSlice)`. Subscribers fire in the concurrent scheduler and can flush an extra render. Between the IME's `compositionupdate` and `compositionend`, any synchronous React commit on the same textarea that touches `.value` drops the in-flight composition.

This produces the observed: committed pinyin chars are lost, the textarea shows an empty or prior value, and the IME popup closes because the document's selection / input target state was mutated.

### 2.6 Round 3 patch (current state) and why it is still broken

`web/src/components/chat/OwnerAssistantThread.tsx:93-136` (current):

```tsx
const propsRef = useRef({ canSend, isRunning, messages, onSend, onStop });
propsRef.current = { canSend, isRunning, messages, onSend, onStop };

const adapter = useMemo(
  () => ({
    get messages()  { return propsRef.current.messages; },
    get isRunning() { return propsRef.current.isRunning; },
    get isDisabled() { return !propsRef.current.canSend && !propsRef.current.isRunning; },
    convertMessage: toAssistantThreadMessage,
    onNew: async (m) => { …propsRef.current.onSend(text); },
    onCancel: async () => { propsRef.current.onStop(); },
  }),
  [],                    // ← empty deps: same object reference for whole component lifetime
);
const runtime = useExternalStoreRuntime(adapter);
return (<Thread key={agentId} … />);
```

Intent: make adapter object identity stable so `__internal_setAdapter`'s outer guard `if (this._store === store) return` short-circuits before touching the message repository.

**What it actually produces:**
1. `setAdapter(adapter)` first call (mount): `this._store === adapter` is false → runs full import, stores `this._store = adapter`.
2. Every subsequent render: `this._store === adapter` is **true** → the function returns **without re-reading** `store.messages` / `store.isRunning`.
3. `store.messages` is a getter that reads through `propsRef.current.messages`. But the runtime never calls the getter after mount because of the guard. So the repository never learns about new messages. Streaming deltas **silently don't reach the Thread**.

   (Side effect: if you watch carefully during a streaming reply *after* Round 3, the Thread will appear to stall; the visible "PONG" only shows because we also push it via the separate WS `owner_agent_run_completed` frame handler in the store, which fires a `messagesByAgent` update — but that still doesn't make it into the runtime's repository because of the same guard. What *does* show the message in the UI is the WS-completed path combined with `isRunning`/`messages` getters being re-read at other isolated entry points, e.g. `get isRunning()` on the class is `return this._store.isRunning;` — called every time a subscriber reads `thread.isRunning`, so `isRunning` flips do propagate. The repository / message list does NOT.)

So Round 3 does fix the **IME-abort cascade** for the initial render window (no repository churn, no `_notifySubscribers`, no Composer re-render) — but **only while nothing else in the tree triggers `ComposerInput` to re-render**.

**Why IME still fails on real macOS post-Round-3:**
- `ComposerPrimitive.Input` has its own subscriptions (`useAuiState(s => s.thread.isDisabled || …)`, `useAuiState(s => s.composer.text)`, `useAui()`). These still fire on `aui.subscribe` notifications originating from other internal subscribers, e.g.:
  - `AssistantRuntimeImpl` event emits on `runStart` / `runEnd`;
  - `useRuntimeAdapters` re-registrations;
  - Scroll-to-bottom / focus hooks in `ComposerInput` itself (`useEffect(() => focus(), [focus])` — focus changes re-fire, which can race with composition).
- In particular, `ComposerInput.js:132-136`:
  ```js
  useEffect(() => {
      if (aui.composer().getState().type !== "thread" || !unstable_focusOnRunStart) return undefined;
      return aui.on("thread.runStart", focus);
  }, [unstable_focusOnRunStart, focus, aui]);
  ```
  On every new SSE request we trigger `runStart` indirectly (the runtime flips `isRunning`). The handler calls `textarea.focus({ preventScroll: true }); textarea.setSelectionRange(…)`. `setSelectionRange` on a textarea that is currently the target of an IME composition **aborts the composition on macOS WebKit/Blink** (this is one of the canonical ways to break IME). It's the exact symptom the user reports: the first reply completes, the next attempt at 中文 input breaks because the focus handler ran during `runStart`, touched `setSelectionRange`, and the IME session is in a weird state.
- Additionally, React 19's `<textarea value={…}>` reconciliation in dev does issue `hydrateRoot`/`commitUpdate` paths that under concurrent rendering can land in the middle of an active composition session if a parent suspends and resumes — but that's a secondary contributor, not the primary.

### 2.7 Why `key={agentId}` does not help

`key={agentId}` only remounts when the agent changes. During a single agent's streaming, the key is stable, the Thread is not remounted — but the `focus` call in `ComposerInput`'s `thread.runStart` effect still fires, and internal subscription-driven re-renders still occur.

---

## 3. Five candidate root-cause hypotheses

| # | Hypothesis | Evidence for | Evidence against |
|---|---|---|---|
| **H1** | `useAuiState(s => s.composer.text)` re-render re-applies controlled `value` on the textarea, and React's DOM write aborts IME composition. | `value` is controlled (ComposerInput.js:151). React is known to call `node.value = …` on `<textarea>`'s wrapper update (`ReactDOMTextarea.updateWrapper`) even when the string is unchanged, in some scheduling paths. `useAuiState` uses `useSyncExternalStore` so every `aui.subscribe` fires a re-render. | If the string is literally equal and React's wrapper used `Object.is`, no DOM write. Pure H1 would affect English input too (it doesn't — English works). |
| **H2** | `unstable_focusOnRunStart` auto-focus effect (`ComposerInput.js:132-136`) calls `textarea.focus()` + `setSelectionRange(length, length)` exactly when `isRunning` flips, which lands **in the middle of a pending compose session** the user initiated while the previous reply was mid-finalize. | The user's exact sequence: "reply 1 ok → try 中文 → fails". After reply 1, there's a final `runEnd`, then if user types English it just works because composition never started. If user types 中文, `compositionstart` fires, then any background `thread.runStart` (e.g. our own WS event, store update) triggers focus+setSelectionRange → IME aborts. | If nothing else triggers `runStart` after reply 1, focus shouldn't refire. But our store DOES fire `statusByAgent` flips on WS frames that might register as runStart through `AssistantRuntimeImpl` events, depending on how the runtime interprets `isRunning` transitions. |
| **H3** | `react-textarea-autosize`'s `useLayoutEffect(resizeTextarea)` writes to `.style.height` during composition, which on macOS Chromium dismisses the IME candidate popup because the textarea is repositioned/resized. | Resize layout definitely fires every render; IME candidate popups are anchored to element position. | macOS IME anchors to caret, and style writes alone do not reliably abort composition on Chrome/Safari. Also resize would equally affect English typing — which it doesn't. |
| **H4** | QRClaw's Round 3 `useMemo(() => adapter, [])` makes `setAdapter` short-circuit → runtime never processes new `messages`, **but** something else (WS handler updating `statusByAgent`) keeps calling `setText("")` through a secondary path and wipes the draft. | Would produce exact symptom ("input typed but nothing persists"). | No code path in QRClaw or the library calls `setText` except the user's own `onChange` and `onCompositionEnd`. ruled out by grep (`grep -rn 'setText' web/node_modules/@assistant-ui`). |
| **H5** | React 19 + StrictMode dev-mode double-invocation re-runs the ComposerInput render during composition and re-executes `useLayoutEffect`, which via `react-textarea-autosize` reassigns `hiddenTextarea.value` on a **different** node (the shadow sizing node, not the live one) but also calls `node.style.height = …` which forces layout, which on some macOS Chrome builds cancels the active IME composition. | Explains why English works (no composition to cancel) and 中文 breaks (composition active). Also explains why Playwright synthetic events pass (no composition). | `hiddenTextarea` is a detached node so its value writes don't touch the focused textarea. Style-driven layout alone is not a reliable IME killer in 2024+ Chrome. Stronger culprit is H2. |

**Ranking after walkthrough:**

1. **H2 is the most likely primary cause** — the `unstable_focusOnRunStart` auto-focus effect calls `setSelectionRange` on the textarea during composition, which is a documented IME-abort trigger on macOS WebKit/Blink.
2. **H1 is a secondary contributor** in paths where `useAuiState` notifies during an active composition session.
3. **H4 ruled out**. **H3/H5 are plausible but not primary.**

---

## 4. Three candidate fix strategies

### Strategy A: Disable / neutralise the auto-focus-on-run-start effect

- **Change:** pass `unstable_focusOnRunStart={false}` (and `unstable_focusOnScrollToBottom={false}`) on the `ComposerPrimitive.Input` render. In the current setup, the `<Thread>` component doesn't expose that prop directly — we'd need to replace the default `Composer` via `config.components.Composer` with one that renders `ComposerPrimitive.Input` with our flags.
- **Change surface:** `OwnerAssistantThread.tsx` — ~40 lines (custom `Composer` stub + `components` plumb-in).
- **Risk:** losing the nice-to-have auto-refocus after the agent finishes. Low functional impact — user can click to refocus.
- **Regression test cost:** one unit test for focus behaviour on run-end; existing chat e2e still passes because Composer DOM is identical.
- **Upgrade compat:** HIGH — uses the documented override path. Props `unstable_focusOnRunStart` are explicit opt-outs meant for exactly this.

### Strategy B: Suppress `aui` notifications during active composition

- **Change:** wrap the `<AssistantRuntimeProvider>` with a sibling effect that listens for `compositionstart`/`compositionend` on the textarea and, during composition, **queues** QRClaw store updates that would propagate into the runtime. We could throttle `useExternalStoreRuntime(adapter)` by interposing a memoised `messages` snapshot that freezes while `composingRef.current === true`.
- **Change surface:** ~60-80 lines across `OwnerAssistantThread.tsx` and `owner-agent-chat-store.ts` (composition-aware debouncer).
- **Risk:** mid-delta freezing of the assistant bubble while the user is typing a long pinyin phrase. Visually jarring but not data-losing because updates resume at `compositionend`.
- **Regression test cost:** medium — need to stub `compositionstart`/`end`, verify delta replay after compose ends.
- **Upgrade compat:** neutral — purely QRClaw-side wrapping.

### Strategy C: Replace the assistant-ui composer with QRClaw's native `ChatComposer`

- **Change:** render `<Thread>` with `<ComposerPrimitive.Root />` children slot set to a no-op, or override `components.Composer` to return `null`. Render our existing `ChatComposer` (already IME-safe per user's report) underneath the Thread viewport, wired to the same `onSend`/`onStop` props we already pass.
- **Change surface:** `OwnerAssistantThread.tsx` — ~30 lines swap.
- **Risk:** loses assistant-ui niceties (paste-to-attach, cancel button, dictation hooks). QRClaw doesn't use any of those in S1.
- **Regression test cost:** moderate — any assistant-ui-driven composer test (there are none in `web/src/__tests__`) would need rewrite.
- **Upgrade compat:** LOW — we'd be permanently forked from the library's composer upgrade path. BUT: we already don't use attachments, so this is only a problem if we later want dictation/voice/paste-to-attach.

### Comparison matrix

| | A (disable focus) | B (compose-aware freeze) | C (native composer) |
|---|---|---|---|
| Change LOC | ~40 | ~60-80 | ~30 |
| Risk | low | medium | low (functionally) |
| Data integrity | ✓ | needs careful flush on `compositionend` | ✓ |
| Regression tests | 1 unit | +1 unit, +1 e2e | rewrite any composer tests |
| Upgrade compat | high | high | low |
| Fixes reported IME | **yes, addresses H2 directly** | yes, also covers H1 residual | yes, sidesteps all three hypotheses |
| Side benefits | keeps consistent composer with future library upgrades | covers H1 if H2 turns out not to be sole cause | enables `isComposing`-aware Enter key semantics we already have in ChatComposer |

---

## 5. Recommendation

**Start with Strategy A, validate empirically, then fall back to C only if A is insufficient.**

Rationale:
1. Strategy A targets the strongest-evidence hypothesis (H2) and uses an explicit, documented opt-out (`unstable_focusOnRunStart={false}`). If the user's IME works after turning off the focus effect, we have high confidence H2 was the root cause and we haven't structurally diverged from the library.
2. If A alone doesn't fix it (i.e. H1 or H3/H5 are also contributing), move to C — it sidesteps every library-internal subscription by not rendering `ComposerPrimitive.Input` at all. QRClaw's `ChatComposer` is already production-quality in this repo (`web/src/components/chat/ChatComposer.tsx`, fully-featured: autoresize, isComposing-aware Enter, send/stop morph, regenerate slot).
3. B is heavier, debatably correct, and adds an ongoing maintenance burden of "what do we freeze during composition". Only pursue B if both A and C are off the table for some reason (they shouldn't be).

**Additionally revert Round 3's `useMemo(() => adapter, [])`**: the ref-stable adapter with empty deps is masking a separate bug — the runtime repository never re-imports new messages after mount, because of the `this._store === store` outer guard. Under A or C we no longer need the identity-stability trick, so go back to the dep-driven `useMemo` (or drop `useMemo` entirely — `setAdapter`'s inner guard `oldStore.isRunning === store.isRunning && oldStore.messages === store.messages` already short-circuits when nothing changed, at the cost of a light reallocation).

---

## 6. Review (for reviewers to fill in)

### Reviewer: _________  (gpt-5.4 / other)

- [ ] Do you agree that H2 (`unstable_focusOnRunStart` → `setSelectionRange` during composition) is the primary cause?
- [ ] Can you reproduce H1 (controlled `value` re-write during composition) in isolation, or rule it out by React 19's textarea wrapper logic?
- [ ] Any alternative hypothesis not listed in §3?
- [ ] Preferred strategy — A, B, or C — and why?

### Open data points to collect before implementing a fix

1. Repro with `unstable_focusOnRunStart={false}` manually (Strategy A probe) — does 中文 input survive?
2. DevTools "Show paint flashing" + composition trace: does a `.value = …` write land on the live textarea during composition?
3. React profiler: how many ComposerInput re-renders happen between `compositionstart` and the user's first aborted character?

### Post-fix verification plan

- Manual: real macOS Chrome + Safari, default 拼音 IME, 30-char sentence across one streaming reply.
- Semi-auto: Playwright only covers the "no-IME" path; we can't assert IME-safety in CI.
- Regression: existing e2e in `tests/e2e/wave10/chat-core/` continues to pass (streaming + PONG end-to-end).

---

## Appendix A — File inventory reviewed

| File | Purpose | Lines read |
|---|---|---|
| `web/src/components/chat/OwnerAssistantThread.tsx` | QRClaw adapter + Thread wrapper | full (160) |
| `web/src/stores/owner-agent-chat-store.ts` | Zustand store (send/stream/WS) | 255-800 |
| `web/src/components/chat/ChatComposer.tsx` | QRClaw native composer (reference for Strategy C) | full (~260) |
| `web/node_modules/@assistant-ui/react/dist/primitives/composer/ComposerInput.js` | Primitive textarea + composition handling | 1-221 |
| `web/node_modules/@assistant-ui/react-ui/dist/ui/composer.mjs` | UI layer default Composer | 1-80 |
| `web/node_modules/@assistant-ui/react/dist/client/ExternalThread.js` | ComposerClientResource (`text`, `isEditing`, `setText`) | 1-350 |
| `web/node_modules/@assistant-ui/core/dist/react/runtimes/useExternalStoreRuntime.js` | `useExternalStoreRuntime` hook | full (~20) |
| `web/node_modules/@assistant-ui/core/dist/runtimes/external-store/external-store-thread-runtime-core.js` | `__internal_setAdapter` — repository + notify semantics | 60-170 |
| `web/node_modules/@assistant-ui/core/dist/runtimes/external-store/external-store-runtime-core.js` | top-level `setAdapter` delegation | full |
| `web/node_modules/@assistant-ui/store/dist/useAuiState.js` | `useSyncExternalStore` subscription implementation | full |
| `web/node_modules/react-textarea-autosize/dist/react-textarea-autosize.browser.development.esm.js` | `TextareaAutosize` + `useLayoutEffect(resizeTextarea)` | 170-230 |

## Appendix B — Key library code citations

- Controlled textarea `value` wiring — `ComposerInput.js:39-43`, `151`.
- IME composition ref guard — `ComposerInput.js:47`, `onChange` L157-163, `onCompositionStart/End` L175-197.
- **`unstable_focusOnRunStart` effect** (H2's suspected trigger) — `ComposerInput.js:132-136`.
- `useAuiState` subscription path — `@assistant-ui/store/dist/useAuiState.js:19-24`.
- Runtime setAdapter outer-identity guard — `external-store-thread-runtime-core.js:73-74`.
- `useExternalStoreRuntime` unconditional re-adapt effect — `useExternalStoreRuntime.js:9-11`.
- TextareaAutosize layout-effect resize — `react-textarea-autosize.browser.development.esm.js:203`.

---

## Review by claude-internal-B

**Date:** 2026-04-29
**Reviewer:** claude-internal-B (independent, strict)
**Method:** Re-verified every citation against the installed library source under `web/node_modules/@assistant-ui/` before accepting any claim in §2–§5.

### 1. H1–H5 ranking & missing hypothesis

**Primary cause ranking — agree with author, but with a significant amendment.**

H2 is the strongest hypothesis on evidence. Confirmed against source:
- `ComposerInput.js:129-135` — `focus` callback does `textarea.focus({ preventScroll: true }); textarea.setSelectionRange(length, length);`
- `ComposerInput.js:143-148` — `useEffect(..., [unstable_focusOnRunStart, focus, aui])` subscribes to `aui.on("thread.runStart", focus)`.
- `setSelectionRange` on a textarea that is the active IME target is a well-documented composition-abort trigger on macOS WebKit/Blink.

That is solid. **But the document under-counts the number of `focus()` trigger paths:**

| Line | Trigger | Gated by `unstable_focusOnRunStart`? |
|---|---|---|
| `ComposerInput.js:136` | `useEffect(() => focus(), [focus])` | **No** — this is unconditional. |
| `ComposerInput.js:137-142` | `useOnScrollToBottom(...)` | gated by `unstable_focusOnScrollToBottom` |
| `ComposerInput.js:143-148` | `aui.on("thread.runStart", focus)` | gated by `unstable_focusOnRunStart` |
| `ComposerInput.js:149-154` | `aui.on("threadListItem.switchedTo", focus)` | gated by `unstable_focusOnThreadSwitched` |

The L136 effect is the one to worry about. It re-fires whenever `focus` callback identity changes. `focus` is `useCallback(..., [autoFocusEnabled])` (L135). `autoFocusEnabled = autoFocus && !isDisabled` (L128). `isDisabled = useAuiState(s => s.thread.isDisabled || s.composer.dictation?.inputDisabled) || disabledProp` (L44). **`thread.isDisabled` flips every time `isRunning` transitions** (`external-store-thread-runtime-core.js:76` sets `this.isDisabled = store.isDisabled ?? false` on every non-short-circuited `setAdapter`, and our store exposes `isDisabled` as `!canSend && !isRunning` via the adapter getter in `OwnerAssistantThread.tsx:99`).

**Therefore: during streaming, `focus()` fires from L136 independently of the three `unstable_*` flags.** H2 is correct in its mechanism (setSelectionRange kills composition) but the author's remediation assumes only the L143-148 path exists. That is incomplete.

**Added hypothesis H6 (missing in §3):** the unconditional `useEffect(() => focus(), [focus])` at `ComposerInput.js:136` re-invokes `setSelectionRange` on `isDisabled` toggles, which happen on every `isRunning` transition. This is a strictly stronger framing than H2 — it is the same IME-abort mechanism, but it fires on a code path that **cannot** be disabled via documented props.

On H1 (controlled-value re-write): the author's own counter-example is correct — if pure controlled-value reconciliation killed IME, English would also break. React 19 `<textarea>` wrapper logic does short-circuit `node.value = …` when the string is `Object.is`-equal. H1 is at most a secondary contributor.

H3 (layout-effect resize) and H5 (StrictMode double-invoke): plausible, unverified, low probability. Agree.

H4 (mystery `setText("")`): ruled out correctly. `grep -n "setText" web/node_modules/@assistant-ui/react/dist/primitives/composer/ComposerInput.js` shows calls only in user-originated `onChange` (L169) and `onCompositionEnd` (L190). No phantom writer.

**Verdict on §3:** H2 correctly identified as primary mechanism, but Strategy A's framing assumes H2 is a clean on/off via `unstable_focusOnRunStart={false}`. The unconditional L136 focus effect is a real blind spot. See §2 below.

### 2. Strategy A risk assessment — incomplete

Audit of every `focus()`-invoking site in `ComposerInput.js`:

```
L136:  useEffect(() => focus(), [focus])                                   // UNCONDITIONAL
L137:  useOnScrollToBottom(() => { if (... unstable_focusOnScrollToBottom) focus(); })
L143:  useEffect(() => { ... return aui.on("thread.runStart", focus); }, ...)
L149:  useEffect(() => { ... return aui.on("threadListItem.switchedTo", focus); }, ...)
```

The document's Strategy A passes `unstable_focusOnRunStart={false}` + `unstable_focusOnScrollToBottom={false}`. That silences L137-142 and L143-148 only. L136 continues to call `focus()` on every `focus` callback-identity change, which in turn happens every time `autoFocusEnabled` (→ `isDisabled`) flips, which in turn happens on every `isRunning` transition.

Concretely, the sequence for a real user doing a second 中文 send looks like:
1. user types 拼音 → `compositionstart` on live textarea.
2. user hits Enter or clicks send → `thread.isRunning` → true → our store updates → parent re-renders → runtime `setAdapter` either (a) falls through Round-3's short-circuit because adapter identity changed, or (b) changes nothing but L136 still fires because `isDisabled` is read via `useAuiState` and notification-driven re-render updates it → `autoFocusEnabled` flips → `focus` callback gets new identity → L136 effect re-runs → `setSelectionRange` on the currently-composing textarea → IME aborts.

**Practical regression risk of turning off L143-148 via the flag:** low, agreed. User clicks to refocus if needed.

**But Strategy A as written will probably NOT fix the bug**, because L136 still fires. The only ways to neutralize L136 without a patch are:
- set `autoFocus={false}` on the primitive (forces `autoFocusEnabled = false` → `focus` is a no-op), OR
- prevent `isDisabled` from flipping mid-stream (don't let our adapter's `isDisabled` getter depend on `isRunning`).

The document should flag this. Recommendation: combine Strategy A with either `autoFocus={false}` *or* make the adapter `isDisabled` stable-during-streaming (e.g. `get isDisabled() { return !propsRef.current.canSend; }` without the `!isRunning` clause) — but the latter has its own implications for the send button.

### 3. Round 3 `useMemo(..., [])` — is the author's claim true?

**Yes, verified.** The author's reasoning stands up. Specifically:

- `useExternalStoreRuntime.js:8-10`:
  ```js
  useEffect(() => { runtime.setAdapter(store); });   // no deps, runs each render
  ```
- `external-store-runtime-core.js:13-17` delegates to `this.threads.getMainThreadRuntimeCore().__internal_setAdapter(adapter)`.
- `external-store-thread-runtime-core.js:72-74`:
  ```js
  __internal_setAdapter(store) {
      if (this._store === store) return;     // IDENTITY GUARD
      ...
  ```

With Round 3's `useMemo(() => adapter, [])`, `adapter` is the same object reference for the whole component lifetime. After the constructor's first call (via `new ExternalStoreThreadRuntimeCore(..., adapter)` → `__internal_setAdapter(adapter)`, L70), every subsequent `setAdapter(adapter)` from the render-level effect hits `this._store === store` and returns without re-reading `store.messages` or `store.isRunning`.

Important nuance the author states correctly but that's worth making explicit:

- `get isRunning()` on the runtime class (L47-48) is `return this._store.isRunning;` — it's a *live getter*, invoked whenever any subscriber asks for `thread.isRunning`. Because `_store` is the stable adapter object and its own `isRunning` is a property getter reading `propsRef.current.isRunning` (`OwnerAssistantThread.tsx` per §2.6), **`isRunning` DOES propagate**. Status flips work.
- `messages` does NOT propagate, because the only code path that *imports* `store.messages` into `this.repository` is inside the short-circuited branch of `__internal_setAdapter` (L103-154). After mount, that branch is skipped forever. `this.repository.getMessages()` keeps returning the mount-time snapshot.

So the author's conclusion — "streaming deltas silently don't reach the Thread" — is correct as stated for the message repository. The document's parenthetical speculating about *how* the PONG character does eventually show is hand-wavy; the actual explanation is simpler: `isRunning` transitions flip the "streaming…" indicator and trigger `_notifySubscribers` (via the inner branch that DOES run when `oldStore.isRunning !== store.isRunning` — see L125-130 of `external-store-thread-runtime-core.js`), but **only if `oldStore !== store`**, which under Round 3 is false. So actually in Round 3 even the `_notifySubscribers` firing path is suspect. I would go further than the author: under Round 3, the runtime's view of the conversation is **frozen at mount** full stop. The reason users still see *something* is almost certainly that the parent component also renders message bubbles from Zustand state directly in other places (or remounts via `key={agentId}` on agent switch). This is worth a quick runtime check with React Profiler but the core defect the author identified is real and needs reverting.

**Round 3 is buggy. Revert it regardless of which fix strategy is chosen.**

### 4. Final judgement — A, B, or C?

**My call: Strategy C (swap in QRClaw's own `ChatComposer`) is the right answer.** Ranked differently from the document.

Reasons:
1. Strategy A is likely insufficient on its own because of the unconditional L136 focus effect (§2 above). To make A actually work we'd also have to set `autoFocus={false}` or reshape our adapter's `isDisabled`. Each additional coupling is a future-upgrade trap — any library change to `ComposerInput.js`'s focus logic will re-break us silently.
2. The `ChatComposer` at `web/src/components/chat/ChatComposer.tsx` already exists, is already production-quality, and — per the user's report — is already IME-safe. The marginal engineering cost of swapping it in (~30 LoC per §4) is the lowest of the three strategies.
3. The "upgrade compat: LOW" concern against C is overstated in the document. We already don't use the library features that `ComposerPrimitive.Input` buys us (attachments/dictation/voice). If we later want those, adopting them behind our own composer is a finite additive task. Meanwhile, A and B bind us tightly to assistant-ui's internal focus/subscription semantics, which are `unstable_*`-prefixed for a reason — the library authors reserve the right to change them.
4. Strategy B is correctly dismissed by the document as heavyweight. I would additionally note that "freeze runtime during composition" is conceptually wrong: the runtime shouldn't be aware of the composer's DOM state. It introduces a layering violation.

**Compound recommendation:**
1. **Revert Round 3**'s `useMemo(() => adapter, [])` back to dep-driven memoisation (or drop `useMemo` entirely and rely on `external-store-thread-runtime-core.js:125-130`'s inner short-circuit).
2. **Adopt Strategy C**: render `<Thread>` with `components.Composer = () => null` and mount `ChatComposer` beneath the viewport, wired to the same `onSend`/`onStop`.
3. Keep a **tracer regression test** in `tests/e2e/` that at least exercises the non-IME fast path (Playwright can't cover IME, but it can catch "composer doesn't render at all" regressions after the swap).
4. Defer Strategy A indefinitely. Only reconsider if we ever need assistant-ui's attachment/dictation features.

**On §5's "start with A, fall back to C":** I disagree. Given the L136 blind spot, the probability that A alone resolves the user's complaint is materially lower than the document assumes, and the cost of trying A first is not zero (one more round-trip with the user on a real IME). Going straight to C is higher expected value.

### Citations verified during this review

- `ComposerInput.js:35` (props list, incl. `unstable_focusOnRunStart = true` default)
- `ComposerInput.js:44` (`isDisabled` selector binds to `thread.isDisabled`)
- `ComposerInput.js:128-135` (`autoFocusEnabled`, `focus` callback, `setSelectionRange` call)
- `ComposerInput.js:136` (**unconditional** `useEffect(() => focus(), [focus])` — not gated by any `unstable_*` flag)
- `ComposerInput.js:137-148` (scroll-to-bottom and run-start focus effects)
- `ComposerInput.js:161-170` (IME composition skip in `onChange`)
- `useExternalStoreRuntime.js:8-10` (unconditional `setAdapter` effect each render)
- `external-store-runtime-core.js:13-17` (delegation to main thread runtime)
- `external-store-thread-runtime-core.js:47-48` (live `isRunning` getter through `_store`)
- `external-store-thread-runtime-core.js:72-74` (identity short-circuit)
- `external-store-thread-runtime-core.js:118-154` (messages import path, only reached when guard falls through)

