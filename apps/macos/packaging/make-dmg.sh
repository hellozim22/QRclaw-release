#!/usr/bin/env bash
# make-dmg.sh — package dist/QRClaw.app into dist/QRClaw.dmg
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_NAME="QRClaw"
APP_BUNDLE="$REPO_ROOT/dist/$APP_NAME.app"
DMG_PATH="$REPO_ROOT/dist/$APP_NAME.dmg"
STAGING="$REPO_ROOT/dist/dmg-staging"
ENTITLEMENTS="$REPO_ROOT/apps/macos/packaging/QRClaw.entitlements"
APP_VERSION="${QRCLAW_APP_VERSION:-0.1.0}"
RELEASES_DIR="${SPARKLE_RELEASES_DIR:-}"
APPCAST_URL_PREFIX="${SPARKLE_APPCAST_URL_PREFIX:-}"

log() { printf '\033[1;36m[make-dmg]\033[0m %s\n' "$*"; }

[[ -d "$APP_BUNDLE" ]] || { echo "Missing $APP_BUNDLE — run ./script/build_and_run.sh first" >&2; exit 1; }

# Sign nested binaries if identity available
SIGN_ID="${CODESIGN_IDENTITY:-}"
if [[ -n "$SIGN_ID" ]]; then
  log "Signing with identity: $SIGN_ID"

  if [[ -d "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework" ]]; then
    codesign --force --deep --options runtime --timestamp \
      --sign "$SIGN_ID" "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework"
  fi

  # Sign nested Mach-O binaries first (inside-out)
  while IFS= read -r -d '' bin; do
    codesign --force --options runtime --timestamp \
      --entitlements "$ENTITLEMENTS" \
      --sign "$SIGN_ID" "$bin" 2>/dev/null || \
    codesign --force --options runtime --timestamp \
      --sign "$SIGN_ID" "$bin"
  done < <(find "$APP_BUNDLE/Contents/Resources" -type f -perm +111 -print0 2>/dev/null || true)

  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$SIGN_ID" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$SIGN_ID" "$APP_BUNDLE"
else
  log "CODESIGN_IDENTITY not set — ad-hoc signing"
  if [[ -d "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework" ]]; then
    codesign --force --deep --sign - "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework" 2>/dev/null || true
  fi
  codesign --force --sign - "$APP_BUNDLE" 2>/dev/null || true
fi

# Create DMG
rm -rf "$STAGING" "$DMG_PATH"
mkdir -p "$STAGING"
cp -R "$APP_BUNDLE" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO "$DMG_PATH"
rm -rf "$STAGING"

log "Created $DMG_PATH"

# Notarize if credentials available
if [[ -n "${NOTARY_APPLE_ID:-}" && -n "${NOTARY_TEAM_ID:-}" && -n "${NOTARY_PASSWORD:-}" ]]; then
  log "Submitting for notarization…"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$NOTARY_APPLE_ID" \
    --team-id "$NOTARY_TEAM_ID" \
    --password "$NOTARY_PASSWORD" \
    --wait
  xcrun stapler staple "$APP_BUNDLE"
  xcrun stapler staple "$DMG_PATH"
  log "Notarization complete"
else
  log "NOTARY_* env not set — skipping notarization"
fi

if [[ -n "$RELEASES_DIR" ]]; then
  mkdir -p "$RELEASES_DIR"
  VERSIONED_DMG="$RELEASES_DIR/$APP_NAME-$APP_VERSION.dmg"
  cp "$DMG_PATH" "$VERSIONED_DMG"
  log "Copied update archive to $VERSIONED_DMG"

  GENERATE_APPCAST="${SPARKLE_GENERATE_APPCAST_BIN:-}"
  if [[ -z "$GENERATE_APPCAST" ]]; then
    GENERATE_APPCAST="$(find "$REPO_ROOT/apps/macos/QRClaw/.build" -path "*/generate_appcast" -type f -perm +111 2>/dev/null | head -n 1 || true)"
  fi

  if [[ -n "$GENERATE_APPCAST" && -x "$GENERATE_APPCAST" ]]; then
    APPCAST_ARGS=()
    if [[ -n "$APPCAST_URL_PREFIX" ]]; then
      APPCAST_ARGS+=(--download-url-prefix "$APPCAST_URL_PREFIX")
    fi
    "$GENERATE_APPCAST" "${APPCAST_ARGS[@]}" "$RELEASES_DIR"
    log "Generated Sparkle appcast in $RELEASES_DIR"
  else
    log "Sparkle generate_appcast not found — skipped appcast generation"
  fi
fi
