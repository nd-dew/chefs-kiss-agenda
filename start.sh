#!/usr/bin/env bash
# Serves the agenda and the AI chat backend (needs GEMINI_API_KEY in the environment).
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$DIR/server.py" "${1:-9099}"
