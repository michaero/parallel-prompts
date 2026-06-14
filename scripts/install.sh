#!/usr/bin/env bash
# One-line installer for parallel-prompts.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/michaero/parallel-prompts/main/scripts/install.sh | bash
#
# Env overrides:
#   PP_INSTALL_DIR    where to clone (default: $HOME/parallel-prompts)
#   PP_BRANCH         which branch to track (default: main)
#   PP_SKIP_APP       set to 1 to skip the macOS .app build

set -euo pipefail

REPO_URL="https://github.com/michaero/parallel-prompts.git"
BRANCH="${PP_BRANCH:-main}"
INSTALL_DIR="${PP_INSTALL_DIR:-$HOME/parallel-prompts}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1" >&2; }
fail() { printf '\033[31mError: %s\033[0m\n' "$1" >&2; exit 1; }

bold "parallel-prompts installer"
echo "  target: $INSTALL_DIR"
echo

# Prereqs
missing=()
for cmd in node npm git tmux claude; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  warn "Missing required commands: ${missing[*]}"
  echo
  echo "Install them and re-run:"
  for m in "${missing[@]}"; do
    case "$m" in
      node|npm) echo "  • node ≥ 20 — recommended via fnm (https://github.com/Schniz/fnm) or nvm" ;;
      git)      echo "  • git — xcode-select --install (macOS) or your package manager" ;;
      tmux)     echo "  • tmux — brew install tmux (macOS) or your package manager" ;;
      claude)   echo "  • claude — https://docs.anthropic.com/claude/code" ;;
    esac
  done
  exit 1
fi

# Node version sanity
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [[ "$node_major" -lt 20 ]]; then
  fail "node version $(node -v) is too old — need ≥ 20"
fi

# Clone or update
if [[ -d "$INSTALL_DIR/.git" ]]; then
  bold "Updating existing install…"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
elif [[ -e "$INSTALL_DIR" ]]; then
  fail "$INSTALL_DIR exists but is not a git checkout. Move it aside or set PP_INSTALL_DIR."
else
  bold "Cloning…"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

bold "Installing dependencies…"
npm install --no-fund --no-audit

bold "Building UI…"
npm run build

if [[ "$(uname -s)" == "Darwin" && "${PP_SKIP_APP:-}" != "1" ]]; then
  bold "Building macOS .app launcher…"
  bash scripts/install-macos-app.sh
  APP_PATH="$HOME/Applications/Parallel Prompts.app"
  echo
  printf '\033[32m✔ Installed.\033[0m Double-click \033[1m%s\033[0m to launch.\n' "$APP_PATH"
  echo "  Repo: $INSTALL_DIR"
  echo "  Logs: ~/Library/Logs/parallel-prompts/launcher.log"
else
  echo
  printf '\033[32m✔ Installed to %s\033[0m\n' "$INSTALL_DIR"
  echo "  Launch with: (cd '$INSTALL_DIR' && npm start)"
fi
