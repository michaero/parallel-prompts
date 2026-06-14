#!/usr/bin/env bash
# Build a "Parallel Prompts.app" launcher in ~/Applications that runs
# the local install of this repo. The .app calls `npm start` here.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Parallel Prompts"
DEST_DIR="${1:-$HOME/Applications}"
APP_DIR="$DEST_DIR/${APP_NAME}.app"

# Resolve to the REAL node binary (Finder gives launched apps a minimal PATH,
# and fnm-style shells use per-session symlinks that won't exist at launch time).
if ! command -v node >/dev/null; then
  echo "Error: 'node' must be on PATH." >&2
  exit 1
fi
NODE_BIN="$(node -e 'console.log(process.execPath)')"
NODE_DIR="$(dirname "$NODE_BIN")"
if [[ ! -x "$NODE_DIR/npm" ]]; then
  echo "Error: did not find 'npm' next to '$NODE_BIN'." >&2
  exit 1
fi

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>                <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>         <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>          <string>com.michaero.parallel-prompts</string>
  <key>CFBundleVersion</key>             <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>  <string>0.1.0</string>
  <key>CFBundleExecutable</key>          <string>launcher</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>LSUIElement</key>                 <true/>
  <key>LSMinimumSystemVersion</key>      <string>11.0</string>
</dict>
</plist>
PLIST

REPO_DIR_Q=$(printf '%q' "$REPO_DIR")
NODE_BIN_Q=$(printf '%q' "$NODE_BIN")
NODE_DIR_Q=$(printf '%q' "$NODE_DIR")

cat > "$APP_DIR/Contents/MacOS/launcher" <<LAUNCHER
#!/usr/bin/env bash
set -e
REPO_DIR=${REPO_DIR_Q}
NODE_BIN=${NODE_BIN_Q}
NODE_DIR=${NODE_DIR_Q}

export PATH="\${NODE_DIR}:/usr/local/bin:/opt/homebrew/bin:\${PATH}"
cd "\${REPO_DIR}"

LOG_DIR="\${HOME}/Library/Logs/parallel-prompts"
mkdir -p "\${LOG_DIR}"
exec > "\${LOG_DIR}/launcher.log" 2>&1

echo "[\$(date -u +%FT%TZ)] starting parallel-prompts from \${REPO_DIR}"
echo "[node] \${NODE_BIN}"
exec "\${NODE_BIN}" bin/parallel-prompts.js
LAUNCHER

chmod +x "$APP_DIR/Contents/MacOS/launcher"

echo "✔ Built '${APP_NAME}.app' at: $APP_DIR"
echo "  Pointing at repo: $REPO_DIR"
echo
echo "Next:"
echo "  • Double-click the app in $DEST_DIR"
echo "  • First launch builds the UI (~10s) and opens http://127.0.0.1:5174/"
echo "  • Logs at ~/Library/Logs/parallel-prompts/launcher.log"
