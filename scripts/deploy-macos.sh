#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
SERVER_DIR="$ROOT_DIR/server"
DIST_DIR="$ROOT_DIR/dist"

APP_NAME="Claudex.app"
ZIP_NAME="Claudex-macos-arm64.zip"
APP_OUT_PATH="$DIST_DIR/$APP_NAME"
ZIP_OUT_PATH="$DIST_DIR/$ZIP_NAME"

echo "[deploy] Building desktop app..."
(
  cd "$DESKTOP_DIR"
  bun run build
)

APP_BUILD_PATH="$(ls -td "$DESKTOP_DIR"/build/*/*.app 2>/dev/null | head -n 1 || true)"
if [ -z "$APP_BUILD_PATH" ]; then
  echo "[deploy] ERROR: no .app bundle found under $DESKTOP_DIR/build"
  exit 1
fi

mkdir -p "$DIST_DIR"

if [ -d "$APP_OUT_PATH" ]; then
  STALE_APP="$DIST_DIR/Claudex.previous.$(date +%Y%m%d%H%M%S).app"
  mv "$APP_OUT_PATH" "$STALE_APP"
  echo "[deploy] Existing app moved to $STALE_APP"
fi

if [ -f "$ZIP_OUT_PATH" ]; then
  STALE_ZIP="$DIST_DIR/Claudex.previous.$(date +%Y%m%d%H%M%S).zip"
  mv "$ZIP_OUT_PATH" "$STALE_ZIP"
  echo "[deploy] Existing zip moved to $STALE_ZIP"
fi

echo "[deploy] Copying app bundle from $APP_BUILD_PATH"
ditto "$APP_BUILD_PATH" "$APP_OUT_PATH"

echo "[deploy] Bundling server runtime into app resources"
mkdir -p "$APP_OUT_PATH/Contents/Resources/app/server"
ditto "$SERVER_DIR/src" "$APP_OUT_PATH/Contents/Resources/app/server/src"

echo "[deploy] Creating zip artifact"
(
  cd "$DIST_DIR"
  ditto -c -k --sequesterRsrc --keepParent "$APP_NAME" "$ZIP_NAME"
)

echo "[deploy] Done"
echo "[deploy] App: $APP_OUT_PATH"
echo "[deploy] Zip: $ZIP_OUT_PATH"
