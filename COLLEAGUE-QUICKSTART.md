# 同事上手：QRClaw 多智能体 Chat

> 目标：15 分钟内开始对话。工程开发走 `dev-up.sh`；非工程同事走 **QRClaw macOS 桌面 App**。

## 桌面版安装（QRClaw.dmg）

面向非工程同事：**双击即用，无需邀请码、无需 Terminal**。

1. 从团队获取 `QRClaw.dmg` → 拖入 Applications → 双击打开。
2. App 自动启动 Web `:3000`、Gateway `:3100`、Agent Host，并建立本地 session（与 `dev-up.sh` 相同）。
3. 直接进入 **Chat / Progress / Agents**。

**一次性配置**：若本机尚无 Supabase 配置，向团队索取并按 `docs/local-dev-secrets.md` 放置 `~/.config/qrclaw/secrets.env`（App 运行时读取，**不打包进 .app**）。

> 邀请码方案已废弃；桌面产品与 local v1 对齐为开箱即用。

| 项 | 值 |
|----|-----|
| 本机 Web | `http://127.0.0.1:3000` |
| 本机 Gateway | `http://127.0.0.1:3100` |
| WebSocket | `ws://127.0.0.1:3100/ws` |
| 退出 | ⌘Q — 释放 :3000 / :3100 端口 |

实施方案详见 `docs/superpowers/plans/2026-06-23-bibisheng-macos-native-desktop-plan.md`。

### 桌面版常见问题

**首次打开卡在 Launch**：确认 `~/.config/qrclaw/secrets.env` 已配置；Settings → Open Logs Folder。

**与 dev-up 端口冲突**：Desktop App 与 `dev-up.sh` 同占 :3000/:3100，请勿同时运行。

**Chat 白屏**：Settings → Restart Services；或重开 App。

---

## 工程开发版（本地 v1）

> 以下面向开发者；需要 Node、Go、Redis 与本机 secrets。

### 你需要什么

| 项目 | 说明 |
|------|------|
| Node.js 20+、Go 1.22+、Redis 6379 | 见 `scripts/dev-up.sh` |
| `~/.config/qrclaw/secrets.env` | 向团队索取，勿提交 git |
| 至少一个 Agent CLI | codex / cursor / claude / openclaw / pi |

### 启动（两步）

```bash
source ~/.config/qrclaw/secrets.env
cd bibisheng-agent-chat

bash scripts/setup-local-env.sh   # 首次：生成 .env + LOCAL_DEV 标志
bash scripts/dev-up.sh            # seed 本地用户 + Gateway + Web + auto attach Host

open http://localhost:3000/chat   # 打开即用
```

### macOS 桌面 App 开发构建

```bash
cd bibisheng-agent-chat
bash scripts/build-desktop-resources.sh   # 打包 Web standalone + Gateway + Node + Host
./script/build_and_run.sh --verify        # 构建并启动 dist/QRClaw.app
bash apps/macos/packaging/make-dmg.sh     # 产出 dist/QRClaw.dmg
node tests/ecc-local-verify-macos-desktop.mjs
```

## 页面

| 侧栏 | 用途 |
|------|------|
| **Chat** | 四 Agent 私聊 |
| **Agents** | 配置 Agent 信息、Host 状态 |
| **Progress** | 六列看板 |
| **个人** | 头像 + 显示名称 |

## Agent 未 Online？

1. 确认至少安装一个 CLI
2. 重跑 `bash scripts/dev-up.sh`（开发）或 App Settings → Restart Services（桌面）
3. Chat 页会显示安装引导；Offline 时每 5s 自动重扫

## 验证 build

```bash
cd gateway && npm run typecheck
cd web && npm run build && npm run test
cd qrclaw-agent-host && go test ./...
./script/build_and_run.sh --verify
```
