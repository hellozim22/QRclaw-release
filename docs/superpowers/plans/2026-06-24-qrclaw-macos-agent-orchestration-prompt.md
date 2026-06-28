# QRclaw macOS 桌面 App — Agent Team 编排 Prompt

> **用途：** 发给 macOS 桌面 + QRClaw 架构 agent team 的完整实施指令。  
> **主仓 SSoT：** `/Users/zeze/bibisheng-agent-chat`  
> **方案锚点：** `2026-06-23-bibisheng-macos-native-desktop-plan.md` + `handoff.md`  
> **产品名：** QRclaw（实施时统一替换文档中的 `BibishengAgent` / `笔笔省 Agent`）

---

你们是 macOS 桌面产品 + QRClaw 架构专业开发团队。请在主仓 `/Users/zeze/bibisheng-agent-chat` 内，按照 ECC 标准与 macOS skill SSoT，组织多个 agent 协作，完成 “QRclaw macOS 原生桌面 App” 的开发。

## 目标

交付可发给非工程同事安装使用的 `QRclaw.dmg`：

- 无 Terminal
- 无本机 secrets
- 无外部 Node / Redis / Go / Homebrew 依赖
- 双击 App 后进入 Chat / Progress / Agents
- 本机端口固定：Web `3000`、Gateway `3100`、WS `ws://127.0.0.1:3100/ws`
- Desktop 不跑 LLM、不改 Gateway 语义，遵守 C1 中立中继
- Desktop 不持有 `SUPABASE_SERVICE_ROLE_KEY` / `QRCLAW_KEK_V1` / pepper，遵守 C2 加密存储

## 必读文档（按顺序）

1. `/Users/zeze/bibisheng-agent-chat/.claude/progress/session-overview.md`
2. `/Users/zeze/bibisheng-agent-chat/docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-plan.md`
3. `/Users/zeze/bibisheng-agent-chat/docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-handoff.md`
4. `/Users/zeze/bibisheng-agent-chat/COLLEAGUE-QUICKSTART.md`
5. `/Users/zeze/bibisheng-agent-chat/docs/multica-reuse-map.md`
6. `/Users/zeze/bibisheng-agent-chat/scripts/dev-up.sh`
7. 只读参考：`/Users/zeze/multica/apps/desktop/src/main/daemon-manager.ts`

## macOS Skill SSoT（必须读）

每个 Wave 开工前读取对应 skill 的 `SKILL.md`、Review Checklist、Guardrails：

- `/Users/zeze/macos/skill/build-run-debug/SKILL.md`
- `/Users/zeze/macos/skill/swiftpm-macos/SKILL.md`
- `/Users/zeze/macos/skill/swiftui-patterns/SKILL.md`
- `/Users/zeze/macos/skill/liquid-glass/SKILL.md`
- `/Users/zeze/macos/skill/window-management/SKILL.md`
- `/Users/zeze/macos/skill/appkit-interop/SKILL.md`
- `/Users/zeze/macos/skill/telemetry/SKILL.md`
- `/Users/zeze/macos/skill/test-triage/SKILL.md`
- `/Users/zeze/macos/skill/signing-entitlements/SKILL.md`
- `/Users/zeze/macos/skill/packaging-notarization/SKILL.md`

尤其遵守 `build-run-debug`：SwiftUI GUI 必须 stage 为 `dist/QRclaw.app` 并用 `/usr/bin/open -n` 启动，禁止 raw executable 启动 SwiftUI GUI。

## 编排方式（ECC 多 Agent）

主协调 agent 使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 统筹；Wave 内可并行，Wave 间必须串行。

### Agent 分工

| Agent | 职责 | 对应 Wave |
|-------|------|-----------|
| **Lead / Orchestrator** | 读 plan/handoff、拆任务、验收、更新 dev-log/session-overview | 全程 |
| **macOS Shell Agent** | SwiftPM、SwiftUI Shell、Settings、Commands、Window、Liquid Glass | Wave 0–1 |
| **WKWebView Agent** | `ContentWebView`、bridge、UA、ATS、desktop 模式 Web 适配 | Wave 2 |
| **Runtime Agent** | ServiceOrchestrator、ProcessSupervisor、bundled runtime、desktop-local Gateway | Wave 3 |
| **Cloud Bootstrap Agent** | desktop-bootstrap API、migration、Keychain、DesktopAutoSignIn | Wave 3 |
| **Packaging Agent** | codesign、entitlements、notarize、staple、DMG | Wave 4 |
| **QA / Verification Agent** | 跑验收命令、Playwright 冒烟、test-triage 分类失败 | 每 Wave 收尾 + Wave 5 |

### 协作规则

1. 严格按 Wave 0 → Wave 5 推进；前一 Wave 验收通过后再开下一 Wave。
2. 每个子 agent 开工前必须读对应 macOS skill；Wave 收尾对照 Review Checklist。
3. 禁止 Electron、禁止 `@multica/*`、禁止在 `qrclaw/` 仓实施。
4. 主仓唯一 SSoT：`/Users/zeze/bibisheng-agent-chat`。
5. 小步提交，保持可回滚；每个 Wave 结束更新 `dev-log/YYYY-MM-DD.md`。
6. 发现 plan 文档仍写 `BibishengAgent` / `笔笔省 Agent`，实施时统一替换为 `QRclaw`，但不改主仓路径。

