# 笔笔省 macOS 原生桌面 App — 完整实施计划（build-macos-apps）

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 逐项执行；每个 Wave 开工前必读对应 `~/macos/skill/<skill-name>/SKILL.md` 与 Review Checklist。

**Goal:** 产出可发给非工程同事安装使用的 `BibishengAgent.dmg`：无需 Terminal、无需本机 secrets、无需安装 Node/Redis/Go，双击 App 后进入 Chat / Progress / Agents。

**Architecture:** 路线一锁定：Swift/SwiftUI 原生壳 + WKWebView + ServiceOrchestrator + `.dmg`。本机固定 Web `3000`、Gateway `3100`、WS `ws://127.0.0.1:3100/ws`；本机 Gateway 是 desktop-local 代理/路由层，不持有 `SUPABASE_SERVICE_ROLE_KEY`、`QRCLAW_KEK_V1` 或 pepper。云端 Desktop Bootstrap API 持有服务端 secret，负责创建/校验同事身份、签发 scoped desktop token、host token 与 Supabase session。

**Tech Stack:** SwiftPM + SwiftUI + WKWebView + OSLog + Security/Keychain + bundled Node runtime + Next standalone + Node Gateway desktop mode + bundled agent host + Developer ID signing/notarization + DMG。

---

## 0. 不变量

| 项 | 决策 |
|----|------|
| 主仓 SSoT | `/Users/zeze/bibisheng-agent-chat`，禁止锚定 `qrclaw/` |
| 产品目标 | 发给非工程同事：安装 `.dmg` 后无 Terminal、无本机 secrets、无 Homebrew 依赖 |
| 桌面技术路线 | Swift/SwiftUI 壳 + WKWebView + ServiceOrchestrator + `.dmg`，禁止 Electron |
| 本机端口 | Web `http://127.0.0.1:3000`、Gateway `http://127.0.0.1:3100`、WS `ws://127.0.0.1:3100/ws` |
| C1 中立中继 | Desktop 不跑 LLM、不根据内容语义路由、不改 Gateway 业务语义 |
| C2 加密存储 | service_role / KEK 只在云端 Gateway/Edge Function；Desktop 不落盘、不打包、不日志化 |
| build-run-debug | GUI 必须 stage 为 `dist/BibishengAgent.app` 并用 `/usr/bin/open -n` 启动，禁止 raw executable 启 SwiftUI |
| macOS skill | Wave 0: build-run-debug/swiftpm-macos；Wave 1: swiftui-patterns/liquid-glass/window-management；Wave 2: appkit-interop；Wave 3: telemetry/test-triage；Wave 4: signing-entitlements/packaging-notarization |

---

## 1. 发行级架构

```text
BibishengAgent.app
├─ SwiftUI Shell
│  ├─ NavigationSplitView: Chat / Progress / Agents
│  ├─ Settings: account, runtime, logs, reset
│  ├─ Launch/ErrorRecovery views
│  └─ Keychain: Supabase session + desktop runtime token + local WS secret
├─ WKWebView
│  └─ http://127.0.0.1:3000/{chat,progress,agents}?desktop=1
├─ ServiceOrchestrator
│  ├─ bundled node
│  ├─ web/.next/standalone server on :3000
│  ├─ gateway desktop-local mode on :3100
│  └─ bundled qrclaw-agent-host
└─ Cloud Bootstrap
   ├─ HTTPS QRClaw Gateway endpoint
   ├─ owns service_role / KEK / host pepper
   └─ issues scoped desktop token, host token, session
```

**关键变化：** `scripts/dev-up.sh` 仍是开发 SSoT，但发行版不能照搬其 secret 模型。`setup-local-env.sh` 会把 `SUPABASE_SERVICE_ROLE_KEY`、`QRCLAW_KEK_V1`、`QRCLAW_HOST_TOKEN_PEPPER` 写入 `gateway/.env`；这只适合本地工程开发，不能进入 `.app`。

### 1.1 首次启动流程

1. 同事安装 `BibishengAgent.dmg`，拖入 Applications，双击打开。
2. SwiftUI LaunchView 启动 bundled Web/Gateway/Host。
3. 若 Keychain 无 desktop token，显示登录/邀请码页。
4. 用户输入团队发放的 invite code 或邮箱 magic link。
5. App 调云端 `POST /api/desktop/bootstrap/exchange`。
6. 云端创建/复用 owner、默认 agents、host token，返回 scoped desktop token + Supabase session。
7. App 将 token 写入 Keychain，不写文件。
8. WKWebView 打开 `/chat?desktop=1`；Web 通过 native bridge / local gateway 取 session。
9. 本机 agent-host 连接 `ws://127.0.0.1:3100/ws`；本机 Gateway 用 desktop token 代理到云端。

