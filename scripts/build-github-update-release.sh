#!/usr/bin/env bash
# build-github-update-release.sh — build a Sparkle update archive for GitHub Releases.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${QRCLAW_UPDATE_CONFIG:-$HOME/.config/qrclaw/update.env}"

usage() {
  cat <<'USAGE' >&2
Usage:
  QRCLAW_APP_VERSION=0.1.1 QRCLAW_APP_BUILD=2 bash scripts/build-github-update-release.sh [--upload]

Required local config:
  ~/.config/qrclaw/update.env
    QRCLAW_GITHUB_REPOSITORY=owner/repo
    QRCLAW_UPDATE_FEED_URL=https://github.com/owner/repo/releases/latest/download/appcast.xml
    SPARKLE_PUBLIC_ED_KEY=<Sparkle public EdDSA key>

Notes:
  --upload creates/updates GitHub release v$QRCLAW_APP_VERSION using gh.
  Developer ID signing/notarization is controlled by CODESIGN_IDENTITY and NOTARY_*.
USAGE
}

UPLOAD=0
if [[ "${1:-}" == "--upload" ]]; then
  UPLOAD=1
elif [[ $# -gt 0 ]]; then
  usage
  exit 2
fi

[[ -f "$CONFIG_FILE" ]] || {
  echo "Missing $CONFIG_FILE. Run Sparkle key setup first." >&2
  usage
  exit 1
}

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${QRCLAW_APP_VERSION:?QRCLAW_APP_VERSION is required, e.g. 0.1.1}"
: "${QRCLAW_APP_BUILD:?QRCLAW_APP_BUILD is required, e.g. 2}"
: "${QRCLAW_GITHUB_REPOSITORY:?QRCLAW_GITHUB_REPOSITORY is required}"
: "${QRCLAW_UPDATE_FEED_URL:?QRCLAW_UPDATE_FEED_URL is required}"
: "${SPARKLE_PUBLIC_ED_KEY:?SPARKLE_PUBLIC_ED_KEY is required}"

DERIVED_DATA="$REPO_ROOT/dist/sparkle-tools"
GENERATE_APPCAST_BIN="${SPARKLE_GENERATE_APPCAST_BIN:-$DERIVED_DATA/Build/Products/Release/generate_appcast}"
RELEASE_TAG="v$QRCLAW_APP_VERSION"
RELEASES_DIR="$REPO_ROOT/dist/github-update-release/$RELEASE_TAG"
DMG_NAME="QRClaw-$QRCLAW_APP_VERSION.dmg"

log() { printf '\033[1;34m[github-update]\033[0m %s\n' "$*"; }

if [[ ! -x "$GENERATE_APPCAST_BIN" ]]; then
  log "Building Sparkle generate_appcast tool..."
  (
    cd "$REPO_ROOT/apps/macos/QRClaw/.build/checkouts/Sparkle"
    xcodebuild -project Sparkle.xcodeproj \
      -scheme generate_appcast \
      -configuration Release \
      -derivedDataPath "$DERIVED_DATA" \
      build >/dev/null
  )
fi

mkdir -p "$RELEASES_DIR"

export QRCLAW_APP_VERSION
export QRCLAW_APP_BUILD
export QRCLAW_UPDATE_FEED_URL
export SPARKLE_PUBLIC_ED_KEY
export SPARKLE_RELEASES_DIR="$RELEASES_DIR"
export SPARKLE_APPCAST_URL_PREFIX="https://github.com/$QRCLAW_GITHUB_REPOSITORY/releases/download/$RELEASE_TAG/"
export SPARKLE_GENERATE_APPCAST_BIN="$GENERATE_APPCAST_BIN"

if [[ -z "${CODESIGN_IDENTITY:-}" || -z "${NOTARY_APPLE_ID:-}" || -z "${NOTARY_TEAM_ID:-}" || -z "${NOTARY_PASSWORD:-}" ]]; then
  log "Developer ID signing/notarization env is incomplete; building an ad-hoc/internal update archive."
fi

log "Building $DMG_NAME and appcast..."
bash "$REPO_ROOT/scripts/build-deliverable-dmg.sh"

[[ -f "$RELEASES_DIR/$DMG_NAME" ]] || {
  echo "Expected update archive not found: $RELEASES_DIR/$DMG_NAME" >&2
  exit 1
}
[[ -f "$RELEASES_DIR/appcast.xml" ]] || {
  echo "Expected appcast not found: $RELEASES_DIR/appcast.xml" >&2
  exit 1
}

log "Release artifacts ready:"
log "  $RELEASES_DIR/$DMG_NAME"
log "  $RELEASES_DIR/appcast.xml"

if [[ "$UPLOAD" -eq 1 ]]; then
  command -v gh >/dev/null 2>&1 || {
    echo "gh is required for --upload" >&2
    exit 1
  }

  if gh release view "$RELEASE_TAG" --repo "$QRCLAW_GITHUB_REPOSITORY" >/dev/null 2>&1; then
    log "Uploading assets to existing release $RELEASE_TAG..."
    gh release upload "$RELEASE_TAG" \
      "$RELEASES_DIR/$DMG_NAME" \
      "$RELEASES_DIR/appcast.xml" \
      --repo "$QRCLAW_GITHUB_REPOSITORY" \
      --clobber
  else
    log "Creating release $RELEASE_TAG..."
    gh release create "$RELEASE_TAG" \
      "$RELEASES_DIR/$DMG_NAME" \
      "$RELEASES_DIR/appcast.xml" \
      --repo "$QRCLAW_GITHUB_REPOSITORY" \
      --title "QRClaw $QRCLAW_APP_VERSION" \
      --notes "QRClaw $QRCLAW_APP_VERSION desktop update."
  fi
fi
