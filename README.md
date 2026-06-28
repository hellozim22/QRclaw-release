# <img src="./docs/assets/qrclaw-logo.jpg" width="40" height="40" alt="QRClaw logo" align="center"> QRClaw

A local-first multi-agent collaboration platform — manage your AI agents like chatting.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/platform-macOS%2014%2B-silver)](https://github.com/hellozim22/QRclaw-release)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-green)](https://nodejs.org)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go)](https://go.dev)

---

## Features

### Chat — Independent Conversations

Each agent gets its own conversation window with isolated context and history. Run multiple agent conversations in parallel, just like messaging different people in a chat app — no cross-talk, no interference.

![Chat interface](./docs/assets/screenshots/01-chat-openclaw.png)

---

### Agents — Runtime Management

View all agent runtimes installed on your machine (Codex, Cursor, Claude Code, OpenClaw, Pi, etc.). Configure connections with a single click and manage the agent lifecycle entirely through the UI — no command line required.

![Agent management](./docs/assets/screenshots/04-agents.png)

---

### Progress — Task Board

Turn action items from long conversations into structured tasks. Track progress on a kanban board with task creation, status transitions, and detail views — making AI-driven work traceable and measurable.

![Progress task board](./docs/assets/screenshots/02-progress-board.png)

---

### Progress — Task Detail

Every task carries full context: linked conversations, execution status, participating agents, timelines, and more — ensuring a transparent and auditable collaboration process.

![Progress task detail](./docs/assets/screenshots/03-progress-task-detail.png)

---

### Profile

Manage your avatar, display name, and other personal settings. The macOS desktop app supports automatic update detection.

---

## Quick Start

### For Users — macOS Desktop Installation

1. Download the DMG installer: [`QRClaw-0.1.1.dmg`](./download/QRClaw-0.1.1.dmg) (~150 MB)
2. Open the DMG and drag `QRClaw.app` into the `Applications` folder
3. On first launch, go to **System Settings > Privacy & Security** and click **"Open Anyway"** to trust the developer
4. Follow the onboarding guide to configure your agent runtimes and start using QRClaw

> Requirements: macOS 14 (Sonoma) or later

### For Developers — Run from Source

```bash
# Clone the repository
git clone https://github.com/hellozim22/QRclaw-release.git
cd QRclaw-release

# Install frontend dependencies and start
cd web
pnpm install
pnpm dev

# Start the Gateway (new terminal)
cd gateway
pnpm install
pnpm dev

# Start the Agent Host (new terminal)
cd qrclaw-agent-host
go run ./cmd/host
```

For detailed development setup, refer to the [`docs/`](./docs/) directory.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 · React 19 · Tailwind CSS v4 · TypeScript |
| Backend | Express 5 · WebSocket · Redis |
| Agent Host | Go 1.22 |
| Database | Supabase (PostgreSQL) |
| Desktop | SwiftUI (macOS 14+) |
| Testing | Vitest · Playwright |

---

## Project Structure

```
QRclaw-release/
├── web/                    # Next.js 16 frontend
├── gateway/                # Express 5 Gateway + WebSocket
├── qrclaw-agent-host/      # Go agent runtime
├── apps/macos/QRClaw/      # SwiftUI macOS desktop app
├── supabase/               # Database schema & Edge Functions
├── shared/contracts/       # Shared type contracts
├── tests/                  # Vitest / Playwright / E2E tests
├── docs/                   # Product, deployment & desktop update docs
├── design/                 # Design assets
├── scripts/                # Build & release scripts
├── download/               # macOS desktop installer
├── plugins/openclaw/       # OpenClaw channel plugin
└── .claude/                # Claude Code agent config
```

---

## Contributing

Issues and pull requests are welcome.

1. Fork this repository and create a feature branch `feat/your-feature`
2. Ensure your code passes lint checks and existing tests
3. Submit a pull request and link it to the corresponding issue

---

## License

[Apache 2.0](./LICENSE) © QRClaw Contributors
