#!/usr/bin/env bash
# Launch a local preview of Universal Video.
# Runs the dev server in the foreground — press Ctrl-C to stop.
# macOS/Linux equivalent of preview.ps1.
#
#   Usage:  ./scripts/preview.sh [port]      (default 5199)
#
# 5199 is this app's port in the registry (Docs_UNI_SIM/dev-preview.md).
# --strictPort means a port clash fails loudly instead of silently serving
# this app on another app's port.
# First run installs deps if node_modules is missing.
#
# NOTE — the conversion needs a browser with a WebCodecs H.264 ENCODER, which
# means Chrome, Edge or Safari 16.4+. Firefox will load the page, read a file's
# header and refuse to convert, which is the behaviour to check, not a fault.
# Nothing here needs the internet: no engine is downloaded and no file is sent.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${1:-5199}"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)…"
  npm install
fi

echo "Universal Video → http://localhost:$PORT"
exec npm run dev -- --port "$PORT" --strictPort
