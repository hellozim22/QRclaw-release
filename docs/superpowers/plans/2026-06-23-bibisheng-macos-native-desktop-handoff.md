# 笔笔省 macOS 原生桌面 App — 执行指引（build-macos-apps）

> **用途:** `2026-06-23-bibisheng-macos-native-desktop-plan.md` 操作手册。  
> **主仓:** `/Users/zeze/bibisheng-agent-chat`（唯一 SSoT）  
> **macOS Skill:** `/Users/zeze/macos/skill/`  
> **验收:** `./script/build_and_run.sh --verify` + Web/Gateway 测试不回归 + 干净 Mac 无 secrets 冒烟

---

## 0. 开工前（30 分钟）

### 0.1 阅读顺序

1. 本文
2. `docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-plan.md`
3. `~/macos/skill/build-run-debug/SKILL.md` + `references/run-button-bootstrap.md`
4. `~/macos/skill/swiftui-patterns/SKILL.md`
5. `COLLEAGUE-QUICKSTART.md`
6. `scripts/dev-up.sh`（Orchestrator 行为对照）

Wave 2 前：`appkit-interop`  
Wave 4 前：`signing-entitlements` + `packaging-notarization`  
UI 阶段：`liquid-glass` + `window-management`  
失败分流：`test-triage`

### 0.2 环境：区分开发模式与发行模式

```bash
cd /Users/zeze/bibisheng-agent-chat

cd web && npm run build
cd ../gateway && npm run typecheck
cd ../qrclaw-agent-host && go test ./...

curl -fsS http://127.0.0.1:3100/health   # 若 dev-up 已跑
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/chat
```

**开发模式** 可以 `source ~/.config/qrclaw/secrets.env` 并跑 `scripts/dev-up.sh`。

**发行模式**（本任务目标）禁止依赖本机 secrets：同事机器没有 `~/.config/qrclaw/secrets.env`，`.app` 内也不能打包 service_role / KEK / pepper。发行版通过云端 Desktop Bootstrap API 换取 scoped desktop token + Supabase session，并写入 Keychain。

### 0.3 端口契约（勿改）

| 服务 | 端口 |
|------|------|
| Web | **3000** |
| Gateway | **3100** |
| WS | `ws://127.0.0.1:3100/ws` |

---

## 1. Wave 顺序

```text
Wave 0  SwiftPM + build_and_run.sh + .app 启动
Wave 1  NavigationSplitView + Commands + Settings
Wave 2  WKWebView + desktop=1 Web 适配
Wave 3  ServiceOrchestrator + Cloud Bootstrap + desktop-local Gateway
Wave 4  sign + notarize + .dmg
Wave 5  文档 + 全量验收
```

**Wave 0 完成前禁止调 Liquid Glass**（build-run-debug：GUI 必须用 `.app` 验证）。

---

## 2. Wave 0 — build-run-debug

### 2.1 创建包

路径：`apps/macos/BibishengAgent/`

`Package.swift` 提供 macOS executable；按 `swiftui-patterns` 拆分 `App/`、`Views/`、`Services/`。

### 2.2 build_and_run.sh

路径：**仓库根** `script/build_and_run.sh`

严格遵循 `~/macos/skill/build-run-debug/references/run-button-bootstrap.md`：

- stage `dist/BibishengAgent.app`
- `CFBundleIdentifier` = `ai.bibisheng.agent.desktop`
- launch：`/usr/bin/open -n dist/BibishengAgent.app`
- flags：`--debug` `--logs` `--telemetry` `--verify`

### 2.3 AppDelegate

```swift
NSApp.setActivationPolicy(.regular)
NSApp.activate(ignoringOtherApps: true)
```

### 2.4 Wave 0 DoD

```bash
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry
# Logger subsystem: ai.bibisheng.agent.desktop
```

---

## 3. Wave 1 — swiftui-patterns + liquid-glass + window-management

### 3.1 SidebarSection