### 1.2 非工程同事 DoD

- [ ] 新机器无 `~/.config/qrclaw/secrets.env` 也能启动。
- [ ] 新机器无 Node/Redis/Go/Homebrew 也能启动。
- [ ] `.app/Contents/Resources` grep 不到 service_role、KEK、pepper、WS ticket secret。
- [ ] 双击 App 后 60 秒内进入 Chat。
- [ ] Chat 可调用本机 Agent；Progress/Agents 可打开。
- [ ] 退出 App 后本机 :3000/:3100 释放。

---

## 2. 仓库文件结构

```text
bibisheng-agent-chat/
├─ apps/macos/BibishengAgent/
│  ├─ Package.swift
│  ├─ App/BibishengAgentApp.swift
│  ├─ Views/
│  │  ├─ RootSplitView.swift
│  │  ├─ SidebarView.swift
│  │  ├─ ContentWebView.swift
│  │  ├─ LaunchView.swift
│  │  ├─ DesktopLoginView.swift
│  │  └─ ErrorRecoveryView.swift
│  ├─ Views/Settings/SettingsView.swift
│  ├─ Models/SidebarSection.swift
│  ├─ Models/ServiceHealth.swift
│  ├─ Services/
│  │  ├─ ServiceOrchestrator.swift
│  │  ├─ DesktopBootstrapClient.swift
│  │  ├─ DesktopKeychain.swift
│  │  ├─ WebViewBridge.swift
│  │  └─ ProcessSupervisor.swift
│  ├─ Support/BibishengLogger.swift
│  └─ Resources/
├─ gateway/src/desktop/
│  ├─ mode.ts
│  ├─ cloud-client.ts
│  ├─ local-session.ts
│  └─ proxy-router.ts
├─ gateway/src/routes/desktop-bootstrap.ts
├─ web/src/components/DesktopAutoSignIn.tsx
├─ web/src/lib/desktop-bridge.ts
├─ scripts/build-desktop-resources.sh
├─ apps/macos/packaging/make-dmg.sh
├─ script/build_and_run.sh
└─ tests/ecc-local-verify-macos-desktop.mjs
```

---

## 3. Security Model

### 3.1 Desktop 永不持有的值

以下字符串不得出现在 `.app`、`.dmg`、日志、Keychain 以外明文文件：

- `SUPABASE_SERVICE_ROLE_KEY`
- `QRCLAW_KEK_V1`
- `QRCLAW_HOST_TOKEN_PEPPER`
- 生产 `WS_TICKET_SECRET`
- Supabase 管理员密码

### 3.2 Desktop 可以持有的值

- Supabase user session（用户身份，Keychain）
- scoped desktop runtime token（仅该安装、该 owner、短有效期/可轮换，Keychain）
- local WS ticket secret（本机随机生成，仅 local web ↔ local gateway，Keychain）
- host token（由云端签发/校验，Keychain）
- public cloud base URL（非 secret）

### 3.3 云端 Desktop Bootstrap API

**Files**
- Create: `gateway/src/routes/desktop-bootstrap.ts`
- Modify: `gateway/src/server.ts`
- Create via `npx supabase migration new add_desktop_bootstrap`: `supabase/migrations/20260624_add_desktop_bootstrap.sql`
- Modify: `shared/contracts/http/owner-agent-chat/protocol.ts`
- Modify: `shared/contracts/http/owner-agent-chat/types.ts`
- Test: `tests/unit/gateway/desktop-bootstrap.test.ts`
- Test: `tests/unit/gateway/desktop-bootstrap-security.test.ts`

**Database**

```sql
create table desktop_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  owner_email text,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table desktop_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  device_name text not null,
  app_version text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table desktop_invites enable row level security;
alter table desktop_devices enable row level security;
```

RLS: 普通客户端不能直接读写这两张表；只允许 service role / Gateway 云端路由管理。邀请码明文只在创建时展示一次，数据库只存 HMAC hash。

**Endpoints**

```text
POST /api/desktop/bootstrap/exchange
Body: { inviteCode?: string, email?: string, magicLinkToken?: string, deviceName: string, appVersion: string }
Response: {
  ownerId: string,
  supabaseSession: { access_token: string, refresh_token: string, expires_at: number },
  desktopRuntimeToken: string,
  hostToken: string,
  cloudGatewayUrl: string
}
```

