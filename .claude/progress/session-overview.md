# Session Progress — 笔笔省多智能体协作（bibisheng-agent-chat）

> **仓库定位（2026-06）**：本地单用户多 Agent Chat。**唯一主线 = `/chat` + `/agents` + `/settings`（个人资料）**。
> 无邮箱登录 UI；`dev-up.sh` 一键 seed + attach。

## Overall Status

**当前阶段**：QRClaw macOS 桌面 App Loop 10 可交付 — bundled runtime + DMG + E2E 11/11
**下一里程碑**：Developer ID 签名/notarize + C2-clean 无 secrets.env 干净 Mac 冒烟

## macOS Desktop（2026-06-24 新增）

| 模块 | 路径 | 状态 |
|------|------|------|
| SwiftPM App | `apps/macos/QRClaw/` | ✅ Wave 0–1 Shell |
| build_and_run | `script/build_and_run.sh` | ✅ build / --verify / --telemetry |
| WKWebView + bridge | `Views/ContentWebView.swift` + `web/src/lib/desktop-bridge.ts` | ✅ Wave 2 |
| ServiceOrchestrator | `apps/macos/QRClaw/Services/` | ✅ Loop 10：独占端口 + public config + host attach |
| Gateway desktop mode | `gateway/src/desktop/` | ✅ slim + proxy + bundle health marker |
| Desktop Bootstrap API | `gateway/src/routes/desktop-bootstrap.ts` | ⚠️ 代码就绪，待云端部署 |
| Bundled runtime | `scripts/build-desktop-resources.sh --deliverable` | ✅ |
| 一键 DMG | `scripts/build-deliverable-dmg.sh` | ✅ |
| DMG | `dist/QRClaw.dmg` | ✅ ad-hoc；notarize 待密钥 |
| 桌面更新检测 | Sparkle 2 + `个人中心` 检测更新 | ✅ 已接入；GitHub Releases appcast 本机配置已完成，正式推送待 Developer ID |
| ECC verify | `tests/ecc-local-verify-macos-desktop.mjs --e2e` | ✅ 11/11 |

## 主线功能清单

| 模块 | 路径 | 状态 |
|------|------|------|
| Chat 页面 | `web/src/app/(dashboard)/chat/` | ✅ 两栏 + onboarding + 安装引导 |
| Agents 配置 | `web/src/app/(dashboard)/agents/` | ✅ 双栏 + 头像 + 单页角色说明配置 |
| Runtimes | `web/src/app/(dashboard)/runtimes/` | ✅ 兼容跳转到 `/agents`，不再作为侧栏入口 |
| Progress | `web/src/app/(dashboard)/progress/` | ✅ 本机共享数据（local API + file）/ Agent 工具管理 Task / 详情编辑 / Activity Live |
| 个人资料 | `web/src/app/(dashboard)/settings/` | ✅ 头像 + 名称（无退出登录） |
| 无登录本地会话 | `web/src/app/api/dev/bootstrap/` + `LocalDevBootstrap` | ✅ LOCAL_DEV 自动 seed |
| 本机 Host 自动 attach | `scripts/dev-up.sh` + `seed-local-owner.mjs` | ✅ pi/DeepSeek 显式 `thinking high` smoke 已通过 |
| Gateway Owner 路由 | `gateway/src/routes/owner-*.ts` | ✅ legacy visitor/QR 已 unmount |

## 本地启动（标准流程）

```bash
source ~/.config/qrclaw/secrets.env
bash scripts/setup-local-env.sh    # 首次：生成 .env + LOCAL_DEV 标志
bash scripts/dev-up.sh             # Redis + Gateway + Web + seed + auto attach
open http://localhost:3000/chat    # 无需登录
```

## 已裁减（local v1）

- 邮箱登录/注册/验证 UI → middleware redirect `/chat`
- Landing / 访客 / 移动端 / QR / 订阅 → redirect 或 Gateway unmount
- Settings 退出登录、改密、订阅子页

## 待办

1. 四 Provider 逐条验收回复速度与稳定性（pi + DeepSeek V4 Flash 已通过 smoke）
2. Agent Settings / Instructions 持久化 PATCH API（当前 UI 已合并入口）
3. 可选：legacy 页面文件物理删除（当前 middleware redirect 即可）

## 文档索引

| 文档 | 用途 |
|------|------|
| `dev-log/2026-06-23.md` | 本地 v1 精简实施记录 |
| `COLLEAGUE-QUICKSTART.md` | 同事上手（待同步） |
| `docs/local-dev-secrets.md` | 密钥配置 |