## 架构必须保持

路线一已锁定：

- Swift / SwiftUI 原生壳
- `NavigationSplitView` 原生侧栏：Chat → Progress → Agents
- WKWebView 加载本机 Web：`http://127.0.0.1:3000/{chat,progress,agents}?desktop=1`
- ServiceOrchestrator 启动本机 Web / Gateway / Agent Host
- Cloud Desktop Bootstrap API 负责同事登录、设备注册、scoped desktop token、host token、Supabase session
- Desktop 只存 Keychain scoped token/session，不存平台 secret
- 本机 Gateway 是 `DESKTOP_LOCAL_MODE=1` 的 desktop-local 代理层

## 命名约定

| 项 | 值 |
|----|-----|
| App 显示名 | `QRclaw` |
| App bundle | `dist/QRclaw.app` |
| DMG | `dist/QRclaw.dmg` |
| Bundle ID | `ai.qrclaw.desktop` |
| SwiftPM package/product | `QRclaw` |
| macOS 源码路径 | `apps/macos/QRclaw/` |
| Logger subsystem | `ai.qrclaw.desktop` |
| WKWebView UA | `QRclawDesktop/<version>` |

## 必须完成的主要文件

- `apps/macos/QRclaw/Package.swift`
- `apps/macos/QRclaw/App/QRclawApp.swift`
- `apps/macos/QRclaw/Views/*`
- `apps/macos/QRclaw/Services/ServiceOrchestrator.swift`
- `apps/macos/QRclaw/Services/DesktopBootstrapClient.swift`
- `apps/macos/QRclaw/Services/DesktopKeychain.swift`
- `apps/macos/QRclaw/Services/ProcessSupervisor.swift`
- `gateway/src/routes/desktop-bootstrap.ts`
- `gateway/src/desktop/*`
- `supabase/migrations/20260624_add_desktop_bootstrap.sql`
- `web/src/components/DesktopAutoSignIn.tsx`
- `web/src/lib/desktop-bridge.ts`
- `web/src/app/(dashboard)/layout.tsx`
- `web/next.config.ts`
- `scripts/build-desktop-resources.sh`
- `script/build_and_run.sh`
- `.codex/environments/environment.toml`
- `apps/macos/packaging/make-dmg.sh`
- `tests/ecc-local-verify-macos-desktop.mjs`

## Wave 验收（每 Wave 必跑）

### Wave 0

```bash
cd /Users/zeze/bibisheng-agent-chat
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry
```

### Wave 1–2

```bash
./script/build_and_run.sh --verify
cd web && npm run build && npm run test
node tests/ecc-local-verify-macos-desktop.mjs
```

### Wave 3

```bash
bash scripts/build-desktop-resources.sh
./script/build_and_run.sh --verify
curl -fsS http://127.0.0.1:3100/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/chat?desktop=1
grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e QRCLAW_HOST_TOKEN_PEPPER dist/QRclaw.app/Contents/Resources/ && exit 1 || true
```

### Wave 4–5（最终全量）

```bash
cd /Users/zeze/bibisheng-agent-chat

cd web && npm run build && npm run test
cd ../gateway && npm run typecheck
cd ../qrclaw-agent-host && go test ./...

cd ..
bash scripts/build-desktop-resources.sh
./script/build_and_run.sh --verify
./script/build_and_run.sh --telemetry
node tests/ecc-local-verify-macos-desktop.mjs

bash apps/macos/packaging/make-dmg.sh
codesign -dvvv --entitlements :- dist/QRclaw.app
spctl -a -vv dist/QRclaw.app
xcrun stapler validate dist/QRclaw.app

grep -rIl -e SERVICE_ROLE -e QRCLAW_KEK -e QRCLAW_HOST_TOKEN_PEPPER -e WS_TICKET_SECRET dist/QRclaw.app/Contents/Resources/ && exit 1 || true

lsof -iTCP:3000 -sTCP:LISTEN -P -n
lsof -iTCP:3100 -sTCP:LISTEN -P -n
```

## 人工冒烟（Wave 5 必做）

在干净 Mac 上验证：

- 无 repo checkout、无 Terminal、无 `~/.config/qrclaw/secrets.env`
- 安装 `QRclaw.dmg`
- 双击打开 `QRclaw.app`
- 输入 invite code / magic link 完成首次登录
- Chat 可发消息并收到 Agent 回复
- Progress 六列看板可见
- Agents 页显示本机 Host online
- ⌘Q 退出后 `:3000` / `:3100` 释放

## 交付要求

完成后更新：

- `COLLEAGUE-QUICKSTART.md`（Desktop 安装节，产品名 QRclaw）
- `docs/multica-reuse-map.md`
- `dev-log/YYYY-MM-DD.md`
- `.claude/progress/session-overview.md`

## 最终报告格式

Lead agent 输出：

1. 完成的 Wave 与对应 agent
2. 修改的关键文件清单
3. 运行过的验收命令与结果
4. macOS skill Review Checklist 通过情况
5. 已知限制 / 后续风险
6. `dist/QRclaw.dmg` 路径与干净 Mac 安装验证结果