**Rules**
- 只有云端路由读取 service_role / KEK / pepper。
- `desktopRuntimeToken` scope: `owner_id`, `device_id`, `allowed_origin=desktop`, `expires_at`。
- `desktopRuntimeToken` 只存 hash 到 `desktop_devices.token_hash`；明文只返回给首次 bootstrap，并由 Desktop 写 Keychain。
- 所有 token 输出使用 HTTPS；不写服务端日志。
- 失败返回可读 code: `invalid_invite`, `expired_invite`, `device_revoked`, `rate_limited`。
- 必须有 revocation 路径：`POST /api/desktop/devices/:deviceId/revoke`（owner JWT），撤销后本机 Gateway 下一次 upstream 调用得到 `device_revoked` 并回到 `DesktopLoginView`。

---

## 4. Gateway Desktop Mode

发行包中的本机 Gateway 在 `DESKTOP_LOCAL_MODE=1` 下启动：

```text
PORT=3100
DESKTOP_LOCAL_MODE=1
DESKTOP_CLOUD_GATEWAY_URL=https://<cloud-gateway>
DESKTOP_RUNTIME_TOKEN=<from Keychain>
LOCAL_WS_TICKET_SECRET=<random Keychain value>
REDIS_DISABLED_FOR_DESKTOP=1
```

### 4.1 行为边界

- 本机 Gateway 不直接连 Supabase service role。
- 本机 Gateway 不加密/解密平台持久化消息；需要持久化时转发云端 Gateway/Edge。
- 本机 Gateway 只做 local web/host 路由、health 聚合、token 转发、日志。
- 本机 Gateway 不跑 LLM。

### 4.2 Redis 处理

当前 `gateway/src/redis/client.ts` 默认连 `redis://localhost:6379`。发行版目标不能要求同事安装 Redis，因此 Wave 3 必须二选一落地：

1. **首选：desktop-local in-memory registry**  
   修改 `gateway/src/redis/client.ts` 与 host/owner run registry，让 `DESKTOP_LOCAL_MODE=1` 时使用内存 adapter。单机单用户场景可接受；退出后靠云端回放恢复。
2. **兜底：bundle Valkey/Redis-compatible server**  
   `ServiceOrchestrator` 启动 bundled `valkey-server`，监听 `127.0.0.1` 随机端口，env 注入 `REDIS_URL`。nested binary 必须签名/notarize。

本计划默认采用方案 1，减少打包复杂度。

---

## 5. Web Desktop 适配

**Files**
- Modify: `web/src/app/(dashboard)/layout.tsx`
- Create: `web/src/lib/desktop-bridge.ts`
- Create: `web/src/components/DesktopAutoSignIn.tsx`
- Modify: `web/src/components/LocalDevAutoSignIn.tsx`
- Modify: `web/next.config.ts`

**Rules**
- `layout.tsx` 是 client component，不能用 layout `searchParams` prop。
- WKWebView 设置 `applicationNameForUserAgent = "BibishengAgent"`。
- Web 判定 desktop 优先级：`window.bibishengDesktop` → UA `BibishengAgent` → `useSearchParams().get('desktop') === '1'`。
- Desktop 模式不渲染 Web icon rail，保留页面内容。
- `DesktopAutoSignIn` 调本机 `GET http://127.0.0.1:3100/api/desktop/local-session`，拿 Supabase session 后 `supabase.auth.setSession()`。
- `LocalDevAutoSignIn` 只保留给 `NEXT_PUBLIC_LOCAL_DEV=1`，Desktop 发行包不使用本地固定密码。
- `web/next.config.ts` 增 `output: 'standalone'`，并确保 build 前 env 为 `NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:3100`、`NEXT_PUBLIC_GATEWAY_WS_URL=ws://127.0.0.1:3100/ws`。

---

## 6. macOS App Waves

### Wave 0 — SwiftPM + build-run-debug

**Skills:** `build-run-debug`, `swiftpm-macos`, `telemetry`

**Files**
- Create: `apps/macos/BibishengAgent/Package.swift`
- Create: `apps/macos/BibishengAgent/App/BibishengAgentApp.swift`
- Create: `apps/macos/BibishengAgent/Support/BibishengLogger.swift`
- Create: `script/build_and_run.sh`
- Create: `.codex/environments/environment.toml`

