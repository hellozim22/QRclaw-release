# Frontend Teammate Progress Notes

> 自动创建于 Agent Teams 启动时。每个子任务完成后更新。
> /compact 前必须更新。失败时必须记录 Failed Attempts。

## Progress
- [x] Phase 0: Next.js 15 项目初始化 + 8 个基础 UI 组件
- [x] Phase 1: Auth pages (Login, SignUp, Verify) + Supabase Auth integration
- [x] Phase 2: Visitor Chat page + WebSocket client + Zustand store
- [x] Phase 3: Web Dashboard (sidebar, messages, QR codes, settings)

## Current Task
Phase 4: Security Hardening — 2 CRITICAL + 2 HIGH fixes COMPLETE, Vercel redeploy pending

## Completed Work

### Next.js Project (web/)
- Next.js 16.1.6, TypeScript, Tailwind CSS, ESLint, App Router, src dir
- Fonts: Inter + JetBrains Mono (via next/font/google)
- Dependencies: lucide-react, zustand, @supabase/supabase-js
- Full design-tokens.css integrated into globals.css
- Directory structure: components/{ui,chat,dashboard,layout}, lib/{supabase,ws,utils}, hooks, stores, types

### 8 Base UI Components (web/src/components/ui/)
| Component | Variants/Features |
|-----------|-------------------|
| Button | primary/secondary/ghost, sm/md/lg |
| Input | label, error state, icon left/right |
| Avatar | agent/user, fallback initials, configurable size |
| Badge | online/offline/busy status |
| TopBar | back button, title, right action slot |
| TabBar | Messages/Me tabs, active state |
| MessageBubble | sent/received, streaming indicator |
| QRCard | QR image/placeholder, agent name/desc |

### Phase 1: Auth + Supabase (web/src/)

**Supabase Client (lib/supabase/)**
- `browser.ts` — createBrowserClient for client components
- `server.ts` — createServerClient for server components/actions
- `middleware.ts` — Session update middleware (cookie-based)
- `index.ts` — Barrel export

**Auth Hook (hooks/useAuth.ts)**
- signIn, signUp, signOut, verifyOtp
- Auto-subscribes to onAuthStateChange
- Returns user + loading state

**Auth Pages (app/(auth)/)**
- `layout.tsx` — Shared centered layout
- `login/page.tsx` — Email + password, links to signup
- `signup/page.tsx` — Email + password + confirm, redirects to verify
- `verify/page.tsx` — OTP input, Suspense-wrapped for useSearchParams

**Auth Callback (app/auth/callback/route.ts)**
- Exchanges OAuth code for session, redirects to /dashboard

