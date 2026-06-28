# Desktop Updates

QRClaw macOS updates use Sparkle 2 with GitHub Releases.

## Current GitHub Update Source

- Repository: `hellozim22/QRclaw_release`
- Appcast URL: `https://github.com/hellozim22/QRclaw_release/releases/latest/download/appcast.xml`
- Local config: `~/.config/qrclaw/update.env`

The Sparkle private key is stored in the local Keychain. The public key is safe to embed in the app bundle through `SPARKLE_PUBLIC_ED_KEY`.

## Build A Local Release Artifact

This packaging flow stops stray QRClaw processes and local listeners on ports `3000`, `3100`, and `19515` before building. Run it when you are ready to interrupt the local dev app.

```bash
source ~/.config/qrclaw/update.env
QRCLAW_APP_VERSION=0.1.1 QRCLAW_APP_BUILD=2 \
  bash scripts/build-github-update-release.sh
```

Artifacts are written to:

```text
dist/github-update-release/v0.1.1/QRClaw-0.1.1.dmg
dist/github-update-release/v0.1.1/appcast.xml
```

## Upload To GitHub Releases

`QRCLAW_APP_BUILD` must increase for every public release. Sparkle uses the bundle build number to decide whether an installed app should update.

```bash
source ~/.config/qrclaw/update.env
QRCLAW_APP_VERSION=0.1.1 QRCLAW_APP_BUILD=2 \
  bash scripts/build-github-update-release.sh --upload
```

This creates or updates GitHub release `v0.1.1` and uploads:

- `QRClaw-0.1.1.dmg`
- `appcast.xml`

## Production Signing

Internal ad-hoc builds can exercise the update flow, but public distribution should set Developer ID signing and notarization variables before building:

```bash
export CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export NOTARY_APPLE_ID="apple-id@example.com"
export NOTARY_TEAM_ID="TEAMID"
export NOTARY_PASSWORD="<app-specific-password>"
```

Then rerun `scripts/build-github-update-release.sh --upload`.