**Steps**
- [ ] Create SwiftPM executable app with `platforms: [.macOS("14.0")]`.
- [ ] Create `script/build_and_run.sh` following `~/macos/skill/build-run-debug/references/run-button-bootstrap.md`.
- [ ] Stage `dist/BibishengAgent.app`; launch with `/usr/bin/open -n`.
- [ ] Generated Info.plist includes `CFBundleIdentifier=ai.bibisheng.agent.desktop`, `LSMinimumSystemVersion=14.0`, `NSPrincipalClass=NSApplication`, `NSAppTransportSecurity/NSAllowsLocalNetworking=true`.
- [ ] Add AppDelegate activation policy `.regular` and `NSApp.activate(ignoringOtherApps: true)`.
- [ ] Verify:

```bash
cd /Users/zeze/bibisheng-agent-chat
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry
```

### Wave 1 — Native Shell

**Skills:** `swiftui-patterns`, `liquid-glass`, `window-management`

**Files**
- Create: `Views/RootSplitView.swift`
- Create: `Views/SidebarView.swift`
- Create: `Views/LaunchView.swift`
- Create: `Views/DesktopLoginView.swift`
- Create: `Views/ErrorRecoveryView.swift`
- Create: `Views/Settings/SettingsView.swift`
- Create: `Models/SidebarSection.swift`

**Steps**
- [ ] `NavigationSplitView` sidebar order: Chat → Progress → Agents.
- [ ] `Commands` from `swiftui-patterns/references/commands-menus.md`: ⌘1/⌘2/⌘3, ⌘, settings.
- [ ] Sidebar uses `.listStyle(.sidebar)`, one icon + one title line; no dense metadata.
- [ ] Use system material; no `Color.white` / opaque custom chrome.
- [ ] Main window default size 1280×800. macOS 15+ APIs guarded with `if #available`.
- [ ] Verify with real `.app`, not raw executable.

### Wave 2 — WKWebView + Desktop Bridge

**Skills:** `appkit-interop`

**Files**
- Create: `Views/ContentWebView.swift`
- Create: `Services/WebViewBridge.swift`
- Modify: `web/src/app/(dashboard)/layout.tsx`
- Create: `web/src/lib/desktop-bridge.ts`
- Create: `web/src/components/DesktopAutoSignIn.tsx`

**Steps**
- [ ] Implement `NSViewRepresentable` for `WKWebView`.
- [ ] Set `applicationNameForUserAgent = "BibishengAgent"`.
- [ ] Inject `window.bibishengDesktop` at document start.
- [ ] Load `/chat?desktop=1`, `/progress?desktop=1`, `/agents?desktop=1`.
- [ ] Web hides icon rail in desktop mode.
- [ ] Verify:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/chat?desktop=1"
node tests/ecc-local-verify-macos-desktop.mjs
```

### Wave 3 — Distribution Runtime + Cloud Bootstrap

**Skills:** `telemetry`, `test-triage`

**Files**
- Create: `Services/DesktopBootstrapClient.swift`
- Create: `Services/DesktopKeychain.swift`
- Create: `Services/ServiceOrchestrator.swift`
- Create: `Services/ProcessSupervisor.swift`
- Create: `gateway/src/routes/desktop-bootstrap.ts`
- Create: `gateway/src/desktop/mode.ts`
- Create: `gateway/src/desktop/cloud-client.ts`
- Create: `gateway/src/desktop/local-session.ts`
- Create: `gateway/src/desktop/proxy-router.ts`
- Modify: `gateway/src/server.ts`
- Modify: `gateway/src/redis/client.ts`
- Create: `scripts/build-desktop-resources.sh`

**Steps**
- [ ] Cloud bootstrap endpoint exchanges invite/magic link for session + scoped desktop token + host token.
- [ ] Desktop stores returned credentials in Keychain.
- [ ] `build-desktop-resources.sh` builds web standalone, gateway dist, bundled node, bundled host.
- [ ] Orchestrator starts local Gateway `DESKTOP_LOCAL_MODE=1` on :3100 and Web standalone on :3000.
- [ ] Gateway desktop mode uses local in-memory registry or bundled Redis fallback; no service_role/KEK env required.
- [ ] Local `GET /api/desktop/local-session` returns session only to `127.0.0.1`.
- [ ] Host connects to `ws://127.0.0.1:3100/ws`; local gateway verifies upstream token through cloud.
- [ ] Verify no local secrets:

```bash
grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e QRCLAW_HOST_TOKEN_PEPPER dist/BibishengAgent.app/Contents/Resources/ && exit 1 || true
```

### Wave 4 — Signing, Notarization, DMG

**Skills:** `signing-entitlements`, `packaging-notarization`, `test-triage`