**Root Middleware (middleware.ts)**
- Protects /dashboard/* → redirects to /login
- Redirects authed users from /login, /signup → /dashboard

**Dependencies Added**
- `@supabase/ssr` ^0.x

**Env Vars (web/.env.local)**
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (needs real key)

### Phase 2: Chat + WebSocket (web/src/)

**WebSocket Types (types/ws.ts)**
- Full WSFrame envelope: `{ type, id?, timestamp, payload }`
- Client frames: `visitor_message`, `ping`, `read_receipt`
- Server frames: `connection_ack`, `ack`, `message`, `stream_chunk`, `stream_end`, `pong`, `error`, `system`

**Chat Types (types/chat.ts)**
- `ChatMessage` — id, content, contentType, senderType, timestamp, status
- `ConnectionStatus` — disconnected | connecting | connected | reconnecting
- `StreamingState` — messageId, content, sequence

**WebSocket Client (lib/ws/client.ts)**
- `WSClient` class: connect, disconnect, sendMessage, sendReadReceipt
- Auto-reconnect with exponential backoff (1s → 30s max)
- Heartbeat ping at server-specified interval
- Frame dispatch to typed callbacks
- Uses `crypto.randomUUID()` (no uuid dep)

**Zustand Store (stores/chatStore.ts)**
- messages[], connectionStatus, streaming state
- Actions: addMessage, updateMessageStatus, startStream, appendStreamDelta, endStream, setConnectionStatus, reset
- Sequence-ordered stream delta appending

**Chat Components (components/chat/)**
- `ChatInputBar.tsx` — Pill input + red send button, Enter to send
- `RegisterBanner.tsx` — Dismissible banner for unauthenticated visitors
- `MessageList.tsx` — Auto-scroll, renders messages + streaming bubble
- `index.ts` — Barrel export

**Chat Page (app/chat/[agentId]/page.tsx)**
- WSClient lifecycle on mount/unmount per agentId
- Optimistic message sending
- Stream handling: startStream on seq=1, appendStreamDelta, endStream

### Phase 3: Web Dashboard (web/src/)

**Dashboard Layout (app/(dashboard)/layout.tsx)**
- Route group — no URL prefix
- 80px sidebar: Logo + 3 nav items (Messages, QR Codes, Settings)
- Active state: pathname.startsWith() → red-bg + red icon

**Messages Page (app/(dashboard)/messages/page.tsx)**
- 320px middle column: search + conversation list
- Fill right column: chat detail placeholder or empty state
- Unread count badge (custom red circle)

**QR Codes Page (app/(dashboard)/qrcodes/page.tsx)**
- Header with search + Create QR Code button
- Row list: QR preview, agent name, status badge, scan count, link
- Empty state with QRCard placeholder + create button

**QR Creation Wizard (app/(dashboard)/qrcodes/create/page.tsx)**
- 4-step wizard: Select Agent → Customize → Preview → Success
- Step indicator with numbered circles + connecting lines
- Step 0: Agent selection cards with border highlight
- Step 1: Label + Description form
- Step 2: QR preview placeholder + summary
- Step 3: Green check success
- Footer: Back/Next/Create/Done with canProceed validation

**Settings Page (app/(dashboard)/settings/page.tsx)**
- Header + Profile card (avatar, name, email)
- Menu list: Edit Profile, Change Password, Subscription, My Agents, Log Out
- Each row: icon + label + chevron right (danger variant for Log Out)

### Build Verification
- `npm run build` passes successfully (all routes: /, /login, /signup, /verify, /chat/[agentId], /messages, /qrcodes, /qrcodes/create, /settings)

## Phase 4: Security Hardening (2026-03-20 ~ 2026-03-23)

### CRITICAL-1: WS Credentials Not in URL
- `web/src/lib/ws/client.ts` — Auth frame (`type: 'auth'`) sent via `sendAuthFrame()` after `onopen`
- URL now only carries `agent_id` and optional `role` (non-sensitive params)
- Verified: `tests/unit/ws-ticket-flow.test.ts` (3 tests)

### CRITICAL-2: CSP unsafe-eval Restricted
- `web/src/lib/csp.ts` — `unsafe-eval` only when `NODE_ENV === 'development'`
- Verified: `tests/unit/frontend/csp-config.test.ts`

### HIGH-1: Ticket Refresh on Reconnect
- `WSClient.scheduleReconnect()` calls `onTicketRefresh()` before reconnecting
- Double `intentionallyClosed` guard prevents race with `disconnect()`

### HIGH-2: qrCodeId Null-Safety
- `useWebSocket({ agentId, qrCodeId })` — if `qrCodeId` is null, no WS connection
- Chat pages extract `?qr=` param; no fallback to agentId slug
- Verified: `tests/unit/frontend/chatPageParams.test.ts` (4 tests)

### New Files
- `web/src/lib/ws/ticket.ts` — `fetchVisitorTicket()` HTTP API call
- `web/src/components/chat/ConnectionStatusBanner.tsx` — WS status indicator

## Blocked
- **Vercel deployment stale**: Production site still running pre-security code
  - Local `main` at `dd3b09e`, pushed to `origin/main`
  - Vercel did not auto-deploy; needs manual trigger
  - Gateway returns 4001 (missing auth frame) to old client code

## Next Steps
- Manual Vercel redeploy (requires user action)
- Layer 3 Chat WebSocket E2E verification (29 test points) — after redeploy
- 12 MEDIUM+LOW visual restoration issues (`test-results/fix-list.md`)
- Wire real Supabase data to dashboard pages
- Add real QR code generation

## Failed Attempts
- E2E Chat test on `qrclaw-test.vercel.app`: Gateway returns `4001 Missing ticket parameter` because deployed code lacks auth frame flow. Confirmed by JS bundle analysis — old chunk has no `fetchVisitorTicket`.

## Dependencies
- Vercel redeploy: Must be triggered manually by project owner
- Gateway: Running and healthy at `gateway-test.qrclaw.ai` (confirmed via /health)

## Last Checkpoint
- Commit: `dd3b09e` (fix: resolve 2 CRITICAL + 2 HIGH security/reliability issues)
- Phase: 4 (Security Hardening COMPLETE, deployment pending)
- Timestamp: 2026-03-23