```swift
enum SidebarSection: String, CaseIterable, Identifiable {
  case chat, progress, agents  // 顺序：Chat → Progress → Agents
}
```

### 3.2 Commands

⌘1 Chat · ⌘2 Progress · ⌘3 Agents — 绑定 sidebar selection。

### 3.3 Settings

独立 `Settings { SettingsView() }`，不放主窗口 NavigationStack。

### 3.4 自检

- [ ] `liquid-glass` Review Checklist 全过
- [ ] `window-management`：1280×800 default placement
- [ ] 侧栏无 triple-line metadata 堆叠

---

## 4. Wave 2 — appkit-interop

### 4.1 URL 表

| Section | URL |
|---------|-----|
| chat | `http://127.0.0.1:3000/chat?desktop=1` |
| progress | `http://127.0.0.1:3000/progress?desktop=1` |
| agents | `http://127.0.0.1:3000/agents?desktop=1` |

### 4.2 Web 改动

**`web/src/app/(dashboard)/layout.tsx`**（注意：此文件是 `'use client'` 且 Next layout **不接收 `searchParams` prop**）

- **不要**用 `props.searchParams`（拿不到）。判定 desktop 用以下之一：
  - `useSearchParams()` 读 `?desktop=1`（client hook，首帧兜底）；
  - **优先** `navigator.userAgent.includes('BibishengAgent')`（WKWebView 设 `applicationNameForUserAgent`，导航不丢失）；
  - 或 WKWebView 注入的 `window.bibishengDesktop`。
- desktop 判定为真 → 不渲染 `<Sidebar />`
- 保留 `<LocalDevAutoSignIn />`

**ATS（Wave 2 必须）**：Info.plist 加 `NSAppTransportSecurity → NSAllowsLocalNetworking=true`，否则 WKWebView 拒绝 `http://127.0.0.1:3000` 直接白屏。

**CSP**：`build-desktop-resources.sh` 在 `next build` 前导出 `NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:3100` 与 `NEXT_PUBLIC_GATEWAY_WS_URL=ws://127.0.0.1:3100/ws`（CSP 在 build 时烘焙）。

**新建 `web/src/lib/desktop-bridge.ts`**

```typescript
export type BibishengDesktopBridge = {
  platform: 'desktop' | 'web';
  ready?: () => void;
};
declare global {
  interface Window {
    bibishengDesktop?: BibishengDesktopBridge;
  }
}
```

---

## 5. Wave 3 — ServiceOrchestrator + Cloud Bootstrap

对照 `scripts/dev-up.sh` 的端口/启动顺序，但不要照搬 secret 模型。发行版必须做到无本机 secrets、无 Terminal、无外部 Node/Redis/Go。

1. App 首启无 Keychain token → `DesktopLoginView` 收 invite code / magic link。
2. Swift `DesktopBootstrapClient` 调云端 `POST /api/desktop/bootstrap/exchange`。
3. 云端 Gateway 持 service_role / KEK / pepper，创建/复用 owner、默认 agents、host token，返回 scoped desktop token + Supabase session。
4. Swift `DesktopKeychain` 写入 session / desktop token / host token / local WS secret。
5. `ServiceOrchestrator` 启动 bundled Gateway `DESKTOP_LOCAL_MODE=1` → wait `http://127.0.0.1:3100/health`。
6. 启动 Web standalone `node .next/standalone/server.js` → :3000。
7. 启动 bundled `qrclaw-agent-host`，连接 `ws://127.0.0.1:3100/ws`。

参考 Multica：`/Users/zeze/multica/apps/desktop/src/main/daemon-manager.ts`（仅进程管理思路；可抄 health-poll 状态机 715-746、log tail 785-840、before-quit 924-941，**勿抄** PAT/profile/version-decision 462-593）。

**防僵尸**：生产包直接 spawn `node`（Gateway `node gateway/dist/server.js`、Web `node .next/standalone/server.js`），不用 `npm run dev`（dev-up.sh:99/112 是 npm，会让 ⌘Q 杀父留孤儿）；子进程置独立 process group，teardown 杀整组；`--verify` 断言 :3000/:3100 释放。