**Files**
- Create: `apps/macos/packaging/BibishengAgent.entitlements`
- Create: `apps/macos/packaging/make-dmg.sh`
- Modify: `script/build_and_run.sh`

**Steps**
- [ ] Inside-out sign every nested Mach-O: app binary, bundled node, agent host, optional valkey.
- [ ] Hardened runtime enabled.
- [ ] If bundling Node, entitlements include `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`.
- [ ] Notarize with `xcrun notarytool submit --wait`.
- [ ] Staple app and DMG.
- [ ] Verify:

```bash
codesign -dvvv --entitlements :- dist/BibishengAgent.app
spctl -a -vv dist/BibishengAgent.app
xcrun stapler validate dist/BibishengAgent.app
```

### Wave 5 — ECC Regression + Non-Engineer Smoke

**Skills:** `test-triage`, `build-run-debug`

**Files**
- Create: `tests/ecc-local-verify-macos-desktop.mjs`
- Modify: `COLLEAGUE-QUICKSTART.md`
- Modify: `docs/multica-reuse-map.md`
- Modify: `.claude/progress/session-overview.md`
- Modify: `dev-log/YYYY-MM-DD.md`

**Steps**
- [ ] Web build/test:

```bash
cd web && npm run build && npm run test
```

- [ ] Gateway typecheck:

```bash
cd gateway && npm run typecheck
```

- [ ] Host tests:

```bash
cd qrclaw-agent-host && go test ./...
```

- [ ] Desktop verify:

```bash
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry
node tests/ecc-local-verify-macos-desktop.mjs
```

- [ ] Clean Mac smoke: no repo checkout, no Terminal; install DMG, launch, enter invite code, Chat sends message, Progress loads, Agents shows host online.

---

## 7. Multica Reuse Boundary

Read-only reference: `/Users/zeze/multica/apps/desktop/src/main/daemon-manager.ts`.

| Multica pattern | Use in Bibisheng | Boundary |
|-----------------|------------------|----------|
| Health polling state machine | `ServiceHealth` + Orchestrator status | Reimplement in Swift |
| Log tail | Settings log viewer | Reimplement in Swift |
| before-quit graceful stop | ⌘Q teardown | Reimplement in Swift |
| PATH repair | ProcessSupervisor env | Reimplement in Swift |
| Electron BrowserWindow | Not used | Forbidden |
| PAT/profile/version-decision | Not used | Multica-specific |
| `@multica/views/*` | Not used | Web remains bibisheng |

---

## 8. Packaging Contents

`BibishengAgent.app/Contents/Resources/` may contain:

- Next standalone output
- gateway compiled JS
- bundled node runtime
- `qrclaw-agent-host`
- static assets
- public cloud base URL config

It must not contain:

- `.env`
- `~/.config/qrclaw/secrets.env`
- service_role / KEK / pepper
- local-dev fixed password
- raw logs

---

## 9. Final Verification Matrix

```bash
cd /Users/zeze/bibisheng-agent-chat

# repo baseline
cd web && npm run build && npm run test
cd ../gateway && npm run typecheck
cd ../qrclaw-agent-host && go test ./...

# desktop build/run
cd ..
bash scripts/build-desktop-resources.sh
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry

# local ports
curl -fsS http://127.0.0.1:3100/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/chat?desktop=1

# packaging
bash apps/macos/packaging/make-dmg.sh
codesign -dvvv --entitlements :- dist/BibishengAgent.app
spctl -a -vv dist/BibishengAgent.app
xcrun stapler validate dist/BibishengAgent.app

# no secret in bundle
grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e QRCLAW_HOST_TOKEN_PEPPER -e WS_TICKET_SECRET dist/BibishengAgent.app/Contents/Resources/ && exit 1 || true

# quit releases ports
lsof -iTCP:3000 -sTCP:LISTEN -P -n
lsof -iTCP:3100 -sTCP:LISTEN -P -n
```

---

## 10. Definition of Done

- [ ] Non-engineer colleague can install DMG and launch without Terminal.
- [ ] No external Node/Redis/Go/Homebrew required.
- [ ] Desktop never contains service_role/KEK/pepper.
- [ ] Local ports match 3000/3100/ws.
- [ ] Chat / Progress / Agents work in one native window.
- [ ] Agent host can attach and respond.
- [ ] Build-run-debug `.app` launch path works.
- [ ] Developer ID signing/notarization/staple passes.
- [ ] ECC baseline tests pass.
- [ ] `COLLEAGUE-QUICKSTART.md`, `dev-log`, `.claude/progress/session-overview.md`, `docs/multica-reuse-map.md` updated.
