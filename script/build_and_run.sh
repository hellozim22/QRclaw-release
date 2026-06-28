#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="QRClaw"
BUNDLE_ID="ai.qrclaw.desktop"
MIN_SYSTEM_VERSION="14.0"
APP_VERSION="${QRCLAW_APP_VERSION:-0.1.0}"
APP_BUILD="${QRCLAW_APP_BUILD:-1}"
UPDATE_FEED_URL="${QRCLAW_UPDATE_FEED_URL:-}"
SPARKLE_PUBLIC_ED_KEY="${SPARKLE_PUBLIC_ED_KEY:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/apps/macos/QRClaw"
DIST_DIR="$ROOT_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_FRAMEWORKS="$APP_CONTENTS/Frameworks"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

cd "$PKG_DIR"
swift build
BUILD_BINARY="$(swift build --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS" "$APP_RESOURCES" "$APP_FRAMEWORKS"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP_BINARY" 2>/dev/null || true

# Sparkle is delivered as a framework by SwiftPM. Copy it into the app bundle
# so the relocated executable does not depend on paths inside .build.
SPARKLE_FRAMEWORK="$(find "$PKG_DIR/.build" -path "*/Sparkle.framework" -type d 2>/dev/null | head -n 1 || true)"
if [[ -n "$SPARKLE_FRAMEWORK" ]]; then
  rm -rf "$APP_FRAMEWORKS/Sparkle.framework"
  cp -R "$SPARKLE_FRAMEWORK" "$APP_FRAMEWORKS/Sparkle.framework"
fi

# Copy bundled runtime if present
if [[ -d "$ROOT_DIR/dist/desktop-runtime" ]]; then
  rm -rf "$APP_RESOURCES/desktop-runtime"
  cp -R "$ROOT_DIR/dist/desktop-runtime" "$APP_RESOURCES/desktop-runtime"
fi

# Brand assets (dock icon + in-app sidebar logo)
if [[ -f "$PKG_DIR/Resources/qrclaw-logo-icon.png" ]]; then
  cp "$PKG_DIR/Resources/qrclaw-logo-icon.png" "$APP_RESOURCES/qrclaw-logo-icon.png"
fi
if [[ -f "$ROOT_DIR/apps/macos/packaging/AppIcon.icns" ]]; then
  cp "$ROOT_DIR/apps/macos/packaging/AppIcon.icns" "$APP_RESOURCES/AppIcon.icns"
fi

ICON_PLIST=""
if [[ -f "$APP_RESOURCES/AppIcon.icns" ]]; then
  ICON_PLIST="  <key>CFBundleIconFile</key>
  <string>AppIcon</string>"
fi

SPARKLE_PLIST=""
if [[ -n "$UPDATE_FEED_URL" && -n "$SPARKLE_PUBLIC_ED_KEY" ]]; then
  SPARKLE_PLIST="  <key>SUFeedURL</key>
  <string>$UPDATE_FEED_URL</string>
  <key>SUPublicEDKey</key>
  <string>$SPARKLE_PUBLIC_ED_KEY</string>
  <key>SUEnableAutomaticChecks</key>
  <true/>
  <key>SUScheduledCheckInterval</key>
  <integer>86400</integer>"
fi

cat >"$INFO_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$APP_BUILD</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_SYSTEM_VERSION</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
$ICON_PLIST
$SPARKLE_PLIST
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
PLIST

if [[ -d "$APP_FRAMEWORKS/Sparkle.framework" ]]; then
  codesign --force --deep --sign - "$APP_FRAMEWORKS/Sparkle.framework" 2>/dev/null || true
fi
codesign --force --sign - "$APP_BUNDLE" 2>/dev/null || true

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  build)
    echo "build: $APP_BUNDLE"
    ;;
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    echo "verify: process running"
    ;;
  *)
    echo "usage: $0 [run|build|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