**Redis**：发行版首选 `DESKTOP_LOCAL_MODE=1` 下 in-memory registry，避免要求同事安装 Redis；如果实现证明风险过高，再 bundle Valkey/Redis-compatible server，并按 nested binary 规则签名。

**Gateway desktop mode**：本机 Gateway 只持 `DESKTOP_RUNTIME_TOKEN` / local WS secret，不持 service_role/KEK/pepper；需要持久化、owner/host 校验时转发云端 Gateway。Desktop 不跑 LLM，不做语义路由。

日志目录默认：`/tmp/bibisheng-agent-chat-logs`（与 dev-up 一致）。

Settings 暴露：打开日志文件夹、重启服务、CLI 检测（`qrclaw-host detect` 等价）。

---

## 6. Wave 4 — packaging

```bash
bash apps/macos/packaging/make-dmg.sh
codesign -dvvv --entitlements :- dist/BibishengAgent.app
spctl -a -vv dist/BibishengAgent.app
# nested 二进制必须各自签名（否则 notarize 失败）
codesign -dvvv dist/BibishengAgent.app/Contents/Resources/qrclaw-agent-host
# secrets 不入包自检（无输出才算过）
grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e PEPPER dist/BibishengAgent.app/Contents/Resources/ \
  && echo "FAIL: secret leaked" || echo "OK"
```

**entitlements（Node 在 hardened runtime）**：`com.apple.security.cs.allow-jit`、`com.apple.security.cs.allow-unsigned-executable-memory`、`com.apple.security.cs.disable-library-validation`。

**安全**：`SUPABASE_SERVICE_ROLE_KEY` / `QRCLAW_KEK_V1` / `*_PEPPER` 永不进 bundle（KEK 泄露破坏 C2）。发行版由云端 Desktop Bootstrap API 持有这些 secret，客户端仅存 Keychain 内的 scoped desktop token / Supabase session / host token。详见 plan §3。

失败用 `test-triage` 分类：compiler / linker / signing / notarization / runtime。

---

## 7. 常见陷阱

| 陷阱 | 预防 |
|------|------|
| 用 qrclaw 仓路径 | 只用 `bibisheng-agent-chat` |
| Gateway 3001 | 必须 **3100** |
| raw executable 启 GUI | build-run-debug 禁止 |
| 双 sidebar | `desktop=1` |
| `next dev` 进 Desktop 包 | 必须 `next start` |
| print 调试 | telemetry Logger |
| 本机 secrets 进发行包 | 禁止；只走云端 bootstrap + Keychain scoped token |
| 要求同事装 Redis/Node/Go | 禁止；bundle runtime 或 desktop-local in-memory |

---

## 8. 每 Wave 收尾

```bash
cd /Users/zeze/bibisheng-agent-chat
cd web && npm run build && npm run test
cd ../gateway && npm run typecheck
./script/build_and_run.sh --verify
grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e QRCLAW_HOST_TOKEN_PEPPER dist/BibishengAgent.app/Contents/Resources/ && exit 1 || true
```

更新 `dev-log/YYYY-MM-DD.md`。

---

## 9. 实施 Agent Prompt

```text
执行笔笔省 macOS Desktop（build-macos-apps）：

主文档：/Users/zeze/bibisheng-agent-chat/docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-plan.md
手册：/Users/zeze/bibisheng-agent-chat/docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-handoff.md

主仓：/Users/zeze/bibisheng-agent-chat（禁止在 qrclaw/ 实施）
端口：Web 3000 · Gateway 3100 · WS /ws
发行目标：非工程同事，无 Terminal，无本机 secrets，无外部 Node/Redis/Go。
从 Wave 0-1 创建 apps/macos/BibishengAgent 开始；Wave 3 必须落 Cloud Bootstrap + desktop-local Gateway。
每个 Wave 前读 ~/macos/skill/<name>/SKILL.md。
```
