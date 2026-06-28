# @qrclaw/openclaw-plugin

OpenClaw channel plugin that bridges OpenClaw agents to the [QRClaw](https://qrclaw.ai) SaaS
gateway. Install the plugin in an OpenClaw instance, drop in a QRClaw agent token, and your
OpenClaw agent instantly gets a visitor-facing QR-code chat channel with zero visitor
registration required. Messages flow end-to-end encrypted through the QRClaw gateway; the
plugin is a neutral relay (no AI inference, no content inspection — see [C1/C2 in the
QRClaw plan](../../docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md)).

## Install

> **Status (MVP):** the package is still `"private": true` in `package.json`. Flip to
> `"private": false` and bump the version through a changeset before the first public
> release — see **Release** below.

Once published:

```bash
npm i @qrclaw/openclaw-plugin
```

Peer dependency:

```json
{
  "peerDependencies": {
    "openclaw": "^2026.0.0"
  }
}
```

## Configure

Add a `qrclaw` channel block to your OpenClaw config. The schema is declared in
[`openclaw.plugin.json`](./openclaw.plugin.json); each field is explained below.

```json
{
  "channels": {
    "qrclaw": {
      "accounts": {
        "support": {
          "agentToken": "qrclaw_ag_live_xxxxxxxxxxxxxxxxxxxx",
          "gatewayWsUrl": "wss://gateway.qrclaw.ai/ws"
        },
        "sales": {
          "agentToken": "qrclaw_ag_live_yyyyyyyyyyyyyyyyyyyy",
          "gatewayWsUrl": "wss://gateway.qrclaw.ai/ws",
          "supabaseUrl": "https://zyxqadubhwrnsoujiyir.supabase.co"
        }
      },
      "defaultAccount": "support"
    }
  }
}
```

| Field              | Required | Description                                                                                                  |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `accounts`         | yes      | Map of account label → account config. Each label is an independent QRClaw agent / WS connection.            |
| `accounts.<label>.agentToken`  | yes | QRClaw agent API key (created in the QRClaw dashboard → Agents → Create).                                    |
| `accounts.<label>.gatewayWsUrl` | no | Gateway WebSocket URL. Defaults to `wss://gateway.qrclaw.ai/ws`. Override for self-hosted or local dev.     |
| `accounts.<label>.supabaseUrl`  | no | Supabase project URL (only used by the ticket-exchange and history endpoints when overriding the default). |
| `accounts.<label>.ticketUrl`    | no | Custom ticket endpoint URL. Overrides the default derived from `gatewayWsUrl`.                              |
| `defaultAccount`   | no       | Label of the account to use when a tool call omits `agent_account_label`.                                    |

## Example flow

```
┌───────────────────────┐        ┌────────────────────┐        ┌─────────────────┐
│ QRClaw Dashboard      │        │ OpenClaw + plugin  │        │ Visitor (mobile)│
│ 1. Create agent       │ token  │ 3. Drop token into │        │                 │
│ 2. Copy agent token   │───────▶│    config          │        │                 │
│                       │        │ 4. Start OpenClaw  │        │                 │
│                       │        │ 5. Tool: create_   │──QR──▶│ 6. Scan QR      │
│                       │        │    qrclaw_qrcode   │        │ 7. Chat         │
│                       │        │ 8. Messages relay  │◀──────▶│                 │
└───────────────────────┘        └────────────────────┘        └─────────────────┘
```

1. In the QRClaw dashboard create an agent and copy its token.
2. Paste the token into the OpenClaw `qrclaw.accounts.<label>.agentToken` field.
3. Start OpenClaw. The plugin opens a WebSocket to the QRClaw gateway and registers a
   `create_qrclaw_qrcode` tool.
4. Your agent invokes the tool — it returns a short-lived QR code URL.
5. A visitor scans the QR, loads the mobile chat page, and starts sending messages.
6. Messages flow: visitor → gateway → WebSocket → OpenClaw agent → reply → gateway → visitor.

## Multi-account

One OpenClaw instance can host multiple QRClaw agents side-by-side — e.g. `support` and
`sales` above. Each account:

- Maintains its own WebSocket to the gateway.
- Owns its own conversation set.
- Is selected per tool invocation via the `agent_account_label` parameter, or falls back to
  `defaultAccount`.

The runtime guarantees inbound frames are never cross-delivered between accounts (see
`tests/runtime.test.ts` — "inbound frame on account A does NOT appear on account B's
callback").

## Local development

```bash
# 1. Clone QRClaw and OpenClaw side-by-side:
#
#    <some-parent>/
#    ├── qrclaw/        ← this repo
#    └── openclaw-main/ ← https://github.com/openclaw/openclaw

cd plugins/openclaw
npm install          # resolves the file:../../openclaw-main dev-link

npm run typecheck    # tsc --noEmit
npm test             # 100 vitest specs: unit + e2e harness
npm run build        # tsc -p tsconfig.build.json → dist/
```

The sibling `openclaw-main` checkout is needed only for the `file:` dev-link; nothing in
`src/` actually imports from `openclaw` at runtime — a local type shim at
`src/openclaw-types.ts` covers the plugin-SDK surface so we don't need OpenClaw compiled.

## Known limitations (MVP)

- **History replay** (`src/history.ts`) is currently a no-op in production: the
  `GET /api/agent/conversations` gateway endpoint it targets is not yet deployed. On
  reconnect the plugin resumes from the live stream only. Unit tests exercise the code
  path with a mock transport.
- **`openclaw-types.ts`** is a hand-maintained local shim for the OpenClaw plugin-SDK
  surface (`ChannelPlugin`, `OpenClawPluginApi`, `defineChannelPluginEntry`,
  `defineSetupPluginEntry`, etc.). When OpenClaw ships these types as a published package
  we'll switch to importing them directly and delete the shim.
- **Package is private** (`"private": true`). It runs fine in-tree and in CI; `npm publish`
  is blocked until we flip the flag (see Release).

## Contributing

1. Read [§5.4 and §12.6.4 of the refactor
   plan](../../docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md) —
   that's the authoritative source on release cadence and scope.
2. Keep changes tight. Every PR under `plugins/openclaw/` must:
   - Pass `npm run typecheck` and `npm test` (100/100 minimum).
   - Pass the indistinguishable acceptance spec at
     `tests/acceptance/plugin-indistinguishable.spec.ts`.
   - Include a changeset: `cd plugins/openclaw && npx changeset`.
3. Forbidden wire-level names (enforced in CI): `button_pressed`, `agent_reaction` — see
   plan §9 R13.

## Release

> Cadence: follow OpenClaw (plan §10 D6). Ship a patch whenever OpenClaw ships a patch;
> minor when OpenClaw minors.

1. Collect changesets: `npx changeset` on each contributing PR (already required in review).
2. On main, run `npm run version` — bumps `package.json` version + writes `CHANGELOG.md`.
3. Flip `"private": true` → `"private": false` in `package.json` when ready to publish.
4. `npm run build` — produces `dist/`.
5. `npm publish --dry-run` — verify the file list matches the `files` whitelist and that
   `tests/`, `node_modules/`, `.changeset/` are excluded.
6. `npm publish` (requires npm org write access to `@qrclaw`).
7. Commit the version bump + changelog back to `main`; tag `v<version>`.

## License

Same as the root QRClaw repository. See `../../LICENSE` when present; otherwise the code
is UNLICENSED pending the first public release.
