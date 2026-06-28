# Multica Reuse Map

| bibisheng 文件 | Multica 来源 | 复用方式 |
|---|---|---|
| `web/src/components/agent/ProviderLogo.tsx` | `packages/views/runtimes/components/provider-logo.tsx` | SVG/provider identity adapt |
| `web/src/features/progress/TaskCard.tsx` | `packages/views/issues/components/board-card.tsx` | Board card structure adapt |
| `web/src/features/progress/ProgressBoardHeader.tsx` | `packages/views/issues/components/issues-header.tsx` | Project filter/header pattern adapt |
| `web/src/features/progress/TaskCommentInput.tsx` | `packages/views/issues/components/comment-input.tsx` | Comment input layout adapt |
| `web/src/features/runtimes/RuntimesPage.tsx` | `packages/views/runtimes/components/runtimes-page.tsx` | Runtime 状态模式参考；独立入口已合并到 Agents |
| `web/src/features/agents/AgentsPage.tsx` | `packages/views/agents/components/agents-page.tsx` | Master-detail agents page adapt |
| `web/src/features/agents/AgentListItem.tsx` | `packages/views/agents/components/agent-list-item.tsx` | List item pattern adapt |

## Desktop 复用边界（macOS Native Plan — QRClaw）

| QRClaw 目标 | Multica 来源 | 复用方式 |
|---|---|---|
| `apps/macos/QRClaw/Services/ServiceOrchestrator.swift` | `apps/desktop/src/main/daemon-manager.ts` health polling / before-quit | 复用进程生命周期思路；Swift 重写 |
| `apps/macos/QRClaw/Services/ProcessSupervisor.swift` | `daemon-manager.ts` operation guard + PATH repair | 复用串行化/防并发启动思路；不引 Electron IPC |
| `apps/macos/QRClaw/Views/Settings/SettingsView.swift` | `daemon-manager.ts` log tail | 复用日志 tail 体验；Swift 实现 |
| `web/src/lib/desktop-bridge.ts` | Multica platform adapter 思路 | 窄 bridge；Web 业务仍由 `web/` 渲染 |
| 禁止项 | Electron `BrowserWindow` / `@multica/views/*` / PAT profile version-decision | 不复制；QRClaw 采用 SwiftUI + WKWebView + 云端 Desktop Bootstrap |
