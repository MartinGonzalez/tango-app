#!/usr/bin/env bash
set -euo pipefail

REPO="MartinGonzalez/tango-app"
APP_NAME="Tango-dev.app"
INSTALL_DIR="/Applications"
ZIP_NAME="Tango-macos-arm64.zip"

# --- Pre-flight checks ---

if [ "$(uname)" != "Darwin" ]; then
  echo "Error: Tango is macOS-only for now."
  exit 1
fi

ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
  echo "Error: Tango currently supports Apple Silicon (arm64) only."
  echo "Detected architecture: $ARCH"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "Error: curl is required but not found."
  exit 1
fi

if ! command -v unzip &>/dev/null; then
  echo "Error: unzip is required but not found."
  exit 1
fi

# --- Fetch latest release ---

echo "Fetching latest release from $REPO..."
DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$ZIP_NAME"

TMPDIR_PATH="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PATH"' EXIT

echo "Downloading $ZIP_NAME..."
curl -fSL -o "$TMPDIR_PATH/$ZIP_NAME" "$DOWNLOAD_URL"

echo "Extracting..."
unzip -q "$TMPDIR_PATH/$ZIP_NAME" -d "$TMPDIR_PATH"

# --- Install ---

TARGET="$INSTALL_DIR/$APP_NAME"

if [ -d "$TARGET" ]; then
  echo "Removing existing installation at $TARGET..."
  rm -rf "$TARGET"
fi

echo "Installing to $TARGET..."
mv "$TMPDIR_PATH/$APP_NAME" "$TARGET"

# Remove macOS quarantine attribute so the unsigned app can launch
xattr -cr "$TARGET" 2>/dev/null || true

echo ""
echo "Tango installed successfully!"
echo ""
echo "Launch: open -a '$APP_NAME'"
echo ""
echo "If macOS blocks the app on first launch:"
echo "  1. Right-click the app in /Applications"
echo "  2. Select 'Open' from the context menu"
echo "  3. Click 'Open' in the dialog"
